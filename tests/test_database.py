import os
import hashlib
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from backend.app.db import create_database_engine, get_database_path
from backend.app.main import create_app


CORE_TABLES = {"research_projects", "research_plans", "research_runs", "research_run_manifests", "source_registry", "source_records", "evidence", "app_store_listings", "po_opportunity_decisions"}


class DatabaseMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_root = Path(self.temp_dir.name) / "application data"
        self.env = patch.dict(os.environ, {"APP_DATA_ROOT": str(self.data_root)})
        self.env.start()
        self.config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))

    def tearDown(self) -> None:
        self.env.stop()
        self.temp_dir.cleanup()

    def test_database_file_is_under_configured_data_root(self) -> None:
        self.assertEqual(get_database_path(), (self.data_root / "po_intelligence_hub.sqlite3").resolve())

    def test_upgrade_creates_schema_and_enables_wal_and_foreign_keys(self) -> None:
        command.upgrade(self.config, "head")
        command.check(self.config)
        db_path = get_database_path()
        self.assertTrue(db_path.is_file())

        engine = create_database_engine(db_path)
        try:
            inspector = inspect(engine)
            self.assertTrue(CORE_TABLES.issubset(set(inspector.get_table_names())))
            with engine.connect() as connection:
                self.assertEqual(connection.exec_driver_sql("PRAGMA journal_mode").scalar_one().lower(), "wal")
                self.assertEqual(connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one(), 1)
                self.assertIn("uq_research_plans_project_version", {
                    constraint["name"] for constraint in inspector.get_unique_constraints("research_plans")
                })
        finally:
            engine.dispose()

    def test_workspace_migration_preserves_existing_report_csv_and_po_state(self) -> None:
        command.upgrade(self.config, "20261020_0007")
        connection = sqlite3.connect(get_database_path())
        try:
            connection.execute(
                "INSERT INTO research_projects (id, name, created_at, updated_at) "
                "VALUES ('project-old', 'Existing project', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
            connection.execute(
                "INSERT INTO imported_research_reports "
                "(id, question, geo, os, research_period, content, content_sha256, origin, imported_at, "
                "research_data_json, parse_status, extraction_error, benchmark_selections_json, benchmark_workspace_json) "
                "VALUES ('report-old', 'Question', 'US', 'Android', '2026', 'original report', ?, "
                "'chatgpt_user_import', CURRENT_TIMESTAMP, '{}', 'PARSED', NULL, ?, ?) ",
                ("a" * 64, '[{"item_type":"entity","item_key":"old-app"}]', '{"entries":[{"item_type":"entity","item_key":"old-app","po_assessment":"keep"}]}'),
            )
            connection.execute(
                "INSERT INTO quantitative_datasets "
                "(id, report_id, filename, content_sha256, original_csv, field_mapping_json, entity_mappings_json, "
                "observations_json, compatibility_status, validation_reasons_json, created_at) "
                "VALUES ('dataset-old', 'report-old', 'old.csv', ?, 'Original CSV bytes', '{}', '{}', '[]', 'partial', '[]', CURRENT_TIMESTAMP)",
                ("b" * 64,),
            )
            connection.commit()
        finally:
            connection.close()
        command.upgrade(self.config, "head")
        connection = sqlite3.connect(get_database_path())
        try:
            self.assertEqual(connection.execute("SELECT content FROM imported_research_reports WHERE id='report-old'").fetchone()[0], "original report")
            self.assertEqual(connection.execute("SELECT benchmark_selections_json FROM imported_research_reports WHERE id='report-old'").fetchone()[0], '[{"item_type":"entity","item_key":"old-app"}]')
            self.assertEqual(connection.execute("SELECT original_csv, report_id, project_id FROM quantitative_datasets WHERE id='dataset-old'").fetchone(), ("Original CSV bytes", "report-old", None))
            self.assertEqual(connection.execute("SELECT workspace_state_json FROM research_projects WHERE id='project-old'").fetchone()[0], "{}")
        finally:
            connection.close()

    def test_historical_research_migrates_restores_and_reopens_through_apis(self) -> None:
        """Exercise a representative v0008 workspace before/after the real 0009 migration."""
        command.upgrade(self.config, "20261023_0008")
        test_app = create_app()
        client_context = TestClient(test_app)
        client = client_context.__enter__()
        try:
            project_response = client.post("/api/v1/projects", json={"name": "Historical migration fixture", "category": "Synthetic QA only"})
            self.assertEqual(project_response.status_code, 201, project_response.text)
            project = project_response.json()
            project_id = project["id"]

            plan_response = client.post(f"/api/v1/projects/{project_id}/plans", json={
                "question": "How did the historical fixture preserve its source state?", "geos": ["US"], "platforms": ["ios"],
            })
            self.assertEqual(plan_response.status_code, 201, plan_response.text)
            plan = plan_response.json()
            run_response = client.post(f"/api/v1/projects/{project_id}/runs", json={"plan_version": plan["version"]})
            self.assertEqual(run_response.status_code, 201, run_response.text)
            run = run_response.json()
            evidence_response = client.post(f"/api/v1/runs/{run['id']}/evidence", json={
                "source_name": "Synthetic fixture source", "source_type": "reference",
                "source_url": "https://example.com/historical-fixture", "excerpt_or_ref": "Synthetic QA evidence; no market claim.",
            })
            self.assertEqual(evidence_response.status_code, 201, evidence_response.text)
            for state in ("collecting", "validating", "synthesizing", "completed"):
                response = client.patch(f"/api/v1/runs/{run['id']}/state", json={"state": state})
                self.assertEqual(response.status_code, 200, response.text)
            manifest = client.get(f"/api/v1/runs/{run['id']}/manifest").json()

            source_url = "https://example.com/historical-fixture-report"
            original_report = (
                "# Historical fixture report\n\n"
                "This synthetic fixture exercises migration preservation only.\n\n"
                f"Source: {source_url}\n"
            )
            structured = {
                "schema_version": "po_research_v1",
                "research_data": {
                    "executive_summary": "Synthetic QA fixture used to verify a legacy report survives migration.",
                    "entities": [{"key": "legacy-app", "entity_type": "service", "name": "Legacy App", "attributes": {"fixture": "synthetic"}, "evidence_references": [source_url]}],
                    "findings": [{"key": "legacy-finding", "finding_type": "observation", "title": "Historical finding remains readable",
                        "description": "Synthetic fixture text to verify structured findings persist.", "related_entities": ["legacy-app"],
                        "evidence_references": [source_url], "scope": {"geo": "US", "period": "2025"},
                        "evidence_status": "unverified", "uncertainty": "Synthetic QA fixture only.", "po_implications": "Review only as migration test data."}],
                    "evidence_references": [{"url": source_url, "title": "Synthetic fixture source", "verified": False}],
                    "research_gaps": ["No real research data is represented by this fixture."],
                },
            }
            report_response = client.post("/api/v1/reports", json={
                "question": "How is this legacy fixture retained?", "geo": "US", "os": "iOS", "research_period": "2025",
                "content": original_report, "structured_json": json.dumps(structured), "project_id": project_id,
            })
            self.assertEqual(report_response.status_code, 201, report_response.text)
            report = report_response.json()

            benchmark_response = client.put(f"/api/v1/reports/{report['id']}/benchmark-state", json={
                "selections": [{"item_type": "entity", "item_key": "legacy-app"}, {"item_type": "finding", "item_key": "legacy-finding"}],
                "custom_dimensions": [],
                "entries": [{"item_type": "finding", "item_key": "legacy-finding", "po_assessment": "Historical PO assessment retained.",
                    "notes": "Historical PO note; do not overwrite.", "next_action": "Reopen after migration and restore."}],
            })
            self.assertEqual(benchmark_response.status_code, 200, benchmark_response.text)

            csv_text = "Unified Name;Unified ID;Platform;Downloads (Absolute)\nLegacy App;st-legacy;Unified;120\n"
            csv_payload = {
                "filename": "historical-report-linked.csv", "csv_content": csv_text,
                "field_mapping": {"entity_id": "Unified ID", "entity_name": "Unified Name", "platform": "Platform"},
                "entity_mappings": {"st-legacy": "legacy-app"},
                "metric_mappings": [{"column": "Downloads (Absolute)", "metric_id": "downloads_absolute", "metric_definition": "Downloads (Absolute)", "unit": "downloads", "methodology": "Synthetic historical export"}],
                "explicit_values": {"geo": "US", "period_start": "2025-01-01", "period_end": "2025-01-31", "granularity": "monthly", "period_semantics": "reporting_interval"},
            }
            report_dataset_response = client.post(f"/api/v1/reports/{report['id']}/quantitative-datasets", json=csv_payload)
            self.assertEqual(report_dataset_response.status_code, 201, report_dataset_response.text)
            report_dataset = report_dataset_response.json()

            workspace_csv = csv_text.replace("Unified;120", "Unified;180")
            workspace_payload = {**csv_payload, "filename": "historical-workspace-owned.csv", "csv_content": workspace_csv, "entity_mappings": {}}
            workspace_dataset_response = client.post(f"/api/v1/projects/{project_id}/quantitative-datasets", json=workspace_payload)
            self.assertEqual(workspace_dataset_response.status_code, 201, workspace_dataset_response.text)
            workspace_dataset = workspace_dataset_response.json()
            observation = workspace_dataset["observations"][0]
            source_entity_id = observation["source_entity_id"]
            shortlist_context = {
                "dataset_id": workspace_dataset["id"], "dataset_filename": workspace_dataset["filename"],
                "dataset_content_sha256": workspace_dataset["content_sha256"], "selection_type": "manual",
                "source_entity_ids": [source_entity_id], "selection_criterion": "Selected explicitly for the migration fixture.",
                "observation_refs": [{"source_entity_id": source_entity_id, "source_row_number": observation["source_row_number"], "metric_id": observation["metric_id"]}],
            }
            shortlist_response = client.put(f"/api/v1/projects/{project_id}/workspace-state", json={
                "selected_app_ids": [source_entity_id], "selection_criterion": shortlist_context["selection_criterion"],
                "selected_app_context": shortlist_context,
            })
            self.assertEqual(shortlist_response.status_code, 200, shortlist_response.text)

            metadata = client.get(f"/api/v1/projects/{project_id}/quantitative-datasets/{workspace_dataset['id']}/metadata")
            self.assertEqual(metadata.status_code, 200, metadata.text)
            group_key = metadata.json()["groups"][0]["key"]
            metadata_review_response = client.put(f"/api/v1/projects/{project_id}/quantitative-datasets/{workspace_dataset['id']}/metadata", json={
                "expected_revision": 0,
                "changes": [{"group_key": group_key, "field": "geo", "value": "US", "basis": "po_unverified", "source_excerpt": "Historical synthetic migration fixture review."}],
            })
            self.assertEqual(metadata_review_response.status_code, 200, metadata_review_response.text)
            self.assertEqual(len(metadata_review_response.json()["history"]), 1)
        finally:
            client_context.__exit__(None, None, None)
            test_app.state.session_factory.kw["bind"].dispose()

        database_path = get_database_path()
        pre_migration_backup = Path(self.temp_dir.name) / "historical-v0008-backup.sqlite3"
        with closing(sqlite3.connect(database_path)) as source, closing(sqlite3.connect(pre_migration_backup)) as backup:
            source.backup(backup)
            self.assertEqual(backup.execute("PRAGMA integrity_check").fetchone()[0], "ok")

        # This is the actual release migration path under test: v0008 -> v0009.
        command.upgrade(self.config, "head")
        migrated_app = create_app()
        client_context = TestClient(migrated_app)
        client = client_context.__enter__()
        try:
            self._assert_historical_fixture_reopened(client, project_id, report["id"], run["id"],
                report_dataset["id"], workspace_dataset["id"], manifest["checksum_sha256"], source_entity_id)
            opportunities = client.get(f"/api/v1/projects/{project_id}/opportunities")
            self.assertEqual(opportunities.status_code, 200, opportunities.text)
            candidate = next(item for item in opportunities.json()["candidates"] if item["source_entity_id"] == source_entity_id)
            decision_payload = {
                "candidate_id": candidate["candidate_id"], "dataset_id": workspace_dataset["id"],
                "dataset_content_sha256": workspace_dataset["content_sha256"], "source_entity_id": source_entity_id,
                "decision_status": "investigate", "priority": "medium", "rationale": "Synthetic historical decision created after migration.",
                "next_action": "Confirm retained decision after restore.",
            }
            saved_decision = client.put(f"/api/v1/projects/{project_id}/opportunities/decisions", json=decision_payload)
            self.assertEqual(saved_decision.status_code, 200, saved_decision.text)
            saved_candidate = next(item for item in saved_decision.json()["candidates"] if item["source_entity_id"] == source_entity_id)
            self.assertEqual(saved_candidate["decision"]["rationale"], decision_payload["rationale"])
        finally:
            client_context.__exit__(None, None, None)
            migrated_app.state.session_factory.kw["bind"].dispose()

        # Restore the v0008 backup to a separate disposable root, then repeat the real migration.
        restored_root = Path(self.temp_dir.name) / "restored application data"
        restored_root.mkdir()
        restored_database = restored_root / "po_intelligence_hub.sqlite3"
        with closing(sqlite3.connect(pre_migration_backup)) as source, closing(sqlite3.connect(restored_database)) as restored:
            source.backup(restored)
            self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        with patch.dict(os.environ, {"APP_DATA_ROOT": str(restored_root)}):
            command.upgrade(self.config, "head")
            restored_app = create_app()
            restored_client_context = TestClient(restored_app)
            restored_client = restored_client_context.__enter__()
            try:
                self._assert_historical_fixture_reopened(restored_client, project_id, report["id"], run["id"],
                    report_dataset["id"], workspace_dataset["id"], manifest["checksum_sha256"], source_entity_id)
                candidates = restored_client.get(f"/api/v1/projects/{project_id}/opportunities").json()["candidates"]
                candidate = next(item for item in candidates if item["source_entity_id"] == source_entity_id)
                decision_payload["candidate_id"] = candidate["candidate_id"]
                restored_decision = restored_client.put(f"/api/v1/projects/{project_id}/opportunities/decisions", json=decision_payload)
                self.assertEqual(restored_decision.status_code, 200, restored_decision.text)
                reopened_decision = restored_client.get(f"/api/v1/projects/{project_id}/opportunities").json()
                candidate_after_restore = next(item for item in reopened_decision["candidates"] if item["source_entity_id"] == source_entity_id)
                self.assertEqual(candidate_after_restore["decision"]["rationale"], decision_payload["rationale"])
                with closing(sqlite3.connect(restored_database)) as restored:
                    self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                    self.assertEqual(restored.execute("SELECT version_num FROM alembic_version").fetchone()[0], "20261024_0009")
            finally:
                restored_client_context.__exit__(None, None, None)
                restored_app.state.session_factory.kw["bind"].dispose()

        with closing(sqlite3.connect(database_path)) as migrated:
            self.assertEqual(migrated.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(migrated.execute("SELECT version_num FROM alembic_version").fetchone()[0], "20261024_0009")

    def _assert_historical_fixture_reopened(self, client: TestClient, project_id: str, report_id: str, run_id: str,
                                            report_dataset_id: str, workspace_dataset_id: str, manifest_checksum: str,
                                            source_entity_id: str) -> None:
        project = client.get(f"/api/v1/projects/{project_id}")
        self.assertEqual(project.status_code, 200, project.text)
        self.assertEqual(project.json()["workspace_state_json"]["selected_app_ids"], [source_entity_id])

        report = client.get(f"/api/v1/reports/{report_id}")
        self.assertEqual(report.status_code, 200, report.text)
        self.assertIn("synthetic fixture", report.json()["content"].lower())
        self.assertEqual(report.json()["research_data"]["findings"][0]["key"], "legacy-finding")
        self.assertEqual(report.json()["benchmark_selections"], [
            {"item_type": "entity", "item_key": "legacy-app"}, {"item_type": "finding", "item_key": "legacy-finding"},
        ])
        self.assertEqual(report.json()["benchmark_workspace"]["entries"][0]["notes"], "Historical PO note; do not overwrite.")

        report_datasets = client.get(f"/api/v1/reports/{report_id}/quantitative-datasets")
        self.assertEqual(report_datasets.status_code, 200, report_datasets.text)
        self.assertIn(report_dataset_id, {item["id"] for item in report_datasets.json()["items"]})
        project_datasets = client.get(f"/api/v1/projects/{project_id}/quantitative-datasets")
        self.assertEqual(project_datasets.status_code, 200, project_datasets.text)
        self.assertTrue({report_dataset_id, workspace_dataset_id}.issubset({item["id"] for item in project_datasets.json()["items"]}))

        metadata = client.get(f"/api/v1/projects/{project_id}/quantitative-datasets/{workspace_dataset_id}/metadata")
        self.assertEqual(metadata.status_code, 200, metadata.text)
        self.assertEqual(metadata.json()["revision"], 1)
        self.assertEqual(metadata.json()["history"][0]["field"], "geo")

        manifest = client.get(f"/api/v1/runs/{run_id}/manifest")
        self.assertEqual(manifest.status_code, 200, manifest.text)
        self.assertEqual(manifest.json()["checksum_sha256"], manifest_checksum)
        self.assertEqual(len(manifest.json()["content"]["evidence"]), 1)

    def test_downgrade_removes_v2_002_schema(self) -> None:
        command.upgrade(self.config, "head")
        command.downgrade(self.config, "base")
        connection = sqlite3.connect(get_database_path())
        try:
            table_names = {
                row[0]
                for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
        finally:
            connection.close()
        self.assertTrue(CORE_TABLES.isdisjoint(table_names))

    def test_database_rejects_orphan_plan_and_unknown_run_state(self) -> None:
        command.upgrade(self.config, "head")
        engine = create_database_engine(get_database_path())
        try:
            with engine.begin() as connection:
                with self.assertRaises(IntegrityError):
                    connection.exec_driver_sql(
                        "INSERT INTO research_plans "
                        "(id, project_id, version, question, geos, platforms, goals, keywords, source_policy, created_at) "
                        "VALUES ('plan', 'missing-project', 1, 'Question?', '[]', '[]', '[]', '[]', '{}', CURRENT_TIMESTAMP)"
                    )
                connection.exec_driver_sql(
                    "INSERT INTO research_projects (id, name, created_at, updated_at) "
                    "VALUES ('project', 'Project', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO research_plans "
                    "(id, project_id, version, question, geos, platforms, goals, keywords, source_policy, created_at) "
                    "VALUES ('plan', 'project', 1, 'Question?', '[]', '[]', '[]', '[]', '{}', CURRENT_TIMESTAMP)"
                )
                with self.assertRaises(IntegrityError):
                    connection.exec_driver_sql(
                        "INSERT INTO research_runs "
                        "(id, project_id, plan_id, plan_version, state, coverage_summary, created_at) "
                        "VALUES ('run', 'project', 'plan', 1, 'invented', '{}', CURRENT_TIMESTAMP)"
                    )
        finally:
            engine.dispose()

    def test_database_enforces_run_state_transitions(self) -> None:
        command.upgrade(self.config, "head")
        engine = create_database_engine(get_database_path())
        try:
            with engine.begin() as connection:
                connection.exec_driver_sql(
                    "INSERT INTO research_projects (id, name, created_at, updated_at) "
                    "VALUES ('project', 'Project', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO research_plans "
                    "(id, project_id, version, question, geos, platforms, goals, keywords, source_policy, created_at) "
                    "VALUES ('plan', 'project', 1, 'Question?', '[]', '[]', '[]', '[]', '{}', CURRENT_TIMESTAMP)"
                )
                with self.assertRaises(IntegrityError):
                    connection.exec_driver_sql(
                        "INSERT INTO research_runs "
                        "(id, project_id, plan_id, plan_version, state, coverage_summary, created_at) "
                        "VALUES ('terminal-run', 'project', 'plan', 1, 'completed', '{}', CURRENT_TIMESTAMP)"
                    )
                connection.exec_driver_sql(
                    "INSERT INTO research_runs "
                    "(id, project_id, plan_id, plan_version, state, coverage_summary, created_at) "
                    "VALUES ('run', 'project', 'plan', 1, 'queued', '{}', CURRENT_TIMESTAMP)"
                )
                with self.assertRaises(IntegrityError):
                    connection.exec_driver_sql(
                        "INSERT INTO research_run_manifests (run_id, version, content, checksum_sha256, created_at) "
                        "VALUES ('run', 1, '{}', ?, CURRENT_TIMESTAMP)",
                        ("0" * 64,),
                    )
                with self.assertRaises(IntegrityError):
                    connection.exec_driver_sql("UPDATE research_runs SET state='completed' WHERE id='run'")
                connection.exec_driver_sql("UPDATE research_runs SET state='collecting' WHERE id='run'")
        finally:
            engine.dispose()

    def test_upgrade_backfills_manifest_for_an_existing_terminal_run(self) -> None:
        command.upgrade(self.config, "20261017_0001")
        engine = create_database_engine(get_database_path())
        try:
            with engine.begin() as connection:
                connection.exec_driver_sql(
                    "INSERT INTO research_projects (id, name, created_at, updated_at) "
                    "VALUES ('project', 'Project', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO research_plans "
                    "(id, project_id, version, question, geos, platforms, goals, keywords, source_policy, created_at) "
                    "VALUES ('plan', 'project', 1, 'Frozen question', '[\"US\"]', '[\"ios\"]', '[]', '[]', '{}', CURRENT_TIMESTAMP)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO research_runs "
                    "(id, project_id, plan_id, plan_version, state, coverage_summary, created_at) "
                    "VALUES ('run', 'project', 'plan', 1, 'queued', '{}', CURRENT_TIMESTAMP)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO source_records "
                    "(id, run_id, source_name, source_type, collection_mode, retrieved_at, scope) "
                    "VALUES ('source-record', 'run', 'Manual', 'reference', 'manual', CURRENT_TIMESTAMP, '{}')"
                )
                connection.exec_driver_sql(
                    "INSERT INTO evidence "
                    "(id, run_id, source_record_id, excerpt_or_ref, method, scope, created_at) "
                    "VALUES ('evidence', 'run', 'source-record', 'Frozen note', 'manual_user_note', '{}', CURRENT_TIMESTAMP)"
                )
                connection.exec_driver_sql(
                    "UPDATE research_runs SET state='completed', finished_at=CURRENT_TIMESTAMP WHERE id='run'"
                )
        finally:
            engine.dispose()

        command.upgrade(self.config, "head")
        connection = sqlite3.connect(get_database_path())
        try:
            content_raw, checksum = connection.execute(
                "SELECT content, checksum_sha256 FROM research_run_manifests WHERE run_id='run'"
            ).fetchone()
        finally:
            connection.close()
        content = json.loads(content_raw)
        canonical = json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        self.assertEqual(content["plan"]["question"], "Frozen question")
        self.assertEqual([entry["id"] for entry in content["evidence"]], ["evidence"])
        self.assertEqual(checksum, hashlib.sha256(canonical.encode("utf-8")).hexdigest())

    def test_source_registry_defaults_to_disabled_manual_mode(self) -> None:
        command.upgrade(self.config, "head")
        engine = create_database_engine(get_database_path())
        try:
            with engine.begin() as connection:
                connection.exec_driver_sql(
                    "INSERT INTO source_registry (id, name, source_type, created_at) "
                    "VALUES ('source', 'Manual source', 'reference', CURRENT_TIMESTAMP)"
                )
                row = connection.exec_driver_sql(
                    "SELECT license_status, collection_mode, enabled FROM source_registry WHERE id='source'"
                ).one()
                self.assertEqual(row, ("unknown", "manual", 0))
                with self.assertRaises(IntegrityError):
                    connection.exec_driver_sql(
                        "INSERT INTO source_registry "
                        "(id, name, source_type, license_status, collection_mode, enabled, created_at) "
                        "VALUES ('blocked-auto', 'Unreviewed source', 'web', 'unknown', 'manual', 1, CURRENT_TIMESTAMP)"
                    )
        finally:
            engine.dispose()

    def test_app_listing_registry_enforces_platform_geo_and_store_identity(self) -> None:
        command.upgrade(self.config, "head")
        engine = create_database_engine(get_database_path())
        try:
            with engine.begin() as connection:
                with self.assertRaises(IntegrityError):
                    connection.exec_driver_sql(
                        "INSERT INTO app_store_listings "
                        "(id, platform, store_app_id, country, title, developer, created_at) "
                        "VALUES ('bad-platform', 'windows', 'app', 'US', 'Title', 'Dev', CURRENT_TIMESTAMP)"
                    )
                with self.assertRaises(IntegrityError):
                    connection.exec_driver_sql(
                        "INSERT INTO app_store_listings "
                        "(id, platform, store_app_id, country, title, developer, created_at) "
                        "VALUES ('bad-country', 'ios', '123', 'USA', 'Title', 'Dev', CURRENT_TIMESTAMP)"
                    )
                connection.exec_driver_sql(
                    "INSERT INTO app_store_listings "
                    "(id, platform, store_app_id, country, title, developer, created_at) "
                    "VALUES ('listing-1', 'ios', '123', 'US', 'Title', 'Dev', CURRENT_TIMESTAMP)"
                )
                with self.assertRaises(IntegrityError):
                    connection.exec_driver_sql(
                        "INSERT INTO app_store_listings "
                        "(id, platform, store_app_id, country, title, developer, created_at) "
                        "VALUES ('listing-2', 'ios', '123', 'US', 'Duplicate', 'Dev', CURRENT_TIMESTAMP)"
                    )
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
