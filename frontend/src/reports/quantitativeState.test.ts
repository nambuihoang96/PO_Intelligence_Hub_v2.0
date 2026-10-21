import { describe, expect, it } from 'vitest';
import { selectQuantitativeState } from './quantitativeState';
import type { QuantitativeDataset, QuantitativeObservation } from './api';

const observation = (type: QuantitativeObservation['observation_type']): QuantitativeObservation => ({
  metric_id: 'active_users', metric_definition: 'Active users', value: 10, unit: 'users',
  entity_id: 'product-a', geo: 'US', platform: 'web', period_start: '2026-01-01',
  period_end: '2026-01-31', granularity: 'month', source_reference: 'https://example.com',
  verification_status: 'unverified', provenance_type: type === 'imported' ? 'csv_dataset' : 'research_report',
  provenance_id: 'source-id', observation_type: type, validation_reasons: [],
});
const dataset: QuantitativeDataset = {
  id: 'dataset', report_id: 'report', filename: 'metrics.csv', content_sha256: 'hash',
  field_mapping: {}, entity_mappings: {}, observations: [observation('imported')],
  compatibility_status: 'compatible', validation_reasons: [], created_at: '2026-01-01T00:00:00Z', duplicate: false,
};

describe('selectQuantitativeState', () => {
  it('identifies no linked data as a normal qualitative state', () => expect(selectQuantitativeState().state).toBe('no_data'));
  it('distinguishes report-supplied observations from imported data', () => expect(selectQuantitativeState([observation('reported')]).state).toBe('research_supplied'));
  it('identifies report-linked CSV datasets', () => expect(selectQuantitativeState([], [dataset]).state).toBe('csv_linked'));
  it('identifies compatible mixed coverage', () => expect(selectQuantitativeState([observation('reported')], [dataset]).state).toBe('mixed_compatible'));
  it('surfaces partial or incompatible coverage without hiding reasons', () => {
    const partial = { ...dataset, compatibility_status: 'partial' as const, validation_reasons: ['Missing unit.'], observations: [{ ...observation('imported'), source_validation_reasons: ['Missing unit.'], analysis_ready: false }] };
    expect(selectQuantitativeState([], [partial])).toMatchObject({ state: 'partial_or_incompatible', reasons: ['Missing unit.'] });
  });
  it('keeps valid CSV scope usable while clearly separating it from report scope', () => {
    const worldwide = {
      ...observation('imported'), geo: 'Worldwide', platform: 'Unified', analysis_ready: true,
      source_validation_reasons: [], report_compatibility_reasons: ['GEO differs from report.', 'Platform differs from report.'],
      report_compatibility: 'incompatible' as const, scope_compatible: false,
    };
    const result = selectQuantitativeState([], [{ ...dataset, observations: [worldwide], compatibility_status: 'incompatible' }], { geo: 'US', platform: 'Android' });
    expect(result.state).toBe('report_scope_mismatch');
    expect(result.reasons.some((reason) => reason.includes('Worldwide / Unified analysis') && reason.includes('US / Android measurements'))).toBe(true);
  });
});
