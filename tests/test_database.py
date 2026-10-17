import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from backend.app.db import create_database_engine, get_database_path


CORE_TABLES = {"research_projects", "research_plans", "research_runs", "source_registry", "source_records", "evidence"}


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


if __name__ == "__main__":
    unittest.main()
