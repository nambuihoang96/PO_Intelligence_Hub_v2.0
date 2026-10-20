import { describe, expect, it } from 'vitest';
import type { QuantitativeDataset, QuantitativeObservation } from './api';
import { buildAnalyticsSelection, emptyAnalyticsFilters, type AnalyticsFilters } from './analyticsSelection';

function row(overrides: Partial<QuantitativeObservation> = {}): QuantitativeObservation {
  return {
    metric_id: 'monthly_downloads', metric_definition: 'Monthly downloads reported by source', value: 100,
    unit: 'downloads', entity_id: 'app-a', entity_name: 'App A', geo: 'US', platform: 'Android',
    period_start: '2025-01-01', period_end: '2025-01-31', granularity: 'month', methodology: 'Store panel estimate',
    source_reference: 'https://example.test/source', evidence_reference: 'https://example.test/evidence',
    verification_status: 'unverified', provenance_type: 'research_report', provenance_id: 'report-1',
    observation_type: 'reported', validation_reasons: [], scope_compatible: true, complete_observation: true, comparison_ready: true,
    ...overrides,
  };
}

function dataset(observations: QuantitativeObservation[], overrides: Partial<QuantitativeDataset> = {}): QuantitativeDataset {
  return {
    id: 'dataset-1', report_id: 'report-1', filename: 'metrics.csv', content_sha256: 'hash', field_mapping: {}, entity_mappings: {},
    observations, compatibility_status: 'partial', validation_reasons: [], created_at: '2025-01-01', duplicate: false,
    imported_successfully: true, ...overrides,
  };
}

const filters = (values: Partial<AnalyticsFilters> = {}): AnalyticsFilters => ({ ...emptyAnalyticsFilters, ...values });

describe('report-scoped analytics selection contract', () => {
  it('supports report-supplied observations without requiring CSV', () => {
    const selection = buildAnalyticsSelection('report-1', [row()], []);
    expect(selection.sourceProvenance.report).toBe(1);
    expect(selection.sourceProvenance.csvDatasets).toBe(0);
    expect(selection.selectedObservations[0].sourceLabel).toContain('ChatGPT research');
    expect(selection.selectedObservations[0].observation.value).toBe(100);
  });

  it('supports CSV-only observations and keeps imported separate from verified', () => {
    const selection = buildAnalyticsSelection('report-1', [], [dataset([row({ observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1' })])]);
    expect(selection.sourceProvenance.report).toBe(0);
    expect(selection.sourceProvenance.csvDatasets).toBe(1);
    expect(selection.selectedObservations[0].sourceLabel).toContain('not automatically verified');
    expect(selection.selectedObservations[0].observation.verification_status).toBe('unverified');
  });

  it('keeps research and CSV provenance in one report-scoped selection', () => {
    const csv = row({ observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1', entity_id: 'app-b', entity_name: 'App B' });
    const selection = buildAnalyticsSelection('report-1', [row()], [dataset([csv])]);
    expect(selection.selectedObservations.map(({ source }) => source)).toEqual(['research_report', 'csv_dataset']);
    expect(selection.compatibleComparisonGroups).toHaveLength(1);
    expect(selection.compatibleComparisonGroups[0].observations).toHaveLength(2);
    expect(selection.chartEligibility.eligible).toBe(true);
  });

  it('keeps the readable report entity name when linked CSV rows contain only IDs', () => {
    const imported = row({ observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1', entity_name: null });
    const selection = buildAnalyticsSelection('report-1', [row()], [dataset([imported])]);
    expect(selection.availableDimensions.entities).toContainEqual({ key: 'app-a', label: 'App A' });
  });

  it('retains every entity and period in compatible groups without filling missing observations', () => {
    const observations = ['a', 'b', 'c'].flatMap((entity, entityIndex) => [
      row({ entity_id: entity, entity_name: `Entity ${entityIndex}`, period_start: '2025-01-01', period_end: '2025-01-31', value: 10 + entityIndex }),
      row({ entity_id: entity, entity_name: `Entity ${entityIndex}`, period_start: '2025-03-01', period_end: '2025-03-31', value: 8 + entityIndex }),
    ]);
    const selection = buildAnalyticsSelection('report-1', observations);
    expect(selection.compatibleComparisonGroups.filter((group) => group.entities.length === 3 && group.periods.length === 1)).toHaveLength(2);
    expect(selection.compatibleComparisonGroups.filter((group) => group.entities.length === 1 && group.periods.length === 2)).toHaveLength(3);
    expect(new Set(selection.compatibleComparisonGroups.flatMap((group) => group.observations.map(({ key }) => key))).size).toBe(6);
  });

  it('keeps irregular periods for one entity in a temporal group without deriving missing values', () => {
    const selection = buildAnalyticsSelection('report-1', [
      row({ period_start: '2025-01-01', period_end: '2025-01-31' }),
      row({ period_start: '2025-03-01', period_end: '2025-03-31', value: 80 }),
      row({ period_start: '2025-09-01', period_end: '2025-09-30', value: 60 }),
    ]);
    expect(selection.compatibleComparisonGroups).toHaveLength(1);
    expect(selection.compatibleComparisonGroups[0].periods).toHaveLength(3);
    expect(selection.compatibleComparisonGroups[0].observations).toHaveLength(3);
    expect(selection.compatibleComparisonGroups[0].observations.every(({ observation }) => observation.observation_type === 'reported')).toBe(true);
  });

  it('separates mixed GEO and platform observations', () => {
    const selection = buildAnalyticsSelection('report-1', [row(), row({ entity_id: 'app-b', geo: 'VN' }), row({ entity_id: 'app-c', platform: 'iOS' })]);
    expect(selection.availableDimensions.geos).toEqual(['US', 'VN']);
    expect(selection.availableDimensions.platforms).toEqual(['Android', 'iOS']);
    expect(selection.compatibleComparisonGroups).toHaveLength(0);
  });

  it('does not pair different entities when their periods do not overlap as the same observation window', () => {
    const selection = buildAnalyticsSelection('report-1', [
      row({ entity_id: 'app-a', period_start: '2025-01-01', period_end: '2025-01-31' }),
      row({ entity_id: 'app-b', period_start: '2025-02-01', period_end: '2025-02-28' }),
    ]);
    expect(selection.compatibleComparisonGroups).toHaveLength(0);
    expect(selection.excludedObservations).toHaveLength(2);
  });

  it('does not combine different metric definitions or methodologies', () => {
    const selection = buildAnalyticsSelection('report-1', [
      row(), row({ entity_id: 'app-b', metric_definition: 'Estimated monthly downloads' }),
      row({ entity_id: 'app-c', methodology: 'First-party aggregate' }),
    ]);
    expect(selection.compatibleComparisonGroups).toHaveLength(0);
    expect(selection.excludedObservations).toHaveLength(3);
  });

  it('keeps missing values and incomplete observations visible with exclusion reasons', () => {
    const selection = buildAnalyticsSelection('report-1', [row({ value: null, complete_observation: false, comparison_ready: false, validation_reasons: ['Missing exact numeric value.'] })]);
    expect(selection.selectedObservations).toHaveLength(1);
    expect(selection.readinessSummary.complete).toBe(0);
    expect(selection.excludedObservations[0].reasons).toContain('Missing exact numeric value.');
    expect(selection.chartEligibility.eligible).toBe(false);
  });

  it('flags duplicate observations across linked sources instead of counting them as ready', () => {
    const csvDuplicate = row({ observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1' });
    const selection = buildAnalyticsSelection('report-1', [row()], [dataset([csvDuplicate])]);
    expect(selection.readinessSummary.duplicates).toBe(2);
    expect(selection.compatibleComparisonGroups).toHaveLength(0);
    expect(selection.excludedObservations.every(({ reasons }) => reasons.some((reason) => /duplicate/i.test(reason)))).toBe(true);
  });

  it('distinguishes complete, scope-compatible and comparison-ready readiness states', () => {
    const selection = buildAnalyticsSelection('report-1', [
      row({ entity_id: 'unknown-scope', scope_compatible: null }),
      row({ entity_id: 'scope-mismatch', scope_compatible: false }),
      row({ entity_id: 'no-methodology', methodology: null, comparison_ready: false }),
    ]);
    expect(selection.readinessSummary.total).toBe(3);
    expect(selection.readinessSummary.scopeCompatible).toBe(1);
    expect(selection.readinessSummary.comparisonReady).toBe(0);
    expect(selection.excludedObservations).toHaveLength(3);
  });

  it('derives filter dimensions from actual observations and filters and resets them', () => {
    const observations = [row(), row({ entity_id: 'app-b', entity_name: 'App B', geo: 'VN', platform: 'iOS' })];
    const filtered = buildAnalyticsSelection('report-1', observations, [], filters({ geo: 'VN', platform: 'iOS' }));
    expect(filtered.selectedObservations).toHaveLength(1);
    expect(filtered.selectedObservations[0].observation.entity_name).toBe('App B');
    expect(filtered.selectedFilters.geo).toBe('VN');
    const reset = buildAnalyticsSelection('report-1', observations, [], emptyAnalyticsFilters);
    expect(reset.selectedObservations).toHaveLength(2);
  });

  it('supports source and readiness filtering without losing original records', () => {
    const csv = row({ observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1', entity_id: 'app-b', validation_reasons: ['Missing period end.'], complete_observation: false, comparison_ready: false });
    const csvOnly = buildAnalyticsSelection('report-1', [row()], [dataset([csv])], filters({ source: 'csv_dataset' }));
    expect(csvOnly.selectedObservations).toHaveLength(1);
    expect(csvOnly.excludedObservations[0].record.observation.validation_reasons).toContain('Missing period end.');
    const excluded = buildAnalyticsSelection('report-1', [row()], [dataset([csv])], filters({ readiness: 'excluded' }));
    expect(excluded.selectedObservations).toHaveLength(2);
    expect(excluded.selectedObservations.some(({ observation }) => observation.entity_id === 'app-b')).toBe(true);
  });

  it('does not label a compatible comparison pair as excluded when that readiness filter is selected', () => {
    const selection = buildAnalyticsSelection('report-1', [row(), row({ entity_id: 'app-b', entity_name: 'App B' })], [], filters({ readiness: 'excluded' }));
    expect(selection.compatibleComparisonGroups).toHaveLength(1);
    expect(selection.selectedObservations).toHaveLength(0);
  });

  it('shows an explicit no-data contract for qualitative-only reports', () => {
    const selection = buildAnalyticsSelection('report-1', [], []);
    expect(selection.selectedObservations).toEqual([]);
    expect(selection.chartEligibility.eligible).toBe(false);
    expect(selection.availableDimensions.metrics).toEqual([]);
  });
});
