"""Regression coverage for workspace-first CSV and report workflows."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db import create_database_engine, get_database_path
from backend.app.models import ImportedResearchReport, POOpportunityDecision, QuantitativeDataset, ResearchProject
from backend.app.opportunities import get_opportunity_workspace, save_opportunity_decision
from backend.app.dataset_metadata import effective_observations, metadata_group
from backend.app.quantitative_comparisons import list_comparison_datasets
from backend.app.quantitative_comparisons import _observation_usable
from backend.app.reports import import_report
from backend.app.schemas import ImportedReportCreate, OpportunityDecisionUpdate, QuantitativeDatasetImport, ResearchWorkspaceStateUpdate
from backend.app.workspace_data import (
    import_workspace_dataset,
    link_report,
    list_workspace_datasets,
    list_workspace_reports,
    update_workspace_state,
)


class DataFirstWorkspaceTest(unittest.TestCase):
    def setUp(self) -> None:
        root = Path(__file__).resolve().parents[1]
        scratch = root / ".m4-test-tmp"
        scratch.mkdir(exist_ok=True)
        self.temp_dir = tempfile.TemporaryDirectory(dir=scratch)
        self.data_root = Path(self.temp_dir.name) / "application-data"
        self.env = patch.dict(os.environ, {"APP_DATA_ROOT": str(self.data_root)})
        self.env.start()
        command.upgrade(Config(str(root / "alembic.ini")), "head")
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        self.project = ResearchProject(name="CSV first workflow")
        self.session.add(self.project)
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()
        self.env.stop()
        self.temp_dir.cleanup()

    @staticmethod
    def csv_payload(content: str = "Unified Name;Unified ID;Platform;Downloads (Absolute)\nAlpha;st-alpha;Unified;120\n"):
        return QuantitativeDatasetImport.model_validate({
            "filename": "market-export.csv",
            "csv_content": content,
            "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform"},
            "metric_mappings": [{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads", "methodology": "Sensor Tower export"}],
            "explicit_values": {"geo": "Worldwide", "period_start": "2026-09-01", "period_end": "2026-09-30", "granularity": "rolling_interval", "period_semantics": "rolling_interval"},
        })

    def test_csv_can_be_saved_explored_and_reopened_without_a_report(self) -> None:
        payload = self.csv_payload()
        response = Response()
        saved = import_workspace_dataset(self.project.id, payload, response, self.session)
        self.assertIsNone(saved.report_id)
        self.assertEqual(saved.project_id, self.project.id)
        self.assertEqual(saved.observations[0].source_entity_id, "sensor_tower:st-alpha")
        self.assertEqual(saved.observations[0].platform, "Unified")
        self.assertEqual(saved.observations[0].geo, "Worldwide")
        self.assertEqual(self.session.get(QuantitativeDataset, saved.id).original_csv, payload.csv_content)

        duplicate_response = Response()
        duplicate = import_workspace_dataset(self.project.id, payload, duplicate_response, self.session)
        self.assertEqual(duplicate_response.status_code, 200)
        self.assertEqual(duplicate.id, saved.id)
        self.assertEqual(len(list_workspace_datasets(self.project.id, self.session).items), 1)

        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(selected_app_ids=["st-alpha"]), self.session)
        self.assertEqual(self.session.get(ResearchProject, self.project.id).workspace_state_json["selected_app_ids"], ["st-alpha"])
        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(selected_app_ids=["st-alpha"], selection_criterion="Highest supplied downloads in this file"), self.session)
        self.assertEqual(self.session.get(ResearchProject, self.project.id).workspace_state_json["selected_app_criterion"], "Highest supplied downloads in this file")

    def test_shortlist_context_persists_without_replacing_other_workspace_state(self) -> None:
        project = self.session.get(ResearchProject, self.project.id)
        project.workspace_state_json = {"po_workspace_preferences": {"view": "data"}}
        self.session.commit()
        context = {
            "dataset_id": "dataset-source-1", "dataset_filename": "market.csv", "dataset_content_sha256": "a" * 64,
            "selection_type": "rule_based", "source_entity_ids": ["st-alpha"],
            "selection_criterion": "Five highest supplied values in one CSV scope", "measurement": {"metric_id": "downloads_absolute", "unit": "downloads", "geo": "Worldwide", "platform": "Unified", "period_start": "2026-09-01", "period_end": "2026-09-30", "methodology": "Sensor export"},
            "observation_refs": [{"source_entity_id": "st-alpha", "source_row_number": 2, "metric_id": "downloads_absolute"}],
        }
        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(selected_app_ids=["st-alpha"], selection_criterion=context["selection_criterion"], selected_app_context=context), self.session)
        saved = self.session.get(ResearchProject, self.project.id).workspace_state_json
        self.assertEqual(saved["selected_app_context"], context)
        self.assertEqual(saved["selected_app_context"]["dataset_id"], "dataset-source-1")
        self.assertEqual(saved["po_workspace_preferences"], {"view": "data"})

    def test_legacy_shortlist_state_does_not_gain_invented_provenance(self) -> None:
        project = self.session.get(ResearchProject, self.project.id)
        project.workspace_state_json = {"selected_app_ids": ["legacy-app"], "selected_app_criterion": "Previously saved"}
        self.session.commit()
        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(selected_app_ids=["legacy-app"]), self.session)
        saved = self.session.get(ResearchProject, self.project.id).workspace_state_json
        self.assertNotIn("selected_app_context", saved)
        self.assertEqual(saved["selected_app_ids"], ["legacy-app"])
        self.assertEqual(saved["selected_app_criterion"], "Previously saved")

    def test_workspace_dataset_and_report_cursors_expose_records_beyond_first_page(self) -> None:
        datasets = [QuantitativeDataset(
            id=f"dataset-{index:03d}", project_id=self.project.id, report_id=None,
            filename=f"export-{index:03d}.csv", content_sha256=f"{index:064x}", original_csv="",
            field_mapping_json={}, entity_mappings_json={}, observations_json=[],
            compatibility_status="partial", validation_reasons_json=[],
        ) for index in range(101)]
        reports = [ImportedResearchReport(
            id=f"report-{index:03d}", project_id=self.project.id, question=f"Question {index}", geo="Worldwide", os="Unknown",
            research_period=None, content=f"# Report {index}", research_data_json={}, parse_status="NEEDS_STRUCTURING",
            extraction_error=None, benchmark_selections_json=[], benchmark_workspace_json={},
            content_sha256=f"{index + 1000:064x}", origin="chatgpt_user_import",
        ) for index in range(101)]
        self.session.add_all([*datasets, *reports])
        self.session.commit()

        dataset_ids: list[str] = []
        cursor = None
        while True:
            page = list_workspace_datasets(self.project.id, self.session, cursor=cursor, limit=20)
            dataset_ids.extend(item.id for item in page.items)
            cursor = page.next_cursor
            if not cursor:
                break
        report_ids: list[str] = []
        cursor = None
        while True:
            page = list_workspace_reports(self.project.id, self.session, cursor=cursor, limit=20)
            report_ids.extend(item.id for item in page.items)
            cursor = page.next_cursor
            if not cursor:
                break
        self.assertEqual(len(dataset_ids), 101)
        self.assertEqual(len(set(dataset_ids)), 101)
        self.assertEqual(len(report_ids), 101)
        self.assertEqual(len(set(report_ids)), 101)

    def test_saved_source_row_count_ignores_blank_csv_padding(self) -> None:
        populated = "Unified Name;Unified ID;Platform;Downloads (Absolute)\nAlpha;st-alpha;Unified;120\n"
        padded = populated + ("\n" * 9975)
        dataset = import_workspace_dataset(self.project.id, self.csv_payload(padded), Response(), self.session)
        self.assertEqual(dataset.source_rows, 1)
        self.assertEqual(len(dataset.observations), 1)
        self.assertEqual(self.session.get(QuantitativeDataset, dataset.id).original_csv, padded)


    def test_report_can_join_workspace_and_report_owned_data_remains_listed(self) -> None:
        csv_payload = self.csv_payload()
        csv_response = Response()
        dataset = import_workspace_dataset(self.project.id, csv_payload, csv_response, self.session)
        report = import_report(ImportedReportCreate(
            project_id=None,
            question="What does the market export show?",
            geo="Worldwide",
            os="Unified",
            content="# Market research\n\nThe supplied report is qualitative and remains unverified.",
        ), Response(), self.session)
        # A report-owned dataset with the same digest is retained as a distinct
        # provenance record and still appears in workspace-scoped exploration.
        report_dataset = QuantitativeDataset(
            report_id=report.id, project_id=None, filename="same-market-export.csv",
            content_sha256=dataset.content_sha256, original_csv=csv_payload.csv_content,
            field_mapping_json={}, entity_mappings_json={}, observations_json=[],
            compatibility_status="partial", validation_reasons_json=[],
        )
        self.session.add(report_dataset)
        self.session.commit()
        linked = link_report(self.project.id, report.id, self.session)
        self.assertEqual(linked.project_id, self.project.id)
        self.assertIsNone(self.session.get(QuantitativeDataset, report_dataset.id).project_id)
        workspaces = list_workspace_datasets(self.project.id, self.session)
        self.assertEqual({item.id for item in workspaces.items}, {dataset.id, report_dataset.id})
        catalog = list_comparison_datasets(session=self.session, project_id=self.project.id, limit=50)
        self.assertEqual({item.id for item in catalog.items}, {dataset.id, report_dataset.id})

        attached_report = import_report(ImportedReportCreate(
            project_id=self.project.id,
            question="Research imported directly into this workspace",
            geo="Worldwide",
            os="Unified",
            content="# Attached report\n\nReport ownership is stored separately from CSV provenance.",
        ), Response(), self.session)
        page = list_workspace_reports(self.project.id, self.session, limit=20)
        self.assertEqual({item.id for item in page.items}, {report.id, attached_report.id})

    def test_opportunity_decision_resolves_real_workspace_observation_and_survives_new_shortlist(self) -> None:
        imported = import_workspace_dataset(self.project.id, self.csv_payload(), Response(), self.session)
        row = imported.observations[0]
        source_id = row.source_entity_id
        context = {
            "dataset_id": imported.id, "dataset_filename": imported.filename,
            "dataset_content_sha256": imported.content_sha256, "selection_type": "manual",
            "source_entity_ids": [source_id], "selection_criterion": "Selected by PO from this file",
            "measurement": {"metric_id": row.metric_id, "metric_definition": row.metric_definition,
                            "unit": row.unit, "geo": row.geo, "platform": row.platform,
                            "period_start": row.period_start, "period_end": row.period_end,
                            "snapshot_date": row.snapshot_date, "period_semantics": row.period_semantics,
                            "granularity": row.granularity,
                            "methodology": row.methodology},
            "observation_refs": [{"source_entity_id": source_id, "source_row_number": row.source_row_number,
                                  "metric_id": row.metric_id}],
        }
        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(
            selected_app_ids=[source_id], selection_criterion=context["selection_criterion"], selected_app_context=context), self.session)
        candidate = get_opportunity_workspace(self.project.id, self.session)["candidates"][0]
        self.assertFalse(candidate["stale"])
        self.assertEqual(candidate["quantitative_evidence"][0]["value"], row.value)
        self.assertEqual(candidate["quantitative_evidence"][0]["verification_status"], "unverified")
        reference = {"kind": "quantitative", "dataset_id": imported.id, "source_entity_id": source_id,
                     "source_row_number": row.source_row_number, "metric_id": row.metric_id}
        saved = save_opportunity_decision(self.project.id, OpportunityDecisionUpdate(
            candidate_id=candidate["candidate_id"], dataset_id=imported.id,
            dataset_content_sha256=imported.content_sha256, source_entity_id=source_id,
            decision_status="investigate", rationale="Worth validating", priority="high",
            next_action="Review retention evidence", supporting_evidence=[reference],
            assessments=[{"dimension": "Retention evidence", "kind": "unknown", "statement": "No retention data supplied."}],
            open_questions=["Can retention be validated?"]), self.session)
        saved_candidate = saved["candidates"][0]
        self.assertEqual(saved_candidate["decision"]["priority"], "high")
        self.assertEqual(len(saved_candidate["resolved_decision_evidence"]), 1)
        self.assertEqual(saved_candidate["resolved_decision_evidence"][0]["dataset_content_sha256"], imported.content_sha256)

        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(selected_app_ids=[], selected_app_context=None), self.session)
        historical = get_opportunity_workspace(self.project.id, self.session)["candidates"][0]
        self.assertFalse(historical["stale"])
        self.assertTrue(historical["historical"])
        self.assertEqual(historical["decision"]["rationale"], "Worth validating")
        self.assertEqual(historical["decision"]["next_action"], "Review retention evidence")
        self.assertEqual(len(historical["quantitative_evidence"]), 1)
        self.assertIn("Historical decision", " ".join(historical["evidence_gaps"]))
        self.assertEqual(len(historical["resolved_decision_evidence"]), 1)

    def test_opportunity_evidence_uses_m2_effective_metadata_and_keeps_csv_immutable(self) -> None:
        imported = import_workspace_dataset(self.project.id, self.csv_payload(), Response(), self.session)
        dataset = self.session.get(QuantitativeDataset, imported.id)
        original_csv = dataset.original_csv
        original_hash = dataset.content_sha256
        original_rows = [dict(row) for row in dataset.observations_json]
        row = original_rows[0]
        group_key = metadata_group(row)
        confirmed = {
            "geo": row["geo"], "platform": row["platform"], "unit": row["unit"],
            "period_start": row["period_start"], "period_end": row["period_end"],
            "period_semantics": row["period_semantics"], "granularity": row["granularity"],
            "methodology": "Provider documented unique-download definition v2",
        }
        entries = {field: {"value": value, "basis": "provider_documentation",
            "source_url": "https://example.org/provider-methodology", "source_excerpt": f"Provider docs define {field} for the export.",
            "attested": True, "confirmed_at": "2026-10-24T00:00:00Z"} for field, value in confirmed.items()}
        dataset.field_mapping_json = {**(dataset.field_mapping_json or {}), "metadata_review": {
            "revision": 1, "entries": {group_key: entries}, "history": []}}
        self.session.commit()

        context = {"dataset_id": dataset.id, "dataset_filename": dataset.filename,
            "dataset_content_sha256": dataset.content_sha256, "selection_type": "manual",
            "source_entity_ids": [row["source_entity_id"]], "measurement": None,
            "observation_refs": [{"source_entity_id": row["source_entity_id"], "source_row_number": row["source_row_number"], "metric_id": row["metric_id"]}]}
        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(
            selected_app_ids=[row["source_entity_id"]], selected_app_context=context), self.session)
        item = get_opportunity_workspace(self.project.id, self.session)["candidates"][0]["quantitative_evidence"][0]
        effective = effective_observations(dataset)[0]
        self.assertEqual(item["methodology"], confirmed["methodology"])
        self.assertEqual(item["metadata_provenance"]["methodology"]["basis"], "provider_documentation")
        self.assertEqual(item["metadata_provenance"]["methodology"]["original_value"], row["methodology"])
        self.assertEqual(item["source_row_number"], row["source_row_number"])
        self.assertEqual(item["geo"], row["geo"])
        self.assertEqual(item["platform"], "Unified")
        self.assertEqual(item["period_start"], row["period_start"])
        self.assertEqual(item["m2_observation_usable"], _observation_usable(effective, dataset))
        self.assertEqual(item["comparison_ready"], effective["comparison_ready"])
        self.assertTrue(item["m2_observation_usable"])
        self.assertEqual(dataset.original_csv, original_csv)
        self.assertEqual(dataset.content_sha256, original_hash)
        self.assertEqual(dataset.observations_json, original_rows)

    def test_opportunity_evidence_preserves_approximate_zero_and_metadata_provenance(self) -> None:
        imported = import_workspace_dataset(self.project.id, self.csv_payload(), Response(), self.session)
        dataset = self.session.get(QuantitativeDataset, imported.id)
        source = dict(dataset.observations_json[0])
        source.update(value=0, value_precision="approximate", reported_value_text="approximately zero")
        dataset.observations_json = [source]
        self.session.commit()
        context = {"dataset_id": dataset.id, "dataset_filename": dataset.filename,
            "dataset_content_sha256": dataset.content_sha256, "selection_type": "manual",
            "source_entity_ids": [source["source_entity_id"]], "measurement": None,
            "observation_refs": [{"source_entity_id": source["source_entity_id"], "source_row_number": source["source_row_number"], "metric_id": source["metric_id"]}]}
        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(
            selected_app_ids=[source["source_entity_id"]], selected_app_context=context), self.session)
        evidence = get_opportunity_workspace(self.project.id, self.session)["candidates"][0]["quantitative_evidence"][0]
        self.assertEqual(evidence["value"], 0)
        self.assertEqual(evidence["value_precision"], "approximate")
        self.assertEqual(evidence["reported_value_text"], "approximately zero")

    def test_opportunity_decision_rejects_forged_observation_reference(self) -> None:
        imported = import_workspace_dataset(self.project.id, self.csv_payload(), Response(), self.session)
        row = imported.observations[0]
        source_id = row.source_entity_id
        context = {"dataset_id": imported.id, "dataset_content_sha256": imported.content_sha256,
                   "selection_type": "manual", "source_entity_ids": [source_id],
                   "observation_refs": [{"source_entity_id": source_id, "source_row_number": row.source_row_number, "metric_id": row.metric_id}]}
        self.project.workspace_state_json = {"selected_app_ids": [source_id], "selected_app_context": context,
                                             "existing_preferences": {"keep": True}}
        self.session.commit()
        candidate = get_opportunity_workspace(self.project.id, self.session)["candidates"][0]
        with self.assertRaises(Exception) as raised:
            save_opportunity_decision(self.project.id, OpportunityDecisionUpdate(
                candidate_id=candidate["candidate_id"], dataset_id=imported.id,
                dataset_content_sha256=imported.content_sha256, source_entity_id=source_id,
                supporting_evidence=[{"kind": "quantitative", "dataset_id": imported.id,
                                      "source_entity_id": source_id, "source_row_number": 999,
                                      "metric_id": row.metric_id}], rationale="Do not accept fabricated row."), self.session)
        self.assertEqual(getattr(raised.exception, "status_code", None), 409)
        state = self.session.get(ResearchProject, self.project.id).workspace_state_json
        self.assertEqual(state["existing_preferences"], {"keep": True})
        self.assertNotIn("opportunity_decisions", state)

    def test_opportunity_decision_rejects_forged_assessment_evidence_reference(self) -> None:
        imported = import_workspace_dataset(self.project.id, self.csv_payload(), Response(), self.session)
        row = imported.observations[0]
        context = {"dataset_id": imported.id, "dataset_content_sha256": imported.content_sha256,
                   "selection_type": "manual", "source_entity_ids": [row.source_entity_id],
                   "observation_refs": [{"source_entity_id": row.source_entity_id,
                                         "source_row_number": row.source_row_number, "metric_id": row.metric_id}]}
        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(
            selected_app_ids=[row.source_entity_id], selected_app_context=context), self.session)
        candidate = get_opportunity_workspace(self.project.id, self.session)["candidates"][0]
        with self.assertRaises(Exception) as raised:
            save_opportunity_decision(self.project.id, OpportunityDecisionUpdate(
                candidate_id=candidate["candidate_id"], dataset_id=imported.id,
                dataset_content_sha256=imported.content_sha256, source_entity_id=row.source_entity_id,
                assessments=[{"dimension": "Source-backed fact", "kind": "observed_fact",
                    "statement": "This deliberately points to a nonexistent source row.",
                    "evidence_refs": [{"kind": "quantitative", "dataset_id": imported.id,
                        "source_entity_id": row.source_entity_id, "source_row_number": 999,
                        "metric_id": row.metric_id}]}]), self.session)
        self.assertEqual(getattr(raised.exception, "status_code", None), 409)
        self.assertIsNone(self.session.scalar(select(POOpportunityDecision)))

    def test_opportunity_workspace_returns_one_hundred_source_only_candidates(self) -> None:
        rows = ["Unified Name;Unified ID;Platform;Downloads (Absolute)"] + [
            f"Product {index};vendor-{index};Unified;{index * 100}" for index in range(100)
        ]
        imported = import_workspace_dataset(self.project.id, self.csv_payload("\n".join(rows) + "\n"), Response(), self.session)
        context = {"dataset_id": imported.id, "dataset_filename": imported.filename,
                   "dataset_content_sha256": imported.content_sha256, "selection_type": "manual",
                   "source_entity_ids": [item.source_entity_id for item in imported.observations],
                   "selection_criterion": "Selected by PO from 100 source rows",
                   "measurement": None,
                   "observation_refs": [{"source_entity_id": item.source_entity_id,
                                         "source_row_number": item.source_row_number,
                                         "metric_id": item.metric_id} for item in imported.observations]}
        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(
            selected_app_ids=context["source_entity_ids"], selected_app_context=context), self.session)
        result = get_opportunity_workspace(self.project.id, self.session)
        self.assertEqual(len(result["candidates"]), 100)
        self.assertEqual(len({item["candidate_id"] for item in result["candidates"]}), 100)
        self.assertTrue(all(item["dataset_content_sha256"] == imported.content_sha256 for item in result["candidates"]))

    def test_qualitative_finding_requires_explicit_candidate_attachment_and_stays_unverified(self) -> None:
        imported = import_workspace_dataset(self.project.id, self.csv_payload(), Response(), self.session)
        row = imported.observations[0]
        context = {"dataset_id": imported.id, "dataset_content_sha256": imported.content_sha256,
                   "selection_type": "manual", "source_entity_ids": [row.source_entity_id],
                   "observation_refs": [{"source_entity_id": row.source_entity_id,
                                         "source_row_number": row.source_row_number, "metric_id": row.metric_id}]}
        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(
            selected_app_ids=[row.source_entity_id], selected_app_context=context), self.session)
        report = ImportedResearchReport(id="report-opportunity", project_id=self.project.id,
            question="How do users respond to this product?", geo="Worldwide", os="Unknown", research_period=None,
            content="# Original", research_data_json={"findings": [{"key": "finding-alpha", "title": "Users value ease of use",
                "finding_type": "behavior", "description": "Report supplied finding.", "evidence_status": "unverified",
                "evidence_references": ["https://example.org/source"]}], "entities": []},
            parse_status="STRUCTURED", extraction_error=None, benchmark_selections_json=[{"item_type": "finding", "item_key": "finding-alpha"}],
            benchmark_workspace_json={"entries": [{"item_type": "finding", "item_key": "finding-alpha",
                "po_assessment": "Existing report-level judgment", "notes": "Keep this note", "next_action": "Review again"}]},
            content_sha256="c" * 64, origin="chatgpt_user_import")
        self.session.add(report)
        self.session.commit()
        before = get_opportunity_workspace(self.project.id, self.session)
        candidate = before["candidates"][0]
        self.assertFalse(candidate["decision"])
        supplied_finding = before["reports"][0]["findings"][0]
        self.assertEqual(supplied_finding["existing_po_workspace"]["po_assessment"], "Existing report-level judgment")
        self.assertEqual(candidate["quantitative_evidence"][0]["source_entity_id"], row.source_entity_id)
        qualitative_ref = {"kind": "report_finding", "report_id": report.id,
                           "report_content_sha256": report.content_sha256, "item_key": "finding-alpha"}
        quantitative_ref = {"kind": "quantitative", "dataset_id": imported.id,
                            "source_entity_id": row.source_entity_id, "source_row_number": row.source_row_number,
                            "metric_id": row.metric_id}
        saved = save_opportunity_decision(self.project.id, OpportunityDecisionUpdate(
            candidate_id=candidate["candidate_id"], dataset_id=imported.id,
            dataset_content_sha256=imported.content_sha256, source_entity_id=row.source_entity_id,
            rationale="PO explicitly reviewed this report finding.", supporting_evidence=[qualitative_ref],
            assessments=[{"dimension": "Source-backed observation", "kind": "observed_fact",
                          "statement": "The supplied report and source row were reviewed together.",
                          "evidence_refs": [qualitative_ref, quantitative_ref]}]), self.session)
        evidence = saved["candidates"][0]["resolved_decision_evidence"]
        self.assertEqual(evidence[0]["title"], "Users value ease of use")
        self.assertEqual(evidence[0]["verification_status"], "unverified")
        self.assertEqual(len(saved["candidates"][0]["decision"]["assessments"][0]["evidence_refs"]), 2)
        self.assertEqual(len(evidence), 2)  # Repeated use of one finding does not duplicate the resolved reference.
        preserved = self.session.get(ImportedResearchReport, report.id)
        self.assertEqual(preserved.benchmark_selections_json, [{"item_type": "finding", "item_key": "finding-alpha"}])
        self.assertEqual(preserved.benchmark_workspace_json["entries"][0]["notes"], "Keep this note")

    def test_stale_decision_revision_prevents_concurrent_save_from_overwriting_edits(self) -> None:
        imported = import_workspace_dataset(self.project.id, self.csv_payload(), Response(), self.session)
        row = imported.observations[0]
        context = {"dataset_id": imported.id, "dataset_content_sha256": imported.content_sha256,
                   "selection_type": "manual", "source_entity_ids": [row.source_entity_id],
                   "observation_refs": [{"source_entity_id": row.source_entity_id,
                                         "source_row_number": row.source_row_number, "metric_id": row.metric_id}]}
        update_workspace_state(self.project.id, ResearchWorkspaceStateUpdate(
            selected_app_ids=[row.source_entity_id], selected_app_context=context), self.session)
        stale_session = Session(self.engine, expire_on_commit=False)
        concurrent_session = Session(self.engine, expire_on_commit=False)
        try:
            candidate = get_opportunity_workspace(self.project.id, stale_session)["candidates"][0]
            payload = OpportunityDecisionUpdate(candidate_id=candidate["candidate_id"], dataset_id=imported.id,
                dataset_content_sha256=imported.content_sha256, source_entity_id=row.source_entity_id,
                rationale="Initial decision.", expected_revision=0)
            saved = save_opportunity_decision(self.project.id, payload, concurrent_session)
            self.assertEqual(saved["candidates"][0]["decision"]["revision"], 1)
            stale_candidate = get_opportunity_workspace(self.project.id, stale_session)["candidates"][0]
            self.assertEqual(stale_candidate["decision"]["revision"], 1)
            updated = OpportunityDecisionUpdate(candidate_id=candidate["candidate_id"], dataset_id=imported.id,
                dataset_content_sha256=imported.content_sha256, source_entity_id=row.source_entity_id,
                rationale="A newer edit that must remain.", expected_revision=1)
            save_opportunity_decision(self.project.id, updated, concurrent_session)
            with self.assertRaises(Exception) as raised:
                save_opportunity_decision(self.project.id, OpportunityDecisionUpdate(
                    candidate_id=candidate["candidate_id"], dataset_id=imported.id,
                    dataset_content_sha256=imported.content_sha256, source_entity_id=row.source_entity_id,
                    rationale="Stale edit must be rejected.", expected_revision=1), stale_session)
            self.assertEqual(getattr(raised.exception, "status_code", None), 409)
            refreshed = get_opportunity_workspace(self.project.id, concurrent_session)["candidates"][0]["decision"]
            self.assertEqual(refreshed["rationale"], "A newer edit that must remain.")
            self.assertEqual(refreshed["revision"], 2)
        finally:
            stale_session.close()
            concurrent_session.close()


if __name__ == "__main__":
    unittest.main()
