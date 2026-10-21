import hashlib
import json
import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import ImportedResearchReport, QuantitativeDataset, new_id
from backend.app.quantitative import assess_observation_readiness, assess_report_observations, csv_digest, detect_csv_delimiter, parse_csv_observations
from backend.app.research_data import ResearchInputValidationError, extract_unstructured, normalize_report
from backend.app.schemas import (
    BenchmarkSelectionsUpdate,
    BenchmarkStateUpdate,
    BenchmarkWorkspaceRead,
    BenchmarkWorkspaceUpdate,
    ImportedReportCreate,
    ImportedReportCreated,
    ImportedReportRead,
    ImportedReportSummary,
    Page,
    QuantitativeDatasetImport,
    QuantitativeDatasetPreview,
    QuantitativeDatasetRead,
    ReprocessResult,
    ReportStructuringUpdate,
    StructuredResearchDataUpdate,
)


router = APIRouter(prefix="/api/v1/reports", tags=["imported reports"])
SessionDependency = Annotated[Session, Depends(get_session)]
LIMIT = Annotated[int, Query(ge=1, le=100, description="Maximum reports per page")]


def _available_keys(report: ImportedResearchReport) -> dict[str, set[str]]:
    data = report.research_data_json or {}
    return {
        "entity": {item["key"] for item in data.get("entities", [])},
        "finding": {item["key"] for item in data.get("findings", [])},
        "dimension": {item["key"] for item in data.get("benchmark_dimensions", [])},
    }


def _orphaned_selections(report: ImportedResearchReport) -> list[dict]:
    available = _available_keys(report)
    return [
        item for item in (report.benchmark_selections_json or [])
        if item.get("item_key") not in available.get(item.get("item_type"), set())
    ]


def _read(report: ImportedResearchReport, *, duplicate: bool = False, structured_update_available: bool = False) -> ImportedReportCreated:
    data = ImportedReportSummary.model_validate(report).model_dump()
    research = dict(report.research_data_json or {})
    research["quantitative_observations"] = assess_report_observations(
        research.get("quantitative_observations", []),
        report_id=report.id,
        report_geo=report.geo,
        report_platform=report.os,
        report_period=report.research_period,
        entities=research.get("entities", []),
        evidence_references=research.get("evidence_references", []),
    )
    has_results = bool(research.get("findings") or research.get("entities") or research.get("benchmark_dimensions") or research.get("quantitative_observations"))
    has_structure = bool(has_results or research.get("key_takeaways") or research.get("research_gaps") or research.get("po_recommendations"))
    research_status = "STRUCTURED_READY" if has_results else ("STRUCTURED_PARTIAL" if has_structure else "TEXT_ONLY")
    data.update(
        content=report.content,
        parse_status=report.parse_status,
        research_status=research_status,
        research_contract_version="po_research_v1",
        research_data=research,
        extraction_error=report.extraction_error,
        benchmark_selections=report.benchmark_selections_json,
        benchmark_workspace=report.benchmark_workspace_json or {},
        orphaned_benchmark_selections=_orphaned_selections(report),
        orphaned_benchmark_entries=[
            item for item in (report.benchmark_workspace_json or {}).get("entries", [])
            if item.get("item_key") not in _available_keys(report).get(item.get("item_type"), set())
        ],
        structured_update_available=structured_update_available,
        duplicate=duplicate,
    )
    return ImportedReportCreated.model_validate(data)


@router.post("", response_model=ImportedReportCreated, status_code=status.HTTP_201_CREATED, responses={422: {"description": "Invalid report input"}})
def import_report(payload: ImportedReportCreate, response: Response, session: SessionDependency) -> ImportedReportCreated:
    digest = hashlib.sha256(payload.content.encode("utf-8")).hexdigest()
    try:
        research_data, parse_status, extraction_error = normalize_report(payload.content, payload.structured_json)
    except ResearchInputValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INVALID_RESEARCH_INPUT",
                "message": str(exc),
                "errors": exc.errors,
            },
        ) from exc
    existing = session.scalar(select(ImportedResearchReport).where(ImportedResearchReport.content_sha256 == digest))
    if existing is not None:
        available = False
        if parse_status == "PARSED":
            incoming = research_data.model_dump(mode="json")
            current = existing.research_data_json or {}
            existing_has_results = bool(current.get("findings") or current.get("entities") or current.get("benchmark_dimensions"))
            incoming_has_results = bool(incoming.get("findings") or incoming.get("entities") or incoming.get("benchmark_dimensions"))
            if incoming_has_results and not existing_has_results:
                existing.research_data_json = incoming
                existing.parse_status = "PARSED"
                existing.extraction_error = None
                session.commit()
                session.refresh(existing)
            elif current != incoming:
                available = current != incoming
        response.status_code = status.HTTP_200_OK
        return _read(existing, duplicate=True, structured_update_available=available)

    report = ImportedResearchReport(
        question=payload.question,
        geo=payload.geo,
        os=payload.os,
        research_period=payload.research_period,
        content=payload.content,
        research_data_json=research_data.model_dump(mode="json"),
        parse_status=parse_status,
        extraction_error=extraction_error,
        benchmark_selections_json=[],
        content_sha256=digest,
        origin="chatgpt_user_import",
    )
    session.add(report)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = session.scalar(select(ImportedResearchReport).where(ImportedResearchReport.content_sha256 == digest))
        if existing is None:
            raise
        response.status_code = status.HTTP_200_OK
        return _read(existing, duplicate=True)
    session.refresh(report)
    return _read(report)


@router.get("", response_model=Page[ImportedReportSummary])
def list_reports(session: SessionDependency, cursor: str | None = None, limit: LIMIT = 20) -> Page[ImportedReportSummary]:
    query = select(ImportedResearchReport).order_by(
        ImportedResearchReport.imported_at.desc(), ImportedResearchReport.id.desc()
    )
    if cursor:
        cursor_report = session.get(ImportedResearchReport, cursor)
        if cursor_report is None:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR", "message": "Report cursor was not found."})
        query = query.where(
            or_(
                ImportedResearchReport.imported_at < cursor_report.imported_at,
                and_(ImportedResearchReport.imported_at == cursor_report.imported_at, ImportedResearchReport.id < cursor_report.id),
            )
        )
    rows = list(session.scalars(query.limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return Page(
        items=[ImportedReportSummary.model_validate(report) for report in items],
        next_cursor=items[-1].id if has_more and items else None,
        limit=limit,
    )


@router.get("/{report_id}", response_model=ImportedReportRead, responses={404: {"description": "Report not found"}})
def get_report(report_id: str, session: SessionDependency) -> ImportedReportRead:
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})
    return ImportedReportRead.model_validate(_read(report).model_dump(exclude={"duplicate"}))


def _dataset_read(dataset: QuantitativeDataset, *, report: ImportedResearchReport, duplicate: bool = False) -> QuantitativeDatasetRead:
    saved_mapping = dataset.field_mapping_json or {}
    if "field_mapping" in saved_mapping:
        field_mapping = saved_mapping.get("field_mapping", {})
        metric_mappings = saved_mapping.get("metric_mappings", [])
        explicit_values = saved_mapping.get("explicit_values", {})
        delimiter = saved_mapping.get("delimiter", ",")
    else:
        field_mapping = saved_mapping
        metric_mappings = []
        explicit_values = {}
        delimiter = ","
    observations = [assess_observation_readiness(item, report_geo=report.geo, report_platform=report.os) for item in (dataset.observations_json or [])]
    complete_count = sum(bool(item.get("complete_observation")) for item in observations)
    display_count = sum(bool(item.get("display_ready")) for item in observations)
    analysis_count = sum(bool(item.get("analysis_ready")) for item in observations)
    scope_count = sum(item.get("scope_compatible") is True for item in observations)
    report_compatible_count = sum(item.get("report_compatibility") == "compatible" for item in observations)
    comparison_count = sum(bool(item.get("comparison_ready")) for item in observations)
    incompatible_count = sum(item.get("report_compatibility") == "incompatible" for item in observations)
    compatibility = "compatible" if observations and all(item.get("report_compatibility") == "compatible" for item in observations) else ("incompatible" if observations and incompatible_count == len(observations) else "partial")
    source_entities = {item.get("source_entity_id") or item.get("entity_id") for item in observations if item.get("source_entity_id") or item.get("entity_id")}
    metric_identities = {item.get("metric_id") for item in observations if item.get("metric_id")}
    try:
        source_rows = max(0, sum(1 for _ in csv.reader(io.StringIO(dataset.original_csv, newline=""), delimiter=detect_csv_delimiter(dataset.original_csv))) - 1)
    except (ValueError, csv.Error):
        source_rows = 0
    validation_reasons = list(dict.fromkeys([*(dataset.validation_reasons_json or []), *(reason for item in observations for reason in item.get("validation_reasons", []))]))
    return QuantitativeDatasetRead.model_validate({
        "id": dataset.id,
        "report_id": dataset.report_id,
        "filename": dataset.filename,
        "content_sha256": dataset.content_sha256,
        "field_mapping": field_mapping,
        "metric_mappings": metric_mappings,
        "explicit_values": explicit_values,
        "delimiter": delimiter,
        "entity_mappings": dataset.entity_mappings_json or {},
        "observations": observations,
        "compatibility_status": compatibility,
        "validation_reasons": validation_reasons,
        "created_at": dataset.created_at,
        "duplicate": duplicate,
        "complete_observations": complete_count,
        "scope_compatible_observations": scope_count,
        "comparison_ready_observations": comparison_count,
        "comparison_readiness": "needs_compatible_pair" if comparison_count else "no_complete_observations",
        "source_rows": source_rows,
        "source_apps": len(source_entities),
        "recognized_metrics": len(metric_identities),
        "display_ready_observations": display_count,
        "analysis_ready_observations": analysis_count,
        "report_compatible_observations": report_compatible_count,
        "incomplete_observations": max(0, len(observations) - complete_count),
    })


def _preview_dataset(report: ImportedResearchReport, payload: QuantitativeDatasetImport) -> QuantitativeDatasetPreview:
    try:
        observations, reasons, ambiguities, compatibility = parse_csv_observations(
            payload.csv_content,
            report_id=report.id,
            report_geo=report.geo,
            report_platform=report.os,
            report_period=report.research_period,
            entities=(report.research_data_json or {}).get("entities", []),
            field_mapping=payload.field_mapping,
            entity_mappings=payload.entity_mappings,
            metric_mappings=[item.model_dump() for item in payload.metric_mappings],
            explicit_values=payload.explicit_values,
        )
    except (ValueError, csv.Error) as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_QUANTITATIVE_DATASET", "message": str(exc)}) from exc
    for item in observations:
        item["import_status"] = "preview"
    complete = sum(bool(item.get("complete_observation")) for item in observations)
    scoped = sum(item.get("scope_compatible") is True for item in observations)
    comparison = sum(bool(item.get("comparison_ready")) for item in observations)
    return QuantitativeDatasetPreview(
        observations=observations,
        validation_reasons=reasons,
        ambiguities=[item for item in ambiguities if item.get("candidates")],
        unmatched_entities=[item for item in ambiguities if not item.get("candidates")],
        compatibility_status=compatibility,
        total_rows=len(observations),
        complete_observations=complete,
        scope_compatible_observations=scoped,
        comparison_ready_observations=comparison,
        duplicate_rows=sum("Duplicate observation of CSV row" in reason for item in observations for reason in item.get("validation_reasons", [])),
        source_apps=len({item.get("source_entity_id") or item.get("entity_id") for item in observations if item.get("source_entity_id") or item.get("entity_id")}),
        source_only_entities=len({item.get("source_entity_id") for item in observations if item.get("entity_resolution_state") == "source_only" and item.get("source_entity_id")}),
        matched_entities=len({item.get("source_entity_id") for item in observations if item.get("entity_resolution_state") == "matched" and item.get("source_entity_id")}),
        dataset_analysis_ready_observations=sum(bool(item.get("analysis_ready")) for item in observations),
        report_compatible_observations=sum(item.get("report_compatibility") == "compatible" for item in observations),
    )


@router.post("/{report_id}/quantitative-datasets/preview", response_model=QuantitativeDatasetPreview)
def preview_quantitative_dataset(
    report_id: str,
    payload: QuantitativeDatasetImport,
    session: SessionDependency,
) -> QuantitativeDatasetPreview:
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})
    return _preview_dataset(report, payload)


@router.post("/{report_id}/quantitative-datasets", response_model=QuantitativeDatasetRead, status_code=status.HTTP_201_CREATED)
def import_quantitative_dataset(
    report_id: str,
    payload: QuantitativeDatasetImport,
    response: Response,
    session: SessionDependency,
) -> QuantitativeDatasetRead:
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})
    digest = csv_digest(payload.csv_content)
    existing = session.scalar(select(QuantitativeDataset).where(
        QuantitativeDataset.report_id == report_id,
        QuantitativeDataset.content_sha256 == digest,
    ))
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return _dataset_read(existing, report=report, duplicate=True)
    preview = _preview_dataset(report, payload)
    observations = [item.model_dump(mode="json") for item in preview.observations]
    reasons = preview.validation_reasons
    ambiguities = [*preview.ambiguities, *preview.unmatched_entities]
    compatibility = preview.compatibility_status
    if ambiguities:
        raise HTTPException(status_code=409, detail={
            "code": "AMBIGUOUS_ENTITY_MAPPING",
        "message": "One or more CSV entity values need an explicit mapping or must be left unmapped before linking.",
        "entity_mappings_required": ambiguities,
        "ambiguous_mappings": ambiguities,
        })
    dataset_id = new_id()
    for item in observations:
        item["provenance_id"] = dataset_id
        item["import_status"] = "imported"
    dataset = QuantitativeDataset(
        id=dataset_id,
        report_id=report_id,
        filename=payload.filename,
        content_sha256=digest,
        original_csv=payload.csv_content,
        field_mapping_json={
            "field_mapping": payload.field_mapping,
            "metric_mappings": [item.model_dump() for item in payload.metric_mappings],
            "explicit_values": payload.explicit_values,
            "delimiter": detect_csv_delimiter(payload.csv_content),
        },
        entity_mappings_json=payload.entity_mappings,
        observations_json=observations,
        compatibility_status=compatibility,
        validation_reasons_json=reasons,
    )
    session.add(dataset)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = session.scalar(select(QuantitativeDataset).where(
            QuantitativeDataset.report_id == report_id,
            QuantitativeDataset.content_sha256 == digest,
        ))
        if existing is None:
            raise
        response.status_code = status.HTTP_200_OK
        return _dataset_read(existing, report=report, duplicate=True)
    session.refresh(dataset)
    return _dataset_read(dataset, report=report)


@router.post("/{report_id}/quantitative-datasets/{dataset_id}/revalidate", response_model=QuantitativeDatasetRead)
def revalidate_quantitative_dataset(
    report_id: str,
    dataset_id: str,
    session: SessionDependency,
) -> QuantitativeDatasetRead:
    """Rebuild one saved dataset deterministically from its preserved CSV and mappings."""
    report = session.get(ImportedResearchReport, report_id)
    dataset = session.get(QuantitativeDataset, dataset_id)
    if report is None or dataset is None or dataset.report_id != report_id:
        raise HTTPException(status_code=404, detail={"code": "DATASET_NOT_FOUND", "message": "Dataset was not found for this report."})
    saved = dataset.field_mapping_json or {}
    if not dataset.original_csv or not saved:
        raise HTTPException(status_code=409, detail={
            "code": "DATASET_CANNOT_BE_REVALIDATED",
            "message": "The saved dataset does not contain enough original CSV and column mapping information to rebuild it safely. Existing observations were not changed.",
        })
    if "field_mapping" in saved:
        field_mapping = saved.get("field_mapping") or {}
        metric_mappings = saved.get("metric_mappings") or []
        explicit_values = saved.get("explicit_values") or {}
    else:
        field_mapping, metric_mappings, explicit_values = saved, [], {}
    try:
        payload = QuantitativeDatasetImport.model_validate({
            "filename": dataset.filename,
            "csv_content": dataset.original_csv,
            "field_mapping": field_mapping,
            "entity_mappings": dataset.entity_mappings_json or {},
            "metric_mappings": metric_mappings,
            "explicit_values": explicit_values,
        })
    except Exception as exc:
        raise HTTPException(status_code=409, detail={
            "code": "DATASET_MAPPING_NOT_RECOVERABLE",
            "message": f"Saved mapping metadata is incomplete or invalid ({exc}). Existing observations were not changed.",
        }) from exc
    preview = _preview_dataset(report, payload)
    if preview.ambiguities:
        raise HTTPException(status_code=409, detail={
            "code": "DATASET_REVALIDATION_NEEDS_MAPPING",
            "message": "The saved CSV has ambiguous matches. Existing observations were not changed; review the mappings in a new import preview.",
            "entity_mappings_required": preview.ambiguities,
        })
    observations = [item.model_dump(mode="json") for item in preview.observations]
    for item in observations:
        item["provenance_id"] = dataset.id
        item["import_status"] = "imported"
    dataset.observations_json = observations
    dataset.entity_mappings_json = payload.entity_mappings
    dataset.compatibility_status = preview.compatibility_status
    dataset.validation_reasons_json = preview.validation_reasons
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    session.refresh(dataset)
    return _dataset_read(dataset, report=report)


@router.get("/{report_id}/quantitative-datasets", response_model=Page[QuantitativeDatasetRead])
def list_quantitative_datasets(
    report_id: str,
    session: SessionDependency,
    cursor: str | None = None,
    limit: LIMIT = 20,
) -> Page[QuantitativeDatasetRead]:
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})
    query = select(QuantitativeDataset).where(QuantitativeDataset.report_id == report_id).order_by(
        QuantitativeDataset.created_at.desc(), QuantitativeDataset.id.desc()
    )
    if cursor:
        cursor_dataset = session.get(QuantitativeDataset, cursor)
        if cursor_dataset is None or cursor_dataset.report_id != report_id:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR", "message": "Dataset cursor was not found for this report."})
        query = query.where(
            or_(
                QuantitativeDataset.created_at < cursor_dataset.created_at,
                and_(QuantitativeDataset.created_at == cursor_dataset.created_at, QuantitativeDataset.id < cursor_dataset.id),
            )
        )
    rows = list(session.scalars(query.limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return Page(items=[_dataset_read(item, report=report) for item in items], next_cursor=items[-1].id if has_more and items else None, limit=limit)


@router.put("/{report_id}/benchmark-selections", response_model=ImportedReportRead)
def update_benchmark_selections(
    report_id: str,
    payload: BenchmarkSelectionsUpdate,
    session: SessionDependency,
) -> ImportedReportRead:
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})
    available = _available_keys(report)
    invalid = [
        selection.model_dump()
        for selection in payload.selections
        if selection.item_key not in available[selection.item_type]
        and not any(
            item.get("item_type") == selection.item_type and item.get("item_key") == selection.item_key
            for item in (report.benchmark_selections_json or [])
        )
    ]
    if invalid:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_BENCHMARK_SELECTION", "message": "Selected research items are not present in this report.", "invalid_selections": invalid},
        )
    report.benchmark_selections_json = [selection.model_dump() for selection in payload.selections]
    session.commit()
    session.refresh(report)
    return ImportedReportRead.model_validate(_read(report).model_dump(exclude={"duplicate"}))


@router.post("/{report_id}/reprocess", response_model=ReprocessResult)
def reprocess_report(report_id: str, session: SessionDependency) -> ReprocessResult:
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})
    if report.parse_status == "PARSED":
        result = _read(report)
        return ReprocessResult.model_validate({
            **result.model_dump(exclude={"duplicate"}), "reprocessed": False,
            "message": "Structured research data was retained. Deterministic reprocess was skipped to protect it.",
        })
    data, parse_status = extract_unstructured(report.content)
    report.research_data_json = data.model_dump(mode="json")
    report.parse_status = parse_status
    report.extraction_error = None
    session.commit()
    session.refresh(report)
    result = _read(report)
    return ReprocessResult.model_validate({
        **result.model_dump(exclude={"duplicate"}), "reprocessed": True,
        "message": "Report reprocessed deterministically from its original Markdown; no AI or external service was called.",
    })


@router.put("/{report_id}/structured-data", response_model=ImportedReportRead)
def update_structured_data(report_id: str, payload: StructuredResearchDataUpdate, session: SessionDependency) -> ImportedReportRead:
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})
    try:
        normalized, normalized_status, extraction_error = normalize_report(
            report.content,
            json.dumps(payload.research_data.model_dump(mode="json")),
        )
    except ResearchInputValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_STRUCTURED_RESEARCH_DATA", "message": str(exc), "errors": exc.errors},
        ) from exc
    if normalized_status != "PARSED":
        raise HTTPException(status_code=422, detail={"code": "INVALID_STRUCTURED_RESEARCH_DATA", "message": "Structured data must reference URLs and source locations present in the original report.", "reason": extraction_error})
    report.research_data_json = normalized.model_dump(mode="json")
    report.parse_status = "PARSED"
    report.extraction_error = None
    session.commit()
    session.refresh(report)
    return ImportedReportRead.model_validate(_read(report).model_dump(exclude={"duplicate"}))


@router.put("/{report_id}/structure-from-response", response_model=ImportedReportRead)
def structure_from_response(report_id: str, payload: ReportStructuringUpdate, session: SessionDependency) -> ImportedReportRead:
    """Apply a single ChatGPT transformation response without changing source text or PO data."""
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})
    try:
        normalized, normalized_status, _ = normalize_report(payload.response, None)
    except ResearchInputValidationError as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_RESEARCH_INPUT", "message": str(exc), "errors": exc.errors}) from exc
    if normalized_status != "PARSED":
        raise HTTPException(status_code=422, detail={"code": "STRUCTURED_PAYLOAD_REQUIRED", "message": "Paste the complete ChatGPT response containing a valid po_research_v1 payload."})

    original_sources, _ = extract_unstructured(report.content)
    allowed_urls = {source.url for source in original_sources.evidence_references}
    allowed_urls.update(source.get("url") for source in (report.research_data_json or {}).get("evidence_references", []) if source.get("url"))
    supplied_urls = {source.url for source in normalized.evidence_references}
    if missing := supplied_urls - allowed_urls:
        raise HTTPException(status_code=422, detail={
            "code": "STRUCTURED_REFERENCE_NOT_IN_ORIGINAL",
            "message": "Structured response includes source URLs that are not present in the saved original report.",
            "errors": [{"location": ["body", "response", "research_data", "evidence_references"], "message": "Remove unsupported URLs or preserve only references from the saved report: " + ", ".join(sorted(missing)), "type": "reference_not_in_original"}],
        })

    # Rebind source locations to the saved original, never to the generated
    # transformation response. All other PO-owned and immutable fields stay put.
    original_locations = {source.url: source.source_location for source in original_sources.evidence_references}
    normalized.evidence_references = [source.model_copy(update={"source_location": original_locations.get(source.url)}) for source in normalized.evidence_references]
    report.research_data_json = normalized.model_dump(mode="json")
    report.parse_status = "PARSED"
    report.extraction_error = None
    session.commit()
    session.refresh(report)
    return ImportedReportRead.model_validate(_read(report).model_dump(exclude={"duplicate"}))


@router.put("/{report_id}/benchmark-workspace", response_model=ImportedReportRead)
def update_benchmark_workspace(report_id: str, payload: BenchmarkWorkspaceUpdate, session: SessionDependency) -> ImportedReportRead:
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})
    available = _available_keys(report)
    invalid = [item.model_dump() for item in payload.entries if item.item_key not in available[item.item_type]]
    if invalid:
        raise HTTPException(status_code=422, detail={"code": "INVALID_BENCHMARK_ITEM", "message": "Benchmark entries must reference an item in this report.", "invalid_items": invalid})
    report.benchmark_workspace_json = payload.model_dump(mode="json")
    session.commit()
    session.refresh(report)
    return ImportedReportRead.model_validate(_read(report).model_dump(exclude={"duplicate"}))


@router.put("/{report_id}/benchmark-state", response_model=ImportedReportRead)
def update_benchmark_state(report_id: str, payload: BenchmarkStateUpdate, session: SessionDependency) -> ImportedReportRead:
    """Atomically persist benchmark membership and its PO-owned workspace."""
    report = session.get(ImportedResearchReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND", "message": "Imported report was not found."})

    available = _available_keys(report)
    previous_selections = report.benchmark_selections_json or []
    previous_entries = (report.benchmark_workspace_json or {}).get("entries", [])
    research_data = report.research_data_json or {}
    findings = {item["key"]: item for item in research_data.get("findings", [])}
    dimensions = {item["key"]: item for item in research_data.get("benchmark_dimensions", [])}
    invalid_selections = [
        selection.model_dump()
        for selection in payload.selections
        if selection.item_key not in available[selection.item_type]
        and not any(item.get("item_type") == selection.item_type and item.get("item_key") == selection.item_key for item in previous_selections)
    ]
    invalid_entries = [
        entry.model_dump()
        for entry in payload.entries
        if entry.item_key not in available[entry.item_type]
        and not any(item.get("item_type") == entry.item_type and item.get("item_key") == entry.item_key for item in previous_entries)
    ]
    invalid_observation_links = []
    for entry in payload.entries:
        previous_entry = next((
            previous for previous in previous_entries
            if previous.get("item_type") == entry.item_type and previous.get("item_key") == entry.item_key
        ), None)
        for dimension_key, finding_keys in entry.observation_finding_links.items():
            dimension = dimensions.get(dimension_key)
            has_observation = bool(
                entry.item_type == "entity"
                and dimension
                and any(
                    observation.get("entity_key") == entry.item_key
                    and observation.get("value") not in (None, "")
                    for observation in dimension.get("observations", [])
                )
            )
            for finding_key in finding_keys:
                finding = findings.get(finding_key)
                previously_confirmed = finding_key in (
                    (previous_entry or {}).get("observation_finding_links", {}).get(dimension_key, [])
                )
                valid = has_observation and bool(finding and entry.item_key in finding.get("related_entities", []))
                if not valid and not previously_confirmed:
                    invalid_observation_links.append({
                        "item_type": entry.item_type,
                        "item_key": entry.item_key,
                        "dimension_key": dimension_key,
                        "finding_key": finding_key,
                    })
    if invalid_selections or invalid_entries or invalid_observation_links:
        raise HTTPException(status_code=422, detail={
            "code": "INVALID_BENCHMARK_STATE",
            "message": "Benchmark selections, notes, and confirmed observation links must reference report items. Existing orphan references may be retained unchanged.",
            "invalid_selections": invalid_selections,
            "invalid_entries": invalid_entries,
            "invalid_observation_links": invalid_observation_links,
        })

    report.benchmark_selections_json = [selection.model_dump() for selection in payload.selections]
    report.benchmark_workspace_json = payload.model_dump(mode="json", exclude={"selections"})
    session.commit()
    session.refresh(report)
    return ImportedReportRead.model_validate(_read(report).model_dump(exclude={"duplicate"}))
