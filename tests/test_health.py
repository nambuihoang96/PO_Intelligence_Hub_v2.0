import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.config import WORKSPACE_ROOT, get_data_root
from backend.app.main import app


class HealthSmokeTest(unittest.TestCase):
    def test_health_returns_ok(self) -> None:
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_data_root_defaults_inside_workspace(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(get_data_root(), (WORKSPACE_ROOT / "data").resolve())

    def test_data_root_uses_configured_path(self) -> None:
        with patch.dict("os.environ", {"APP_DATA_ROOT": "D:/PO Hub local data"}):
            self.assertEqual(get_data_root(), Path("D:/PO Hub local data").resolve())


if __name__ == "__main__":
    unittest.main()
