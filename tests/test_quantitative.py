import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.app.db import create_database_engine, get_database_path
from backend.app.main import create_app
from backend.app.models import ImportedResearchReport, QuantitativeDataset
from backend.app.quantitative import calculate_change, compatible_for_comparison, normalize_metric_id, normalize_unit, parse_csv_observations
from backend.app.research_data import QuantitativeObservation, UniversalResearchData


class QuantitativeObservationTest(unittest.TestCase):
    def test_exact_report_observation_is_unverified_and_complete(self):
        value = QuantitativeObservation(
            metric_id="weekly downloads", metric_definition="Downloads per week", value=1250,
            unit="count", entity_id="product-a", geo="US", platform="Android",
            period_start="2026-01-01", period_end="2026-01-31", granularity="month",
            source_reference="https://example.com/data", provenance_type="research_report",
        )
        self.assertEqual(value.metric_id, "weekly_downloads")
        self.assertEqual(value.verification_status, "unverified")
        self.assertEqual(value.validation_reasons, [])

    def test_missing_unit_and_period_remain_incomplete(self):
        value = QuantitativeObservation(metric_id="users", metric_definition="Users", value=8, entity_id="a", geo="US", platform="web")
        self.assertTrue(any("unit" in item for item in value.validation_reasons))
        self.assertTrue(any("period start" in item for item in value.validation_reasons))
        self.assertTrue(any("source reference" in item for item in value.validation_reasons))

    def test_reported_observation_cannot_claim_independent_verification(self):
        with self.assertRaises(ValidationError):
            QuantitativeObservation(metric_id="x", value=1, unit="users", observation_type="reported", verification_status="verified")

    def test_quantitative_sources_must_exist_in_report_reference_registry(self):
        with self.assertRaises(ValidationError):
            UniversalResearchData(
                quantitative_observations=[QuantitativeObservation(
                    metric_id="users", value=1, unit="users", source_reference="https://not-in-report.example"
                )]
            )

    def test_csv_normalizes_metric_and_unit_but_flags_different_geo_and_platform(self):
        rows, reasons, ambiguities, status = parse_csv_observations(
            "metric,value,unit,entity,geo,platform,start,end,granularity\nWeekly Downloads,12,percent,Product,JP,iOS,2026-01-01,2026-01-31,month\n",
            report_id="report", report_geo="US", report_platform="Android", report_period="2026",
            entities=[{"key": "product", "name": "Product"}],
            field_mapping={"metric_id": "metric", "value": "value", "unit": "unit", "entity_id": "entity", "geo": "geo", "platform": "platform", "period_start": "start", "period_end": "end", "granularity": "granularity"},
            entity_mappings={},
        )
        self.assertEqual(normalize_metric_id("Weekly Downloads"), "weekly_downloads")
        self.assertEqual(normalize_unit("percent"), "%")
        self.assertEqual(rows[0]["metric_id"], "weekly_downloads")
        self.assertEqual(status, "incompatible")
        self.assertFalse(ambiguities)
        self.assertTrue(any("GEO" in reason for reason in reasons))
        self.assertTrue(any("Platform" in reason for reason in reasons))

    def test_duplicate_entity_name_requests_explicit_mapping(self):
        _, _, ambiguities, status = parse_csv_observations(
            "entity,value\nSame,1\n", report_id="r", report_geo="US", report_platform="web", report_period=None,
            entities=[{"key": "a", "name": "Same"}, {"key": "b", "name": "Same"}],
            field_mapping={"entity_id": "entity", "value": "value"}, entity_mappings={},
        )
        self.assertEqual(status, "partial")
        self.assertEqual(ambiguities[0]["candidates"], ["a", "b"])

    def observation(self, *, metric="users", unit="users", geo="US", platform="web", entity="a", start="2025-01-01", end="2025-12-31", value=100):
        return {"metric_id": metric, "metric_definition": "User count", "value": value, "unit": unit, "entity_id": entity, "geo": geo, "platform": platform, "granularity": "year", "period_start": start, "period_end": end, "provenance_id": "source"}

    def test_different_geo_os_and_incompatible_periods_are_rejected(self):
        base = self.observation()
        for other in (self.observation(geo="JP"), self.observation(platform="iOS"), self.observation(metric="downloads")):
            compatible, reasons = compatible_for_comparison(base, other)
            self.assertFalse(compatible)
            self.assertTrue(reasons)
        current = self.observation(start="2026-02-01", end="2026-12-31", value=120)
        with self.assertRaisesRegex(ValueError, "adjacent periods"):
            calculate_change(current, base, "yoy")

    def test_valid_yoy_calculates_absolute_and_percentage_change(self):
        previous = self.observation()
        current = self.observation(start="2026-01-01", end="2026-12-31", value=125)
        result = calculate_change(current, previous, "yoy")
        self.assertEqual(result["value"], 25)
        self.assertEqual(result["percentage_change"], 25)
        self.assertEqual(result["verification_status"], "unverified")

    def test_valid_period_over_period_requires_adjacent_equal_granularity_period(self):
        previous = self.observation(start="2026-01-01", end="2026-01-31", value=80)
        previous["granularity"] = "month"
        current = self.observation(start="2026-02-01", end="2026-02-28", value=100)
        current["granularity"] = "month"
        result = calculate_change(current, previous, "period_over_period")
        self.assertEqual(result["value"], 20)
        self.assertEqual(result["percentage_change"], 25)
        gap = self.observation(start="2026-03-01", end="2026-03-31", value=100)
        gap["granularity"] = "month"
        with self.assertRaisesRegex(ValueError, "adjacent periods"):
            calculate_change(gap, previous, "period_over_period")


class QuantitativeDatasetAPITest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"APP_DATA_ROOT": str(Path(self.temp_dir.name) / "data")})
        self.env.start()
        workspace = Path(__file__).resolve().parents[1]
        command.upgrade(Config(str(workspace / "alembic.ini")), "head")
        self.context = TestClient(create_app())
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.env.stop()
        self.temp_dir.cleanup()

    def create_report(self):
        raw = "Original source: https://example.com/source"
        structured = {
            "entities": [
                {"key": "product-a", "entity_type": "product", "name": "App A"},
                {"key": "product-b", "entity_type": "product", "name": "App B"},
            ],
            "evidence_references": [{"url": "https://example.com/source"}],
        }
        response = self.client.post("/api/v1/reports", json={
            "question": "Example", "geo": "US", "os": "Android", "research_period": "2025-2026",
            "content": raw, "structured_json": json.dumps(structured),
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_csv_linking_is_report_scoped_persistent_and_deduplicated(self):
        report_id = self.create_report()
        body = {
            "filename": "weekly.csv",
            "csv_content": "metric,value,unit,entity,geo,platform,start,end,granularity,source\nWeekly Downloads,10,downloads,App A,US,Android,2026-01-01,2026-01-31,month,https://example.com/source\n",
            "field_mapping": {"metric_id": "metric", "value": "value", "unit": "unit", "entity_id": "entity", "geo": "geo", "platform": "platform", "period_start": "start", "period_end": "end", "granularity": "granularity", "source_reference": "source"},
        }
        saved = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(saved.status_code, 201, saved.text)
        self.assertEqual(saved.json()["report_id"], report_id)
        self.assertEqual(saved.json()["compatibility_status"], "compatible")
        self.assertEqual(saved.json()["observations"][0]["verification_status"], "unverified")
        duplicate = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(duplicate.status_code, 200)
        self.assertTrue(duplicate.json()["duplicate"])
        listing = self.client.get(f"/api/v1/reports/{report_id}/quantitative-datasets")
        self.assertEqual(len(listing.json()["items"]), 1)

    def test_ambiguous_entity_mapping_requires_confirmation_then_accepts_selection(self):
        report_id = self.create_report()
        raw = self.client.get(f"/api/v1/reports/{report_id}").json()
        # Create a report where duplicated labels are allowed but keys remain distinct.
        data = raw["research_data"]
        data["entities"][1]["name"] = "App A"
        self.client.put(f"/api/v1/reports/{report_id}/structured-data", json={"research_data": data})
        body = {
            "filename": "ambiguous.csv", "csv_content": "entity,value\nApp A,4\n",
            "field_mapping": {"entity_id": "entity", "value": "value"},
        }
        response = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"]["code"], "AMBIGUOUS_ENTITY_MAPPING")
        body["entity_mappings"] = {"App A": "product-a"}
        confirmed = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(confirmed.status_code, 201, confirmed.text)

    def test_existing_report_without_quantitative_field_remains_readable(self):
        report_id = self.create_report()
        get = self.client.get(f"/api/v1/reports/{report_id}")
        self.assertEqual(get.status_code, 200)
        self.assertEqual(get.json()["research_data"]["quantitative_observations"], [])

    def test_quantitative_dataset_routes_are_typed_in_openapi(self):
        schema = self.client.get("/openapi.json").json()
        path = schema["paths"]["/api/v1/reports/{report_id}/quantitative-datasets"]
        self.assertIn("post", path)
        self.assertIn("get", path)
        request_schema = path["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"]
        self.assertIn("QuantitativeDatasetImport", request_schema)
        properties = schema["components"]["schemas"]["QuantitativeDatasetImport"]["properties"]
        self.assertTrue({"filename", "csv_content", "field_mapping", "entity_mappings"}.issubset(properties))


class QuantitativeMigrationCompatibilityTest(unittest.TestCase):
    def test_0006_report_and_po_data_survive_additive_quantitative_migration(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.dict(os.environ, {"APP_DATA_ROOT": str(Path(temporary) / "local-data")}):
                workspace = Path(__file__).resolve().parents[1]
                config = Config(str(workspace / "alembic.ini"))
                command.upgrade(config, "20261017_0006")
                engine = create_database_engine(get_database_path())
                original_content = "Old research report, retained verbatim."
                original_selections = [{"item_type": "entity", "item_key": "historic-key"}]
                original_workspace = {"custom_dimensions": ["historic dimension"], "entries": []}
                try:
                    with Session(engine) as session:
                        session.add(ImportedResearchReport(
                            id="historic-report", question="Old report", geo="US", os="Android",
                            research_period="2025", content=original_content,
                            research_data_json={"executive_summary": "Old summary"},
                            parse_status="PARSED", benchmark_selections_json=original_selections,
                            benchmark_workspace_json=original_workspace,
                            content_sha256="a" * 64,
                        ))
                        session.commit()
                finally:
                    engine.dispose()
                command.upgrade(config, "head")
                engine = create_database_engine(get_database_path())
                try:
                    with Session(engine) as session:
                        report = session.get(ImportedResearchReport, "historic-report")
                        self.assertIsNotNone(report)
                        self.assertEqual(report.content, original_content)
                        self.assertEqual(report.research_data_json, {"executive_summary": "Old summary"})
                        self.assertEqual(report.benchmark_selections_json, original_selections)
                        self.assertEqual(report.benchmark_workspace_json, original_workspace)
                        self.assertEqual(session.query(QuantitativeDataset).count(), 0)
                finally:
                    engine.dispose()


if __name__ == "__main__":
    unittest.main()
