"""Workspace-owned CSV data and report links for the data-first workflow."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import ImportedResearchReport, QuantitativeDataset, ResearchProject, new_id
from backend.app.quantitative import csv_digest, detect_csv_delimiter
from backend.app.dataset_metadata import effective_observations, metadata_view, review_state, updated_review
from backend.app.reports import _dataset_read, _preview_dataset
from backend.app.schemas import (
    DatasetMetadataRead, DatasetMetadataUpdate, ImportedReportSummary, Page,
    QuantitativeDatasetImport, QuantitativeDatasetPage, QuantitativeDatasetPreview,
    QuantitativeDatasetRead, ResearchProjectRead, ResearchWorkspaceStateUpdate,
)

router = APIRouter(prefix="/api/v1/projects", tags=["research workspace data"])
SessionDependency = Annotated[Session, Depends(get_session)]
LIMIT = Annotated[int, Query(ge=1, le=100)]


def _project(session: Session, project_id: str) -> ResearchProject:
    value = session.get(ResearchProject, project_id)
    if value is None:
        raise HTTPException(404, detail={"code": "PROJECT_NOT_FOUND", "message": "Research workspace was not found."})
    return value


def _dataset_for_project(session: Session, project_id: str, dataset_id: str) -> QuantitativeDataset:
    dataset = session.get(QuantitativeDataset, dataset_id)
    if dataset is None:
        raise HTTPException(404, detail={"code": "DATASET_NOT_FOUND", "message": "Dataset was not found for this workspace."})
    if dataset.project_id == project_id:
        return dataset
    report = session.get(ImportedResearchReport, dataset.report_id) if dataset.report_id else None
    if report is None or report.project_id != project_id:
        raise HTTPException(404, detail={"code": "DATASET_NOT_FOUND", "message": "Dataset was not found for this workspace."})
    return dataset


@router.put("/{project_id}/workspace-state", response_model=ResearchProjectRead)
def update_workspace_state(project_id: str, payload: ResearchWorkspaceStateUpdate, session: SessionDependency):
    project = _project(session, project_id)
    state = {**(project.workspace_state_json or {}), "selected_app_ids": payload.selected_app_ids}
    if "selection_criterion" in payload.model_fields_set:
        state["selected_app_criterion"] = payload.selection_criterion
    project.workspace_state_json = state
    session.commit()
    session.refresh(project)
    return project


@router.post("/{project_id}/quantitative-datasets/preview", response_model=QuantitativeDatasetPreview)
def preview_workspace_dataset(project_id: str, payload: QuantitativeDatasetImport, session: SessionDependency):
    _project(session, project_id)
    return _preview_dataset(None, payload)


@router.post("/{project_id}/quantitative-datasets", response_model=QuantitativeDatasetRead, status_code=status.HTTP_201_CREATED)
def import_workspace_dataset(project_id: str, payload: QuantitativeDatasetImport, response: Response, session: SessionDependency):
    _project(session, project_id)
    digest = csv_digest(payload.csv_content)
    workspace_report_ids = select(ImportedResearchReport.id).where(ImportedResearchReport.project_id == project_id)
    existing = session.scalar(select(QuantitativeDataset).where(
        QuantitativeDataset.content_sha256 == digest,
        or_(QuantitativeDataset.project_id == project_id, QuantitativeDataset.report_id.in_(workspace_report_ids)),
    ).order_by(QuantitativeDataset.project_id.is_not(None).desc()))
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return _dataset_read(existing, duplicate=True)
    preview = _preview_dataset(None, payload)
    if preview.ambiguities:
        raise HTTPException(409, detail={"code": "AMBIGUOUS_ENTITY_MAPPING", "message": "Review ambiguous source identities before importing.", "entity_mappings_required": preview.ambiguities})
    dataset_id = new_id()
    observations = [item.model_dump(mode="json") for item in preview.observations]
    for row in observations:
        row["provenance_id"] = dataset_id
        row["import_status"] = "imported"
    dataset = QuantitativeDataset(
        id=dataset_id, project_id=project_id, report_id=None,
        filename=payload.filename, content_sha256=digest, original_csv=payload.csv_content,
        field_mapping_json={
            "field_mapping": payload.field_mapping,
            "metric_mappings": [item.model_dump() for item in payload.metric_mappings],
            "explicit_values": payload.explicit_values,
            "delimiter": detect_csv_delimiter(payload.csv_content),
        },
        entity_mappings_json=payload.entity_mappings,
        observations_json=observations,
        compatibility_status=preview.compatibility_status,
        validation_reasons_json=preview.validation_reasons,
    )
    session.add(dataset)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = session.scalar(select(QuantitativeDataset).where(
            QuantitativeDataset.project_id == project_id,
            QuantitativeDataset.content_sha256 == digest,
        ))
        if existing is None:
            raise
        response.status_code = status.HTTP_200_OK
        return _dataset_read(existing, duplicate=True)
    session.refresh(dataset)
    return _dataset_read(dataset)


@router.get("/{project_id}/quantitative-datasets", response_model=QuantitativeDatasetPage)
def list_workspace_datasets(project_id: str, session: SessionDependency, cursor: str | None = None, limit: LIMIT = 20):
    _project(session, project_id)
    workspace_report_ids = select(ImportedResearchReport.id).where(ImportedResearchReport.project_id == project_id)
    query = select(QuantitativeDataset).where(or_(
        QuantitativeDataset.project_id == project_id,
        QuantitativeDataset.report_id.in_(workspace_report_ids),
    )).order_by(
        QuantitativeDataset.created_at.desc(), QuantitativeDataset.id.desc()
    )
    if cursor:
        cursor_row = session.get(QuantitativeDataset, cursor)
        is_in_workspace = cursor_row is not None and (
            cursor_row.project_id == project_id or
            (cursor_row.report_id is not None and session.get(ImportedResearchReport, cursor_row.report_id) is not None
             and session.get(ImportedResearchReport, cursor_row.report_id).project_id == project_id)
        )
        if cursor_row is None or not is_in_workspace:
            raise HTTPException(422, detail={"code": "INVALID_CURSOR", "message": "Dataset cursor was not found for this workspace."})
        query = query.where(or_(
            QuantitativeDataset.created_at < cursor_row.created_at,
            and_(QuantitativeDataset.created_at == cursor_row.created_at, QuantitativeDataset.id < cursor_row.id),
        ))
    rows = list(session.scalars(query.limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return QuantitativeDatasetPage(items=[_dataset_read(item) for item in items], next_cursor=items[-1].id if has_more and items else None, limit=limit)


@router.get("/{project_id}/reports", response_model=Page[ImportedReportSummary])
def list_workspace_reports(project_id: str, session: SessionDependency, cursor: str | None = None, limit: LIMIT = 20):
    _project(session, project_id)
    query = select(ImportedResearchReport).where(ImportedResearchReport.project_id == project_id).order_by(
        ImportedResearchReport.imported_at.desc(), ImportedResearchReport.id.desc()
    )
    if cursor:
        cursor_row = session.get(ImportedResearchReport, cursor)
        if cursor_row is None or cursor_row.project_id != project_id:
            raise HTTPException(422, detail={"code": "INVALID_CURSOR", "message": "Report cursor was not found for this workspace."})
        query = query.where(or_(
            ImportedResearchReport.imported_at < cursor_row.imported_at,
            and_(ImportedResearchReport.imported_at == cursor_row.imported_at, ImportedResearchReport.id < cursor_row.id),
        ))
    rows = list(session.scalars(query.limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return Page(items=[ImportedReportSummary.model_validate(item) for item in items], next_cursor=items[-1].id if has_more and items else None, limit=limit)


@router.put("/{project_id}/reports/{report_id}", response_model=ImportedReportSummary)
def link_report(project_id: str, report_id: str, session: SessionDependency):
    project = _project(session, project_id)
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})
    if report.project_id not in (None, project.id):
        raise HTTPException(409, detail={"code": "REPORT_ALREADY_LINKED", "message": "This report already belongs to another workspace."})
    report.project_id = project.id
    # Link existing report-owned CSV rows to this workspace without copying rows.
    for dataset in session.scalars(select(QuantitativeDataset).where(QuantitativeDataset.report_id == report.id)):
        if dataset.project_id in (None, project.id):
            conflict = session.scalar(select(QuantitativeDataset.id).where(
                QuantitativeDataset.project_id == project.id,
                QuantitativeDataset.content_sha256 == dataset.content_sha256,
                QuantitativeDataset.id != dataset.id,
            ))
            # Keep both original records and their provenance. If an identical
            # workspace-owned file already exists, the report-owned dataset is
            # still visible through the report-to-workspace relationship.
            if conflict is None:
                dataset.project_id = project.id
    session.commit()
    session.refresh(report)
    return report


@router.get("/{project_id}/quantitative-datasets/{dataset_id}/metadata", response_model=DatasetMetadataRead)
def read_workspace_dataset_metadata(project_id: str, dataset_id: str, session: SessionDependency):
    dataset = _dataset_for_project(session, project_id, dataset_id)
    return metadata_view(dataset)


@router.get("/{project_id}/quantitative-datasets/{dataset_id}", response_model=QuantitativeDatasetRead)
def get_workspace_dataset(project_id: str, dataset_id: str, session: SessionDependency):
    dataset = _dataset_for_project(session, project_id, dataset_id)
    return _dataset_read(dataset)


@router.put("/{project_id}/quantitative-datasets/{dataset_id}/metadata", response_model=DatasetMetadataRead)
def update_workspace_dataset_metadata(project_id: str, dataset_id: str, payload: DatasetMetadataUpdate, session: SessionDependency):
    dataset = _dataset_for_project(session, project_id, dataset_id)
    state = updated_review(dataset, payload)
    if state != review_state(dataset):
        dataset.field_mapping_json = {**(dataset.field_mapping_json or {}), "metadata_review": state}
        session.commit()
        session.refresh(dataset)
    return metadata_view(dataset)


@router.post("/{project_id}/quantitative-datasets/{dataset_id}/revalidate", response_model=QuantitativeDatasetRead)
def revalidate_workspace_dataset(project_id: str, dataset_id: str, session: SessionDependency):
    dataset = _dataset_for_project(session, project_id, dataset_id)
    saved = dataset.field_mapping_json or {}
    payload = QuantitativeDatasetImport.model_validate({
        "filename": dataset.filename, "csv_content": dataset.original_csv,
        "field_mapping": saved.get("field_mapping", {}),
        "entity_mappings": dataset.entity_mappings_json or {},
        "metric_mappings": saved.get("metric_mappings", []),
        "explicit_values": saved.get("explicit_values", {}),
    })
    preview = _preview_dataset(None, payload)
    if review_state(dataset).get("entries"):
        return _dataset_read(dataset)
    observations = [item.model_dump(mode="json") for item in preview.observations]
    for row in observations:
        row["provenance_id"] = dataset.id
        row["import_status"] = "imported"
    dataset.observations_json = observations
    dataset.validation_reasons_json = preview.validation_reasons
    dataset.compatibility_status = preview.compatibility_status
    session.commit()
    session.refresh(dataset)
    return _dataset_read(dataset)
