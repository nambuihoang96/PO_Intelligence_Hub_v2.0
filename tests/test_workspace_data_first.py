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
from backend.app.models import ImportedResearchReport, QuantitativeDataset, ResearchProject
from backend.app.quantitative_comparisons import list_comparison_datasets
from backend.app.reports import import_report
from backend.app.schemas import ImportedReportCreate, QuantitativeDatasetImport, ResearchWorkspaceStateUpdate
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


if __name__ == "__main__":
    unittest.main()
