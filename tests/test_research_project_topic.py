"""Research projects can carry an optional topic; projects without one keep working."""
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from backend.app.db import get_database_path
from backend.app.main import create_app


class ProjectTopicTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(__file__).resolve().parents[1]
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"APP_DATA_ROOT": str(Path(self.temp_dir.name) / "application data")})
        self.env.start()
        self.config = Config(str(self.root / "alembic.ini"))
        command.upgrade(self.config, "head")
        self.client_context = TestClient(create_app())
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        self.env.stop()
        self.temp_dir.cleanup()

    def test_topic_is_optional_and_round_trips_through_create_read_and_update(self) -> None:
        with_topic = self.client.post("/api/v1/projects", json={"name": "Puzzle", "topic": "  Game puzzle tăng lượt tải  "})
        self.assertEqual(with_topic.status_code, 201, with_topic.text)
        self.assertEqual(with_topic.json()["topic"], "Game puzzle tăng lượt tải")

        without_topic = self.client.post("/api/v1/projects", json={"name": "Cũ không có chủ đề"})
        self.assertEqual(without_topic.status_code, 201, without_topic.text)
        self.assertIsNone(without_topic.json()["topic"])

        project_id = without_topic.json()["id"]
        updated = self.client.patch(f"/api/v1/projects/{project_id}", json={"topic": "Chủ đề bổ sung sau"})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(self.client.get(f"/api/v1/projects/{project_id}").json()["topic"], "Chủ đề bổ sung sau")

        cleared = self.client.patch(f"/api/v1/projects/{project_id}", json={"topic": "   "})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["topic"])

    def test_topic_length_is_limited(self) -> None:
        response = self.client.post("/api/v1/projects", json={"name": "Dài quá", "topic": "x" * 301})
        self.assertEqual(response.status_code, 422)

    def test_topic_migration_is_additive_and_reversible(self) -> None:
        command.downgrade(self.config, "20261103_0017")
        connection = sqlite3.connect(get_database_path())
        try:
            columns = {row[1] for row in connection.execute("PRAGMA table_info(research_projects)")}
        finally:
            connection.close()
        self.assertNotIn("topic", columns)
        command.upgrade(self.config, "head")
        connection = sqlite3.connect(get_database_path())
        try:
            columns = {row[1]: row for row in connection.execute("PRAGMA table_info(research_projects)")}
        finally:
            connection.close()
        self.assertIn("topic", columns)
        self.assertEqual(columns["topic"][2].upper(), "VARCHAR(300)")
        self.assertEqual(columns["topic"][3], 0, "topic must be nullable so existing projects stay valid")


if __name__ == "__main__":
    unittest.main()
