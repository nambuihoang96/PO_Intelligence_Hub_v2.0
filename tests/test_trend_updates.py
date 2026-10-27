"""Append-only project trend updates retain attribution and never claim verification."""
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.app.benchmark_collections import _collection_read, create_collection
from backend.app.db import create_database_engine, get_database_path
from backend.app.models import (
    ProjectTrendUpdate,
    ResearchBenchmarkCollectionMember,
    ResearchProject,
    ResearchSubject,
)
from backend.app.schemas import (
    ProjectTrendUpdateCreate,
    ResearchBenchmarkCollectionCreate,
)
from backend.app.trend_updates import create_trend_update, list_trend_updates


class ProjectTrendUpdateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(__file__).resolve().parents[1]
        self.temp_dir = tempfile.TemporaryDirectory(dir=self.root / ".test-tmp")
        self.env = patch.dict("os.environ", {"APP_DATA_ROOT": str(Path(self.temp_dir.name) / "appdata")})
        self.env.start()
        self.config = Config(str(self.root / "alembic.ini"))
        command.upgrade(self.config, "head")
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        self.project = ResearchProject(name="Trend workspace")
        self.session.add(self.project)
        self.session.flush()
        self.subject = ResearchSubject(project_id=self.project.id, name="Owner-confirmed subject", aliases_json=[], external_ids_json=[], provenance_json={})
        self.session.add(self.subject)
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()
        self.env.stop()
        self.temp_dir.cleanup()

    def test_exact_claim_is_append_only_and_appears_in_collection_as_unverified(self) -> None:
        collection = create_collection(self.project.id, ResearchBenchmarkCollectionCreate(name="Confirmed set"), self.session)
        self.session.add(ResearchBenchmarkCollectionMember(project_id=self.project.id, collection_id=collection.id, subject_id=self.subject.id))
        self.session.commit()
        first = create_trend_update(self.project.id, ProjectTrendUpdateCreate(
            subject_id=self.subject.id, collection_id=collection.id,
            exact_claim="Provider note says the product passed 11.1 million downloads.",
            source_note="Copied from a source note supplied by the PO.", source_title="Owner source note",
            source_url="https://example.org/trend", published_on=date(2026, 10, 21),
        ), self.session)
        second = create_trend_update(self.project.id, ProjectTrendUpdateCreate(
            subject_id=self.subject.id, collection_id=collection.id,
            exact_claim="A later note reports a different number; compare methodology first.",
            source_note="Second source note. Earlier record retained.", published_on=date(2026, 10, 27),
        ), self.session)

        self.assertNotEqual(first.id, second.id)
        self.assertEqual(first.exact_claim, "Provider note says the product passed 11.1 million downloads.")
        self.assertEqual(first.source_status, "source_reported_unverified")
        self.assertEqual(first.source_url, "https://example.org/trend")
        page = list_trend_updates(self.project.id, self.session, collection_id=collection.id, limit=20)
        self.assertEqual([row.id for row in page.items], [second.id, first.id])
        self.assertEqual(self.session.query(ProjectTrendUpdate).count(), 2)

        matrix = _collection_read(self.session, collection)
        member = matrix.members[0]
        self.assertEqual(member.trend_update_count, 2)
        self.assertEqual(member.source_count, 2)
        observations = [item for item in member.observations if item.source_kind == "trend_update"]
        self.assertEqual(len(observations), 2)
        self.assertEqual(observations[0].value, first.exact_claim)
        self.assertEqual(observations[0].evidence_status, "Source-reported · unverified")
        self.assertEqual(observations[0].scope["published date"], "2026-10-21")
        self.assertEqual(observations[0].evidence_references, ["https://example.org/trend"])
        self.assertIn("No period, GEO, platform", observations[0].uncertainty)
        self.assertNotIn("downloads", [dimension.name.casefold() for dimension in matrix.dimensions])

    def test_requires_confirmed_project_subject_and_existing_collection_membership(self) -> None:
        collection = create_collection(self.project.id, ResearchBenchmarkCollectionCreate(name="Empty"), self.session)
        payload = ProjectTrendUpdateCreate(subject_id=self.subject.id, collection_id=collection.id,
            exact_claim="Exact supplied claim.", source_note="Source context.", published_on=date(2026, 10, 21))
        with self.assertRaises(HTTPException) as missing_membership:
            create_trend_update(self.project.id, payload, self.session)
        self.assertEqual(missing_membership.exception.status_code, 409)
        self.assertEqual(self.session.query(ProjectTrendUpdate).count(), 0)

    def test_rejects_unsafe_source_url_and_blank_source_material(self) -> None:
        with self.assertRaises(ValidationError):
            ProjectTrendUpdateCreate(subject_id=self.subject.id, exact_claim="A claim", source_note="Source note",
                                     source_url="javascript:alert(1)", published_on=date(2026, 10, 21))
        with self.assertRaises(ValidationError):
            ProjectTrendUpdateCreate(subject_id=self.subject.id, exact_claim="  ", source_note="Source note",
                                     published_on=date(2026, 10, 21))

if __name__ == "__main__":
    unittest.main()
