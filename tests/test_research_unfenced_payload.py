import unittest

from backend.app.research_data import _structured_candidate


PAYLOAD = '{"schema_version": "po_research_v1", "research_data": {"executive_summary": "A {b}"}}'


class UnfencedPayloadTests(unittest.TestCase):
    def test_recovers_payload_when_chat_copy_dropped_the_fences(self):
        content = f"# Báo cáo\n\nNội dung.\n\nPO_RESEARCH_V1\njson\n{PAYLOAD}\n\nHết."
        candidate, kind, prose = _structured_candidate(content, None)
        self.assertEqual(candidate, PAYLOAD)
        self.assertEqual(kind, "inline_json")
        self.assertIn("Nội dung.", prose)
        self.assertNotIn("schema_version", prose)

    def test_plain_text_without_the_contract_stays_text(self):
        content = 'Báo cáo có {ngoặc} và "schema_version" nhưng không có hợp đồng.'
        self.assertEqual(_structured_candidate(content, None), (None, "text", content))

    def test_broken_unfenced_payload_is_reported_not_saved_as_text(self):
        content = 'Nội dung\n{"schema_version": "po_research_v1", "research_data": {'
        candidate, kind, _ = _structured_candidate(content, None)
        self.assertTrue(candidate.startswith('{"schema_version"'))
        self.assertEqual(kind, "inline_json")

    def test_fenced_payload_still_takes_priority(self):
        content = f"Nội dung\nPO_RESEARCH_V1\n```json\n{PAYLOAD}\n```"
        candidate, kind, _ = _structured_candidate(content, None)
        self.assertEqual(candidate, PAYLOAD)
        self.assertEqual(kind, "inline_json")


if __name__ == "__main__":
    unittest.main()
