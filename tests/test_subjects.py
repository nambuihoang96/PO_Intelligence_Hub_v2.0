"""Persistent subject identity and explicit source mapping tests."""
import tempfile
import unittest
import sqlite3
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.app.db import create_database_engine, get_database_path
from backend.app.models import ImportedResearchReport, QuantitativeDataset, ResearchProject, ResearchSubject
from backend.app.main import create_app
from backend.app.schemas import ResearchSubjectCreate, ResearchSubjectSourceMap, ResearchSubjectUpdate
from backend.app.subjects import create_subject, list_subject_sources, list_subjects, map_subject_source, update_subject


class ResearchSubjectsTest(unittest.TestCase):
    def setUp(self) -> None:
        root = Path(__file__).resolve().parents[1]
        scratch = root / ".test-tmp"
        scratch.mkdir(exist_ok=True)
        self.temp_dir = tempfile.TemporaryDirectory(dir=scratch)
        self.env = patch.dict("os.environ", {"APP_DATA_ROOT": str(Path(self.temp_dir.name) / "appdata")})
        self.env.start()
        self.config = Config(str(root / "alembic.ini"))
        command.upgrade(self.config, "head")
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        self.project = ResearchProject(name="Cross-report research")
        self.session.add(self.project)
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()
        self.env.stop()
        self.temp_dir.cleanup()

    def _report(self, question: str, key: str, name: str) -> ImportedResearchReport:
        report = ImportedResearchReport(
            project_id=self.project.id, question=question, geo="Unknown", os="Unknown", research_period=None,
            content=f"# {question}\n\nSource report.", research_data_json={"entities": [
                {"key": key, "entity_type": "product", "name": name, "attributes": {"provided": True}},
            ], "findings": [], "evidence_references": [], "benchmark_dimensions": []},
            parse_status="PARSED", extraction_error=None, benchmark_selections_json=[],
            benchmark_workspace_json={"custom_dimensions": [], "entries": []},
            content_sha256=("a" if "First" in question else "b") * 64, origin="chatgpt_user_import",
        )
        self.session.add(report)
        self.session.commit()
        return report

    def test_report_entities_are_not_auto_merged_and_mapping_is_explicit(self) -> None:
        first = self._report("First source", "provider:abc", "Example Product")
        second = self._report("Second source", "provider:abc", "Example Product")
        subject = create_subject(self.project.id, ResearchSubjectCreate(name="Example Product", subject_type="product",
            aliases=["Example P"], external_ids=[{"provider": "catalog", "value": "abc"}],
            provenance={"basis": "owner-confirmed"}), self.session)
        self.assertEqual(subject.aliases, ["Example P"])

        page = list_subject_sources(self.project.id, self.session, cursor=None, limit=1)
        self.assertIsNotNone(page.next_cursor)
        sources = list_subject_sources(self.project.id, self.session, cursor=None, limit=20).items
        self.assertEqual(len(sources), 2)
        self.assertEqual({item.source_id for item in sources}, {first.id, second.id})
        self.assertTrue(all(item.mapped_subject_id is None for item in sources), "matching source labels must not auto-merge")

        source = sources[0]
        mapped = map_subject_source(self.project.id, ResearchSubjectSourceMap(source_kind=source.source_kind,
                                    source_id=source.source_id, source_key=source.source_key, subject_id=subject.id), self.session)
        self.assertEqual(mapped.mapped_subject_id, subject.id)
        other = create_subject(self.project.id, ResearchSubjectCreate(name="Other Product"), self.session)
        with self.assertRaises(HTTPException) as conflict:
            map_subject_source(self.project.id, ResearchSubjectSourceMap(source_kind=source.source_kind,
                               source_id=source.source_id, source_key=source.source_key, subject_id=other.id), self.session)
        self.assertEqual(conflict.exception.status_code, 409)
        remapped = map_subject_source(self.project.id, ResearchSubjectSourceMap(source_kind=source.source_kind,
                                      source_id=source.source_id, source_key=source.source_key, subject_id=other.id,
                                      expected_subject_id=subject.id), self.session)
        self.assertEqual(remapped.mapped_subject_id, other.id)

        remaining = next(item for item in sources if item.source_id == second.id)
        created_from_source = map_subject_source(self.project.id, ResearchSubjectSourceMap(
            source_kind=remaining.source_kind, source_id=remaining.source_id, source_key=remaining.source_key,
            create_subject_from_source=True), self.session)
        self.assertEqual(created_from_source.mapped_subject_name, "Example Product")
        self.assertEqual(len(list_subjects(self.project.id, self.session, cursor=None, limit=20).items), 3)

        report_reopened = self.session.get(ImportedResearchReport, first.id)
        self.assertEqual(report_reopened.content, f"# First source\n\nSource report.")
        self.assertEqual(report_reopened.research_data_json["entities"][0]["key"], "provider:abc")
        subjects = list_subjects(self.project.id, self.session, cursor=None, limit=20)
        self.assertEqual({item.id for item in subjects.items}, {subject.id, other.id, created_from_source.mapped_subject_id})
        changed = update_subject(self.project.id, subject.id, ResearchSubjectUpdate(name="Example Product 2"), self.session)
        self.assertEqual(changed.name, "Example Product 2")

    def test_csv_entity_mapping_is_project_scoped_and_preserves_dataset(self) -> None:
        dataset = QuantitativeDataset(
            project_id=self.project.id, report_id=None, filename="owner-export.csv", content_sha256="c" * 64,
            original_csv="Name,ID\nExample Product,provider:abc\n", field_mapping_json={"entity_id": "ID"},
            entity_mappings_json={}, compatibility_status="partial", validation_reasons_json=[],
            observations_json=[{"source_entity_id": "provider:abc", "source_entity_name": "Example Product",
                                "entity_id": None, "value": None, "validation_reasons": ["Missing value"]}],
        )
        self.session.add(dataset)
        self.session.commit()
        subject = create_subject(self.project.id, ResearchSubjectCreate(name="Owner confirmed product"), self.session)
        csv_sources = [item for item in list_subject_sources(self.project.id, self.session, cursor=None, limit=20).items
                       if item.source_kind == "csv_entity"]
        self.assertEqual(len(csv_sources), 1)
        source = csv_sources[0]
        linked = map_subject_source(self.project.id, ResearchSubjectSourceMap(source_kind=source.source_kind,
                                    source_id=source.source_id, source_key=source.source_key, subject_id=subject.id), self.session)
        self.assertEqual(linked.mapped_subject_id, subject.id)
        self.assertEqual(self.session.get(QuantitativeDataset, dataset.id).original_csv, "Name,ID\nExample Product,provider:abc\n")

        outside = ResearchProject(name="Another project")
        self.session.add(outside)
        self.session.commit()
        with self.assertRaises(HTTPException) as wrong_project:
            map_subject_source(outside.id, ResearchSubjectSourceMap(source_kind=source.source_kind,
                               source_id=source.source_id, source_key=source.source_key, subject_id=subject.id), self.session)
        self.assertEqual(wrong_project.exception.status_code, 404)

    def test_custom_subject_analysis_sections_save_reopen_and_reject_duplicate_keys(self) -> None:
        subject = create_subject(self.project.id, ResearchSubjectCreate(name="Profile subject"), self.session)
        sections = [{"key": "custom-loop", "label": "Custom user journey", "content": "Owner-authored analysis stays separate from sourced findings."}]
        saved = update_subject(self.project.id, subject.id, ResearchSubjectUpdate(analysis_sections=sections), self.session)
        self.assertEqual([item.model_dump() for item in saved.analysis_sections], sections)
        self.session.expire_all()
        reopened = list_subjects(self.project.id, self.session, cursor=None, limit=20).items[0]
        self.assertEqual([item.model_dump() for item in reopened.analysis_sections], sections)
        with self.assertRaises(ValidationError):
            ResearchSubjectUpdate(analysis_sections=[
                {"key": "same", "label": "First", "content": "First section."},
                {"key": "same", "label": "Second", "content": "Second section."},
            ])
        with self.assertRaises(ValidationError):
            ResearchSubjectUpdate(analysis_sections=[{"key": "empty", "label": "Empty", "content": "  "}])
        self.assertEqual(self.session.get(ResearchSubject, subject.id).analysis_sections_json, sections)

    def test_preexisting_subject_gets_an_empty_optional_analysis_list_on_upgrade(self) -> None:
        self.session.close(); self.engine.dispose()
        command.downgrade(self.config, "20261027_0013")
        database_path = get_database_path()
        connection = sqlite3.connect(database_path)
        connection.execute(
            "INSERT INTO research_subjects (id, project_id, name, subject_type, aliases_json, external_ids_json, provenance_json, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("legacy-subject", self.project.id, "Existing profile", None, "[]", "[]", "{}", "2026-10-27 00:00:00", "2026-10-27 00:00:00"),
        )
        connection.commit(); connection.close()
        command.upgrade(self.config, "head")
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        legacy = self.session.get(ResearchSubject, "legacy-subject")
        self.assertEqual(legacy.analysis_sections_json, [])

    def test_additive_migration_preserves_existing_reports_csv_and_po_notes(self) -> None:
        root = Path(__file__).resolve().parents[1]
        config = Config(str(root / "alembic.ini"))
        self.session.close()
        self.engine.dispose()
        command.downgrade(config, "20261024_0009")
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        report = ImportedResearchReport(
            id="pre-subject-migration-report", project_id=self.project.id,
            question="Historical report", geo="Unknown", os="Web", research_period="2026",
            content="Original bytes stay unchanged.", research_data_json={"entities": [{"key": "old", "name": "Legacy subject"}]},
            parse_status="PARSED", extraction_error=None, benchmark_selections_json=[{"item_key": "old"}],
            benchmark_workspace_json={"entries": [{"item_key": "old", "notes": "Keep PO note"}]},
            content_sha256="d" * 64, origin="chatgpt_user_import",
        )
        dataset = QuantitativeDataset(
            id="pre-subject-migration-dataset", project_id=self.project.id, report_id=report.id,
            filename="original.csv", content_sha256="e" * 64, original_csv="Name,Value\nLegacy,7\n",
            field_mapping_json={}, entity_mappings_json={}, observations_json=[], compatibility_status="partial",
            validation_reasons_json=[],
        )
        self.session.add_all([report, dataset])
        self.session.commit()
        self.session.close()
        self.engine.dispose()

        command.upgrade(config, "head")
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        saved_report = self.session.get(ImportedResearchReport, report.id)
        saved_dataset = self.session.get(QuantitativeDataset, dataset.id)
        self.assertEqual(saved_report.content, "Original bytes stay unchanged.")
        self.assertEqual(saved_report.benchmark_workspace_json["entries"][0]["notes"], "Keep PO note")
        self.assertEqual(saved_report.benchmark_selections_json, [{"item_key": "old"}])
        self.assertEqual(saved_dataset.original_csv, "Name,Value\nLegacy,7\n")
        with self.engine.connect() as connection:
            self.assertEqual(connection.exec_driver_sql("PRAGMA integrity_check").scalar_one(), "ok")

    def test_typed_subject_routes_are_in_openapi(self) -> None:
        paths = create_app().openapi()["paths"]
        self.assertIn("/api/v1/projects/{project_id}/subjects", paths)
        self.assertIn("/api/v1/projects/{project_id}/subjects/{subject_id}", paths)
        self.assertIn("/api/v1/projects/{project_id}/subject-sources", paths)
        self.assertIn("get", paths["/api/v1/projects/{project_id}/subject-sources"])
        self.assertIn("put", paths["/api/v1/projects/{project_id}/subject-sources"])


if __name__ == "__main__":
    unittest.main()
