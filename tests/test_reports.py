import os
import json
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
        self.assertIn("research_data", schema["components"]["schemas"]["ImportedReportRead"]["properties"])
        self.assertIn("/api/v1/reports/{report_id}/benchmark-selections", schema["paths"])

    def test_unstructured_report_extracts_only_structure_and_never_marks_urls_verified(self) -> None:
        raw = "# Local transit patterns\n\n- Weekend demand differs\n- Coverage remains unclear\n\n| Area | Observation |\n| --- | --- |\n| North | Later service |\n\nSee https://example.com/source.\n"
        response = self.client.post("/api/v1/reports", json=self.payload(raw))
        self.assertEqual(response.status_code, 201, response.text)
        saved = response.json()
        self.assertEqual(saved["content"], raw)
        self.assertEqual(saved["parse_status"], "PARTIAL")
        self.assertEqual(saved["research_data"]["sections"][0]["heading"], "Local transit patterns")
        self.assertEqual(saved["research_data"]["sections"][0]["lists"][0]["items"], ["Weekend demand differs", "Coverage remains unclear"])
        self.assertEqual(saved["research_data"]["sections"][0]["tables"][0]["columns"], ["Area", "Observation"])
        self.assertEqual(saved["research_data"]["evidence_references"][0]["verified"], False)
        self.assertEqual(saved["research_data"]["findings"], [])
        self.assertEqual(saved["research_data"]["entities"], [])

    def test_plain_text_without_deterministic_structure_needs_structuring(self) -> None:
        response = self.client.post("/api/v1/reports", json=self.payload("A narrative without headings or references."))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["parse_status"], "NEEDS_STRUCTURING")
        self.assertEqual(response.json()["research_data"]["sections"], [])

    def test_headingless_markdown_table_and_list_are_still_parsed(self) -> None:
        raw = "- Sample A\n- Sample B\n\n| Factor | Observation |\n| --- | --- |\n| Timing | Variable |"
        response = self.client.post("/api/v1/reports", json=self.payload(raw))
        self.assertEqual(response.status_code, 201)
        saved = response.json()
        self.assertEqual(saved["parse_status"], "PARTIAL")
        section = saved["research_data"]["sections"][0]
        self.assertEqual(section["heading"], "Unheaded content")
        self.assertEqual(section["tables"][0]["rows"], [["Timing", "Variable"]])
        self.assertEqual(section["lists"][0]["items"], ["Sample A", "Sample B"])

    def test_fenced_structured_json_is_detected_in_report_without_manual_reentry(self) -> None:
        raw = (
            "# Regional water services\n\n"
            "Source: https://example.com/water\n\n"
            "```json\n"
            + json.dumps({"entities": [{"key": "utility-one", "entity_type": "operator", "name": "Water operator"}], "findings": [], "evidence_references": [{"url": "https://example.com/water"}]})
            + "\n```"
        )
        response = self.client.post("/api/v1/reports", json=self.payload(raw))
        self.assertEqual(response.status_code, 201, response.text)
        saved = response.json()
        self.assertEqual(saved["content"], raw)
        self.assertEqual(saved["parse_status"], "PARSED")
        self.assertEqual(saved["research_data"]["entities"][0]["name"], "Water operator")

    def test_valid_domain_neutral_structured_import_and_benchmark_selection(self) -> None:
        raw = "# Regional payment options\n\nSettlement time observations.\n\nSources: https://example.com/payments"
        structured = {
            "sections": [{"heading": "Regional payment options", "content": "Settlement time observations.", "hierarchy": 1, "source_location": "line:1"}],
            "entities": [{"key": "network-one", "entity_type": "service", "name": "Regional network", "attributes": {"settlement_days": 2}, "evidence_references": ["https://example.com/payments"]}],
            "findings": [{"key": "finding-one", "finding_type": "operational observation", "title": "Settlement varies", "description": "The reported settlement time differs by provider.", "related_entities": ["network-one"], "evidence_references": ["https://example.com/payments"], "scope": {"region": "US"}, "evidence_status": "unverified"}],
            "evidence_references": [{"url": "https://example.com/payments", "title": "Payment documentation", "source_location": "line:5", "verified": False}],
            "benchmark_dimensions": [{"key": "settlement", "name": "Settlement window", "related_entities": ["network-one"], "evidence_references": ["https://example.com/payments"], "observations": [{"entity_key": "network-one", "value": "2 days", "evidence_references": ["https://example.com/payments"]}]}],
            "research_gaps": ["Independent measurements were not available."],
            "po_recommendations": ["Validate against operational needs."],
        }
        response = self.client.post("/api/v1/reports", json={**self.payload(raw), "structured_json": json.dumps(structured)})
        self.assertEqual(response.status_code, 201, response.text)
        saved = response.json()
        self.assertEqual(saved["parse_status"], "PARSED")
        self.assertEqual(saved["research_data"]["findings"][0]["title"], "Settlement varies")
        report_id = saved["id"]
        selected = self.client.put(f"/api/v1/reports/{report_id}/benchmark-selections", json={"selections": [{"item_type": "finding", "item_key": "finding-one"}, {"item_type": "dimension", "item_key": "settlement"}]})
        self.assertEqual(selected.status_code, 200, selected.text)
        reopened = self.client.get(f"/api/v1/reports/{report_id}").json()
        self.assertEqual(len(reopened["benchmark_selections"]), 2)

    def test_invalid_structured_json_preserves_original_and_reports_specific_extraction_error(self) -> None:
        raw = "# Raw report\n\nKeep this text."
        response = self.client.post("/api/v1/reports", json={**self.payload(raw), "structured_json": "{invalid"})
        self.assertEqual(response.status_code, 201, response.text)
        saved = response.json()
        self.assertEqual(saved["content"], raw)
        self.assertEqual(saved["parse_status"], "PARTIAL")
        self.assertIn("Expecting property name", saved["extraction_error"])

    def test_structured_relations_must_resolve_to_report_entities_and_source_urls(self) -> None:
        raw = "# Report\n\nSource: https://example.com/reference"
        structured = {
            "entities": [],
            "findings": [{"key": "claim", "finding_type": "observation", "title": "Claim", "description": "Claim", "related_entities": ["missing"], "evidence_references": ["https://example.com/reference"]}],
            "evidence_references": [{"url": "https://example.com/reference", "verified": False}],
        }
        response = self.client.post("/api/v1/reports", json={**self.payload(raw), "structured_json": json.dumps(structured)})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["parse_status"], "PARTIAL")
        self.assertIn("unknown entity keys", response.json()["extraction_error"])

    def test_benchmark_selection_rejects_unknown_items(self) -> None:
        report_id = self.client.post("/api/v1/reports", json=self.payload()).json()["id"]
        response = self.client.put(f"/api/v1/reports/{report_id}/benchmark-selections", json={"selections": [{"item_type": "finding", "item_key": "missing"}]})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "INVALID_BENCHMARK_SELECTION")

    def test_unstructured_topics_are_not_mapped_to_business_taxonomies(self) -> None:
        samples = (
            "# Puzzle market\n\nA report about game products.",
            "# ASMR market\n\nA report about video content.",
            "# Drama streaming products\n\nA report about episodic services.",
            "# Utility providers\n\nA report about software services.",
            "# Advertising monetization\n\nA report about ad delivery.",
            "# Municipal water operations\n\nA report about an unconfigured research topic.",
        )
        for sample in samples:
            with self.subTest(topic=sample.splitlines()[0]):
                result = self.client.post("/api/v1/reports", json=self.payload(sample)).json()
                self.assertEqual(result["research_data"]["sections"][0]["heading"], sample.splitlines()[0][2:])
                self.assertEqual(result["research_data"]["findings"], [])
                self.assertEqual(result["research_data"]["entities"], [])
                self.assertEqual(result["research_data"]["benchmark_dimensions"], [])

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
