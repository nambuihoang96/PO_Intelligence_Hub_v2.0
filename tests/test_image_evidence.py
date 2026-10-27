"""Local image evidence persistence, attribution, and file-safety regressions."""
import base64
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.db import create_database_engine, get_database_path
from backend.app.main import create_app
from backend.app.models import ProjectTrendUpdate, ResearchProject, ResearchSubject
from backend.app.image_evidence import create_image_evidence, get_image_evidence_content, list_image_evidence


PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j+a8AAAAASUVORK5CYII="
)


class ProjectImageEvidenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(__file__).resolve().parents[1]
        self.temp_dir = tempfile.TemporaryDirectory(dir=self.root / ".test-tmp")
        self.env = patch.dict("os.environ", {"APP_DATA_ROOT": str(Path(self.temp_dir.name) / "appdata")})
        self.env.start()
        command.upgrade(Config(str(self.root / "alembic.ini")), "head")
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        self.project = ResearchProject(name="Image evidence project")
        other_project = ResearchProject(name="Unrelated project")
        self.session.add_all([self.project, other_project])
        self.session.flush()
        self.subject = ResearchSubject(project_id=self.project.id, name="Owner-confirmed subject",
                                       aliases_json=[], external_ids_json=[], provenance_json={})
        self.other_subject = ResearchSubject(project_id=other_project.id, name="Other subject",
                                             aliases_json=[], external_ids_json=[], provenance_json={})
        self.session.add_all([self.subject, self.other_subject])
        self.session.flush()
        self.update = ProjectTrendUpdate(
            project_id=self.project.id, subject_id=self.subject.id, collection_id=None,
            exact_claim="Exact source-reported claim stays unchanged.", source_note="Copied source context.",
            source_title="Source report", source_url="https://example.org/source",
            published_on=date(2026, 10, 27), source_status="source_reported_unverified",
        )
        self.session.add(self.update)
        self.session.commit()
        self.app = create_app()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()
        self.env.stop()
        self.temp_dir.cleanup()

    def _upload(self, *, trend_update_id: str | None = None, source_note: str | None = "Screenshot supplied by the PO.",
                content: bytes = PNG_1PX, content_type: str = "image/png", filename: str = r"C:\fakepath\sample.png"):
        return create_image_evidence(
            self.project.id, self.subject.id, self.session, content, filename, content_type,
            source_note=source_note, trend_update_id=trend_update_id,
        )

    def test_upload_link_to_saved_trend_preserves_hash_bytes_attribution_and_survives_reopen(self) -> None:
        response = self._upload(trend_update_id=self.update.id, source_note=None)
        saved = response.model_dump(mode="json")
        self.assertEqual(saved["filename"], "sample.png")
        self.assertEqual(saved["content_sha256"], __import__("hashlib").sha256(PNG_1PX).hexdigest())
        self.assertEqual(saved["content_size"], len(PNG_1PX))
        self.assertEqual(saved["source_note"], "Copied source context.")
        self.assertEqual(saved["source_title"], "Source report")
        self.assertEqual(saved["source_url"], "https://example.org/source")
        self.assertEqual(saved["published_on"], "2026-10-27")
        self.assertEqual(saved["source_status"], "source_reported_unverified")

        image = get_image_evidence_content(self.project.id, response.id, self.session)
        self.assertEqual(image.body, PNG_1PX)
        self.assertEqual(image.media_type, "image/png")
        self.assertIn("inline; filename*=UTF-8''sample.png", image.headers["content-disposition"])

        page = list_image_evidence(self.project.id, self.session, limit=20)
        self.assertEqual([item.id for item in page.items], [response.id])
        self.session.close(); self.engine.dispose()
        self.engine = create_database_engine(get_database_path())
        self.session = Session(self.engine, expire_on_commit=False)
        reopened = list_image_evidence(self.project.id, self.session, limit=20).items[0]
        self.assertEqual(reopened.content_sha256, saved["content_sha256"])
        self.assertEqual(get_image_evidence_content(self.project.id, reopened.id, self.session).body, PNG_1PX)
        preserved_update = self.session.get(ProjectTrendUpdate, self.update.id)
        self.assertEqual(preserved_update.exact_claim, "Exact source-reported claim stays unchanged.")

    def test_standalone_image_requires_and_retains_source_note(self) -> None:
        with self.assertRaises(HTTPException) as missing:
            self._upload(source_note=None)
        self.assertEqual(missing.exception.status_code, 422)
        self.assertEqual(missing.exception.detail["code"], "SOURCE_NOTE_REQUIRED")
        saved = self._upload(source_note="Owner supplied a chart screenshot; values not extracted.",
                             filename="plot.png?ignored=1", content=PNG_1PX)
        self.assertEqual(saved.source_note, "Owner supplied a chart screenshot; values not extracted.")
        self.assertEqual(saved.filename, "plot.png?ignored=1")

    def test_rejects_wrong_subject_scope_invalid_image_and_oversized_content(self) -> None:
        with self.assertRaises(HTTPException) as cross_subject:
            create_image_evidence(self.project.id, self.other_subject.id, self.session, PNG_1PX,
                                  "x.png", "image/png", source_note="Context")
        self.assertEqual(cross_subject.exception.status_code, 404)

        with self.assertRaises(HTTPException) as wrong_trend:
            self._upload(trend_update_id="not-a-project-update")
        self.assertEqual(wrong_trend.exception.status_code, 409)

        with self.assertRaises(HTTPException) as mismatch:
            self._upload(content=b"<svg onload=alert(1) />", content_type="image/svg+xml")
        self.assertEqual(mismatch.exception.status_code, 415)
        with self.assertRaises(HTTPException) as too_large:
            self._upload(content=b"x" * (10 * 1024 * 1024 + 1))
        self.assertEqual(too_large.exception.status_code, 413)
        self.assertEqual(list_image_evidence(self.project.id, self.session, limit=20).items, [])

    def test_rejects_type_spoof_and_unsafe_source_url(self) -> None:
        with self.assertRaises(HTTPException) as spoofed:
            self._upload(content=PNG_1PX, content_type="image/jpeg")
        self.assertEqual(spoofed.exception.status_code, 415)
        with self.assertRaises(HTTPException) as unsafe:
            create_image_evidence(self.project.id, self.subject.id, self.session, PNG_1PX, "sample.png", "image/png",
                                  source_note="Context", source_url="javascript:alert(1)")
        self.assertEqual(unsafe.exception.status_code, 422)
        self.assertEqual(list_image_evidence(self.project.id, self.session, limit=20).items, [])

    def test_openapi_exposes_local_image_evidence_workflow(self) -> None:
        paths = self.app.openapi()["paths"]
        self.assertIn(f"/api/v1/projects/{{project_id}}/subjects/{{subject_id}}/image-evidence", paths)
        self.assertIn(f"/api/v1/projects/{{project_id}}/image-evidence", paths)


if __name__ == "__main__":
    unittest.main()
