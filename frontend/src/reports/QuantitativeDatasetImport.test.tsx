// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuantitativeDatasetImport } from './QuantitativeDatasetImport';
import { reportApi, type ImportedReport } from './api';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, reportApi: { previewQuantitativeDataset: vi.fn(), importQuantitativeDataset: vi.fn() } };
});

const report = {
  id: 'report-1', geo: 'US', os: 'Android', research_period: '2026',
  research_data: { entities: [{ key: 'app-a', name: 'App A' }] },
} as unknown as ImportedReport;

const preview = {
  observations: [{ metric_id: 'weekly_downloads', metric_definition: 'Weekly downloads', value: 10, unit: 'downloads', entity_id: 'app-a', geo: 'US', platform: 'Android', period_start: '2026-01-01', period_end: '2026-01-07', granularity: 'week', source_reference: 'https://example.com', verification_status: 'unverified', provenance_type: 'csv_dataset', provenance_id: null, observation_type: 'imported', validation_reasons: [], complete_observation: true, comparison_ready: true, scope_compatible: true }],
  validation_reasons: [], ambiguities: [], compatibility_status: 'compatible', total_rows: 1, complete_observations: 1,
  scope_compatible_observations: 1, comparison_ready_observations: 1, duplicate_rows: 0,
};

describe('QuantitativeDatasetImport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a local file preview and does not persist before explicit confirm', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue(preview as never);
    vi.mocked(reportApi.importQuantitativeDataset).mockResolvedValue({ id: 'dataset-1', report_id: 'report-1', filename: 'metrics.csv', content_sha256: 'hash', field_mapping: {}, entity_mappings: {}, observations: preview.observations as never, compatibility_status: 'compatible', validation_reasons: [], created_at: '2026-01-01', duplicate: false } as never);
    const onImported = vi.fn();
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={onImported} />);
    fireEvent.click(screen.getByText('Import CSV'));
    const file = new File(['metric,definition,value,unit,entity,geo,platform,start,end,granularity,source\nweekly_downloads,Weekly downloads,10,downloads,App A,US,Android,2026-01-01,2026-01-07,week,https://example.com'], 'metrics.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText('metrics.csv');
    expect(screen.getByText(/Xem trước/)).toBeTruthy();
    expect(reportApi.previewQuantitativeDataset).not.toHaveBeenCalled();
    expect(reportApi.importQuantitativeDataset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('3. Kiểm tra dữ liệu'));
    await screen.findByText(/Kết quả xác thực/);
    expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1);
    expect(reportApi.importQuantitativeDataset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('4. Xác nhận liên kết với báo cáo này'));
    await waitFor(() => expect(reportApi.importQuantitativeDataset).toHaveBeenCalledTimes(1));
    expect(onImported).toHaveBeenCalledTimes(1);
  });
});
