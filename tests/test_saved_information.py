"""Project information can be saved as-is before a product/topic is confirmed."""
import base64
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

from backend.app.db import create_database_engine, get_database_path
from backend.app.models import ProjectSavedInformation, ProjectTrendUpdate, ResearchProject, ResearchSubject
from backend.app.saved_information import (create_saved_information, get_saved_information_image,
                                           list_saved_information, update_saved_information_context)
from backend.app.schemas import ProjectSavedInformationContextUpdate, ProjectSavedInformationCreate


class SavedInformationTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1]
        self.temp_dir = tempfile.TemporaryDirectory(dir=self.root / ".test-tmp")
        self.env = patch.dict("os.environ", {"APP_DATA_ROOT": str(Path(self.temp_dir.name) / "appdata")})
        self.env.start()
        command.upgrade(Config(str(self.root / "alembic.ini")), "head")
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        self.project = ResearchProject(name="Information capture test")
        self.other_project = ResearchProject(name="Another project")
        self.session.add_all([self.project, self.other_project])
        self.session.flush()
        self.subject = ResearchSubject(project_id=self.project.id, name="Owner-confirmed topic", aliases_json=[], external_ids_json=[], provenance_json={})
        self.foreign_subject = ResearchSubject(project_id=self.other_project.id, name="Different project topic", aliases_json=[], external_ids_json=[], provenance_json={})
        self.session.add_all([self.subject, self.foreign_subject])
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()
        self.env.stop()
        self.temp_dir.cleanup()

    def test_saves_original_multiline_content_without_subject_and_reopens(self):
        original = "  Full original note.\nSecond line with 11.1 million as supplied.  "
        result = create_saved_information(self.project.id, ProjectSavedInformationCreate(original_content=original), self.session)
        self.session.expire_all()
        page = list_saved_information(self.project.id, self.session)
        self.assertEqual(page.items[0].id, result.id)
        self.assertEqual(page.items[0].original_content, original)
        self.assertIsNone(page.items[0].subject_id)
        self.assertEqual(page.items[0].source_status, "source_reported_unverified")
        self.assertEqual(self.session.query(ProjectTrendUpdate).count(), 0)

    def test_optional_image_is_retained_locally_with_hash_and_unverified_status(self):
        png = b"\x89PNG\r\n\x1a\n" + b"isolated image fixture"
        result = create_saved_information(self.project.id, ProjectSavedInformationCreate(
            original_content="Text with an attached screenshot.", image_filename="note.png",
            image_content_type="image/png", image_base64=base64.b64encode(png).decode("ascii"),
        ), self.session)
        self.assertEqual(result.source_status, "source_reported_unverified")
        self.assertEqual(result.image_size, len(png))
        self.assertEqual(get_saved_information_image(self.project.id, result.id, self.session).body, png)

    def test_context_can_be_linked_later_but_foreign_subject_is_rejected(self):
        saved = create_saved_information(self.project.id, ProjectSavedInformationCreate(original_content="Saved first."), self.session)
        linked = update_saved_information_context(self.project.id, saved.id,
            ProjectSavedInformationContextUpdate(subject_id=self.subject.id), self.session)
        self.assertEqual(linked.subject_id, self.subject.id)
        with self.assertRaises(HTTPException) as error:
            update_saved_information_context(self.project.id, saved.id,
                ProjectSavedInformationContextUpdate(subject_id=self.foreign_subject.id), self.session)
        self.assertEqual(error.exception.status_code, 404)
        current = self.session.get(ProjectSavedInformation, saved.id)
        self.assertEqual(current.subject_id, self.subject.id)

    def test_rejects_blank_content_bad_url_and_inconsistent_image_metadata(self):
        for payload in (
            {"original_content": "  "},
            {"original_content": "A note", "source_url": "javascript:alert(1)"},
            {"original_content": "A note", "image_filename": "file.png"},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                ProjectSavedInformationCreate(**payload)

    def test_additive_migration_keeps_legacy_trend_records_unchanged(self):
        config = Config(str(self.root / "alembic.ini"))
        command.downgrade(config, "20261027_0014")
        legacy = ProjectTrendUpdate(
            project_id=self.project.id, subject_id=self.subject.id,
            exact_claim="Legacy source note remains byte-for-byte present.", source_note="Previous required attribution.",
            published_on=date(2026, 10, 26), source_status="source_reported_unverified",
        )
        self.session.add(legacy)
        self.session.commit()
        legacy_id = legacy.id
        self.session.close()
        command.upgrade(config, "head")
        self.session = Session(self.engine, expire_on_commit=False)
        preserved = self.session.get(ProjectTrendUpdate, legacy_id)
        self.assertEqual(preserved.exact_claim, "Legacy source note remains byte-for-byte present.")
        self.assertEqual(preserved.source_note, "Previous required attribution.")
        self.assertEqual(self.session.query(ProjectSavedInformation).count(), 0)


if __name__ == "__main__":
    unittest.main()
