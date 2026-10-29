// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuantitativeObservation } from './api';
import { QuantitativeEvidence } from './QuantitativeEvidence';

function observation(overrides: Partial<QuantitativeObservation> = {}): QuantitativeObservation {
  return {
    metric_id: 'weekly_downloads', metric_definition: 'Weekly downloads as reported by source', value: 1000,
    unit: 'downloads', entity_id: 'game-a', entity_name: 'Game A', geo: 'US', platform: 'Android',
    period_start: '2025-04-01', period_end: '2025-06-30', granularity: 'quarter', methodology: 'Source-reported store estimate',
    source_reference: 'https://example.com/data', evidence_reference: 'https://example.com/data',
    verification_status: 'unverified', provenance_type: 'research_report', provenance_id: 'report-1',
    observation_type: 'reported', validation_reasons: [], scope_compatible: true, complete_observation: true, comparison_ready: true,
    ...overrides,
  };
}

describe('QuantitativeEvidence', () => {
  it('renders comparable GEO observations without mixing other formats or metrics', () => {
    const evidence = vi.fn();
    render(<QuantitativeEvidence observations={[
      observation({ metric_id: 'ecpm', metric_definition: 'Rewarded eCPM', unit: 'USD/1000 impressions', entity_id: 'rewarded', entity_name: 'Rewarded', geo: 'US', value: 19.2 }),
      observation({ metric_id: 'ecpm', metric_definition: 'Rewarded eCPM', unit: 'USD/1000 impressions', entity_id: 'rewarded', entity_name: 'Rewarded', geo: 'JP', value: 13.1 }),
      observation({ metric_id: 'ecpm', metric_definition: 'Rewarded eCPM', unit: 'USD/1000 impressions', entity_id: 'rewarded', entity_name: 'Rewarded', geo: 'VN', value: 2.7 }),
      observation({ metric_id: 'ecpm', metric_definition: 'Rewarded eCPM', unit: 'USD/1000 impressions', entity_id: 'banner', entity_name: 'Banner', geo: 'US', value: 0.3 }),
    ]} onViewEvidence={evidence} />);
    expect(screen.getByRole('heading', { name: 'So sánh theo GEO' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Xem bằng chứng: JP/ }));
    expect(evidence).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Xem bảng' }));
    expect(screen.getByRole('region', { name: 'Bảng so sánh theo GEO' })).toBeTruthy();
  });

  afterEach(cleanup);
  it('shows a report-supplied multi-entity comparison with clickable evidence', () => {
    const openEvidence = vi.fn();
    render(<QuantitativeEvidence observations={[
      observation(), observation({ entity_id: 'game-b', entity_name: 'Game B', value: 850 }), observation({ entity_id: 'game-c', entity_name: 'Game C', value: 740 }),
    ]} onViewEvidence={openEvidence} />);
    expect(screen.getByRole('heading', { name: 'So sánh hồ sơ' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Số liệu và biểu đồ' })).toBeTruthy();
    expect(screen.getByText('Game A')).toBeTruthy();
    expect(screen.getByText('Game B')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Game A.*Xem bằng chứng/i }));
    expect(openEvidence).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: /Game A.*Xem bằng chứng/i }).textContent).toContain('Chính xác theo báo cáo · chưa xác minh');
  });

  it('labels two compatible periods as a two-point comparison, never a continuous trend', () => {
    render(<QuantitativeEvidence observations={[
      observation({ period_start: '2025-01-01', period_end: '2025-03-31' }),
      observation({ period_start: '2025-04-01', period_end: '2025-06-30', value: 800 }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Hai thời điểm được báo cáo' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Chuỗi số liệu quan sát' })).toBeNull();
    expect(screen.getByLabelText(/không phải xu hướng liên tục/i)).toBeTruthy();
  });

  it('uses observed dates only for three or more chronological points', () => {
    render(<QuantitativeEvidence observations={[
      observation({ entity_id: 'game-a', period_start: '2025-01-01', period_end: '2025-01-31' }),
      observation({ entity_id: 'game-a', period_start: '2025-02-01', period_end: '2025-02-28', value: 900 }),
      observation({ entity_id: 'game-a', period_start: '2025-04-01', period_end: '2025-04-30', value: 780 }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Chuỗi số liệu quan sát' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /quan sát được sắp theo ngày thực tế/i })).toBeTruthy();
    expect(screen.getByText(/sắp theo thời gian thực/i)).toBeTruthy();
    const path = document.querySelector('.quant-time-series polyline')?.getAttribute('points') || '';
    const x = path.split(' ').map((point) => Number(point.split(',')[0]));
    expect(x).toHaveLength(3);
    expect((x[1] - x[0]) / (x[2] - x[1])).toBeCloseTo(31 / 59, 1);
  });

  it('renders four dated values for one entity as an observed time series with evidence for every point', () => {
    const openEvidence = vi.fn();
    const rows = [
      observation({ period_start: '2025-01-01', period_end: '2025-01-07', granularity: 'week', value: 1200 }),
      observation({ period_start: '2025-02-01', period_end: '2025-02-07', granularity: 'week', value: 1000 }),
      observation({ period_start: '2025-04-01', period_end: '2025-04-07', granularity: 'week', value: 900 }),
      observation({ period_start: '2025-05-01', period_end: '2025-05-07', granularity: 'week', value: 850 }),
    ];
    render(<QuantitativeEvidence observations={rows} onViewEvidence={openEvidence} />);
    expect(screen.getByRole('heading', { name: 'Chuỗi số liệu quan sát' })).toBeTruthy();
    const points = screen.getAllByRole('button', { name: /Xem bằng chứng/i });
    expect(points).toHaveLength(4);
    points.forEach((point) => fireEvent.click(point));
    expect(openEvidence.mock.calls.map(([index]) => index).sort()).toEqual([0, 1, 2, 3]);
    expect(screen.getByText(/không biểu thị số đo ở các thời điểm trung gian/i)).toBeTruthy();
  });

  it('renders three entities across two periods as a clickable matrix, not separate entity series', () => {
    const openEvidence = vi.fn();
    const rows = ['game-a', 'game-b', 'game-c'].flatMap((entity, entityIndex) => [
      observation({ entity_id: entity, entity_name: `Game ${entityIndex + 1}`, period_start: '2025-01-01', period_end: '2025-03-31', value: 100 + entityIndex }),
      observation({ entity_id: entity, entity_name: `Game ${entityIndex + 1}`, period_start: '2025-04-01', period_end: '2025-06-30', value: 80 + entityIndex }),
    ]);
    render(<QuantitativeEvidence observations={rows} onViewEvidence={openEvidence} />);
    expect(screen.getByRole('heading', { name: 'So sánh hồ sơ' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /xem bằng chứng của/i })).toHaveLength(6);
    for (const button of screen.getAllByRole('button', { name: /xem bằng chứng của/i })) fireEvent.click(button);
    expect(openEvidence.mock.calls.map(([index]) => index).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(screen.queryByRole('heading', { name: 'Chuỗi số liệu quan sát' })).toBeNull();
  });

  it('shows two-period multi-game data as grouped period bars and keeps missing points visible', () => {
    const openEvidence = vi.fn();
    const rows = [
      observation({ entity_id: 'a', entity_name: 'Game A', period_start: '2025-01-01', period_end: '2025-01-07', granularity: 'week' }),
      observation({ entity_id: 'a', entity_name: 'Game A', period_start: '2025-02-01', period_end: '2025-02-07', granularity: 'week', value: 850 }),
      observation({ entity_id: 'b', entity_name: 'Game B', period_start: '2025-01-01', period_end: '2025-01-07', granularity: 'week', value: 900 }),
    ];
    render(<QuantitativeEvidence observations={rows} onViewEvidence={openEvidence} />);
    expect(screen.getByText('Game A')).toBeTruthy();
    expect(screen.getByText('Game B')).toBeTruthy();
    expect(screen.getByText('Chưa có quan sát')).toBeTruthy();
    expect(screen.getByText(/không tính giá trị trung gian hoặc tốc độ tăng trưởng/i)).toBeTruthy();
    const valueButtons = screen.getAllByRole('button', { name: /xem bằng chứng của/i });
    expect(valueButtons).toHaveLength(3);
    fireEvent.click(valueButtons[1]);
    expect(openEvidence).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Xem bảng' }));
    expect(screen.getByRole('region', { name: 'Giá trị được báo cáo theo đối tượng và kỳ' })).toBeTruthy();
  });

  it('labels approximate report values and preserves original wording in details', () => {
    render(<QuantitativeEvidence observations={[
      observation({ value: 24000, value_precision: 'approximate', reported_value_text: 'approximately 24,000 weekly downloads' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByText(/^≈24[,.]000 downloads$/)).toBeTruthy();
    expect(screen.getAllByText(/Xấp xỉ · do nguồn cung cấp · chưa xác minh/).length).toBeGreaterThan(0);
    expect(screen.getByText(/approximately 24,000 weekly downloads/)).toBeTruthy();
  });

  it('renders three entities across two explicit date windows when cadence is not supplied', () => {
    const rows = ['a', 'b', 'c'].flatMap((entity, index) => [
      observation({ entity_id: entity, entity_name: `Game ${index + 1}`, granularity: null, period_start: '2025-01-01', period_end: '2025-01-31', value: 100 + index }),
      observation({ entity_id: entity, entity_name: `Game ${index + 1}`, granularity: null, period_start: '2025-02-01', period_end: '2025-02-28', value: 90 + index }),
    ]);
    render(<QuantitativeEvidence observations={rows} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'So sánh hồ sơ' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Xem bằng chứng của/i })).toHaveLength(6);
    expect(screen.getAllByText('2025-01-01 – 2025-01-31').length).toBeGreaterThan(1);
    expect(screen.getAllByText('2025-02-01 – 2025-02-28').length).toBeGreaterThan(1);
  });

  it('keeps observations with conflicting known/missing cadence separate and explains why', () => {
    render(<QuantitativeEvidence observations={[
      observation({ entity_id: 'game-a', period_start: '2025-01-01', period_end: '2025-01-31', granularity: 'month' }),
      observation({ entity_id: 'game-a', period_start: '2025-02-01', period_end: '2025-02-28', granularity: null, value: 900 }),
      observation({ entity_id: 'game-a', period_start: '2025-03-01', period_end: '2025-03-31', granularity: 'week', value: 800 }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.queryByRole('heading', { name: 'Hai thời điểm được báo cáo' })).toBeNull();
    expect(screen.getAllByRole('heading', { name: 'Quan sát được báo cáo' })).toHaveLength(3);
    fireEvent.click(screen.getByText(/Giới hạn dữ liệu/));
    expect(screen.getByText(/Chu kỳ đo không nhất quán hoặc còn thiếu/)).toBeTruthy();
  });

  it('shows overlapping windows as dated observations instead of a connected time series', () => {
    render(<QuantitativeEvidence observations={[
      observation({ period_start: '2025-01-01', period_end: '2025-01-31', granularity: null }),
      observation({ period_start: '2025-01-15', period_end: '2025-02-15', granularity: null, value: 800 }),
      observation({ period_start: '2025-03-01', period_end: '2025-03-31', granularity: null, value: 700 }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.queryByRole('heading', { name: 'Chuỗi số liệu quan sát' })).toBeNull();
    expect(screen.getByText(/Các kỳ đo bị chồng lấn. Giá trị được hiển thị thành từng quan sát có ngày riêng/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Xem bằng chứng/i })).toHaveLength(3);
  });

  it('uses a dated table for overlapping windows across multiple entities', () => {
    const rows = ['game-a', 'game-b'].flatMap((entity, index) => [
      observation({ entity_id: entity, entity_name: `Game ${index + 1}`, granularity: null, period_start: '2025-01-01', period_end: '2025-01-31', value: 100 + index }),
      observation({ entity_id: entity, entity_name: `Game ${index + 1}`, granularity: null, period_start: '2025-01-15', period_end: '2025-02-15', value: 90 + index }),
    ]);
    render(<QuantitativeEvidence observations={rows} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Đối chiếu hồ sơ theo kỳ' })).toBeTruthy();
    expect(screen.getByText(/Các kỳ đo bị chồng lấn. Ngày chính xác được hiển thị trong bảng/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Xem bằng chứng của/i })).toHaveLength(4);
  });

  it('uses a dated table when entities do not share the same two date windows', () => {
    const periods = [
      [['2025-01-01', '2025-01-31'], ['2025-02-01', '2025-02-28']],
      [['2025-03-01', '2025-03-31'], ['2025-04-01', '2025-04-30']],
      [['2025-05-01', '2025-05-31'], ['2025-06-01', '2025-06-30']],
    ];
    const rows = periods.flatMap((entityPeriods, index) => entityPeriods.map(([period_start, period_end], periodIndex) =>
      observation({ entity_id: `game-${index}`, entity_name: `Game ${index + 1}`, period_start, period_end, value: 100 - periodIndex * 10 - index }),
    ));
    render(<QuantitativeEvidence observations={rows} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Đối chiếu hồ sơ theo kỳ' })).toBeTruthy();
    expect(screen.getByText(/không có cùng một cặp kỳ tương thích/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Xem bằng chứng của/i })).toHaveLength(6);
  });

  it('does not draw a positive-width bar for a true zero', () => {
    render(<QuantitativeEvidence observations={[
      observation({ entity_id: 'game-a', entity_name: 'Game A', value: 0 }),
      observation({ entity_id: 'game-b', entity_name: 'Game B', value: 100 }),
    ]} onViewEvidence={() => undefined} />);
    const zeroButton = screen.getByRole('button', { name: /Game A.*0 downloads/i });
    const zeroBar = zeroButton.querySelector('.quant-comparison-track > span');
    expect(zeroBar?.getAttribute('style')).toContain('width: 0%');
    expect(zeroBar?.classList.contains('is-zero')).toBe(true);
  });

  it('keeps negative measurements signed in a table rather than rendering positive bars', () => {
    render(<QuantitativeEvidence observations={[
      observation({ entity_id: 'game-a', period_start: '2025-01-01', period_end: '2025-01-31', value: -10 }),
      observation({ entity_id: 'game-a', period_start: '2025-02-01', period_end: '2025-02-28', value: 5 }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByText(/Giá trị có dấu được hiển thị trong bảng/)).toBeTruthy();
    expect(screen.getByText('-10 downloads')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Hai thời điểm được báo cáo' })).toBeNull();
  });

  it('keeps irregular periods categorical and shows missing observations without filling values', () => {
    const rows = [
      observation({ entity_id: 'a', entity_name: 'Game A', period_start: '2025-01-01', period_end: '2025-01-31' }),
      observation({ entity_id: 'a', entity_name: 'Game A', period_start: '2025-03-01', period_end: '2025-03-31', value: 900 }),
      observation({ entity_id: 'a', entity_name: 'Game A', period_start: '2025-09-01', period_end: '2025-09-30', value: 700 }),
      observation({ entity_id: 'b', entity_name: 'Game B', period_start: '2025-01-01', period_end: '2025-01-31', value: 800 }),
      observation({ entity_id: 'b', entity_name: 'Game B', period_start: '2025-09-01', period_end: '2025-09-30', value: 600 }),
      observation({ entity_id: 'c', entity_name: 'Game C', period_start: '2025-03-01', period_end: '2025-03-31', value: 650 }),
      observation({ entity_id: 'c', entity_name: 'Game C', period_start: '2025-09-01', period_end: '2025-09-30', value: 550 }),
    ];
    render(<QuantitativeEvidence observations={rows} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Đối chiếu hồ sơ theo kỳ' })).toBeTruthy();
    expect(screen.getAllByText('Chưa có quan sát')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /xem bằng chứng của/i })).toHaveLength(7);
  });

  it('keeps observations with different metric definitions in separate views', () => {
    render(<QuantitativeEvidence observations={[
      observation({ entity_id: 'game-a', metric_definition: 'Downloads', value: 10 }),
      observation({ entity_id: 'game-b', metric_definition: 'Estimated downloads', value: 20 }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getAllByRole('heading', { name: 'Quan sát được báo cáo' })).toHaveLength(2);
    expect(screen.getByText('Downloads')).toBeTruthy();
    expect(screen.getByText('Estimated downloads')).toBeTruthy();
  });

  it('renders explicitly identified ranking positions as a labeled list, not download values', () => {
    render(<QuantitativeEvidence observations={[
      observation({ metric_id: 'store_ranking_position', metric_definition: 'US Top Free Casual ranking', value: 5, unit: 'position' }),
      observation({ metric_id: 'store_ranking_position', metric_definition: 'US Top Free Casual ranking', entity_id: 'game-b', entity_name: 'Game B', value: 12, unit: 'position' }),
      observation({ metric_id: 'store_ranking_position', metric_definition: 'US Top Free Casual ranking', entity_id: 'game-c', entity_name: 'Game C', value: 28, unit: 'position' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Thứ hạng được báo cáo' })).toBeTruthy();
    expect(screen.getAllByText('US Top Free Casual ranking').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'So sánh hồ sơ' })).toBeNull();
  });

  it('preserves ranking observations from periods that do not have a comparable peer', () => {
    render(<QuantitativeEvidence observations={[
      observation({ metric_id: 'store_ranking_position', metric_definition: 'Store ranking', unit: 'position', entity_id: 'a', entity_name: 'Game A', value: 5, period_start: '2025-01-01', period_end: '2025-01-31' }),
      observation({ metric_id: 'store_ranking_position', metric_definition: 'Store ranking', unit: 'position', entity_id: 'b', entity_name: 'Game B', value: 12, period_start: '2025-01-01', period_end: '2025-01-31' }),
      observation({ metric_id: 'store_ranking_position', metric_definition: 'Store ranking', unit: 'position', entity_id: 'a', entity_name: 'Game A', value: 4, period_start: '2025-03-01', period_end: '2025-03-31' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Thứ hạng được báo cáo' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Quan sát được báo cáo' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /xem bằng chứng/i })).toHaveLength(3);
  });

  it('shows an insufficient-data explanation and exact validation reason without drawing a chart', () => {
    render(<QuantitativeEvidence observations={[observation({ value: null, period_start: null, complete_observation: false, comparison_ready: false, scope_compatible: null, validation_reasons: ['Missing exact numeric value.', 'Missing period start.'] })]} onViewEvidence={() => undefined} />);
    expect(screen.getByText('Chưa thể hiển thị biểu đồ tương thích.')).toBeTruthy();
    fireEvent.click(screen.getByText(/Giới hạn dữ liệu/));
    expect(screen.getAllByText('Missing exact numeric value.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Missing period start.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('does not chart invalid date bounds even when other observation fields are present', () => {
    render(<QuantitativeEvidence observations={[
      observation({ period_start: 'not-a-date', period_end: '2025-01-31', validation_reasons: ['Invalid period start; use YYYY-MM-DD.'] }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.queryByRole('heading', { name: 'Quan sát được báo cáo' })).toBeNull();
    expect(screen.getByText('Chưa thể hiển thị biểu đồ tương thích.')).toBeTruthy();
    expect(screen.getAllByText('Invalid period start; use YYYY-MM-DD.').length).toBeGreaterThan(0);
  });

  it('offers the existing ChatGPT structuring workflow for a qualitative-only report', () => {
    const prepare = vi.fn();
    render(<QuantitativeEvidence observations={[]} onViewEvidence={() => undefined} onPrepareChartData={prepare} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chuẩn bị dữ liệu biểu đồ từ báo cáo này' }));
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('does not combine observations with different metric definitions or incompatible scope', () => {
    render(<QuantitativeEvidence observations={[
      observation(), observation({ entity_id: 'game-b', entity_name: 'Game B', metric_definition: 'Estimated weekly downloads', platform: 'iOS', period_start: '2025-04-01', period_end: '2025-06-30' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.queryByRole('heading', { name: 'So sánh hồ sơ' })).toBeNull();
    expect(screen.getAllByRole('heading', { name: 'Quan sát được báo cáo' })).toHaveLength(2);
  });

  it('does not compare otherwise similar observations when supplied methodologies differ', () => {
    render(<QuantitativeEvidence observations={[
      observation(), observation({ entity_id: 'game-b', entity_name: 'Game B', methodology: 'Panel survey estimate' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.queryByRole('heading', { name: 'So sánh hồ sơ' })).toBeNull();
    expect(screen.getAllByRole('heading', { name: 'Quan sát được báo cáo' })).toHaveLength(2);
  });
});
