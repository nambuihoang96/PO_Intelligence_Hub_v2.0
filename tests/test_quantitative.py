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
    def test_sensor_tower_semicolon_wide_export_and_blank_padding(self):
        content = (
            "Unified Name;Unified ID;Platform;Downloads (Absolute);Downloads (YoY Growth)\n"
            "App A;id-a;Unified;1200;300\n"
            "App B;id-b;Unified;900;150\n"
            ";;;;\n"
        )
        rows, _, unresolved, status = parse_csv_observations(
            content, report_id="report", report_geo="Worldwide", report_platform="Unified",
            report_period="2026", entities=[{"key": "id-a", "name": "App A"}, {"key": "id-b", "name": "App B"}],
            field_mapping={"entity_id": "Unified ID", "platform": "Platform"}, entity_mappings={},
            metric_mappings=[
                {"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads", "methodology": "Sensor Tower export"},
                {"column": "Downloads (YoY Growth)", "metric_id": "downloads_yoy_growth", "metric_definition": "Downloads (YoY Growth)", "unit": "downloads", "methodology": "Sensor Tower export"},
            ],
            explicit_values={"geo": "Worldwide", "period_start": "2026-10-14", "period_end": "2026-11-13", "granularity": "rolling_period"},
        )
        self.assertEqual(len(rows), 4)
        self.assertEqual(unresolved, [])
        self.assertEqual(status, "compatible")
        self.assertTrue(all(item["complete_observation"] for item in rows))
        self.assertEqual(rows[0]["period_start"], "2026-10-14")

    def test_sensor_tower_unmapped_entity_is_retained_as_incomplete(self):
        rows, _, unresolved, _ = parse_csv_observations(
            "Unified ID;Downloads (Absolute)\nid-unknown;12\n", report_id="report", report_geo="Worldwide", report_platform="Unified", report_period=None,
            entities=[], field_mapping={"entity_id": "Unified ID"}, entity_mappings={"id-unknown": "__unmapped__"},
            metric_mappings=[{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
            explicit_values={"geo": "Worldwide", "platform": "Unified", "period_start": "2026-10-14", "period_end": "2026-11-13", "granularity": "rolling_period"},
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(unresolved, [])
        self.assertIsNone(rows[0]["entity_id"])
        self.assertFalse(rows[0]["complete_observation"])
        self.assertIn("intentionally left unmapped", " ".join(rows[0]["validation_reasons"]))

    def test_exact_report_observation_is_unverified_and_complete(self):
        value = QuantitativeObservation(
            metric_id="weekly downloads", metric_definition="Downloads per week", value=1250,
            unit="count", entity_id="product-a", geo="US", platform="Android",
            period_start="2026-01-01", period_end="2026-01-31", granularity="month",
            source_reference="https://example.com/data", provenance_type="research_report", provenance_id="report",
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

    def test_research_contract_cannot_claim_csv_import_status(self):
        with self.assertRaises(ValidationError):
            UniversalResearchData(quantitative_observations=[QuantitativeObservation(
                metric_id="users", metric_definition="Active users", value=10, unit="users",
                entity_id="app", geo="US", platform="web", period_start="2026-01-01",
                period_end="2026-01-31", granularity="month", source_reference="https://example.com",
                provenance_id="dataset", observation_type="imported", provenance_type="csv_dataset",
            )])

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

    def test_csv_keeps_mixed_rows_and_marks_missing_geo_period_and_bad_values(self):
        rows, reasons, _, status = parse_csv_observations(
            "metric,definition,value,unit,entity,geo,platform,start,end,granularity,source,methodology\n"
            "downloads,Downloads,12,count,Product,US,Android,2026-01-01,2026-01-31,month,https://example.com/source,store console\n"
            "downloads,Downloads,not-a-number,count,Product,,Android,,,month,https://example.com/source,store console\n",
            report_id="r", report_geo="US", report_platform="Android", report_period="2026",
            entities=[{"key": "product", "name": "Product"}],
            field_mapping={"metric_id": "metric", "metric_definition": "definition", "value": "value", "unit": "unit", "entity_id": "entity", "geo": "geo", "platform": "platform", "period_start": "start", "period_end": "end", "granularity": "granularity", "source_reference": "source", "methodology": "methodology"},
            entity_mappings={},
        )
        self.assertEqual(len(rows), 2)
        self.assertTrue(rows[0]["complete_observation"])
        self.assertTrue(rows[0]["comparison_ready"])
        self.assertFalse(rows[1]["complete_observation"])
        self.assertFalse(rows[1]["comparison_ready"])
        self.assertEqual(status, "partial")
        self.assertTrue(any("GEO" in reason for reason in reasons))
        self.assertTrue(any("period start" in reason for reason in reasons))
        self.assertTrue(any("non-numeric" in reason for reason in reasons))

    def test_duplicate_rows_are_retained_and_flagged(self):
        rows, reasons, _, status = parse_csv_observations(
            "metric,definition,value,unit,entity,geo,platform,start,end,granularity,source,methodology\n"
            "users,Active users,5,users,Product,US,Android,2026-01-01,2026-01-31,month,https://example.com/source,first-party console\n"
            "users,Active users,5,users,Product,US,Android,2026-01-01,2026-01-31,month,https://example.com/source,first-party console\n",
            report_id="r", report_geo="US", report_platform="Android", report_period="2026",
            entities=[{"key": "product", "name": "Product"}],
            field_mapping={"metric_id": "metric", "metric_definition": "definition", "value": "value", "unit": "unit", "entity_id": "entity", "geo": "geo", "platform": "platform", "period_start": "start", "period_end": "end", "granularity": "granularity", "source_reference": "source", "methodology": "methodology"},
            entity_mappings={},
        )
        self.assertEqual(len(rows), 2)
        self.assertFalse(rows[1]["complete_observation"])
        self.assertTrue(any("duplicate observation" in reason for reason in reasons))
        self.assertEqual(status, "partial")

    def test_duplicate_entity_name_requests_explicit_mapping(self):
        _, _, ambiguities, status = parse_csv_observations(
            "entity,value\nSame,1\n", report_id="r", report_geo="US", report_platform="web", report_period=None,
            entities=[{"key": "a", "name": "Same"}, {"key": "b", "name": "Same"}],
            field_mapping={"entity_id": "entity", "value": "value"}, entity_mappings={},
        )
        self.assertEqual(status, "partial")
        self.assertEqual(ambiguities[0]["candidates"], ["a", "b"])

    def observation(self, *, metric="users", definition="User count", methodology="first-party analytics", unit="users", geo="US", platform="web", entity="a", start="2025-01-01", end="2025-12-31", value=100):
        return {"metric_id": metric, "metric_definition": definition, "methodology": methodology, "value": value, "unit": unit, "entity_id": entity, "geo": geo, "platform": platform, "granularity": "year", "period_start": start, "period_end": end, "source_reference": "https://example.com/source", "provenance_id": "source"}

    def test_different_geo_os_and_incompatible_periods_are_rejected(self):
        base = self.observation()
        for other in (self.observation(geo="JP"), self.observation(platform="iOS"), self.observation(metric="downloads")):
            compatible, reasons = compatible_for_comparison(base, other)
            self.assertFalse(compatible)
            self.assertTrue(reasons)
        current = self.observation(start="2026-02-01", end="2026-12-31", value=120)
        with self.assertRaisesRegex(ValueError, "adjacent periods"):
            calculate_change(current, base, "yoy")

    def test_similar_metric_labels_do_not_override_definition_or_methodology(self):
        base = self.observation(metric="downloads", definition="Downloads observed by store", methodology="store console")
        for other in (
            self.observation(metric="downloads", definition="Estimated downloads from panel model", methodology="panel estimate"),
            self.observation(metric="estimated_downloads", definition="Downloads observed by store", methodology="store console"),
        ):
            compatible, reasons = compatible_for_comparison(base, other)
            self.assertFalse(compatible)
            self.assertTrue(reasons)

    def test_missing_methodology_is_not_comparable(self):
        base = self.observation()
        other = self.observation()
        other["methodology"] = None
        compatible, reasons = compatible_for_comparison(base, other)
        self.assertFalse(compatible)
        self.assertIn("Missing measurement methodology on one or both observations.", reasons)

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

    def create_report(self, question="Example"):
        raw = f"Original source: https://example.com/source\nQuestion: {question}"
        structured = {
            "entities": [
                {"key": "product-a", "entity_type": "product", "name": "App A"},
                {"key": "product-b", "entity_type": "product", "name": "App B"},
            ],
            "evidence_references": [{"url": "https://example.com/source"}],
        }
        response = self.client.post("/api/v1/reports", json={
            "question": question, "geo": "US", "os": "Android", "research_period": "2025-2026",
            "content": raw, "structured_json": json.dumps(structured),
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_csv_linking_is_report_scoped_persistent_and_deduplicated(self):
        report_id = self.create_report()
        body = {
            "filename": "weekly.csv",
            "csv_content": "metric,definition,value,unit,entity,geo,platform,start,end,granularity,source,methodology\nWeekly Downloads,Downloads per week,10,downloads,App A,US,Android,2026-01-01,2026-01-31,month,https://example.com/source,store estimate\n",
            "field_mapping": {"metric_id": "metric", "metric_definition": "definition", "value": "value", "unit": "unit", "entity_id": "entity", "geo": "geo", "platform": "platform", "period_start": "start", "period_end": "end", "granularity": "granularity", "source_reference": "source", "methodology": "methodology"},
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

    def test_semicolon_wide_csv_import_persists_mapping_and_unpivoted_metrics(self):
        report_id = self.create_report()
        body = {
            "filename": "sensor-export.csv",
            "csv_content": "Unified Name;Unified ID;Platform;Downloads (Absolute);Downloads (YoY Growth)\nApp A;product-a;Android;1200;300\n",
            "field_mapping": {"entity_id": "Unified ID", "platform": "Platform"},
            "metric_mappings": [
                {"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads", "methodology": "Sensor Tower export"},
                {"column": "Downloads (YoY Growth)", "metric_id": "downloads_yoy_growth", "metric_definition": "Downloads (YoY Growth)", "unit": "downloads", "methodology": "Sensor Tower export"},
            ],
            "explicit_values": {"geo": "US", "period_start": "2026-10-14", "period_end": "2026-11-13", "granularity": "rolling_period"},
        }
        preview = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/preview", json=body)
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(preview.json()["total_rows"], 2)
        saved = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(saved.status_code, 201, saved.text)
        self.assertEqual(saved.json()["delimiter"], ";")
        self.assertEqual(len(saved.json()["metric_mappings"]), 2)
        self.assertEqual(len(saved.json()["observations"]), 2)

    def test_sensor_style_csv_mapping_validation_import_refresh_and_raw_persistence(self):
        report_id = self.create_report("Sensor Tower intake")
        report = self.client.get(f"/api/v1/reports/{report_id}").json()
        data = report["research_data"]
        data["entities"][0]["name"] = "Twin"
        data["entities"][1]["name"] = "Twin"
        self.assertEqual(self.client.put(f"/api/v1/reports/{report_id}/structured-data", json={"research_data": data}).status_code, 200)
        csv_content = (
            "Unified Name;Unified ID;Platform;Downloads (Absolute);Revenue (Absolute)\n"
            "Twin;id-twin;Unified;1200;20\n"
            "Unknown One;id-one;Unified;900;15\n"
            "Unknown Two;id-two;Unified;bad-number;10\n"
        )
        body = {
            "filename": "sensor-worldwide.csv", "csv_content": csv_content,
            "field_mapping": {"entity_id": "Unified Name", "platform": "Platform"},
            "metric_mappings": [
                {"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads", "methodology": "Sensor Tower export"},
                {"column": "Revenue (Absolute)", "metric_id": "revenue_absolute", "metric_definition": "Revenue (Absolute)", "unit": "USD", "methodology": "Sensor Tower export"},
            ],
            "explicit_values": {"geo": "Worldwide", "period_start": "2026-10-14", "period_end": "2026-11-13", "granularity": "rolling_period"},
        }
        first_preview = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/preview", json=body)
        self.assertEqual(first_preview.status_code, 200, first_preview.text)
        self.assertEqual(first_preview.json()["total_rows"], 6)
        self.assertEqual(len(first_preview.json()["ambiguities"]), 1)
        self.assertEqual({item["csv_value"] for item in first_preview.json()["unmatched_entities"]}, {"Unknown One", "Unknown Two"})
        body["entity_mappings"] = {"Twin": "product-a", "Unknown One": "product-b", "Unknown Two": "__unmapped__"}
        resolved_preview = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/preview", json=body)
        self.assertEqual(resolved_preview.status_code, 200, resolved_preview.text)
        self.assertEqual(resolved_preview.json()["ambiguities"], [])
        self.assertEqual(resolved_preview.json()["unmatched_entities"], [])
        observations = resolved_preview.json()["observations"]
        self.assertTrue(any("non-numeric value 'bad-number'" in " ".join(item["validation_reasons"]) for item in observations))
        self.assertTrue(all(item["scope_compatible"] is False for item in observations), "Unified must not be inferred as Android for this Android report")
        saved = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(saved.status_code, 201, saved.text)
        self.assertEqual(len(saved.json()["observations"]), 6)
        self.assertEqual(saved.json()["compatibility_status"], "incompatible")
        refreshed = self.client.get(f"/api/v1/reports/{report_id}/quantitative-datasets")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertEqual(len(refreshed.json()["items"]), 1)
        persisted = refreshed.json()["items"][0]
        self.assertEqual(len(persisted["observations"]), 6)
        self.assertTrue(any("non-numeric value 'bad-number'" in " ".join(item["validation_reasons"]) for item in persisted["observations"]))
        engine = create_database_engine(get_database_path())
        try:
            with Session(engine) as session:
                dataset = session.get(QuantitativeDataset, saved.json()["id"])
                self.assertIsNotNone(dataset)
                self.assertEqual(dataset.original_csv, csv_content)
        finally:
            engine.dispose()

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

    def test_preview_is_non_persistent_then_confirm_links_only_current_report(self):
        report_id = self.create_report()
        other_report_id = self.create_report("Example 2")
        body = {
            "filename": "metrics.csv",
            "csv_content": "metric,definition,value,unit,entity,geo,platform,start,end,granularity,source,methodology\nusers,Active users,10,users,App A,US,Android,2026-01-01,2026-01-31,month,https://example.com/source,first-party analytics\n",
            "field_mapping": {"metric_id": "metric", "metric_definition": "definition", "value": "value", "unit": "unit", "entity_id": "entity", "geo": "geo", "platform": "platform", "period_start": "start", "period_end": "end", "granularity": "granularity", "source_reference": "source", "methodology": "methodology"},
        }
        preview = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/preview", json=body)
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(preview.json()["total_rows"], 1)
        self.assertEqual(preview.json()["comparison_ready_observations"], 1)
        self.assertEqual(self.client.get(f"/api/v1/reports/{report_id}/quantitative-datasets").json()["items"], [])
        saved = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(saved.status_code, 201, saved.text)
        self.assertEqual(saved.json()["report_id"], report_id)
        self.assertEqual(self.client.get(f"/api/v1/reports/{other_report_id}/quantitative-datasets").json()["items"], [])
        self.assertEqual(saved.json()["comparison_ready_observations"], 1)

    def test_legacy_dataset_readiness_is_recalculated_without_schema_migration(self):
        report_id = self.create_report()
        engine = create_database_engine(get_database_path())
        try:
            with Session(engine) as session:
                session.add(QuantitativeDataset(
                    id="legacy-dataset", report_id=report_id, filename="legacy.csv", content_sha256="b" * 64,
                    original_csv="legacy exact csv", field_mapping_json={}, entity_mappings_json={},
                    observations_json=[{
                        "metric_id": "active_users", "metric_definition": "Active users from product analytics",
                        "value": 12, "unit": "users", "entity_id": "product-a", "geo": "US", "platform": "Android",
                        "period_start": "2026-01-01", "period_end": "2026-01-31", "granularity": "month",
                        "source_reference": "https://example.com/source", "verification_status": "unverified",
                        "provenance_type": "csv_dataset", "provenance_id": "legacy-dataset", "observation_type": "imported",
                    }],
                    compatibility_status="compatible", validation_reasons_json=[],
                ))
                session.commit()
        finally:
            engine.dispose()
        response = self.client.get(f"/api/v1/reports/{report_id}/quantitative-datasets")
        self.assertEqual(response.status_code, 200, response.text)
        dataset = response.json()["items"][0]
        self.assertEqual(dataset["complete_observations"], 1)
        self.assertEqual(dataset["scope_compatible_observations"], 1)
        self.assertEqual(dataset["comparison_ready_observations"], 0)
        self.assertTrue(dataset["observations"][0]["complete_observation"])
        self.assertFalse(dataset["observations"][0]["comparison_ready"])

    def test_quantitative_dataset_routes_are_typed_in_openapi(self):
        schema = self.client.get("/openapi.json").json()
        path = schema["paths"]["/api/v1/reports/{report_id}/quantitative-datasets"]
        self.assertIn("post", path)
        self.assertIn("get", path)
        self.assertIn("/api/v1/reports/{report_id}/quantitative-datasets/preview", schema["paths"])
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
