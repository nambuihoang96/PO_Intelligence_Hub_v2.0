import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import NAMESPACE_URL, uuid5

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from backend.app.db import create_database_engine, get_database_path
from backend.app.main import create_app
from backend.app.models import AppStoreListing


def app_listing_fixture(count: int = 250) -> list[AppStoreListing]:
    listings = []
    countries = ("US", "JP", "GB")
    for index in range(count):
        platform = "ios" if index % 2 == 0 else "android"
        country = countries[(index // 2) % len(countries)]
        listings.append(
            AppStoreListing(
                id=str(uuid5(NAMESPACE_URL, f"poih-v2-test-listing-{index}")),
                platform=platform,
                store_app_id=str(910000000000 + index) if platform == "ios" else f"com.sample.app{index:03d}",
                country=country,
                title="Shared Sample App" if index < 2 else f"Sample App {index:03d}",
                developer=f"Sample Publisher {index % 10:02d}",
                listing_url=f"https://example.invalid/apps/{index}",
                created_at=datetime.now(timezone.utc),
            )
        )
    return listings


class AppListingsAPITest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_root = Path(self.temp_dir.name) / "app listing data"
        self.env = patch.dict(os.environ, {"APP_DATA_ROOT": str(self.data_root)})
        self.env.start()
        workspace = Path(__file__).resolve().parents[1]
        command.upgrade(Config(str(workspace / "alembic.ini")), "head")
        self.client_context = TestClient(create_app())
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        self.env.stop()
        self.temp_dir.cleanup()

    def add_fixture_listings(self) -> list[AppStoreListing]:
        listings = app_listing_fixture()
        engine = create_database_engine(get_database_path())
        try:
            with engine.begin() as connection:
                connection.execute(AppStoreListing.__table__.insert(), [
                    {
                        "id": listing.id,
                        "platform": listing.platform,
                        "store_app_id": listing.store_app_id,
                        "country": listing.country,
                        "title": listing.title,
                        "developer": listing.developer,
                        "listing_url": listing.listing_url,
                        "created_at": listing.created_at,
                    }
                    for listing in listings
                ])
        finally:
            engine.dispose()
        return listings

    def test_250_fixture_listings_are_reachable_across_cursor_pages(self) -> None:
        self.add_fixture_listings()
        cursor = None
        ids: list[str] = []
        page_sizes: list[int] = []
        while True:
            params = {"limit": 73}
            if cursor:
                params["cursor"] = cursor
            response = self.client.get("/api/v1/apps", params=params)
            self.assertEqual(response.status_code, 200, response.text)
            page = response.json()
            page_sizes.append(len(page["items"]))
            ids.extend(item["id"] for item in page["items"])
            cursor = page["next_cursor"]
            if cursor is None:
                break
        self.assertEqual(page_sizes, [73, 73, 73, 31])
        self.assertEqual(len(ids), 250)
        self.assertEqual(len(set(ids)), 250)

    def test_platform_geo_keyword_filters_keep_listing_scope_and_safe_separation(self) -> None:
        self.add_fixture_listings()
        ios_jp = self.client.get("/api/v1/apps", params={"platform": "ios", "geo": "jp", "limit": 100})
        self.assertEqual(ios_jp.status_code, 200, ios_jp.text)
        self.assertTrue(ios_jp.json()["items"])
        self.assertTrue(all(item["platform"] == "ios" and item["country"] == "JP" for item in ios_jp.json()["items"]))

        shared_title = self.client.get("/api/v1/apps", params={"keyword": "Shared Sample App"})
        self.assertEqual(shared_title.status_code, 200, shared_title.text)
        items = shared_title.json()["items"]
        self.assertEqual({item["platform"] for item in items}, {"ios", "android"})
        self.assertEqual(len({item["id"] for item in items}), 2)
        self.assertEqual(len({item["store_app_id"] for item in items}), 2)

    def test_manual_listing_create_duplicate_detail_and_validation(self) -> None:
        payload = {
            "platform": "ios",
            "store_app_id": "1234567890",
            "country": "us",
            "title": "  User supplied app  ",
            "developer": "  User supplied publisher  ",
            "listing_url": "https://example.com/app/1234567890",
        }
        created = self.client.post("/api/v1/apps", json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        listing = created.json()
        self.assertEqual(listing["country"], "US")
        self.assertEqual(listing["title"], "User supplied app")
        self.assertEqual(listing["developer"], "User supplied publisher")
        self.assertEqual(self.client.get(f"/api/v1/apps/{listing['id']}").json(), listing)
        self.assertEqual(self.client.get("/api/v1/apps/missing").status_code, 404)
        duplicate = self.client.post("/api/v1/apps", json=payload)
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()["error"]["code"], "APP_LISTING_EXISTS")

        invalid_payloads = [
            {**payload, "store_app_id": "com.fake.ios"},
            {**payload, "platform": "android", "store_app_id": "not-a-package"},
            {**payload, "country": "USA"},
            {**payload, "listing_url": "file:///private/path"},
        ]
        for invalid in invalid_payloads:
            with self.subTest(invalid=invalid):
                self.assertEqual(self.client.post("/api/v1/apps", json=invalid).status_code, 422)

    def test_invalid_filters_cursor_and_openapi_contract(self) -> None:
        self.assertEqual(self.client.get("/api/v1/apps", params={"platform": "windows"}).status_code, 422)
        self.assertEqual(self.client.get("/api/v1/apps", params={"geo": "USA"}).status_code, 422)
        invalid_cursor = self.client.get("/api/v1/apps", params={"cursor": "not-a-uuid"})
        self.assertEqual(invalid_cursor.status_code, 422)
        self.assertEqual(invalid_cursor.json()["error"]["code"], "INVALID_CURSOR")

        spec = self.client.get("/openapi.json").json()
        self.assertIn("/api/v1/apps", spec["paths"])
        self.assertIn("/api/v1/apps/{listing_id}", spec["paths"])
        self.assertIn("AppListingCreate", spec["components"]["schemas"])
        self.assertIn("AppListingRead", spec["components"]["schemas"])


if __name__ == "__main__":
    unittest.main()
