import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.quantitative_comparisons import _stable_source_identity


class QuantitativeComparisonAPITest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"APP_DATA_ROOT": str(Path(self.temp_dir.name) / "data")})
        self.env.start()
        root = Path(__file__).resolve().parents[1]
        command.upgrade(Config(str(root / "alembic.ini")), "head")
        self.context = TestClient(create_app())
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.env.stop()
        self.temp_dir.cleanup()

    def create_report(self, question: str) -> str:
        response = self.client.post("/api/v1/reports", json={
            "question": question, "geo": "US", "os": "Android", "research_period": "2026",
            "content": f"Original report for {question} https://example.com/report",
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def import_sensor_export(self, report_id: str, filename: str, snapshot: str, rows: list[tuple[str, str, str]], methodology: str = "Sensor Tower Unified export v1") -> dict:
        lines = ["Unified Name;Unified ID;Platform;Date;Downloads (Absolute);Source"]
        lines.extend(f"{name};{source_id};Unified;{snapshot};{value};https://example.com/{source_id}" for name, source_id, value in rows)
        body = {
            "filename": filename,
            "csv_content": "\n".join(lines) + "\n",
            "field_mapping": {
                "entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform",
                "snapshot_date": "Date", "source_reference": "Source",
            },
            "metric_mappings": [{
                "column": "Downloads (Absolute)", "metric_id": "downloads_absolute",
                "metric_definition": "Downloads, exact source count", "unit": "downloads",
                "methodology": methodology,
            }],
            "explicit_values": {"geo": "Worldwide", "period_semantics": "snapshot"},
        }
        response = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def import_custom_sensor_export(
        self, report_id: str, filename: str, snapshot: str,
        rows: list[tuple[str, str, str, str]], *, geo: str = "Worldwide",
        metric_id: str = "downloads_absolute", metric_definition: str = "Downloads, exact source count",
        unit: str = "downloads", methodology: str = "Sensor Tower Unified export v1",
        period_semantics: str = "snapshot",
    ) -> dict:
        lines = ["Unified Name;Unified ID;Platform;Date;Metric;Source"]
        lines.extend(f"{name};{source_id};{platform};{snapshot};{value};https://example.com/{source_id}" for name, source_id, platform, value in rows)
        body = {
            "filename": filename,
            "csv_content": "\n".join(lines) + "\n",
            "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform", "snapshot_date": "Date", "source_reference": "Source"},
            "metric_mappings": [{"column": "Metric", "metric_id": metric_id, "metric_definition": metric_definition, "unit": unit, "methodology": methodology}],
            "explicit_values": {"geo": geo, "period_semantics": period_semantics},
        }
        response = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def confirm_fixture_metadata(self, dataset):
        """Only synthetic fixtures: explicit provider specification supplied by the test."""
        endpoint = f"/api/v1/reports/{dataset['report_id']}/quantitative-datasets/{dataset['id']}/metadata"
        view = self.client.get(endpoint).json()
        changes = []
        for group in view['groups']:
            for field, item in group['fields'].items():
                if item['basis'] == 'po_unverified' and item['value'] not in (None, '', 'unknown'):
                    changes.append(dict(group_key=group['key'], field=field, value=item['value'], basis='provider_documentation', source_url='https://example.com/synthetic-provider-specification', source_excerpt=f"Synthetic test specification explicitly states {field}: {item['value']}", attested=True))
        if changes:
            result = self.client.put(endpoint, json=dict(expected_revision=view['revision'], changes=changes))
            self.assertEqual(result.status_code, 200, result.text)

    def request_for(self, baseline: dict, current: dict, metric: dict | None = None) -> dict:
        self.confirm_fixture_metadata(baseline)
        self.confirm_fixture_metadata(current)
        catalog = self.client.get("/api/v1/quantitative-comparisons/datasets?limit=100").json()["items"]
        left = next(item for item in catalog if item["id"] == baseline["id"])
        right = next(item for item in catalog if item["id"] == current["id"])
        metric = metric or left["metrics"][0]
        return {
            "baseline_dataset_id": baseline["id"], "current_dataset_id": current["id"],
            "metric_id": metric["metric_id"], "metric_definition": metric["metric_definition"],
            "unit": metric["unit"], "methodology": metric["methodology"], "geo": "Worldwide", "platform": "Unified",
            "baseline_period_key": left["periods"][0]["key"], "current_period_key": right["periods"][0]["key"],
        }

    def test_original_sensor_exports_preserve_all_100_rows_and_compare_exact_provider_ids(self):
        baseline_report = self.create_report("Earlier research report scoped to US Android")
        current_report = self.create_report("Later research report scoped to US Android")
        baseline_rows = [(f"App {index:03}", f"st-{index:03}", "0" if index == 0 else str(index * 100)) for index in range(100)]
        current_rows = [(f"App {index:03}", f"st-{index:03}", "25" if index == 0 else str(index * 100 + 50)) for index in range(70)]
        current_rows.extend((f"New App {index:03}", f"st-new-{index:03}", str(5000 + index)) for index in range(30))
        baseline = self.import_sensor_export(baseline_report, "earlier.csv", "2026-10-01", baseline_rows)
        current = self.import_sensor_export(current_report, "later.csv", "2026-10-15", current_rows)

        catalog = self.client.get("/api/v1/quantitative-comparisons/datasets?limit=100")
        self.assertEqual(catalog.status_code, 200, catalog.text)
        self.assertEqual(len(catalog.json()["items"]), 2)
        preview = self.client.post("/api/v1/quantitative-comparisons/preview", json=self.request_for(baseline, current))
        self.assertEqual(preview.status_code, 200, preview.text)
        data = preview.json()
        self.assertEqual(data["period_readiness"]["kind"], "snapshot")
        self.assertTrue(data["period_readiness"]["compatible"])
        self.assertEqual(data["summary"]["distinct_apps"], 130)
        self.assertEqual(data["summary"]["matched_apps"], 70)
        self.assertEqual(data["summary"]["baseline_only_apps"], 30)
        self.assertEqual(data["summary"]["current_only_apps"], 30)
        self.assertEqual(len(data["rows"]), 130)
        zero_base = next(row for row in data["rows"] if row["entity_key"] == "sensor_tower:st-000")
        self.assertEqual(zero_base["absolute_change"], 25)
        self.assertIsNone(zero_base["percentage_change"])
        self.assertIn("baseline is zero", zero_base["percentage_change_unavailable_reason"])
        row = next(row for row in data["rows"] if row["entity_key"] == "sensor_tower:st-001")
        self.assertEqual(row["percentage_change"], 50.0)
        self.assertEqual(len(row["evidence"]), 2)
        self.assertEqual(row["baseline"]["verification_status"], "unverified")
        self.assertEqual(row["baseline"]["report_id"], baseline_report)
        self.assertEqual(row["current"]["report_id"], current_report)
        self.assertEqual(row["baseline"]["platform"], "Unified")
        self.assertEqual(row["current"]["geo"], "Worldwide")
        self.assertEqual(data["baseline"]["compatibility_status"], "incompatible")
        self.assertEqual(len(baseline["observations"]), 100)
        self.assertEqual(self.client.get(f"/api/v1/reports/{baseline_report}/quantitative-datasets").json()["items"][0]["content_sha256"], baseline["content_sha256"])

    def test_current_invalid_values_duplicates_name_conflicts_and_missing_apps_are_not_aggregated(self):
        first = self.create_report("First")
        second = self.create_report("Second")
        before = [("App Zero", "st-0", "0"), ("Name conflict", "st-conflict", "10"), ("Duplicate", "st-dup", "20"), ("Only before", "st-before", "30")]
        after = [("App Zero", "st-0", "10"), ("Different name", "st-conflict", "12"), ("Duplicate", "st-dup", "25"), ("Duplicate", "st-dup", "25"), ("Only after", "st-after", "40"), ("Bad number", "st-bad", "NaN")]
        baseline = self.import_sensor_export(first, "before.csv", "2026-10-01", before)
        current = self.import_sensor_export(second, "after.csv", "2026-10-15", after)
        result = self.client.post("/api/v1/quantitative-comparisons/preview", json=self.request_for(baseline, current)).json()
        rows = {row["entity_key"]: row for row in result["rows"]}
        self.assertEqual(rows["sensor_tower:st-conflict"]["status"], "identity_conflict")
        self.assertEqual(rows["sensor_tower:st-dup"]["status"], "duplicate_observations")
        self.assertEqual(rows["sensor_tower:st-bad"]["status"], "needs_review")
        self.assertIsNone(rows["sensor_tower:st-bad"]["absolute_change"])
        self.assertEqual(rows["sensor_tower:st-before"]["status"], "missing_current")
        self.assertEqual(rows["sensor_tower:st-after"]["status"], "missing_baseline")
        self.assertEqual(rows["sensor_tower:st-0"]["percentage_change_unavailable_reason"], "Percentage change is unavailable because the baseline is zero.")
        self.assertGreater(result["summary"]["invalid_observations"], 0)

    def test_same_names_with_different_ids_are_not_joined_and_ambiguous_generic_csv_ids_are_not_auto_matched(self):
        first, second = self.create_report("First names"), self.create_report("Second names")
        baseline = self.import_sensor_export(first, "names-a.csv", "2026-10-01", [("Same Display Name", "st-a", "4"), ("Same Display Name", "st-b", "8")])
        current = self.import_sensor_export(second, "names-b.csv", "2026-10-15", [("Same Display Name", "st-c", "12")])
        result = self.client.post("/api/v1/quantitative-comparisons/preview", json=self.request_for(baseline, current)).json()
        keys = {row["entity_key"] for row in result["rows"]}
        self.assertEqual(keys, {"sensor_tower:st-a", "sensor_tower:st-b", "sensor_tower:st-c"})
        self.assertEqual(result["summary"]["matched_apps"], 0)
        self.assertEqual(result["summary"]["distinct_apps"], 3)

    def test_incompatible_metric_identity_and_duplicate_dataset_are_rejected(self):
        first, second, third = self.create_report("Metric one"), self.create_report("Metric duplicate"), self.create_report("Metric two")
        baseline = self.import_sensor_export(first, "same-a.csv", "2026-10-01", [("App", "st-a", "10")])
        duplicate = self.import_sensor_export(second, "same-copy.csv", "2026-10-01", [("App", "st-a", "10")])
        self.assertEqual(duplicate["content_sha256"], baseline["content_sha256"])
        payload = self.request_for(baseline, duplicate)
        duplicate_selection = self.client.post("/api/v1/quantitative-comparisons/preview", json=payload)
        self.assertEqual(duplicate_selection.status_code, 422)
        self.assertEqual(duplicate_selection.json()["error"]["code"], "DUPLICATE_DATASET_SELECTION")

        second_rows = self.import_sensor_export(third, "different-method.csv", "2026-10-15", [("App", "st-a", "12")], methodology="Different methodology")
        dataset = self.client.get("/api/v1/quantitative-comparisons/datasets?limit=100").json()["items"]
        current_catalog = next(item for item in dataset if item["id"] == second_rows["id"])
        payload = self.request_for(baseline, second_rows)
        metric = current_catalog["metrics"][0]
        # Labels and unit match, but a distinct method changes semantic identity.
        payload["methodology"] = "Different methodology"
        response = self.client.post("/api/v1/quantitative-comparisons/preview", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "METRIC_NOT_SHARED")
        self.assertEqual(metric["methodology"], payload["methodology"])
        self.assertNotEqual(baseline["observations"][0]["methodology"], payload["methodology"])
        self.assertNotEqual(baseline["observations"][0]["methodology"], second_rows["observations"][0]["methodology"])

    def test_generic_csv_namespace_and_name_hashes_do_not_auto_join(self):
        self.assertIsNone(_stable_source_identity({"source_entity_id": "csv:source-id", "source_provider": "csv"}))
        self.assertIsNone(_stable_source_identity({"source_entity_id": "sensor_tower:name-abcd", "source_provider": "sensor_tower"}))
        self.assertEqual(_stable_source_identity({"source_entity_id": "sensor_tower:st-123", "source_provider": "sensor_tower"}), "sensor_tower:st-123")

    def test_geo_platform_mismatch_is_blocked_and_signed_values_keep_sign_without_percent_growth(self):
        old_report, new_report = self.create_report("Old scope"), self.create_report("New scope")
        old = self.import_sensor_export(old_report, "old-scope.csv", "2026-10-01", [("App", "st-a", "-10")])
        new = self.import_custom_sensor_export(new_report, "new-scope.csv", "2026-10-15", [("App", "st-a", "Android", "-5")], geo="US")
        mismatch = self.client.post("/api/v1/quantitative-comparisons/preview", json=self.request_for(old, new))
        self.assertEqual(mismatch.status_code, 422)
        self.assertEqual(mismatch.json()["error"]["code"], "SCOPE_OR_PERIOD_NOT_SHARED")

        same_scope = self.import_sensor_export(self.create_report("Negative current"), "negative-current.csv", "2026-10-15", [("App", "st-a", "-5")])
        result = self.client.post("/api/v1/quantitative-comparisons/preview", json=self.request_for(old, same_scope))
        self.assertEqual(result.status_code, 200, result.text)
        row = result.json()["rows"][0]
        self.assertEqual(row["baseline"]["value"], -10)
        self.assertEqual(row["current"]["value"], -5)
        self.assertEqual(row["absolute_change"], 5)
        self.assertIsNone(row["percentage_change"])
        self.assertIn("negative or signed", row["percentage_change_unavailable_reason"])

    def test_revenue_without_explicit_currency_is_blocked(self):
        old_report, new_report = self.create_report("Revenue old"), self.create_report("Revenue new")
        old = self.import_custom_sensor_export(old_report, "revenue-old.csv", "2026-10-01", [("App", "st-revenue", "Unified", "100")], metric_id="revenue_absolute", metric_definition="Revenue", unit="revenue")
        new = self.import_custom_sensor_export(new_report, "revenue-new.csv", "2026-10-15", [("App", "st-revenue", "Unified", "120")], metric_id="revenue_absolute", metric_definition="Revenue", unit="revenue")
        response = self.client.post("/api/v1/quantitative-comparisons/preview", json=self.request_for(old, new))
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "METRIC_CURRENCY_REQUIRED")

    def test_missing_methodology_is_visible_in_catalog_and_not_usable(self):
        report_id = self.create_report("Methodology needed")
        dataset = self.import_custom_sensor_export(report_id, "method-missing.csv", "2026-10-01", [("App", "st-method", "Unified", "10")], methodology="")
        catalog = self.client.get("/api/v1/quantitative-comparisons/datasets?limit=100").json()
        metric = next(item for item in catalog["items"] if item["id"] == dataset["id"])["metrics"][0]
        self.assertEqual(metric["usable_observations"], 0)
        self.assertTrue(any("methodology is not specified" in warning for warning in metric["warnings"]))

    def test_date_only_period_meaning_must_be_confirmed_before_comparison(self):
        first_report, second_report = self.create_report("Ambiguous date first"), self.create_report("Ambiguous date second")
        first = self.import_custom_sensor_export(first_report, "ambiguous-a.csv", "2026-10-01", [("App", "st-date", "Unified", "10")], period_semantics="unknown")
        second = self.import_custom_sensor_export(second_report, "ambiguous-b.csv", "2026-10-15", [("App", "st-date", "Unified", "12")], period_semantics="unknown")
        payload = self.request_for(first, second)
        unconfirmed = self.client.post("/api/v1/quantitative-comparisons/preview", json=payload)
        self.assertEqual(unconfirmed.status_code, 200, unconfirmed.text)
        self.assertFalse(unconfirmed.json()["period_readiness"]["compatible"])
        self.assertEqual(unconfirmed.json()["rows"][0]["status"], "incompatible_periods")

        payload["baseline_semantics_confirmation"] = "snapshot"
        payload["current_semantics_confirmation"] = "snapshot"
        confirmed = self.client.post("/api/v1/quantitative-comparisons/preview", json=payload)
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertTrue(confirmed.json()["period_readiness"]["compatible"])
        self.assertEqual(confirmed.json()["rows"][0]["status"], "needs_review")  # A bare selection is not documented metadata.

    def test_quarter_and_week_windows_are_not_comparable_and_periods_must_not_overlap(self):
        first, second = self.create_report("Quarterly source"), self.create_report("Weekly source")
        def import_interval(report_id: str, name: str, start: str, end: str, granularity: str) -> dict:
            body = {
                "filename": f"{name}.csv",
                "csv_content": f"Unified Name;Unified ID;Platform;Downloads;Source\nApp;st-app;Unified;{12 if granularity == 'week' else 10};https://example.com/{start}\n",
                "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform", "source_reference": "Source"},
                "metric_mappings": [{"column": "Downloads", "metric_id": "downloads", "metric_definition": "Downloads observed in window", "unit": "downloads", "methodology": "Sensor Tower export v1"}],
                "explicit_values": {"geo": "Worldwide", "period_start": start, "period_end": end, "granularity": granularity},
            }
            response = self.client.post(f"/api/v1/reports/{report_id}/quantitative-datasets", json=body)
            self.assertEqual(response.status_code, 201, response.text)
            return response.json()
        quarter = import_interval(first, "quarter", "2026-07-01", "2026-09-30", "quarter")
        week = import_interval(second, "week", "2026-10-01", "2026-10-07", "week")
        payload = self.request_for(quarter, week)
        response = self.client.post("/api/v1/quantitative-comparisons/preview", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["period_readiness"]["compatible"])
        self.assertEqual(response.json()["rows"][0]["status"], "incompatible_periods")

        overlap_first_report, overlap_second_report = self.create_report("Overlap first"), self.create_report("Overlap second")
        overlap_first = import_interval(overlap_first_report, "overlap-first", "2026-07-01", "2026-07-31", "custom")
        overlap_second = import_interval(overlap_second_report, "overlap-second", "2026-07-15", "2026-08-14", "custom")
        overlap = self.client.post("/api/v1/quantitative-comparisons/preview", json=self.request_for(overlap_first, overlap_second))
        self.assertEqual(overlap.status_code, 200, overlap.text)
        self.assertFalse(overlap.json()["period_readiness"]["compatible"])
        self.assertEqual(overlap.json()["rows"][0]["status"], "incompatible_periods")
        self.assertIn("overlap", " ".join(overlap.json()["period_readiness"]["reasons"]).casefold())

        length_first_report, length_second_report = self.create_report("Unequal window first"), self.create_report("Unequal window second")
        length_first = import_interval(length_first_report, "length-first", "2026-09-01", "2026-09-30", "custom")
        length_second = import_interval(length_second_report, "length-second", "2026-10-01", "2026-10-31", "custom")
        unequal = self.client.post("/api/v1/quantitative-comparisons/preview", json=self.request_for(length_first, length_second))
        self.assertEqual(unequal.status_code, 200, unequal.text)
        self.assertFalse(unequal.json()["period_readiness"]["compatible"])
        self.assertEqual(unequal.json()["rows"][0]["status"], "incompatible_periods")

    def test_catalog_and_preview_are_typed_openapi_contracts(self):
        report = self.create_report("Metric-key catalog contract")
        dataset = self.import_sensor_export(
            report, "metric-key.csv", "2026-10-01",
            [("App A", "st-a", "100")],
        )
        self.confirm_fixture_metadata(dataset)
        catalog = self.client.get("/api/v1/quantitative-comparisons/datasets?limit=100")
        self.assertEqual(catalog.status_code, 200, catalog.text)
        dataset_item = next(item for item in catalog.json()["items"] if item["id"] == dataset["id"])
        metric = dataset_item["metrics"][0]
        self.assertTrue(metric["key"])
        self.assertIn(metric["key"], dataset_item["periods"][0]["metric_keys"])

        schema = self.client.get("/openapi.json").json()
        self.assertIn("/api/v1/quantitative-comparisons/datasets", schema["paths"])
        self.assertIn("/api/v1/quantitative-comparisons/preview", schema["paths"])
        self.assertEqual(schema["paths"]["/api/v1/quantitative-comparisons/preview"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"], "#/components/schemas/QuantitativeComparisonPreviewRequest")


if __name__ == "__main__":
    unittest.main()
