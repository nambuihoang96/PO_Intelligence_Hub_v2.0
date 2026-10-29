// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuantitativeObservation, ResearchData } from './api';
import { AutoResearchInsights } from './AutoResearchInsights';

function observation(overrides: Partial<QuantitativeObservation> = {}): QuantitativeObservation {
  return {
    metric_id: 'generic_outcome',
    metric_definition: 'Source-reported outcome',
    value: 19.2,
    unit: 'USD/1000 impressions',
    entity_id: 'rewarded',
    entity_name: 'Rewarded',
    geo: 'US',
    platform: 'Android',
    period_start: '2026-10-19',
    period_end: '2026-10-25',
    granularity: 'week',
    methodology: 'Same store/provider estimate',
    source_reference: 'https://example.com/report',
    evidence_reference: 'https://example.com/report',
    verification_status: 'unverified',
    provenance_type: 'research_report',
    provenance_id: 'qa-report',
    observation_type: 'reported',
    scope_compatible: true,
    complete_observation: true,
    comparison_ready: true,
    validation_reasons: [],
    ...overrides,
  };
}

function report(observations: QuantitativeObservation[]): ResearchData {
  return {
    executive_summary: 'A sourced qualitative summary',
    key_takeaways: [],
    sections: [],
    entities: [],
    findings: [],
    evidence_references: [{ url: 'https://example.com/report', title: 'QA source report', source_location: null, verified: false }],
    benchmark_dimensions: [],
    research_gaps: [],
    po_recommendations: [],
    quantitative_observations: observations,
  };
}

describe('AutoResearchInsights', () => {
  afterEach(cleanup);

  it('renders a qualitative report without KPI placeholders or a fake chart', () => {
    render(<AutoResearchInsights data={report([])} onViewEvidence={() => undefined} />);
    expect(screen.getByText('Báo cáo định tính')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Số liệu nổi bật' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /So sánh theo GEO/ })).toBeNull();
  });

  it('renders source-bound generic KPI cards and links to the original report evidence', () => {
    const onEvidence = vi.fn();
    render(<AutoResearchInsights data={report([
      observation({ geo: 'US', value: 19.2 }),
      observation({ geo: 'JP', value: 13.1 }),
      observation({ geo: 'VN', value: 2.7 }),
    ])} onViewEvidence={onEvidence} />);
    expect(screen.getByRole('heading', { name: 'Số liệu nổi bật' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'So sánh theo GEO' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Xem bằng chứng cho Rewarded/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /Xem bằng chứng: JP/ }));
    expect(onEvidence).toHaveBeenCalledWith(1);
    expect(screen.getByText('Chưa xác minh độc lập')).toBeTruthy();
  });

  it('does not display unsafe observations as visualized facts', () => {
    render(<AutoResearchInsights data={report([
      observation({ value: 100, source_reference: null, complete_observation: false, comparison_ready: false }),
    ])} onViewEvidence={() => undefined} />);
    expect(screen.getByText(/Có 1 quan sát số liệu được báo cáo/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Số liệu nổi bật' })).toBeNull();
  });
});
