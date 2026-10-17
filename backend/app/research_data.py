"""Domain-neutral report structure and deterministic extraction helpers."""

from __future__ import annotations

import json
import re
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
    source_location: str
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


class UniversalResearchData(ResearchModel):
    sections: list[ResearchSection] = Field(default_factory=list, max_length=1000)
    entities: list[ResearchEntity] = Field(default_factory=list, max_length=2000)
    findings: list[ResearchFinding] = Field(default_factory=list, max_length=5000)
    evidence_references: list[SourceReference] = Field(default_factory=list, max_length=2000)
    benchmark_dimensions: list[BenchmarkDimension] = Field(default_factory=list, max_length=1000)
    research_gaps: list[str] = Field(default_factory=list, max_length=1000)
    po_recommendations: list[str] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="after")
    def validate_relations(self) -> "UniversalResearchData":
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
        relations = [entity for item in self.findings for entity in item.related_entities]
        relations += [entity for item in self.benchmark_dimensions for entity in item.related_entities]
        relations += [item.entity_key for dim in self.benchmark_dimensions for item in dim.observations if item.entity_key]
        if unknown := sorted(set(relations) - known_entities):
            raise ValueError(f"references unknown entity keys: {', '.join(unknown)}")
        if unknown_urls := sorted(set(references) - known_urls):
            raise ValueError("evidence references must match a source URL in the original report: " + ", ".join(unknown_urls))
        return self


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


def normalize_report(markdown: str, structured_json: str | None) -> tuple[UniversalResearchData, str, str | None]:
    data, status = extract_unstructured(markdown)
    if not structured_json:
        fenced = re.search(r"(?is)^\s*```json\s*\n(.*?)\n```\s*$", markdown.strip())
        if not fenced:
            fenced = re.search(r"(?is)```json\s*\n(.*?)\n```", markdown)
        if fenced:
            structured_json = fenced.group(1)
    if not structured_json or not structured_json.strip():
        return data, status, None
    try:
        payload = json.loads(structured_json)
        structured = UniversalResearchData.model_validate(payload)
        # URLs and sections are grounded in the verbatim report; accept supplied
        # structured content only when its source references can be found there.
        report_urls = {item.url for item in data.evidence_references}
        supplied_urls = {item.url for item in structured.evidence_references}
        if missing := supplied_urls - report_urls:
            raise ValueError("source URLs are absent from the original report: " + ", ".join(sorted(missing)))
        lines = markdown.splitlines()
        for source in structured.evidence_references:
            if source.source_location:
                match = re.fullmatch(r"line:(\d+)", source.source_location)
                if not match or int(match.group(1)) > len(lines) or source.url not in lines[int(match.group(1)) - 1]:
                    raise ValueError(f"source location does not point to its URL in the report: {source.source_location}")
        locations = [section.source_location for section in structured.sections]
        locations += [item.source_location for section in structured.sections for item in section.lists if item.source_location]
        locations += [item.source_location for section in structured.sections for item in section.tables if item.source_location]
        locations += [location for item in structured.findings for location in item.source_locations]
        locations += [location for dimension in structured.benchmark_dimensions for observation in dimension.observations for location in observation.source_locations]
        for location in locations:
            match = re.fullmatch(r"line:(\d+)", location)
            if not match or not 1 <= int(match.group(1)) <= len(lines):
                raise ValueError(f"source location is not a valid line in the original report: {location}")
        return structured, "PARSED", None
    except (json.JSONDecodeError, ValidationError, ValueError) as exc:
        message = str(exc)
        return data, status, message[:2000]
