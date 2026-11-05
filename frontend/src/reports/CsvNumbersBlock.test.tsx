// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CsvNumbersBlock } from './CsvNumbersBlock';
import { reportApi, type ImportedReport, type QuantitativeDataset } from './api';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, reportApi: { ...original.reportApi, getProjectQuantitativeDataset: vi.fn(), listComparisonDatasets: vi.fn(), updateCsvSelection: vi.fn() } };
});

function obs(row: number, metric: string, name: string, value: number) {
  return { metric_id: metric, metric_definition: metric, value, unit: 'downloads', entity_id: null, entity_name: null,
    source_entity_id: `sensor_tower:id${row}`, source_entity_name: name, source_provider: 'sensor_tower', geo: null, platform: 'Unified',
    period_start: null, period_end: null, snapshot_date: '2026-09-14', period_semantics: 'unknown', granularity: null, source_reference: null,
    verification_status: 'unverified', provenance_type: 'csv_dataset', provenance_id: 'd', observation_type: 'imported', validation_reasons: [],
    source_row_number: row, source_publisher_name: 'Pub A' };
}

const dataset = {
  id: 'ds-1', report_id: null, filename: 'sample.csv', content_sha256: 'x', field_mapping: {}, entity_mappings: {}, compatibility_status: 'partial',
  validation_reasons: [], created_at: '', duplicate: false,
  observations: [
    obs(1, 'downloads_absolute', 'Meowdoku', 13837982), obs(1, 'dau_absolute', 'Meowdoku', 4880848),
    obs(2, 'downloads_absolute', 'Alpha', 10100), obs(2, 'downloads_yoy_growth_absolute', 'Alpha', 10000),
  ],
} as unknown as QuantitativeDataset;

const linked = {
  id: 'report-1', project_id: 'project-a', question: 'Q', geo: 'Global', os: 'Unknown', research_period: null, content_sha256: 'h', origin: 'chatgpt_user_import',
  source_assistant: 'chatgpt', imported_at: '2026-11-05', research_data: null,
  source_selection: { dataset_id: 'ds-1', dataset_filename: 'sample.csv', lens: 'downloads', lens_label: 'Lượt tải', rows: [{ source_row: 1, name: 'Meowdoku' }, { source_row: 2, name: 'Alpha' }] },
} as unknown as ImportedReport;

describe('CsvNumbersBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue(dataset);
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [{ id: 'ds-1', filename: 'sample.csv' }], next_cursor: null, limit: 100 } as never);
  });
  afterEach(() => cleanup());

  it('shows the numbers read from the linked CSV, with the low-base growth warning', async () => {
    render(<CsvNumbersBlock report={linked} />);
    expect(await screen.findByText('TÍNH TỪ CSV · ƯỚC TÍNH · CHƯA XÁC MINH')).toBeTruthy();
    expect(await screen.findByText('13.837.982')).toBeTruthy();
    expect(screen.getByText(/CẦN KIỂM TRA: nền năm trước nhỏ/)).toBeTruthy();
    expect(screen.getByText(/\+10\.000%/)).toBeTruthy();
    expect(reportApi.getProjectQuantitativeDataset).toHaveBeenCalledWith('project-a', 'ds-1');
  });

  it('offers a clear attach step for a report without a link, and records the top games only', async () => {
    vi.mocked(reportApi.updateCsvSelection).mockResolvedValue({ ...linked, source_selection: null } as never);
    const onLinked = vi.fn();
    render(<CsvNumbersBlock report={{ ...linked, source_selection: null } as unknown as ImportedReport} onLinked={onLinked} />);
    expect(await screen.findByRole('button', { name: 'Gắn 5 game đứng đầu' })).toBeTruthy();
    expect(screen.getByText(/chưa gắn với tệp CSV/)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Gắn 5 game đứng đầu' });
    button.click();
    await waitFor(() => expect(reportApi.updateCsvSelection).toHaveBeenCalledTimes(1));
    const [id, body] = vi.mocked(reportApi.updateCsvSelection).mock.calls[0];
    expect(id).toBe('report-1');
    expect(body).toMatchObject({ dataset_id: 'ds-1', lens: 'downloads', lens_label: 'Lượt tải' });
    expect(body.rows.map((row) => row.source_row)).toEqual([1, 2]);
  });
});
