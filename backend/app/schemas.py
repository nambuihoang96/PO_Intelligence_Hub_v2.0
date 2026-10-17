from datetime import date, datetime
from enum import StrEnum
import re
from typing import Any, Generic, TypeVar
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ResearchProjectCreate(APIModel):
    name: str = Field(min_length=1, max_length=200)
    owner: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=120)

    @field_validator("name", "owner", "category")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        if not value:
            raise ValueError("name must not be blank")
        return value


class ResearchProjectUpdate(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    owner: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def validate_update(self) -> "ResearchProjectUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "name" in self.model_fields_set and (self.name is None or not self.name.strip()):
            raise ValueError("name must not be blank or null")
        if self.name is not None:
            self.name = self.name.strip()
        if self.owner is not None:
            self.owner = self.owner.strip()
        if self.category is not None:
            self.category = self.category.strip()
        return self


class ResearchProjectRead(APIModel):
    id: str
    name: str
    owner: str | None
    category: str | None
    created_at: datetime
    updated_at: datetime


class ResearchPlanCreate(APIModel):
    question: str = Field(min_length=1, max_length=5000)
    geos: list[str] = Field(default_factory=list, max_length=100)
    platforms: list[str] = Field(default_factory=list, max_length=20)
    period_start: date | None = None
    period_end: date | None = None
    comparison_period_start: date | None = None
    comparison_period_end: date | None = None
    goals: list[str] = Field(default_factory=list, max_length=100)
    keywords: list[str] = Field(default_factory=list, max_length=500)
    source_policy: dict[str, Any] = Field(default_factory=dict)

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("question must not be blank")
        return value

    @field_validator("geos", "platforms", "goals", "keywords")
    @classmethod
    def clean_string_lists(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value for value in cleaned):
            raise ValueError("list entries must not be blank")
        return cleaned

    @model_validator(mode="after")
    def validate_periods(self) -> "ResearchPlanCreate":
        self._validate_pair("period_start", "period_end")
        self._validate_pair("comparison_period_start", "comparison_period_end")
        if self.period_start and self.comparison_period_end and self.comparison_period_end >= self.period_start:
            raise ValueError("comparison period must end before the primary period starts")
        return self

    def _validate_pair(self, start_key: str, end_key: str) -> None:
        start = getattr(self, start_key)
        end = getattr(self, end_key)
        if (start is None) != (end is None):
            raise ValueError(f"{start_key} and {end_key} must be provided together")
        if start is not None and end is not None and start > end:
            raise ValueError(f"{start_key} must be on or before {end_key}")


class ResearchPlanRead(APIModel):
    id: str
    project_id: str
    version: int
    question: str
    geos: list[str]
    platforms: list[str]
    period_start: date | None
    period_end: date | None
    comparison_period_start: date | None
    comparison_period_end: date | None
    goals: list[str]
    keywords: list[str]
    source_policy: dict[str, Any]
    created_at: datetime


class ResearchRunCreate(APIModel):
    plan_version: int = Field(ge=1)


class ResearchRunState(StrEnum):
    QUEUED = "queued"
    COLLECTING = "collecting"
    VALIDATING = "validating"
    SYNTHESIZING = "synthesizing"
    COMPLETED = "completed"
    COMPLETED_WITH_GAPS = "completed_with_gaps"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ResearchRunStateUpdate(APIModel):
    state: ResearchRunState


class ResearchRunRead(APIModel):
    id: str
    project_id: str
    plan_id: str
    plan_version: int
    state: ResearchRunState
    started_at: datetime | None
    finished_at: datetime | None
    coverage_summary: dict[str, Any]
    created_at: datetime


class ResearchRunManifestRead(APIModel):
    run_id: str
    version: int
    content: dict[str, Any]
    checksum_sha256: str
    created_at: datetime


class SourceLicenseStatus(StrEnum):
    UNKNOWN = "unknown"
    MANUAL_ONLY = "manual_only"
    APPROVED = "approved"
    BLOCKED = "blocked"
    REVIEW_REQUIRED = "review_required"


class SourceRegistryCreate(APIModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    source_type: str = Field(min_length=1, max_length=80)
    url_domain: str | None = Field(default=None, max_length=253)
    license_status: SourceLicenseStatus = SourceLicenseStatus.UNKNOWN
    collection_mode: str = Field(default="manual", pattern="^manual$")

    @field_validator("name", "source_type")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("value must not be blank")
        return value

    @field_validator("url_domain")
    @classmethod
    def validate_domain(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip().lower().rstrip(".")
        if "://" in value or any(char in value for char in "/?#@"):
            raise ValueError("url_domain must be a hostname without scheme or path")
        try:
            parsed = urlsplit(f"//{value}")
            hostname = parsed.hostname
            port = parsed.port
        except ValueError as exc:
            raise ValueError("url_domain must be a valid hostname") from exc
        if not hostname or port is not None or not re.fullmatch(
            r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?",
            hostname,
        ):
            raise ValueError("url_domain must be a valid hostname")
        return hostname


class SourceRegistryUpdate(APIModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    source_type: str | None = Field(default=None, min_length=1, max_length=80)
    url_domain: str | None = Field(default=None, max_length=253)
    license_status: SourceLicenseStatus | None = None
    collection_mode: str | None = Field(default=None, pattern="^manual$")

    @model_validator(mode="after")
    def validate_update(self) -> "SourceRegistryUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        for field_name in ("license_status", "collection_mode"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} must not be null")
        for field_name in ("name", "source_type"):
            value = getattr(self, field_name)
            if field_name in self.model_fields_set and (value is None or not value.strip()):
                raise ValueError(f"{field_name} must not be blank or null")
            if value is not None:
                object.__setattr__(self, field_name, value.strip())
        return self

    @field_validator("url_domain")
    @classmethod
    def validate_domain(cls, value: str | None) -> str | None:
        return SourceRegistryCreate.validate_domain(value)


class SourceRegistryRead(APIModel):
    id: str
    name: str
    source_type: str
    url_domain: str | None
    license_status: SourceLicenseStatus
    collection_mode: str
    rate_limit: int | None
    enabled: bool
    created_at: datetime


class ManualEvidenceCreate(APIModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    source_registry_id: str | None = Field(default=None, min_length=1, max_length=36)
    source_name: str | None = Field(default=None, max_length=200)
    source_type: str | None = Field(default=None, max_length=80)
    source_url: str = Field(min_length=1, max_length=2048)
    title: str | None = Field(default=None, max_length=1000)
    published_at: datetime | None = None
    excerpt_or_ref: str = Field(min_length=1, max_length=10000)
    scope: dict[str, Any] = Field(default_factory=dict)

    @field_validator("source_name", "source_type", "title")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("source_url")
    @classmethod
    def validate_http_url(cls, value: str) -> str:
        value = value.strip()
        if len(value) > 2048 or any(char.isspace() or ord(char) < 0x20 for char in value):
            raise ValueError("source_url must be a valid HTTP or HTTPS URL")
        try:
            parsed = urlsplit(value)
            hostname = parsed.hostname
            parsed.port
        except ValueError as exc:
            raise ValueError("source_url contains an invalid port") from exc
        if parsed.scheme.lower() not in {"http", "https"} or not hostname or parsed.username or parsed.password:
            raise ValueError("source_url must be a valid HTTP or HTTPS URL without embedded credentials")
        return value

    @field_validator("excerpt_or_ref")
    @classmethod
    def clean_excerpt(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("notes or excerpt must not be blank")
        return value

    @model_validator(mode="after")
    def require_source_details_without_registry(self) -> "ManualEvidenceCreate":
        if self.source_registry_id is None and (not self.source_name or not self.source_type):
            raise ValueError("source_name and source_type are required when no registry source is selected")
        return self


class SourceRecordRead(APIModel):
    id: str
    run_id: str
    source_registry_id: str | None
    source_name: str
    source_type: str
    collection_mode: str
    source_url: str | None
    title: str | None
    retrieved_at: datetime
    published_at: datetime | None
    content_sha256: str | None
    scope: dict[str, Any]


class EvidenceRead(APIModel):
    id: str
    run_id: str
    source_record_id: str
    excerpt_or_ref: str
    method: str
    quality: str
    status: str
    scope: dict[str, Any]
    observed_at: datetime | None
    created_at: datetime


class ManualEvidenceRead(APIModel):
    source: SourceRecordRead
    evidence: EvidenceRead


T = TypeVar("T")


class Page(APIModel, Generic[T]):
    items: list[T]
    next_cursor: str | None
    limit: int


class ErrorDetail(APIModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    retryable: bool = False


class ErrorEnvelope(APIModel):
    error: ErrorDetail
