// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows a local file preview and does not persist before explicit confirm', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue(preview as never);
    vi.mocked(reportApi.importQuantitativeDataset).mockResolvedValue({ id: 'dataset-1', report_id: 'report-1', filename: 'metrics.csv', content_sha256: 'hash', field_mapping: {}, entity_mappings: {}, observations: preview.observations as never, compatibility_status: 'compatible', validation_reasons: [], created_at: '2026-01-01', duplicate: false } as never);
    const onImported = vi.fn();
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={onImported} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn file → kiểm tra → lưu vào báo cáo'));
    const file = new File(['metric,definition,value,unit,entity,geo,platform,start,end,granularity,source\nweekly_downloads,Weekly downloads,10,downloads,App A,US,Android,2026-01-01,2026-01-07,week,https://example.com'], 'metrics.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText('metrics.csv');
    expect(screen.getByText(/1 dòng có dữ liệu/)).toBeTruthy();
    expect(screen.getByText('Đang hiển thị 1 dòng đầu trong tổng số 1. Đây chỉ là mẫu xem nhanh.')).toBeTruthy();
    expect(reportApi.previewQuantitativeDataset).not.toHaveBeenCalled();
    expect(reportApi.importQuantitativeDataset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('3. Xem thử dữ liệu'));
    await screen.findByText(/Kết quả xem thử/);
    expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1);
    expect(reportApi.importQuantitativeDataset).not.toHaveBeenCalled();
    expect(screen.getByText(/Bước này chưa lưu gì/)).toBeTruthy();
    fireEvent.click(screen.getByText('4. Lưu các quan sát vào báo cáo'));
    await waitFor(() => expect(reportApi.importQuantitativeDataset).toHaveBeenCalledTimes(1));
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('detects semicolon wide CSV and sends only confirmed scope plus selected metrics', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue(preview as never);
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn file → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Unified Name;Unified ID;Platform;Downloads (Absolute)\nApp A;id-a;Unified;1200\n'], 'Worldwide Oct 14, 2026 - Nov 13, 2026.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);
    expect(screen.getByText(/dấu phân cách ;/)).toBeTruthy();
    expect(screen.getByText(/1 metric được nhận diện/)).toBeTruthy();
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'Platform' } });
    fireEvent.change(screen.getByLabelText('GEO · giá trị xác nhận'), { target: { value: 'Worldwide' } });
    fireEvent.change(screen.getByLabelText('Period start · giá trị xác nhận'), { target: { value: '2026-10-14' } });
    fireEvent.change(screen.getByLabelText('Period end · giá trị xác nhận'), { target: { value: '2026-11-13' } });
    fireEvent.click(screen.getByText('3. Xem thử dữ liệu'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(reportApi.previewQuantitativeDataset).mock.calls[0][1];
    expect(payload.csv_content).toContain('Unified ID');
    expect(payload.field_mapping).toMatchObject({ entity_id: 'Unified ID', platform: 'Platform' });
    expect(payload.explicit_values).toMatchObject({ geo: 'Worldwide', period_start: '2026-10-14', period_end: '2026-11-13' });
    expect(payload.metric_mappings).toEqual([expect.objectContaining({ column: 'Downloads (Absolute)', metric_definition: 'Downloads (Absolute)' })]);
  });

  it('auto-detects entity ID and name plus distinct Sensor Tower growth metrics', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue(preview as never);
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn file → kiểm tra → lưu vào báo cáo'));
    const file = new File([
      'Unified Name;Unified ID;All Title;Platform;Downloads (YoY Growth);Downloads (YoY Growth %)\nApp A;app-a;Brain Puzzle;Unified;120;12.5\n',
    ], 'Worldwide 2026-09-14 to 2026-10-13.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);

    expect(screen.getByText(/2 metric được nhận diện/)).toBeTruthy();
    expect(screen.getByText(/Entity ID: Unified ID · Name: Unified Name/)).toBeTruthy();
    const geo = screen.getByRole('combobox', { name: 'GEO' });
    expect([...geo.querySelectorAll('option')].map((option) => option.textContent)).not.toContain('All Title');
    expect(screen.getByRole('button', { name: 'Xác nhận GEO: Worldwide' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xác nhận ngày bắt đầu: 2026-09-14' })).toBeTruthy();
    expect(reportApi.previewQuantitativeDataset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận GEO: Worldwide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận ngày bắt đầu: 2026-09-14' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận ngày kết thúc: 2026-10-13' }));
    expect(screen.queryByRole('button', { name: 'Xác nhận GEO: Worldwide' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xác nhận ngày bắt đầu: 2026-09-14' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xác nhận ngày kết thúc: 2026-10-13' })).toBeNull();

    fireEvent.click(screen.getByText('3. Xem thử dữ liệu'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(reportApi.previewQuantitativeDataset).mock.calls[0][1];
    expect(payload.field_mapping).toMatchObject({ entity_id: 'Unified ID', entity_name: 'Unified Name', platform: 'Platform' });
    expect(payload.metric_mappings).toEqual([
      expect.objectContaining({ column: 'Downloads (YoY Growth)', metric_id: 'downloads_yoy_growth_absolute', unit: 'downloads' }),
      expect.objectContaining({ column: 'Downloads (YoY Growth %)', metric_id: 'downloads_yoy_growth_percent', unit: '%' }),
    ]);
    expect(payload.explicit_values).toEqual({ geo: 'Worldwide', period_start: '2026-09-14', period_end: '2026-10-13' });
  });

  it('keeps three unresolved entity mappings visible, preserves choices, and requires a fresh preview', async () => {
    const unresolvedPreview = {
      ...preview,
      ambiguities: [{ csv_value: 'Twin', row: 2, candidates: ['app-a'] }],
      unmatched_entities: [{ csv_value: 'Unknown One', row: 3, candidates: [] }, { csv_value: 'Unknown Two', row: 4, candidates: [] }],
    };
    vi.mocked(reportApi.previewQuantitativeDataset)
      .mockResolvedValueOnce(unresolvedPreview as never)
      .mockResolvedValueOnce(preview as never);
    vi.mocked(reportApi.importQuantitativeDataset).mockResolvedValue({ id: 'dataset-3', report_id: 'report-1', filename: 'three.csv', content_sha256: 'hash', field_mapping: {}, entity_mappings: {}, observations: preview.observations as never, compatibility_status: 'partial', validation_reasons: [], created_at: '2026-01-01', duplicate: false } as never);
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn file → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Entity;Value\nTwin;1\nUnknown One;bad\nUnknown Two;3\n'], 'three.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Entity' } });
    fireEvent.click(screen.getByText('Chọn thêm metric columns'));
    fireEvent.click(screen.getByLabelText('Value'));
    fireEvent.click(screen.getByText('3. Xem thử dữ liệu'));
    await screen.findByText('Entity cần mapping');
    fireEvent.change(screen.getByLabelText('Map entity Twin'), { target: { value: 'app-a' } });
    expect(screen.getByLabelText('Map entity Twin')).toBeTruthy();
    expect(screen.getByLabelText('Map entity Unknown One')).toBeTruthy();
    expect(screen.getByLabelText('Map entity Unknown Two')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Map entity Unknown One'), { target: { value: 'app-a' } });
    fireEvent.change(screen.getByLabelText('Map entity Unknown Two'), { target: { value: '__unmapped__' } });
    expect((screen.getByLabelText('Map entity Twin') as HTMLSelectElement).value).toBe('app-a');
    expect((screen.getByLabelText('Map entity Unknown One') as HTMLSelectElement).value).toBe('app-a');
    expect((screen.getByLabelText('Map entity Unknown Two') as HTMLSelectElement).value).toBe('__unmapped__');
    expect(screen.queryByText('4. Lưu các quan sát vào báo cáo')).toBeNull();
    fireEvent.click(screen.getByText('Xác thực lại mappings'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('4. Lưu các quan sát vào báo cáo')).toBeTruthy();
    fireEvent.click(screen.getByText('4. Lưu các quan sát vào báo cáo'));
    await waitFor(() => expect(reportApi.importQuantitativeDataset).toHaveBeenCalledTimes(1));
    expect(vi.mocked(reportApi.importQuantitativeDataset).mock.calls[0][1].entity_mappings).toEqual({ Twin: 'app-a', 'Unknown One': 'app-a', 'Unknown Two': '__unmapped__' });
  });

  it('ignores a validation response after its input has changed', async () => {
    let resolveStale!: (result: typeof preview) => void;
    const stalePreview = {
      ...preview,
      ambiguities: [{ csv_value: 'Old input', row: 2, candidates: ['app-a'] }],
      unmatched_entities: [],
    };
    vi.mocked(reportApi.previewQuantitativeDataset)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve as (result: typeof preview) => void; }))
      .mockResolvedValueOnce(preview as never);
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn file → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Entity;Value\nAlpha;1\n'], 'stale.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Entity' } });
    fireEvent.click(screen.getByText('Chọn thêm metric columns'));
    fireEvent.click(screen.getByLabelText('Value'));
    fireEvent.click(screen.getByText('3. Xem thử dữ liệu'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('GEO · giá trị xác nhận'), { target: { value: 'Worldwide' } });
    resolveStale(stalePreview as never);
    await waitFor(() => expect(screen.queryByText('Old input')).toBeNull());
    expect(screen.queryByText('4. Lưu các quan sát vào báo cáo')).toBeNull();

    fireEvent.click(screen.getByText('3. Xem thử dữ liệu'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(2));
    expect(vi.mocked(reportApi.previewQuantitativeDataset).mock.calls[1]?.[1].explicit_values?.geo).toBe('Worldwide');
    expect(await screen.findByText('4. Lưu các quan sát vào báo cáo')).toBeTruthy();
  });

  it('explains that the initial table is a three-row sample and guides users past an outdated backend', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockRejectedValue(new Error('Unsupported mapped field(s): entity_name [INVALID_QUANTITATIVE_DATASET] HTTP 422'));
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn file → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Unified Name;Unified ID;Downloads (Absolute)\nApp A;app-a;1\nApp B;app-b;2\nApp C;app-c;3\nApp D;app-d;4\n'], 'four-rows.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);

    expect(screen.getByText(/4 dòng có dữ liệu/)).toBeTruthy();
    expect(screen.getByText('Đang hiển thị 3 dòng đầu trong tổng số 4. Đây chỉ là mẫu xem nhanh.')).toBeTruthy();
    fireEvent.click(screen.getByText('3. Xem thử dữ liệu'));
    expect(await screen.findByText(/Backend đang chạy phiên bản cũ/)).toBeTruthy();
    expect(screen.getByText(/Chưa có dữ liệu nào được nhập/)).toBeTruthy();
    expect(reportApi.importQuantitativeDataset).not.toHaveBeenCalled();
  });
});
