import os
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

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
        if self.client_context is not None:
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

    def _structured_payload(self, key: str = "entity-a", url: str = "https://example.com/") -> dict:
        return {
            "sections": [{"heading": "Observed context", "content": "Relevant evidence and a domain-specific observation.", "hierarchy": 1, "source_location": "line:1"}],
            "entities": [{"key": key, "entity_type": "research subject", "name": f"Subject {key}", "attributes": {"context": "provided"}, "evidence_references": [url]}],
            "findings": [{"key": f"finding-{key}", "finding_type": "observation", "title": f"Observation {key}", "description": "A report-provided observation with explicit uncertainty.", "related_entities": [key], "evidence_references": [url], "source_locations": ["line:3"], "scope": {"geo": "US", "period": "2025"}, "evidence_status": "unverified", "confidence": None, "uncertainty": "Not independently checked", "po_implications": "Review before using."}],
            "evidence_references": [{"url": url, "title": "Source supplied in report", "source_location": "line:5", "verified": False}],
            "benchmark_dimensions": [{"key": f"dimension-{key}", "name": "Context-specific comparison", "related_entities": [key], "evidence_references": [url], "observations": [{"entity_key": key, "value": {"reported": "value"}, "evidence_references": [url], "source_locations": ["line:3"], "evidence_status": "unverified", "uncertainty": "Not independently verified"}]}],
            "research_gaps": ["Independent validation unavailable."], "po_recommendations": ["Assess within product context."],
        }

    def test_structured_update_invalid_data_and_duplicate_upgrade_preserve_po_data(self) -> None:
        raw = "# Context\n\nObservation from report.\n\nSource: https://example.com/\n"
        first = self.client.post("/api/v1/reports", json=self.payload(raw)).json()
        report_id = first["id"]
        duplicate = self.client.post("/api/v1/reports", json={**self.payload(raw), "structured_json": json.dumps(self._structured_payload())}).json()
        self.assertEqual(duplicate["id"], report_id)
        self.assertEqual(duplicate["parse_status"], "PARSED")
        self.assertEqual(len(self.client.get("/api/v1/reports").json()["items"]), 1)
        selected = self.client.put(f"/api/v1/reports/{report_id}/benchmark-selections", json={"selections": [{"item_type": "finding", "item_key": "finding-entity-a"}]})
        self.assertEqual(selected.status_code, 200)
        workspace = {"custom_dimensions": ["PO priority"], "entries": [{"item_type": "finding", "item_key": "finding-entity-a", "po_assessment": "Promising", "notes": "Check sample size", "next_action": "Review source", "dimension_assessments": {}}]}
        self.assertEqual(self.client.put(f"/api/v1/reports/{report_id}/benchmark-workspace", json=workspace).status_code, 200)
        before = self.client.get(f"/api/v1/reports/{report_id}").json()
        invalid = self.client.put(f"/api/v1/reports/{report_id}/structured-data", json={"research_data": {"entities": [{"key": "broken"}]}})
        self.assertEqual(invalid.status_code, 422)
        after_invalid = self.client.get(f"/api/v1/reports/{report_id}").json()
        self.assertEqual(after_invalid["research_data"], before["research_data"])
        self.assertEqual(after_invalid["content"], raw)
        revised = self._structured_payload(key="entity-b")
        # The second valid URL remains grounded by the same report; only structured keys change.
        update = self.client.put(f"/api/v1/reports/{report_id}/structured-data", json={"research_data": revised})
        self.assertEqual(update.status_code, 200, update.text)
        saved = self.client.get(f"/api/v1/reports/{report_id}").json()
        self.assertEqual(saved["benchmark_selections"], before["benchmark_selections"])
        self.assertEqual(saved["benchmark_workspace"], workspace)
        self.assertEqual(saved["orphaned_benchmark_selections"], before["benchmark_selections"])
        self.assertEqual(saved["orphaned_benchmark_entries"][0]["notes"], "Check sample size")
        self.assertEqual(saved["content"], raw)
        removed = self.client.put(f"/api/v1/reports/{report_id}/benchmark-selections", json={"selections": []})
        self.assertEqual(removed.status_code, 200)
        after_explicit_resolution = self.client.get(f"/api/v1/reports/{report_id}").json()
        self.assertEqual(after_explicit_resolution["benchmark_selections"], [])
        self.assertEqual(after_explicit_resolution["benchmark_workspace"]["entries"][0]["notes"], "Check sample size")

    def test_duplicate_structured_data_does_not_overwrite_an_existing_structured_report(self) -> None:
        raw = "# Context\n\nFirst observation.\n\nSource: https://example.com/\n"
        first = self.client.post("/api/v1/reports", json={**self.payload(raw), "structured_json": json.dumps(self._structured_payload())}).json()
        before = first["research_data"]
        duplicate = self.client.post("/api/v1/reports", json={**self.payload(raw), "structured_json": json.dumps(self._structured_payload(key="other"))}).json()
        self.assertTrue(duplicate["duplicate"])
        self.assertTrue(duplicate["structured_update_available"])
        self.assertEqual(duplicate["research_data"], before)
        self.assertEqual(len(self.client.get("/api/v1/reports").json()["items"]), 1)

    def test_deterministic_reprocess_preserves_valid_structured_data_and_original(self) -> None:
        raw = "# Original heading\n\nAn observation here.\n\nSource: https://example.com/\n"
        saved = self.client.post("/api/v1/reports", json={**self.payload(raw), "structured_json": json.dumps(self._structured_payload())}).json()
        response = self.client.post(f"/api/v1/reports/{saved['id']}/reprocess")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["reprocessed"])
        self.assertEqual(response.json()["research_data"], saved["research_data"])
        self.assertEqual(response.json()["content"], raw)

    def test_dynamic_environment_values_and_multi_domain_structured_contract(self) -> None:
        domains = ("Puzzle", "ASMR", "Drama", "Utilities", "Ad Monetization", "Marine logistics")
        for index, domain in enumerate(domains):
            with self.subTest(domain=domain):
                url = f"https://example.com/research-{index}"
                raw = f"# {domain}\n\nObservation {domain} is stated here.\n\nSource: {url}\n"
                structured = self._structured_payload(key=f"entity-{index}", url=url)
                structured["sections"].append({"heading": "Additional context", "content": "Another report section.", "hierarchy": 2, "source_location": "line:3"})
                result = self.client.post("/api/v1/reports", json={**self.payload(raw), "os": "Distributed physical operations", "structured_json": json.dumps(structured)})
                self.assertEqual(result.status_code, 201, result.text)
                data = result.json()
                self.assertEqual(data["os"], "Distributed physical operations")
                self.assertEqual(data["parse_status"], "PARSED")
                self.assertEqual(len(data["research_data"]["sections"]), 2)
                self.assertEqual(len(data["research_data"]["findings"]), 1)
                self.assertEqual(len(data["research_data"]["entities"]), 1)
                self.assertEqual(data["research_data"]["evidence_references"][0]["verified"], False)

    def test_structured_locations_and_unverified_status_are_validated(self) -> None:
        raw = "# Report\n\nA supported finding appears here.\n\nSource: https://example.com/source\n"
        good = self._structured_payload(url="https://example.com/source")
        good["findings"][0]["source_locations"] = ["line:3"]
        good["evidence_references"][0]["source_location"] = "line:5"
        good["benchmark_dimensions"][0]["observations"][0]["source_locations"] = ["line:3"]
        good["benchmark_dimensions"][0]["observations"][0]["evidence_status"] = "unverified"
        imported = self.client.post("/api/v1/reports", json={**self.payload(raw), "structured_json": json.dumps(good)}).json()
        self.assertEqual(imported["parse_status"], "PARSED")
        forged = self._structured_payload(url="https://example.com/source")
        forged["evidence_references"][0]["source_location"] = "line:1"
        invalid = self.client.post("/api/v1/reports", json={**self.payload("# Other\n\nSource: https://example.com/source"), "structured_json": json.dumps(forged)})
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(invalid.json()["error"]["code"], "INVALID_RESEARCH_INPUT")
        self.assertIn("does not point to its URL", invalid.json()["error"]["message"])

    def test_benchmark_workspace_round_trips_and_rejects_unknown_items(self) -> None:
        raw = "# Context\n\nObservation here.\n\nSource: https://example.com/\n"
        imported = self.client.post("/api/v1/reports", json={**self.payload(raw), "structured_json": json.dumps(self._structured_payload())}).json()
        report_id = imported["id"]
        workspace = {"custom_dimensions": ["PO-defined lens"], "entries": [{"item_type": "entity", "item_key": "entity-a", "po_assessment": "Keep", "notes": "Manual evaluation", "next_action": "Interview users", "dimension_assessments": {}}]}
        response = self.client.put(f"/api/v1/reports/{report_id}/benchmark-workspace", json=workspace)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get(f"/api/v1/reports/{report_id}").json()["benchmark_workspace"], workspace)
        invalid = {"custom_dimensions": [], "entries": [{"item_type": "entity", "item_key": "missing", "po_assessment": "", "notes": "", "next_action": ""}]}
        self.assertEqual(self.client.put(f"/api/v1/reports/{report_id}/benchmark-workspace", json=invalid).status_code, 422)

    def test_pre_0006_report_survives_additive_migration_and_can_be_reprocessed(self) -> None:
        workspace = Path(__file__).resolve().parents[1]
        self.client_context.__exit__(None, None, None)
        config = Config(str(workspace / "alembic.ini"))
        command.downgrade(config, "20261017_0005")
        database = Path(self.temp_dir.name) / "report data" / "po_intelligence_hub.sqlite3"
        raw = "# Legacy report\n\nExisting observation.\n\nSource: https://example.com/legacy\n"
        with sqlite3.connect(database) as connection:
            connection.execute(
                "INSERT INTO imported_research_reports (id, question, geo, os, research_period, content, content_sha256, origin, imported_at, benchmark_selections_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                ("legacy-id", "Legacy question", "US", "Both", None, raw, "b" * 64, "chatgpt_user_import", "2026-10-16T00:00:00", json.dumps([{"item_type": "finding", "item_key": "old-key"}])),
            )
        command.upgrade(config, "head")
        self.client_context = TestClient(create_app())
        self.client = self.client_context.__enter__()
        saved = self.client.get("/api/v1/reports/legacy-id")
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["content"], raw)
        self.assertEqual(saved.json()["orphaned_benchmark_selections"], [{"item_type": "finding", "item_key": "old-key"}])
        result = self.client.post("/api/v1/reports/legacy-id/reprocess")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()["reprocessed"])
        self.assertEqual(result.json()["content"], raw)
        self.assertEqual(result.json()["benchmark_selections"], [{"item_type": "finding", "item_key": "old-key"}])
        engine = self.client.app.state.session_factory.kw["bind"]
        self.client_context.__exit__(None, None, None)
        self.client_context = None
        engine.dispose(close=True)
        # Windows can retain the SQLite WAL file handle until the test process exits.
        self.temp_dir._ignore_cleanup_errors = True

    def test_invalid_imports_return_validation_errors(self) -> None:
        for payload in (
            {**self.payload(), "content": "  "},
            {**self.payload(), "question": "   "},
            {**self.payload(), "os": "  "},
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
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["error"]["code"], "INVALID_RESEARCH_INPUT")
        self.assertIn("line 1, column 2", response.json()["error"]["message"])
        self.assertEqual(response.json()["error"]["details"]["errors"][0]["location"][:2], ["body", "structured_json"])

    def test_structured_relations_must_resolve_to_report_entities_and_source_urls(self) -> None:
        raw = "# Report\n\nSource: https://example.com/reference"
        structured = {
            "entities": [],
            "findings": [{"key": "claim", "finding_type": "observation", "title": "Claim", "description": "Claim", "related_entities": ["missing"], "evidence_references": ["https://example.com/reference"]}],
            "evidence_references": [{"url": "https://example.com/reference", "verified": False}],
        }
        response = self.client.post("/api/v1/reports", json={**self.payload(raw), "structured_json": json.dumps(structured)})
        self.assertEqual(response.status_code, 422)
        error = response.json()["error"]
        self.assertEqual(error["code"], "INVALID_RESEARCH_INPUT")
        self.assertTrue(any("unknown entity keys" in item["message"] for item in error["details"]["errors"]))

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

    def test_long_markdown_with_embedded_json_reproduces_content_limit_422(self) -> None:
        long_markdown = "# Long market report\n\n" + ("Detailed source-backed discussion of a market observation. " * 40_000)
        raw = long_markdown + "\n```json\n" + json.dumps({"sections": [], "entities": [], "findings": []}) + "\n```\n"
        self.assertGreater(len(raw), 2_000_000)
        response = self.client.post("/api/v1/reports", json=self.payload(raw))
        self.assertEqual(response.status_code, 422)
        error = response.json()["error"]
        self.assertEqual(error["message"], "Request validation failed.")
        content_error = next(item for item in error["details"]["errors"] if item["location"] == ["body", "content"])
        self.assertEqual(content_error["type"], "string_too_long")
        self.assertEqual(content_error["message"], "String should have at most 2000000 characters")

    def test_json_only_import_creates_results_and_keeps_the_verbatim_input(self) -> None:
        raw = json.dumps({
            "sections": [{"heading": "Field notes", "content": "A supplied description.", "hierarchy": 1}],
            "entities": [{"key": "entity-a", "entity_type": "organization", "name": "Example organization", "attributes": {"region": "VN"}, "evidence_references": ["https://example.org/source"]}],
            "findings": [{"key": "finding-a", "finding_type": "observation", "title": "Reported operating pattern", "description": "The report states this pattern; it has not been independently checked.", "related_entities": ["entity-a"], "evidence_references": ["https://example.org/source"], "evidence_status": "unverified", "uncertainty": "Source not independently checked"}],
            "evidence_references": [{"url": "https://example.org/source", "title": "Supplied reference", "verified": False}],
            "benchmark_dimensions": [{"key": "dimension-a", "name": "Service model", "related_entities": ["entity-a"], "evidence_references": ["https://example.org/source"], "observations": [{"entity_key": "entity-a", "value": "Reported", "evidence_references": ["https://example.org/source"]}]}],
        }, ensure_ascii=False)
        response = self.client.post("/api/v1/reports", json=self.payload(raw))
        self.assertEqual(response.status_code, 201, response.text)
        saved = response.json()
        self.assertEqual(saved["content"], raw)
        self.assertEqual(saved["parse_status"], "PARSED")
        self.assertEqual(saved["research_data"]["findings"][0]["title"], "Reported operating pattern")
        self.assertEqual(saved["research_data"]["entities"][0]["name"], "Example organization")
        self.assertFalse(saved["research_data"]["evidence_references"][0]["verified"])

    def test_one_field_markdown_with_fenced_json_imports_structured_results(self) -> None:
        structured = self._structured_payload(url="https://example.com/fenced")
        structured["sections"][0]["source_location"] = None
        structured["evidence_references"][0]["source_location"] = None
        structured["findings"][0]["source_locations"] = []
        structured["benchmark_dimensions"][0]["observations"][0]["source_locations"] = []
        raw = "# Research summary\n\nThe report contains its structured results below.\n\n```json\n" + json.dumps(structured) + "\n```\n"
        response = self.client.post("/api/v1/reports", json=self.payload(raw))
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["content"], raw)
        self.assertEqual(response.json()["parse_status"], "PARSED")
        self.assertEqual(response.json()["research_data"]["findings"][0]["title"], "Observation entity-a")

    def test_malformed_json_in_one_field_returns_line_and_column_and_is_not_saved(self) -> None:
        raw = "# Research\n\n```json\n{\n  \"findings\": [}\n```"
        response = self.client.post("/api/v1/reports", json=self.payload(raw))
        self.assertEqual(response.status_code, 422)
        error = response.json()["error"]
        self.assertEqual(error["code"], "INVALID_RESEARCH_INPUT")
        self.assertIn("line 2, column 16", error["message"])
        self.assertEqual(error["details"]["errors"][0]["type"], "json_invalid")
        self.assertEqual(self.client.get("/api/v1/reports").json()["items"], [])

    def test_json_research_results_are_domain_agnostic(self) -> None:
        domains = ("Puzzle", "ASMR", "Drama", "Utilities", "Ad Monetization", "Municipal water")
        for index, domain in enumerate(domains):
            with self.subTest(domain=domain):
                structured = self._structured_payload(key=f"entity-{index}", url=f"https://example.org/{index}")
                structured["sections"][0]["source_location"] = None
                structured["evidence_references"][0]["source_location"] = None
                structured["findings"][0]["source_locations"] = []
                structured["benchmark_dimensions"][0]["observations"][0]["source_locations"] = []
                structured["entities"][0]["name"] = f"{domain} research subject"
                response = self.client.post("/api/v1/reports", json=self.payload(json.dumps(structured)))
                self.assertEqual(response.status_code, 201, response.text)
                self.assertEqual(response.json()["research_data"]["entities"][0]["name"], f"{domain} research subject")


if __name__ == "__main__":
    unittest.main()
