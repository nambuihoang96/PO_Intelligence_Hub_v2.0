// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuantitativeDatasetImport } from './QuantitativeDatasetImport';
import { reportApi, type ImportedReport } from './api';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, reportApi: { previewQuantitativeDataset: vi.fn(), importQuantitativeDataset: vi.fn(), findQuantitativeDataset: vi.fn() } };
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
  const openMapping = () => fireEvent.click(screen.getByText('Rà soát cách nhận diện và phạm vi (chỉ cần khi cần chỉnh)'));

  it('shows the CSV file picker immediately when opened from a project', () => {
    const { container } = render(<QuantitativeDatasetImport projectId="project-qa" onImported={vi.fn()} />);
    expect((container.querySelector('details.quant-import-flow') as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByLabelText('Chọn tệp CSV')).toBeTruthy();
  });


  it('shows a local file preview and does not persist before explicit confirm', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue(preview as never);
    vi.mocked(reportApi.importQuantitativeDataset).mockResolvedValue({ id: 'dataset-1', report_id: 'report-1', filename: 'metrics.csv', content_sha256: 'hash', field_mapping: {}, entity_mappings: {}, observations: preview.observations as never, compatibility_status: 'compatible', validation_reasons: [], created_at: '2026-01-01', duplicate: false } as never);
    const onImported = vi.fn();
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={onImported} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const file = new File(['metric,definition,value,unit,entity,geo,platform,start,end,granularity,source\nweekly_downloads,Weekly downloads,10,downloads,App A,US,Android,2026-01-01,2026-01-07,week,https://example.com'], 'metrics.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText('metrics.csv');
    expect(screen.getByText(/1 dòng có dữ liệu/)).toBeTruthy();
    expect(screen.getByText('Đang hiển thị 1 dòng đầu trong tổng số 1. Đây chỉ là mẫu xem nhanh.')).toBeTruthy();
    expect(reportApi.previewQuantitativeDataset).not.toHaveBeenCalled();
    expect(reportApi.importQuantitativeDataset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));
    await screen.findByText(/Xem nhanh ·/);
    expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1);
    expect(reportApi.importQuantitativeDataset).not.toHaveBeenCalled();
    expect(screen.getByText(/Bước này chưa lưu gì/)).toBeTruthy();
    fireEvent.click(screen.getByText('4. Lưu các quan sát vào báo cáo'));
    await waitFor(() => expect(reportApi.importQuantitativeDataset).toHaveBeenCalledTimes(1));
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('opens the saved dataset and offers metadata review when the confirmed import is a duplicate', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue(preview as never);
    const saved = { id: 'dataset-existing', report_id: 'report-1', filename: 'existing.csv', content_sha256: 'same-hash', field_mapping: {}, entity_mappings: {}, observations: preview.observations, compatibility_status: 'compatible', validation_reasons: [], created_at: '2026-01-01', duplicate: true } as never;
    vi.mocked(reportApi.importQuantitativeDataset).mockResolvedValue(saved);
    const onImported = vi.fn(); const { container } = render(<QuantitativeDatasetImport report={report} onImported={onImported} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const file = new File(['metric,definition,value,unit,entity,geo,platform,start,end,granularity,source\nweekly_downloads,Weekly downloads,10,downloads,App A,US,Android,2026-01-01,2026-01-07,week,https://example.com'], 'existing.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText('existing.csv');
    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalled());
    fireEvent.click(screen.getByText('4. Lưu các quan sát vào báo cáo'));
    await screen.findByText('CSV này đã được lưu. Không cần tải lại hoặc sửa file.');
    expect(onImported).toHaveBeenCalledWith(saved);
    expect(screen.getByRole('button', { name: 'Xem thông tin dữ liệu' })).toBeTruthy();
  });

  it('detects semicolon wide CSV and sends only confirmed scope plus selected metrics', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue(preview as never);
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Unified Name;Unified ID;Platform;Downloads (Absolute)\nApp A;id-a;Unified;1200\n'], 'Worldwide Oct 14, 2026 - Nov 13, 2026.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);
    expect(screen.getByText(/dấu phân cách ;/)).toBeTruthy();
    expect(screen.getByText(/Đã nhận diện 1 cột chỉ số/)).toBeTruthy();
    openMapping();
    fireEvent.change(screen.getByLabelText('Nền tảng / môi trường'), { target: { value: 'Platform' } });
    fireEvent.change(screen.getByLabelText('GEO · giá trị xác nhận'), { target: { value: 'Worldwide' } });
    fireEvent.change(screen.getByLabelText('Ngày bắt đầu kỳ · giá trị xác nhận'), { target: { value: '2026-10-14' } });
    fireEvent.change(screen.getByLabelText('Ngày kết thúc kỳ · giá trị xác nhận'), { target: { value: '2026-11-13' } });
    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(reportApi.previewQuantitativeDataset).mock.calls[0][1];
    expect(payload.csv_content).toContain('Unified ID');
    expect(payload.field_mapping).toMatchObject({ entity_id: 'Unified ID', platform: 'Platform' });
    expect(payload.explicit_values).toMatchObject({ geo: 'Worldwide', period_start: '2026-10-14', period_end: '2026-11-13' });
    expect(payload.metric_mappings).toEqual([expect.objectContaining({ column: 'Downloads (Absolute)', metric_definition: 'Downloads (Absolute)' })]);
  });

  it('preserves a UTF-8 BOM in the original CSV payload while parsing the first header', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue(preview as never);
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const original = '\ufeffMetric,definition,value,unit,entity,geo,platform,start,end,granularity,source\nweekly_downloads,Weekly downloads,10,downloads,App A,US,Android,2026-01-01,2026-01-07,week,https://example.com';
    const file = new File([original], 'metrics-with-bom.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText('metrics-with-bom.csv');
    expect(screen.getByText(/1 dòng có dữ liệu/)).toBeTruthy();
    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(reportApi.previewQuantitativeDataset).mock.calls[0][1];
    expect(payload.csv_content).toBe(original);
    expect(payload.csv_content.startsWith('\ufeff')).toBe(true);
  });

  it('explains when a selected CSV is not valid UTF-8 and does not preview it', async () => {
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const invalidUtf8 = new File([new Uint8Array([0xff, 0xfe, 0x00, 0x81])], 'invalid-encoding.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [invalidUtf8] } });

    expect(await screen.findByText('Không đọc được file. Hãy chọn lại file CSV.')).toBeTruthy();
    expect(reportApi.previewQuantitativeDataset).not.toHaveBeenCalled();
    expect(reportApi.importQuantitativeDataset).not.toHaveBeenCalled();
  });

  it('keeps a Date-only column semantically unknown until the user confirms snapshot meaning', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue(preview as never);
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Unified Name;Unified ID;Platform;Date;Downloads (Absolute)\nApp A;st-a;Unified;2026-10-01;1200\n'], 'snapshot.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);
    openMapping();
    expect((screen.getByLabelText('Ngày chụp số liệu') as HTMLSelectElement).value).toBe('Date');
    expect((screen.getByLabelText('Ngày bắt đầu kỳ') as HTMLSelectElement).value).toBe('');
    const meaning = screen.getByLabelText(/Ý nghĩa của ngày \/ kỳ/) as HTMLSelectElement;
    expect(meaning.value).toBe('unknown');
    fireEvent.change(meaning, { target: { value: 'snapshot' } });
    fireEvent.change(screen.getByLabelText('GEO · giá trị xác nhận'), { target: { value: 'Worldwide' } });
    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(reportApi.previewQuantitativeDataset).mock.calls[0][1];
    expect(payload.field_mapping).toMatchObject({ snapshot_date: 'Date' });
    expect(payload.field_mapping).not.toHaveProperty('period_start');
    expect(payload.explicit_values?.period_semantics).toBe('snapshot');
  });

  it('shows a name-only entity mapping as selected and keeps date and descriptive columns out of metric choices', async () => {
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Unified Name;Date;Category;Publisher ID;Publisher Name;Downloads (Absolute)\nApp A;14/10/2026;Games;publisher-1;Publisher One;1200\n'], 'app-metrics.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);
    openMapping();

    expect((screen.getByText('Đối tượng (ID / tên)').closest('label')!.querySelector('select') as HTMLSelectElement).value).toBe('Unified Name');
    expect(screen.getByText('Cột tên nguồn: Unified Name · Đã nhận diện 1 cột chỉ số')).toBeTruthy();
    expect(screen.queryByText('Entity name: Unified Name · Name: Unified Name')).toBeNull();
    fireEvent.click(screen.getByText('1 cột chỉ số được chọn'));
    expect(screen.queryByLabelText('Date')).toBeNull();
    expect(screen.queryByLabelText('Category')).toBeNull();
    expect(screen.queryByLabelText('Publisher ID')).toBeNull();
    expect(screen.queryByLabelText('Publisher Name')).toBeNull();
  });

  it('auto-detects entity ID and name plus distinct Sensor Tower growth metrics', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue(preview as never);
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const file = new File([
      'Unified Name;Unified ID;All Title;Platform;Downloads (YoY Growth);Downloads (YoY Growth %)\nApp A;app-a;Brain Puzzle;Unified;120;12.5\n',
    ], 'Worldwide 2026-09-14 to 2026-10-13.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);
    openMapping();

    expect(screen.getByText(/Đã nhận diện 2 cột chỉ số/)).toBeTruthy();
    expect(screen.getByText(/Danh tính nguồn: ID Unified ID · tên Unified Name/)).toBeTruthy();
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

    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(reportApi.previewQuantitativeDataset).mock.calls[0][1];
    expect(payload.field_mapping).toMatchObject({ entity_id: 'Unified ID', entity_name: 'Unified Name', platform: 'Platform' });
    expect(payload.metric_mappings).toEqual([
      expect.objectContaining({ column: 'Downloads (YoY Growth)', metric_id: 'downloads_yoy_growth_absolute', unit: 'downloads' }),
      expect.objectContaining({ column: 'Downloads (YoY Growth %)', metric_id: 'downloads_yoy_growth_percent', unit: '%' }),
    ]);
    expect(payload.explicit_values).toEqual({ geo: 'Worldwide', period_start: '2026-09-14', period_end: '2026-10-13', period_semantics: 'reporting_interval' });
  });

  it('asks only about genuine ambiguity and keeps unmatched source apps without mapping actions', async () => {
    const unresolvedPreview = {
      ...preview,
      ambiguities: [{ csv_value: 'Twin', row: 2, candidates: ['app-a'] }],
      unmatched_entities: [],
      source_apps: 3,
      matched_entities: 0,
      source_only_entities: 2,
    };
    vi.mocked(reportApi.previewQuantitativeDataset)
      .mockResolvedValueOnce(unresolvedPreview as never)
      .mockResolvedValueOnce(preview as never);
    vi.mocked(reportApi.importQuantitativeDataset).mockResolvedValue({ id: 'dataset-3', report_id: 'report-1', filename: 'three.csv', content_sha256: 'hash', field_mapping: {}, entity_mappings: {}, observations: preview.observations as never, compatibility_status: 'partial', validation_reasons: [], created_at: '2026-01-01', duplicate: false } as never);
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Entity;Value\nTwin;1\nUnknown One;bad\nUnknown Two;3\n'], 'three.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);
    openMapping();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Entity' } });
    fireEvent.click(screen.getByText('Chọn thêm cột chỉ số'));
    fireEvent.click(screen.getByLabelText('Value'));
    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));
    await screen.findByText(/1 liên kết sản phẩm cần được xem lại/);
    expect(screen.getByText(/vẫn được giữ trong tệp nguồn/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Chọn đối tượng tương ứng với Twin'), { target: { value: 'app-a' } });
    expect(screen.getByLabelText('Chọn đối tượng tương ứng với Twin')).toBeTruthy();
    expect((screen.getByLabelText('Chọn đối tượng tương ứng với Twin') as HTMLSelectElement).value).toBe('app-a');
    expect(screen.queryByLabelText('Map entity Unknown One')).toBeNull();
    expect(screen.queryByLabelText('Map entity Unknown Two')).toBeNull();
    expect(screen.queryByText('4. Lưu các quan sát vào báo cáo')).toBeNull();
    fireEvent.click(screen.getByText('Kiểm tra lại các liên kết'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('4. Lưu các quan sát vào báo cáo')).toBeTruthy();
    fireEvent.click(screen.getByText('4. Lưu các quan sát vào báo cáo'));
    await waitFor(() => expect(reportApi.importQuantitativeDataset).toHaveBeenCalledTimes(1));
    expect(vi.mocked(reportApi.importQuantitativeDataset).mock.calls[0][1].entity_mappings).toEqual({ Twin: 'app-a' });
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
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Entity;Value\nAlpha;1\n'], 'stale.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);
    openMapping();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Entity' } });
    fireEvent.click(screen.getByText('Chọn thêm cột chỉ số'));
    fireEvent.click(screen.getByLabelText('Value'));
    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('GEO · giá trị xác nhận'), { target: { value: 'Worldwide' } });
    resolveStale(stalePreview as never);
    await waitFor(() => expect(screen.queryByText('Old input')).toBeNull());
    expect(screen.queryByText('4. Lưu các quan sát vào báo cáo')).toBeNull();

    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));
    await waitFor(() => expect(reportApi.previewQuantitativeDataset).toHaveBeenCalledTimes(2));
    expect(vi.mocked(reportApi.previewQuantitativeDataset).mock.calls[1]?.[1].explicit_values?.geo).toBe('Worldwide');
    expect(await screen.findByText('4. Lưu các quan sát vào báo cáo')).toBeTruthy();
  });

  it('explains that the initial table is a three-row sample and guides users past an outdated backend', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockRejectedValue(new Error('Unsupported mapped field(s): entity_name [INVALID_QUANTITATIVE_DATASET] HTTP 422'));
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Unified Name;Unified ID;Downloads (Absolute)\nApp A;app-a;1\nApp B;app-b;2\nApp C;app-c;3\nApp D;app-d;4\n'], 'four-rows.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);

    expect(screen.getByText(/4 dòng có dữ liệu/)).toBeTruthy();
    expect(screen.getByText('Đang hiển thị 3 dòng đầu trong tổng số 4. Đây chỉ là mẫu xem nhanh.')).toBeTruthy();
    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));
    expect(await screen.findByText(/phiên bản cũ/)).toBeTruthy();
    expect(screen.getByText(/Chưa có dữ liệu nào được nhập/)).toBeTruthy();
    expect(reportApi.importQuantitativeDataset).not.toHaveBeenCalled();
  });

  it('states the scope mismatch and makes clear that Unified is not converted into a store platform', async () => {
    vi.mocked(reportApi.previewQuantitativeDataset).mockResolvedValue({
      ...preview,
      compatibility_status: 'incompatible',
      validation_reasons: ["Platform 'Unified' differs from report scope 'Android'."],
    } as never);
    const { container } = render(<QuantitativeDatasetImport report={report} onImported={vi.fn()} />);
    fireEvent.click(screen.getByText('Nhập CSV · chọn tệp → kiểm tra → lưu vào báo cáo'));
    const file = new File(['Unified Name;Unified ID;Platform;Downloads (Absolute)\nApp A;app-a;Unified;1200\n'], 'unified.csv', { type: 'text/csv' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(file.name);
    fireEvent.click(screen.getByText('3. Xem nhanh và kiểm tra'));

    expect(await screen.findByText(/Phạm vi không khớp/ )).toBeTruthy();
    expect(screen.getByText(/không tự đổi thành Android hoặc iOS/)).toBeTruthy();
  });
});
