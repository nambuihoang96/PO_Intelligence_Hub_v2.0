from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api import ErrorResponses, LIMIT, SessionDependency, _commit, _run_or_404
from backend.app.models import Evidence, ResearchRun, SourceRecord, SourceRegistry
from backend.app.schemas import (
    ErrorEnvelope,
    EvidenceRead,
    ManualEvidenceCreate,
    ManualEvidenceRead,
    Page,
    SourceLicenseStatus,
    SourceRegistryCreate,
    SourceRegistryRead,
    SourceRegistryUpdate,
    SourceRecordRead,
)


router = APIRouter(prefix="/api/v1", tags=["sources"])


def _source_or_404(session: Session, source_id: str) -> SourceRegistry:
    source = session.get(SourceRegistry, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail={"code": "SOURCE_NOT_FOUND", "message": "Source was not found."})
    return source


@router.post("/sources", response_model=SourceRegistryRead, status_code=status.HTTP_201_CREATED, responses={422: {"model": ErrorEnvelope}})
def create_source(payload: SourceRegistryCreate, session: SessionDependency) -> SourceRegistry:
    source = SourceRegistry(**payload.model_dump())
    # This V2-006 endpoint is metadata-only. Registry entries never enable adapters.
    source.enabled = False
    source.collection_mode = "manual"
    session.add(source)
    _commit(session, "Source could not be created due to a data conflict.")
    session.refresh(source)
    return source


@router.get("/sources", response_model=Page[SourceRegistryRead], responses={422: {"model": ErrorEnvelope}})
def list_sources(session: SessionDependency, cursor: str | None = None, limit: LIMIT = 20) -> Page[SourceRegistryRead]:
    query = select(SourceRegistry).order_by(SourceRegistry.id)
    if cursor:
        query = query.where(SourceRegistry.id > cursor)
    rows = list(session.scalars(query.limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return Page(items=items, next_cursor=items[-1].id if has_more and items else None, limit=limit)


@router.get("/sources/{source_id}", response_model=SourceRegistryRead, responses={404: {"model": ErrorEnvelope}})
def get_source(source_id: str, session: SessionDependency) -> SourceRegistry:
    return _source_or_404(session, source_id)


@router.patch("/sources/{source_id}", response_model=SourceRegistryRead, responses=ErrorResponses)
def update_source(source_id: str, payload: SourceRegistryUpdate, session: SessionDependency) -> SourceRegistry:
    source = _source_or_404(session, source_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if field == "license_status" and value is not None:
            value = value.value
        if field == "collection_mode":
            value = "manual"
        setattr(source, field, value)
    # Preserve the safety invariant even if older data had unexpected values.
    source.enabled = False
    source.collection_mode = "manual"
    _commit(session, "Source update conflicts with existing data.")
    session.refresh(source)
    return source


@router.post(
    "/runs/{run_id}/evidence",
    response_model=ManualEvidenceRead,
    status_code=status.HTTP_201_CREATED,
    responses={404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}},
)
def add_manual_evidence(run_id: str, payload: ManualEvidenceCreate, session: SessionDependency) -> ManualEvidenceRead:
    _run_or_404(session, run_id)
    registry = None
    if payload.source_registry_id:
        registry = _source_or_404(session, payload.source_registry_id)
        if registry.license_status == SourceLicenseStatus.BLOCKED.value:
            raise HTTPException(status_code=409, detail={"code": "SOURCE_BLOCKED", "message": "Evidence cannot be added for a blocked source."})
        hostname = urlsplit(payload.source_url).hostname or ""
        if registry.url_domain and not (hostname == registry.url_domain or hostname.endswith(f".{registry.url_domain}")):
            raise HTTPException(status_code=422, detail={"code": "SOURCE_DOMAIN_MISMATCH", "message": "The URL host does not match the selected source domain."})

    source_record = SourceRecord(
        run_id=run_id,
        source_registry_id=registry.id if registry else None,
        source_name=registry.name if registry else payload.source_name,
        source_type=registry.source_type if registry else payload.source_type,
        collection_mode="manual",
        source_url=payload.source_url,
        title=payload.title,
        published_at=payload.published_at,
        scope=payload.scope,
    )
    session.add(source_record)
    session.flush()
    evidence = Evidence(
        run_id=run_id,
        source_record_id=source_record.id,
        excerpt_or_ref=payload.excerpt_or_ref,
        method="manual_user_note",
        quality="insufficient",
        status="needs_review",
        scope=payload.scope,
    )
    session.add(evidence)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail={"code": "EVIDENCE_CONFLICT", "message": "Evidence could not be stored due to a data conflict."}) from exc
    session.refresh(source_record)
    session.refresh(evidence)
    return ManualEvidenceRead(source=SourceRecordRead.model_validate(source_record), evidence=EvidenceRead.model_validate(evidence))


@router.get("/runs/{run_id}/evidence", response_model=Page[ManualEvidenceRead], responses=ErrorResponses)
def list_run_evidence(
    run_id: str,
    session: SessionDependency,
    cursor: str | None = None,
    limit: LIMIT = 20,
) -> Page[ManualEvidenceRead]:
    _run_or_404(session, run_id)
    query = (
        select(Evidence, SourceRecord)
        .join(SourceRecord, (Evidence.run_id == SourceRecord.run_id) & (Evidence.source_record_id == SourceRecord.id))
        .where(Evidence.run_id == run_id)
        .order_by(Evidence.id)
    )
    if cursor:
        query = query.where(Evidence.id > cursor)
    rows = list(session.execute(query.limit(limit + 1)))
    has_more = len(rows) > limit
    items = [ManualEvidenceRead(source=SourceRecordRead.model_validate(source), evidence=EvidenceRead.model_validate(evidence)) for evidence, source in rows[:limit]]
    return Page(items=items, next_cursor=items[-1].evidence.id if has_more and items else None, limit=limit)
