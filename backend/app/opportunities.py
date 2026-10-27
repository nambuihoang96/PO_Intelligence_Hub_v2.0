"""Evidence-backed PO decisions stored in the existing workspace state."""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api import get_session
from backend.app.dataset_metadata import effective_observations
from backend.app.models import ImportedResearchReport, POOpportunityDecision, ProjectTrendUpdate, QuantitativeDataset, ResearchBenchmarkCollection, ResearchProject, ResearchSubject
from backend.app.quantitative_comparisons import _observation_usable
from backend.app.schemas import OpportunityDecisionUpdate

router = APIRouter(prefix="/api/v1/projects", tags=["opportunity decisions"])
SessionDependency = Annotated[Session, Depends(get_session)]


def _project(session: Session, project_id: str) -> ResearchProject:
    project = session.get(ResearchProject, project_id)
    if project is None:
        raise HTTPException(404, detail={"code": "PROJECT_NOT_FOUND", "message": "Research workspace was not found."})
    return project


def _candidate_id(dataset_hash: str, source_entity_id: str) -> str:
    digest = sha256(f"{dataset_hash}:{source_entity_id}".encode("utf-8")).hexdigest()
    return f"csv:{digest}"


def _decision_target_candidate_id(target: dict[str, Any]) -> str:
    # Keep the original context-key algorithm stable so already-saved decisions reopen.
    identity = "|".join(str(target.get(key) or "") for key in
                        ("kind", "target_id", "report_id", "report_content_sha256", "item_key"))
    return f"context:{sha256(identity.encode('utf-8')).hexdigest()}"


def _decision_target_name(session: Session, project_id: str, target: dict[str, Any]) -> str | None:
    kind = target.get("kind")
    if kind == "project":
        project = session.get(ResearchProject, target.get("target_id"))
        return project.name if project and project.id == project_id else None
    if kind in {"report_finding", "report_entity"}:
        report = session.get(ImportedResearchReport, target.get("report_id"))
        if not report or report.project_id != project_id or report.content_sha256 != target.get("report_content_sha256"):
            return None
        data = report.research_data_json if isinstance(report.research_data_json, dict) else {}
        key = "findings" if kind == "report_finding" else "entities"
        item = next((entry for entry in data.get(key, []) if isinstance(entry, dict) and entry.get("key") == target.get("item_key")), None)
        return (item.get("title") or item.get("name")) if item else None
    if kind == "subject":
        subject = session.get(ResearchSubject, target.get("target_id"))
        return subject.name if subject and subject.project_id == project_id else None
    if kind == "collection":
        collection = session.get(ResearchBenchmarkCollection, target.get("target_id"))
        return collection.name if collection and collection.project_id == project_id else None
    if kind == "trend_update":
        update_row = session.get(ProjectTrendUpdate, target.get("target_id"))
        return update_row.exact_claim if update_row and update_row.project_id == project_id else None
    return None


def _dataset_for_workspace(session: Session, project_id: str, dataset_id: str) -> QuantitativeDataset | None:
    dataset = session.get(QuantitativeDataset, dataset_id)
    if dataset is None:
        return None
    if dataset.project_id == project_id:
        return dataset
    report = session.get(ImportedResearchReport, dataset.report_id) if dataset.report_id else None
    return dataset if report is not None and report.project_id == project_id else None


def _source_rows(dataset: QuantitativeDataset, source_entity_id: str) -> list[dict[str, Any]]:
    """Original imported rows, used only to resolve immutable source identity."""
    return [row for row in (dataset.observations_json or []) if isinstance(row, dict) and
            (row.get("source_entity_id") or row.get("entity_id")) == source_entity_id]


def _dataset_report(session: Session, project_id: str, dataset: QuantitativeDataset) -> ImportedResearchReport | None:
    if not dataset.report_id:
        return None
    report = session.get(ImportedResearchReport, dataset.report_id)
    return report if report is not None and report.project_id == project_id else None


def _effective_source_rows(session: Session, project_id: str, dataset: QuantitativeDataset,
                           source_entity_id: str) -> list[dict[str, Any]]:
    """M2's metadata overlay/readiness projection, without changing stored CSV rows."""
    report = _dataset_report(session, project_id, dataset)
    return [row for row in effective_observations(dataset, report)
            if isinstance(row, dict) and (row.get("source_entity_id") or row.get("entity_id")) == source_entity_id]


def _evidence(row: dict[str, Any], dataset: QuantitativeDataset) -> dict[str, Any]:
    return {
        "kind": "quantitative", "dataset_id": dataset.id, "dataset_filename": dataset.filename,
        "dataset_content_sha256": dataset.content_sha256,
        "source_entity_id": row.get("source_entity_id") or row.get("entity_id"),
        "source_entity_name": row.get("source_entity_name") or row.get("entity_name"),
        "source_row_number": row.get("source_row_number"), "metric_id": row.get("metric_id"),
        "metric_definition": row.get("metric_definition"), "value": row.get("value"),
        "value_precision": row.get("value_precision", "exact"),
        "reported_value_text": row.get("reported_value_text"), "unit": row.get("unit"),
        "geo": row.get("geo"), "platform": row.get("platform"), "period_start": row.get("period_start"),
        "period_end": row.get("period_end"), "snapshot_date": row.get("snapshot_date"),
        "period_semantics": row.get("period_semantics", "unknown"), "granularity": row.get("granularity"),
        "methodology": row.get("methodology"), "verification_status": row.get("verification_status", "unverified"),
        "observation_type": row.get("observation_type", "imported"),
        "source_provider": row.get("source_provider"), "source_reference": row.get("source_reference"),
        "provenance_id": row.get("provenance_id"), "metadata_provenance": row.get("metadata_provenance", {}),
        "complete_observation": row.get("complete_observation") is True,
        "analysis_ready": row.get("analysis_ready") is True,
        "dataset_comparison_ready": row.get("dataset_comparison_ready") is True,
        "comparison_ready": row.get("comparison_ready") is True,
        "m2_observation_usable": _observation_usable(row, dataset),
        "comparison_note": "This is observation-level readiness. Compare Periods still checks pair scope and period compatibility.",
        "report_compatibility": row.get("report_compatibility", "unknown"),
        "source_validation_reasons": row.get("source_validation_reasons", []),
        "metadata_validation_reasons": row.get("metadata_validation_reasons", []),
        "validation_reasons": row.get("validation_reasons", []),
    }


def _report_items(session: Session, project_id: str) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for report in session.scalars(select(ImportedResearchReport).where(ImportedResearchReport.project_id == project_id)
                                  .order_by(ImportedResearchReport.imported_at.desc())):
        data = report.research_data_json or {}
        findings = data.get("findings", []) if isinstance(data, dict) else []
        entities = data.get("entities", []) if isinstance(data, dict) else []
        existing_entries = (report.benchmark_workspace_json or {}).get("entries", [])
        po_entries = {(entry.get("item_type"), entry.get("item_key")): entry
                      for entry in existing_entries if isinstance(entry, dict)}
        output.append({
            "report_id": report.id, "question": report.question, "geo": report.geo, "os": report.os,
            "research_period": report.research_period, "content_sha256": report.content_sha256,
            "verification_status": "unverified", "parse_status": report.parse_status,
            "findings": [{"key": item.get("key"), "title": item.get("title"),
                          "finding_type": item.get("finding_type"), "description": item.get("description"),
                          "evidence_status": item.get("evidence_status", "unverified"),
                          "uncertainty": item.get("uncertainty"), "po_implications": item.get("po_implications"),
                          "evidence_references": item.get("evidence_references", []),
                          "existing_po_workspace": po_entries.get(("finding", item.get("key")), {})}
                         for item in findings if isinstance(item, dict) and item.get("key")],
            "entities": [{"key": item.get("key"), "name": item.get("name"), "entity_type": item.get("entity_type"),
                          "evidence_references": item.get("evidence_references", [])}
                         for item in entities if isinstance(item, dict) and item.get("key")],
        })
    return output


def _context_decision_candidates(session: Session, project_id: str,
                                 saved: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Offer explicit report, subject and update targets alongside CSV shortlist products."""
    candidates: list[dict[str, Any]] = []

    def add(target: dict[str, Any], name: str, context_label: str, description: str = "") -> None:
        candidate_id = _decision_target_candidate_id(target)
        if candidate_id in {item["candidate_id"] for item in candidates}:
            return
        candidates.append({
            "candidate_id": candidate_id, "name": name, "source_entity_id": None,
            "dataset_id": None, "dataset_content_sha256": None,
            "dataset_filename": context_label, "selection_reason": description or "Explicit research target",
            "target_kind": target["kind"], "decision_target": target,
            "active_in_shortlist": False, "historical": False, "source_available": True,
            "stale": False, "stale_reasons": [], "quantitative_evidence": [],
            "decision": saved.get(candidate_id),
        })

    project = session.get(ResearchProject, project_id)
    if project:
        add({"kind": "project", "target_id": project.id}, project.name, "Project workspace",
            "PO decision for this research project")

    reports = session.scalars(select(ImportedResearchReport).where(
        ImportedResearchReport.project_id == project_id
    ).order_by(ImportedResearchReport.imported_at.desc()))
    for report in reports:
        data = report.research_data_json or {}
        for kind, collection_key in (("report_finding", "findings"), ("report_entity", "entities")):
            for item in data.get(collection_key, []) if isinstance(data, dict) else []:
                if not isinstance(item, dict) or not item.get("key"):
                    continue
                target = {"kind": kind, "target_id": str(item["key"]), "report_id": report.id,
                          "report_content_sha256": report.content_sha256, "item_key": str(item["key"])}
                add(target, str(item.get("title") or item.get("name") or item["key"]),
                    "Research report", report.question)

    for subject in session.scalars(select(ResearchSubject).where(ResearchSubject.project_id == project_id)):
        add({"kind": "subject", "target_id": subject.id}, subject.name, "Project subject",
            f"{subject.subject_type or 'Research subject'} profile")

    for collection in session.scalars(select(ResearchBenchmarkCollection).where(ResearchBenchmarkCollection.project_id == project_id)):
        add({"kind": "collection", "target_id": collection.id}, collection.name, "Benchmark collection",
            "Project benchmark collection")

    for update_row in session.scalars(select(ProjectTrendUpdate).where(
        ProjectTrendUpdate.project_id == project_id
    ).order_by(ProjectTrendUpdate.published_on.desc(), ProjectTrendUpdate.created_at.desc())):
        add({"kind": "trend_update", "target_id": update_row.id}, update_row.exact_claim,
            "Trend update", update_row.source_title or update_row.source_note)

    current_ids = {item["candidate_id"] for item in candidates}
    for candidate_id, decision in saved.items():
        target = decision.get("decision_target")
        if not candidate_id.startswith("context:") or candidate_id in current_ids or not isinstance(target, dict):
            continue
        name = decision.get("candidate_name") or str(target.get("item_key") or target.get("target_id") or "Historical research target")
        candidates.append({
            "candidate_id": candidate_id, "name": name, "source_entity_id": None,
            "dataset_id": None, "dataset_content_sha256": None,
            "dataset_filename": decision.get("dataset_filename", "Historical research target"),
            "selection_reason": "Previously saved PO decision", "target_kind": target.get("kind"),
            "decision_target": target, "active_in_shortlist": False, "historical": True,
            "source_available": False, "stale": True,
            "stale_reasons": ["The original research target no longer resolves in this project."],
            "quantitative_evidence": [], "decision": {**decision, "revision": decision.get("revision", 1)},
        })
    return candidates


def _resolved_ref(session: Session, project_id: str, candidate: dict[str, Any], reference: dict[str, Any]) -> bool:
    if reference.get("kind") == "quantitative":
        if reference.get("dataset_id") != candidate.get("dataset_id"):
            return False
        dataset = _dataset_for_workspace(session, project_id, reference["dataset_id"])
        if dataset is None or dataset.content_sha256 != candidate.get("dataset_content_sha256"):
            return False
        return any(row.get("source_entity_id") == reference.get("source_entity_id") and
                   row.get("source_row_number") == reference.get("source_row_number") and
                   row.get("metric_id") == reference.get("metric_id")
                   for row in _source_rows(dataset, candidate["source_entity_id"]))
    if reference.get("kind") not in {"report_finding", "report_entity"}:
        return False
    report = session.get(ImportedResearchReport, reference.get("report_id"))
    if report is None or report.project_id != project_id:
        return False
    if reference.get("report_content_sha256") != report.content_sha256:
        return False
    key = "findings" if reference["kind"] == "report_finding" else "entities"
    data = report.research_data_json or {}
    return any(isinstance(item, dict) and item.get("key") == reference.get("item_key")
               for item in (data.get(key, []) if isinstance(data, dict) else []))


def _resolve_saved_refs(session: Session, project_id: str, candidate: dict[str, Any], refs: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    available: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    for ref in refs:
        if not _resolved_ref(session, project_id, candidate, ref):
            unresolved.append({**ref, "stale": True, "reason": "Source reference is missing or no longer belongs to this workspace."})
            continue
        if ref.get("kind") == "quantitative":
            dataset = _dataset_for_workspace(session, project_id, ref["dataset_id"])
            row = next((item for item in _effective_source_rows(session, project_id, dataset, candidate["source_entity_id"])
                        if item.get("source_row_number") == ref.get("source_row_number") and item.get("metric_id") == ref.get("metric_id")), None) if dataset else None
            if row and dataset:
                available.append(_evidence(row, dataset))
        else:
            report = session.get(ImportedResearchReport, ref["report_id"])
            data = report.research_data_json or {} if report else {}
            key = "findings" if ref["kind"] == "report_finding" else "entities"
            item = next((entry for entry in data.get(key, []) if isinstance(entry, dict) and entry.get("key") == ref["item_key"]), None)
            if report and item:
                available.append({"kind": ref["kind"], "report_id": report.id, "report_question": report.question,
                                  "report_sha256": report.content_sha256, "item_key": item["key"],
                                  "title": item.get("title") or item.get("name"), "description": item.get("description"),
                                  "evidence_status": item.get("evidence_status", "unverified"),
                                  "verification_status": "unverified", "evidence_references": item.get("evidence_references", [])})
    return available, unresolved


def get_opportunity_workspace(project_id: str, session: Session) -> dict[str, Any]:
    project = _project(session, project_id)
    state = project.workspace_state_json or {}
    context = state.get("selected_app_context")
    saved = {row.candidate_id: {**(row.decision_json or {}), "revision": row.revision}
             for row in session.scalars(select(POOpportunityDecision).where(POOpportunityDecision.project_id == project_id))}
    candidates: dict[str, dict[str, Any]] = {}
    context_error: str | None = None
    if context:
        dataset = _dataset_for_workspace(session, project_id, str(context.get("dataset_id", "")))
        if dataset is None:
            context_error = "The selected source dataset is missing or outside this workspace."
        elif dataset.content_sha256 != context.get("dataset_content_sha256"):
            context_error = "The source file changed since this shortlist was saved; its evidence is stale."
        else:
            saved_ids = state.get("selected_app_ids", [])
            entity_ids = context.get("source_entity_ids", [])
            for source_id in entity_ids if isinstance(entity_ids, list) else []:
                rows = _source_rows(dataset, source_id)
                candidate_key = _candidate_id(dataset.content_sha256, source_id)
                if not rows:
                    candidates[candidate_key] = {"candidate_id": candidate_key, "name": source_id,
                        "source_entity_id": source_id, "dataset_id": dataset.id,
                        "dataset_content_sha256": dataset.content_sha256, "dataset_filename": dataset.filename,
                        "selection_reason": context.get("selection_criterion") or "Selected from this source file",
                    "active_in_shortlist": source_id in saved_ids if isinstance(saved_ids, list) else False,
                    "historical": source_id not in saved_ids if isinstance(saved_ids, list) else True,
                        "stale": True, "stale_reasons": ["Selected source product no longer exists in the saved dataset."],
                        "quantitative_evidence": [], "decision": saved.get(candidate_key)}
                    continue
                context_refs = [ref for ref in context.get("observation_refs", []) if isinstance(ref, dict) and ref.get("source_entity_id") == source_id]
                bad_refs = [ref for ref in context_refs if not any(row.get("source_row_number") == ref.get("source_row_number") and row.get("metric_id") == ref.get("metric_id") for row in rows)]
                reasons = []
                if not context_refs:
                    reasons.append("No source observation references were saved for this product.")
                if bad_refs:
                    reasons.append("One or more saved observation references no longer resolve.")
                measurement = context.get("measurement") if isinstance(context.get("measurement"), dict) else None
                if measurement:
                    scoped_refs = [ref for ref in context_refs if ref.get("metric_id") == measurement.get("metric_id")]
                    fields = ("metric_definition", "unit", "geo", "platform", "period_start", "period_end", "snapshot_date", "period_semantics", "granularity", "methodology")
                    if not scoped_refs or any(not any(all(row.get(field) == measurement.get(field) for field in fields)
                                                      and row.get("source_row_number") == ref.get("source_row_number")
                                                      and row.get("metric_id") == ref.get("metric_id") for row in rows)
                                               for ref in scoped_refs):
                        reasons.append("Saved measurement scope does not match the referenced source rows.")
                candidates[candidate_key] = {"candidate_id": candidate_key,
                    "name": next((row.get("source_entity_name") or row.get("entity_name") for row in rows if row.get("source_entity_name") or row.get("entity_name")), source_id),
                    "source_entity_id": source_id, "dataset_id": dataset.id,
                    "dataset_content_sha256": dataset.content_sha256, "dataset_filename": dataset.filename,
                    "selection_reason": context.get("selection_criterion") or "Selected from this source file",
                    "active_in_shortlist": source_id in saved_ids if isinstance(saved_ids, list) else False,
                    "historical": source_id not in saved_ids if isinstance(saved_ids, list) else True,
                    "stale": bool(bad_refs or any("scope does not match" in reason for reason in reasons)),
                    "stale_reasons": [reason for reason in reasons if "scope does not match" in reason or "no longer resolve" in reason],
                    "quantitative_evidence": [
                        _evidence(row, dataset) for row in _effective_source_rows(session, project_id, dataset, source_id)
                    ],
                    "decision": saved.get(candidate_key)}
    for candidate_key, decision in saved.items():
        if candidate_key not in candidates and isinstance(decision, dict):
            if candidate_key.startswith("context:"):
                continue
            dataset = _dataset_for_workspace(session, project_id, str(decision.get("dataset_id") or ""))
            source_id = decision.get("source_entity_id")
            source_available = bool(dataset and dataset.content_sha256 == decision.get("dataset_content_sha256")
                                    and source_id and _source_rows(dataset, source_id))
            historical_rows = _effective_source_rows(session, project_id, dataset, source_id) if source_available and dataset and source_id else []
            reasons = [] if source_available else ["The original source file or product identity is no longer available; saved evidence references are retained for review."]
            candidates[candidate_key] = {"candidate_id": candidate_key,
                "name": decision.get("candidate_name") or decision.get("source_entity_id", "Historical candidate"),
                "source_entity_id": source_id, "dataset_id": decision.get("dataset_id"),
                "dataset_content_sha256": decision.get("dataset_content_sha256"),
                "dataset_filename": decision.get("dataset_filename", "Source file unavailable"),
                "selection_reason": decision.get("selection_reason", "Previously assessed candidate"),
                "active_in_shortlist": False, "historical": True,
                "source_available": source_available, "stale": not source_available, "stale_reasons": reasons,
                "quantitative_evidence": [_evidence(row, dataset) for row in historical_rows] if dataset else [],
                "decision": decision}
    for item in _context_decision_candidates(session, project_id, saved):
        candidates[item["candidate_id"]] = item
    for candidate in candidates.values():
        gaps: list[str] = []
        if candidate.get("stale"):
            gaps.extend(candidate.get("stale_reasons", []))
        if candidate.get("historical") and not candidate.get("stale"):
            gaps.append("Historical decision; its original source is still available, but the product is not on the active shortlist.")
        evidence_rows = candidate.get("quantitative_evidence", [])
        if not evidence_rows:
            gaps.append("No current quantitative observations resolve to this candidate.")
        elif any(not item.get("dataset_comparison_ready") for item in evidence_rows):
            gaps.append("Some imported measurements are incomplete for analysis; review their validation details.")
        decision = candidate.get("decision")
        if not isinstance(decision, dict):
            candidate["decision"] = None
            candidate["resolved_decision_evidence"] = []
            candidate["unresolved_decision_evidence"] = []
            gaps.append("No PO assessment or qualitative finding has been saved for this candidate.")
        else:
            refs = list(decision.get("supporting_evidence", [])) + list(decision.get("contradictory_evidence", []))
            refs.extend(ref for assessment in decision.get("assessments", []) if isinstance(assessment, dict)
                        for ref in assessment.get("evidence_refs", []) if isinstance(ref, dict))
            refs = list({str(sorted(ref.items())): ref for ref in refs if isinstance(ref, dict)}.values())
            resolved, unresolved = _resolve_saved_refs(session, project_id, candidate, refs)
            candidate["resolved_decision_evidence"] = resolved
            candidate["unresolved_decision_evidence"] = unresolved
            if not any(ref.get("kind", "").startswith("report_") for ref in decision.get("supporting_evidence", []) + decision.get("contradictory_evidence", [])):
                gaps.append("No qualitative report finding has been explicitly linked to this candidate.")
            if decision.get("open_questions"):
                gaps.extend(f"Open question: {question}" for question in decision["open_questions"][:10])
            if unresolved:
                gaps.append("One or more saved evidence references no longer resolve.")
        candidate["evidence_gaps"] = list(dict.fromkeys(gaps))
    return {"project_id": project.id, "shortlist_dataset_id": context.get("dataset_id") if isinstance(context, dict) else None,
            "shortlist_valid": bool(context) and context_error is None,
            "shortlist_warning": context_error or ("No saved shortlist provenance is available." if not context and state.get("selected_app_ids") else None),
            "candidates": list(candidates.values()), "reports": _report_items(session, project_id)}


def save_opportunity_decision(project_id: str, payload: OpportunityDecisionUpdate, session: Session) -> dict[str, Any]:
    project = _project(session, project_id)
    state = dict(project.workspace_state_json or {})
    decision_row = session.scalar(select(POOpportunityDecision).where(
        POOpportunityDecision.project_id == project_id, POOpportunityDecision.candidate_id == payload.candidate_id
    ))
    prior = {**(decision_row.decision_json or {}), "revision": decision_row.revision} if decision_row else None
    context = state.get("selected_app_context")
    dataset: QuantitativeDataset | None = None
    target = payload.decision_target.model_dump(exclude_none=True) if payload.decision_target else None
    is_active = bool(isinstance(context, dict) and context.get("dataset_id") == payload.dataset_id and
                     payload.source_entity_id in context.get("source_entity_ids", []))
    if payload.dataset_id:
        dataset = _dataset_for_workspace(session, project_id, payload.dataset_id)
    target_name = _decision_target_name(session, project_id, target) if target else None
    if target:
        if payload.dataset_id or payload.source_entity_id:
            raise HTTPException(422, detail={"code": "MIXED_DECISION_TARGET", "message": "Choose either a saved research target or a CSV product for one PO decision."})
        if payload.candidate_id != _decision_target_candidate_id(target):
            raise HTTPException(422, detail={"code": "DECISION_TARGET_ID_MISMATCH", "message": "The PO decision target does not match its saved identity."})
        if target_name is None:
            raise HTTPException(409, detail={"code": "DECISION_TARGET_STALE", "message": "The selected report, subject, or update no longer resolves in this project. The saved decision was not changed."})
    elif is_active:
        if dataset is None or dataset.content_sha256 != payload.dataset_content_sha256 or context.get("dataset_content_sha256") != dataset.content_sha256:
            raise HTTPException(409, detail={"code": "STALE_CANDIDATE_SOURCE", "message": "The selected source file has changed or is no longer available. Refresh the workspace before saving."})
        if not _source_rows(dataset, payload.source_entity_id):
            raise HTTPException(409, detail={"code": "STALE_CANDIDATE_ENTITY", "message": "The selected product is not present in the saved source file."})
        expected_id = _candidate_id(dataset.content_sha256, payload.source_entity_id)
        if payload.candidate_id != expected_id:
            raise HTTPException(422, detail={"code": "CANDIDATE_ID_MISMATCH", "message": "Candidate identity does not match the saved source product."})
    elif not (isinstance(prior, dict) and prior.get("source_entity_id") == payload.source_entity_id and
              prior.get("dataset_id") == payload.dataset_id and prior.get("dataset_content_sha256") == payload.dataset_content_sha256):
        raise HTTPException(409, detail={"code": "CANDIDATE_NOT_IN_WORKSPACE", "message": "This candidate is neither in the active shortlist nor in saved decision history."})
    candidate = {"dataset_id": payload.dataset_id, "dataset_content_sha256": payload.dataset_content_sha256,
                 "source_entity_id": payload.source_entity_id}
    references = payload.supporting_evidence + payload.contradictory_evidence + [
        ref for assessment in payload.assessments for ref in assessment.evidence_refs
    ]
    prior_refs = (prior or {}).get("supporting_evidence", []) + (prior or {}).get("contradictory_evidence", [])
    invalid = [ref.model_dump() for ref in references if not _resolved_ref(session, project_id, candidate, ref.model_dump())
               and not (not is_active and ref.model_dump() in prior_refs)]
    if invalid:
        raise HTTPException(409, detail={"code": "EVIDENCE_REFERENCE_STALE", "message": "One or more evidence references no longer resolve in this workspace.", "references": invalid})
    existing = prior or {}
    candidate_name = existing.get("candidate_name") or (next((row.get("source_entity_name") or row.get("entity_name") for row in _source_rows(dataset, payload.source_entity_id) if row.get("source_entity_name") or row.get("entity_name")), payload.source_entity_id) if dataset else payload.source_entity_id)
    record = payload.model_dump(mode="json", exclude={"expected_revision"})
    if target:
        candidate_name = target_name or candidate_name
        record["decision_target"] = target
    revision_history = existing.get("revision_history", [])
    if not isinstance(revision_history, list):
        revision_history = []
    if decision_row is not None:
        previous = dict(decision_row.decision_json or {})
        previous.pop("revision_history", None)
        revision_history = [*revision_history, {
            "revision": decision_row.revision,
            "saved_at": previous.get("updated_at"),
            "snapshot": previous,
        }]
    record["revision_history"] = revision_history
    record.update({"candidate_name": candidate_name, "dataset_filename": dataset.filename if dataset else existing.get("dataset_filename", "Source file unavailable"),
                   "selection_reason": context.get("selection_criterion") if is_active and isinstance(context, dict) else existing.get("selection_reason", "Previously assessed candidate"),
                   "updated_at": datetime.now(timezone.utc).isoformat()})
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if decision_row is None:
        if payload.expected_revision != 0:
            raise HTTPException(409, detail={"code": "DECISION_REVISION_CONFLICT", "message": "This PO decision was created in another screen. Reload it before saving."})
        session.add(POOpportunityDecision(project_id=project_id, candidate_id=payload.candidate_id,
                                         decision_json=record, revision=1, updated_at=now))
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise HTTPException(409, detail={"code": "DECISION_REVISION_CONFLICT", "message": "Another save created this decision. Reload it before saving."}) from exc
    else:
        if payload.expected_revision != decision_row.revision:
            raise HTTPException(409, detail={"code": "DECISION_REVISION_CONFLICT", "message": "This decision changed in another screen. Reload it; your current edits have not been saved."})
        result = session.execute(update(POOpportunityDecision).where(
            POOpportunityDecision.id == decision_row.id,
            POOpportunityDecision.revision == payload.expected_revision,
        ).values(decision_json=record, revision=payload.expected_revision + 1, updated_at=now))
        if result.rowcount != 1:
            session.rollback()
            raise HTTPException(409, detail={"code": "DECISION_REVISION_CONFLICT", "message": "This decision changed in another screen. Reload it; your current edits have not been saved."})
        session.commit()
    return get_opportunity_workspace(project_id, session)


@router.get("/{project_id}/opportunities")
def read_opportunities(project_id: str, session: SessionDependency) -> dict[str, Any]:
    return get_opportunity_workspace(project_id, session)


@router.put("/{project_id}/opportunities/decisions")
def write_opportunity_decision(project_id: str, payload: OpportunityDecisionUpdate, session: SessionDependency) -> dict[str, Any]:
    return save_opportunity_decision(project_id, payload, session)
