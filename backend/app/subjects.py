from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import ImportedResearchReport, QuantitativeDataset, ResearchProject, ResearchSubject, ResearchSubjectReference
from backend.app.schemas import (
    ErrorEnvelope,
    Page,
    ResearchSubjectCreate,
    ResearchSubjectRead,
    ResearchSubjectSourceMap,
    ResearchSubjectSourceRead,
    ResearchSubjectUpdate,
)


router = APIRouter(prefix="/api/v1/projects/{project_id}", tags=["research subjects"])
SessionDependency = Annotated[Session, Depends(get_session)]
LIMIT = Annotated[int, Query(ge=1, le=100)]
SourceKind = Literal["report_entity", "csv_entity"]


def _project_or_404(session: Session, project_id: str) -> ResearchProject:
    project = session.get(ResearchProject, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail={"code": "PROJECT_NOT_FOUND", "message": "Research project was not found."})
    return project


def _subject_or_404(session: Session, project_id: str, subject_id: str) -> ResearchSubject:
    subject = session.scalar(select(ResearchSubject).where(
        ResearchSubject.project_id == project_id, ResearchSubject.id == subject_id,
    ))
    if subject is None:
        raise HTTPException(status_code=404, detail={"code": "SUBJECT_NOT_FOUND", "message": "Research subject was not found in this project."})
    return subject


def _subject_read(subject: ResearchSubject) -> ResearchSubjectRead:
    return ResearchSubjectRead(
        id=subject.id, project_id=subject.project_id, name=subject.name, subject_type=subject.subject_type,
        aliases=subject.aliases_json or [], external_ids=subject.external_ids_json or [],
        provenance=subject.provenance_json or {}, created_at=subject.created_at, updated_at=subject.updated_at,
    )


def _source_candidates(session: Session, project_id: str) -> list[dict]:
    candidates: dict[tuple[str, str, str], dict] = {}
    reports = list(session.scalars(select(ImportedResearchReport).where(
        ImportedResearchReport.project_id == project_id,
    ).order_by(ImportedResearchReport.id)))
    for report in reports:
        data = report.research_data_json or {}
        for entity in data.get("entities", []) if isinstance(data, dict) else []:
            if not isinstance(entity, dict):
                continue
            key = entity.get("key") or entity.get("entity_id") or entity.get("id")
            name = entity.get("name") or entity.get("display_name")
            if not isinstance(key, str) or not key.strip() or not isinstance(name, str) or not name.strip():
                continue
            item = {"project_id": project_id, "source_kind": "report_entity", "source_id": report.id,
                    "source_key": key, "source_name": name, "source_type": entity.get("entity_type"),
                    "context_name": report.question}
            candidates[(item["source_kind"], item["source_id"], item["source_key"])] = item

    report_ids = [report.id for report in reports]
    dataset_query = select(QuantitativeDataset).where(QuantitativeDataset.project_id == project_id)
    if report_ids:
        dataset_query = select(QuantitativeDataset).where(
            (QuantitativeDataset.project_id == project_id) | QuantitativeDataset.report_id.in_(report_ids),
        )
    datasets = list(session.scalars(dataset_query.order_by(QuantitativeDataset.id)))
    for dataset in datasets:
        for observation in dataset.observations_json or []:
            if not isinstance(observation, dict):
                continue
            key = observation.get("source_entity_id") or observation.get("entity_id")
            name = observation.get("source_entity_name") or observation.get("entity_name")
            if not isinstance(key, str) or not key.strip() or not isinstance(name, str) or not name.strip():
                continue
            item = {"project_id": project_id, "source_kind": "csv_entity", "source_id": dataset.id,
                    "source_key": key, "source_name": name, "source_type": None,
                    "context_name": dataset.filename}
            candidates[(item["source_kind"], item["source_id"], item["source_key"])] = item

    mappings = list(session.scalars(select(ResearchSubjectReference).where(
        ResearchSubjectReference.project_id == project_id,
    )))
    subjects = {item.id: item for item in session.scalars(select(ResearchSubject).where(
        ResearchSubject.project_id == project_id,
    ))}
    mapping_by_identity = {(item.source_kind, item.source_id, item.source_key): item for item in mappings}
    result = []
    for identity, candidate in candidates.items():
        mapping = mapping_by_identity.get(identity)
        subject = subjects.get(mapping.subject_id) if mapping else None
        result.append({**candidate,
                       "mapped_subject_id": subject.id if subject else None,
                       "mapped_subject_name": subject.name if subject else None,
                       "source_state": "available"})
    for mapping in mappings:
        identity = (mapping.source_kind, mapping.source_id, mapping.source_key)
        if identity in candidates:
            continue
        subject = subjects.get(mapping.subject_id)
        provenance = mapping.provenance_json or {}
        result.append({"project_id": project_id, "source_kind": mapping.source_kind, "source_id": mapping.source_id,
                       "source_key": mapping.source_key, "source_name": mapping.source_name,
                       "source_type": None, "context_name": provenance.get("filename")
                       or provenance.get("report_question") or "Original source",
                       "mapped_subject_id": subject.id if subject else None,
                       "mapped_subject_name": subject.name if subject else None,
                       "source_state": "stale"})
    return sorted(result, key=lambda item: (item["source_name"].casefold(), item["source_kind"], item["context_name"].casefold(), item["source_key"]))


def _validate_source(session: Session, project_id: str, source_kind: SourceKind, source_id: str, source_key: str) -> dict:
    if source_kind == "report_entity":
        report = session.get(ImportedResearchReport, source_id)
        if report is None or report.project_id != project_id:
            raise HTTPException(status_code=404, detail={"code": "SOURCE_NOT_FOUND", "message": "The report entity is not part of this project."})
        for entity in (report.research_data_json or {}).get("entities", []):
            if not isinstance(entity, dict):
                continue
            key = entity.get("key") or entity.get("entity_id") or entity.get("id")
            name = entity.get("name") or entity.get("display_name")
            if key == source_key and isinstance(name, str) and name.strip():
                return {"name": name, "source_type": entity.get("entity_type"),
                        "provenance": {"source_kind": source_kind, "source_id": source_id,
                                                       "source_key": source_key, "report_question": report.question}}
    else:
        dataset = session.get(QuantitativeDataset, source_id)
        report = session.get(ImportedResearchReport, dataset.report_id) if dataset and dataset.report_id else None
        belongs_to_project = bool(dataset and (dataset.project_id == project_id or (report and report.project_id == project_id)))
        if belongs_to_project:
            for observation in dataset.observations_json or []:
                if not isinstance(observation, dict):
                    continue
                key = observation.get("source_entity_id") or observation.get("entity_id")
                name = observation.get("source_entity_name") or observation.get("entity_name")
                if key == source_key and isinstance(name, str) and name.strip():
                    return {"name": name, "source_type": None,
                            "provenance": {"source_kind": source_kind, "source_id": source_id,
                                                           "source_key": source_key, "filename": dataset.filename,
                                                           "content_sha256": dataset.content_sha256}}
    raise HTTPException(status_code=404, detail={"code": "SOURCE_NOT_FOUND", "message": "The source identity was not found in this project."})


@router.get("/subjects", response_model=Page[ResearchSubjectRead])
def list_subjects(project_id: str, session: SessionDependency, cursor: str | None = None, limit: LIMIT = 20):
    _project_or_404(session, project_id)
    offset = 0
    if cursor is not None:
        try:
            offset = int(cursor)
            if offset < 0:
                raise ValueError
        except ValueError as exc:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR", "message": "Subject cursor must be a non-negative integer."}) from exc
    rows = list(session.scalars(select(ResearchSubject).where(ResearchSubject.project_id == project_id)
                                .order_by(ResearchSubject.name, ResearchSubject.id).offset(offset).limit(limit + 1)))
    more = len(rows) > limit
    items = rows[:limit]
    return Page(items=[_subject_read(item) for item in items], next_cursor=str(offset + limit) if more else None, limit=limit)


@router.post("/subjects", response_model=ResearchSubjectRead, status_code=status.HTTP_201_CREATED,
             responses={404: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}})
def create_subject(project_id: str, payload: ResearchSubjectCreate, session: SessionDependency):
    _project_or_404(session, project_id)
    subject = ResearchSubject(project_id=project_id, name=payload.name, subject_type=payload.subject_type,
                              aliases_json=payload.aliases, external_ids_json=payload.external_ids,
                              provenance_json=payload.provenance)
    session.add(subject)
    session.commit()
    session.refresh(subject)
    return _subject_read(subject)


@router.patch("/subjects/{subject_id}", response_model=ResearchSubjectRead,
              responses={404: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}})
def update_subject(project_id: str, subject_id: str, payload: ResearchSubjectUpdate, session: SessionDependency):
    _project_or_404(session, project_id)
    subject = _subject_or_404(session, project_id, subject_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(subject, f"{field}_json" if field in {"aliases", "external_ids"} else field, value)
    session.commit()
    session.refresh(subject)
    return _subject_read(subject)


@router.get("/subject-sources", response_model=Page[ResearchSubjectSourceRead], responses={404: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}})
def list_subject_sources(project_id: str, session: SessionDependency, cursor: str | None = None, limit: LIMIT = 50):
    _project_or_404(session, project_id)
    offset = 0
    if cursor is not None:
        try:
            offset = int(cursor)
            if offset < 0:
                raise ValueError
        except ValueError as exc:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR", "message": "Source cursor must be a non-negative integer."}) from exc
    rows = _source_candidates(session, project_id)
    page = rows[offset:offset + limit]
    return Page(items=[ResearchSubjectSourceRead.model_validate(row) for row in page],
                next_cursor=str(offset + limit) if offset + limit < len(rows) else None, limit=limit)


@router.put("/subject-sources", response_model=ResearchSubjectSourceRead,
            responses={404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}})
def map_subject_source(project_id: str, payload: ResearchSubjectSourceMap, session: SessionDependency):
    _project_or_404(session, project_id)
    source = _validate_source(session, project_id, payload.source_kind, payload.source_id, payload.source_key)
    reference = session.scalar(select(ResearchSubjectReference).where(
        ResearchSubjectReference.project_id == project_id,
        ResearchSubjectReference.source_kind == payload.source_kind,
        ResearchSubjectReference.source_id == payload.source_id,
        ResearchSubjectReference.source_key == payload.source_key,
    ))
    if payload.create_subject_from_source:
        if reference is not None:
            raise HTTPException(status_code=409, detail={"code": "SUBJECT_MAPPING_CONFLICT",
                "message": "This source is already linked. Review its current subject before making a change."})
        subject = ResearchSubject(project_id=project_id, name=source["name"], subject_type=source.get("source_type"),
                                  aliases_json=[], external_ids_json=[], provenance_json=source["provenance"])
        session.add(subject)
        session.flush()
    else:
        subject = _subject_or_404(session, project_id, payload.subject_id or "")
    if reference:
        if reference.subject_id != subject.id:
            if payload.expected_subject_id != reference.subject_id:
                raise HTTPException(status_code=409, detail={"code": "SUBJECT_MAPPING_CONFLICT",
                    "message": "This source is already linked to another subject. Review the current link before changing it.",
                    "current_subject_id": reference.subject_id})
            reference.subject_id = subject.id
            reference.source_name = source["name"]
            reference.provenance_json = source["provenance"]
    else:
        if payload.expected_subject_id is not None:
            raise HTTPException(status_code=409, detail={"code": "SUBJECT_MAPPING_STALE", "message": "The source mapping changed. Refresh and try again."})
        reference = ResearchSubjectReference(project_id=project_id, subject_id=subject.id, source_kind=payload.source_kind,
                                             source_id=payload.source_id, source_key=payload.source_key, source_name=source["name"],
                                             provenance_json=source["provenance"])
        session.add(reference)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail={"code": "SUBJECT_MAPPING_CONFLICT", "message": "The source was mapped elsewhere. Refresh the project subjects and try again."}) from exc
    return ResearchSubjectSourceRead(project_id=project_id, source_kind=payload.source_kind, source_id=payload.source_id,
                                     source_key=payload.source_key, source_name=source["name"],
                                     source_type=source.get("source_type"), context_name=source["provenance"].get("filename")
                                     or source["provenance"].get("report_question") or "Research source",
                                     mapped_subject_id=subject.id, mapped_subject_name=subject.name, source_state="available")
