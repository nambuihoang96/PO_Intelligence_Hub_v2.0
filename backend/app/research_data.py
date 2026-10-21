"""Domain-neutral report structure and deterministic extraction helpers."""

from __future__ import annotations

import json
import math
import re
from datetime import date
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator


class ResearchModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SourceReference(ResearchModel):
    url: str = Field(min_length=1, max_length=2048)
    title: str | None = Field(default=None, max_length=1000)
    source_location: str | None = Field(default=None, max_length=200)
    verified: Literal[False] = False

    @field_validator("url")
    @classmethod
    def safe_http_url(cls, value: str) -> str:
        value = value.strip().rstrip(".,;:!?)]\"'")
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("source references must be HTTP(S) URLs without credentials")
        return value


class ResearchList(ResearchModel):
    ordered: bool = False
    items: list[str] = Field(default_factory=list, max_length=500)
    source_location: str | None = None


class ResearchTable(ResearchModel):
    columns: list[str] = Field(min_length=1, max_length=100)
    rows: list[list[str]] = Field(default_factory=list, max_length=1000)
    source_location: str | None = None


class ResearchSection(ResearchModel):
    heading: str
    content: str = ""
    hierarchy: int = Field(ge=1, le=6)
    source_location: str | None = None
    lists: list[ResearchList] = Field(default_factory=list)
    tables: list[ResearchTable] = Field(default_factory=list)


class ResearchEntity(ResearchModel):
    key: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.:-]+$")
    entity_type: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=500)
    attributes: dict[str, Any] = Field(default_factory=dict)
    evidence_references: list[str] = Field(default_factory=list, max_length=100)


class ResearchFinding(ResearchModel):
    key: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.:-]+$")
    finding_type: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1, max_length=10000)
    related_entities: list[str] = Field(default_factory=list, max_length=100)
    evidence_references: list[str] = Field(default_factory=list, max_length=100)
    source_locations: list[str] = Field(default_factory=list, max_length=100)
    scope: dict[str, Any] = Field(default_factory=dict)
    evidence_status: Literal["unverified", "needs_review", "conflicting", "insufficient_evidence"] = "unverified"
    confidence: float | None = Field(default=None, ge=0, le=1)
    uncertainty: str | None = Field(default=None, max_length=2000)
    po_implications: str | None = Field(default=None, max_length=4000)


class BenchmarkObservation(ResearchModel):
    entity_key: str | None = Field(default=None, max_length=120)
    value: Any
    evidence_references: list[str] = Field(default_factory=list, max_length=100)
    source_locations: list[str] = Field(default_factory=list, max_length=100)
    evidence_status: Literal["unverified", "needs_review", "conflicting", "insufficient_evidence"] = "unverified"
    uncertainty: str | None = Field(default=None, max_length=2000)


class BenchmarkDimension(ResearchModel):
    key: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.:-]+$")
    name: str = Field(min_length=1, max_length=300)
    related_entities: list[str] = Field(default_factory=list, max_length=100)
    evidence_references: list[str] = Field(default_factory=list, max_length=100)
    observations: list[BenchmarkObservation] = Field(default_factory=list, max_length=1000)
    po_notes: str | None = Field(default=None, max_length=4000)


class QuantitativeObservation(ResearchModel):
    """A report-supplied numeric observation; incomplete scope stays explicit."""

    metric_id: str | None = Field(default=None, max_length=160)
    metric_definition: str | None = Field(default=None, max_length=2000)
    value: float | None = Field(default=None, strict=True)
    unit: str | None = Field(default=None, max_length=80)
    entity_id: str | None = Field(default=None, max_length=160)
    entity_name: str | None = Field(default=None, max_length=500)
    source_entity_id: str | None = Field(default=None, max_length=240)
    source_entity_name: str | None = Field(default=None, max_length=500)
    source_provider: str | None = Field(default=None, max_length=120)
    entity_resolution_state: Literal["matched", "source_only", "ambiguous", "conflict"] | None = None
    geo: str | None = Field(default=None, max_length=100)
    platform: str | None = Field(default=None, max_length=100)
    period_start: str | None = Field(default=None, max_length=10)
    period_end: str | None = Field(default=None, max_length=10)
    granularity: str | None = Field(default=None, max_length=40)
    methodology: str | None = Field(default=None, max_length=500)
    source_reference: str | None = Field(default=None, max_length=2048)
    evidence_reference: str | None = Field(default=None, max_length=2048)
    verification_status: Literal["unverified", "needs_review", "verified"] = "unverified"
    provenance_type: Literal["research_report", "csv_dataset"] = "research_report"
    provenance_id: str | None = Field(default=None, max_length=36)
    observation_type: Literal["reported", "imported", "calculated"] = "reported"
    validation_reasons: list[str] = Field(default_factory=list, max_length=40)
    source_validation_reasons: list[str] = Field(default_factory=list, max_length=40)
    report_compatibility_reasons: list[str] = Field(default_factory=list, max_length=40)
    report_compatibility: Literal["compatible", "incompatible", "unknown"] = "unknown"
    scope_compatible: bool | None = None
    import_status: Literal["preview", "imported", "reported"] = "reported"
    complete_observation: bool = False
    display_ready: bool = False
    analysis_ready: bool = False
    dataset_comparison_ready: bool = False
    comparison_ready: bool = False

    @field_validator("source_reference")
    @classmethod
    def quantitative_source_is_http_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("source_reference must be an HTTP(S) URL without credentials")
        return value

    @field_validator("evidence_reference")
    @classmethod
    def quantitative_evidence_is_http_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("evidence_reference must be an HTTP(S) URL without credentials")
        return value

    @field_validator("value")
    @classmethod
    def value_must_be_finite(cls, value: float | None) -> float | None:
        if value is not None and not math.isfinite(value):
            raise ValueError("value must be a finite exact number")
        return value

    @field_validator("metric_id")
    @classmethod
    def normalize_metric_identifier(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return re.sub(r"[^a-z0-9]+", "_", value.strip().casefold()).strip("_") or None

    @model_validator(mode="after")
    def keep_reported_claims_unverified(self) -> "QuantitativeObservation":
        if self.observation_type == "reported" and self.verification_status == "verified":
            raise ValueError("reported observations cannot be marked verified by the research report")
        if self.observation_type == "reported" and self.provenance_type != "research_report":
            raise ValueError("reported observations must use research_report provenance")
        if self.observation_type == "reported":
            object.__setattr__(self, "import_status", "reported")
        if self.observation_type == "imported" and self.provenance_type != "csv_dataset":
            raise ValueError("imported observations must use csv_dataset provenance")
        return self

    @model_validator(mode="after")
    def describe_incomplete_observation(self) -> "QuantitativeObservation":
        reasons = list(self.validation_reasons)
        for field_name, label in (
            ("metric_id", "metric identifier"),
            ("metric_definition", "metric definition"),
            ("value", "exact numeric value"),
            ("unit", "unit"),
            ("geo", "GEO"),
            ("platform", "platform"),
            ("period_start", "period start"),
            ("period_end", "period end"),
            ("granularity", "period granularity"),
        ):
            missing_reason = f"Missing {label}."
            if getattr(self, field_name) is None and missing_reason not in reasons:
                reasons.append(missing_reason)
        if self.observation_type == "reported" and self.source_reference is None and "Missing source reference." not in reasons:
            reasons.append("Missing source reference.")
        if self.observation_type == "reported" and self.evidence_reference is None and "Missing evidence reference." not in reasons:
            reasons.append("Missing evidence reference.")
        for field_name in ("period_start", "period_end"):
            value = getattr(self, field_name)
            if value is not None:
                try:
                    date.fromisoformat(value)
                except ValueError:
                    message = f"Invalid {field_name}; use YYYY-MM-DD."
                    if message not in reasons:
                        reasons.append(message)
        if self.period_start and self.period_end:
            try:
                if date.fromisoformat(self.period_start) > date.fromisoformat(self.period_end):
                    if "Period start is after period end." not in reasons:
                        reasons.append("Period start is after period end.")
            except ValueError:
                pass
        if self.entity_id is None and self.source_entity_id is None and "Entity mapping is not provided." not in reasons:
            reasons.append("Entity mapping is not provided.")
        object.__setattr__(self, "validation_reasons", reasons)
        if self.observation_type == "imported":
            compatibility_prefixes = ("GEO '", "Platform '", "Observation period does not overlap", "Report GEO scope", "Report platform scope")
            source_reasons = list(self.source_validation_reasons) or [
                reason for reason in reasons
                if reason not in self.report_compatibility_reasons
                and not reason.startswith(compatibility_prefixes)
                and not (reason == "Entity mapping is not provided." and (self.source_entity_id or self.entity_id))
            ]
            complete = not source_reasons
            object.__setattr__(self, "source_validation_reasons", source_reasons)
            object.__setattr__(self, "analysis_ready", complete)
            object.__setattr__(self, "dataset_comparison_ready", complete and bool(self.methodology and self.methodology.strip()))
            object.__setattr__(self, "display_ready", bool(self.metric_id and self.value is not None and (self.source_entity_id or self.entity_id or self.source_entity_name or self.entity_name)))
        else:
            complete = not reasons
        object.__setattr__(self, "complete_observation", complete)
        object.__setattr__(self, "comparison_ready", complete and self.scope_compatible is True and bool(self.methodology and self.methodology.strip()))
        return self


class UniversalResearchData(ResearchModel):
    executive_summary: str | None = Field(default=None, max_length=10000)
    key_takeaways: list[str] = Field(default_factory=list, max_length=100)
    sections: list[ResearchSection] = Field(default_factory=list, max_length=1000)
    entities: list[ResearchEntity] = Field(default_factory=list, max_length=2000)
    findings: list[ResearchFinding] = Field(default_factory=list, max_length=5000)
    evidence_references: list[SourceReference] = Field(default_factory=list, max_length=2000)
    benchmark_dimensions: list[BenchmarkDimension] = Field(default_factory=list, max_length=1000)
    research_gaps: list[str] = Field(default_factory=list, max_length=1000)
    po_recommendations: list[str] = Field(default_factory=list, max_length=1000)
    quantitative_observations: list[QuantitativeObservation] = Field(default_factory=list, max_length=10000)

    @model_validator(mode="after")
    def validate_relations(self) -> "UniversalResearchData":
        if any(item.observation_type != "reported" or item.provenance_type != "research_report" for item in self.quantitative_observations):
            raise ValueError("research reports may only supply reported quantitative observations")
        entity_keys = [entity.key for entity in self.entities]
        finding_keys = [finding.key for finding in self.findings]
        dimension_keys = [dimension.key for dimension in self.benchmark_dimensions]
        for label, keys in (("entity", entity_keys), ("finding", finding_keys), ("benchmark dimension", dimension_keys)):
            if len(keys) != len(set(keys)):
                raise ValueError(f"{label} keys must be unique")
        known_entities = set(entity_keys)
        known_urls = {source.url for source in self.evidence_references}
        references = [url for item in self.entities for url in item.evidence_references]
        references += [url for item in self.findings for url in item.evidence_references]
        references += [url for item in self.benchmark_dimensions for url in item.evidence_references]
        for dimension in self.benchmark_dimensions:
            references += [url for item in dimension.observations for url in item.evidence_references]
        quantitative_sources = [
            reference
            for item in self.quantitative_observations
            for reference in (item.source_reference, item.evidence_reference)
            if reference
        ]
        relations = [entity for item in self.findings for entity in item.related_entities]
        relations += [entity for item in self.benchmark_dimensions for entity in item.related_entities]
        relations += [item.entity_key for dim in self.benchmark_dimensions for item in dim.observations if item.entity_key]
        if unknown := sorted(set(relations) - known_entities):
            raise ValueError(f"references unknown entity keys: {', '.join(unknown)}")
        if unknown_urls := sorted(set(references) - known_urls):
            raise ValueError("evidence references must match a source URL in the original report: " + ", ".join(unknown_urls))
        if unknown_urls := sorted(set(quantitative_sources) - known_urls):
            raise ValueError("quantitative source references must match a source URL in the research report: " + ", ".join(unknown_urls))
        return self


class POResearchPayload(ResearchModel):
    """Versioned envelope shared by the prompt builder and report importer."""

    schema_version: Literal["po_research_v1"]
    research_data: UniversalResearchData


def _url_references(markdown: str) -> list[SourceReference]:
    results: list[SourceReference] = []
    seen: set[str] = set()
    in_fence = False
    for line_number, line in enumerate(markdown.splitlines(), 1):
        if re.match(r"^\s*```", line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for match in re.finditer(r"https?://[^\s<>\]\[()]+", line):
            url = match.group(0).rstrip(".,;:!?)\"'")
            if url in seen:
                continue
            seen.add(url)
            try:
                results.append(SourceReference(url=url, source_location=f"line:{line_number}"))
            except ValidationError:
                continue
    return results


def _line_tables(lines: list[str], offset: int) -> list[ResearchTable]:
    tables: list[ResearchTable] = []
    index = 0
    while index + 1 < len(lines):
        if "|" not in lines[index] or not re.match(r"^\s*\|?\s*:?-{3,}", lines[index + 1]):
            index += 1
            continue
        table_start = index
        columns = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
        index += 2
        rows: list[list[str]] = []
        while index < len(lines) and "|" in lines[index] and lines[index].strip():
            rows.append([cell.strip() for cell in lines[index].strip().strip("|").split("|")])
            index += 1
        if columns:
            tables.append(ResearchTable(columns=columns, rows=rows, source_location=f"line:{offset + table_start + 1}"))
    return tables


def extract_unstructured(markdown: str) -> tuple[UniversalResearchData, str]:
    lines = markdown.splitlines()
    headings: list[tuple[int, int, str]] = []
    in_fence = False
    for index, line in enumerate(lines):
        if re.match(r"^\s*```", line):
            in_fence = not in_fence
            continue
        if not in_fence:
            match = re.match(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$", line)
            if match:
                headings.append((index, len(match.group(1)), match.group(2).strip()))

    sections: list[ResearchSection] = []
    for position, (start, level, heading) in enumerate(headings):
        end = headings[position + 1][0] if position + 1 < len(headings) else len(lines)
        body = lines[start + 1:end]
        lists: list[ResearchList] = []
        list_items: list[str] = []
        list_ordered: bool | None = None
        list_start = 0
        for line_index, line in enumerate(body):
            match = re.match(r"^\s*(?:([-*+])\s+|(\d+)[.)]\s+)(.*)$", line)
            if match:
                ordered = match.group(2) is not None
                if list_ordered is not None and list_ordered != ordered:
                    lists.append(ResearchList(ordered=list_ordered, items=list_items, source_location=f"line:{start + list_start + 2}"))
                    list_items = []
                if list_ordered is None or list_ordered != ordered:
                    list_start = line_index
                list_ordered = ordered
                list_items.append(match.group(3).strip())
            elif line.strip() and list_ordered is not None:
                lists.append(ResearchList(ordered=list_ordered, items=list_items, source_location=f"line:{start + list_start + 2}"))
                list_items, list_ordered = [], None
        if list_ordered is not None:
            lists.append(ResearchList(ordered=list_ordered, items=list_items, source_location=f"line:{start + list_start + 2}"))
        sections.append(ResearchSection(
            heading=heading, content="\n".join(body), hierarchy=level, source_location=f"line:{start + 1}",
            lists=lists, tables=_line_tables(body, start + 1),
        ))

    if not headings:
        lists: list[ResearchList] = []
        index = 0
        while index < len(lines):
            first = re.match(r"^\s*(?:([-*+])\s+|(\d+)[.)]\s+)(.*)$", lines[index])
            if not first:
                index += 1
                continue
            ordered = first.group(2) is not None
            items: list[str] = []
            start = index
            while index < len(lines):
                item = re.match(r"^\s*(?:([-*+])\s+|(\d+)[.)]\s+)(.*)$", lines[index])
                if not item or (item.group(2) is not None) != ordered:
                    break
                items.append(item.group(3).strip())
                index += 1
            lists.append(ResearchList(ordered=ordered, items=items, source_location=f"line:{start + 1}"))
        tables = _line_tables(lines, 0)
        if lists or tables:
            sections.append(ResearchSection(
                heading="Unheaded content",
                content=markdown,
                hierarchy=1,
                source_location="line:1",
                lists=lists,
                tables=tables,
            ))

    references = _url_references(markdown)
    data = UniversalResearchData(sections=sections, evidence_references=references)
    return data, "PARTIAL" if sections or references else "NEEDS_STRUCTURING"


class ResearchInputValidationError(ValueError):
    def __init__(self, message: str, errors: list[dict[str, Any]]):
        super().__init__(message)
        self.errors = errors


def _structured_candidate(content: str, explicit_json: str | None) -> tuple[str | None, str, str]:
    if explicit_json is not None and explicit_json.strip():
        return explicit_json, "structured_json", content
    fences = list(re.finditer(r"(?is)```json\s*\r?\n?(.*?)\r?\n?```", content))
    if fences:
        # Prefer the explicitly marked canonical payload; otherwise choose the
        # last valid JSON fence rather than an earlier illustrative code block.
        candidates = []
        for fence in fences:
            marked = "PO_RESEARCH_V1" in content[max(0, fence.start() - 100):fence.start()].upper()
            candidates.append((fence, marked))
        marked_fences = [item for item in candidates if item[1]]
        selected = marked_fences[-1][0] if marked_fences else candidates[-1][0]
        prose = content[:selected.start()] + content[selected.end():]
        return selected.group(1), ("inline_json" if prose.strip() else "json_only"), prose
    stripped = content.strip()
    if stripped.startswith(("{", "[")):
        return content, "json_only", ""
    if re.search(r"(?is)(?:PO_RESEARCH_V1\s*)?```json\b", content):
        raise ResearchInputValidationError(
            "The fenced JSON block is not closed.",
            [{"location": ["body", "content"], "message": "JSON code fence must end with ```.", "type": "json_fence_unclosed"}],
        )
    return None, "text", content


def normalize_report(content: str, structured_json: str | None) -> tuple[UniversalResearchData, str, str | None]:
    candidate, input_kind, markdown = _structured_candidate(content, structured_json)
    data, status = extract_unstructured(markdown)
    if candidate is None or not candidate.strip():
        return data, status, None
    field_path = "structured_json" if input_kind == "structured_json" else "content"
    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError as exc:
        detail = f"JSON syntax error at line {exc.lineno}, column {exc.colno}: {exc.msg}."
        raise ResearchInputValidationError(
            detail,
            [{"location": ["body", field_path, "line", exc.lineno, "column", exc.colno], "message": detail, "type": "json_invalid"}],
        ) from exc
    try:
        if isinstance(payload, dict) and "schema_version" in payload:
            try:
                structured = POResearchPayload.model_validate(payload).research_data
            except ValidationError as exc:
                # Make contract version failures distinguishable and actionable.
                version_error = any("schema_version" in error.get("loc", ()) for error in exc.errors())
                errors = [
                    {"location": ["body", field_path, *error.get("loc", ())], "message": error.get("msg", "Invalid value"), "type": error.get("type", "value_error")}
                    for error in exc.errors(include_input=False)
                ]
                if version_error:
                    raise ResearchInputValidationError("Unsupported research contract version. Expected schema_version 'po_research_v1'.", errors) from exc
                reasons = "; ".join(error.get("msg", "Invalid value") for error in exc.errors(include_input=False))
                raise ResearchInputValidationError(f"Structured research payload does not match po_research_v1: {reasons}", errors) from exc
        else:
            # Existing reports and older clients submit the unwrapped model.
            structured = UniversalResearchData.model_validate(payload)
    except ValidationError as exc:
        errors = [
            {"location": ["body", field_path, *error.get("loc", ())], "message": error.get("msg", "Invalid value"), "type": error.get("type", "value_error")}
            for error in exc.errors(include_input=False)
        ]
        raise ResearchInputValidationError("Structured research data does not match the research results schema.", errors) from exc

    # Legacy callers that send a second JSON field must keep its citations tied
    # to the report text. Inline and JSON-only input validate references inside
    # the supplied JSON envelope and remain explicitly unverified.
    if input_kind == "structured_json":
        report_urls = {item.url for item in data.evidence_references}
        supplied_urls = {item.url for item in structured.evidence_references}
        if missing := supplied_urls - report_urls:
            message = "Source URLs in structured_json must also appear in the Markdown/TXT report: " + ", ".join(sorted(missing))
            raise ResearchInputValidationError(message, [{"location": ["body", "structured_json", "evidence_references"], "message": message, "type": "reference_not_in_report"}])

    # Do not trust model-generated line counts. Derive a location only when a
    # URL occurs in readable report text; JSON-only and code-fence locations
    # remain unset rather than pretending to point to claim support.
    derived_sources = {item.url: item.source_location for item in _url_references(markdown)}
    structured.evidence_references = [
        source.model_copy(update={"source_location": derived_sources.get(source.url)})
        for source in structured.evidence_references
    ]
    # Readiness and local provenance are derived by PO Hub from the saved
    # report, never trusted from the ChatGPT-supplied JSON.
    structured.quantitative_observations = [item.model_copy(update={
        "scope_compatible": None,
        "provenance_id": None,
        "import_status": "reported",
        "comparison_ready": False,
    }) for item in structured.quantitative_observations]
    # ChatGPT should not count lines. Drop claimed JSON locations and retain
    # only URL locations derived from the readable original report above.
    structured.sections = [section.model_copy(update={
        "source_location": None,
        "lists": [item.model_copy(update={"source_location": None}) for item in section.lists],
        "tables": [item.model_copy(update={"source_location": None}) for item in section.tables],
    }) for section in structured.sections]
    structured.findings = [item.model_copy(update={"source_locations": []}) for item in structured.findings]
    structured.benchmark_dimensions = [item.model_copy(update={"observations": [observation.model_copy(update={"source_locations": []}) for observation in item.observations]}) for item in structured.benchmark_dimensions]
    return structured, "PARSED", None
