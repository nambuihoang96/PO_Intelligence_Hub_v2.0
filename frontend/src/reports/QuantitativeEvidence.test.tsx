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
  afterEach(cleanup);
  it('shows a report-supplied multi-entity comparison with clickable evidence', () => {
    const openEvidence = vi.fn();
    render(<QuantitativeEvidence observations={[
      observation(), observation({ entity_id: 'game-b', entity_name: 'Game B', value: 850 }), observation({ entity_id: 'game-c', entity_name: 'Game C', value: 740 }),
    ]} onViewEvidence={openEvidence} />);
    expect(screen.getByRole('heading', { name: 'Entity comparison' })).toBeTruthy();
    expect(screen.getByText('Game A')).toBeTruthy();
    expect(screen.getByText('Game B')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Game A.*View evidence/i }));
    expect(openEvidence).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: /Game A.*View evidence/i }).textContent).toContain('Exact as reported · unverified');
  });

  it('labels two compatible periods as a two-point comparison, never a continuous trend', () => {
    render(<QuantitativeEvidence observations={[
      observation({ period_start: '2025-01-01', period_end: '2025-03-31' }),
      observation({ period_start: '2025-04-01', period_end: '2025-06-30', value: 800 }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Two reported time points' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Observed time series' })).toBeNull();
    expect(screen.getByLabelText(/not a continuous trend/i)).toBeTruthy();
  });

  it('uses observed dates only for three or more chronological points', () => {
    render(<QuantitativeEvidence observations={[
      observation({ entity_id: 'game-a', period_start: '2025-01-01', period_end: '2025-01-31' }),
      observation({ entity_id: 'game-a', period_start: '2025-02-01', period_end: '2025-02-28', value: 900 }),
      observation({ entity_id: 'game-a', period_start: '2025-04-01', period_end: '2025-04-30', value: 780 }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Observed time series' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /observations placed by actual date/i })).toBeTruthy();
    expect(screen.getByText(/spaced chronologically/i)).toBeTruthy();
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
    expect(screen.getByRole('heading', { name: 'Observed time series' })).toBeTruthy();
    const points = screen.getAllByRole('button', { name: /View evidence/i });
    expect(points).toHaveLength(4);
    points.forEach((point) => fireEvent.click(point));
    expect(openEvidence.mock.calls.map(([index]) => index).sort()).toEqual([0, 1, 2, 3]);
    expect(screen.getByText(/not represent intermediate measurements/i)).toBeTruthy();
  });

  it('renders three entities across two periods as a clickable matrix, not separate entity series', () => {
    const openEvidence = vi.fn();
    const rows = ['game-a', 'game-b', 'game-c'].flatMap((entity, entityIndex) => [
      observation({ entity_id: entity, entity_name: `Game ${entityIndex + 1}`, period_start: '2025-01-01', period_end: '2025-03-31', value: 100 + entityIndex }),
      observation({ entity_id: entity, entity_name: `Game ${entityIndex + 1}`, period_start: '2025-04-01', period_end: '2025-06-30', value: 80 + entityIndex }),
    ]);
    render(<QuantitativeEvidence observations={rows} onViewEvidence={openEvidence} />);
    expect(screen.getByRole('heading', { name: 'Entity comparison' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /view evidence for/i })).toHaveLength(6);
    for (const button of screen.getAllByRole('button', { name: /view evidence for/i })) fireEvent.click(button);
    expect(openEvidence.mock.calls.map(([index]) => index).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(screen.queryByRole('heading', { name: 'Observed time series' })).toBeNull();
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
    expect(screen.getByText('No observation')).toBeTruthy();
    expect(screen.getByText(/no intermediate values or growth rates/i)).toBeTruthy();
    const valueButtons = screen.getAllByRole('button', { name: /view evidence for/i });
    expect(valueButtons).toHaveLength(3);
    fireEvent.click(valueButtons[1]);
    expect(openEvidence).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'View table' }));
    expect(screen.getByRole('region', { name: 'Exact reported values by entity and period' })).toBeTruthy();
  });

  it('labels approximate report values and preserves original wording in details', () => {
    render(<QuantitativeEvidence observations={[
      observation({ value: 24000, value_precision: 'approximate', reported_value_text: 'approximately 24,000 weekly downloads' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByText(/^≈24[,.]000 downloads$/)).toBeTruthy();
    expect(screen.getAllByText(/Approximate · source-reported · unverified/).length).toBeGreaterThan(0);
    expect(screen.getByText(/approximately 24,000 weekly downloads/)).toBeTruthy();
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
    expect(screen.getByRole('heading', { name: 'Entity and period comparison' })).toBeTruthy();
    expect(screen.getAllByText('No observation')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /view evidence for/i })).toHaveLength(7);
  });

  it('keeps observations with different metric definitions in separate views', () => {
    render(<QuantitativeEvidence observations={[
      observation({ entity_id: 'game-a', metric_definition: 'Downloads', value: 10 }),
      observation({ entity_id: 'game-b', metric_definition: 'Estimated downloads', value: 20 }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getAllByRole('heading', { name: 'Reported observation' })).toHaveLength(2);
    expect(screen.getByText('Downloads')).toBeTruthy();
    expect(screen.getByText('Estimated downloads')).toBeTruthy();
  });

  it('renders explicitly identified ranking positions as a labeled list, not download values', () => {
    render(<QuantitativeEvidence observations={[
      observation({ metric_id: 'store_ranking_position', metric_definition: 'US Top Free Casual ranking', value: 5, unit: 'position' }),
      observation({ metric_id: 'store_ranking_position', metric_definition: 'US Top Free Casual ranking', entity_id: 'game-b', entity_name: 'Game B', value: 12, unit: 'position' }),
      observation({ metric_id: 'store_ranking_position', metric_definition: 'US Top Free Casual ranking', entity_id: 'game-c', entity_name: 'Game C', value: 28, unit: 'position' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Reported ranking positions' })).toBeTruthy();
    expect(screen.getAllByText('US Top Free Casual ranking').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Entity comparison' })).toBeNull();
  });

  it('preserves ranking observations from periods that do not have a comparable peer', () => {
    render(<QuantitativeEvidence observations={[
      observation({ metric_id: 'store_ranking_position', metric_definition: 'Store ranking', unit: 'position', entity_id: 'a', entity_name: 'Game A', value: 5, period_start: '2025-01-01', period_end: '2025-01-31' }),
      observation({ metric_id: 'store_ranking_position', metric_definition: 'Store ranking', unit: 'position', entity_id: 'b', entity_name: 'Game B', value: 12, period_start: '2025-01-01', period_end: '2025-01-31' }),
      observation({ metric_id: 'store_ranking_position', metric_definition: 'Store ranking', unit: 'position', entity_id: 'a', entity_name: 'Game A', value: 4, period_start: '2025-03-01', period_end: '2025-03-31' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Reported ranking positions' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reported observation' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /view evidence/i })).toHaveLength(3);
  });

  it('shows an insufficient-data explanation and exact validation reason without drawing a chart', () => {
    render(<QuantitativeEvidence observations={[observation({ value: null, period_start: null, complete_observation: false, comparison_ready: false, scope_compatible: null, validation_reasons: ['Missing exact numeric value.', 'Missing period start.'] })]} onViewEvidence={() => undefined} />);
    expect(screen.getByText('No compatible chart can be shown yet.')).toBeTruthy();
    fireEvent.click(screen.getByText(/Data limitations/));
    expect(screen.getAllByText('Missing exact numeric value.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Missing period start.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('offers the existing ChatGPT structuring workflow for a qualitative-only report', () => {
    const prepare = vi.fn();
    render(<QuantitativeEvidence observations={[]} onViewEvidence={() => undefined} onPrepareChartData={prepare} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare chart data from this report' }));
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('does not combine observations with different metric definitions or incompatible scope', () => {
    render(<QuantitativeEvidence observations={[
      observation(), observation({ entity_id: 'game-b', entity_name: 'Game B', metric_definition: 'Estimated weekly downloads', platform: 'iOS', period_start: '2025-04-01', period_end: '2025-06-30' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.queryByRole('heading', { name: 'Entity comparison' })).toBeNull();
    expect(screen.getAllByRole('heading', { name: 'Reported observation' })).toHaveLength(2);
  });

  it('does not compare otherwise similar observations when supplied methodologies differ', () => {
    render(<QuantitativeEvidence observations={[
      observation(), observation({ entity_id: 'game-b', entity_name: 'Game B', methodology: 'Panel survey estimate' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.queryByRole('heading', { name: 'Entity comparison' })).toBeNull();
    expect(screen.getAllByRole('heading', { name: 'Reported observation' })).toHaveLength(2);
  });
});
