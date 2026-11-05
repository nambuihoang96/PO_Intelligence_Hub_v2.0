// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type QuantitativeDataset } from '../reports/api';
import { CsvAutoAnalysis, type CsvAutoHighlightMap } from './CsvAutoAnalysis';

function dataSet(id: string, filename: string, when: string, value: number, rowNumber = 2): QuantitativeDataset {
  return { id, project_id: 'project-1', report_id: null, filename, content_sha256: `sha-${id}`, field_mapping: {}, entity_mappings: {}, observations: [{
    metric_id: 'downloads', metric_definition: 'Downloads', value, value_precision: 'exact', unit: 'downloads',
    entity_id: null, entity_name: 'Puzzle A', source_entity_id: 'appmagic:app-1', source_entity_name: 'Puzzle A', source_provider: 'appmagic',
    geo: 'Worldwide', platform: 'iOS', period_start: null, period_end: null, snapshot_date: when, period_semantics: 'snapshot', granularity: null,
    methodology: 'Provider export', source_reference: null, verification_status: 'unverified', provenance_type: 'csv_dataset', provenance_id: id,
    observation_type: 'imported', validation_reasons: [], source_validation_reasons: [], metadata_validation_reasons: [], import_status: 'imported',
    complete_observation: true, analysis_ready: true, source_row_number: rowNumber,
  }], compatibility_status: 'compatible', validation_reasons: [], created_at: `${when}T12:00:00Z`, duplicate: false };
}
function qaSample(): QuantitativeDataset {
  const sample = dataSet('qa', '2026-10-qa-only.csv', '2026-10-30', 0);
  sample.source_rows = 8; sample.source_apps = 4; sample.recognized_metrics = 2;
  const fixtureValues = [
    ['qa-puzzle-a', 'Puzzle A', 'downloads_absolute', 'Downloads (Absolute)', 1180, 'downloads', 2],
    ['qa-puzzle-c', 'Puzzle C', 'downloads_absolute', 'Downloads (Absolute)', 630, 'downloads', 4],
    ['qa-match3', 'Match-3 Quest', 'downloads_absolute', 'Downloads (Absolute)', 500, 'downloads', 6],
    ['qa-puzzle-d', 'Puzzle D', 'downloads_absolute', 'Downloads (Absolute)', 260, 'downloads', 8],
    ['qa-puzzle-a', 'Puzzle A', 'gross_revenue_absolute', 'Gross Revenue (Absolute)', 5400, 'USD', 3],
    ['qa-puzzle-c', 'Puzzle C', 'gross_revenue_absolute', 'Gross Revenue (Absolute)', 2800, 'USD', 5],
    ['qa-match3', 'Match-3 Quest', 'gross_revenue_absolute', 'Gross Revenue (Absolute)', 2000, 'USD', 7],
    ['qa-puzzle-d', 'Puzzle D', 'gross_revenue_absolute', 'Gross Revenue (Absolute)', 700, 'USD', 9],
  ] as const;
  sample.observations = fixtureValues.map(([id, name, metricId, definition, value, unit, row]) => ({
    ...sample.observations[0], metric_id: metricId, metric_definition: definition, value, unit,
    entity_name: name, source_entity_name: name, source_entity_id: `appmagic:${id}`,
    geo: 'US', platform: 'iOS', period_start: '2026-10-01', period_end: '2026-10-30', snapshot_date: null,
    period_semantics: 'reporting_interval', granularity: '30-day reporting window',
    methodology: 'PO Hub synthetic QA fixture; not market data', source_row_number: row,
  }));
  return sample;
}
describe('CsvAutoAnalysis (một tệp)', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('describes within-file distribution, derives QA status from methodology, and opens the cited raw row', async () => {
    const current = qaSample();
    const highlights: CsvAutoHighlightMap[] = [];
    const onOpenSourceRow = vi.fn();
    render(<CsvAutoAnalysis dataset={current} compareHref="/compare-periods" onHighlights={(value) => highlights.push(value)} onOpenSourceRow={onOpenSourceRow} />);
    expect(await screen.findByRole('heading', { name: 'Kết quả tệp CSV' })).toBeTruthy();
    expect(screen.getByText('Mẫu QA tổng hợp · không phải dữ liệu thị trường')).toBeTruthy();
    expect(screen.getByText(/2026-10-qa-only\.csv/)).toBeTruthy();
    expect(screen.getByLabelText('Tệp đang xem').textContent).toContain('4 sản phẩm');
    expect(screen.getByLabelText('Tệp đang xem').textContent).toContain('Kỳ: chưa xác nhận');
    expect(screen.getByText(/Trung vị: 565 lượt tải/)).toBeTruthy();
    expect(screen.getByText(/Khoảng giá trị: 920 lượt tải/)).toBeTruthy();
    expect(screen.queryByText(/Tín hiệu:/)).toBeNull();
    expect(screen.queryByText(/Việc nên làm/)).toBeNull();
    expect(screen.queryByText(/Việc tiếp theo/)).toBeNull();
    expect(screen.queryByText(/kiểm tra giá trị cao nhất trước/)).toBeNull();
    expect(document.querySelector('.csv-auto-signal-actions')).toBeNull();
    expect(highlights.at(-1)).toEqual({});
    fireEvent.click(screen.getByRole('button', { name: 'Mở dòng CSV 2 · Puzzle A' }));
    expect(onOpenSourceRow).toHaveBeenCalledWith(2);
  });

  it('does not label ordinary imported CSVs as synthetic QA samples', () => {
    const current = dataSet('current', 'current.csv', '2026-10-01', 125, 5);
    current.observations.push({ ...current.observations[0], source_entity_id: 'appmagic:app-2', source_entity_name: 'Puzzle B', value: 80, source_row_number: 3 });
    render(<CsvAutoAnalysis dataset={current} compareHref="/compare-periods" />);
    expect(screen.getByText('Tệp CSV đã nhập · chưa xác minh độc lập')).toBeTruthy();
    expect(screen.queryByText(/Mẫu QA tổng hợp/)).toBeNull();
  });

  it('links to the separate comparison page and has no compare tab', () => {
    const current = dataSet('current', 'current.csv', '2026-10-01', 125, 5);
    render(<CsvAutoAnalysis dataset={current} compareHref="/compare-periods?projectId=p1" />);
    expect(screen.queryByRole('button', { name: 'So sánh hai kỳ' })).toBeNull();
    expect(screen.getByRole('link', { name: /So sánh với kỳ khác/ }).getAttribute('href')).toBe('/compare-periods?projectId=p1');
  });
});
