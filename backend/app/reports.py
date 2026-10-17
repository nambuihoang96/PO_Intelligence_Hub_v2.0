import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import ImportedResearchReport
from backend.app.research_data import normalize_report
from backend.app.schemas import (
    BenchmarkSelectionsUpdate,
    ImportedReportCreate,
    ImportedReportCreated,
    ImportedReportRead,
    ImportedReportSummary,
    Page,
)


router = APIRouter(prefix="/api/v1/reports", tags=["imported reports"])
SessionDependency = Annotated[Session, Depends(get_session)]
LIMIT = Annotated[int, Query(ge=1, le=100, description="Maximum reports per page")]


def _read(report: ImportedResearchReport, *, duplicate: bool = False) -> ImportedReportCreated:
    data = ImportedReportSummary.model_validate(report).model_dump()
    data.update(
        content=report.content,
        parse_status=report.parse_status,
        research_data=report.research_data_json,
        extraction_error=report.extraction_error,
        benchmark_selections=report.benchmark_selections_json,
        duplicate=duplicate,
    )
    return ImportedReportCreated.model_validate(data)


@router.post("", response_model=ImportedReportCreated, status_code=status.HTTP_201_CREATED, responses={422: {"description": "Invalid report input"}})
def import_report(payload: ImportedReportCreate, response: Response, session: SessionDependency) -> ImportedReportCreated:
    digest = hashlib.sha256(payload.content.encode("utf-8")).hexdigest()
    research_data, parse_status, extraction_error = normalize_report(payload.content, payload.structured_json)
    existing = session.scalar(select(ImportedResearchReport).where(ImportedResearchReport.content_sha256 == digest))
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return _read(existing, duplicate=True)

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
    available = {
        "entity": {item["key"] for item in report.research_data_json.get("entities", [])},
        "finding": {item["key"] for item in report.research_data_json.get("findings", [])},
        "dimension": {item["key"] for item in report.research_data_json.get("benchmark_dimensions", [])},
    }
    invalid = [
        selection.model_dump()
        for selection in payload.selections
        if selection.item_key not in available[selection.item_type]
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
