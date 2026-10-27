"""Project-scoped, append-only local image evidence. No OCR, network fetch, or AI."""
from __future__ import annotations

import hashlib
from datetime import date
from pathlib import PurePath, PureWindowsPath
from typing import Annotated
from urllib.parse import quote, urlsplit

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import ProjectImageEvidence, ProjectTrendUpdate, ResearchProject, ResearchSubject
from backend.app.schemas import ErrorEnvelope, ProjectImageEvidencePage, ProjectImageEvidenceRead


router = APIRouter(prefix="/api/v1/projects/{project_id}", tags=["image evidence"])
SessionDependency = Annotated[Session, Depends(get_session)]
LIMIT = Annotated[int, Query(ge=1, le=100)]
MAX_IMAGE_BYTES = 10 * 1024 * 1024
SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _project_subject(session: Session, project_id: str, subject_id: str) -> ResearchSubject:
    if session.get(ResearchProject, project_id) is None:
        raise _http_error(404, "PROJECT_NOT_FOUND", "Research project was not found.")
    subject = session.scalar(select(ResearchSubject).where(
        ResearchSubject.project_id == project_id, ResearchSubject.id == subject_id,
    ))
    if subject is None:
        raise _http_error(404, "SUBJECT_NOT_FOUND", "Choose a saved subject from this project.")
    return subject


def _read(session: Session, row: ProjectImageEvidence) -> ProjectImageEvidenceRead:
    subject = session.get(ResearchSubject, row.subject_id)
    return ProjectImageEvidenceRead(
        id=row.id, project_id=row.project_id, subject_id=row.subject_id,
        subject_name=subject.name if subject else "Subject unavailable",
        trend_update_id=row.trend_update_id, filename=row.filename,
        content_type=row.content_type, content_size=row.content_size,
        content_sha256=row.content_sha256, source_note=row.source_note,
        source_title=row.source_title, source_url=row.source_url,
        published_on=row.published_on, source_status="source_reported_unverified",
        content_url=f"/api/v1/projects/{row.project_id}/image-evidence/{row.id}/content",
        created_at=row.created_at,
    )


def _image_type(content: bytes) -> str | None:
    if len(content) >= 33 and content.startswith(b"\x89PNG\r\n\x1a\n") and content[12:16] == b"IHDR" and content.endswith(b"IEND\xaeB`\x82"):
        return "image/png"
    if len(content) >= 5 and content.startswith(b"\xff\xd8\xff") and content.endswith(b"\xff\xd9"):
        return "image/jpeg"
    if len(content) >= 16 and content[:4] == b"RIFF" and content[8:12] == b"WEBP" and int.from_bytes(content[4:8], "little") == len(content) - 8:
        return "image/webp"
    return None


def _safe_filename(filename: str) -> str:
    base = PureWindowsPath(filename).name
    base = PurePath(base).name
    cleaned = "".join(char for char in base if char.isprintable() and char not in "\\/\r\n\0")
    cleaned = cleaned.strip().strip(".")
    return (cleaned or "evidence-image")[:255]


def _validate_source_url(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise _http_error(422, "INVALID_SOURCE_URL", "Source link must be a public http:// or https:// URL without credentials.")
    return value.strip()


@router.get("/image-evidence", response_model=ProjectImageEvidencePage,
            responses={404: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}})
def list_image_evidence(
    project_id: str,
    session: SessionDependency,
    subject_id: str | None = None,
    cursor: str | None = None,
    limit: LIMIT = 20,
):
    if session.get(ResearchProject, project_id) is None:
        raise _http_error(404, "PROJECT_NOT_FOUND", "Research project was not found.")
    if subject_id and session.scalar(select(ResearchSubject.id).where(
        ResearchSubject.project_id == project_id, ResearchSubject.id == subject_id,
    )) is None:
        raise _http_error(404, "SUBJECT_NOT_FOUND", "Research subject was not found in this project.")
    try:
        offset = int(cursor or "0")
        if offset < 0:
            raise ValueError
    except ValueError as exc:
        raise _http_error(422, "INVALID_CURSOR", "Image evidence cursor must be a non-negative integer.") from exc
    query = select(ProjectImageEvidence).where(ProjectImageEvidence.project_id == project_id)
    if subject_id:
        query = query.where(ProjectImageEvidence.subject_id == subject_id)
    rows = list(session.scalars(query.order_by(
        ProjectImageEvidence.created_at.desc(), ProjectImageEvidence.id,
    ).offset(offset).limit(limit + 1)))
    has_more = len(rows) > limit
    return ProjectImageEvidencePage(
        items=[_read(session, row) for row in rows[:limit]],
        next_cursor=str(offset + limit) if has_more else None,
        limit=limit,
    )


@router.post("/subjects/{subject_id}/image-evidence", response_model=ProjectImageEvidenceRead,
             status_code=status.HTTP_201_CREATED,
             responses={404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope},
                        413: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}})
def create_image_evidence(
    project_id: str,
    subject_id: str,
    session: SessionDependency,
    content: Annotated[bytes, Body(media_type="application/octet-stream")],
    filename: Annotated[str, Query(min_length=1, max_length=500)],
    content_type: Annotated[str, Header(alias="Content-Type")],
    source_note: Annotated[str | None, Query(max_length=10_000)] = None,
    source_title: Annotated[str | None, Query(max_length=500)] = None,
    source_url: Annotated[str | None, Query(max_length=2048)] = None,
    published_on: date | None = None,
    trend_update_id: Annotated[str | None, Query(max_length=36)] = None,
):
    subject = _project_subject(session, project_id, subject_id)
    if trend_update_id:
        update = session.scalar(select(ProjectTrendUpdate).where(
            ProjectTrendUpdate.project_id == project_id,
            ProjectTrendUpdate.subject_id == subject.id,
            ProjectTrendUpdate.id == trend_update_id,
        ))
        if update is None:
            raise _http_error(409, "TREND_UPDATE_SCOPE_MISMATCH", "Choose a saved trend update for this subject and project.")
        note, title, url, published = update.source_note, update.source_title, update.source_url, update.published_on
    else:
        note = source_note.strip() if source_note else ""
        if not note:
            raise _http_error(422, "SOURCE_NOTE_REQUIRED", "Add a short note describing where this image came from.")
        title = source_title.strip() if source_title else None
        url = _validate_source_url(source_url)
        published = published_on
    if len(content) > MAX_IMAGE_BYTES:
        raise _http_error(413, "IMAGE_TOO_LARGE", "Choose an image smaller than 10 MB.")
    if not content:
        raise _http_error(422, "EMPTY_IMAGE", "Choose an image file before saving.")
    declared_type = content_type.split(";", 1)[0].strip().lower()
    if declared_type not in SUPPORTED_IMAGE_TYPES:
        raise _http_error(415, "UNSUPPORTED_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.")
    actual_type = _image_type(content)
    if actual_type != declared_type:
        raise _http_error(415, "IMAGE_TYPE_MISMATCH", "The selected file content does not match its image type.")
    safe_name = _safe_filename(filename)
    digest = hashlib.sha256(content).hexdigest()
    row = ProjectImageEvidence(
        project_id=project_id, subject_id=subject.id, trend_update_id=trend_update_id,
        filename=safe_name, content_type=actual_type, content_size=len(content),
        content_sha256=digest, content=content, source_note=note,
        source_title=title, source_url=url, published_on=published,
        source_status="source_reported_unverified",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _read(session, row)


@router.get("/image-evidence/{evidence_id}/content", responses={404: {"model": ErrorEnvelope}})
def get_image_evidence_content(project_id: str, evidence_id: str, session: SessionDependency):
    row = session.scalar(select(ProjectImageEvidence).where(
        ProjectImageEvidence.project_id == project_id,
        ProjectImageEvidence.id == evidence_id,
    ))
    if row is None:
        raise _http_error(404, "IMAGE_EVIDENCE_NOT_FOUND", "Image evidence was not found in this project.")
    disposition = f"inline; filename*=UTF-8''{quote(row.filename)}"
    return Response(
        content=row.content, media_type=row.content_type,
        headers={"Content-Disposition": disposition, "X-Content-Type-Options": "nosniff",
                 "Cache-Control": "private, max-age=3600"},
    )
