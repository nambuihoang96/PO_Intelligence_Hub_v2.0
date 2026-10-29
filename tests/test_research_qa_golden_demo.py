from backend.app.research_data import UniversalResearchData
from scripts.seed_research_qa_demo import GOLDEN_REPORT_TITLE, GOLDEN_URLS, golden_report_content, golden_report_data


def test_golden_walkthrough_is_rich_explicitly_synthetic_and_traceable() -> None:
    content = golden_report_content()
    data = UniversalResearchData.model_validate(golden_report_data())
    lines = content.splitlines()

    assert GOLDEN_REPORT_TITLE in content
    assert "QA DEMO — DỮ LIỆU MÔ PHỎNG" in content
    assert len(data.findings) == 5
    assert len(data.entities) == 4
    assert len(data.benchmark_dimensions) == 4
    assert data.quantitative_observations == []

    entity_keys = {entity.key for entity in data.entities}
    finding_keys = {finding.key for finding in data.findings}
    source_urls = {reference.url for reference in data.evidence_references}
    assert source_urls == set(GOLDEN_URLS)
    assert all(url.endswith(("/1", "/2", "/3", "/4", "/5")) for url in source_urls)
    assert all(reference.verified is False for reference in data.evidence_references)

    for reference in data.evidence_references:
        line_number = int(reference.source_location.removeprefix("line:"))
        assert reference.url in lines[line_number - 1]
        assert ".invalid/" in reference.url
    for finding in data.findings:
        assert set(finding.related_entities) <= entity_keys
        assert set(finding.evidence_references) <= source_urls
        assert finding.confidence is None
    for dimension in data.benchmark_dimensions:
        assert set(dimension.related_entities) <= entity_keys
        assert set(dimension.evidence_references) <= source_urls
        for observation in dimension.observations:
            assert observation.entity_key in entity_keys
            assert set(observation.evidence_references) <= source_urls
