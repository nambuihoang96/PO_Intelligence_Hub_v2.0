"""Project-scoped, append-only trend claim capture. No source is fetched or verified here."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import (
    ProjectTrendUpdate,
    ResearchBenchmarkCollection,
    ResearchBenchmarkCollectionMember,
    ResearchProject,
    ResearchSubject,
)
from backend.app.schemas import (
    ErrorEnvelope,
    ProjectTrendUpdateCreate,
    ProjectTrendUpdatePage,
    ProjectTrendUpdateRead,
)


router = APIRouter(prefix="/api/v1/projects/{project_id}/trend-updates", tags=["trend updates"])
SessionDependency = Annotated[Session, Depends(get_session)]
LIMIT = Annotated[int, Query(ge=1, le=100)]


def _project_or_404(session: Session, project_id: str) -> None:
    if session.get(ResearchProject, project_id) is None:
        raise HTTPException(status_code=404, detail={"code": "PROJECT_NOT_FOUND", "message": "Research project was not found."})


def _read(session: Session, row: ProjectTrendUpdate) -> ProjectTrendUpdateRead:
    subject = session.get(ResearchSubject, row.subject_id)
    collection = session.get(ResearchBenchmarkCollection, row.collection_id) if row.collection_id else None
    return ProjectTrendUpdateRead(
        id=row.id, project_id=row.project_id, subject_id=row.subject_id,
        subject_name=subject.name if subject else "Subject unavailable",
        collection_id=row.collection_id, collection_name=collection.name if collection else None,
        exact_claim=row.exact_claim, source_note=row.source_note, source_title=row.source_title,
        source_url=row.source_url, published_on=row.published_on,
        source_status="source_reported_unverified", created_at=row.created_at,
    )


@router.get("", response_model=ProjectTrendUpdatePage, responses={404: {"model": ErrorEnvelope}})
def list_trend_updates(
    project_id: str,
    session: SessionDependency,
    subject_id: str | None = None,
    collection_id: str | None = None,
    cursor: str | None = None,
    limit: LIMIT = 20,
):
    _project_or_404(session, project_id)
    if subject_id and session.scalar(select(ResearchSubject.id).where(
        ResearchSubject.project_id == project_id, ResearchSubject.id == subject_id,
    )) is None:
        raise HTTPException(status_code=404, detail={"code": "SUBJECT_NOT_FOUND", "message": "Research subject was not found in this project."})
    if collection_id and session.scalar(select(ResearchBenchmarkCollection.id).where(
        ResearchBenchmarkCollection.project_id == project_id, ResearchBenchmarkCollection.id == collection_id,
    )) is None:
        raise HTTPException(status_code=404, detail={"code": "COLLECTION_NOT_FOUND", "message": "Benchmark collection was not found in this project."})
    offset = 0
    if cursor is not None:
        try:
            offset = int(cursor)
            if offset < 0:
                raise ValueError
        except ValueError as exc:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR", "message": "Trend update cursor must be a non-negative integer."}) from exc
    query = select(ProjectTrendUpdate).where(ProjectTrendUpdate.project_id == project_id)
    if subject_id:
        query = query.where(ProjectTrendUpdate.subject_id == subject_id)
    if collection_id:
        query = query.where(ProjectTrendUpdate.collection_id == collection_id)
    rows = list(session.scalars(query.order_by(
        ProjectTrendUpdate.published_on.desc(), ProjectTrendUpdate.created_at.desc(), ProjectTrendUpdate.id,
    ).offset(offset).limit(limit + 1)))
    has_more = len(rows) > limit
    return ProjectTrendUpdatePage(
        items=[_read(session, row) for row in rows[:limit]],
        next_cursor=str(offset + limit) if has_more else None,
        limit=limit,
    )


@router.post("", response_model=ProjectTrendUpdateRead, status_code=status.HTTP_201_CREATED,
             responses={404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}})
def create_trend_update(project_id: str, payload: ProjectTrendUpdateCreate, session: SessionDependency):
    """Save one immutable source-reported claim; add a correction as a new update."""
    _project_or_404(session, project_id)
    subject = session.scalar(select(ResearchSubject).where(
        ResearchSubject.project_id == project_id, ResearchSubject.id == payload.subject_id,
    ))
    if subject is None:
        raise HTTPException(status_code=404, detail={"code": "SUBJECT_NOT_FOUND", "message": "Select a saved subject from this project."})
    if payload.collection_id:
        collection = session.scalar(select(ResearchBenchmarkCollection).where(
            ResearchBenchmarkCollection.project_id == project_id,
            ResearchBenchmarkCollection.id == payload.collection_id,
        ))
        if collection is None:
            raise HTTPException(status_code=404, detail={"code": "COLLECTION_NOT_FOUND", "message": "Select a collection from this project."})
        member = session.scalar(select(ResearchBenchmarkCollectionMember.id).where(
            ResearchBenchmarkCollectionMember.project_id == project_id,
            ResearchBenchmarkCollectionMember.collection_id == collection.id,
            ResearchBenchmarkCollectionMember.subject_id == subject.id,
        ))
        if member is None:
            raise HTTPException(status_code=409, detail={
                "code": "SUBJECT_NOT_IN_COLLECTION",
                "message": "Add this confirmed subject to the collection before linking a trend update.",
            })
    row = ProjectTrendUpdate(
        project_id=project_id, subject_id=subject.id, collection_id=payload.collection_id,
        exact_claim=payload.exact_claim, source_note=payload.source_note,
        source_title=payload.source_title or None, source_url=payload.source_url or None,
        published_on=payload.published_on, source_status="source_reported_unverified",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _read(session, row)
