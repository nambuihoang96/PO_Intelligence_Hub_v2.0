import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import ImportedResearchReport
from backend.app.schemas import ImportedReportCreate, ImportedReportCreated, ImportedReportRead, ImportedReportSummary, Page


router = APIRouter(prefix="/api/v1/reports", tags=["imported reports"])
SessionDependency = Annotated[Session, Depends(get_session)]
LIMIT = Annotated[int, Query(ge=1, le=100, description="Maximum reports per page")]


def _read(report: ImportedResearchReport, *, duplicate: bool = False) -> ImportedReportCreated:
    result = ImportedReportCreated.model_validate(report)
    result.duplicate = duplicate
    return result


@router.post("", response_model=ImportedReportCreated, status_code=status.HTTP_201_CREATED, responses={422: {"description": "Invalid report input"}})
def import_report(payload: ImportedReportCreate, response: Response, session: SessionDependency) -> ImportedReportCreated:
    digest = hashlib.sha256(payload.content.encode("utf-8")).hexdigest()
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
    return ImportedReportRead.model_validate(report)
