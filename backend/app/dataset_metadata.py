"""Non-destructive metadata overlays on immutable imported observations."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException

from backend.app.quantitative import assess_observation_readiness

FIELDS = ("geo", "platform", "methodology", "unit", "period_start", "period_end", "snapshot_date", "period_semantics", "granularity", "source_reference")
PERIOD_FIELDS = {"period_start", "period_end", "snapshot_date", "period_semantics", "granularity"}


def metadata_group(row: dict) -> str:
    # Distinct original scopes/windows stay distinct; a correction must never
    # flatten a multi-period CSV into one measurement period.
    keys = ("metric_id", "metric_definition", *(field for field in FIELDS if field != "source_reference"))
    return hashlib.sha256(json.dumps([row.get(key) for key in keys], ensure_ascii=False).encode()).hexdigest()[:32]


def review_state(dataset) -> dict:
    return (dataset.field_mapping_json or {}).get("metadata_review", {"revision": 0, "entries": {}, "history": []})


def original_basis(dataset, row: dict, field: str) -> str:
    if row.get(field) in (None, "", "unknown"):
        return "unknown"
    saved = dataset.field_mapping_json or {}
    mapping = saved.get("field_mapping", saved)
    if field == "period_semantics" and row.get(field) == "reporting_interval" and mapping.get("period_start") and mapping.get("period_end"):
        return "csv"
    return "csv" if mapping.get(field) else "po_unverified"


def metadata_view(dataset) -> dict:
    state = review_state(dataset)
    groups = {}
    for row in dataset.observations_json or []:
        key = metadata_group(row)
        if key in groups:
            groups[key]["observations"] += 1
            continue
        fields = {}
        for field in FIELDS:
            entry = state.get("entries", {}).get(key, {}).get(field)
            fields[field] = {
                "original_value": row.get(field), "original_basis": original_basis(dataset, row, field),
                "value": entry["value"] if entry else row.get(field),
                "basis": entry["basis"] if entry else original_basis(dataset, row, field),
                "source_url": entry.get("source_url") if entry else None,
                "source_excerpt": entry.get("source_excerpt", "") if entry else "",
                "confirmed_at": entry.get("confirmed_at") if entry else None,
            }
        groups[key] = {"key": key, "metric": row.get("metric_definition") or row.get("metric_id"), "observations": 1, "fields": fields}
    return dict(dataset_id=dataset.id, report_id=dataset.report_id, filename=dataset.filename,
                content_sha256=dataset.content_sha256, revision=state["revision"],
                groups=list(groups.values()), history=state.get("history", []))


def _metadata_reason(reason: str, changed: set[str]) -> bool:
    """Only replace diagnostics for corrected dimensions, never value/ID errors."""
    text = reason.casefold()
    if changed & PERIOD_FIELDS and any(part in text for part in ("period", "snapshot", "granularity")):
        return True
    return any(re.search(rf"\b{field}\b", text) for field in changed - PERIOD_FIELDS)


def effective_observations(dataset, report=None) -> list[dict]:
    state = review_state(dataset)
    result = []
    for original in dataset.observations_json or []:
        row = dict(original)
        entries = state.get("entries", {}).get(metadata_group(original), {})
        changed = set(entries)
        for field, entry in entries.items():
            row[field] = (entry["value"] or "unknown") if field == "period_semantics" else entry["value"]
        provenance = {
            field: {"basis": entries[field]["basis"], "original_value": original.get(field), **entries[field]}
            if field in entries else {"basis": original_basis(dataset, original, field), "original_value": original.get(field)}
            for field in FIELDS
        }
        row["metadata_provenance"] = provenance
        for field in ("source_validation_reasons", "validation_reasons", "report_compatibility_reasons"):
            row[field] = [reason for reason in row.get(field, []) if not _metadata_reason(reason, changed)]
        blockers = []
        # A free-text method typed during import is not documentation. Legacy
        # files remain readable, but require the same review as new imports.
        if provenance["methodology"]["basis"] not in {"csv", "provider_documentation"}:
            blockers.append("Measurement methodology is not confirmed by CSV or provider documentation. Review dataset information.")
        required_metadata = {"geo", "platform", "unit", "period_semantics"}
        required_metadata |= {"snapshot_date"} if row.get("period_semantics") == "snapshot" else {"period_start", "period_end"}
        for field in required_metadata:
            if provenance[field]["basis"] not in {"csv", "provider_documentation"}:
                blockers.append(f"Metadata {field} lacks a CSV or documented provider basis. Review dataset information.")
        for field, entry in entries.items():
            if field != "granularity" and entry["basis"] not in {"csv", "provider_documentation"}:
                blockers.append(f"Metadata {field} remains {entry['basis']}; a documented basis is needed for comparison.")
        semantics = row.get("period_semantics", "unknown")
        if semantics == "snapshot" and row.get("period_start") and row.get("period_end"):
            blockers.append("Snapshot and interval dates conflict; review dataset information.")
        if semantics in {"reporting_interval", "rolling_interval"} and row.get("snapshot_date"):
            blockers.append("Interval and snapshot dates conflict; review dataset information.")
        date_fields = ("snapshot_date",) if semantics == "snapshot" else ("period_start", "period_end")
        for field in date_fields:
            value = row.get(field)
            if value:
                try:
                    if date.fromisoformat(value) > date.today():
                        blockers.append("Measurement window extends beyond today; completed observed data cannot be claimed.")
                except ValueError:
                    blockers.append(f"Invalid {field}; use an exact calendar date.")
        temporal = [reason for reason in blockers if "future" in reason or "beyond today" in reason or "conflict" in reason or reason.startswith("Invalid ")]
        row["metadata_validation_reasons"] = [reason for reason in blockers if reason not in temporal]
        row["source_validation_reasons"] = list(dict.fromkeys([*row.get("source_validation_reasons", []), *temporal]))
        row["validation_reasons"] = list(dict.fromkeys([*row.get("validation_reasons", []), *blockers]))
        # Re-evaluate the copy, never overwrite the original stored observations.
        result.append(assess_observation_readiness(row, report_geo=report.geo if report else "Unknown", report_platform=report.os if report else "Unknown"))
    return result


def updated_review(dataset, payload) -> dict:
    state = review_state(dataset)
    groups = {item["key"]: item for item in metadata_view(dataset)["groups"]}
    entries = json.loads(json.dumps(state.get("entries", {})))
    changes = []
    seen = set()
    for change in payload.changes:
        identity = (change.group_key, change.field)
        if identity in seen or change.group_key not in groups:
            raise HTTPException(422, detail={"code": "INVALID_METADATA_TARGET", "message": "Choose each existing measurement group and field once."})
        seen.add(identity)
        value = change.model_dump(exclude={"group_key", "field", "replace_existing"})
        current_entry = entries.get(change.group_key, {}).get(change.field)
        if current_entry and all(current_entry.get(k) == v for k, v in value.items()):
            continue
        grouped_rows = [row for row in dataset.observations_json or [] if metadata_group(row) == change.group_key]
        current_values = {row.get(change.field) for row in grouped_rows}
        conflicting_values = {value for value in current_values if value not in (None, "", "unknown", change.value)}
        if conflicting_values and not change.replace_existing:
            raise HTTPException(409, detail={"code": "METADATA_CONFLICT", "message": f"{change.field} already has a different value. Explicitly review replacement before saving."})
        now = datetime.now(timezone.utc).isoformat()
        entries.setdefault(change.group_key, {})[change.field] = {**value, "confirmed_at": now}
        changes.append({"group_key": change.group_key, "field": change.field, "previous": sorted(current_values, key=lambda item: str(item)), "next": value, "recorded_at": now})
    if not changes:
        return state
    if payload.expected_revision != state["revision"]:
        raise HTTPException(409, detail={"code": "METADATA_STALE", "message": "Dataset information changed in another session. Reopen it before saving; your draft has not been applied."})
    return {"revision": state["revision"] + 1, "entries": entries, "history": [*state.get("history", []), *changes]}
