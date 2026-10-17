from datetime import date, datetime
from enum import StrEnum
from typing import Any, Generic, TypeVar

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
