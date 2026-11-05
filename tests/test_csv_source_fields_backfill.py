import unittest

from backend.app.reports import _with_source_fields_from_csv


CSV_TEXT = (
    "Unified Name;Publisher Name;Release Date (WW);Downloads (Absolute)\n"
    "Alpha;Learnings;25/04/2026;120\n"
    "Beta;;;80\n"
)


class SourceFieldsBackfillTest(unittest.TestCase):
    def test_fills_publisher_and_release_date_from_saved_csv_without_rewriting_missing_values(self) -> None:
        observations = [
            {"source_row_number": 2, "source_publisher_name": None, "source_release_date": None},
            {"source_row_number": 3, "source_publisher_name": None, "source_release_date": None},
        ]
        filled = _with_source_fields_from_csv(observations, CSV_TEXT)
        self.assertEqual(filled[0]["source_publisher_name"], "Learnings")
        self.assertEqual(filled[0]["source_release_date"], "25/04/2026")
        # The CSV cell is empty: nothing is invented.
        self.assertIsNone(filled[1]["source_publisher_name"])
        self.assertIsNone(filled[1]["source_release_date"])
        # The input observations are not mutated (read-only derivation).
        self.assertIsNone(observations[0]["source_publisher_name"])

    def test_keeps_stored_values_and_handles_missing_csv(self) -> None:
        observations = [{"source_row_number": 2, "source_publisher_name": "Stored", "source_release_date": "2026-01-01"}]
        self.assertEqual(_with_source_fields_from_csv(observations, CSV_TEXT)[0]["source_publisher_name"], "Stored")
        self.assertEqual(_with_source_fields_from_csv(observations, "")[0]["source_publisher_name"], "Stored")


if __name__ == "__main__":
    unittest.main()
