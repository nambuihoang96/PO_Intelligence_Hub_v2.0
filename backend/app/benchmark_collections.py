from __future__ import annotations

import hashlib
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import (
    ResearchBenchmarkCollection,
    ResearchBenchmarkCollectionMember,
    ImportedResearchReport,
    ProjectTrendUpdate,
    QuantitativeDataset,
    ResearchProject,
    ResearchSubject,
    ResearchSubjectReference,
)
from backend.app.schemas import (
    ErrorEnvelope,
    ResearchBenchmarkCollectionCreate,
    ResearchBenchmarkCollectionDimensionRead,
    ResearchBenchmarkCollectionMemberAdd,
    ResearchBenchmarkCollectionMemberRead,
    ResearchBenchmarkCollectionObservationRead,
    ResearchBenchmarkCollectionPage,
    ResearchBenchmarkCollectionRead,
)


router = APIRouter(prefix="/api/v1/projects/{project_id}/benchmark-collections", tags=["benchmark collections"])
SessionDependency = Annotated[Session, Depends(get_session)]
LIMIT = Annotated[int, Query(ge=1, le=100)]


def _project_or_404(session: Session, project_id: str) -> None:
    if session.get(ResearchProject, project_id) is None:
        raise HTTPException(status_code=404, detail={"code": "PROJECT_NOT_FOUND", "message": "Research project was not found."})


def _collection_or_404(session: Session, project_id: str, collection_id: str) -> ResearchBenchmarkCollection:
    collection = session.scalar(select(ResearchBenchmarkCollection).where(
        ResearchBenchmarkCollection.project_id == project_id,
        ResearchBenchmarkCollection.id == collection_id,
    ))
    if collection is None:
        raise HTTPException(status_code=404, detail={"code": "COLLECTION_NOT_FOUND", "message": "Benchmark collection was not found in this project."})
    return collection


def _collection_read(session: Session, collection: ResearchBenchmarkCollection) -> ResearchBenchmarkCollectionRead:
    members = list(session.scalars(select(ResearchBenchmarkCollectionMember).where(
        ResearchBenchmarkCollectionMember.project_id == collection.project_id,
        ResearchBenchmarkCollectionMember.collection_id == collection.id,
    ).order_by(ResearchBenchmarkCollectionMember.created_at, ResearchBenchmarkCollectionMember.id)))
    subjects = {item.id: item for item in session.scalars(select(ResearchSubject).where(
        ResearchSubject.project_id == collection.project_id,
        ResearchSubject.id.in_([member.subject_id for member in members]) if members else False,
    ))}
    counts = {}
    if subjects:
        rows = session.execute(select(
            ResearchSubjectReference.subject_id,
            ResearchSubjectReference.source_kind,
            func.count(ResearchSubjectReference.id),
        ).where(
            ResearchSubjectReference.project_id == collection.project_id,
            ResearchSubjectReference.subject_id.in_(subjects),
        ).group_by(ResearchSubjectReference.subject_id, ResearchSubjectReference.source_kind)).all()
        for subject_id, source_kind, count in rows:
            counts.setdefault(subject_id, {})[source_kind] = count
    member_reads = []
    dimension_by_key = {}
    for member in members:
        subject = subjects.get(member.subject_id)
        if subject is None:
            continue
        source_counts = counts.get(subject.id, {})
        report_count = source_counts.get("report_entity", 0)
        csv_count = source_counts.get("csv_entity", 0)
        trend_updates = list(session.scalars(select(ProjectTrendUpdate).where(
            ProjectTrendUpdate.project_id == collection.project_id,
            ProjectTrendUpdate.collection_id == collection.id,
            ProjectTrendUpdate.subject_id == subject.id,
        ).order_by(ProjectTrendUpdate.published_on, ProjectTrendUpdate.created_at, ProjectTrendUpdate.id)))
        references = list(session.scalars(select(ResearchSubjectReference).where(
            ResearchSubjectReference.project_id == collection.project_id,
            ResearchSubjectReference.subject_id == subject.id,
        ).order_by(ResearchSubjectReference.created_at, ResearchSubjectReference.id)))
        observations = []
        for reference in references:
            if reference.source_kind == "report_entity":
                report = session.get(ImportedResearchReport, reference.source_id)
                if report is None or report.project_id != collection.project_id:
                    continue
                research = report.research_data_json or {}
                for dimension in research.get("benchmark_dimensions", []) if isinstance(research, dict) else []:
                    if not isinstance(dimension, dict):
                        continue
                    dimension_key = f"report:{report.id}:{dimension.get('key', '')}"
                    for observation in dimension.get("observations", []):
                        if not isinstance(observation, dict) or observation.get("entity_key") != reference.source_key:
                            continue
                        name = str(dimension.get("name") or dimension.get("key") or "Report dimension")
                        dimension_by_key.setdefault(dimension_key, ResearchBenchmarkCollectionDimensionRead(
                            key=dimension_key, name=name, source_kind="report_entity"))
                        observations.append(ResearchBenchmarkCollectionObservationRead(
                            dimension_key=dimension_key, dimension_name=name, source_kind="report_entity",
                            source_name=report.question, value=observation.get("value"),
                            scope={"GEO": report.geo, "environment": report.os, "period": report.research_period},
                            verification_status="unverified", evidence_status=observation.get("evidence_status", "unverified"),
                            uncertainty=observation.get("uncertainty"),
                            evidence_references=list(dict.fromkeys([
                                *(observation.get("evidence_references") or []),
                                *(dimension.get("evidence_references") or []),
                            ])), source_locations=observation.get("source_locations") or [],
                        ))
            elif reference.source_kind == "csv_entity":
                dataset = session.get(QuantitativeDataset, reference.source_id)
                dataset_report = session.get(ImportedResearchReport, dataset.report_id) if dataset and dataset.report_id else None
                belongs_to_project = bool(dataset and (dataset.project_id == collection.project_id or
                                                        (dataset_report and dataset_report.project_id == collection.project_id)))
                if not belongs_to_project:
                    continue
                for observation in dataset.observations_json or []:
                    if not isinstance(observation, dict):
                        continue
                    key = observation.get("source_entity_id") or observation.get("entity_id")
                    if key != reference.source_key:
                        continue
                    identity = [observation.get(field) for field in (
                        "metric_id", "metric_definition", "unit", "methodology", "geo", "platform",
                        "period_start", "period_end", "snapshot_date", "period_semantics", "granularity",
                    )]
                    identity_hash = hashlib.sha256(json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()[:20]
                    dimension_key = f"csv:{dataset.id}:{identity_hash}"
                    dimension_name = str(observation.get("metric_definition") or observation.get("metric_id") or "Metric not specified")
                    scope = {label: observation.get(field) for label, field in (
                        ("GEO", "geo"), ("platform", "platform"), ("period start", "period_start"),
                        ("period end", "period_end"), ("snapshot date", "snapshot_date"),
                        ("granularity", "granularity"), ("methodology", "methodology"),
                    ) if observation.get(field) not in (None, "")}
                    dimension_by_key.setdefault(dimension_key, ResearchBenchmarkCollectionDimensionRead(
                        key=dimension_key, name=dimension_name, source_kind="csv_entity"))
                    row_number = observation.get("source_row_number")
                    locations = [f"CSV row {row_number}"] if isinstance(row_number, int) else []
                    verification_status = observation.get("verification_status")
                    if verification_status not in {"unverified", "needs_review", "verified"}:
                        verification_status = "unverified"
                    observations.append(ResearchBenchmarkCollectionObservationRead(
                        dimension_key=dimension_key, dimension_name=dimension_name, source_kind="csv_entity",
                        source_name=dataset.filename, value=observation.get("value"), unit=observation.get("unit"),
                        scope=scope, verification_status=verification_status,
                        evidence_references=list(dict.fromkeys([value for value in (
                            observation.get("source_reference"), observation.get("evidence_reference")) if isinstance(value, str) and value])),
                        source_locations=locations,
                        validation_reasons=observation.get("validation_reasons") or observation.get("source_validation_reasons") or [],
                    ))
        if trend_updates:
            trend_dimension_key = f"trend:{collection.id}:source-reported-updates"
            trend_dimension_name = "Trend updates (source-reported)"
            dimension_by_key.setdefault(trend_dimension_key, ResearchBenchmarkCollectionDimensionRead(
                key=trend_dimension_key, name=trend_dimension_name, source_kind="trend_update"))
            for update in trend_updates:
                observations.append(ResearchBenchmarkCollectionObservationRead(
                    dimension_key=trend_dimension_key, dimension_name=trend_dimension_name, source_kind="trend_update",
                    source_name=update.source_title or "Owner-captured source note", value=update.exact_claim,
                    scope={"published date": update.published_on.isoformat()}, verification_status="unverified",
                    evidence_status="Source-reported · unverified", source_note=update.source_note,
                    uncertainty="Not independently verified. No period, GEO, platform, or measurement methodology is inferred.",
                    evidence_references=[update.source_url] if update.source_url else [],
                ))
        member_reads.append(ResearchBenchmarkCollectionMemberRead(
            subject_id=subject.id, name=subject.name, subject_type=subject.subject_type,
            source_count=report_count + csv_count + len(trend_updates), report_source_count=report_count,
            csv_source_count=csv_count, trend_update_count=len(trend_updates),
            observations=observations,
        ))
    return ResearchBenchmarkCollectionRead(
        id=collection.id, project_id=collection.project_id, name=collection.name,
        description=collection.description, members=member_reads,
        dimensions=list(dimension_by_key.values()),
        created_at=collection.created_at, updated_at=collection.updated_at,
    )


@router.get("", response_model=ResearchBenchmarkCollectionPage, responses={404: {"model": ErrorEnvelope}})
def list_collections(project_id: str, session: SessionDependency, cursor: str | None = None, limit: LIMIT = 20):
    _project_or_404(session, project_id)
    offset = 0
    if cursor is not None:
        try:
            offset = int(cursor)
            if offset < 0:
                raise ValueError
        except ValueError as exc:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR", "message": "Collection cursor must be a non-negative integer."}) from exc
    rows = list(session.scalars(select(ResearchBenchmarkCollection).where(
        ResearchBenchmarkCollection.project_id == project_id,
    ).order_by(ResearchBenchmarkCollection.name, ResearchBenchmarkCollection.id).offset(offset).limit(limit + 1)))
    more = len(rows) > limit
    items = [_collection_read(session, row) for row in rows[:limit]]
    return ResearchBenchmarkCollectionPage(items=items, next_cursor=str(offset + limit) if more else None, limit=limit)


@router.post("", response_model=ResearchBenchmarkCollectionRead, status_code=status.HTTP_201_CREATED,
             responses={404: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}})
def create_collection(project_id: str, payload: ResearchBenchmarkCollectionCreate, session: SessionDependency):
    _project_or_404(session, project_id)
    collection = ResearchBenchmarkCollection(project_id=project_id, name=payload.name, description=payload.description)
    session.add(collection)
    session.commit()
    session.refresh(collection)
    return _collection_read(session, collection)


@router.get("/{collection_id}", response_model=ResearchBenchmarkCollectionRead,
            responses={404: {"model": ErrorEnvelope}})
def get_collection(project_id: str, collection_id: str, session: SessionDependency):
    _project_or_404(session, project_id)
    return _collection_read(session, _collection_or_404(session, project_id, collection_id))


@router.put("/{collection_id}/subjects/{subject_id}", response_model=ResearchBenchmarkCollectionRead,
            responses={404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope}})
def add_collection_subject(project_id: str, collection_id: str, subject_id: str, payload: ResearchBenchmarkCollectionMemberAdd, session: SessionDependency):
    _project_or_404(session, project_id)
    collection = _collection_or_404(session, project_id, collection_id)
    if payload.subject_id != subject_id:
        raise HTTPException(status_code=409, detail={"code": "SUBJECT_PATH_MISMATCH", "message": "Subject in the path does not match the requested subject."})
    subject = session.scalar(select(ResearchSubject).where(
        ResearchSubject.project_id == project_id, ResearchSubject.id == subject_id,
    ))
    if subject is None:
        raise HTTPException(status_code=404, detail={"code": "SUBJECT_NOT_FOUND", "message": "Research subject was not found in this project."})
    existing = session.scalar(select(ResearchBenchmarkCollectionMember).where(
        ResearchBenchmarkCollectionMember.project_id == project_id,
        ResearchBenchmarkCollectionMember.collection_id == collection_id,
        ResearchBenchmarkCollectionMember.subject_id == subject_id,
    ))
    if existing is None:
        session.add(ResearchBenchmarkCollectionMember(project_id=project_id, collection_id=collection_id, subject_id=subject_id))
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise HTTPException(status_code=409, detail={"code": "COLLECTION_MEMBERSHIP_CONFLICT", "message": "Collection membership changed. Refresh and try again."}) from exc
        session.refresh(collection)
    return _collection_read(session, collection)


@router.delete("/{collection_id}/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses={404: {"model": ErrorEnvelope}})
def remove_collection_subject(project_id: str, collection_id: str, subject_id: str, session: SessionDependency):
    _project_or_404(session, project_id)
    _collection_or_404(session, project_id, collection_id)
    membership = session.scalar(select(ResearchBenchmarkCollectionMember).where(
        ResearchBenchmarkCollectionMember.project_id == project_id,
        ResearchBenchmarkCollectionMember.collection_id == collection_id,
        ResearchBenchmarkCollectionMember.subject_id == subject_id,
    ))
    if membership is None:
        raise HTTPException(status_code=404, detail={"code": "COLLECTION_MEMBER_NOT_FOUND", "message": "Subject is not a member of this collection."})
    session.delete(membership)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
