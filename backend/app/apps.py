from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from backend.app.api import LIMIT, SessionDependency
from backend.app.models import AppStoreListing
from backend.app.schemas import AppListingCreate, AppListingRead, AppPlatform, ErrorEnvelope, Page


router = APIRouter(prefix="/api/v1/apps", tags=["apps"])


@router.post(
    "",
    response_model=AppListingRead,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}},
)
def create_app_listing(payload: AppListingCreate, session: SessionDependency) -> AppStoreListing:
    listing = AppStoreListing(**payload.model_dump())
    session.add(listing)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail={"code": "APP_LISTING_EXISTS", "message": "This platform, country, and store app ID already exists."},
        ) from exc
    session.refresh(listing)
    return listing


@router.get("", response_model=Page[AppListingRead], responses={422: {"model": ErrorEnvelope}})
def list_app_listings(
    session: SessionDependency,
    cursor: str | None = None,
    limit: LIMIT = 50,
    platform: AppPlatform | None = None,
    geo: Annotated[str | None, Query(min_length=2, max_length=2, pattern="^[A-Za-z]{2}$")] = None,
    keyword: Annotated[str | None, Query(max_length=200)] = None,
) -> Page[AppListingRead]:
    if cursor is not None:
        try:
            UUID(cursor)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail={"code": "INVALID_CURSOR", "message": "App listing cursor must be a listing ID."},
            ) from exc

    query = select(AppStoreListing).order_by(AppStoreListing.id)
    if cursor is not None:
        query = query.where(AppStoreListing.id > cursor)
    if platform is not None:
        query = query.where(AppStoreListing.platform == platform.value)
    if geo is not None:
        query = query.where(AppStoreListing.country == geo.upper())
    cleaned_keyword = keyword.strip() if keyword else ""
    if cleaned_keyword:
        pattern = f"%{cleaned_keyword}%"
        query = query.where(
            or_(
                AppStoreListing.title.ilike(pattern),
                AppStoreListing.developer.ilike(pattern),
                AppStoreListing.store_app_id.ilike(pattern),
            )
        )

    rows = list(session.scalars(query.limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return Page(items=items, next_cursor=items[-1].id if has_more and items else None, limit=limit)


@router.get("/{listing_id}", response_model=AppListingRead, responses={404: {"model": ErrorEnvelope}})
def get_app_listing(listing_id: str, session: SessionDependency) -> AppStoreListing:
    listing = session.get(AppStoreListing, listing_id)
    if listing is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "APP_LISTING_NOT_FOUND", "message": "Store listing was not found."},
        )
    return listing
