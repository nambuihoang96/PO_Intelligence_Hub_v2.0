from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.models import ResearchPlan, ResearchProject, ResearchRun
from backend.app.schemas import (
    ErrorEnvelope,
    Page,
    ResearchPlanCreate,
    ResearchPlanRead,
    ResearchProjectCreate,
    ResearchProjectRead,
    ResearchProjectUpdate,
    ResearchRunCreate,
    ResearchRunRead,
    ResearchRunState,
    ResearchRunStateUpdate,
)


router = APIRouter(prefix="/api/v1", tags=["research"])
LIMIT = Annotated[int, Query(ge=1, le=100, description="Maximum items per page")]

RUN_TRANSITIONS: dict[str, set[str]] = {
    "queued": {"collecting", "failed", "cancelled"},
    "collecting": {"validating", "partial", "failed", "cancelled"},
    "validating": {"synthesizing", "partial", "failed", "cancelled"},
    "synthesizing": {"completed", "completed_with_gaps", "partial", "failed", "cancelled"},
    "completed": set(),
    "completed_with_gaps": set(),
    "partial": set(),
    "failed": set(),
    "cancelled": set(),
}
TERMINAL_RUN_STATES = {"completed", "completed_with_gaps", "partial", "failed", "cancelled"}


def get_session(request: Request):
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


SessionDependency = Annotated[Session, Depends(get_session)]
ErrorResponses = {404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}}


def _commit(session: Session, message: str) -> None:
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail={"code": "CONFLICT", "message": message}) from exc


def _project_or_404(session: Session, project_id: str) -> ResearchProject:
    project = session.get(ResearchProject, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail={"code": "PROJECT_NOT_FOUND", "message": "Research project was not found."})
    return project


def _run_or_404(session: Session, run_id: str) -> ResearchRun:
    run = session.get(ResearchRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail={"code": "RUN_NOT_FOUND", "message": "Research run was not found."})
    return run


@router.post("/projects", response_model=ResearchProjectRead, status_code=status.HTTP_201_CREATED, responses={422: {"model": ErrorEnvelope}})
def create_project(payload: ResearchProjectCreate, session: SessionDependency) -> ResearchProject:
    project = ResearchProject(**payload.model_dump())
    session.add(project)
    _commit(session, "Project could not be created due to a data conflict.")
    session.refresh(project)
    return project


@router.get("/projects", response_model=Page[ResearchProjectRead], responses={422: {"model": ErrorEnvelope}})
def list_projects(session: SessionDependency, cursor: str | None = None, limit: LIMIT = 20) -> Page[ResearchProjectRead]:
    query = select(ResearchProject).order_by(ResearchProject.id)
    if cursor:
        query = query.where(ResearchProject.id > cursor)
    rows = list(session.scalars(query.limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return Page(items=items, next_cursor=items[-1].id if has_more and items else None, limit=limit)


@router.get("/projects/{project_id}", response_model=ResearchProjectRead, responses={404: {"model": ErrorEnvelope}})
def get_project(project_id: str, session: SessionDependency) -> ResearchProject:
    return _project_or_404(session, project_id)


@router.patch("/projects/{project_id}", response_model=ResearchProjectRead, responses=ErrorResponses)
def update_project(project_id: str, payload: ResearchProjectUpdate, session: SessionDependency) -> ResearchProject:
    project = _project_or_404(session, project_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    _commit(session, "Project update conflicts with existing data.")
    session.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT, responses={404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope}})
def delete_project(project_id: str, session: SessionDependency) -> Response:
    project = _project_or_404(session, project_id)
    session.delete(project)
    _commit(session, "Project has plans or runs and cannot be deleted.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/projects/{project_id}/plans", response_model=ResearchPlanRead, status_code=status.HTTP_201_CREATED, responses=ErrorResponses)
def create_plan(project_id: str, payload: ResearchPlanCreate, session: SessionDependency) -> ResearchPlan:
    _project_or_404(session, project_id)
    latest_version = session.scalar(
        select(ResearchPlan.version).where(ResearchPlan.project_id == project_id).order_by(ResearchPlan.version.desc()).limit(1)
    )
    plan = ResearchPlan(project_id=project_id, version=(latest_version or 0) + 1, **payload.model_dump())
    session.add(plan)
    _commit(session, "Plan version conflicts with another update.")
    session.refresh(plan)
    return plan


@router.get("/projects/{project_id}/plans", response_model=Page[ResearchPlanRead], responses=ErrorResponses)
def list_plans(project_id: str, session: SessionDependency, cursor: str | None = None, limit: LIMIT = 20) -> Page[ResearchPlanRead]:
    _project_or_404(session, project_id)
    version_cursor = None
    if cursor is not None:
        try:
            version_cursor = int(cursor)
            if version_cursor < 1:
                raise ValueError
        except ValueError as exc:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR", "message": "Plan cursor must be a positive version number."}) from exc
    query = select(ResearchPlan).where(ResearchPlan.project_id == project_id).order_by(ResearchPlan.version)
    if version_cursor is not None:
        query = query.where(ResearchPlan.version > version_cursor)
    rows = list(session.scalars(query.limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return Page(items=items, next_cursor=str(items[-1].version) if has_more and items else None, limit=limit)


@router.get("/projects/{project_id}/plans/latest", response_model=ResearchPlanRead, responses={404: {"model": ErrorEnvelope}})
def get_latest_plan(project_id: str, session: SessionDependency) -> ResearchPlan:
    _project_or_404(session, project_id)
    plan = session.scalar(
        select(ResearchPlan).where(ResearchPlan.project_id == project_id).order_by(ResearchPlan.version.desc()).limit(1)
    )
    if plan is None:
        raise HTTPException(status_code=404, detail={"code": "PLAN_NOT_FOUND", "message": "Research plan was not found."})
    return plan


@router.get("/projects/{project_id}/plans/{version}", response_model=ResearchPlanRead, responses={404: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}})
def get_plan(project_id: str, version: int, session: SessionDependency) -> ResearchPlan:
    _project_or_404(session, project_id)
    plan = session.scalar(select(ResearchPlan).where(ResearchPlan.project_id == project_id, ResearchPlan.version == version))
    if plan is None:
        raise HTTPException(status_code=404, detail={"code": "PLAN_NOT_FOUND", "message": "Research plan version was not found."})
    return plan


@router.post("/projects/{project_id}/runs", response_model=ResearchRunRead, status_code=status.HTTP_201_CREATED, responses=ErrorResponses)
def create_run(project_id: str, payload: ResearchRunCreate, session: SessionDependency) -> ResearchRun:
    _project_or_404(session, project_id)
    plan = session.scalar(
        select(ResearchPlan).where(ResearchPlan.project_id == project_id, ResearchPlan.version == payload.plan_version)
    )
    if plan is None:
        raise HTTPException(status_code=404, detail={"code": "PLAN_VERSION_NOT_FOUND", "message": "The requested plan version was not found for this project."})
    run = ResearchRun(project_id=project_id, plan_id=plan.id, plan_version=plan.version)
    session.add(run)
    _commit(session, "Run could not be created for the selected plan version.")
    session.refresh(run)
    return run


@router.get("/projects/{project_id}/runs", response_model=Page[ResearchRunRead], responses=ErrorResponses)
def list_runs(project_id: str, session: SessionDependency, cursor: str | None = None, limit: LIMIT = 20) -> Page[ResearchRunRead]:
    _project_or_404(session, project_id)
    query = select(ResearchRun).where(ResearchRun.project_id == project_id).order_by(ResearchRun.id)
    if cursor:
        query = query.where(ResearchRun.id > cursor)
    rows = list(session.scalars(query.limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return Page(items=items, next_cursor=items[-1].id if has_more and items else None, limit=limit)


@router.get("/runs/{run_id}", response_model=ResearchRunRead, responses={404: {"model": ErrorEnvelope}})
def get_run(run_id: str, session: SessionDependency) -> ResearchRun:
    return _run_or_404(session, run_id)


@router.patch("/runs/{run_id}/state", response_model=ResearchRunRead, responses={404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}})
def update_run_state(run_id: str, payload: ResearchRunStateUpdate, session: SessionDependency) -> ResearchRun:
    run = _run_or_404(session, run_id)
    next_state = payload.state.value
    if next_state not in RUN_TRANSITIONS[run.state]:
        raise HTTPException(status_code=409, detail={"code": "INVALID_STATE_TRANSITION", "message": f"Cannot change run state from {run.state} to {next_state}."})
    now = datetime.now(timezone.utc)
    run.state = next_state
    if next_state == "collecting" and run.started_at is None:
        run.started_at = now
    if next_state in TERMINAL_RUN_STATES:
        run.finished_at = now
    _commit(session, "Run state update conflicts with existing data.")
    session.refresh(run)
    return run
