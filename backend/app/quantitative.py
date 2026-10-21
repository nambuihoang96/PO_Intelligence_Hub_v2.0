"""Deterministic validation helpers for report and CSV numeric observations."""

from __future__ import annotations

import csv
import calendar
import hashlib
import io
import math
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

from backend.app.research_data import QuantitativeObservation


CSV_FIELD_NAMES = {
    "metric_id", "metric_definition", "value", "unit", "entity_id", "geo",
    "entity_name", "platform", "period_start", "period_end", "snapshot_date", "period_semantics", "granularity", "source_reference", "methodology",
}
UNIT_ALIASES = {"percent": "%", "percentage": "%", "pct": "%", "seconds": "s", "minutes": "min"}
EXACT_NUMBER = re.compile(r"^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?$")


def sensor_tower_metric(header: str) -> dict[str, str | None] | None:
    """Recognize common Sensor Tower wide-export metrics without guessing values."""
    normalized = re.sub(r"\s+", " ", header.strip().casefold())
    normalized = re.sub(r"\s*\(\s*", " (", normalized)
    metric = re.sub(r"[^a-z0-9%]+", " ", normalized).strip()
    if re.search(r"\bdownloads\b", metric) and re.search(r"\byoy\b", metric):
        percent = "%" in header or bool(re.search(r"\bpercent(?:age)?\b|\bpct\b", metric))
        return {
            "metric_id": "downloads_yoy_growth_percent" if percent else "downloads_yoy_growth_absolute",
            "metric_definition": header.strip(),
            "unit": "%" if percent else "downloads",
        }
    if re.search(r"\bdownloads\b", metric) and re.search(r"\babsolute\b", metric):
        return {"metric_id": "downloads_absolute", "metric_definition": header.strip(), "unit": "downloads"}
    if re.search(r"\brevenue\b", metric) and re.search(r"\byoy\b", metric):
        percent = "%" in header or bool(re.search(r"\bpercent(?:age)?\b|\bpct\b", metric))
        return {
            "metric_id": "revenue_yoy_growth_percent" if percent else "revenue_yoy_growth_absolute",
            "metric_definition": header.strip(),
            "unit": "%" if percent else None,
        }
    if re.search(r"\brevenue\b", metric) and re.search(r"\babsolute\b", metric):
        return {"metric_id": "revenue_absolute", "metric_definition": header.strip(), "unit": None}
    if re.search(r"\bdau\b", metric):
        if re.search(r"\byoy\b", metric):
            percent = "%" in header or bool(re.search(r"\bpercent(?:age)?\b|\bpct\b", metric))
            return {
                "metric_id": "dau_yoy_growth_percent" if percent else "dau_yoy_growth_absolute",
                "metric_definition": header.strip(),
                "unit": "%" if percent else "users",
            }
        if re.search(r"\babsolute\b", metric):
            return {"metric_id": "dau_absolute", "metric_definition": header.strip(), "unit": "users"}
    return None


def _header_matches_field(field: str, header: str) -> bool:
    value = re.sub(r"[^a-z0-9]+", " ", header.casefold()).strip()
    rules: dict[str, tuple[str, ...]] = {
        "entity_id": (r"\b(unified|entity|product|app) id\b", r"\b(unified|entity|product|app) name\b", r"^entity$", r"^product$", r"^app$"),
        "entity_name": (r"\b(unified|entity|product|app) name\b", r"^entity name$", r"^product name$", r"^app name$"),
        "geo": (r"^geo$", r"^country$", r"^market$", r"^region$"),
        "platform": (r"^platform$", r"^os$", r"^environment$"),
        "period_start": (r"^period start$", r"^start date$", r"^date start$", r"^start$"),
        "period_end": (r"^period end$", r"^end date$", r"^date end$", r"^end$"),
        "snapshot_date": (r"^snapshot date$", r"^date$", r"^as of date$", r"^as of$"),
        "granularity": (r"^granularity$", r"^frequency$", r"^period$"),
        "unit": (r"^unit$", r"^units$"),
        "source_reference": (r"^source$", r"^source url$", r"^source reference$", r"^url$"),
        "methodology": (r"^methodology$", r"^method$"),
    }
    return any(re.fullmatch(pattern, value) for pattern in rules.get(field, ()))


def normalize_metric_id(value: str | None) -> str | None:
    if not value or not value.strip():
        return None
    return re.sub(r"[^a-z0-9]+", "_", value.strip().casefold()).strip("_") or None


def normalize_unit(value: str | None) -> str | None:
    if not value or not value.strip():
        return None
    trimmed = value.strip()
    return UNIT_ALIASES.get(trimmed.casefold(), trimmed)


def _entity_match_key(value: Any) -> str:
    """Normalize harmless whitespace and Unicode differences in exported entity labels."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(value)).strip()).casefold()


def _date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        # Sensor Tower's export uses day-first dates. Accept this only when
        # the day is unambiguous; ambiguous dates must be explicitly corrected.
        match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", value.strip())
        if match and int(match.group(1)) > 12:
            try:
                return datetime.strptime(value.strip(), "%d/%m/%Y").date()
            except ValueError:
                return None
        return None


def detect_csv_delimiter(csv_text: str) -> str:
    """Detect a common CSV delimiter from the first non-empty record."""
    first_line = next((line for line in csv_text.splitlines() if line.strip()), "")
    if not first_line:
        raise ValueError("CSV must contain a header row and at least one observation row.")
    candidates = [(
        len(next(csv.reader([first_line], delimiter=delimiter))), delimiter,
    ) for delimiter in (",", ";", "\t", "|")]
    column_count, delimiter = max(candidates, key=lambda item: item[0])
    if column_count < 2:
        raise ValueError("Could not detect a column separator. Use comma, semicolon, tab, or pipe-delimited CSV.")
    return delimiter


def _report_years(value: str | None) -> tuple[int, int] | None:
    if not value:
        return None
    years = [int(item) for item in re.findall(r"(?<!\d)(?:19|20|21)\d{2}(?!\d)", value)]
    return (min(years), max(years)) if years else None


def _scope_values(value: str) -> set[str]:
    return {part.strip().casefold() for part in re.split(r"[,;|/]", value) if part.strip()}


def _scope_compatible(observation: str | None, report_scope: str, dimension: str) -> bool:
    if not observation:
        return True
    supplied = observation.strip().casefold()
    scope = _scope_values(report_scope)
    if dimension == "geo" and scope.intersection({"global", "worldwide", "global / not specified", "unknown"}):
        return True
    if dimension == "platform":
        if scope.intersection({"cross-platform", "cross platform"}):
            return True
        if "both" in scope:
            return supplied in {"ios", "android", "both"}
    if scope.intersection({"unknown", "not applicable", "n/a"}):
        return False
    return supplied in scope


def assess_observation_readiness(
    raw: dict[str, Any], *, report_geo: str, report_platform: str,
) -> dict[str, Any]:
    """Recalculate readiness for current and legacy stored observation payloads."""
    observation = QuantitativeObservation.model_validate(raw)
    scope_compatible: bool | None = True
    for supplied, report_scope, dimension in ((observation.geo, report_geo, "geo"), (observation.platform, report_platform, "platform")):
        if not supplied or report_scope.strip().casefold() in {"unknown", "not applicable", "n/a"}:
            if scope_compatible is not False:
                scope_compatible = None
        elif not _scope_compatible(supplied, report_scope, dimension):
            scope_compatible = False
    compatibility_reasons = list(observation.report_compatibility_reasons)
    if not compatibility_reasons:
        compatibility_reasons = [reason for reason in observation.validation_reasons if reason.startswith(("GEO '", "Platform '", "Observation period does not overlap", "Report GEO scope", "Report platform scope"))]
    source_identity = observation.source_entity_id or observation.entity_id or observation.source_entity_name or observation.entity_name
    source_reasons = list(observation.source_validation_reasons)
    if not source_reasons:
        source_reasons = [reason for reason in observation.validation_reasons if reason not in compatibility_reasons and reason not in observation.metadata_validation_reasons and not reason.startswith("Entity does not resolve") and not (reason == "Entity mapping is not provided." and source_identity)]
    # Older stored payloads may still carry the pre-fix missing-granularity
    # diagnostic. Explicit start/end dates define the measured window without
    # implying a weekly/monthly cadence.
    if observation.period_start and observation.period_end:
        source_reasons = [reason for reason in source_reasons if reason != "Missing period granularity."]
    display_ready = bool(observation.metric_id and observation.value is not None and source_identity)
    required = (observation.metric_id, observation.metric_definition, observation.value, observation.unit, source_identity,
                observation.geo, observation.platform)
    period_complete = (
        bool(observation.snapshot_date)
        if observation.period_semantics == "snapshot"
        else bool(observation.period_start and observation.period_end)
        if observation.period_semantics in {"reporting_interval", "rolling_interval"}
        else False
    )
    complete = all(value not in (None, "") for value in required) and period_complete and not source_reasons
    analysis_ready = complete
    report_compatibility = "incompatible" if scope_compatible is False or compatibility_reasons else ("compatible" if scope_compatible is True and observation.geo and observation.platform and period_complete else "unknown")
    dataset_comparison_ready = analysis_ready and not observation.metadata_validation_reasons and bool(observation.methodology and observation.methodology.strip())
    comparison_ready = dataset_comparison_ready and report_compatibility == "compatible"
    return observation.model_dump(mode="json") | {
        "scope_compatible": scope_compatible,
        "complete_observation": complete,
        "source_validation_reasons": source_reasons,
        "report_compatibility_reasons": compatibility_reasons,
        "report_compatibility": report_compatibility,
        "display_ready": display_ready,
        "analysis_ready": analysis_ready,
        "dataset_comparison_ready": dataset_comparison_ready,
        "comparison_ready": comparison_ready,
        "import_status": "imported" if observation.observation_type == "imported" else "reported",
    }


def assess_report_observations(
    raw_rows: list[dict[str, Any]], *, report_id: str, report_geo: str,
    report_platform: str, report_period: str | None, entities: list[dict[str, Any]],
    evidence_references: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Bind report-supplied metrics to their report and recalculate readiness.

    Report IDs and canonical display names are local references, so they are
    resolved from the persisted report at read time rather than guessed by ChatGPT.
    """
    entity_by_key = {item.get("key"): item for item in entities if item.get("key")}
    source_by_url = {item.get("url"): item for item in evidence_references if item.get("url")}
    report_years = _report_years(report_period)
    seen: set[tuple[Any, ...]] = set()
    assessed: list[dict[str, Any]] = []
    for raw in raw_rows:
        observation = QuantitativeObservation.model_validate(raw)
        row = observation.model_dump(mode="json")
        reasons = list(dict.fromkeys(observation.validation_reasons))
        entity = entity_by_key.get(observation.entity_id)
        if not observation.entity_id or entity is None:
            reasons.append("Entity does not resolve to a report-supplied entity key.")
        elif observation.entity_name and observation.entity_name.strip().casefold() != str(entity.get("name", "")).strip().casefold():
            reasons.append("Entity display name does not match the referenced report entity.")
        elif not observation.entity_name:
            row["entity_name"] = entity.get("name")

        source = source_by_url.get(observation.source_reference)
        evidence = source_by_url.get(observation.evidence_reference)
        if source is None:
            reasons.append("Source reference is not registered in this report.")
        if evidence is None:
            reasons.append("Evidence reference is not registered in this report.")
        scope_compatible: bool | None = True
        for supplied, report_scope, dimension in (
            (observation.geo, report_geo, "geo"),
            (observation.platform, report_platform, "platform"),
        ):
            if not supplied or not report_scope or report_scope.strip().casefold() in {"unknown", "not applicable", "n/a", "not specified", "global / not specified"}:
                scope_compatible = None
            elif not _scope_compatible(supplied, report_scope, dimension):
                scope_compatible = False
                reasons.append(f"Observation {dimension.upper() if dimension == 'geo' else 'platform'} does not match the report scope.")

        if report_years and observation.period_start and observation.period_end:
            start, end = _date(observation.period_start), _date(observation.period_end)
            if start and end and (end.year < report_years[0] or start.year > report_years[1]):
                reasons.append("Observation period does not overlap the report period.")

        signature = (
            observation.metric_id, observation.metric_definition, observation.value,
            observation.value_precision, observation.reported_value_text,
            observation.unit, observation.entity_id, observation.geo, observation.platform,
            observation.period_start, observation.period_end, observation.granularity,
        )
        if signature in seen:
            reasons.append("Duplicate report-supplied observation.")
        seen.add(signature)

        row["provenance_type"] = "research_report"
        row["provenance_id"] = report_id
        row["scope_compatible"] = scope_compatible
        row["validation_reasons"] = list(dict.fromkeys(reasons))
        row["complete_observation"] = not reasons
        row["comparison_ready"] = (
            not reasons and scope_compatible is True
            and bool(observation.methodology and observation.methodology.strip())
        )
        row["import_status"] = "reported"
        assessed.append(row)
    return assessed


def parse_csv_observations(
    csv_text: str,
    *,
    report_id: str,
    report_geo: str,
    report_platform: str,
    report_period: str | None,
    entities: list[dict[str, Any]],
    field_mapping: dict[str, str],
    entity_mappings: dict[str, str],
    metric_mappings: list[dict[str, Any]] | None = None,
    explicit_values: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], list[str], list[dict[str, Any]], str]:
    """Map CSV rows to typed observations and surface ambiguous entity matches."""
    delimiter = detect_csv_delimiter(csv_text)
    reader = csv.DictReader(io.StringIO(csv_text, newline=""), delimiter=delimiter)
    if not reader.fieldnames:
        raise ValueError("CSV must contain a header row and at least one observation row.")
    reader.fieldnames = [name.strip().lstrip("\ufeff") for name in reader.fieldnames]
    if len(reader.fieldnames) > 256:
        raise ValueError("CSV has too many columns (maximum 256).")
    if len(set(reader.fieldnames)) != len(reader.fieldnames):
        raise ValueError("CSV has duplicate column names. Rename the duplicate headers and retry.")
    unknown_targets = set(field_mapping) - CSV_FIELD_NAMES
    unknown_headers = set(field_mapping.values()) - set(reader.fieldnames)
    if unknown_targets or unknown_headers:
        details = []
        if unknown_targets:
            details.append("Unsupported mapped field(s): " + ", ".join(sorted(unknown_targets)))
        if unknown_headers:
            details.append("CSV header(s) not found: " + ", ".join(sorted(unknown_headers)))
        raise ValueError("; ".join(details))
    for field, header in field_mapping.items():
        if field in {"entity_id", "entity_name", "geo", "platform", "period_start", "period_end", "snapshot_date", "granularity", "unit", "source_reference", "methodology"} and not _header_matches_field(field, header):
            label = "GEO" if field == "geo" else field.replace("_", " ").capitalize()
            raise ValueError(f"The selected {label} column '{header}' does not look like a {label.casefold()} field. Choose a semantically matching CSV column.")
    if "entity_id" not in field_mapping and "entity_name" not in field_mapping:
        raise ValueError("Map an entity ID or entity name column so CSV rows can be matched to report entities.")

    metric_mappings = metric_mappings or []
    explicit_values = explicit_values or {}
    if metric_mappings:
        metric_columns = [str(item.get("column", "")) for item in metric_mappings]
        if len(set(metric_columns)) != len(metric_columns):
            raise ValueError("Each metric column can only be mapped once.")
        metric_ids = [normalize_metric_id(str(item.get("metric_id") or "")) for item in metric_mappings]
        if None in metric_ids or len(set(metric_ids)) != len(metric_ids):
            raise ValueError("Each selected metric column needs a unique metric identity. Give percentage and absolute metrics different IDs.")
        missing_metric_columns = set(metric_columns) - set(reader.fieldnames)
        if missing_metric_columns:
            raise ValueError("CSV metric column(s) not found: " + ", ".join(sorted(missing_metric_columns)))
        if {"metric_id", "value"} & set(field_mapping):
            raise ValueError("Wide metric mappings replace the Metric identity and Exact value column mappings.")
    elif "value" not in field_mapping:
        raise ValueError("Map an Exact value column, or add one or more metric columns.")
    if set(explicit_values) & set(field_mapping):
        raise ValueError("Choose a CSV column or an explicit value for: " + ", ".join(sorted(set(explicit_values) & set(field_mapping))))

    entity_by_key = {str(item["key"]): item for item in entities}
    names: dict[str, list[str]] = {}
    for entity in entities:
        entity_key = str(entity["key"])
        aliases: list[Any] = [entity.get("key"), entity.get("name"), entity.get("display_name"), entity.get("unified_id"), entity.get("unified_name"), entity.get("entity_id"), entity.get("id"), entity.get("publisher_id"), entity.get("aliases")]
        for alias in aliases:
            values = alias if isinstance(alias, list) else [alias]
            for value in values:
                if value is not None and str(value).strip():
                    normalized = _entity_match_key(value)
                    names.setdefault(normalized, [])
                    if entity_key not in names[normalized]:
                        names[normalized].append(entity_key)
    rows: list[dict[str, Any]] = []
    reasons: list[str] = []
    ambiguities: list[dict[str, Any]] = []
    unmatched_entities: list[dict[str, Any]] = []
    seen_observations: dict[tuple[str, ...], int] = {}
    duplicate_rows = 0
    years = _report_years(report_period)
    populated_row_count = 0
    for row_number, row in enumerate(reader, 2):
        if None in row:
            raise ValueError(f"CSV row {row_number} has more values than the header defines.")
        if not any((value or "").strip() for value in row.values()):
            continue
        populated_row_count += 1
        if populated_row_count > 10000:
            raise ValueError("CSV has too many non-empty data rows (maximum 10,000).")
        raw = {target: (row.get(header) or "").strip() for target, header in field_mapping.items()}
        for field_name, value in explicit_values.items():
            raw[field_name] = value.strip()
        raw_entity_id = raw.get("entity_id") or None
        raw_entity_name = raw.get("entity_name") or None
        raw_entity = raw_entity_id or raw_entity_name
        entity_id = None
        entity_resolution_state = "source_only"
        entity_reasons: list[str] = []
        if raw_entity:
            id_candidates = names.get(_entity_match_key(raw_entity_id), []) if raw_entity_id else []
            name_candidates = names.get(_entity_match_key(raw_entity_name), []) if raw_entity_name else []
            resolved_candidates = id_candidates or name_candidates
            if raw_entity in entity_mappings:
                mapped_key = entity_mappings[raw_entity]
                if mapped_key == "__unmapped__":
                    entity_resolution_state = "source_only"
                elif mapped_key not in entity_by_key:
                    raise ValueError(f"Entity mapping for '{raw_entity}' refers to unknown report entity '{mapped_key}'.")
                else:
                    entity_id = mapped_key
                    entity_resolution_state = "matched"
            else:
                if id_candidates and name_candidates and not set(id_candidates).intersection(name_candidates):
                    conflict_candidates = list(dict.fromkeys([*id_candidates, *name_candidates]))
                    ambiguities.append({"csv_value": raw_entity_id, "csv_name": raw_entity_name, "row": row_number, "candidates": conflict_candidates})
                    entity_resolution_state = "conflict"
                    entity_reasons.append("Entity mapping needs user confirmation.")
                elif len(resolved_candidates) == 1:
                    entity_id = resolved_candidates[0]
                    entity_resolution_state = "matched"
                elif len(resolved_candidates) > 1:
                    ambiguities.append({"csv_value": raw_entity_id or raw_entity_name or raw_entity, "csv_name": raw_entity_name, "row": row_number, "candidates": resolved_candidates})
                    entity_resolution_state = "ambiguous"
                    entity_reasons.append("Entity mapping needs user confirmation.")
                elif raw_entity in entity_by_key:
                    entity_id = raw_entity
                    entity_resolution_state = "matched"
                else:
                    entity_resolution_state = "source_only"
        else:
            entity_reasons.append("Entity mapping is not provided.")

        provider = "sensor_tower" if any("unified" in header.casefold() for header in reader.fieldnames) else "csv"
        id_header = field_mapping.get("entity_id", "")
        source_id_value = raw_entity_id if id_header and re.search(r"\bid\b", id_header, re.IGNORECASE) and not re.search(r"\bname\b", id_header, re.IGNORECASE) else None
        source_name_value = raw_entity_name or (raw_entity if not source_id_value else None)
        source_id_value = source_id_value or ("name-" + hashlib.sha256(_entity_match_key(source_name_value or raw_entity or "").encode("utf-8")).hexdigest()[:24] if source_name_value or raw_entity else None)
        namespaced_source_id = f"{provider}:{source_id_value}" if source_id_value else None

        period_start = raw.get("period_start") or None
        period_end = raw.get("period_end") or None
        snapshot_date = raw.get("snapshot_date") or None
        start_date, end_date = _date(period_start), _date(period_end)
        snapshot = _date(snapshot_date)
        if start_date and period_start:
            period_start = start_date.isoformat()
        if end_date and period_end:
            period_end = end_date.isoformat()
        source_dimension_reasons: list[str] = []
        compatibility_reasons: list[str] = []
        if period_start and start_date is None:
            source_dimension_reasons.append(f"CSV row {row_number} has an invalid period_start; use YYYY-MM-DD or an unambiguous day-first date.")
        if period_end and end_date is None:
            source_dimension_reasons.append(f"CSV row {row_number} has an invalid period_end; use YYYY-MM-DD or an unambiguous day-first date.")
        if start_date and end_date and start_date > end_date:
            source_dimension_reasons.append(f"CSV row {row_number} period_start is after period_end.")
        if snapshot_date and snapshot is None:
            source_dimension_reasons.append(f"CSV row {row_number} has an invalid snapshot_date; use YYYY-MM-DD or an unambiguous day-first date.")
        period_semantics = (raw.get("period_semantics") or "unknown").strip().casefold()
        if period_semantics == "unknown":
            if period_start and period_end:
                period_semantics = "reporting_interval"
        if period_semantics not in {"reporting_interval", "rolling_interval", "snapshot", "unknown"}:
            source_dimension_reasons.append(f"CSV row {row_number} has unsupported period semantics.")
            period_semantics = "unknown"
        if period_semantics == "snapshot" and not snapshot_date and period_start and not period_end:
            # Backward-compatible correction for earlier imports that mapped a
            # header named Date to period_start. The date is exposed as a
            # snapshot candidate by the catalog; no period is inferred here.
            snapshot_date, snapshot, period_start = period_start, start_date, None

        geo = raw.get("geo") or None
        platform = raw.get("platform") or None
        source_reference = raw.get("source_reference") or None
        if source_reference:
            parsed_source = urlsplit(source_reference)
            if parsed_source.scheme.casefold() not in {"http", "https"} or not parsed_source.hostname or parsed_source.username or parsed_source.password:
                source_dimension_reasons.append(f"CSV row {row_number} source must be an HTTP(S) URL without credentials.")
                source_reference = None
        if geo and report_geo.strip().casefold() in {"unknown", "not applicable", "n/a"}:
            compatibility_reasons.append(f"Report GEO scope '{report_geo}' is unspecified.")
        elif geo and not _scope_compatible(geo, report_geo, "geo"):
            compatibility_reasons.append(f"GEO '{geo}' differs from report scope '{report_geo}'.")
        if platform and report_platform.strip().casefold() in {"unknown", "not applicable", "n/a"}:
            compatibility_reasons.append(f"Report platform scope '{report_platform}' is unspecified.")
        elif platform and not _scope_compatible(platform, report_platform, "platform"):
            compatibility_reasons.append(f"Platform '{platform}' differs from report scope '{report_platform}'.")
        if years and start_date and end_date and (end_date.year < years[0] or start_date.year > years[1]):
            compatibility_reasons.append("Observation period does not overlap the report period.")

        scope_compatible: bool | None = True
        for supplied, report_scope, dimension in ((geo, report_geo, "GEO"), (platform, report_platform, "platform")):
            if not supplied or report_scope.strip().casefold() in {"unknown", "not applicable", "n/a"}:
                if scope_compatible is not False:
                    scope_compatible = None
            elif not _scope_compatible(supplied, report_scope, "geo" if dimension == "GEO" else "platform"):
                scope_compatible = False

        if metric_mappings:
            measures = [
                {**mapping, "value": (row.get(mapping["column"]) or "").strip()}
                for mapping in metric_mappings
            ]
        else:
            measures = [{
                "metric_id": raw.get("metric_id"),
                "metric_definition": raw.get("metric_definition"),
                "unit": raw.get("unit"),
                "methodology": raw.get("methodology"),
                "value": raw.get("value"),
            }]
        for measure in measures:
            row_reasons = [*entity_reasons, *source_dimension_reasons]
            value: float | None = None
            numeric_text = str(measure.get("value") or "").strip()
            if numeric_text:
                try:
                    if not EXACT_NUMBER.fullmatch(numeric_text):
                        raise ValueError("not a strict numeric literal")
                    value = float(numeric_text.replace(",", ""))
                    if not math.isfinite(value):
                        value = None
                        row_reasons.append(f"CSV row {row_number} value must be a finite exact number.")
                except ValueError:
                    row_reasons.append(f"CSV row {row_number} has a non-numeric value '{numeric_text}'.")
            else:
                row_reasons.append(f"CSV row {row_number} has an empty mapped value.")
            observation = QuantitativeObservation(
                metric_id=normalize_metric_id(str(measure.get("metric_id") or "")),
                metric_definition=str(measure.get("metric_definition") or "").strip() or None,
                value=value,
                unit=normalize_unit(str(measure.get("unit") or raw.get("unit") or "")),
                entity_id=entity_id,
                entity_name=str(entity_by_key[entity_id].get("name")) if entity_id in entity_by_key and entity_by_key[entity_id].get("name") else None,
                source_entity_id=namespaced_source_id,
                source_entity_name=source_name_value or (str(entity_by_key[entity_id].get("name")) if entity_id in entity_by_key else None),
                source_provider=provider,
                entity_resolution_state=entity_resolution_state,
                geo=geo,
                platform=platform,
                period_start=period_start,
                period_end=period_end,
                snapshot_date=snapshot.isoformat() if snapshot else snapshot_date,
                period_semantics=period_semantics,
                granularity=raw.get("granularity") or None,
                methodology=str(measure.get("methodology") or raw.get("methodology") or "").strip() or None,
                source_reference=source_reference,
                verification_status="unverified",
                provenance_type="csv_dataset",
                provenance_id=report_id,
                observation_type="imported",
                validation_reasons=row_reasons,
                source_validation_reasons=row_reasons,
                report_compatibility_reasons=compatibility_reasons,
                report_compatibility="incompatible" if scope_compatible is False or compatibility_reasons else ("compatible" if scope_compatible is True and geo and platform and ((period_start and period_end) or (period_semantics == "snapshot" and snapshot)) else "unknown"),
                scope_compatible=scope_compatible,
                import_status="imported",
                source_row_number=row_number,
            )
            metric_header = str(measure.get("metric_definition") or "")
            unit = observation.unit
            metric_id = observation.metric_id or ""
            percentage_metric = "%" in metric_header or bool(re.search(r"\bpercent(?:age)?\b|\bpct\b", metric_header, re.IGNORECASE)) or metric_id.endswith("_percent")
            expected_unit = "%" if percentage_metric else ("downloads" if re.search(r"\bdownloads\b", metric_header, re.IGNORECASE) and re.search(r"\byoy\b|\babsolute\b", metric_header, re.IGNORECASE) else None)
            if expected_unit and unit != expected_unit:
                unit_reason = f"CSV row {row_number} metric '{metric_header}' requires unit '{expected_unit}'. Check the metric unit before importing."
                observation = observation.model_copy(update={
                    "validation_reasons": [*observation.validation_reasons, unit_reason],
                    "source_validation_reasons": [*observation.source_validation_reasons, unit_reason],
                })
            source_reasons = list(observation.source_validation_reasons)
            missing = {
                "metric_id": observation.metric_id,
                "metric definition": observation.metric_definition,
                "unit": observation.unit,
                "source entity identity": observation.source_entity_id,
                "GEO": observation.geo,
                "platform": observation.platform,
            }
            for label, supplied in missing.items():
                if supplied in (None, ""):
                    source_reasons.append(f"CSV row {row_number} is missing {label}.")
            period_missing = (
                {"snapshot date": observation.snapshot_date}
                if observation.period_semantics == "snapshot"
                else {"period start": observation.period_start, "period end": observation.period_end}
                if observation.period_semantics in {"reporting_interval", "rolling_interval"}
                else {"period meaning": None}
                if observation.snapshot_date
                else {"period start": observation.period_start, "period end": observation.period_end, "period meaning": None}
            )
            for label, supplied in period_missing.items():
                if supplied in (None, ""):
                    source_reasons.append(f"CSV row {row_number} is missing {label}.")
            if observation.period_semantics in {"reporting_interval", "rolling_interval"} and not observation.granularity and not (observation.period_start and observation.period_end):
                source_reasons.append(f"CSV row {row_number} is missing granularity or explicit period bounds.")
            elif observation.period_semantics == "unknown" and not observation.snapshot_date and not (observation.period_start and observation.period_end):
                source_reasons.append(f"CSV row {row_number} is missing granularity or explicit period bounds.")
            display_ready = bool(observation.metric_id and observation.value is not None and observation.source_entity_id)
            complete = not source_reasons and observation.value is not None
            observation = observation.model_copy(update={
                "validation_reasons": list(dict.fromkeys([*observation.validation_reasons, *source_reasons, *compatibility_reasons])),
                "source_validation_reasons": list(dict.fromkeys(source_reasons)),
                "complete_observation": complete,
                "display_ready": display_ready,
                "analysis_ready": complete,
                "dataset_comparison_ready": complete and bool(observation.methodology and observation.methodology.strip()),
                "comparison_ready": complete and bool(observation.methodology and observation.methodology.strip()) and scope_compatible is True,
            })
            identity = tuple(str(getattr(observation, field) or "").strip().casefold() for field in (
                "metric_id", "metric_definition", "unit", "source_entity_id", "geo", "platform",
                "period_start", "period_end", "granularity", "methodology", "value",
            ))
            if identity in seen_observations:
                duplicate_rows += 1
                duplicate_reason = f"Duplicate observation of CSV row {seen_observations[identity]}."
                observation = observation.model_copy(update={"validation_reasons": [*observation.validation_reasons, duplicate_reason], "source_validation_reasons": [*observation.source_validation_reasons, duplicate_reason], "complete_observation": False, "analysis_ready": False, "dataset_comparison_ready": False, "comparison_ready": False})
            else:
                seen_observations[identity] = row_number
            rows.append(observation.model_dump(mode="json"))
            reasons.extend(observation.validation_reasons)

    if not rows:
        raise ValueError("CSV contains no non-empty data rows.")
    unique_reasons = list(dict.fromkeys(reasons))
    compatible_count = sum(item.get("scope_compatible") is True for item in rows)
    incompatible_count = sum(item.get("scope_compatible") is False for item in rows)
    status = "compatible" if all(item.get("complete_observation") and item.get("report_compatibility") == "compatible" for item in rows) and not ambiguities else ("incompatible" if rows and incompatible_count == len(rows) else "partial")
    if duplicate_rows:
        unique_reasons.append(f"{duplicate_rows} duplicate observation row(s) need review.")
    mapping_requests = list({
        (item["csv_value"], tuple(item["candidates"])): item
        for item in [*ambiguities, *unmatched_entities]
    }.values())
    return rows, unique_reasons, mapping_requests, status


def compatible_for_comparison(left: dict[str, Any], right: dict[str, Any]) -> tuple[bool, list[str]]:
    """Return strict compatibility reasons; no partial-market assumption."""
    reasons: list[str] = []
    for field, label in (("metric_id", "canonical metric identity"), ("metric_definition", "metric definition"), ("unit", "unit"), ("geo", "GEO"), ("platform", "platform"), ("entity_id", "entity"), ("granularity", "granularity"), ("methodology", "measurement methodology")):
        if not left.get(field) or not right.get(field):
            reasons.append(f"Missing {label} on one or both observations.")
        elif str(left[field]).strip().casefold() != str(right[field]).strip().casefold():
            reasons.append(f"Different {label}.")
    for field, label in (("value", "exact numeric value"), ("period_start", "period start"), ("period_end", "period end"), ("provenance_id", "dataset/report provenance")):
        if left.get(field) in (None, "") or right.get(field) in (None, ""):
            reasons.append(f"Missing {label} on one or both observations.")
    for observation in (left, right):
        if not observation.get("source_reference") and not (observation.get("provenance_type") == "csv_dataset" and observation.get("provenance_id")):
            reasons.append("Missing source provenance on one or both observations.")
    if left.get("scope_compatible") is False or right.get("scope_compatible") is False:
        reasons.append("One or both observations are outside the report scope.")
    for side, observation in (("left", left), ("right", right)):
        value = observation.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            reasons.append(f"The {side} observation does not have an exact finite numeric value.")
    return not reasons, reasons


def calculate_change(current: dict[str, Any], previous: dict[str, Any], period_kind: str) -> dict[str, Any]:
    """Calculate a change only for scope-compatible, adjacent periods."""
    if current.get("value_precision", "exact") == "approximate" or previous.get("value_precision", "exact") == "approximate":
        raise ValueError("Derived changes require exact source values; approximate observations may only be displayed as reported.")
    compatible, reasons = compatible_for_comparison(current, previous)
    if not compatible:
        raise ValueError("Incompatible observations: " + "; ".join(reasons))
    start, end = _date(previous.get("period_start")), _date(previous.get("period_end"))
    next_start, next_end = _date(current.get("period_start")), _date(current.get("period_end"))
    if not all((start, end, next_start, next_end)):
        raise ValueError("Both observations need valid start and end dates.")
    if period_kind == "yoy":
        try:
            expected_start, expected_end = start.replace(year=start.year + 1), end.replace(year=end.year + 1)
        except ValueError:  # Feb 29 to a non-leap year
            expected_start, expected_end = start.replace(year=start.year + 1, day=28), end.replace(year=end.year + 1, day=28)
    elif period_kind == "period_over_period":
        expected_start = end + timedelta(days=1)
        granularity = str(current.get("granularity", "")).casefold()
        if granularity == "month":
            year, month = expected_start.year, expected_start.month
            expected_end = date(year, month, calendar.monthrange(year, month)[1])
        elif granularity == "quarter":
            month = ((expected_start.month - 1) // 3) * 3 + 1
            quarter_end_month = month + 2
            expected_start = date(expected_start.year, month, 1)
            expected_end = date(expected_start.year, quarter_end_month, calendar.monthrange(expected_start.year, quarter_end_month)[1])
        elif granularity == "year":
            expected_start = date(expected_start.year, 1, 1)
            expected_end = date(expected_start.year, 12, 31)
        elif granularity == "week":
            expected_end = expected_start + timedelta(days=6)
        elif granularity == "day":
            expected_end = expected_start
        else:
            duration = (end - start).days + 1
            expected_end = expected_start + timedelta(days=duration - 1)
    else:
        raise ValueError("period_kind must be 'yoy' or 'period_over_period'.")
    if (next_start, next_end) != (expected_start, expected_end):
        raise ValueError("Comparison periods are not compatible adjacent periods.")
    current_value, previous_value = current.get("value"), previous.get("value")
    if not isinstance(current_value, (int, float)) or not isinstance(previous_value, (int, float)):
        raise ValueError("Both observations need exact numeric values.")
    absolute = current_value - previous_value
    percentage = None if previous_value == 0 else absolute / abs(previous_value) * 100
    return {
        "metric_id": current["metric_id"], "metric_definition": current.get("metric_definition"),
        "value": absolute, "unit": current["unit"], "entity_id": current["entity_id"],
        "geo": current["geo"], "platform": current["platform"],
        "period_start": previous["period_start"], "period_end": current["period_end"],
        "granularity": current["granularity"],
        "percentage_change": percentage, "period_kind": period_kind,
        "observation_type": "calculated", "verification_status": "unverified",
        "provenance_type": "csv_dataset" if current.get("provenance_type") == previous.get("provenance_type") == "csv_dataset" else "research_report",
        "provenance_ids": [current.get("provenance_id"), previous.get("provenance_id")],
        "source_references": list(dict.fromkeys(filter(None, [current.get("source_reference"), previous.get("source_reference")]))),
    }


def csv_digest(csv_text: str) -> str:
    return hashlib.sha256(csv_text.encode("utf-8-sig")).hexdigest()
