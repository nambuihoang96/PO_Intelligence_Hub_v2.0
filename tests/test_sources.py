import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from backend.app.main import create_app


class SourceRegistryAPITest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_root = Path(self.temp_dir.name) / "source data"
        self.env = patch.dict(os.environ, {"APP_DATA_ROOT": str(self.data_root)})
        self.env.start()
        workspace = Path(__file__).resolve().parents[1]
        command.upgrade(Config(str(workspace / "alembic.ini")), "head")
        self.client_context = TestClient(create_app())
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        self.env.stop()
        self.temp_dir.cleanup()

    def create_run(self) -> dict:
        project = self.client.post("/api/v1/projects", json={"name": "Source intake test"}).json()
        plan = self.client.post(f"/api/v1/projects/{project['id']}/plans", json={"question": "Study source intake"}).json()
        run = self.client.post(f"/api/v1/projects/{project['id']}/runs", json={"plan_version": plan["version"]})
        self.assertEqual(run.status_code, 201, run.text)
        return run.json()

    def test_source_registry_defaults_to_manual_disabled_and_paginates(self) -> None:
        first = self.client.post("/api/v1/sources", json={"name": "Apple Store", "source_type": "app_store", "url_domain": "Apps.Apple.com."})
        second = self.client.post("/api/v1/sources", json={"name": "Google Play", "source_type": "app_store"})
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(second.status_code, 201, second.text)
        source = first.json()
        self.assertEqual(source["url_domain"], "apps.apple.com")
        self.assertEqual(source["license_status"], "unknown")
        self.assertEqual(source["collection_mode"], "manual")
        self.assertFalse(source["enabled"])
        page = self.client.get("/api/v1/sources", params={"limit": 1}).json()
        self.assertEqual(len(page["items"]), 1)
        self.assertIsNotNone(page["next_cursor"])
        next_page = self.client.get("/api/v1/sources", params={"limit": 1, "cursor": page["next_cursor"]}).json()
        self.assertEqual(len(next_page["items"]), 1)

    def test_openapi_exposes_source_registry_and_manual_evidence_contracts(self) -> None:
        schema = self.client.get("/openapi.json").json()
        paths = schema["paths"]
        self.assertIn("post", paths["/api/v1/sources"])
        self.assertIn("get", paths["/api/v1/sources"])
        self.assertIn("patch", paths["/api/v1/sources/{source_id}"])
        self.assertIn("post", paths["/api/v1/runs/{run_id}/evidence"])
        self.assertIn("get", paths["/api/v1/runs/{run_id}/evidence"])
        contracts = schema["components"]["schemas"]
        self.assertIn("SourceRegistryCreate", contracts)
        self.assertIn("ManualEvidenceCreate", contracts)
        self.assertIn("ManualEvidenceRead", contracts)

    def test_registry_rejects_adapter_enabling_fields_and_invalid_metadata(self) -> None:
        cases = [
            {"name": "Scrape", "source_type": "website", "collection_mode": "approved_adapter"},
            {"name": "Scrape", "source_type": "website", "enabled": True},
            {"name": " ", "source_type": "website"},
            {"name": "Bad domain", "source_type": "website", "url_domain": "https://example.com/path"},
            {"name": "Bad domain", "source_type": "website", "url_domain": "[invalid"},
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                response = self.client.post("/api/v1/sources", json=payload)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json()["error"]["code"], "VALIDATION_ERROR")

    def test_manual_evidence_is_saved_unverified_and_can_be_paginated(self) -> None:
        run = self.create_run()
        source = self.client.post("/api/v1/sources", json={"name": "Example News", "source_type": "news", "url_domain": "example.com", "license_status": "review_required"}).json()
        payload = {
            "source_registry_id": source["id"],
            "source_url": "https://sub.example.com/story/1",
            "title": "Product launch",
            "excerpt_or_ref": "User-provided excerpt.",
            "scope": {"geo": "US"},
        }
        response = self.client.post(f"/api/v1/runs/{run['id']}/evidence", json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        item = response.json()
        self.assertEqual(item["source"]["collection_mode"], "manual")
        self.assertEqual(item["source"]["source_registry_id"], source["id"])
        self.assertEqual(item["evidence"]["method"], "manual_user_note")
        self.assertEqual(item["evidence"]["quality"], "insufficient")
        self.assertEqual(item["evidence"]["status"], "needs_review")
        page = self.client.get(f"/api/v1/runs/{run['id']}/evidence", params={"limit": 1})
        self.assertEqual(page.status_code, 200, page.text)
        self.assertEqual(page.json()["items"][0]["evidence"]["id"], item["evidence"]["id"])

    def test_invalid_or_blocked_manual_evidence_is_rejected(self) -> None:
        run = self.create_run()
        blocked = self.client.post("/api/v1/sources", json={"name": "Blocked", "source_type": "website", "license_status": "blocked"}).json()
        base = {"source_name": "Web", "source_type": "website", "source_url": "https://example.com/story", "excerpt_or_ref": "A note"}
        for invalid_url in ("javascript:alert(1)", "https://user:pass@example.com", "https://[broken"):
            with self.subTest(url=invalid_url):
                response = self.client.post(f"/api/v1/runs/{run['id']}/evidence", json={**base, "source_url": invalid_url})
                self.assertEqual(response.status_code, 422)
        missing_source = self.client.post(f"/api/v1/runs/{run['id']}/evidence", json={"source_url": base["source_url"], "excerpt_or_ref": "note"})
        self.assertEqual(missing_source.status_code, 422)
        mismatch = self.client.post(f"/api/v1/runs/{run['id']}/evidence", json={**base, "source_registry_id": blocked["id"], "source_url": "https://unrelated.test/page"})
        self.assertEqual(mismatch.status_code, 409)
        allowed_domain = self.client.post("/api/v1/sources", json={"name": "Blocked domain", "source_type": "website", "url_domain": "example.com", "license_status": "blocked"}).json()
        forbidden = self.client.post(f"/api/v1/runs/{run['id']}/evidence", json={**base, "source_registry_id": allowed_domain["id"]})
        self.assertEqual(forbidden.status_code, 409)

    def test_license_status_can_be_updated_but_source_stays_manual_and_disabled(self) -> None:
        source = self.client.post("/api/v1/sources", json={"name": "Store", "source_type": "app_store"}).json()
        updated = self.client.patch(f"/api/v1/sources/{source['id']}", json={"license_status": "approved"})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["license_status"], "approved")
        self.assertEqual(updated.json()["collection_mode"], "manual")
        self.assertFalse(updated.json()["enabled"])


if __name__ == "__main__":
    unittest.main()
