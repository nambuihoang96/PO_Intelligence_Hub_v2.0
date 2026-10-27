"""Project-scoped, original information capture. No extraction or verification is implied."""
from __future__ import annotations

import base64
import binascii
import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import ProjectSavedInformation, ResearchBenchmarkCollection, ResearchProject, ResearchSubject
from backend.app.schemas import (ProjectSavedInformationContextUpdate, ProjectSavedInformationCreate,
                                 ProjectSavedInformationPage, ProjectSavedInformationRead)


router = APIRouter(prefix="/api/v1/projects/{project_id}/saved-information", tags=["project information"])
SessionDependency = Annotated[Session, Depends(get_session)]
LIMIT = Annotated[int, Query(ge=1, le=100)]
IMAGE_SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}


def _project_or_404(session: Session, project_id: str) -> None:
    if session.get(ResearchProject, project_id) is None:
        raise HTTPException(status_code=404, detail={"code": "PROJECT_NOT_FOUND", "message": "Research project was not found."})


def _read(session: Session, row: ProjectSavedInformation) -> ProjectSavedInformationRead:
    subject = session.get(ResearchSubject, row.subject_id) if row.subject_id else None
    collection = session.get(ResearchBenchmarkCollection, row.collection_id) if row.collection_id else None
    return ProjectSavedInformationRead(
        id=row.id, project_id=row.project_id, subject_id=row.subject_id,
        subject_name=subject.name if subject else None, collection_id=row.collection_id,
        collection_name=collection.name if collection else None, original_content=row.original_content,
        source_context=row.source_context, source_title=row.source_title, source_url=row.source_url,
        captured_on=row.captured_on, image_filename=row.image_filename,
        image_content_type=row.image_content_type, image_size=row.image_size,
        image_sha256=row.image_sha256,
        image_url=f"/api/v1/projects/{row.project_id}/saved-information/{row.id}/image" if row.image_content else None,
        source_status="source_reported_unverified", created_at=row.created_at,
    )


@router.get("", response_model=ProjectSavedInformationPage)
def list_saved_information(
    project_id: str,
    session: SessionDependency,
    cursor: str | None = None,
    limit: LIMIT = 20,
):
    _project_or_404(session, project_id)
    try:
        offset = int(cursor) if cursor is not None else 0
        if offset < 0:
            raise ValueError
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR", "message": "Cursor must be a non-negative integer."}) from exc
    rows = list(session.scalars(select(ProjectSavedInformation).where(
        ProjectSavedInformation.project_id == project_id,
    ).order_by(ProjectSavedInformation.created_at.desc(), ProjectSavedInformation.id).offset(offset).limit(limit + 1)))
    has_more = len(rows) > limit
    return ProjectSavedInformationPage(items=[_read(session, row) for row in rows[:limit]],
                                       next_cursor=str(offset + limit) if has_more else None, limit=limit)


@router.post("", response_model=ProjectSavedInformationRead, status_code=201)
def create_saved_information(project_id: str, payload: ProjectSavedInformationCreate, session: SessionDependency):
    _project_or_404(session, project_id)
    subject = None
    collection = None
    if payload.subject_id:
        subject = session.scalar(select(ResearchSubject).where(
            ResearchSubject.project_id == project_id, ResearchSubject.id == payload.subject_id,
        ))
        if subject is None:
            raise HTTPException(status_code=404, detail={"code": "SUBJECT_NOT_FOUND", "message": "Choose a product or topic from this project."})
    if payload.collection_id:
        collection = session.scalar(select(ResearchBenchmarkCollection).where(
            ResearchBenchmarkCollection.project_id == project_id, ResearchBenchmarkCollection.id == payload.collection_id,
        ))
        if collection is None:
            raise HTTPException(status_code=404, detail={"code": "COLLECTION_NOT_FOUND", "message": "Choose a comparison group from this project."})

    image_bytes = None
    image_hash = None
    image_type = payload.image_content_type
    if payload.image_base64:
        try:
            image_bytes = base64.b64decode(payload.image_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE", "message": "The image attachment could not be read. Choose a JPG, PNG, or WebP image."}) from exc
        if not image_bytes or len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_SIZE", "message": "Image attachments must be smaller than 10 MB."})
        signature_matches = any(image_bytes.startswith(signature) for signature in IMAGE_SIGNATURES.get(image_type or "", ()))
        if not signature_matches or (image_type == "image/webp" and image_bytes[8:12] != b"WEBP"):
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_TYPE", "message": "The file content does not match its selected JPG, PNG, or WebP type."})
        image_hash = hashlib.sha256(image_bytes).hexdigest()

    row = ProjectSavedInformation(
        project_id=project_id, subject_id=subject.id if subject else None,
        collection_id=collection.id if collection else None, original_content=payload.original_content,
        source_context=payload.source_context or None, source_title=payload.source_title or None,
        source_url=payload.source_url or None, captured_on=payload.captured_on,
        image_filename=payload.image_filename if image_bytes else None,
        image_content_type=image_type if image_bytes else None,
        image_size=len(image_bytes) if image_bytes else None,
        image_sha256=image_hash, image_content=image_bytes,
        source_status="source_reported_unverified",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _read(session, row)


@router.get("/{information_id}/image")
def get_saved_information_image(project_id: str, information_id: str, session: SessionDependency):
    row = session.scalar(select(ProjectSavedInformation).where(
        ProjectSavedInformation.project_id == project_id, ProjectSavedInformation.id == information_id,
    ))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "INFORMATION_NOT_FOUND", "message": "Saved information was not found."})
    if not row.image_content or not row.image_content_type:
        raise HTTPException(status_code=404, detail={"code": "IMAGE_NOT_FOUND", "message": "This saved item has no image attachment."})
    return Response(content=row.image_content, media_type=row.image_content_type,
                    headers={"Content-Disposition": "inline; filename=attached-image", "X-Content-Type-Options": "nosniff"})


@router.patch("/{information_id}/context", response_model=ProjectSavedInformationRead)
def update_saved_information_context(project_id: str, information_id: str,
                                     payload: ProjectSavedInformationContextUpdate, session: SessionDependency):
    row = session.scalar(select(ProjectSavedInformation).where(
        ProjectSavedInformation.project_id == project_id, ProjectSavedInformation.id == information_id,
    ))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "INFORMATION_NOT_FOUND", "message": "Saved information was not found."})
    if payload.subject_id:
        subject = session.scalar(select(ResearchSubject).where(
            ResearchSubject.project_id == project_id, ResearchSubject.id == payload.subject_id,
        ))
        if subject is None:
            raise HTTPException(status_code=404, detail={"code": "SUBJECT_NOT_FOUND", "message": "Choose a product or topic from this project."})
    if payload.collection_id:
        collection = session.scalar(select(ResearchBenchmarkCollection).where(
            ResearchBenchmarkCollection.project_id == project_id, ResearchBenchmarkCollection.id == payload.collection_id,
        ))
        if collection is None:
            raise HTTPException(status_code=404, detail={"code": "COLLECTION_NOT_FOUND", "message": "Choose a comparison group from this project."})
    row.subject_id = payload.subject_id
    row.collection_id = payload.collection_id
    session.commit()
    session.refresh(row)
    return _read(session, row)
