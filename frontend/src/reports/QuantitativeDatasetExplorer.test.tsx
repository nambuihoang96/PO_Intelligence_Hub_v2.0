// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuantitativeDatasetExplorer } from './QuantitativeDatasetExplorer';
import { reportApi, type QuantitativeDataset } from './api';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, reportApi: { ...original.reportApi, revalidateQuantitativeDataset: vi.fn() } };
});

const observation = (overrides: Record<string, unknown> = {}) => ({
  metric_id: 'downloads_absolute', metric_definition: 'Downloads (Absolute)', value: 1200, unit: 'downloads',
  entity_id: null, entity_name: null, source_entity_id: 'sensor_tower:st-1', source_entity_name: 'Game One',
  source_provider: 'sensor_tower', entity_resolution_state: 'source_only', geo: 'Worldwide', platform: 'Unified',
  period_start: '2026-10-01', period_end: '2026-10-30', granularity: 'rolling_period', methodology: null,
  source_reference: null, evidence_reference: null, verification_status: 'unverified', provenance_type: 'csv_dataset',
  provenance_id: 'dataset-1', observation_type: 'imported', validation_reasons: [], source_validation_reasons: [],
  report_compatibility_reasons: ['Platform Unified differs from report scope Android'], report_compatibility: 'incompatible',
  scope_compatible: false, complete_observation: true, display_ready: true, analysis_ready: true,
  dataset_comparison_ready: true, comparison_ready: false, ...overrides,
});

const dataset = {
  id: 'dataset-1', report_id: 'report-1', filename: 'sensor.csv', content_sha256: 'hash', field_mapping: {},
  entity_mappings: {}, observations: [observation(), observation({
    metric_id: 'downloads_yoy_growth_percent', metric_definition: 'Downloads (YoY Growth %)', value: 12.5, unit: '%',
    source_entity_id: 'sensor_tower:st-1',
  }), observation({
    source_entity_id: 'sensor_tower:st-2', source_entity_name: 'Game Two', value: 800,
    metric_id: 'downloads_absolute', metric_definition: 'Downloads (Absolute)',
  })],
  compatibility_status: 'incompatible', validation_reasons: [], created_at: '2026-01-01', duplicate: false,
  source_rows: 2, source_apps: 2, recognized_metrics: 2, display_ready_observations: 3,
  analysis_ready_observations: 3, report_compatible_observations: 0, incomplete_observations: 0,
  dataset_comparison_ready_observations: 2,
} as unknown as QuantitativeDataset;

describe('QuantitativeDatasetExplorer', () => {
  afterEach(() => cleanup());

  it('explores source-only apps, searches IDs, sorts metrics, and exposes observation provenance', () => {
    render(<QuantitativeDatasetExplorer dataset={dataset} reportScope={{ geo: 'US', platform: 'Android' }} onRevalidated={vi.fn()} />);
    expect(screen.getByText(/CSV data remains available for Worldwide \/ Unified analysis\. It cannot be used directly as US \/ Android measurements\./)).toBeTruthy();
    const comparisonCandidates = screen.getByText('Comparison candidates · need compatible peers');
    expect(comparisonCandidates.previousElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Game One')).toBeTruthy();
    expect(screen.getByText('Game Two')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search app or source ID'), { target: { value: 'st-2' } });
    expect(screen.getByText('Game Two')).toBeTruthy();
    expect(screen.queryByText('Game One')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search app or source ID'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Inspect Game One, Downloads \(Absolute\)/ }));
    expect(screen.getByText('sensor_tower · sensor_tower:st-1')).toBeTruthy();
    expect(screen.getByText('Ready for dataset analysis · Unverified import')).toBeTruthy();
  });

  it('revalidates the saved dataset explicitly without changing its dataset identity', async () => {
    vi.mocked(reportApi.revalidateQuantitativeDataset).mockResolvedValue(dataset);
    const onRevalidated = vi.fn();
    render(<QuantitativeDatasetExplorer dataset={dataset} reportScope={{ geo: 'US', platform: 'Android' }} onRevalidated={onRevalidated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revalidate dataset' }));
    expect(await screen.findByText(/Dataset đã được kiểm tra lại từ CSV gốc/)).toBeTruthy();
    expect(reportApi.revalidateQuantitativeDataset).toHaveBeenCalledWith('report-1', 'dataset-1');
    expect(onRevalidated).toHaveBeenCalledWith(dataset);
  });
});
