import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from backend.app.main import create_app


class ImportedReportsAPITest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"APP_DATA_ROOT": str(Path(self.temp_dir.name) / "report data")})
        self.env.start()
        workspace = Path(__file__).resolve().parents[1]
        command.upgrade(Config(str(workspace / "alembic.ini")), "head")
        self.client_context = TestClient(create_app())
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        self.env.stop()
        self.temp_dir.cleanup()

    def payload(self, content: str = "# Summary\n\nSee [source](https://example.com).\n") -> dict:
        return {"question": "Benchmark learning apps", "geo": "US", "os": "Both", "research_period": "2025-2026", "content": content}

    def test_import_stores_verbatim_report_and_metadata_as_unverified(self) -> None:
        raw = (
            "# Executive summary\r\n\r\n"
            "This Markdown sample is used to exercise report import and display.\r\n\r\n"
            "## Sources and evidence\r\n\r\n"
            "- [Reference](https://example.com/research)\r\n\r\n"
            "## Research gaps and confidence\r\n\r\n"
            "No market finding is asserted by this test fixture.\r\n\r\n"
            "<script>alert('not executed')</script>\r\n"
        )
        response = self.client.post("/api/v1/reports", json=self.payload(raw))
        self.assertEqual(response.status_code, 201, response.text)
        saved = response.json()
        self.assertEqual(saved["content"], raw)
        self.assertEqual(saved["origin"], "chatgpt_user_import")
        self.assertEqual(saved["verification_status"], "unverified")
        self.assertEqual(saved["research_period"], "2025-2026")
        report_id = saved["id"]
        self.client_context.__exit__(None, None, None)
        self.client_context = TestClient(create_app())
        self.client = self.client_context.__enter__()
        reopened = self.client.get(f"/api/v1/reports/{report_id}")
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(reopened.json()["content"], raw)

    def test_duplicate_content_returns_existing_report_without_creating_another(self) -> None:
        first = self.client.post("/api/v1/reports", json=self.payload()).json()
        duplicate = self.client.post("/api/v1/reports", json=self.payload()).json()
        self.assertEqual(duplicate["id"], first["id"])
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(len(self.client.get("/api/v1/reports").json()["items"]), 1)

    def test_invalid_imports_return_validation_errors(self) -> None:
        for payload in (
            {**self.payload(), "content": "  "},
            {**self.payload(), "question": "   "},
            {**self.payload(), "os": "Windows"},
            {**self.payload(), "origin": "verified"},
        ):
            response = self.client.post("/api/v1/reports", json=payload)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()["error"]["code"], "VALIDATION_ERROR")

    def test_history_paginates_without_repeating_reports(self) -> None:
        for content in ("# One\n", "# Two\n", "# Three\n"):
            self.client.post("/api/v1/reports", json=self.payload(content))
        first = self.client.get("/api/v1/reports", params={"limit": 2}).json()
        self.assertEqual(len(first["items"]), 2)
        self.assertIsNotNone(first["next_cursor"])
        second = self.client.get("/api/v1/reports", params={"limit": 2, "cursor": first["next_cursor"]}).json()
        ids = [item["id"] for item in first["items"] + second["items"]]
        self.assertEqual(len(ids), 3)
        self.assertEqual(len(set(ids)), 3)

    def test_openapi_documents_typed_report_endpoints(self) -> None:
        schema = self.client.get("/openapi.json").json()
        self.assertIn("/api/v1/reports", schema["paths"])
        self.assertIn("post", schema["paths"]["/api/v1/reports"])
        self.assertIn("get", schema["paths"]["/api/v1/reports"])
        self.assertIn("/api/v1/reports/{report_id}", schema["paths"])
        create_contract = schema["components"]["schemas"]["ImportedReportCreate"]
        self.assertEqual(create_contract["additionalProperties"], False)
        self.assertIn("content", create_contract["required"])

    def test_import_does_not_change_existing_research_run(self) -> None:
        project = self.client.post("/api/v1/projects", json={"name": "Existing Project"}).json()
        plan = self.client.post(
            f"/api/v1/projects/{project['id']}/plans",
            json={"question": "Existing research question", "geos": ["US"], "platforms": ["ios"]},
        ).json()
        run = self.client.post(f"/api/v1/projects/{project['id']}/runs", json={"plan_version": plan["version"]}).json()
        self.assertEqual(run["state"], "queued")
        evidence_response = self.client.post(
            f"/api/v1/runs/{run['id']}/evidence",
            json={
                "source_name": "User-provided source",
                "source_type": "reference",
                "source_url": "https://example.com/source",
                "excerpt_or_ref": "Existing evidence note",
            },
        )
        self.assertEqual(evidence_response.status_code, 201, evidence_response.text)
        response = self.client.post("/api/v1/reports", json=self.payload())
        self.assertEqual(response.status_code, 201)
        preserved = self.client.get(f"/api/v1/runs/{run['id']}").json()
        self.assertEqual(preserved["state"], "queued")
        self.assertEqual(preserved["plan_id"], plan["id"])
        evidence_after = self.client.get(f"/api/v1/runs/{run['id']}/evidence").json()
        self.assertEqual(len(evidence_after["items"]), 1)
        self.assertEqual(evidence_after["items"][0]["evidence"]["excerpt_or_ref"], "Existing evidence note")


if __name__ == "__main__":
    unittest.main()
