// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuantitativePeriodComparison } from './QuantitativePeriodComparison';
import { reportApi, type ComparisonDataset, type QuantitativeComparisonPreview } from './api';

vi.mock('./QuantitativeDatasetImport', () => ({
  QuantitativeDatasetImport: () => <div data-testid="dataset-import">CSV importer</div>,
}));
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, reportApi: {
    ...actual.reportApi,
    listComparisonDatasets: vi.fn(), list: vi.fn(), get: vi.fn(), previewQuantitativeComparison: vi.fn(),
  } };
});

const metric = { key: 'metric-key-v1', metric_id: 'downloads', metric_definition: 'Downloads', unit: 'downloads', methodology: 'Sensor Tower export v1', observations: 2, usable_observations: 2, warnings: [] };
const metricIdentityKey = metric.key;
const period = (key: string, date: string) => ({ key, semantics: 'snapshot' as const, period_start: null, period_end: null, snapshot_date: date, snapshot_date_candidate: null, granularity: null, observations: 2, usable_observations: 2, metric_keys: [metricIdentityKey], geos: ['Worldwide'], platforms: ['Unified'], warnings: [] });
const dataset = (id: string, filename: string, date: string): ComparisonDataset => ({
  id, report_id: `report-${id}`, report_question: `${filename} report`, filename, content_sha256: `${id}-hash`, created_at: date,
  compatibility_status: 'incompatible', metrics: [metric], periods: [period(`${id}-period`, date)], geo_values: ['Worldwide'], platform_values: ['Unified'], source_apps: 3, warnings: [],
});
const baseline = dataset('old', 'October export', '2026-10-01');
const current = dataset('new', 'November export', '2026-11-01');
const source = (datasetId: string, filename: string, value: number) => ({
  value, value_precision: 'exact' as const, unit: 'downloads', geo: 'Worldwide', platform: 'Unified', period_start: null, period_end: null,
  snapshot_date: datasetId === 'old' ? '2026-10-01' : '2026-11-01', period_semantics: 'snapshot' as const, granularity: null,
  methodology: metric.methodology, entity_name: 'Example App', source_entity_id: 'sensor_tower:st-1', source_provider: 'sensor_tower',
  verification_status: 'unverified' as const, dataset_id: datasetId, filename, report_id: `report-${datasetId}`, report_question: 'Example',
  source_row_number: 2, source_reference: 'https://example.com/source', provenance_id: `dataset-${datasetId}`, validation_reasons: [],
});
const preview: QuantitativeComparisonPreview = {
  baseline, current, metric, geo: 'Worldwide', platform: 'Unified', baseline_period: baseline.periods[0], current_period: current.periods[0],
  period_readiness: { compatible: true, kind: 'snapshot', reasons: [] },
  summary: { matched_apps: 1, baseline_only_apps: 1, current_only_apps: 1, distinct_apps: 3, comparable_apps: 1, missing_data_apps: 2, ambiguous_apps: 0, duplicate_observation_apps: 0, invalid_observations: 0 },
  rows: [
    { entity_key: 'sensor_tower:st-1', entity_name: 'Example App', matched_by: 'provider_source_id', status: 'comparable', baseline: source('old', 'October export', 100), current: source('new', 'November export', 125), absolute_change: 25, change_unit: 'downloads', percentage_change: 25, percentage_change_unavailable_reason: null, formula: 'Current source value − baseline source value', evidence: [source('old', 'October export', 100), source('new', 'November export', 125)], reasons: [] },
    { entity_key: 'sensor_tower:source-only', entity_name: 'Source-only app', matched_by: 'provider_source_id', status: 'missing_baseline', baseline: null, current: source('new', 'November export', 70), absolute_change: null, change_unit: null, percentage_change: null, percentage_change_unavailable_reason: null, formula: null, evidence: [source('new', 'November export', 70)], reasons: ['No baseline row.'] },
    { entity_key: 'unmatched:old:4', entity_name: 'Name-only app', matched_by: 'unmatched_source_id', status: 'missing_current', baseline: source('old', 'October export', 80), current: null, absolute_change: null, change_unit: null, percentage_change: null, percentage_change_unavailable_reason: null, formula: null, evidence: [source('old', 'October export', 80)], reasons: ['No stable provider ID.'] },
  ], metric_warnings: [],
};

describe('QuantitativePeriodComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [baseline, current], next_cursor: null, limit: 100 });
    vi.mocked(reportApi.list).mockResolvedValue({ items: [], next_cursor: null, limit: 10 });
    vi.mocked(reportApi.previewQuantitativeComparison).mockResolvedValue(preview);
  });
  afterEach(() => cleanup());

  it('selects original exports and displays matched and source-only app evidence without treating report mismatch as a block', async () => {
    render(<QuantitativePeriodComparison />);
    await waitFor(() => expect(screen.getAllByRole('option', { name: /October export/ })).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Baseline dataset'), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText('Current dataset'), { target: { value: 'new' } });
    await waitFor(() => expect((screen.getByLabelText('Metric') as HTMLSelectElement).disabled).toBe(false));
    // The metric key is based on the exact normalized four-part identity.
    const option = screen.getByRole('option', { name: /Downloads · downloads/ }) as HTMLOptionElement;
    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: option.value } });
    await waitFor(() => expect((screen.getByLabelText('Baseline period') as HTMLSelectElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Compare selected periods' }));
    await screen.findByRole('heading', { name: /snapshot comparison · Downloads/i });
    expect(reportApi.previewQuantitativeComparison).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportApi.previewQuantitativeComparison).mock.calls[0][0]).toMatchObject({
      baseline_dataset_id: 'old', current_dataset_id: 'new', geo: 'Worldwide', platform: 'Unified',
    });
    expect(screen.getByText('Example App')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Inspect evidence for Example App/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Inspect evidence for Example App/ }));
    expect(screen.getByText('Example App · original observations')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Open original source' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'View full table' }));
    expect(screen.getByText('Source-only app')).toBeTruthy();
    expect(screen.getByText('Name-only app')).toBeTruthy();
    expect(screen.getByText('+25 downloads')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Open source' })).toHaveLength(4);
    expect(screen.getAllByRole('link', { name: 'Open report' })).toHaveLength(4);
    expect(screen.getAllByRole('option', { name: 'Percentage change' })).toHaveLength(2);
  });

  it('uses backend percentage values and retains an unavailable value in the full table', async () => {
    vi.mocked(reportApi.previewQuantitativeComparison).mockResolvedValue({
      ...preview,
      rows: [
        { ...preview.rows[0], percentage_change: 25 },
        { ...preview.rows[1], percentage_change: null, percentage_change_unavailable_reason: 'Baseline is missing.' },
      ],
    });
    render(<QuantitativePeriodComparison />);
    fireEvent.change(await screen.findByLabelText('Baseline dataset'), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText('Current dataset'), { target: { value: 'new' } });
    await waitFor(() => expect((screen.getByLabelText('Metric') as HTMLSelectElement).disabled).toBe(false));
    const metricOption = screen.getByRole('option', { name: /Downloads · downloads/ }) as HTMLOptionElement;
    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: metricOption.value } });
    fireEvent.click(await screen.findByRole('button', { name: 'Compare selected periods' }));
    await screen.findByRole('heading', { name: /snapshot comparison · Downloads/i });
    fireEvent.change(screen.getByRole('combobox', { name: 'Chart type' }), { target: { value: 'percentage_change' } });
    expect(screen.getByRole('button', { name: /Inspect evidence for Example App/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View full table' }));
    expect(screen.getByText('+25%')).toBeTruthy();
    expect(screen.getByText('Baseline is missing.')).toBeTruthy();
  });

  it('scales a 100-app comparison with Top N while keeping every row in the complete table', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => {
      const name = `App ${String(index + 1).padStart(3, '0')}`;
      const base = source('old', 'October export', index + 10);
      const later = source('new', 'November export', index + 20);
      return { ...preview.rows[0], entity_key: `sensor_tower:${index}`, entity_name: name, baseline: base, current: later, evidence: [base, later], absolute_change: 10, percentage_change: 100 / (index + 10) };
    });
    vi.mocked(reportApi.previewQuantitativeComparison).mockResolvedValue({ ...preview, summary: { ...preview.summary, comparable_apps: 100, distinct_apps: 100 }, rows });
    render(<QuantitativePeriodComparison />);
    fireEvent.change(await screen.findByLabelText('Baseline dataset'), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText('Current dataset'), { target: { value: 'new' } });
    await waitFor(() => expect((screen.getByLabelText('Metric') as HTMLSelectElement).disabled).toBe(false));
    const metricOption = screen.getByRole('option', { name: /Downloads · downloads/ }) as HTMLOptionElement;
    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: metricOption.value } });
    fireEvent.click(await screen.findByRole('button', { name: 'Compare selected periods' }));
    await screen.findByRole('heading', { name: /snapshot comparison · Downloads/i });
    expect(screen.getByText('App 010')).toBeTruthy();
    expect(screen.queryByText('App 011')).toBeNull();
    fireEvent.change(screen.getByLabelText('Top apps'), { target: { value: 'all' } });
    expect(screen.getByText('App 100')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View full table' }));
    expect(screen.getByText('Showing 50 of 100 app rows. Values and unavailable calculations are returned by the comparison service.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('App 100')).toBeTruthy();
  });

  it('loads all pages of the dataset catalog so older exports remain selectable', async () => {
    vi.mocked(reportApi.listComparisonDatasets)
      .mockResolvedValueOnce({ items: [baseline], next_cursor: 'older-page', limit: 100 })
      .mockResolvedValueOnce({ items: [current], next_cursor: null, limit: 100 });
    render(<QuantitativePeriodComparison />);
    await waitFor(() => expect(reportApi.listComparisonDatasets).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole('option', { name: /October export/ })).toHaveLength(2);
    expect(screen.getAllByRole('option', { name: /November export/ })).toHaveLength(2);
  });
});
