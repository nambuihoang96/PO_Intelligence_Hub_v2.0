from datetime import date, datetime
from enum import StrEnum
import re
from typing import Any, Generic, Literal, TypeVar
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.app.research_data import QuantitativeObservation, UniversalResearchData


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
    workspace_state_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class ResearchSubjectCreate(APIModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=500)
    subject_type: str | None = Field(default=None, max_length=120)
    aliases: list[str] = Field(default_factory=list, max_length=100)
    external_ids: list[dict[str, str]] = Field(default_factory=list, max_length=100)
    provenance: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name", "subject_type")
    @classmethod
    def clean_subject_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("name")
    @classmethod
    def subject_name_not_blank(cls, value: str) -> str:
        if not value:
            raise ValueError("name must not be blank")
        return value

    @field_validator("aliases")
    @classmethod
    def clean_aliases(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value for value in cleaned):
            raise ValueError("aliases must not contain blank values")
        return list(dict.fromkeys(cleaned))


class ResearchSubjectUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=500)
    subject_type: str | None = Field(default=None, max_length=120)
    aliases: list[str] | None = Field(default=None, max_length=100)
    external_ids: list[dict[str, str]] | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def require_change(self) -> "ResearchSubjectUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if self.name is not None:
            self.name = self.name.strip()
            if not self.name:
                raise ValueError("name must not be blank")
        if self.subject_type is not None:
            self.subject_type = self.subject_type.strip() or None
        if self.aliases is not None:
            self.aliases = list(dict.fromkeys(value.strip() for value in self.aliases))
            if any(not value for value in self.aliases):
                raise ValueError("aliases must not contain blank values")
        return self


class ResearchSubjectRead(APIModel):
    id: str
    project_id: str
    name: str
    subject_type: str | None
    aliases: list[str]
    external_ids: list[dict[str, str]]
    provenance: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ResearchSubjectSourceRead(APIModel):
    project_id: str
    source_kind: Literal["report_entity", "csv_entity"]
    source_id: str
    source_key: str
    source_name: str
    source_type: str | None = None
    context_name: str
    mapped_subject_id: str | None = None
    mapped_subject_name: str | None = None
    source_state: Literal["available", "stale"] = "available"


class ResearchSubjectSourceMap(APIModel):
    model_config = ConfigDict(extra="forbid")

    source_kind: Literal["report_entity", "csv_entity"]
    source_id: str = Field(min_length=1, max_length=36)
    source_key: str = Field(min_length=1, max_length=500)
    subject_id: str | None = None
    create_subject_from_source: bool = False
    expected_subject_id: str | None = None

    @model_validator(mode="after")
    def select_one_mapping_action(self) -> "ResearchSubjectSourceMap":
        if bool(self.subject_id) == self.create_subject_from_source:
            raise ValueError("Choose one saved subject or explicitly create a subject from this source.")
        if self.expected_subject_id and self.create_subject_from_source:
            raise ValueError("A new subject cannot replace an existing source mapping implicitly.")
        return self


class ResearchWorkspaceStateUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")
    selected_app_ids: list[str] = Field(default_factory=list, max_length=500)
    selection_criterion: str | None = Field(default=None, max_length=500)
    selected_app_context: dict[str, Any] | None = None

    @field_validator("selected_app_ids")
    @classmethod
    def selected_ids_are_unique(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value]
        if any(not item or len(item) > 300 for item in cleaned) or len(cleaned) != len(set(cleaned)):
            raise ValueError("Selected app references must be non-blank, unique, and at most 300 characters.")
        return cleaned

    @field_validator("selected_app_context")
    @classmethod
    def selection_context_is_bounded(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return value
        # Workspace state stores stable references and the selection scope, never CSV contents.
        if len(str(value).encode("utf-8")) > 64_000:
            raise ValueError("Selection context must be at most 64 KB and must not contain source file contents.")
        if value.get("selection_type") not in {"manual", "rule_based", "legacy"}:
            raise ValueError("Selection context requires a supported selection_type.")
        if not isinstance(value.get("dataset_id"), str) or not value["dataset_id"].strip():
            raise ValueError("Selection context requires the source dataset_id.")
        if not isinstance(value.get("source_entity_ids", []), list) or len(value.get("source_entity_ids", [])) > 500:
            raise ValueError("Selection context supports at most 500 source entity references.")
        return value


class OpportunityEvidenceReference(APIModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["quantitative", "report_finding", "report_entity"]
    dataset_id: str | None = Field(default=None, max_length=36)
    source_entity_id: str | None = Field(default=None, max_length=240)
    source_row_number: int | None = Field(default=None, ge=2)
    metric_id: str | None = Field(default=None, max_length=160)
    report_id: str | None = Field(default=None, max_length=36)
    report_content_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    item_key: str | None = Field(default=None, max_length=120)


class OpportunityAssessment(APIModel):
    model_config = ConfigDict(extra="forbid")
    dimension: str = Field(min_length=1, max_length=120)
    kind: Literal["observed_fact", "research_finding", "hypothesis", "po_judgment", "unknown"]
    statement: str = Field(default="", max_length=4000)
    evidence_refs: list[OpportunityEvidenceReference] = Field(default_factory=list, max_length=50)

    @field_validator("dimension")
    @classmethod
    def dimension_not_blank(cls, value: str) -> str:
        return value.strip()


class OpportunityDecisionUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(default=0, ge=0)
    candidate_id: str = Field(min_length=1, max_length=100)
    dataset_id: str | None = Field(default=None, max_length=36)
    dataset_content_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    source_entity_id: str = Field(min_length=1, max_length=240)
    decision_status: Literal["investigate", "benchmark", "experiment", "implementation_candidate", "hold", "reject"] | None = None
    rationale: str = Field(default="", max_length=8000)
    supporting_evidence: list[OpportunityEvidenceReference] = Field(default_factory=list, max_length=100)
    contradictory_evidence: list[OpportunityEvidenceReference] = Field(default_factory=list, max_length=100)
    open_questions: list[str] = Field(default_factory=list, max_length=50)
    assessments: list[OpportunityAssessment] = Field(default_factory=list, max_length=30)
    priority: Literal["high", "medium", "low", "not_assessed"] = "not_assessed"
    review_date: date | None = None
    next_action: str = Field(default="", max_length=4000)

    @model_validator(mode="after")
    def unique_dimensions_and_questions(self) -> "OpportunityDecisionUpdate":
        dimensions = [item.dimension.casefold() for item in self.assessments]
        if len(dimensions) != len(set(dimensions)):
            raise ValueError("Assessment dimensions must be unique.")
        if any(not question.strip() or len(question) > 1000 for question in self.open_questions):
            raise ValueError("Open questions must be non-blank and at most 1000 characters.")
        if self.decision_status == "reject" and not self.rationale.strip():
            raise ValueError("A rejection needs a PO-written reason in rationale.")
        return self


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


class AppPlatform(StrEnum):
    IOS = "ios"
    ANDROID = "android"


class AppListingCreate(APIModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    platform: AppPlatform
    store_app_id: str = Field(min_length=1, max_length=255)
    country: str = Field(min_length=2, max_length=2)
    title: str = Field(min_length=1, max_length=300)
    developer: str = Field(min_length=1, max_length=200)
    listing_url: str | None = Field(default=None, max_length=2048)

    @field_validator("store_app_id", "title", "developer")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("value must not be blank")
        return value

    @field_validator("country")
    @classmethod
    def normalize_country(cls, value: str) -> str:
        value = value.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", value):
            raise ValueError("country must be a two-letter ISO-style code")
        return value

    @model_validator(mode="after")
    def validate_store_app_id(self) -> "AppListingCreate":
        if self.platform == AppPlatform.IOS and not re.fullmatch(r"[0-9]+", self.store_app_id):
            raise ValueError("iOS store_app_id must be a numeric Apple listing ID")
        if self.platform == AppPlatform.ANDROID and not re.fullmatch(
            r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+", self.store_app_id
        ):
            raise ValueError("Android store_app_id must be a package name")
        if self.listing_url is not None:
            value = self.listing_url.strip()
            try:
                parsed = urlsplit(value)
                parsed.port
            except ValueError as exc:
                raise ValueError("listing_url contains an invalid port") from exc
            if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("listing_url must be an HTTP or HTTPS URL without embedded credentials")
            self.listing_url = value
        return self


class AppListingRead(APIModel):
    id: str
    platform: AppPlatform
    store_app_id: str
    country: str
    title: str
    developer: str
    listing_url: str | None
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


class ImportedReportCreate(APIModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=2000)
    geo: str = Field(min_length=1, max_length=100)
    os: str = Field(min_length=1, max_length=100)
    research_period: str | None = Field(default=None, max_length=200)
    content: str = Field(min_length=1, max_length=2_000_000)
    structured_json: str | None = Field(default=None, max_length=2_000_000)
    project_id: str | None = Field(default=None, min_length=1, max_length=36)

    @field_validator("research_period")
    @classmethod
    def trim_report_metadata(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("question", "geo")
    @classmethod
    def required_metadata_not_blank(cls, value: str) -> str:
        if value is None or not value.strip():
            raise ValueError("value must not be blank")
        return value.strip()

    @field_validator("os")
    @classmethod
    def environment_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("environment must not be blank")
        return value.strip()

    @field_validator("content")
    @classmethod
    def report_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("report content must not be blank")
        return value


class ImportedReportSummary(APIModel):
    id: str
    project_id: str | None = None
    question: str
    geo: str
    os: str
    research_period: str | None
    content_sha256: str
    origin: str
    imported_at: datetime
    verification_status: str = "unverified"


class BenchmarkSelection(APIModel):
    item_type: str = Field(pattern="^(entity|finding|dimension)$")
    item_key: str = Field(min_length=1, max_length=120)


class BenchmarkSelectionsUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")
    selections: list[BenchmarkSelection] = Field(max_length=1000)

    @model_validator(mode="after")
    def unique_selections(self) -> "BenchmarkSelectionsUpdate":
        pairs = [(selection.item_type, selection.item_key) for selection in self.selections]
        if len(pairs) != len(set(pairs)):
            raise ValueError("benchmark selections must be unique")
        return self


class BenchmarkWorkspaceEntry(APIModel):
    item_type: str = Field(pattern="^(entity|finding|dimension)$")
    item_key: str = Field(min_length=1, max_length=120)
    po_assessment: str = Field(default="", max_length=4000)
    notes: str = Field(default="", max_length=8000)
    next_action: str = Field(default="", max_length=4000)
    dimension_assessments: dict[str, str] = Field(default_factory=dict, max_length=100)
    observation_finding_links: dict[str, list[str]] = Field(default_factory=dict, max_length=100)

    @field_validator("dimension_assessments")
    @classmethod
    def validate_dimension_assessments(cls, value: dict[str, str]) -> dict[str, str]:
        if any(not key.strip() or len(key) > 120 or len(item) > 4000 for key, item in value.items()):
            raise ValueError("PO dimension assessments must have non-blank keys and values up to 4000 characters")
        return value

    @field_validator("observation_finding_links")
    @classmethod
    def validate_observation_finding_links(cls, value: dict[str, list[str]]) -> dict[str, list[str]]:
        if any(
            not dimension_key.strip()
            or len(dimension_key) > 120
            or len(finding_keys) > 100
            or any(not finding_key.strip() or len(finding_key) > 120 for finding_key in finding_keys)
            or len(finding_keys) != len(set(finding_keys))
            for dimension_key, finding_keys in value.items()
        ):
            raise ValueError("confirmed observation links must use valid dimension and finding keys without duplicates")
        return value


class BenchmarkWorkspaceUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")
    custom_dimensions: list[str] = Field(default_factory=list, max_length=100)
    entries: list[BenchmarkWorkspaceEntry] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="after")
    def unique_workspace_items(self) -> "BenchmarkWorkspaceUpdate":
        pairs = [(entry.item_type, entry.item_key) for entry in self.entries]
        if len(pairs) != len(set(pairs)):
            raise ValueError("benchmark workspace entries must be unique")
        normalized = [label.strip().casefold() for label in self.custom_dimensions]
        if any(not label for label in normalized) or len(normalized) != len(set(normalized)):
            raise ValueError("custom benchmark dimensions must be non-blank and unique")
        return self


class BenchmarkWorkspaceRead(BenchmarkWorkspaceUpdate):
    pass


class BenchmarkStateUpdate(BenchmarkWorkspaceUpdate):
    """Update report selections and PO workspace in one transaction."""

    selections: list[BenchmarkSelection] = Field(max_length=1000)

    @model_validator(mode="after")
    def unique_selections(self) -> "BenchmarkStateUpdate":
        pairs = [(selection.item_type, selection.item_key) for selection in self.selections]
        if len(pairs) != len(set(pairs)):
            raise ValueError("benchmark selections must be unique")
        return self


class ImportedReportRead(ImportedReportSummary):
    content: str
    parse_status: str
    research_status: str = "TEXT_ONLY"
    research_contract_version: str = "po_research_v1"
    research_data: UniversalResearchData
    extraction_error: str | None
    benchmark_selections: list[BenchmarkSelection]
    benchmark_workspace: BenchmarkWorkspaceRead
    structured_update_available: bool = False
    orphaned_benchmark_selections: list[BenchmarkSelection] = Field(default_factory=list)
    orphaned_benchmark_entries: list[BenchmarkWorkspaceEntry] = Field(default_factory=list)


class ImportedReportCreated(ImportedReportRead):
    duplicate: bool = False


class StructuredResearchDataUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")
    research_data: UniversalResearchData


class ReportStructuringUpdate(APIModel):
    """One pasted ChatGPT response used to upgrade an existing text report."""

    model_config = ConfigDict(extra="forbid")
    response: str = Field(min_length=1, max_length=2_000_000)

    @field_validator("response")
    @classmethod
    def response_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("ChatGPT response must not be blank")
        return value


class ReprocessResult(ImportedReportRead):
    reprocessed: bool
    message: str


class QuantitativeMetricColumnMapping(APIModel):
    model_config = ConfigDict(extra="forbid")
    column: str = Field(min_length=1, max_length=256)
    metric_id: str = Field(min_length=1, max_length=160)
    metric_definition: str = Field(min_length=1, max_length=2000)
    unit: str | None = Field(default=None, max_length=80)
    methodology: str | None = Field(default=None, max_length=500)


class QuantitativeDatasetImport(APIModel):
    model_config = ConfigDict(extra="forbid")
    filename: str = Field(min_length=1, max_length=255)
    csv_content: str = Field(min_length=1, max_length=5_000_000)
    field_mapping: dict[str, str] = Field(max_length=12)
    entity_mappings: dict[str, str] = Field(default_factory=dict, max_length=1000)
    metric_mappings: list[QuantitativeMetricColumnMapping] = Field(default_factory=list, max_length=32)
    explicit_values: dict[str, str] = Field(default_factory=dict, max_length=8)

    @model_validator(mode="after")
    def validate_mapping_configuration(self) -> "QuantitativeDatasetImport":
        if len({item.column for item in self.metric_mappings}) != len(self.metric_mappings):
            raise ValueError("Each metric column can only be mapped once.")
        allowed_explicit = {"unit", "geo", "platform", "period_start", "period_end", "snapshot_date", "period_semantics", "granularity", "methodology", "source_reference"}
        unknown = set(self.explicit_values) - allowed_explicit
        if unknown:
            raise ValueError("Unsupported explicit value field(s): " + ", ".join(sorted(unknown)))
        conflicts = set(self.explicit_values) & set(self.field_mapping)
        if conflicts:
            raise ValueError("Choose a CSV column or an explicit value for: " + ", ".join(sorted(conflicts)))
        if self.metric_mappings and {"metric_id", "value"} & set(self.field_mapping):
            raise ValueError("Wide metric mappings replace the Metric identity and Exact value column mappings.")
        if not self.metric_mappings and "value" not in self.field_mapping:
            raise ValueError("Map an Exact value column, or add one or more metric columns.")
        return self

    @field_validator("filename")
    @classmethod
    def filename_is_safe(cls, value: str) -> str:
        name = value.replace("\\", "/").rsplit("/", 1)[-1].strip()
        if not name.casefold().endswith(".csv"):
            raise ValueError("dataset file must have a .csv filename")
        return name


class DatasetMetadataChange(APIModel):
    model_config = ConfigDict(extra="forbid")
    group_key: str = Field(min_length=1, max_length=64)
    field: Literal["geo", "platform", "methodology", "unit", "period_start", "period_end", "snapshot_date", "period_semantics", "granularity", "source_reference"]
    value: str | None = Field(default=None, max_length=2048)
    basis: Literal["provider_documentation", "po_unverified", "unknown"]
    source_url: str | None = Field(default=None, max_length=2048)
    source_excerpt: str = Field(default="", max_length=4000)
    attested: bool = False
    replace_existing: bool = False

    @model_validator(mode="after")
    def supported_metadata(self) -> "DatasetMetadataChange":
        if self.value is not None:
            self.value = self.value.strip() or None
        if self.basis == "unknown" and self.value is not None:
            raise ValueError("Unknown metadata must not supply a value.")
        if self.basis == "provider_documentation" and (not self.attested or not self.source_url or len(self.source_excerpt.strip()) < 10):
            raise ValueError("Documented metadata requires a source URL, supporting excerpt and explicit confirmation that the documentation supports this field.")
        for value in (self.source_url, self.value if self.field == "source_reference" else None):
            if value:
                parsed = urlsplit(value)
                if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
                    raise ValueError("Source must be an HTTP(S) URL without credentials.")
        if self.field in {"period_start", "period_end", "snapshot_date"} and self.value:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", self.value):
                raise ValueError("Use an exact YYYY-MM-DD date.")
            date.fromisoformat(self.value)
        if self.field == "period_semantics" and self.value not in {None, "unknown", "snapshot", "reporting_interval", "rolling_interval"}:
            raise ValueError("Unsupported period meaning.")
        limits = {"geo": 100, "platform": 100, "methodology": 500, "unit": 80, "granularity": 40}
        if self.value and len(self.value) > limits.get(self.field, 2048):
            raise ValueError("Metadata value is too long.")
        return self


class DatasetMetadataUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    changes: list[DatasetMetadataChange] = Field(min_length=1, max_length=100)


class DatasetMetadataRead(APIModel):
    dataset_id: str
    report_id: str | None = None
    project_id: str | None = None
    filename: str
    content_sha256: str
    revision: int
    groups: list[dict[str, Any]]
    history: list[dict[str, Any]]


class QuantitativeDatasetRead(APIModel):
    id: str
    report_id: str | None = None
    project_id: str | None = None
    filename: str
    content_sha256: str
    field_mapping: dict[str, Any]
    metric_mappings: list[QuantitativeMetricColumnMapping] = Field(default_factory=list)
    explicit_values: dict[str, str] = Field(default_factory=dict)
    delimiter: str = ","
    entity_mappings: dict[str, str]
    observations: list[QuantitativeObservation]
    compatibility_status: Literal["compatible", "partial", "incompatible"]
    validation_reasons: list[str]
    created_at: datetime
    duplicate: bool = False
    imported_successfully: bool = True
    complete_observations: int = 0
    scope_compatible_observations: int = 0
    comparison_ready_observations: int = 0
    comparison_readiness: Literal["no_complete_observations", "needs_compatible_pair"] = "no_complete_observations"
    source_rows: int = 0
    source_apps: int = 0
    recognized_metrics: int = 0
    display_ready_observations: int = 0
    analysis_ready_observations: int = 0
    dataset_comparison_ready_observations: int = 0
    report_compatible_observations: int = 0
    incomplete_observations: int = 0


class QuantitativeDatasetPreview(APIModel):
    observations: list[QuantitativeObservation]
    validation_reasons: list[str]
    ambiguities: list[dict[str, Any]]
    unmatched_entities: list[dict[str, Any]] = Field(default_factory=list)
    compatibility_status: Literal["compatible", "partial", "incompatible"]
    total_rows: int
    complete_observations: int
    scope_compatible_observations: int
    comparison_ready_observations: int
    duplicate_rows: int = 0
    source_apps: int = 0
    source_only_entities: int = 0
    matched_entities: int = 0
    dataset_analysis_ready_observations: int = 0
    dataset_comparison_ready_observations: int = 0
    report_compatible_observations: int = 0


class QuantitativeDatasetPage(APIModel):
    items: list[QuantitativeDatasetRead]
    next_cursor: str | None = None
    limit: int


class QuantitativeComparisonMetric(APIModel):
    key: str
    metric_id: str | None
    metric_definition: str | None
    unit: str | None
    methodology: str | None
    observations: int
    usable_observations: int
    warnings: list[str] = Field(default_factory=list)


class QuantitativeComparisonPeriod(APIModel):
    key: str
    semantics: Literal["reporting_interval", "rolling_interval", "snapshot", "unknown"]
    period_start: str | None = None
    period_end: str | None = None
    snapshot_date: str | None = None
    snapshot_date_candidate: str | None = None
    granularity: str | None = None
    observations: int
    usable_observations: int
    metric_keys: list[str] = Field(default_factory=list)
    geos: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class QuantitativeDatasetCatalogItem(APIModel):
    id: str
    report_id: str | None = None
    project_id: str | None = None
    report_question: str | None = None
    filename: str
    content_sha256: str
    created_at: datetime
    compatibility_status: Literal["compatible", "partial", "incompatible"]
    metrics: list[QuantitativeComparisonMetric]
    periods: list[QuantitativeComparisonPeriod]
    geo_values: list[str] = Field(default_factory=list)
    platform_values: list[str] = Field(default_factory=list)
    source_apps: int
    warnings: list[str] = Field(default_factory=list)


class QuantitativeDatasetCatalogPage(APIModel):
    items: list[QuantitativeDatasetCatalogItem]
    next_cursor: str | None = None
    limit: int


class QuantitativeComparisonPreviewRequest(APIModel):
    model_config = ConfigDict(extra="forbid")
    baseline_dataset_id: str = Field(min_length=1, max_length=36)
    current_dataset_id: str = Field(min_length=1, max_length=36)
    metric_id: str = Field(min_length=1, max_length=160)
    metric_definition: str = Field(min_length=1, max_length=2000)
    unit: str = Field(min_length=1, max_length=80)
    methodology: str = Field(min_length=1, max_length=500)
    geo: str = Field(min_length=1, max_length=100)
    platform: str = Field(min_length=1, max_length=100)
    baseline_period_key: str = Field(min_length=1, max_length=128)
    current_period_key: str = Field(min_length=1, max_length=128)
    baseline_semantics_confirmation: Literal["reporting_interval", "rolling_interval", "snapshot"] | None = None
    current_semantics_confirmation: Literal["reporting_interval", "rolling_interval", "snapshot"] | None = None

    @model_validator(mode="after")
    def datasets_must_be_distinct(self) -> "QuantitativeComparisonPreviewRequest":
        if self.baseline_dataset_id == self.current_dataset_id:
            raise ValueError("Choose two different CSV datasets.")
        return self


class QuantitativeComparisonSource(APIModel):
    metadata_provenance: dict[str, Any] = Field(default_factory=dict)
    value: float | None
    value_precision: Literal["exact", "approximate"]
    unit: str | None
    geo: str | None
    platform: str | None
    period_start: str | None
    period_end: str | None
    snapshot_date: str | None
    period_semantics: Literal["reporting_interval", "rolling_interval", "snapshot", "unknown"]
    granularity: str | None
    methodology: str | None
    entity_name: str | None
    source_entity_id: str | None
    source_provider: str | None
    verification_status: Literal["unverified", "needs_review", "verified"]
    dataset_id: str
    filename: str
    report_id: str | None = None
    report_question: str | None = None
    source_row_number: int | None
    source_reference: str | None
    provenance_id: str | None
    validation_reasons: list[str] = Field(default_factory=list)


class QuantitativeComparisonRow(APIModel):
    entity_key: str
    entity_name: str
    matched_by: Literal["provider_source_id", "unmatched_source_id"]
    status: Literal["comparable", "missing_baseline", "missing_current", "identity_conflict", "duplicate_observations", "incompatible_periods", "needs_review"]
    baseline: QuantitativeComparisonSource | None
    current: QuantitativeComparisonSource | None
    absolute_change: float | None = None
    change_unit: str | None = None
    percentage_change: float | None = None
    percentage_change_unavailable_reason: str | None = None
    formula: str | None = None
    evidence: list[QuantitativeComparisonSource] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


class QuantitativeComparisonPeriodReadiness(APIModel):
    compatible: bool
    kind: Literal["reporting_interval", "rolling_interval", "snapshot", "unknown"]
    reasons: list[str] = Field(default_factory=list)


class QuantitativeComparisonSummary(APIModel):
    matched_apps: int
    baseline_only_apps: int
    current_only_apps: int
    distinct_apps: int
    comparable_apps: int
    missing_data_apps: int
    ambiguous_apps: int
    duplicate_observation_apps: int
    invalid_observations: int


class QuantitativeComparisonPreview(APIModel):
    baseline: QuantitativeDatasetCatalogItem
    current: QuantitativeDatasetCatalogItem
    metric: QuantitativeComparisonMetric
    geo: str
    platform: str
    baseline_period: QuantitativeComparisonPeriod
    current_period: QuantitativeComparisonPeriod
    period_readiness: QuantitativeComparisonPeriodReadiness
    summary: QuantitativeComparisonSummary
    rows: list[QuantitativeComparisonRow]
    metric_warnings: list[str] = Field(default_factory=list)
