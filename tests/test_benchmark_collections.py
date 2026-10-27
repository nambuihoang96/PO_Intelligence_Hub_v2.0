"""Project-owned benchmark collection persistence and data-safety tests."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db import create_database_engine, get_database_path
from backend.app.main import create_app
from backend.app.models import (
    ImportedResearchReport,
    QuantitativeDataset,
    ResearchBenchmarkCollection,
    ResearchBenchmarkCollectionMember,
    ResearchProject,
    ResearchSubject,
    ResearchSubjectReference,
)
from backend.app.schemas import ResearchBenchmarkCollectionCreate, ResearchBenchmarkCollectionMemberAdd
from backend.app.benchmark_collections import add_collection_subject, create_collection, remove_collection_subject


class BenchmarkCollectionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(__file__).resolve().parents[1]
        self.temp_dir = tempfile.TemporaryDirectory(dir=self.root / ".test-tmp")
        self.env = patch.dict("os.environ", {"APP_DATA_ROOT": str(Path(self.temp_dir.name) / "appdata")})
        self.env.start()
        self.config = Config(str(self.root / "alembic.ini"))
        command.upgrade(self.config, "head")
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        self.project = ResearchProject(name="Collection project")
        self.session.add(self.project)
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()
        self.env.stop()
        self.temp_dir.cleanup()

    def _subject(self, name: str, source_key: str) -> tuple[ResearchSubject, ImportedResearchReport]:
        report = ImportedResearchReport(
            project_id=self.project.id, question=f"Research on {name}", geo="Unknown", os="Unknown",
            research_period=None, content=f"# {name}\n\nOriginal report remains unchanged.",
            research_data_json={"entities": [{"key": source_key, "name": name, "entity_type": "product"}],
                                "findings": [], "evidence_references": [], "benchmark_dimensions": [{
                                    "key": "supplied-feature", "name": "Supplied feature",
                                    "observations": [{"entity_key": source_key, "value": "Owner-supplied report finding",
                                        "evidence_references": ["https://example.org/source"], "source_locations": ["line:2"],
                                        "evidence_status": "unverified", "uncertainty": "Method not described."}],
                                }]},
            parse_status="PARSED", extraction_error=None, benchmark_selections_json=[{"item_key": source_key}],
            benchmark_workspace_json={"entries": [{"item_key": source_key, "notes": "Keep existing PO note"}]},
            content_sha256=(source_key[0].lower() * 64), origin="chatgpt_user_import",
        )
        subject = ResearchSubject(project_id=self.project.id, name=name, subject_type="product", aliases_json=[],
                                  external_ids_json=[], provenance_json={"owner_confirmed": True})
        self.session.add_all([report, subject])
        self.session.flush()
        reference = ResearchSubjectReference(project_id=self.project.id, subject_id=subject.id,
            source_kind="report_entity", source_id=report.id, source_key=source_key, source_name=name,
            provenance_json={"report_question": report.question})
        self.session.add(reference)
        self.session.commit()
        return subject, report

    def test_explicit_membership_is_reusable_and_removal_preserves_subject_and_report_data(self) -> None:
        subject, report = self._subject("Example Product", "provider:example")
        csv = QuantitativeDataset(project_id=self.project.id, report_id=None, filename="export.csv", content_sha256="c" * 64,
            original_csv="Name,ID\nExample Product,provider:example\n", field_mapping_json={}, entity_mappings_json={},
            observations_json=[{"source_entity_id": "provider:example", "source_entity_name": "Example Product",
                                "metric_id": "download_count", "metric_definition": "Downloads", "value": 42,
                                "unit": "downloads", "geo": "US", "platform": "Android",
                                "period_start": "2026-10-01", "period_end": "2026-10-31",
                                "granularity": "monthly", "methodology": "Provider method",
                                "verification_status": "unverified", "source_row_number": 2}],
            compatibility_status="partial", validation_reasons_json=[])
        self.session.add(csv)
        self.session.commit()

        collection = create_collection(self.project.id, ResearchBenchmarkCollectionCreate(name="  Product shortlist  "), self.session)
        self.assertEqual(collection.name, "Product shortlist")
        self.assertEqual(collection.members, [])
        member = add_collection_subject(self.project.id, collection.id, subject.id,
            ResearchBenchmarkCollectionMemberAdd(subject_id=subject.id), self.session)
        self.assertEqual(len(member.members), 1)
        self.assertEqual(member.members[0].source_count, 1)
        self.assertEqual(member.members[0].report_source_count, 1)
        self.assertEqual(member.members[0].csv_source_count, 0)

        # PUT is idempotent: repeating the same add does not create duplicate membership.
        repeated = add_collection_subject(self.project.id, collection.id, subject.id,
            ResearchBenchmarkCollectionMemberAdd(subject_id=subject.id), self.session)
        self.assertEqual(len(repeated.members), 1)
        self.assertEqual(self.session.query(ResearchBenchmarkCollectionMember).count(), 1)

        # A CSV identity is linked explicitly to the same saved subject.
        self.session.add(ResearchSubjectReference(project_id=self.project.id, subject_id=subject.id, source_kind="csv_entity",
            source_id=csv.id, source_key="provider:example", source_name="Example Product", provenance_json={"filename": "export.csv"}))
        self.session.commit()
        refreshed = add_collection_subject(self.project.id, collection.id, subject.id,
            ResearchBenchmarkCollectionMemberAdd(subject_id=subject.id), self.session)
        self.assertEqual(refreshed.members[0].source_count, 2)
        self.assertEqual(refreshed.members[0].csv_source_count, 1)
        self.assertEqual(len(refreshed.members[0].observations), 2)
        report_observation = next(item for item in refreshed.members[0].observations if item.source_kind == "report_entity")
        csv_observation = next(item for item in refreshed.members[0].observations if item.source_kind == "csv_entity")
        self.assertEqual(report_observation.value, "Owner-supplied report finding")
        self.assertEqual(report_observation.evidence_status, "unverified")
        self.assertEqual(report_observation.evidence_references, ["https://example.org/source"])
        self.assertEqual(csv_observation.value, 42)
        self.assertEqual(csv_observation.scope["GEO"], "US")
        self.assertEqual(csv_observation.scope["platform"], "Android")
        self.assertEqual(csv_observation.verification_status, "unverified")
        self.assertEqual(len(refreshed.dimensions), 2)

        remove_collection_subject(self.project.id, collection.id, subject.id, self.session)
        self.session.expire_all()
        self.assertIsNotNone(self.session.get(ResearchSubject, subject.id))
        self.assertIsNotNone(self.session.scalar(select(ResearchSubjectReference).where(
            ResearchSubjectReference.source_kind == "report_entity", ResearchSubjectReference.source_id == report.id)))
        saved_report = self.session.get(ImportedResearchReport, report.id)
        self.assertEqual(saved_report.content, f"# Example Product\n\nOriginal report remains unchanged.")
        self.assertEqual(saved_report.benchmark_workspace_json["entries"][0]["notes"], "Keep existing PO note")
        self.assertEqual(saved_report.benchmark_selections_json, [{"item_key": "provider:example"}])
        self.assertEqual(self.session.query(ResearchBenchmarkCollectionMember).count(), 0)
        self.assertEqual(self.session.query(ResearchSubjectReference).count(), 2)

    def test_collection_rejects_cross_project_subject_and_mismatched_path(self) -> None:
        collection = create_collection(self.project.id, ResearchBenchmarkCollectionCreate(name="Compare"), self.session)
        other_project = ResearchProject(name="Another project")
        self.session.add(other_project)
        self.session.flush()
        other_subject = ResearchSubject(project_id=other_project.id, name="Other", aliases_json=[], external_ids_json=[], provenance_json={})
        self.session.add(other_subject)
        self.session.commit()

        with self.assertRaises(HTTPException) as wrong_subject:
            add_collection_subject(self.project.id, collection.id, other_subject.id,
                ResearchBenchmarkCollectionMemberAdd(subject_id=other_subject.id), self.session)
        self.assertEqual(wrong_subject.exception.status_code, 404)
        with self.assertRaises(HTTPException) as path_mismatch:
            add_collection_subject(self.project.id, collection.id, "different-id",
                ResearchBenchmarkCollectionMemberAdd(subject_id=other_subject.id), self.session)
        self.assertEqual(path_mismatch.exception.status_code, 409)

    def test_trend_update_migration_preserves_subject_links_and_old_report_state(self) -> None:
        subject, report = self._subject("Legacy linked product", "provider:legacy")
        self.session.close()
        self.engine.dispose()
        command.downgrade(self.config, "20261027_0011")
        command.upgrade(self.config, "head")
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        saved_subject = self.session.get(ResearchSubject, subject.id)
        saved_report = self.session.get(ImportedResearchReport, report.id)
        refs = self.session.query(ResearchSubjectReference).filter_by(project_id=self.project.id).all()
        self.assertEqual(saved_subject.name, "Legacy linked product")
        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0].source_key, "provider:legacy")
        self.assertEqual(saved_report.content, "# Legacy linked product\n\nOriginal report remains unchanged.")
        self.assertEqual(saved_report.benchmark_workspace_json["entries"][0]["notes"], "Keep existing PO note")
        with self.engine.connect() as connection:
            self.assertEqual(connection.exec_driver_sql("PRAGMA integrity_check").scalar_one(), "ok")
            self.assertIn("project_trend_updates", {row[0] for row in connection.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'").all()})

    def test_collection_routes_are_in_openapi(self) -> None:
        paths = create_app().openapi()["paths"]
        self.assertIn("/api/v1/projects/{project_id}/benchmark-collections", paths)
        self.assertIn("/api/v1/projects/{project_id}/benchmark-collections/{collection_id}", paths)
        self.assertIn("/api/v1/projects/{project_id}/benchmark-collections/{collection_id}/subjects/{subject_id}", paths)
        self.assertIn("/api/v1/projects/{project_id}/trend-updates", paths)


if __name__ == "__main__":
    unittest.main()
