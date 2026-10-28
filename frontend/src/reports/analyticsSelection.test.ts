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
    expect(selection.selectedObservations[0].sourceLabel).toContain('Nghiên cứu ChatGPT');
    expect(selection.selectedObservations[0].observation.value).toBe(100);
  });

  it('supports CSV-only observations and keeps imported separate from verified', () => {
    const selection = buildAnalyticsSelection('report-1', [], [dataset([row({ observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1' })])]);
    expect(selection.sourceProvenance.report).toBe(0);
    expect(selection.sourceProvenance.csvDatasets).toBe(1);
    expect(selection.selectedObservations[0].sourceLabel).toContain('chưa tự động xác minh');
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
    expect(selection.availableDimensions.entities).toContainEqual({ key: 'report:app-a', label: 'App A' });
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
    expect(selection.readinessSummary.incomplete).toBe(1);
    expect(selection.excludedObservations[0].reasons).toContain('Missing exact numeric value.');
    expect(selection.chartEligibility.eligible).toBe(false);
  });

  it('does not treat a report entity and a distinct CSV provider identity as a duplicate', () => {
    const csvObservation = row({ observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1', source_entity_id: 'sensor_tower:st-88', source_entity_name: 'App A', source_provider: 'sensor_tower', entity_resolution_state: 'matched' });
    const selection = buildAnalyticsSelection('report-1', [row()], [dataset([csvObservation])]);
    expect(selection.readinessSummary.duplicates).toBe(0);
    expect(selection.selectedObservations).toHaveLength(2);
    expect(selection.selectedObservations[1].sourceEntityIdentity).toBe('source:sensor_tower:st-88');
  });

  it('keeps a 100-app CSV selectable by stable source identity, including 90 source-only apps', () => {
    const apps = Array.from({ length: 100 }, (_, index) => row({
      entity_id: index < 10 ? `report-app-${index}` : null,
      entity_name: index < 10 ? `Report App ${index}` : null,
      source_entity_id: `sensor_tower:${index < 10 ? `matched-${index}` : `source-${index}`}`,
      source_entity_name: `App ${String(index).padStart(3, '0')}`,
      source_provider: 'sensor_tower',
      entity_resolution_state: index < 10 ? 'matched' : 'source_only',
      observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1',
      value: 500, geo: 'Worldwide', platform: 'Unified',
    }));
    const selection = buildAnalyticsSelection('report-1', [], [dataset(apps)]);
    expect(selection.availableDimensions.entities).toHaveLength(100);
    const sourceOnly = selection.availableDimensions.entities.find(({ label }) => label === 'App 099');
    expect(sourceOnly?.key).toBe('source:sensor_tower:source-99');
    const filtered = buildAnalyticsSelection('report-1', [], [dataset(apps)], filters({ entity: sourceOnly!.key }));
    expect(filtered.selectedObservations).toHaveLength(1);
    expect(filtered.selectedObservations[0].observation.source_entity_name).toBe('App 099');
  });

  it('does not false-deduplicate equal measurements belonging to different source IDs', () => {
    const appA = row({ entity_id: null, source_entity_id: 'provider:a', source_entity_name: 'Twin A', source_provider: 'provider', entity_resolution_state: 'source_only', observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1' });
    const appB = row({ entity_id: null, source_entity_id: 'provider:b', source_entity_name: 'Twin B', source_provider: 'provider', entity_resolution_state: 'source_only', observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1' });
    const selection = buildAnalyticsSelection('report-1', [], [dataset([appA, appB])]);
    expect(selection.readinessSummary.duplicates).toBe(0);
    expect(selection.availableDimensions.entities).toHaveLength(2);
  });

  it('flags repeated measurements for the same provider identity and retains both records', () => {
    const duplicate = row({ entity_id: null, source_entity_id: 'provider:a', source_entity_name: 'App A', source_provider: 'provider', entity_resolution_state: 'source_only', observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1' });
    const selection = buildAnalyticsSelection('report-1', [], [dataset([duplicate, { ...duplicate }])]);
    expect(selection.selectedObservations).toHaveLength(2);
    expect(selection.readinessSummary.duplicates).toBe(2);
    expect(selection.compatibleComparisonGroups).toHaveLength(0);
  });

  it('keeps a scope-mismatched CSV valid for its own analysis while excluding report comparison', () => {
    const worldwide = row({ entity_id: null, source_entity_id: 'sensor:app-1', source_entity_name: 'App 1', source_provider: 'sensor', entity_resolution_state: 'source_only', observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1', geo: 'Worldwide', platform: 'Unified', report_compatibility: 'incompatible', scope_compatible: false, analysis_ready: true, dataset_comparison_ready: true, comparison_ready: false });
    const peer = { ...worldwide, source_entity_id: 'sensor:app-2', source_entity_name: 'App 2' };
    const selection = buildAnalyticsSelection('report-1', [], [dataset([worldwide, peer])]);
    expect(selection.selectedObservations.every(({ sourceValid }) => sourceValid)).toBe(true);
    expect(selection.readinessSummary.reportCompatible).toBe(0);
    expect(selection.compatibleComparisonGroups).toHaveLength(1);
    const excluded = buildAnalyticsSelection('report-1', [], [dataset([worldwide, peer])], filters({ readiness: 'excluded' }));
    expect(excluded.selectedObservations).toHaveLength(2);
    expect(excluded.compatibleComparisonGroups).toHaveLength(0);
    const scopeMismatch = buildAnalyticsSelection('report-1', [], [dataset([worldwide, peer])], filters({ readiness: 'scope_mismatch' }));
    expect(scopeMismatch.selectedObservations.every(({ sourceValid }) => sourceValid)).toBe(true);
    expect(scopeMismatch.selectedObservations).toHaveLength(2);
    expect(scopeMismatch.compatibleComparisonGroups).toHaveLength(1);
    expect(buildAnalyticsSelection('report-1', [], [dataset([worldwide, peer])], filters({ readiness: 'needs_review' })).selectedObservations).toHaveLength(0);
  });

  it('keeps a valid measurement without peers out of Needs review and exposes it as standalone', () => {
    const standalone = row({ methodology: null, comparison_ready: false });
    const needsPeer = buildAnalyticsSelection('report-1', [standalone], [], filters({ readiness: 'no_comparison_partner' }));
    expect(needsPeer.selectedObservations).toHaveLength(1);
    expect(needsPeer.selectedObservations[0].sourceValid).toBe(true);
    expect(needsPeer.selectedObservations[0].comparisonGroupReady).toBe(false);
    expect(buildAnalyticsSelection('report-1', [standalone], [], filters({ readiness: 'needs_review' })).selectedObservations).toHaveLength(0);
  });

  it('keeps explicit date windows displayable without inventing granularity', () => {
    const first = row({ entity_id: null, source_entity_id: 'p:a', source_entity_name: 'A', source_provider: 'p', entity_resolution_state: 'source_only', observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'dataset-1', granularity: null, analysis_ready: true, dataset_comparison_ready: true });
    const second = { ...first, source_entity_id: 'p:b', source_entity_name: 'B' };
    const selection = buildAnalyticsSelection('report-1', [], [dataset([first, second])]);
    expect(selection.selectedObservations).toHaveLength(2);
    expect(selection.selectedObservations.every(({ sourceValid }) => sourceValid)).toBe(true);
    expect(selection.compatibleComparisonGroups).toHaveLength(1);
    expect(selection.selectedObservations[0].observation.granularity).toBeNull();
  });

  it('matches exact windows when both granularity values are absent', () => {
    const a = row({ entity_id: 'a', entity_name: 'A', granularity: null });
    const b = row({ entity_id: 'b', entity_name: 'B', granularity: null });
    expect(buildAnalyticsSelection('report-1', [a, b]).compatibleComparisonGroups).toHaveLength(1);
  });

  it('does not compare an absent granularity with a known cadence', () => {
    const a = row({ entity_id: 'a', entity_name: 'A', granularity: null });
    const b = row({ entity_id: 'b', entity_name: 'B', granularity: 'month' });
    expect(buildAnalyticsSelection('report-1', [a, b]).compatibleComparisonGroups).toHaveLength(0);
  });

  it('does not compare matching windows with conflicting known granularities', () => {
    const a = row({ entity_id: 'a', entity_name: 'A', granularity: 'month' });
    const b = row({ entity_id: 'b', entity_name: 'B', granularity: 'rolling_period' });
    expect(buildAnalyticsSelection('report-1', [a, b]).compatibleComparisonGroups).toHaveLength(0);
  });

  it('keeps different windows separate across entities and rejects overlapping periods within an entity', () => {
    const different = buildAnalyticsSelection('report-1', [
      row({ entity_id: 'a', entity_name: 'A', period_start: '2025-01-01', period_end: '2025-01-31' }),
      row({ entity_id: 'b', entity_name: 'B', period_start: '2025-02-01', period_end: '2025-02-28' }),
    ]);
    expect(different.compatibleComparisonGroups).toHaveLength(0);
    const nonOverlappingForOneEntity = buildAnalyticsSelection('report-1', [
      row({ entity_id: 'a', entity_name: 'A', period_start: '2025-01-01', period_end: '2025-01-31' }),
      row({ entity_id: 'a', entity_name: 'A', period_start: '2025-02-01', period_end: '2025-02-28', value: 90 }),
    ]);
    expect(nonOverlappingForOneEntity.compatibleComparisonGroups).toHaveLength(1);
    expect(nonOverlappingForOneEntity.compatibleComparisonGroups[0].periods).toHaveLength(2);
    const overlapping = buildAnalyticsSelection('report-1', [
      row({ entity_id: 'a', entity_name: 'A', period_start: '2025-01-01', period_end: '2025-01-31' }),
      row({ entity_id: 'a', entity_name: 'A', period_start: '2025-01-15', period_end: '2025-02-15', value: 90 }),
    ]);
    expect(overlapping.compatibleComparisonGroups).toHaveLength(0);
  });

  it('distinguishes complete, scope-compatible and comparison-ready readiness states', () => {
    const selection = buildAnalyticsSelection('report-1', [
      row({ entity_id: 'unknown-scope', scope_compatible: null }),
      row({ entity_id: 'scope-mismatch', scope_compatible: false }),
      row({ entity_id: 'no-methodology', methodology: null, comparison_ready: false }),
    ]);
    expect(selection.readinessSummary.total).toBe(3);
    expect(selection.readinessSummary.reportCompatible).toBe(1);
    expect(selection.readinessSummary.comparisonCandidates).toBe(0);
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
    expect(selection.compatibleComparisonGroups).toHaveLength(0);
    expect(selection.selectedObservations).toHaveLength(0);
  });

  it('shows an explicit no-data contract for qualitative-only reports', () => {
    const selection = buildAnalyticsSelection('report-1', [], []);
    expect(selection.selectedObservations).toEqual([]);
    expect(selection.chartEligibility.eligible).toBe(false);
    expect(selection.availableDimensions.metrics).toEqual([]);
  });
});
