"""A pasted answer records which assistant wrote it; old reports and Codex runs keep valid values."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from backend.app.main import create_app


class ReportSourceAssistantTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(__file__).resolve().parents[1]
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"APP_DATA_ROOT": str(Path(self.temp_dir.name) / "report data")})
        self.env.start()
        command.upgrade(Config(str(self.root / "alembic.ini")), "head")
        self.client_context = TestClient(create_app())
        self.client = self.client_context.__enter__()
        project = self.client.post("/api/v1/projects", json={"name": "Assistant source", "topic": "Puzzle"})
        self.project_id = project.json()["id"]

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        self.env.stop()
        self.temp_dir.cleanup()

    def payload(self, content: str, **extra) -> dict:
        return {"question": "Puzzle research", "geo": "Global / not specified", "os": "Unknown", "content": content,
                "project_id": self.project_id, **extra}

    def test_pasted_claude_answer_keeps_its_assistant_and_reaches_the_project(self) -> None:
        response = self.client.post("/api/v1/reports", json=self.payload("# Claude answer\n\nSee [a](https://example.com/a).", source_assistant="claude"))
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["source_assistant"], "claude")
        project_reports = self.client.get(f"/api/v1/projects/{self.project_id}/reports").json()
        self.assertEqual([item["source_assistant"] for item in project_reports["items"]], ["claude"])

    def test_chatgpt_and_codex_and_old_reports_stay_valid(self) -> None:
        chatgpt = self.client.post("/api/v1/reports", json=self.payload("# ChatGPT answer", source_assistant="chatgpt"))
        self.assertEqual(chatgpt.json()["source_assistant"], "chatgpt")
        no_field = self.client.post("/api/v1/reports", json=self.payload("# Old style import"))
        self.assertEqual(no_field.status_code, 201, no_field.text)
        self.assertIsNone(no_field.json()["source_assistant"])
        self.assertEqual(no_field.json()["origin"], "chatgpt_user_import")
        codex = self.client.post("/api/v1/reports", json={**self.payload("# Codex output"), "origin": "codex_cli_research", "source_assistant": "claude"})
        self.assertEqual(codex.status_code, 201, codex.text)
        self.assertEqual(codex.json()["origin"], "codex_cli_research")
        self.assertEqual(codex.json()["source_assistant"], "codex")

    def test_unknown_assistant_is_rejected(self) -> None:
        response = self.client.post("/api/v1/reports", json=self.payload("# Unknown", source_assistant="gemini"))
        self.assertEqual(response.status_code, 422)

    def test_report_can_be_linked_to_a_csv_of_its_own_project_only(self) -> None:
        from backend.app.db import create_database_engine, get_database_path
        from backend.app.models import QuantitativeDataset
        from sqlalchemy.orm import Session
        report = self.client.post("/api/v1/reports", json=self.payload("# Linked report")).json()
        other = self.client.post("/api/v1/projects", json={"name": "Other"}).json()["id"]
        engine = create_database_engine(get_database_path())
        with Session(engine) as session:
            own = QuantitativeDataset(filename="own.csv", content_sha256="a" * 64, original_csv="x", field_mapping_json={}, entity_mappings_json={},
                                      observations_json=[], compatibility_status="partial", validation_reasons_json=[], project_id=self.project_id)
            foreign = QuantitativeDataset(filename="foreign.csv", content_sha256="b" * 64, original_csv="y", field_mapping_json={}, entity_mappings_json={},
                                          observations_json=[], compatibility_status="partial", validation_reasons_json=[], project_id=other)
            session.add_all([own, foreign])
            session.commit()
            own_id, foreign_id = own.id, foreign.id
        engine.dispose()
        body = {"lens": "downloads", "lens_label": "Lượt tải", "rows": [{"source_row": 2, "name": "Alpha"}]}
        linked = self.client.put(f"/api/v1/reports/{report['id']}/csv-selection", json={**body, "dataset_id": own_id})
        self.assertEqual(linked.status_code, 200, linked.text)
        self.assertEqual(linked.json()["source_selection"]["dataset_filename"], "own.csv")
        self.assertEqual(linked.json()["content_sha256"], report["content_sha256"])
        self.assertEqual(self.client.get(f"/api/v1/reports/{report['id']}").json()["source_selection"]["rows"][0]["name"], "Alpha")
        self.assertEqual(self.client.put(f"/api/v1/reports/{report['id']}/csv-selection", json={**body, "dataset_id": foreign_id}).status_code, 422)
        self.assertEqual(self.client.put(f"/api/v1/reports/{report['id']}/csv-selection", json={**body, "dataset_id": "missing"}).status_code, 404)


if __name__ == "__main__":
    unittest.main()
