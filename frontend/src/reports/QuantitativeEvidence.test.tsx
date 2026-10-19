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
    fireEvent.click(screen.getAllByRole('row')[0]);
    expect(openEvidence).toHaveBeenCalledWith(0);
    expect(screen.getAllByRole('row')[0].textContent).toContain('Reported, unverified');
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
    expect(screen.getByRole('img', { name: /observed values only/i })).toBeTruthy();
    expect(screen.getByText(/does not represent intermediate measurements/i)).toBeTruthy();
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

  it('shows an insufficient-data explanation and exact validation reason without drawing a chart', () => {
    render(<QuantitativeEvidence observations={[observation({ value: null, period_start: null, complete_observation: false, comparison_ready: false, scope_compatible: null, validation_reasons: ['Missing exact numeric value.', 'Missing period start.'] })]} onViewEvidence={() => undefined} />);
    expect(screen.getByText('No compatible visualization can be shown yet.')).toBeTruthy();
    fireEvent.click(screen.getByText(/Data limitations/));
    expect(screen.getAllByText('Missing exact numeric value.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Missing period start.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('does not combine observations with different metric definitions or incompatible scope', () => {
    render(<QuantitativeEvidence observations={[
      observation(), observation({ entity_id: 'game-b', entity_name: 'Game B', metric_definition: 'Estimated weekly downloads', platform: 'iOS', period_start: '2025-04-01', period_end: '2025-06-30' }),
    ]} onViewEvidence={() => undefined} />);
    expect(screen.queryByRole('heading', { name: 'Entity comparison' })).toBeNull();
    expect(screen.getByText(/not enough compatible observations/i)).toBeTruthy();
  });
});
