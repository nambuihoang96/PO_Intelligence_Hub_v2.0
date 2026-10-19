"""Deterministic validation helpers for report and CSV numeric observations."""

from __future__ import annotations

import csv
import calendar
import hashlib
import io
import math
import re
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlsplit

from backend.app.research_data import QuantitativeObservation


CSV_FIELD_NAMES = {
    "metric_id", "metric_definition", "value", "unit", "entity_id", "geo",
    "platform", "period_start", "period_end", "granularity", "source_reference", "methodology",
}
UNIT_ALIASES = {"percent": "%", "percentage": "%", "pct": "%", "seconds": "s", "minutes": "min"}
EXACT_NUMBER = re.compile(r"^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?$")


def normalize_metric_id(value: str | None) -> str | None:
    if not value or not value.strip():
        return None
    return re.sub(r"[^a-z0-9]+", "_", value.strip().casefold()).strip("_") or None


def normalize_unit(value: str | None) -> str | None:
    if not value or not value.strip():
        return None
    trimmed = value.strip()
    return UNIT_ALIASES.get(trimmed.casefold(), trimmed)


def _date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


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
    complete = not observation.validation_reasons
    comparison_ready = complete and scope_compatible is True and bool(observation.methodology and observation.methodology.strip())
    return observation.model_dump(mode="json") | {
        "scope_compatible": scope_compatible,
        "complete_observation": complete,
        "comparison_ready": comparison_ready,
        "import_status": "imported" if observation.observation_type == "imported" else "reported",
    }


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
) -> tuple[list[dict[str, Any]], list[str], list[dict[str, Any]], str]:
    """Map CSV rows to typed observations and surface ambiguous entity matches."""
    reader = csv.DictReader(io.StringIO(csv_text, newline=""))
    if not reader.fieldnames:
        raise ValueError("CSV must contain a header row and at least one observation row.")
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

    entity_by_key = {str(item["key"]): item for item in entities}
    names: dict[str, list[str]] = {}
    for entity in entities:
        names.setdefault(str(entity["name"]).strip().casefold(), []).append(str(entity["key"]))
    rows: list[dict[str, Any]] = []
    reasons: list[str] = []
    ambiguities: list[dict[str, Any]] = []
    seen_observations: dict[tuple[str, ...], int] = {}
    duplicate_rows = 0
    years = _report_years(report_period)
    for row_number, row in enumerate(reader, 2):
        if row_number > 10002:
            raise ValueError("CSV has too many data rows (maximum 10,000).")
        if None in row:
            raise ValueError(f"CSV row {row_number} has more values than the header defines.")
        if not any((value or "").strip() for value in row.values()):
            continue
        raw = {target: (row.get(header) or "").strip() for target, header in field_mapping.items()}
        raw_entity = raw.get("entity_id") or None
        entity_id = None
        row_reasons: list[str] = []
        if raw_entity:
            if raw_entity in entity_by_key:
                entity_id = raw_entity
            elif raw_entity in entity_mappings:
                mapped_key = entity_mappings[raw_entity]
                if mapped_key not in entity_by_key:
                    raise ValueError(f"Entity mapping for '{raw_entity}' refers to unknown report entity '{mapped_key}'.")
                entity_id = mapped_key
            else:
                candidates = names.get(raw_entity.casefold(), [])
                if len(candidates) == 1:
                    entity_id = candidates[0]
                elif len(candidates) > 1:
                    ambiguities.append({"csv_value": raw_entity, "row": row_number, "candidates": candidates})
                    row_reasons.append("Entity mapping needs user confirmation.")
                else:
                    row_reasons.append(f"No report entity matches '{raw_entity}'.")
        else:
            row_reasons.append("Entity mapping is not provided.")

        value: float | None = None
        if raw.get("value"):
            try:
                numeric_text = raw["value"]
                if not EXACT_NUMBER.fullmatch(numeric_text):
                    raise ValueError("not a strict numeric literal")
                value = float(numeric_text.replace(",", ""))
                if not math.isfinite(value):
                    value = None
                    row_reasons.append(f"CSV row {row_number} value must be a finite exact number.")
            except ValueError:
                row_reasons.append(f"CSV row {row_number} has a non-numeric value.")
        else:
            pass
        period_start = raw.get("period_start") or None
        period_end = raw.get("period_end") or None
        start_date, end_date = _date(period_start), _date(period_end)
        if period_start and start_date is None:
            row_reasons.append(f"CSV row {row_number} has an invalid period_start; use YYYY-MM-DD.")
        if period_end and end_date is None:
            row_reasons.append(f"CSV row {row_number} has an invalid period_end; use YYYY-MM-DD.")
        if start_date and end_date and start_date > end_date:
            row_reasons.append(f"CSV row {row_number} period_start is after period_end.")

        geo = raw.get("geo") or None
        platform = raw.get("platform") or None
        source_reference = raw.get("source_reference") or None
        if source_reference:
            parsed_source = urlsplit(source_reference)
            if parsed_source.scheme.casefold() not in {"http", "https"} or not parsed_source.hostname or parsed_source.username or parsed_source.password:
                row_reasons.append(f"CSV row {row_number} source must be an HTTP(S) URL without credentials.")
                source_reference = None
        if geo and report_geo.strip().casefold() in {"unknown", "not applicable", "n/a"}:
            row_reasons.append(f"Report GEO scope '{report_geo}' is unspecified.")
        elif geo and not _scope_compatible(geo, report_geo, "geo"):
            row_reasons.append(f"GEO '{geo}' differs from report scope '{report_geo}'.")
        if platform and report_platform.strip().casefold() in {"unknown", "not applicable", "n/a"}:
            row_reasons.append(f"Report platform scope '{report_platform}' is unspecified.")
        elif platform and not _scope_compatible(platform, report_platform, "platform"):
            row_reasons.append(f"Platform '{platform}' differs from report scope '{report_platform}'.")
        if years and start_date and end_date and (end_date.year < years[0] or start_date.year > years[1]):
            row_reasons.append("Observation period does not overlap the report period.")

        scope_compatible: bool | None = True
        for supplied, report_scope, dimension in ((geo, report_geo, "GEO"), (platform, report_platform, "platform")):
            if not supplied or report_scope.strip().casefold() in {"unknown", "not applicable", "n/a"}:
                if scope_compatible is not False:
                    scope_compatible = None
            elif not _scope_compatible(supplied, report_scope, "geo" if dimension == "GEO" else "platform"):
                scope_compatible = False

        observation = QuantitativeObservation(
            metric_id=normalize_metric_id(raw.get("metric_id")),
            metric_definition=raw.get("metric_definition") or None,
            value=value,
            unit=normalize_unit(raw.get("unit")),
            entity_id=entity_id,
            geo=geo,
            platform=platform,
            period_start=period_start,
            period_end=period_end,
            granularity=raw.get("granularity") or None,
            methodology=raw.get("methodology") or None,
            source_reference=source_reference,
            verification_status="unverified",
            provenance_type="csv_dataset",
            provenance_id=report_id,
            observation_type="imported",
            validation_reasons=row_reasons,
            scope_compatible=scope_compatible,
            import_status="imported",
        )
        identity = tuple(str(getattr(observation, field) or "").strip().casefold() for field in (
            "metric_id", "metric_definition", "unit", "entity_id", "geo", "platform",
            "period_start", "period_end", "granularity", "methodology", "value",
        ))
        if identity in seen_observations:
            duplicate_rows += 1
            row_reasons.append(f"Duplicate observation of CSV row {seen_observations[identity]}.")
            observation = observation.model_copy(update={"validation_reasons": [*observation.validation_reasons, row_reasons[-1]], "complete_observation": False, "comparison_ready": False})
        else:
            seen_observations[identity] = row_number
        rows.append(observation.model_dump(mode="json"))
        reasons.extend(observation.validation_reasons)

    if not rows:
        raise ValueError("CSV contains no non-empty data rows.")
    unique_reasons = list(dict.fromkeys(reasons))
    compatible_count = sum(item.get("scope_compatible") is True for item in rows)
    incompatible_count = sum(item.get("scope_compatible") is False for item in rows)
    status = "compatible" if all(item.get("complete_observation") and item.get("scope_compatible") is True for item in rows) and not ambiguities else ("incompatible" if incompatible_count == len(rows) else "partial")
    if duplicate_rows:
        unique_reasons.append(f"{duplicate_rows} duplicate observation row(s) need review.")
    return rows, unique_reasons, ambiguities, status


def compatible_for_comparison(left: dict[str, Any], right: dict[str, Any]) -> tuple[bool, list[str]]:
    """Return strict compatibility reasons; no partial-market assumption."""
    reasons: list[str] = []
    for field, label in (("metric_id", "canonical metric identity"), ("metric_definition", "metric definition"), ("unit", "unit"), ("geo", "GEO"), ("platform", "platform"), ("entity_id", "entity"), ("granularity", "granularity"), ("methodology", "measurement methodology")):
        if not left.get(field) or not right.get(field):
            reasons.append(f"Missing {label} on one or both observations.")
        elif str(left[field]).strip().casefold() != str(right[field]).strip().casefold():
            reasons.append(f"Different {label}.")
    for field, label in (("value", "exact numeric value"), ("period_start", "period start"), ("period_end", "period end"), ("source_reference", "source provenance"), ("provenance_id", "dataset/report provenance")):
        if left.get(field) in (None, "") or right.get(field) in (None, ""):
            reasons.append(f"Missing {label} on one or both observations.")
    if left.get("scope_compatible") is False or right.get("scope_compatible") is False:
        reasons.append("One or both observations are outside the report scope.")
    for side, observation in (("left", left), ("right", right)):
        value = observation.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            reasons.append(f"The {side} observation does not have an exact finite numeric value.")
    return not reasons, reasons


def calculate_change(current: dict[str, Any], previous: dict[str, Any], period_kind: str) -> dict[str, Any]:
    """Calculate a change only for scope-compatible, adjacent periods."""
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
