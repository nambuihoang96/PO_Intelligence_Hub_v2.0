from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config

from backend.app.config import WORKSPACE_ROOT
from backend.app.db import DATABASE_FILENAME


class ReportMigrationRegressionTest(unittest.TestCase):
    def test_lineage_and_origin_migrations_preserve_report_linked_csv_rows(self) -> None:
        scratch_root = WORKSPACE_ROOT / ".test-tmp"
        scratch_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="po-hub-report-migration-", dir=scratch_root) as data_root:
            config = Config(str(WORKSPACE_ROOT / "alembic.ini"))
            with patch.dict(os.environ, {"APP_DATA_ROOT": data_root}):
                command.upgrade(config, "20261027_0015")
                database_path = Path(data_root) / DATABASE_FILENAME
                connection = sqlite3.connect(database_path)
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute(
                    "INSERT INTO imported_research_reports "
                    "(id, question, geo, os, content, content_sha256, imported_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    ("report-1", "QA migration", "US", "iOS", "fixture report", "a" * 64, "2026-11-03T10:00:00"),
                )
                connection.execute(
                    "INSERT INTO quantitative_datasets "
                    "(id, report_id, filename, content_sha256, original_csv, field_mapping_json, "
                    "entity_mappings_json, observations_json, compatibility_status, validation_reasons_json, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        "dataset-1", "report-1", "qa.csv", "b" * 64, "fixture csv", "{}", "{}", "[]",
                        "compatible", "[]", "2026-11-03T10:00:00",
                    ),
                )
                # Reproduce the empty temporary table left by the pre-fix batch
                # migration after its attempted DROP failed against FK rows.
                connection.execute(
                    "CREATE TABLE _alembic_tmp_imported_research_reports (id TEXT PRIMARY KEY)"
                )
                connection.commit()
                connection.close()

                command.upgrade(config, "head")

                connection = sqlite3.connect(database_path)
                connection.execute("PRAGMA foreign_keys=ON")
                self.assertEqual(
                    connection.execute("SELECT version_num FROM alembic_version").fetchone()[0],
                    "20261105_0020",
                )
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM imported_research_reports").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM quantitative_datasets").fetchone()[0], 1)
                self.assertEqual(
                    connection.execute("SELECT content_sha256 FROM imported_research_reports WHERE id='report-1'").fetchone()[0],
                    "a" * 64,
                )
                self.assertEqual(
                    connection.execute("SELECT original_csv FROM quantitative_datasets WHERE id='dataset-1'").fetchone()[0],
                    "fixture csv",
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT COUNT(*) FROM sqlite_master "
                        "WHERE type='table' AND name='_alembic_tmp_imported_research_reports'"
                    ).fetchone()[0],
                    0,
                )
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
                connection.execute(
                    "INSERT INTO imported_research_reports "
                    "(id, previous_report_id, question, geo, os, content, content_sha256, origin, imported_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        "report-2", "report-1", "Codex QA", "US", "iOS", "codex fixture", "c" * 64,
                        "codex_cli_research", "2026-11-03T11:00:00",
                    ),
                )
                connection.commit()
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
                connection.close()


if __name__ == "__main__":
    unittest.main()
