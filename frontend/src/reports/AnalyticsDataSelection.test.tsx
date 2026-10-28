// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuantitativeDataset, QuantitativeObservation } from './api';
import { AnalyticsDataSelection } from './AnalyticsDataSelection';

function observation(overrides: Partial<QuantitativeObservation> = {}): QuantitativeObservation {
  return {
    metric_id: 'monthly_downloads', metric_definition: 'Monthly downloads', value: 42, unit: 'downloads', entity_id: 'app-a', entity_name: 'App A',
    geo: 'US', platform: 'Android', period_start: '2025-01-01', period_end: '2025-01-31', granularity: 'month', methodology: 'Source estimate',
    source_reference: 'https://example.test/source', evidence_reference: 'https://example.test/evidence', verification_status: 'unverified',
    provenance_type: 'research_report', provenance_id: 'report-1', observation_type: 'reported', validation_reasons: [],
    scope_compatible: true, complete_observation: true, comparison_ready: true,
    ...overrides,
  };
}

function csvDataset(rows: QuantitativeObservation[]): QuantitativeDataset {
  return { id: 'csv-1', report_id: 'report-1', filename: 'linked.csv', content_sha256: 'hash', field_mapping: {}, entity_mappings: {}, observations: rows, compatibility_status: 'compatible', validation_reasons: [], created_at: '2025-01-01', duplicate: false, imported_successfully: true };
}

describe('AnalyticsDataSelection', () => {
  afterEach(cleanup);

  it('shows a useful zero-data state and offers the report-scoped CSV import action', () => {
    const importCsv = vi.fn();
    render(<AnalyticsDataSelection reportId="report-1" observations={[]} datasets={[]} onViewEvidence={() => undefined} onImportCsv={importCsv} />);
    expect(screen.getByText('Chưa có số liệu định lượng liên kết với báo cáo này.')).toBeTruthy();
    expect(screen.getByText('Nghiên cứu định tính vẫn sử dụng độc lập được. Số liệu sẽ xuất hiện tại đây khi được cung cấp; không bắt buộc phải có CSV.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Liên kết tệp CSV với báo cáo' }));
    expect(importCsv).toHaveBeenCalledTimes(1);
  });

  it('derives filter choices from observations and opens the chosen report evidence record', () => {
    const openEvidence = vi.fn();
    const { container } = render(<AnalyticsDataSelection reportId="report-1" observations={[observation(), observation({ entity_id: 'app-b', entity_name: 'App B', geo: 'VN', platform: 'iOS', period_start: '2025-03-01', period_end: '2025-03-31' })]} datasets={[]} onViewEvidence={openEvidence} onImportCsv={() => undefined} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'GEO' }), { target: { value: 'VN' } });
    expect(container.querySelectorAll('.analytics-observation')).toHaveLength(1);
    expect(container.querySelector('.analytics-observation')?.textContent).toContain('App B');
    expect(container.querySelector('.analytics-observation')?.textContent).not.toContain('App A');
    fireEvent.click(screen.getByRole('button', { name: 'Xem bằng chứng' }));
    expect(openEvidence).toHaveBeenCalledWith(expect.objectContaining({ source: 'research_report', index: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(container.querySelectorAll('.analytics-observation')).toHaveLength(2);
    fireEvent.change(screen.getByRole('combobox', { name: 'Kỳ' }), { target: { value: '2025-03-01|2025-03-31' } });
    expect(container.querySelectorAll('.analytics-observation')).toHaveLength(1);
  });

  it('shows report and linked CSV observations together with separate provenance and evidence navigation', () => {
    const openEvidence = vi.fn();
    const imported = observation({ observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'csv-1', entity_id: 'app-b', entity_name: 'App B' });
    render(<AnalyticsDataSelection reportId="report-1" observations={[observation()]} datasets={[csvDataset([imported])]} onViewEvidence={openEvidence} onImportCsv={() => undefined} />);
    expect(screen.getAllByText(/Do báo cáo cung cấp/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Nhập từ CSV/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 nhóm so sánh tương thích/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Nguồn dữ liệu' }), { target: { value: 'csv_dataset' } });
    expect(screen.getAllByRole('button', { name: 'Xem bằng chứng' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Xem bằng chứng' }));
    expect(openEvidence).toHaveBeenCalledWith(expect.objectContaining({ source: 'csv_dataset', sourceId: 'csv-1', index: 0 }));
  });

  it('keeps incomplete and out-of-scope rows visible and exposes why they are excluded', () => {
    const incomplete = observation({ entity_id: 'app-b', entity_name: 'App B', value: null, complete_observation: false, comparison_ready: false, validation_reasons: ['Thiếu giá trị số chính xác.'] });
    const { container } = render(<AnalyticsDataSelection reportId="report-1" observations={[observation(), incomplete]} datasets={[]} onViewEvidence={() => undefined} onImportCsv={() => undefined} />);
    const cards = container.querySelectorAll('.analytics-observation');
    expect(cards).toHaveLength(2);
    expect(cards[1].textContent).toContain('App B');
    expect(cards[1].textContent).toContain('Chưa có dữ liệu');
    fireEvent.click(within(cards[1] as HTMLElement).getByText(/Chi tiết phép đo, nguồn và kiểm tra/));
    fireEvent.click(within(cards[1] as HTMLElement).getByText(/Lý do chưa thể so sánh/));
    expect(screen.getAllByText('Thiếu giá trị số chính xác.').length).toBeGreaterThan(0);
  });

  it('lets a PO select a source-only CSV app and inspect its source evidence', () => {
    const openEvidence = vi.fn();
    const sourceOnly = observation({
      entity_id: null, entity_name: null, source_entity_id: 'sensor_tower:source-3',
      source_entity_name: 'Source-only App 3', source_provider: 'sensor_tower',
      entity_resolution_state: 'source_only', observation_type: 'imported',
      provenance_type: 'csv_dataset', provenance_id: 'csv-1',
    });
    render(<AnalyticsDataSelection reportId="report-1" observations={[]} datasets={[csvDataset([sourceOnly])]} onViewEvidence={openEvidence} onImportCsv={() => undefined} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Đối tượng' }), { target: { value: 'source:sensor_tower:source-3' } });
    expect(screen.getAllByText('Source-only App 3')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Xem bằng chứng' }));
    expect(openEvidence).toHaveBeenCalledWith(expect.objectContaining({ source: 'csv_dataset', sourceId: 'csv-1', index: 0 }));
  });

  it('shows scope mismatches as valid in their original CSV scope, separate from needs-review records', () => {
    const worldwide = observation({
      entity_id: null, entity_name: null, source_entity_id: 'sensor:a', source_entity_name: 'Worldwide A', source_provider: 'sensor',
      entity_resolution_state: 'source_only', observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'csv-1',
      geo: 'Worldwide', platform: 'Unified', report_compatibility: 'incompatible', scope_compatible: false, analysis_ready: true,
    });
    const peer = { ...worldwide, source_entity_id: 'sensor:b', source_entity_name: 'Worldwide B' };
    render(<AnalyticsDataSelection reportId="report-1" observations={[]} datasets={[csvDataset([worldwide, peer])]} onViewEvidence={() => undefined} onImportCsv={() => undefined} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Mức độ sẵn sàng' }), { target: { value: 'scope_mismatch' } });
    expect(screen.getAllByText('Worldwide A')).toHaveLength(2);
    expect(screen.getAllByText('Hợp lệ trong CSV · khác phạm vi báo cáo')).toHaveLength(2);
    expect(screen.getByText(/1 nhóm so sánh tương thích/)).toBeTruthy();
    expect(screen.getByText(/không đại diện cho phạm vi báo cáo đã liên kết/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Mức độ sẵn sàng' }), { target: { value: 'needs_review' } });
    expect(screen.getByText('Không có quan sát khớp bộ lọc. Hãy đổi hoặc xóa bộ lọc để xem số liệu liên kết với báo cáo.')).toBeTruthy();
  });

  it('renders a compact searchable preview for 225 observations and keeps evidence navigation', () => {
    const rows = Array.from({ length: 225 }, (_, index) => observation({ entity_id: `app-${index}`, entity_name: `App ${index}` }));
    const openEvidence = vi.fn();
    const { container } = render(<AnalyticsDataSelection reportId="report-1" observations={rows} datasets={[]} onViewEvidence={openEvidence} onImportCsv={() => undefined} />);
    expect(container.querySelectorAll('.analytics-observation')).toHaveLength(20);
    expect(screen.getByText('225 số liệu khớp bộ lọc hiện tại')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm trong số liệu' }), { target: { value: 'App 220' } });
    expect(container.querySelectorAll('.analytics-observation')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Xem bằng chứng' }));
    expect(openEvidence).toHaveBeenCalledWith(expect.objectContaining({ index: 220, observation: expect.objectContaining({ entity_name: 'App 220' }) }));
  });
});
