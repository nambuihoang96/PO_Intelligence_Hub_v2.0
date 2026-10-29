import { describe, expect, it } from 'vitest';
import type { QuantitativeObservation, ResearchData } from './api';
import { formatAutoValue, selectAutoPresentation } from './autoPresentation';

function row(overrides: Partial<QuantitativeObservation> = {}): QuantitativeObservation {
  return {
    metric_id: 'generic_metric',
    metric_definition: 'Source-reported outcome for the same format',
    value: 10,
    unit: 'USD/1000 impressions',
    entity_id: 'format-rewarded',
    entity_name: 'Rewarded',
    geo: 'US',
    platform: 'Android',
    period_start: '2026-10-19',
    period_end: '2026-10-25',
    granularity: 'week',
    methodology: 'Same provider estimate and calculation method',
    source_reference: 'https://example.com/provider-report',
    evidence_reference: 'https://example.com/provider-report',
    verification_status: 'unverified',
    provenance_type: 'research_report',
    provenance_id: 'qa-report',
    observation_type: 'reported',
    scope_compatible: true,
    complete_observation: true,
    comparison_ready: true,
    validation_reasons: [],
    ...overrides,
  };
}

function research(observations: QuantitativeObservation[], plan?: ResearchData['presentation_plan']): ResearchData {
  return {
    sections: [], entities: [], findings: [], evidence_references: [], benchmark_dimensions: [],
    research_gaps: [], po_recommendations: [], quantitative_observations: observations, presentation_plan: plan,
  };
}

describe('Auto-adaptive report presentation', () => {
  it('never creates KPI or chart when no measurements are supplied', () => {
    const result = selectAutoPresentation(research([]));
    expect(result.mode).toBe('qualitative');
    expect(result.featuredIndexes).toEqual([]);
    expect(result.chartIndexes).toEqual([]);
  });

  it('compares the same measurement across GEO without special-casing its name', () => {
    const rows = [
      row({ geo: 'US', value: 19.2 }), row({ geo: 'JP', value: 13.1 }), row({ geo: 'VN', value: 2.7 }),
      row({ geo: 'US', entity_id: 'format-banner', entity_name: 'Banner', value: 0.4 }),
      row({ geo: 'JP', metric_id: 'show_rate', metric_definition: 'Show rate', unit: '%', value: 70 }),
    ];
    const result = selectAutoPresentation(research(rows));
    expect(result.mode).toBe('visual');
    expect(result.view?.kind).toBe('scope_comparison');
    expect(result.view?.dimension).toBe('geo');
    expect(result.chartIndexes).toEqual([1, 0, 2]); // GEO labels ordered alphabetically
    expect(result.featuredIndexes).toHaveLength(3);
    expect(result.otherIndexes).toEqual([3, 4]);
  });

  it('does not compare GEOs when the measurement source is different', () => {
    const rows = [
      row({ geo: 'US' }),
      row({ geo: 'JP', source_reference: 'https://example.com/another-source' }),
    ];
    const result = selectAutoPresentation(research(rows));
    expect(result.view).toBeNull();
    expect(result.mode).toBe('visual');
    expect(result.featuredIndexes).toHaveLength(2);
  });

  it('keeps unrelated cohort metrics as KPI cards rather than a fake trend', () => {
    const rows = [row({ metric_id: 'd1', metric_definition: 'D1 cohort retention', value: 38, unit: '%' }),
      row({ metric_id: 'd7', metric_definition: 'D7 cohort retention', value: 14, unit: '%' }),
      row({ metric_id: 'd30', metric_definition: 'D30 cohort retention', value: 5, unit: '%' })];
    const result = selectAutoPresentation(research(rows));
    expect(result.view).toBeNull();
    expect(result.featuredIndexes).toEqual([0, 1, 2]);
  });

  it('uses only compatible suggested observations and falls back safely', () => {
    const rows = [row({ entity_id: 'a', value: 100 }), row({ entity_id: 'b', value: 80 }), row({ entity_id: 'c', value: 50 })];
    const valid = selectAutoPresentation(research(rows, {
      version: 'presentation_v1', featured_observation_indexes: [1],
      chart_observation_indexes: [0, 1, 2], highlighted_finding_keys: [],
    }));
    expect(valid.usedSuggestedChart).toBe(true);
    expect(valid.featuredIndexes).toEqual([1]);

    const invalid = selectAutoPresentation(research(rows, {
      version: 'presentation_v1', featured_observation_indexes: [1000],
      chart_observation_indexes: [1000], highlighted_finding_keys: [],
    }));
    expect(invalid.usedSuggestedChart).toBe(false);
    expect(invalid.featuredIndexes).toHaveLength(3);
  });

  it('keeps reported observations visible for review when provenance is incomplete', () => {
    const result = selectAutoPresentation(research([row({ source_reference: null, complete_observation: false, comparison_ready: false })]));
    expect(result.mode).toBe('needs_review');
    expect(result.chartIndexes).toEqual([]);
    expect(result.otherIndexes).toEqual([0]);
  });

  it('formats compact values without assuming the metric is revenue', () => {
    expect(formatAutoValue(row({ value: 4_900_000_000, unit: 'USD' }))).toContain('4,9 tỷ USD');
    expect(formatAutoValue(row({ value: 19.2 }))).toContain('USD/1000 impressions');
    expect(formatAutoValue(row({ value: 38, unit: '%' }))).toBe('38 %');
    expect(formatAutoValue(row({ value: 2_500_000, unit: 'downloads', value_precision: 'approximate' }))).toContain('≈2,5 triệu downloads');
  });
});
