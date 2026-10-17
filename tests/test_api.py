import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from backend.app.main import create_app


class ResearchAPITest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_root = Path(self.temp_dir.name) / "api data"
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

    def create_project(self, name: str = "ASMR Research") -> dict:
        response = self.client.post("/api/v1/projects", json={"name": name})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def create_plan(self, project_id: str, question: str = "Research question") -> dict:
        response = self.client.post(
            f"/api/v1/projects/{project_id}/plans",
            json={"question": question, "geos": ["US"], "platforms": ["ios"]},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_project_crud_and_cursor_pagination(self) -> None:
        first = self.create_project("Alpha")
        second = self.create_project("Beta")
        updated = self.client.patch(f"/api/v1/projects/{first['id']}", json={"category": "games"})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["category"], "games")
        page = self.client.get("/api/v1/projects", params={"limit": 1})
        self.assertEqual(page.status_code, 200)
        self.assertEqual(len(page.json()["items"]), 1)
        self.assertIsNotNone(page.json()["next_cursor"])
        next_page = self.client.get("/api/v1/projects", params={"limit": 1, "cursor": page.json()["next_cursor"]})
        self.assertEqual(len(next_page.json()["items"]), 1)
        self.assertNotEqual(page.json()["items"][0]["id"], next_page.json()["items"][0]["id"])
        self.assertEqual(self.client.get(f"/api/v1/projects/{second['id']}").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/projects/{first['id']}").status_code, 204)

    def test_invalid_project_payload_uses_validation_error_envelope(self) -> None:
        response = self.client.post("/api/v1/projects", json={"name": "   "})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "VALIDATION_ERROR")
        self.assertTrue(response.json()["error"]["details"]["errors"])

    def test_plan_comparison_period_is_optional_and_edits_create_a_new_version(self) -> None:
        project = self.create_project()
        initial_response = self.client.post(
            f"/api/v1/projects/{project['id']}/plans",
            json={
                "question": "Research without a comparison period",
                "source_policy": {"requested_sources": ["Apple App Store", "Google Play"]},
            },
        )
        self.assertEqual(initial_response.status_code, 201, initial_response.text)
        initial = initial_response.json()
        self.assertIsNone(initial["comparison_period_start"])
        self.assertIsNone(initial["comparison_period_end"])
        self.assertEqual(initial["source_policy"]["requested_sources"], ["Apple App Store", "Google Play"])

        revised_response = self.client.put(
            f"/api/v1/projects/{project['id']}/plans/{initial['version']}",
            json={"question": "Revised research question"},
        )
        self.assertEqual(revised_response.status_code, 200, revised_response.text)
        revised = revised_response.json()
        self.assertEqual(revised["version"], initial["version"] + 1)
        self.assertNotEqual(revised["id"], initial["id"])
        self.assertEqual(
            self.client.get(f"/api/v1/projects/{project['id']}/plans/{initial['version']}").json()["question"],
            "Research without a comparison period",
        )
        stale_edit = self.client.put(
            f"/api/v1/projects/{project['id']}/plans/{initial['version']}",
            json={"question": "Must not overwrite the latest version"},
        )
        self.assertEqual(stale_edit.status_code, 409)
        self.assertEqual(stale_edit.json()["error"]["code"], "STALE_PLAN_VERSION")

    def test_plan_validation_and_versioned_creation(self) -> None:
        project = self.create_project()
        invalid = self.client.post(
            f"/api/v1/projects/{project['id']}/plans",
            json={"question": "Question", "period_start": "2026-06-01"},
        )
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(invalid.json()["error"]["code"], "VALIDATION_ERROR")
        first = self.create_plan(project["id"], "First version")
        updated = self.client.put(
            f"/api/v1/projects/{project['id']}/plans/{first['version']}",
            json={"question": "Edited first version"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        second = updated.json()
        self.assertEqual((first["version"], second["version"]), (1, 2))
        self.assertEqual(self.client.get(f"/api/v1/projects/{project['id']}/plans/1").json()["question"], "First version")
        third = self.create_plan(project["id"], "Third version")
        self.assertEqual(third["version"], 3)
        self.assertEqual(self.client.get(f"/api/v1/projects/{project['id']}/plans/latest").json()["id"], third["id"])
        page = self.client.get(f"/api/v1/projects/{project['id']}/plans", params={"limit": 1})
        self.assertEqual(page.json()["items"][0]["version"], 1)
        self.assertEqual(page.json()["next_cursor"], "1")
        stale_update = self.client.put(
            f"/api/v1/projects/{project['id']}/plans/1",
            json={"question": "Stale edit"},
        )
        self.assertEqual(stale_update.status_code, 409)
        invalid_cursor = self.client.get(f"/api/v1/projects/{project['id']}/plans", params={"cursor": "bad"})
        self.assertEqual(invalid_cursor.status_code, 422)

    def test_run_is_bound_to_requested_plan_version_and_invalid_version_rejected(self) -> None:
        project = self.create_project()
        first = self.create_plan(project["id"], "First version")
        self.create_plan(project["id"], "Second version")
        response = self.client.post(f"/api/v1/projects/{project['id']}/runs", json={"plan_version": 1})
        self.assertEqual(response.status_code, 201, response.text)
        run = response.json()
        self.assertEqual(run["plan_id"], first["id"])
        self.assertEqual(run["plan_version"], first["version"])
        blocked_plan_delete = self.client.delete(f"/api/v1/projects/{project['id']}/plans/1")
        self.assertEqual(blocked_plan_delete.status_code, 409)
        self.assertEqual(self.client.delete(f"/api/v1/runs/{run['id']}").status_code, 204)
        self.assertEqual(self.client.get(f"/api/v1/runs/{run['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/v1/projects/{project['id']}/plans/1").status_code, 204)
        missing_version = self.client.post(f"/api/v1/projects/{project['id']}/runs", json={"plan_version": 99})
        self.assertEqual(missing_version.status_code, 404)
        self.assertEqual(missing_version.json()["error"]["code"], "PLAN_VERSION_NOT_FOUND")

    def test_run_state_transitions_and_terminal_state(self) -> None:
        project = self.create_project()
        plan = self.create_plan(project["id"])
        run = self.client.post(f"/api/v1/projects/{project['id']}/runs", json={"plan_version": plan["version"]}).json()
        invalid = self.client.patch(f"/api/v1/runs/{run['id']}/state", json={"state": "completed"})
        self.assertEqual(invalid.status_code, 409)
        for state in ("collecting", "validating", "synthesizing", "completed"):
            response = self.client.patch(f"/api/v1/runs/{run['id']}/state", json={"state": state})
            self.assertEqual(response.status_code, 200, response.text)
        completed = self.client.get(f"/api/v1/runs/{run['id']}").json()
        self.assertIsNotNone(completed["started_at"])
        self.assertIsNotNone(completed["finished_at"])
        terminal = self.client.patch(f"/api/v1/runs/{run['id']}/state", json={"state": "failed"})
        self.assertEqual(terminal.status_code, 409)
        delete_terminal = self.client.delete(f"/api/v1/runs/{run['id']}")
        self.assertEqual(delete_terminal.status_code, 409)

    def test_run_state_rejects_unknown_state_and_project_delete_preserves_history(self) -> None:
        project = self.create_project()
        plan = self.create_plan(project["id"])
        run = self.client.post(f"/api/v1/projects/{project['id']}/runs", json={"plan_version": plan["version"]}).json()
        unknown = self.client.patch(f"/api/v1/runs/{run['id']}/state", json={"state": "invented"})
        self.assertEqual(unknown.status_code, 422)
        self.assertEqual(unknown.json()["error"]["code"], "VALIDATION_ERROR")
        blocked_delete = self.client.delete(f"/api/v1/projects/{project['id']}")
        self.assertEqual(blocked_delete.status_code, 409)
        self.assertEqual(blocked_delete.json()["error"]["code"], "CONFLICT")

    def test_openapi_exposes_typed_contracts_and_error_responses(self) -> None:
        response = self.client.get("/openapi.json")
        self.assertEqual(response.status_code, 200)
        spec = response.json()
        self.assertIn("/api/v1/projects/{project_id}/runs", spec["paths"])
        self.assertIn("ResearchProjectCreate", spec["components"]["schemas"])
        self.assertIn("ResearchPlanRead", spec["components"]["schemas"])
        self.assertIn("ResearchRunRead", spec["components"]["schemas"])
        self.assertIn("422", spec["paths"]["/api/v1/projects"]["post"]["responses"])
        self.assertIn("put", spec["paths"]["/api/v1/projects/{project_id}/plans/{version}"])
        self.assertIn("delete", spec["paths"]["/api/v1/runs/{run_id}"])


if __name__ == "__main__":
    unittest.main()
