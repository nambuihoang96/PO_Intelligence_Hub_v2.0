import hashlib
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import ImportedResearchReport
from backend.app.research_data import ResearchInputValidationError, extract_unstructured, normalize_report
from backend.app.schemas import (
    BenchmarkSelectionsUpdate,
    BenchmarkWorkspaceRead,
    BenchmarkWorkspaceUpdate,
    ImportedReportCreate,
    ImportedReportCreated,
    ImportedReportRead,
    ImportedReportSummary,
    Page,
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
    research = report.research_data_json or {}
    has_results = bool(research.get("findings") or research.get("entities") or research.get("benchmark_dimensions"))
    has_structure = bool(has_results or research.get("key_takeaways") or research.get("research_gaps") or research.get("po_recommendations"))
    research_status = "STRUCTURED_READY" if has_results else ("STRUCTURED_PARTIAL" if has_structure else "TEXT_ONLY")
    data.update(
        content=report.content,
        parse_status=report.parse_status,
        research_status=research_status,
        research_contract_version="po_research_v1",
        research_data=report.research_data_json,
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
