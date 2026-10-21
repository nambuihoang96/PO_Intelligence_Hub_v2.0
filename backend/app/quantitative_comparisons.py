"""Report-independent, deterministic comparisons over preserved CSV datasets."""

from __future__ import annotations

import hashlib
import json
import math
import re
from calendar import monthrange
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.models import ImportedResearchReport, QuantitativeDataset
from backend.app.dataset_metadata import effective_observations
from backend.app.schemas import (
    QuantitativeComparisonMetric,
    QuantitativeComparisonPeriod,
    QuantitativeComparisonPreview,
    QuantitativeComparisonPreviewRequest,
    QuantitativeComparisonRow,
    QuantitativeComparisonSource,
    QuantitativeComparisonSummary,
    QuantitativeComparisonPeriodReadiness,
    QuantitativeDatasetCatalogItem,
    QuantitativeDatasetCatalogPage,
)

router = APIRouter(prefix="/api/v1/quantitative-comparisons", tags=["quantitative comparisons"])
SessionDependency = Depends(get_session)
_CURRENCY_CODES = {"usd", "eur", "gbp", "jpy", "cny", "krw", "cad", "aud", "nzd", "inr", "brl", "chf", "mxn", "sgd", "hkd", "twd", "thb", "vnd", "zar", "sek", "nok", "dkk", "pln", "idr", "php", "myr"}


def _norm(value: Any) -> str:
    return " ".join(str(value or "").strip().casefold().split())


def _metric_tuple(row: dict[str, Any]) -> tuple[str, str, str, str]:
    return tuple(_norm(row.get(field)) for field in ("metric_id", "metric_definition", "unit", "methodology"))  # type: ignore[return-value]


def _metric_key(row: dict[str, Any]) -> str:
    raw = json.dumps(_metric_tuple(row), ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _date(value: Any) -> date | None:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _saved_mapping(dataset: QuantitativeDataset) -> dict[str, Any]:
    saved = dataset.field_mapping_json or {}
    return saved.get("field_mapping", saved) if isinstance(saved, dict) else {}


def _window(row: dict[str, Any], dataset: QuantitativeDataset) -> dict[str, Any]:
    semantics = row.get("period_semantics") or "unknown"
    start, end = row.get("period_start"), row.get("period_end")
    snapshot = row.get("snapshot_date")
    candidate = None
    # Older import versions mapped a single column named Date to period_start.
    # Preserve it as a candidate snapshot date, never as an interval.
    if not snapshot and start and not end and _norm(_saved_mapping(dataset).get("period_start")) == "date":
        candidate, start = start, None
    if semantics not in {"reporting_interval", "rolling_interval", "snapshot", "unknown"}:
        semantics = "unknown"
    if semantics == "snapshot" and not snapshot:
        snapshot, candidate = candidate, None
        if not snapshot and row.get("period_start") and not row.get("period_end"):
            snapshot = row.get("period_start")
    parts = [semantics, start, end, snapshot, candidate, row.get("granularity")]
    key = hashlib.sha256(json.dumps(parts, separators=(",", ":")).encode("utf-8")).hexdigest()[:32]
    return {
        "key": key, "semantics": semantics, "period_start": start, "period_end": end,
        "snapshot_date": snapshot, "snapshot_date_candidate": candidate,
        "granularity": row.get("granularity"),
    }


def _stable_source_identity(row: dict[str, Any]) -> str | None:
    value = str(row.get("source_entity_id") or "").strip()
    if not value:
        return None
    if ":" in value:
        provider, source_id = value.split(":", 1)
        provider = provider.strip().casefold()
        source_id = source_id.strip()
    else:
        provider = _norm(row.get("source_provider"))
        source_id = value
    # The existing importer creates deterministic name hashes when the file
    # has no provider ID. Those hashes are not stable provider IDs and must
    # never auto-join two apps merely because their names match.
    if not provider or provider in {"csv", "unknown"} or not source_id or source_id.casefold().startswith("name-"):
        return None
    return f"{provider}:{source_id}"


def _observation_warnings(row: dict[str, Any], dataset: QuantitativeDataset) -> list[str]:
    reasons = list(row.get("source_validation_reasons") or [])
    if not reasons:
        compatibility = set(row.get("report_compatibility_reasons") or [])
        reasons = [reason for reason in row.get("validation_reasons") or [] if reason not in compatibility]
    reasons.extend(row.get("metadata_validation_reasons", []))
    if not row.get("provenance_id"):
        reasons.append("Dataset provenance is not attached to this stored observation.")
    if not row.get("methodology") or not str(row.get("methodology")).strip():
        reasons.append("Measurement methodology is not specified; this metric cannot be compared safely.")
    if not row.get("unit") or not str(row.get("unit")).strip():
        reasons.append("Measurement unit is not specified.")
    if not row.get("source_entity_id"):
        reasons.append("Provider source ID is missing; this app will remain unmatched.")
    elif not _stable_source_identity(row):
        reasons.append("Only a name-derived identity is available; automatic matching is disabled.")
    if row.get("period_semantics", "unknown") == "unknown":
        reasons.append("Period meaning needs confirmation before comparison.")
    return list(dict.fromkeys(str(reason) for reason in reasons))


def _observation_usable(row: dict[str, Any], dataset: QuantitativeDataset) -> bool:
    value = row.get("value")
    window = _window(row, dataset)
    semantic = window["semantics"]
    dates_valid = (
        _date(window.get("period_start")) is not None and _date(window.get("period_end")) is not None
        if semantic in {"reporting_interval", "rolling_interval"}
        else _date(window.get("snapshot_date")) is not None if semantic == "snapshot"
        else False
    )
    reasons = _observation_warnings(row, dataset)
    return bool(
        row.get("metric_id") and row.get("metric_definition") and row.get("unit")
        and row.get("methodology") and row.get("geo") and row.get("platform")
        and _stable_source_identity(row) and dates_valid
        and isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        and row.get("provenance_id") and not reasons
    )


def _dataset_catalog(dataset: QuantitativeDataset, report: ImportedResearchReport) -> QuantitativeDatasetCatalogItem:
    observations = effective_observations(dataset, report)
    metrics: dict[str, dict[str, Any]] = {}
    periods: dict[str, dict[str, Any]] = {}
    geos: set[str] = set()
    platforms: set[str] = set()
    apps: set[str] = set()
    dataset_warnings = list(dict.fromkeys(reason for row in observations for reason in row.get("source_validation_reasons", [])))[:8]
    for raw in observations:
        if not isinstance(raw, dict):
            continue
        row = raw
        for field, values in (("geo", geos), ("platform", platforms)):
            if row.get(field):
                values.add(str(row[field]))
        if row.get("source_entity_id"):
            apps.add(str(row["source_entity_id"]))
        key = _metric_key(row)
        if row.get("metric_id") and row.get("metric_definition"):
            current = metrics.setdefault(key, {
                "key": key, "metric_id": row.get("metric_id"), "metric_definition": row.get("metric_definition"),
                "unit": row.get("unit"), "methodology": row.get("methodology"),
                "observations": 0, "usable_observations": 0, "warnings": set(),
            })
            current["observations"] += 1
            if _observation_usable(row, dataset):
                current["usable_observations"] += 1
            current["warnings"].update(_observation_warnings(row, dataset))
        period = _window(row, dataset)
        pkey = period["key"]
        current_period = periods.setdefault(pkey, {
            **period, "observations": 0, "usable_observations": 0,
            "metric_keys": set(), "geos": set(), "platforms": set(), "warnings": set(),
        })
        current_period["observations"] += 1
        if key in metrics and row.get("metric_id") and row.get("metric_definition"):
            current_period["metric_keys"].add(key)
        if row.get("geo"):
            current_period["geos"].add(str(row["geo"]))
        if row.get("platform"):
            current_period["platforms"].add(str(row["platform"]))
        if _observation_usable(row, dataset):
            current_period["usable_observations"] += 1
        current_period["warnings"].update(_observation_warnings(row, dataset))
    metric_items = [QuantitativeComparisonMetric(**{**item, "warnings": sorted(item["warnings"])[:6]}) for item in metrics.values()]
    period_items = [QuantitativeComparisonPeriod(**{
        **item,
        "metric_keys": sorted(item["metric_keys"]), "geos": sorted(item["geos"]),
        "platforms": sorted(item["platforms"]), "warnings": sorted(item["warnings"])[:6],
    }) for item in periods.values()]
    return QuantitativeDatasetCatalogItem(
        id=dataset.id, report_id=dataset.report_id, report_question=report.question,
        filename=dataset.filename, content_sha256=dataset.content_sha256,
        created_at=dataset.created_at, compatibility_status=dataset.compatibility_status,
        metrics=metric_items, periods=period_items, geo_values=sorted(geos),
        platform_values=sorted(platforms), source_apps=len(apps), warnings=dataset_warnings,
    )


def _period_from_catalog(catalog: QuantitativeDatasetCatalogItem, key: str) -> QuantitativeComparisonPeriod:
    for period in catalog.periods:
        if period.key == key:
            return period
    raise HTTPException(status_code=422, detail={"code": "INVALID_PERIOD_SELECTION", "message": "The selected measurement period is not part of this dataset."})


def _confirmed_semantics(period: QuantitativeComparisonPeriod, confirmation: str | None) -> str:
    if period.semantics != "unknown":
        if confirmation and confirmation != period.semantics:
            raise HTTPException(status_code=422, detail={"code": "PERIOD_CONFIRMATION_CONFLICT", "message": "The selected period meaning conflicts with its saved metadata."})
        return period.semantics
    if not confirmation:
        return "unknown"
    if confirmation == "snapshot" and not (period.snapshot_date or period.snapshot_date_candidate):
        raise HTTPException(status_code=422, detail={"code": "SNAPSHOT_DATE_MISSING", "message": "A snapshot needs a source-provided date."})
    if confirmation in {"reporting_interval", "rolling_interval"} and not (period.period_start and period.period_end):
        raise HTTPException(status_code=422, detail={"code": "INTERVAL_BOUNDS_MISSING", "message": "An interval comparison needs explicit start and end dates."})
    return confirmation


def _period_compatibility(left: QuantitativeComparisonPeriod, left_semantics: str, right: QuantitativeComparisonPeriod, right_semantics: str) -> tuple[bool, str, list[str]]:
    reasons: list[str] = []
    if "unknown" in {left_semantics, right_semantics}:
        return False, "unknown", ["Confirm whether each source date is a reporting interval, rolling interval, or snapshot."]
    if left_semantics != right_semantics:
        return False, "unknown", ["Snapshot, reporting-interval, and rolling-interval observations cannot be mixed."]
    if left_semantics == "snapshot":
        left_date = _date(left.snapshot_date or left.snapshot_date_candidate)
        right_date = _date(right.snapshot_date or right.snapshot_date_candidate)
        if not left_date or not right_date:
            reasons.append("Both snapshots need explicit source dates.")
        elif left_date >= right_date:
            reasons.append("Baseline snapshot must be earlier than the current snapshot.")
        if left_date and right_date and max(left_date, right_date) > date.today():
            reasons.append("A snapshot is in the future; completed observed data cannot be claimed.")
        return not reasons, "snapshot", reasons
    left_start, left_end = _date(left.period_start), _date(left.period_end)
    right_start, right_end = _date(right.period_start), _date(right.period_end)
    if not all((left_start, left_end, right_start, right_end)):
        return False, left_semantics, ["Both datasets need explicit period start and end dates."]
    assert left_start and left_end and right_start and right_end
    if max(left_end, right_end) > date.today():
        reasons.append("Reporting window ends in the future; completed observed data cannot be claimed.")
    if (left_end - left_start).days != (right_end - right_start).days:
        reasons.append("The measurement windows have unequal lengths; totals are not normalized or compared automatically.")
    if left_end >= right_start:
        reasons.append("Selected measurement windows overlap or the baseline does not come first.")
    left_granularity, right_granularity = _norm(left.granularity), _norm(right.granularity)
    if left_granularity != right_granularity:
        reasons.append("Period granularity is missing on one side or differs between the selected datasets.")
    else:
        granularity = left_granularity
        def valid_window(start: date, end: date) -> bool:
            if end < start:
                return False
            if not granularity:
                return (end - start).days == (left_end - left_start).days
            if granularity in {"day", "daily"}:
                return start == end
            if granularity in {"week", "weekly"}:
                return (end - start).days == 6
            if granularity in {"month", "monthly"}:
                return start.day == 1 and end.day == monthrange(end.year, end.month)[1] and (start.year, start.month) == (end.year, end.month)
            if granularity in {"quarter", "quarterly"}:
                start_month = ((start.month - 1) // 3) * 3 + 1
                end_month = start_month + 2
                return start.month == start_month and start.day == 1 and end.month == end_month and end.day == monthrange(end.year, end.month)[1] and (start.year, start.month) == (end.year, end.month)
            if granularity in {"year", "yearly", "annual"}:
                return start == date(start.year, 1, 1) and end == date(start.year, 12, 31)
            return (end - start).days == (left_end - left_start).days
        if not valid_window(left_start, left_end) or not valid_window(right_start, right_end):
            reasons.append("Period bounds do not match the selected granularity.")
        if not granularity and (left_end - left_start).days != (right_end - right_start).days:
            reasons.append("Without a stated granularity, the exact window lengths differ.")
    return not reasons, left_semantics, list(dict.fromkeys(reasons))


def _source_read(
    row: dict[str, Any], dataset: QuantitativeDataset, report: ImportedResearchReport,
    *, confirmed_semantics: str | None = None,
) -> QuantitativeComparisonSource:
    row = _with_confirmed_semantics(row, confirmed_semantics)
    return QuantitativeComparisonSource(
        value=row.get("value"), value_precision=row.get("value_precision", "exact"), unit=row.get("unit"),
        geo=row.get("geo"), platform=row.get("platform"), period_start=row.get("period_start"),
        period_end=row.get("period_end"), snapshot_date=row.get("snapshot_date"),
        period_semantics=row.get("period_semantics", "unknown"), granularity=row.get("granularity"),
        methodology=row.get("methodology"), entity_name=row.get("source_entity_name") or row.get("entity_name"),
        source_entity_id=row.get("source_entity_id"), source_provider=row.get("source_provider"),
        verification_status=row.get("verification_status", "unverified"), dataset_id=dataset.id,
        filename=dataset.filename, report_id=report.id, report_question=report.question,
        source_row_number=row.get("source_row_number"), source_reference=row.get("source_reference"),
        provenance_id=row.get("provenance_id"), validation_reasons=_observation_warnings(row, dataset),
        metadata_provenance=row.get("metadata_provenance", {}),
    )


def _same_metric(row: dict[str, Any], requested: QuantitativeComparisonPreviewRequest) -> bool:
    return _metric_tuple(row) == tuple(_norm(getattr(requested, field)) for field in ("metric_id", "metric_definition", "unit", "methodology"))


def _with_confirmed_semantics(row: dict[str, Any], semantics: str | None) -> dict[str, Any]:
    result = dict(row)
    if not semantics or semantics == "unknown":
        return result
    result["period_semantics"] = semantics
    if semantics == "snapshot":
        if not result.get("snapshot_date"):
            result["snapshot_date"] = result.get("period_start")
        result["period_start"] = None
        result["period_end"] = None
    elif semantics in {"reporting_interval", "rolling_interval"}:
        result["snapshot_date"] = None
    for field in ("source_validation_reasons", "validation_reasons"):
        cleaned: list[str] = []
        for reason in result.get(field, []):
            normalized = str(reason).casefold()
            if "period meaning" in normalized or "period semantics" in normalized or "snapshot date semantics" in normalized:
                continue
            if semantics == "snapshot" and ("period start" in normalized or "period end" in normalized or "granularity or explicit period bounds" in normalized):
                continue
            if semantics in {"reporting_interval", "rolling_interval"} and "snapshot date" in normalized:
                continue
            cleaned.append(reason)
        result[field] = cleaned
    return result


def _period_key_for_row(row: dict[str, Any], dataset: QuantitativeDataset) -> str:
    return _window(row, dataset)["key"]


def _metric_calculation_is_precomputed(row: dict[str, Any]) -> bool:
    meaning = f"{row.get('metric_id') or ''} {row.get('metric_definition') or ''}".casefold()
    return bool(re.search(r"\byoy\b|year[ -]over[ -]year|yearly growth|annual growth", meaning))


def _revenue_currency_is_identified(row: dict[str, Any]) -> bool:
    meaning = f"{row.get('metric_id') or ''} {row.get('metric_definition') or ''}".casefold()
    if not re.search(r"\brevenue\b|\bmonetary sales\b", meaning):
        return True
    unit = str(row.get("unit") or "").casefold()
    return bool(re.search(r"\b(?:" + "|".join(sorted(_CURRENCY_CODES)) + r")\b", unit))


@router.get("/datasets", response_model=QuantitativeDatasetCatalogPage)
def list_comparison_datasets(
    session: Session = Depends(get_session),
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=100),
) -> QuantitativeDatasetCatalogPage:
    query = select(QuantitativeDataset).order_by(QuantitativeDataset.created_at.desc(), QuantitativeDataset.id.desc())
    if cursor:
        cursor_dataset = session.get(QuantitativeDataset, cursor)
        if cursor_dataset is None:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR", "message": "The comparison dataset cursor is invalid."})
        query = query.where(or_(
            QuantitativeDataset.created_at < cursor_dataset.created_at,
            and_(QuantitativeDataset.created_at == cursor_dataset.created_at, QuantitativeDataset.id < cursor_dataset.id),
        ))
    rows = list(session.scalars(query.limit(limit + 1)))
    has_more = len(rows) > limit
    selected = rows[:limit]
    items: list[QuantitativeDatasetCatalogItem] = []
    for dataset in selected:
        report = session.get(ImportedResearchReport, dataset.report_id)
        if report is not None:
            items.append(_dataset_catalog(dataset, report))
    return QuantitativeDatasetCatalogPage(items=items, next_cursor=selected[-1].id if has_more and selected else None, limit=limit)


@router.post("/preview", response_model=QuantitativeComparisonPreview)
def preview_quantitative_comparison(
    payload: QuantitativeComparisonPreviewRequest,
    session: Session = Depends(get_session),
) -> QuantitativeComparisonPreview:
    baseline = session.get(QuantitativeDataset, payload.baseline_dataset_id)
    current = session.get(QuantitativeDataset, payload.current_dataset_id)
    if baseline is None or current is None:
        raise HTTPException(status_code=404, detail={"code": "DATASET_NOT_FOUND", "message": "One or both selected CSV datasets were not found."})
    if baseline.content_sha256 == current.content_sha256:
        raise HTTPException(status_code=422, detail={"code": "DUPLICATE_DATASET_SELECTION", "message": "These files contain identical CSV data. Choose a different reporting export."})
    baseline_report = session.get(ImportedResearchReport, baseline.report_id)
    current_report = session.get(ImportedResearchReport, current.report_id)
    if baseline_report is None or current_report is None:
        raise HTTPException(status_code=409, detail={"code": "DATASET_REPORT_MISSING", "message": "A selected dataset has lost its report provenance; no comparison was produced."})
    left_catalog, right_catalog = _dataset_catalog(baseline, baseline_report), _dataset_catalog(current, current_report)
    left_period = _period_from_catalog(left_catalog, payload.baseline_period_key)
    right_period = _period_from_catalog(right_catalog, payload.current_period_key)
    left_semantics = _confirmed_semantics(left_period, payload.baseline_semantics_confirmation)
    right_semantics = _confirmed_semantics(right_period, payload.current_semantics_confirmation)
    period_ok, period_kind, period_reasons = _period_compatibility(left_period, left_semantics, right_period, right_semantics)
    baseline_period_result = left_period.model_copy(update={
        "semantics": left_semantics,
        "snapshot_date": left_period.snapshot_date or (left_period.snapshot_date_candidate if left_semantics == "snapshot" else None),
    })
    current_period_result = right_period.model_copy(update={
        "semantics": right_semantics,
        "snapshot_date": right_period.snapshot_date or (right_period.snapshot_date_candidate if right_semantics == "snapshot" else None),
    })

    identity = tuple(_norm(getattr(payload, field)) for field in ("metric_id", "metric_definition", "unit", "methodology"))
    left_matching = [row for row in effective_observations(baseline, baseline_report) if _metric_tuple(row) == identity]
    right_matching = [row for row in effective_observations(current, current_report) if _metric_tuple(row) == identity]
    if not left_matching or not right_matching:
        raise HTTPException(status_code=422, detail={"code": "METRIC_NOT_SHARED", "message": "This exact metric definition, unit, and methodology is not available in both files."})
    if any(not _revenue_currency_is_identified(row) for row in [*left_matching, *right_matching]):
        raise HTTPException(status_code=422, detail={
            "code": "METRIC_CURRENCY_REQUIRED",
            "message": "Revenue observations need an explicit currency in their unit before they can be compared.",
        })

    def scoped(rows: list[dict[str, Any]], dataset: QuantitativeDataset, period_key: str) -> list[dict[str, Any]]:
        return [row for row in rows if _norm(row.get("geo")) == _norm(payload.geo)
                and _norm(row.get("platform")) == _norm(payload.platform)
                and _period_key_for_row(row, dataset) == period_key]

    left_rows = [
        _with_confirmed_semantics(row, left_semantics)
        for row in scoped(left_matching, baseline, payload.baseline_period_key)
    ]
    right_rows = [
        _with_confirmed_semantics(row, right_semantics)
        for row in scoped(right_matching, current, payload.current_period_key)
    ]
    if not left_rows or not right_rows:
        raise HTTPException(status_code=422, detail={"code": "SCOPE_OR_PERIOD_NOT_SHARED", "message": "Choose a GEO, platform, and period that have observations in both selected files."})

    def group(rows: list[dict[str, Any]], dataset: QuantitativeDataset) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
        grouped: dict[str, list[dict[str, Any]]] = {}
        unmatchable: list[dict[str, Any]] = []
        for index, row in enumerate(rows):
            stable = _stable_source_identity(row)
            if stable:
                grouped.setdefault(stable, []).append(row)
            else:
                # Keep every source-only app in the universe, but never join it
                # to another dataset by name or a name-derived pseudo-ID.
                key = f"unmatched:{dataset.id}:{row.get('source_row_number') or index}"
                unmatchable.append({"key": key, "row": row})
        return grouped, unmatchable

    left_grouped, left_unmatched = group(left_rows, baseline)
    right_grouped, right_unmatched = group(right_rows, current)
    all_keys = sorted(set(left_grouped) | set(right_grouped))
    items: list[QuantitativeComparisonRow] = []
    matched = baseline_only = current_only = comparable = missing = ambiguous = duplicates = invalid = 0
    metric_sample = (left_matching or right_matching)[0]
    for source_key in all_keys:
        left = left_grouped.get(source_key, [])
        right = right_grouped.get(source_key, [])
        matched_by = "provider_source_id"
        if left and right:
            matched += 1
        elif left:
            baseline_only += 1
        else:
            current_only += 1
        left_names = {_norm(row.get("source_entity_name") or row.get("entity_name")) for row in left if row.get("source_entity_name") or row.get("entity_name")}
        right_names = {_norm(row.get("source_entity_name") or row.get("entity_name")) for row in right if row.get("source_entity_name") or row.get("entity_name")}
        reasons: list[str] = []
        status = "comparable"
        if len(left) > 1 or len(right) > 1:
            status = "duplicate_observations"
            reasons.append("More than one observation for this source ID, metric, scope, and selected period. No value was aggregated.")
            duplicates += 1
        elif left and right and left_names and right_names and left_names != right_names:
            status = "identity_conflict"
            reasons.append("The same provider ID has conflicting app names across the selected files. Confirm identity before comparing.")
            ambiguous += 1
        elif not period_ok:
            status = "incompatible_periods"
            reasons.extend(period_reasons)
        elif any(
            _observation_warnings(_with_confirmed_semantics(row, semantics), source_dataset)
            for row, source_dataset, semantics in (
                *[(item, baseline, left_semantics) for item in left],
                *[(item, current, right_semantics) for item in right],
            )
        ):
            status = "needs_review"
            for side, side_rows, source_dataset in (("Baseline", left, baseline), ("Current", right, current)):
                for row in side_rows:
                    semantics = left_semantics if side == "Baseline" else right_semantics
                    confirmed_row = _with_confirmed_semantics(row, semantics)
                    reasons.extend(f"{side}: {warning}" for warning in _observation_warnings(confirmed_row, source_dataset))
        elif not left:
            status = "missing_baseline"
            reasons.append("App is present in the current file but has no baseline observation for this metric and period.")
        elif not right:
            status = "missing_current"
            reasons.append("App is present in the baseline file but has no current observation for this metric and period.")
        else:
            if status == "comparable" and (left[0].get("value_precision", "exact") != "exact" or right[0].get("value_precision", "exact") != "exact"):
                status = "needs_review"
                reasons.append("Derived changes require exact source values; approximate observations remain visible without calculated changes.")
        baseline_source = _source_read(left[0], baseline, baseline_report, confirmed_semantics=left_semantics) if left else None
        current_source = _source_read(right[0], current, current_report, confirmed_semantics=right_semantics) if right else None
        absolute = percentage = None
        percentage_reason = None
        formula = None
        change_unit = "percentage points" if _norm(payload.unit) in {"%", "percent", "percentage"} else payload.unit
        if status == "comparable" and left and right:
            before, after = left[0].get("value"), right[0].get("value")
            if all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in (before, after)):
                absolute = float(after) - float(before)
                formula = "Current source value − baseline source value"
                if _metric_calculation_is_precomputed(metric_sample) or _norm(payload.unit) in {"%", "percent", "percentage"}:
                    percentage_reason = "Relative growth is withheld for percentage or precomputed growth metrics; the point/value difference is shown instead."
                elif float(before) == 0:
                    percentage_reason = "Percentage change is unavailable because the baseline is zero."
                elif float(before) < 0 or float(after) < 0:
                    percentage_reason = "Percentage change is withheld for negative or signed source values."
                else:
                    percentage = (float(after) - float(before)) / float(before) * 100
                    formula += " · Percentage change = (current − baseline) / baseline × 100"
                comparable += 1
            else:
                status = "needs_review"
                reasons.append("One or both source rows do not contain an exact finite numeric value.")
        elif status in {"missing_baseline", "missing_current"}:
            missing += 1
        elif status in {"identity_conflict", "duplicate_observations"}:
            pass
        else:
            pass
        evidence = [
            *([_source_read(row, baseline, baseline_report) for row in left]),
            *([_source_read(row, current, current_report) for row in right]),
        ]
        name = (left[0].get("source_entity_name") or left[0].get("entity_name") if left else None) or (right[0].get("source_entity_name") or right[0].get("entity_name") if right else None) or source_key
        items.append(QuantitativeComparisonRow(
            entity_key=source_key, entity_name=str(name), matched_by=matched_by,
            status=status, baseline=baseline_source, current=current_source,
            absolute_change=absolute, change_unit=change_unit if absolute is not None else None,
            percentage_change=percentage, percentage_change_unavailable_reason=percentage_reason,
            formula=formula, evidence=evidence, reasons=list(dict.fromkeys(reasons)),
        ))
    for entry in [*left_unmatched, *right_unmatched]:
        row, key = entry["row"], entry["key"]
        is_baseline = entry in left_unmatched
        source_dataset, source_report = (baseline, baseline_report) if is_baseline else (current, current_report)
        source = _source_read(
            row, source_dataset, source_report,
            confirmed_semantics=left_semantics if is_baseline else right_semantics,
        )
        items.append(QuantitativeComparisonRow(
            entity_key=key,
            entity_name=str(row.get("source_entity_name") or row.get("entity_name") or f"Unmatched app {row.get('source_row_number') or ''}"),
            matched_by="unmatched_source_id", status="missing_current" if is_baseline else "missing_baseline",
            baseline=source if is_baseline else None, current=None if is_baseline else source,
            evidence=[source], reasons=["No stable provider ID was supplied. This row is retained and not matched by app name."],
        ))
        if is_baseline:
            baseline_only += 1
        else:
            current_only += 1
        missing += 1

    # Measurements with malformed values or missing source metadata are retained
    # as warnings, never silently converted to zero or dropped from diagnostics.
    invalid = sum(1 for row in left_rows if not _observation_usable(row, baseline)) + sum(
        1 for row in right_rows if not _observation_usable(row, current)
    )
    metric_warnings = sorted(set(
        warning for row in [*left_rows, *right_rows]
        for warning in _observation_warnings(row, baseline if row in left_rows else current)
    ))[:20]
    summary = QuantitativeComparisonSummary(
        matched_apps=matched, baseline_only_apps=baseline_only, current_only_apps=current_only,
        distinct_apps=len(items), comparable_apps=comparable, missing_data_apps=missing,
        ambiguous_apps=ambiguous, duplicate_observation_apps=duplicates, invalid_observations=invalid,
    )
    metric_result = next((item for item in left_catalog.metrics if _metric_tuple(item.model_dump()) == identity), None)
    if metric_result is None:
        metric_result = next(item for item in right_catalog.metrics if _metric_tuple(item.model_dump()) == identity)
    return QuantitativeComparisonPreview(
        baseline=left_catalog, current=right_catalog, metric=metric_result,
        geo=payload.geo, platform=payload.platform, baseline_period=baseline_period_result,
        current_period=current_period_result,
        period_readiness=QuantitativeComparisonPeriodReadiness(compatible=period_ok, kind=period_kind, reasons=period_reasons),
        summary=summary, rows=items, metric_warnings=metric_warnings,
    )
