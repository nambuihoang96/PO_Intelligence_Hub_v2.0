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
    expect(screen.getByText('No quantitative observations are linked to this report.')).toBeTruthy();
    expect(screen.getByText('Qualitative research remains usable on its own. When quantitative observations are supplied, they will appear here; a CSV is optional.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Link a CSV dataset to this report' }));
    expect(importCsv).toHaveBeenCalledTimes(1);
  });

  it('derives filter choices from observations and opens the chosen report evidence record', () => {
    const openEvidence = vi.fn();
    const { container } = render(<AnalyticsDataSelection reportId="report-1" observations={[observation(), observation({ entity_id: 'app-b', entity_name: 'App B', geo: 'VN', platform: 'iOS', period_start: '2025-03-01', period_end: '2025-03-31' })]} datasets={[]} onViewEvidence={openEvidence} onImportCsv={() => undefined} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'GEO' }), { target: { value: 'VN' } });
    expect(container.querySelectorAll('.analytics-observation')).toHaveLength(1);
    expect(container.querySelector('.analytics-observation')?.textContent).toContain('App B');
    expect(container.querySelector('.analytics-observation')?.textContent).not.toContain('App A');
    fireEvent.click(screen.getByRole('button', { name: 'View evidence record' }));
    expect(openEvidence).toHaveBeenCalledWith(expect.objectContaining({ source: 'research_report', index: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(container.querySelectorAll('.analytics-observation')).toHaveLength(2);
    fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '2025-03-01|2025-03-31' } });
    expect(container.querySelectorAll('.analytics-observation')).toHaveLength(1);
  });

  it('shows report and linked CSV observations together with separate provenance and evidence navigation', () => {
    const openEvidence = vi.fn();
    const imported = observation({ observation_type: 'imported', provenance_type: 'csv_dataset', provenance_id: 'csv-1', entity_id: 'app-b', entity_name: 'App B' });
    render(<AnalyticsDataSelection reportId="report-1" observations={[observation()]} datasets={[csvDataset([imported])]} onViewEvidence={openEvidence} onImportCsv={() => undefined} />);
    expect(screen.getAllByText(/ChatGPT research/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/CSV imported/).length).toBeGreaterThan(0);
    expect(screen.getByText('1 compatible comparison group')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Data source' }), { target: { value: 'csv_dataset' } });
    expect(screen.getAllByRole('button', { name: 'View evidence record' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'View evidence record' }));
    expect(openEvidence).toHaveBeenCalledWith(expect.objectContaining({ source: 'csv_dataset', sourceId: 'csv-1', index: 0 }));
  });

  it('keeps incomplete and out-of-scope rows visible and exposes why they are excluded', () => {
    const incomplete = observation({ entity_id: 'app-b', entity_name: 'App B', value: null, complete_observation: false, comparison_ready: false, validation_reasons: ['Missing exact numeric value.'] });
    const { container } = render(<AnalyticsDataSelection reportId="report-1" observations={[observation(), incomplete]} datasets={[]} onViewEvidence={() => undefined} onImportCsv={() => undefined} />);
    const cards = container.querySelectorAll('.analytics-observation');
    expect(cards).toHaveLength(2);
    expect(cards[1].textContent).toContain('App B');
    expect(cards[1].textContent).toContain('Unknown');
    fireEvent.click(within(cards[1] as HTMLElement).getByText(/Why excluded/));
    expect(screen.getAllByText('Missing exact numeric value.').length).toBeGreaterThan(0);
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
    fireEvent.change(screen.getByRole('combobox', { name: 'Entity' }), { target: { value: 'source:sensor_tower:source-3' } });
    expect(screen.getAllByText('Source-only App 3')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'View evidence record' }));
    expect(openEvidence).toHaveBeenCalledWith(expect.objectContaining({ source: 'csv_dataset', sourceId: 'csv-1', index: 0 }));
  });
});
