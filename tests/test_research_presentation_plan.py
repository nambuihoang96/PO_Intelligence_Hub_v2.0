"""Contract regression for optional ChatGPT presentation hints.

The plan is only a preference. It must refer to genuine records in the same
research payload and may never smuggle arbitrary chart data through the schema.
"""

import unittest

from pydantic import ValidationError

from backend.app.research_data import POResearchPayload


def payload(plan=None):
    data = {
        "executive_summary": "Owner-supplied qualitative finding.",
        "findings": [{
            "key": "finding-a",
            "finding_type": "observation",
            "title": "QA research observation",
            "description": "A supplied observation, not an independent verification.",
        }],
        "evidence_references": [{
            "url": "https://example.com/source",
            "title": "Source reference",
            "verified": False,
        }],
        "quantitative_observations": [{
            "metric_id": "unknown_measurement",
            "metric_definition": "Source-reported value",
            "value": 19.2,
            "unit": "USD/1000 impressions",
            "entity_name": "Sample",
            "source_reference": "https://example.com/source",
            "evidence_reference": "https://example.com/source",
            "provenance_type": "research_report",
            "observation_type": "reported",
        }],
    }
    if plan is not None:
        data["presentation_plan"] = plan
    return {"schema_version": "po_research_v1", "research_data": data}


class PresentationContractTest(unittest.TestCase):
    def test_old_reports_remain_valid_without_presentation_plan(self):
        validated = POResearchPayload.model_validate(payload())
        self.assertIsNone(validated.research_data.presentation_plan)

    def test_plan_round_trip_keeps_only_references(self):
        plan = {
            "version": "presentation_v1",
            "headline": "Review the reported measurement",
            "highlighted_finding_keys": ["finding-a"],
            "featured_observation_indexes": [0],
            "chart_observation_indexes": [0],
        }
        validated = POResearchPayload.model_validate(payload(plan))
        saved = validated.model_dump(mode="json")
        reloaded = POResearchPayload.model_validate(saved)
        self.assertEqual(reloaded.research_data.presentation_plan.featured_observation_indexes, [0])
        self.assertEqual(reloaded.research_data.presentation_plan.highlighted_finding_keys, ["finding-a"])
        self.assertNotIn("chart_data", saved["research_data"]["presentation_plan"])

    def test_rejects_unknown_finding_and_out_of_range_metric_index(self):
        base = {
            "version": "presentation_v1",
            "headline": "A headline",
            "highlighted_finding_keys": ["missing"],
            "featured_observation_indexes": [0],
            "chart_observation_indexes": [],
        }
        with self.assertRaises(ValidationError):
            POResearchPayload.model_validate(payload(base))
        base["highlighted_finding_keys"] = ["finding-a"]
        base["chart_observation_indexes"] = [1]
        with self.assertRaises(ValidationError):
            POResearchPayload.model_validate(payload(base))
        base["chart_observation_indexes"] = [-1]
        with self.assertRaises(ValidationError):
            POResearchPayload.model_validate(payload(base))

    def test_rejects_invented_visualization_values_and_duplicates(self):
        bad = {
            "version": "presentation_v1",
            "headline": None,
            "highlighted_finding_keys": [],
            "featured_observation_indexes": [0, 0],
            "chart_observation_indexes": [0],
            "invented_kpi": 99999,
        }
        with self.assertRaises(ValidationError):
            POResearchPayload.model_validate(payload(bad))
        del bad["invented_kpi"]
        with self.assertRaises(ValidationError):
            POResearchPayload.model_validate(payload(bad))


if __name__ == "__main__":
    unittest.main()
