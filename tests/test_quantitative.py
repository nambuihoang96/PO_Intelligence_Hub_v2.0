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
from backend.app.quantitative import assess_observation_readiness, calculate_change, compatible_for_comparison, normalize_metric_id, normalize_unit, parse_csv_observations
from backend.app.research_data import QuantitativeObservation, UniversalResearchData


class QuantitativeObservationTest(unittest.TestCase):
    def test_readiness_separates_csv_analysis_from_report_scope_and_keeps_explicit_dates(self):
        observation = assess_observation_readiness({
            "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)",
            "value": 1200, "unit": "downloads", "entity_id": None,
            "source_entity_id": "sensor_tower:source-app-1", "source_entity_name": "Source App",
            "source_provider": "sensor_tower", "entity_resolution_state": "source_only",
            "geo": "Worldwide", "platform": "Unified", "period_start": "2026-10-14",
            "period_end": "2026-11-13", "granularity": None,
            "methodology": "Sensor Tower estimate", "source_reference": None,
            "verification_status": "unverified", "provenance_type": "csv_dataset",
            "provenance_id": "dataset-1", "observation_type": "imported",
            "validation_reasons": ["Missing period granularity."],
            "source_validation_reasons": ["Missing period granularity."],
            "report_compatibility_reasons": ["GEO 'Worldwide' differs from report scope 'US'.", "Platform 'Unified' differs from report scope 'Android'."],
        }, report_geo="US", report_platform="Android")
        self.assertTrue(observation["display_ready"])
        self.assertTrue(observation["analysis_ready"])
        self.assertTrue(observation["dataset_comparison_ready"])
        self.assertFalse(observation["comparison_ready"])
        self.assertFalse(observation["scope_compatible"])
        self.assertIsNone(observation["granularity"])
        self.assertEqual(observation["source_validation_reasons"], [])

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

    def test_sensor_tower_source_only_entity_is_complete_and_keeps_source_identity(self):
        rows, _, unresolved, _ = parse_csv_observations(
            "Unified ID;Downloads (Absolute)\nid-unknown;12\n", report_id="report", report_geo="Worldwide", report_platform="Unified", report_period=None,
            entities=[], field_mapping={"entity_id": "Unified ID"}, entity_mappings={"id-unknown": "__unmapped__"},
            metric_mappings=[{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
            explicit_values={"geo": "Worldwide", "platform": "Unified", "period_start": "2026-10-14", "period_end": "2026-11-13", "granularity": "rolling_period"},
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(unresolved, [])
        self.assertIsNone(rows[0]["entity_id"])
        self.assertTrue(rows[0]["complete_observation"])
        self.assertTrue(rows[0]["analysis_ready"])
        self.assertEqual(rows[0]["entity_resolution_state"], "source_only")
        self.assertEqual(rows[0]["source_entity_id"], "sensor_tower:id-unknown")

    def test_sensor_tower_entity_id_and_display_name_auto_match_without_mapping(self):
        rows, _, unresolved, _ = parse_csv_observations(
            "Unified Name;Unified ID;Platform;Downloads (Absolute)\nApp A;id-a;Unified;1200\n",
            report_id="report", report_geo="Worldwide", report_platform="Unified", report_period="2026",
            entities=[{"key": "app-a", "name": "App A", "unified_id": "id-a"}],
            field_mapping={"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform"},
            entity_mappings={}, metric_mappings=[{
                "column": "Downloads (Absolute)", "metric_id": "downloads_absolute",
                "metric_definition": "Downloads (Absolute)", "unit": "downloads",
            }], explicit_values={"geo": "Worldwide", "period_start": "2026-09-14", "period_end": "2026-10-13"},
        )
        self.assertEqual(rows[0]["entity_id"], "app-a")
        self.assertEqual(rows[0]["entity_name"], "App A")
        self.assertEqual(unresolved, [])

    def test_entity_display_name_resolves_unknown_export_id_automatically(self):
        rows, _, unresolved, _ = parse_csv_observations(
            "Unified Name;Unified ID;Downloads (Absolute)\nApp A;export-only-id;1200\n",
            report_id="report", report_geo="Worldwide", report_platform="Unified", report_period=None,
            entities=[{"key": "app-a", "name": "App A"}],
            field_mapping={"entity_id": "Unified ID", "entity_name": "Unified Name"}, entity_mappings={},
            metric_mappings=[{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
        )
        self.assertEqual(rows[0]["entity_id"], "app-a")
        self.assertEqual(unresolved, [])

    def test_entity_name_matching_ignores_multiline_whitespace(self):
        rows, _, unresolved, _ = parse_csv_observations(
            "Unified Name;Unified ID;Downloads (Absolute)\n\"App\nA\";export-id;12\n",
            report_id="report", report_geo="Worldwide", report_platform="Unified", report_period=None,
            entities=[{"key": "app-a", "name": "App A"}],
            field_mapping={"entity_id": "Unified ID", "entity_name": "Unified Name"}, entity_mappings={},
            metric_mappings=[{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
        )
        self.assertEqual(rows[0]["entity_id"], "app-a")
        self.assertEqual(unresolved, [])

    def test_unmatched_entity_rows_keep_display_name_and_do_not_create_false_duplicates(self):
        rows, reasons, unresolved, _ = parse_csv_observations(
            "Unified Name;Unified ID;Downloads (Absolute)\nApp A;export-a;10\nApp B;export-b;10\n",
            report_id="report", report_geo="Worldwide", report_platform="Unified", report_period=None,
            entities=[{"key": "other", "name": "Other App"}],
            field_mapping={"entity_id": "Unified ID", "entity_name": "Unified Name"}, entity_mappings={},
            metric_mappings=[{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
        )
        self.assertEqual(unresolved, [])
        self.assertEqual(len(rows), 2)
        self.assertEqual([item["entity_resolution_state"] for item in rows], ["source_only", "source_only"])
        self.assertEqual([item["source_entity_name"] for item in rows], ["App A", "App B"])
        self.assertEqual([item["source_entity_id"] for item in rows], ["sensor_tower:export-a", "sensor_tower:export-b"])
        self.assertFalse(any("duplicate observation" in reason.casefold() for reason in reasons))

    def test_csv_rejects_semantically_wrong_geo_mapping(self):
        with self.assertRaisesRegex(ValueError, "does not look like a geo field"):
            parse_csv_observations(
                "Unified Name;All Title;Downloads (Absolute)\nApp A;Game;12\n",
                report_id="r", report_geo="Worldwide", report_platform="Unified", report_period=None,
                entities=[{"key": "a", "name": "App A"}],
                field_mapping={"entity_name": "Unified Name", "geo": "All Title"}, entity_mappings={},
                metric_mappings=[{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
            )

    def test_percent_and_absolute_sensor_tower_metrics_keep_distinct_ids_and_units(self):
        rows, _, _, _ = parse_csv_observations(
            "Unified Name;Downloads (YoY Growth);Downloads (YoY Growth %)\nApp A;120;12.5\n",
            report_id="r", report_geo="Worldwide", report_platform="Unified", report_period=None,
            entities=[{"key": "a", "name": "App A"}], field_mapping={"entity_name": "Unified Name"}, entity_mappings={},
            metric_mappings=[
                {"column": "Downloads (YoY Growth)", "metric_id": "downloads_yoy_growth_absolute", "metric_definition": "Downloads (YoY Growth)", "unit": "downloads"},
                {"column": "Downloads (YoY Growth %)", "metric_id": "downloads_yoy_growth_percent", "metric_definition": "Downloads (YoY Growth %)", "unit": "%"},
            ],
        )
        self.assertEqual([row["metric_id"] for row in rows], ["downloads_yoy_growth_absolute", "downloads_yoy_growth_percent"])
        self.assertEqual([row["unit"] for row in rows], ["downloads", "%"])
        self.assertEqual([row["value"] for row in rows], [120, 12.5])

    def test_wide_metric_identity_collisions_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "unique metric identity"):
            parse_csv_observations(
                "Unified Name;Absolute;Growth\nApp A;10;2\n", report_id="r", report_geo="Worldwide",
                report_platform="Unified", report_period=None, entities=[{"key": "a", "name": "App A"}],
                field_mapping={"entity_name": "Unified Name"}, entity_mappings={}, metric_mappings=[
                    {"column": "Absolute", "metric_id": "downloads_yoy_growth", "metric_definition": "Absolute", "unit": "downloads"},
                    {"column": "Growth", "metric_id": "downloads_yoy_growth", "metric_definition": "Growth", "unit": "%"},
                ],
            )

    def test_percentage_metrics_require_percent_unit_and_exact_numeric_values(self):
        rows, reasons, _, _ = parse_csv_observations(
            "Unified Name;Downloads (YoY Growth %)\nApp A;12%\n",
            report_id="r", report_geo="Worldwide", report_platform="Unified", report_period=None,
            entities=[{"key": "a", "name": "App A"}], field_mapping={"entity_name": "Unified Name"}, entity_mappings={},
            metric_mappings=[{
                "column": "Downloads (YoY Growth %)", "metric_id": "downloads_yoy_growth_percent",
                "metric_definition": "Downloads (YoY Growth %)", "unit": "downloads",
            }],
        )
        self.assertIsNone(rows[0]["value"])
        self.assertTrue(any("non-numeric" in reason for reason in reasons))
        self.assertTrue(any("requires unit '%'" in reason for reason in reasons))

    def test_exact_report_observation_is_unverified_and_complete(self):
        value = QuantitativeObservation(
            metric_id="weekly downloads", metric_definition="Downloads per week", value=1250,
            unit="count", entity_id="product-a", geo="US", platform="Android",
            period_start="2026-01-01", period_end="2026-01-31", granularity="month",
            source_reference="https://example.com/data", evidence_reference="https://example.com/data",
            provenance_type="research_report", provenance_id="report",
        )
        self.assertEqual(value.metric_id, "weekly_downloads")
        self.assertEqual(value.value_precision, "exact")
        self.assertEqual(value.verification_status, "unverified")
        self.assertEqual(value.validation_reasons, [])

    def test_explicit_approximate_report_value_is_preserved_and_unverified(self):
        value = QuantitativeObservation(
            metric_id="weekly_downloads", metric_definition="Weekly downloads", value=24000,
            value_precision="approximate", reported_value_text="approximately 24,000 weekly downloads",
            unit="downloads", entity_id="game-a", geo="US", platform="Android",
            period_start="2025-04-01", period_end="2025-04-07", granularity="week",
            methodology="Source estimate", source_reference="https://example.com/data",
            evidence_reference="https://example.com/data", provenance_type="research_report",
            scope_compatible=True, report_compatibility="compatible",
        )
        self.assertEqual(value.value, 24000)
        self.assertEqual(value.value_precision, "approximate")
        self.assertEqual(value.reported_value_text, "approximately 24,000 weekly downloads")
        self.assertEqual(value.verification_status, "unverified")
        self.assertTrue(value.comparison_ready)

    def test_missing_unit_and_period_remain_incomplete(self):
        value = QuantitativeObservation(metric_id="users", metric_definition="Users", value=8, entity_id="a", geo="US", platform="web")
        self.assertTrue(any("unit" in item for item in value.validation_reasons))
        self.assertTrue(any("period start" in item for item in value.validation_reasons))
        self.assertTrue(any("source reference" in item for item in value.validation_reasons))

    def test_date_value_without_period_meaning_stays_unclassified(self):
        value = QuantitativeObservation(
            metric_id="downloads", metric_definition="Downloads", value=8, unit="downloads",
            entity_id="a", geo="Worldwide", platform="Unified", snapshot_date="2026-10-01",
            observation_type="imported", provenance_type="csv_dataset", source_reference="https://example.com/data",
        )
        self.assertEqual(value.period_semantics, "unknown")
        self.assertTrue(any("semantics" in reason or "period meaning" in reason for reason in value.validation_reasons))

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

    def test_approximate_reported_values_cannot_produce_derived_change(self):
        previous = self.observation()
        current = self.observation(start="2026-01-01", end="2026-12-31", value=125)
        previous["value_precision"] = "approximate"
        with self.assertRaisesRegex(ValueError, "Derived changes require exact source values"):
            calculate_change(current, previous, "yoy")

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

    def test_report_supplied_metrics_import_without_csv_bind_provenance_and_persist(self):
        raw = "ASMR report source: https://example.com/asmr-q2-2025\nExact supplied observations are in PO_RESEARCH_V1."
        entities = [
            {"key": "game-a", "entity_type": "test game", "name": "Game A"},
            {"key": "game-b", "entity_type": "test game", "name": "Game B"},
            {"key": "game-c", "entity_type": "test game", "name": "Game C"},
        ]
        metric_rows = [
            {"metric_id": "weekly_downloads", "metric_definition": "Weekly downloads reported by source", "value": value,
             "unit": "downloads", "entity_id": entity["key"], "entity_name": entity["name"], "geo": "US", "platform": "Android",
             "period_start": "2025-04-01", "period_end": "2025-06-30", "granularity": "quarter",
             "methodology": "Source-reported estimate", "source_reference": "https://example.com/asmr-q2-2025",
             "evidence_reference": "https://example.com/asmr-q2-2025", "verification_status": "unverified",
             "provenance_type": "research_report", "observation_type": "reported",
             "scope_compatible": True, "provenance_id": "chatgpt-invented-id"}
            for entity, value in zip(entities, (12000, 9800, 7450), strict=True)
        ]
        payload = {"schema_version": "po_research_v1", "research_data": {
            "entities": entities, "evidence_references": [{"url": "https://example.com/asmr-q2-2025", "title": "Synthetic UAT source", "verified": False}],
            "quantitative_observations": metric_rows,
        }}
        saved = self.client.post("/api/v1/reports", json={
            "question": "Which ASMR games showed notable download movements in the US Android market during Q2/2025?",
            "geo": "US", "os": "Android", "research_period": "Q2/2025", "content": raw,
            "structured_json": json.dumps(payload),
        })
        self.assertEqual(saved.status_code, 201, saved.text)
        report_id = saved.json()["id"]
        data = self.client.get(f"/api/v1/reports/{report_id}").json()
        observations = data["research_data"]["quantitative_observations"]
        self.assertEqual(len(observations), 3)
        self.assertEqual([row["entity_name"] for row in observations], ["Game A", "Game B", "Game C"])
        self.assertTrue(all(row["complete_observation"] and row["comparison_ready"] for row in observations), observations)
        self.assertTrue(all(row["scope_compatible"] is True for row in observations))
        self.assertTrue(all(row["provenance_id"] == report_id for row in observations))
        self.assertTrue(all(row["verification_status"] == "unverified" for row in observations))
        self.assertTrue(all(row["value_precision"] == "exact" for row in observations))
        self.assertEqual(data["content"], raw)
        refreshed = self.client.get(f"/api/v1/reports/{report_id}").json()
        self.assertEqual(refreshed["research_data"]["quantitative_observations"], observations)
        self.assertEqual(self.client.get(f"/api/v1/reports/{report_id}/quantitative-datasets").json()["items"], [])

    def test_explicit_approximate_research_value_survives_report_persistence_without_becoming_verified(self):
        raw = "Source reports approximately 24,000 weekly downloads: https://example.com/approx"
        payload = {"schema_version": "po_research_v1", "research_data": {
            "entities": [{"key": "game-a", "entity_type": "game", "name": "Game A"}],
            "evidence_references": [{"url": "https://example.com/approx", "verified": False}],
            "quantitative_observations": [{
                "metric_id": "weekly_downloads", "metric_definition": "Weekly downloads", "value": 24000,
                "value_precision": "approximate", "reported_value_text": "approximately 24,000 weekly downloads",
                "unit": "downloads", "entity_id": "game-a", "entity_name": "Game A", "geo": "US", "platform": "Android",
                "period_start": "2025-04-01", "period_end": "2025-04-07", "granularity": "week",
                "methodology": "Source estimate", "source_reference": "https://example.com/approx",
                "evidence_reference": "https://example.com/approx", "verification_status": "unverified",
                "provenance_type": "research_report", "observation_type": "reported",
            }],
        }}
        response = self.client.post("/api/v1/reports", json={
            "question": "Weekly downloads for Game A?", "geo": "US", "os": "Android", "research_period": "April 2025",
            "content": raw, "structured_json": json.dumps(payload),
        })
        self.assertEqual(response.status_code, 201, response.text)
        report_id = response.json()["id"]
        reopened = self.client.get(f"/api/v1/reports/{report_id}").json()
        row = reopened["research_data"]["quantitative_observations"][0]
        self.assertEqual(row["value"], 24000)
        self.assertEqual(row["value_precision"], "approximate")
        self.assertEqual(row["reported_value_text"], "approximately 24,000 weekly downloads")
        self.assertEqual(row["verification_status"], "unverified")
        self.assertTrue(row["comparison_ready"])
        self.assertEqual(reopened["content"], raw)

    def test_report_metrics_missing_scope_or_entity_are_visible_but_not_chart_ready(self):
        report_id = self.create_report("ASMR scope validation")
        report = self.client.get(f"/api/v1/reports/{report_id}").json()
        data = report["research_data"]
        data["quantitative_observations"] = [{
            "metric_id": "downloads", "metric_definition": "Reported downloads", "value": 20, "unit": "downloads",
            "entity_id": "missing-entity", "entity_name": "Unknown", "geo": "JP", "platform": "iOS",
            "period_start": "2025-01-01", "period_end": "2025-03-31", "granularity": "quarter",
            "source_reference": "https://example.com/source", "evidence_reference": "https://example.com/source",
            "methodology": "Source reported", "verification_status": "unverified", "provenance_type": "research_report", "observation_type": "reported",
        }]
        updated = self.client.put(f"/api/v1/reports/{report_id}/structured-data", json={"research_data": data})
        self.assertEqual(updated.status_code, 200, updated.text)
        row = self.client.get(f"/api/v1/reports/{report_id}").json()["research_data"]["quantitative_observations"][0]
        self.assertFalse(row["complete_observation"])
        self.assertFalse(row["comparison_ready"])
        self.assertFalse(row["scope_compatible"])
        self.assertTrue(any("does not resolve" in reason for reason in row["validation_reasons"]))
        self.assertTrue(any("does not match the report scope" in reason for reason in row["validation_reasons"]))

    def test_unstructured_approximate_metrics_and_chart_images_are_not_extracted(self):
        content = "The app saw approximately 12K weekly downloads. A chart image was attached but has no machine-readable values. https://example.com/source"
        response = self.client.post("/api/v1/reports", json={"question": "Metrics?", "geo": "US", "os": "Android", "research_period": "Q2/2025", "content": content})
        self.assertEqual(response.status_code, 201, response.text)
        saved = self.client.get(f"/api/v1/reports/{response.json()['id']}").json()
        self.assertEqual(saved["research_data"]["quantitative_observations"], [])

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

    def test_explicit_period_bounds_are_sufficient_without_invented_granularity(self):
        report_id = self.create_report("Explicit interval without cadence")
        body = {
            "filename": "explicit-interval.csv",
            "csv_content": "Unified Name;Unified ID;Platform;Downloads (Absolute)\nExternal App;st-interval;Unified;120\n",
            "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform"},
            "metric_mappings": [{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
            # Keep the interval historical so this test covers the absence of
            # inferred granularity, not the future-period safety guard.
            "explicit_values": {"geo": "Worldwide", "period_start": "2026-09-14", "period_end": "2026-10-13"},
        }
        preview = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/preview", json=body)
        self.assertEqual(preview.status_code, 200, preview.text)
        observation = preview.json()["observations"][0]
        self.assertIsNone(observation["granularity"])
        self.assertTrue(observation["complete_observation"], observation)
        self.assertTrue(observation["analysis_ready"], observation)
        self.assertFalse(observation["comparison_ready"], "A distinct cadence/methodology must not be invented for comparison readiness.")

    def test_missing_period_bounds_and_granularity_remains_incomplete(self):
        report_id = self.create_report("Missing interval remains incomplete")
        body = {
            "filename": "missing-interval.csv",
            "csv_content": "Unified Name;Unified ID;Platform;Downloads (Absolute)\nExternal App;st-no-period;Unified;120\n",
            "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform"},
            "metric_mappings": [{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
            "explicit_values": {"geo": "Worldwide"},
        }
        preview = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/preview", json=body)
        self.assertEqual(preview.status_code, 200, preview.text)
        observation = preview.json()["observations"][0]
        self.assertFalse(observation["complete_observation"])
        self.assertTrue(any("period start" in reason for reason in observation["source_validation_reasons"]))
        self.assertTrue(any("granularity or explicit period bounds" in reason for reason in observation["source_validation_reasons"]))

    def test_hundred_csv_apps_keep_ten_report_matches_and_ninety_source_only(self):
        report_id = self.create_report("100 app source identity")
        report = self.client.get(f"/api/v1/reports/{report_id}").json()
        data = report["research_data"]
        data["entities"] = [{"key": f"app-{index}", "entity_type": "app", "name": f"Game {index}"} for index in range(10)]
        self.assertEqual(self.client.put(f"/api/v1/reports/{report_id}/structured-data", json={"research_data": data}).status_code, 200)
        csv_rows = ["Unified Name;Unified ID;Platform;Downloads (Absolute)"]
        csv_rows.extend(f"Game {i};st-{i};Android;{1000-i}" for i in range(100))
        body = {
            "filename": "sensor-tower-100.csv", "csv_content": "\n".join(csv_rows),
            "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform"},
            "metric_mappings": [{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads", "methodology": "Sensor Tower source estimate"}],
            "explicit_values": {"geo": "US", "period_start": "2026-09-01", "period_end": "2026-09-30", "granularity": "rolling_period"},
        }
        preview = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/preview", json=body)
        self.assertEqual(preview.status_code, 200, preview.text)
        value = preview.json()
        self.assertEqual(value["source_apps"], 100)
        self.assertEqual(value["matched_entities"], 10)
        self.assertEqual(value["source_only_entities"], 90)
        self.assertEqual(value["dataset_analysis_ready_observations"], 100)
        self.assertEqual(value["dataset_comparison_ready_observations"], 0)
        self.assertTrue(all(
            any("documented provider basis" in reason or "methodology is not confirmed" in reason for reason in item["validation_reasons"])
            for item in value["observations"]
        ))
        self.assertEqual(value["ambiguities"], [])
        saved = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(saved.status_code, 201, saved.text)
        self.assertEqual(saved.json()["dataset_comparison_ready_observations"], value["dataset_comparison_ready_observations"])
        observations = saved.json()["observations"]
        self.assertEqual(len({item["source_entity_id"] for item in observations}), 100)
        self.assertEqual(sum(item["entity_resolution_state"] == "source_only" for item in observations), 90)

    def test_preview_and_saved_dataset_share_effective_metadata_readiness(self):
        report_id = self.create_report("Metadata-ready preview parity")
        body = {
            "filename": "metadata-ready.csv",
            "csv_content": (
                "Unified Name;Unified ID;Platform;GEO;Period Start;Period End;Period Semantics;"
                "Granularity;Unit;Methodology;Downloads (Absolute)\n"
                "Example App;st-example;Android;US;2026-09-01;2026-09-30;reporting_interval;"
                "monthly;downloads;Sensor Tower exact monthly export;120\n"
            ),
            "field_mapping": {
                "entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform",
                "geo": "GEO", "period_start": "Period Start", "period_end": "Period End",
                "period_semantics": "Period Semantics", "granularity": "Granularity",
                "unit": "Unit", "methodology": "Methodology",
            },
            "metric_mappings": [{
                "column": "Downloads (Absolute)", "metric_id": "downloads_absolute",
                "metric_definition": "Downloads, exact source count", "unit": "downloads",
            }],
            "explicit_values": {},
        }

        preview = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/preview", json=body)
        self.assertEqual(preview.status_code, 200, preview.text)
        preview_data = preview.json()
        self.assertEqual(preview_data["dataset_analysis_ready_observations"], 1)
        self.assertEqual(preview_data["dataset_comparison_ready_observations"], 1)
        self.assertEqual(preview_data["observations"][0]["metadata_provenance"]["methodology"]["basis"], "csv")
        self.assertEqual(preview_data["observations"][0]["verification_status"], "unverified")

        saved = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(saved.status_code, 201, saved.text)
        self.assertEqual(saved.json()["dataset_comparison_ready_observations"], preview_data["dataset_comparison_ready_observations"])

    def test_unmatched_dataset_imports_without_any_report_matches(self):
        report_id = self.create_report("No matching report apps")
        body = {
            "filename": "no-report-matches.csv",
            "csv_content": "Unified Name;Unified ID;Platform;Downloads (Absolute)\nExternal Alpha;st-a;Unified;120\nExternal Beta;st-b;Unified;90\n",
            "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform"},
            "metric_mappings": [{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
            "explicit_values": {"geo": "Worldwide", "period_start": "2026-09-01", "period_end": "2026-09-30", "granularity": "rolling_period"},
        }
        response = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(response.status_code, 201, response.text)
        dataset = response.json()
        self.assertEqual(dataset["source_apps"], 2)
        self.assertEqual(dataset["analysis_ready_observations"], 2)
        self.assertEqual(dataset["report_compatible_observations"], 0)
        self.assertTrue(all(item["entity_id"] is None and item["entity_resolution_state"] == "source_only" for item in dataset["observations"]))
        self.assertTrue(all(item["complete_observation"] for item in dataset["observations"]))

    def test_scope_mismatch_does_not_make_source_measurement_invalid(self):
        report_id = self.create_report("US Android report scope")
        body = {
            "filename": "worldwide-unified.csv",
            "csv_content": "Unified Name;Unified ID;Platform;Downloads (Absolute)\nSource App;st-app;Unified;120\n",
            "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform"},
            "metric_mappings": [{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
            "explicit_values": {"geo": "Worldwide", "period_start": "2026-09-01", "period_end": "2026-09-30", "granularity": "rolling_period"},
        }
        saved = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(saved.status_code, 201, saved.text)
        observation = saved.json()["observations"][0]
        self.assertTrue(observation["complete_observation"], observation)
        self.assertTrue(observation["analysis_ready"])
        self.assertFalse(observation["comparison_ready"])
        self.assertEqual(observation["report_compatibility"], "incompatible")
        self.assertIn("Worldwide", observation["geo"])
        self.assertEqual(observation["platform"], "Unified")

    def test_revalidate_legacy_dataset_from_original_csv_preserves_dataset_identity(self):
        report_id = self.create_report("Legacy dataset recovery")
        csv_content = "Unified Name;Unified ID;Platform;Downloads (Absolute)\nSource Only;st-legacy;Unified;450\n"
        digest = __import__("hashlib").sha256(csv_content.encode("utf-8-sig")).hexdigest()
        engine = create_database_engine(get_database_path())
        try:
            with Session(engine) as session:
                session.add(QuantitativeDataset(
                    id="legacy-recovery", report_id=report_id, filename="legacy.csv", content_sha256=digest,
                    original_csv=csv_content,
                    field_mapping_json={"field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform"},
                        "metric_mappings": [{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads"}],
                        "explicit_values": {"geo": "Worldwide", "period_start": "2026-09-01", "period_end": "2026-09-30", "granularity": "rolling_period"}, "delimiter": ";"},
                    entity_mappings_json={},
                    observations_json=[{"metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "value": 450, "unit": "downloads", "entity_id": None, "geo": "Worldwide", "platform": "Unified", "period_start": "2026-09-01", "period_end": "2026-09-30", "granularity": "rolling_period", "provenance_type": "csv_dataset", "provenance_id": "legacy-recovery", "observation_type": "imported", "validation_reasons": ["No report entity matches 'st-legacy'."]}],
                    compatibility_status="partial", validation_reasons_json=[],
                ))
                session.commit()
        finally:
            engine.dispose()
        response = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/legacy-recovery/revalidate")
        self.assertEqual(response.status_code, 200, response.text)
        value = response.json()
        self.assertEqual(value["id"], "legacy-recovery")
        self.assertEqual(value["observations"][0]["source_entity_id"], "sensor_tower:st-legacy")
        self.assertEqual(value["observations"][0]["entity_resolution_state"], "source_only")
        self.assertTrue(value["observations"][0]["complete_observation"], value["observations"][0])
        self.assertEqual(value["content_sha256"], digest)
        listed = self.client.get(f"/api/v1/reports/{report_id}/quantitative-datasets").json()["items"]
        self.assertEqual(len(listed), 1)

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
            # This is a historical interval; the future-period validation is
            # tested independently and must not mask entity-mapping assertions.
            "explicit_values": {"geo": "Worldwide", "period_start": "2026-09-14", "period_end": "2026-10-13", "granularity": "rolling_period"},
        }
        first_preview = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/preview", json=body)
        self.assertEqual(first_preview.status_code, 200, first_preview.text)
        self.assertEqual(first_preview.json()["total_rows"], 6)
        self.assertEqual(len(first_preview.json()["ambiguities"]), 1)
        self.assertEqual(first_preview.json()["unmatched_entities"], [])
        self.assertEqual(first_preview.json()["source_only_entities"], 2)
        body["entity_mappings"] = {"Twin": "product-a"}
        resolved_preview = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/preview", json=body)
        self.assertEqual(resolved_preview.status_code, 200, resolved_preview.text)
        self.assertEqual(resolved_preview.json()["ambiguities"], [])
        self.assertEqual(resolved_preview.json()["unmatched_entities"], [])
        self.assertEqual(resolved_preview.json()["source_only_entities"], 2)
        observations = resolved_preview.json()["observations"]
        self.assertTrue(any("non-numeric value 'bad-number'" in " ".join(item["validation_reasons"]) for item in observations))
        self.assertTrue(all(item["scope_compatible"] is False for item in observations), "Unified must not be inferred as Android for this Android report")
        self.assertTrue(all(item["complete_observation"] for item in observations if item["value"] is not None and item["unit"] is not None), "Report mismatch must not invalidate otherwise complete source data")
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

    def test_225_observation_sensor_style_dataset_persists_and_revalidates_without_identity_loss(self):
        report_id = self.create_report("225 observation revalidation")
        metric_columns = [(f"Metric {index}", f"sensor_metric_{index}", f"Sensor metric {index}", "units") for index in range(1, 10)]
        headers = ["Unified Name", "Unified ID", "Platform", *(column for column, *_ in metric_columns)]
        csv_lines = [";".join(headers)]
        for app_index in range(25):
            metric_values = [str(app_index * 100 + metric_index) for metric_index in range(1, 10)]
            csv_lines.append(";".join([f"Game {app_index:02d}", f"st-{app_index:02d}", "Unified", *metric_values]))
        csv_content = "\n".join(csv_lines)
        body = {
            "filename": "sensor-tower-25-apps-9-metrics.csv",
            "csv_content": csv_content,
            "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform"},
            "metric_mappings": [
                {"column": column, "metric_id": metric_id, "metric_definition": definition, "unit": unit, "methodology": "Sensor Tower export"}
                for column, metric_id, definition, unit in metric_columns
            ],
            "explicit_values": {"geo": "Worldwide", "period_start": "2026-10-14", "period_end": "2026-11-13", "granularity": "rolling_period"},
        }
        saved = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(saved.status_code, 201, saved.text)
        dataset_id = saved.json()["id"]
        self.assertEqual(len(saved.json()["observations"]), 225)
        self.assertEqual(saved.json()["source_apps"], 25)
        self.assertTrue(all(item["platform"] == "Unified" and item["geo"] == "Worldwide" for item in saved.json()["observations"]))

        refreshed = self.client.get(f"/api/v1/reports/{report_id}/quantitative-datasets").json()["items"][0]
        self.assertEqual(refreshed["id"], dataset_id)
        self.assertEqual(len(refreshed["observations"]), 225)
        revalidated = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}/revalidate")
        self.assertEqual(revalidated.status_code, 200, revalidated.text)
        self.assertEqual(revalidated.json()["id"], dataset_id)
        self.assertEqual(len(revalidated.json()["observations"]), 225)
        self.assertEqual(revalidated.json()["observations"][0]["source_entity_id"], "sensor_tower:st-00")
        self.assertEqual(revalidated.json()["observations"][-1]["platform"], "Unified")
        engine = create_database_engine(get_database_path())
        try:
            with Session(engine) as session:
                persisted = session.get(QuantitativeDataset, dataset_id)
                self.assertIsNotNone(persisted)
                self.assertEqual(persisted.original_csv, csv_content)
                self.assertEqual(len(persisted.observations_json), 225)
                self.assertEqual(persisted.report_id, report_id)
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
                    # Insert using the 0006 schema. The current ORM model also
                    # knows about columns introduced by later migrations.
                    with engine.begin() as connection:
                        connection.exec_driver_sql(
                            "INSERT INTO imported_research_reports "
                            "(id, question, geo, os, research_period, content, content_sha256, origin, imported_at, "
                            "research_data_json, parse_status, extraction_error, benchmark_selections_json, benchmark_workspace_json) "
                            "VALUES ('historic-report', 'Old report', 'US', 'Android', '2025', ?, ?, "
                            "'chatgpt_user_import', CURRENT_TIMESTAMP, ?, 'PARSED', NULL, ?, ?)",
                            (original_content, "a" * 64, json.dumps({"executive_summary": "Old summary"}),
                             json.dumps(original_selections), json.dumps(original_workspace)),
                        )
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
