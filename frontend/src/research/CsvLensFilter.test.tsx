// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuantitativeDataset, QuantitativeObservation } from '../reports/api';
import { CsvAutoAnalysis, type Top10ResearchSelection } from './CsvAutoAnalysis';

function obs(row: number, metric: string, name: string, value: number | null, extra: Partial<QuantitativeObservation> = {}): QuantitativeObservation {
  return {
    metric_id: metric, metric_definition: metric, value, unit: metric === 'revenue_absolute' ? 'USD?' : 'downloads', entity_id: null, entity_name: null,
    source_entity_id: `sensor_tower:id${row}`, source_entity_name: name, source_provider: 'sensor_tower',
    geo: null, platform: 'Unified', period_start: null, period_end: null, snapshot_date: '2026-09-14',
    period_semantics: 'unknown', granularity: null, source_reference: null, verification_status: 'unverified',
    provenance_type: 'csv_dataset', provenance_id: 'd', observation_type: 'imported', validation_reasons: [],
    source_row_number: row, ...extra,
  };
}

function dataset(observations: QuantitativeObservation[]): QuantitativeDataset {
  return {
    id: 'ds', report_id: null, filename: 'sensor-export.csv', content_sha256: 'x', field_mapping: {}, entity_mappings: {}, observations,
    compatibility_status: 'partial', validation_reasons: [], created_at: '', duplicate: false, source_apps: 4,
  } as unknown as QuantitativeDataset;
}

const withRevenue = dataset([
  obs(1, 'downloads_absolute', 'Alpha', 1000), obs(1, 'downloads_yoy_growth_absolute', 'Alpha', 500), obs(1, 'revenue_absolute', 'Alpha', 50),
  obs(2, 'downloads_absolute', 'Bravo', 800), obs(2, 'downloads_yoy_growth_absolute', 'Bravo', 800), obs(2, 'revenue_absolute', 'Bravo', 900),
  obs(3, 'downloads_absolute', 'Charlie', 600), obs(3, 'downloads_yoy_growth_absolute', 'Charlie', 60),
  obs(4, 'downloads_absolute', 'Delta', 300), obs(4, 'downloads_yoy_growth_absolute', 'Delta', 150), obs(4, 'revenue_absolute', 'Delta', 10),
]);

const downloadsOnly = dataset([obs(1, 'downloads_absolute', 'Alpha', 1000), obs(2, 'downloads_absolute', 'Bravo', 800)]);

function renderWith(data: QuantitativeDataset) {
  const selections: Top10ResearchSelection[] = [];
  render(<CsvAutoAnalysis dataset={data} compareHref="/compare" renderResearchAction={(selection) => {
    selections.push(selection);
    return <button type="button" disabled={!selection.canRun}>Nghiên cứu top 10 bằng Codex</button>;
  }} />);
  return { selections, last: () => selections[selections.length - 1] };
}

describe('CsvAutoAnalysis filter', () => {
  afterEach(() => cleanup());

  it('defaults to Lượt tải and passes the top 10 of that filter to the research action', () => {
    const { last } = renderWith(withRevenue);
    expect((screen.getByLabelText('Lọc theo') as HTMLSelectElement).value).toBe('downloads');
    expect(last().rows.map((row) => row.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(screen.getByRole('button', { name: 'Nghiên cứu top 10 bằng Codex' })).toBeTruthy();
  });

  it('switches the table and the research selection when the filter changes', () => {
    const { last } = renderWith(withRevenue);
    fireEvent.change(screen.getByLabelText('Lọc theo'), { target: { value: 'growth' } });
    expect(last().lens).toBe('growth');
    expect(last().rows.map((row) => row.name)).toEqual(['Alpha', 'Delta', 'Charlie']);
    expect(screen.getByRole('heading', { name: 'Top game theo tăng trưởng lượt tải (có năm trước)' })).toBeTruthy();
    expect(screen.getByText(/Chỉ 3\/4 game có năm trước/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Lọc theo'), { target: { value: 'revenue' } });
    expect(last().rows.map((row) => row.name)).toEqual(['Bravo', 'Alpha', 'Delta']);
    expect(screen.getByText(/Đơn vị tiền tệ: chưa xác nhận/)).toBeTruthy();
  });

  it('shows the three rankings for Kết hợp and gives the research action nothing to run', () => {
    const { last } = renderWith(withRevenue);
    fireEvent.change(screen.getByLabelText('Lọc theo'), { target: { value: 'combined' } });
    expect(last().canRun).toBe(false);
    expect(screen.getByRole('heading', { name: 'Kết hợp ba bảng xếp hạng' })).toBeTruthy();
    expect(screen.getAllByRole('table').length).toBe(1);
    expect(screen.getByText(/Xuất hiện ở nhiều bảng: Alpha, Bravo, Charlie, Delta/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nghiên cứu top 10 bằng Codex' }).hasAttribute('disabled')).toBe(true);
  });

  it('hides revenue and growth filters and explains why for a file that lacks them', () => {
    renderWith(downloadsOnly);
    const options = [...(screen.getByLabelText('Lọc theo') as HTMLSelectElement).options].map((option) => option.textContent);
    expect(options).toEqual(['Lượt tải']);
    expect(screen.getByText(/không có cột doanh thu/)).toBeTruthy();
    expect(screen.getByText(/không có đủ số năm trước/)).toBeTruthy();
  });

  it('exposes the filter as a select, not tabs', () => {
    renderWith(withRevenue);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByLabelText('Lọc theo').tagName).toBe('SELECT');
  });

  it('calls onHighlights only with the within-file signal map, not the filter-dependent cards', () => {
    const onHighlights = vi.fn();
    render(<CsvAutoAnalysis dataset={withRevenue} compareHref="/compare" onHighlights={onHighlights} />);
    expect(onHighlights).toHaveBeenCalled();
  });
});
