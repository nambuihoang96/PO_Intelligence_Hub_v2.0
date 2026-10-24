// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataFirstWorkspace } from './DataFirstWorkspace';
import { researchApi, type ResearchProject } from './api';
import { reportApi } from '../reports/api';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, researchApi: { ...original.researchApi, getProject: vi.fn(), updateWorkspaceState: vi.fn() } };
});

vi.mock('../reports/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../reports/api')>();
  return { ...original, reportApi: {
    ...original.reportApi,
    listProjectQuantitativeDatasets: vi.fn(), listProjectReports: vi.fn(), listComparisonDatasets: vi.fn(), getProjectQuantitativeDataset: vi.fn(), list: vi.fn(),
    linkReportToProject: vi.fn(),
  } };
});

vi.mock('../reports/QuantitativeDatasetImport', () => ({
  QuantitativeDatasetImport: ({ projectId }: { projectId: string }) => <div>CSV importer for {projectId}</div>,
}));

const project: ResearchProject = { id: 'workspace-1', name: 'ASMR market', workspace_state_json: { selected_app_ids: [] }, created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z', owner: null, category: null };
const dataset = {
  id: 'dataset-1', project_id: 'workspace-1', report_id: null, filename: 'sensor-export.csv',
  source_rows: 2, source_apps: 1, observations: [{
    source_entity_id: 'st-alpha', source_entity_name: 'Alpha', entity_id: null, entity_name: null,
    metric_definition: 'Downloads (Absolute)', metric_id: 'downloads_absolute', value: 120,
    unit: 'downloads', geo: 'Worldwide', platform: 'Unified', snapshot_date: null,
    period_start: '2026-09-01', period_end: '2026-09-30', granularity: 'rolling_interval',
    methodology: 'Sensor export', source_reference: null, evidence_reference: null,
    verification_status: 'unverified', validation_reasons: [], source_row_number: 2,
    value_precision: 'exact', complete_observation: true, analysis_ready: true, import_status: 'imported',
    source_validation_reasons: [], metadata_validation_reasons: [], period_semantics: 'reporting_interval',
  }],
  content_sha256: 'dataset-sha256',
};
const catalog = { id: 'dataset-1', project_id: 'workspace-1', report_id: null, filename: 'sensor-export.csv', content_sha256: 'dataset-sha256', created_at: '2026-10-23T00:00:00Z', compatibility_status: 'compatible', metrics: [], periods: [], geo_values: ['Worldwide'], platform_values: ['Unified'], source_apps: 1, warnings: [] };
const report = { id: 'report-1', project_id: null, question: 'Why are these products growing?', geo: 'Worldwide', os: 'Unified', research_period: '2026', imported_at: '2026-10-23T00:00:00Z' };
let savedProject = project;

describe('DataFirstWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedProject = project;
    vi.mocked(researchApi.getProject).mockImplementation(async () => savedProject as never);
    vi.mocked(researchApi.updateWorkspaceState).mockImplementation(async (_id, selected_app_ids, selected_app_criterion, selected_app_context) => {
      savedProject = { ...project, workspace_state_json: { selected_app_ids, selected_app_criterion, ...(selected_app_context ? { selected_app_context } : {}) } };
      return savedProject as never;
    });
    vi.mocked(reportApi.listProjectQuantitativeDatasets).mockResolvedValue({ items: [dataset], next_cursor: null, limit: 100 } as never);
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [catalog], next_cursor: null, limit: 50 } as never);
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue(dataset as never);
    vi.mocked(reportApi.listProjectReports).mockResolvedValue({ items: [], next_cursor: null, limit: 100 } as never);
    vi.mocked(reportApi.list).mockResolvedValue({ items: [report], next_cursor: null, limit: 100 } as never);
    vi.mocked(reportApi.linkReportToProject).mockResolvedValue({ ...report, project_id: 'workspace-1' } as never);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  afterEach(() => cleanup());

  it('explores workspace-owned CSV, saves product selection, creates a manual ChatGPT prompt, and links the report', async () => {
    render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByText('sensor-export.csv');
    expect(screen.getByText(/CSV datasets/)).toBeTruthy();
    expect(screen.getAllByText(/Unified/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText('Select Alpha for ChatGPT research'));
    await waitFor(() => expect(researchApi.updateWorkspaceState).toHaveBeenCalledWith('workspace-1', ['st-alpha'], null, expect.objectContaining({ dataset_id: 'dataset-1', selection_type: 'manual', source_entity_ids: ['st-alpha'] })));
    fireEvent.click(screen.getByRole('button', { name: 'Research these apps with ChatGPT' }));
    await waitFor(() => expect(screen.getByDisplayValue(/Selected source data/)).toBeTruthy());
    expect(screen.getByDisplayValue(/treat as unverified estimates/)).toBeTruthy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Add an existing report'), { target: { value: 'report-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to workspace' }));
    await waitFor(() => expect(reportApi.linkReportToProject).toHaveBeenCalledWith('workspace-1', 'report-1'));
  });

  it('opens CSV import in the active workspace without requiring a report', async () => {
    render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByText('sensor-export.csv');
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    expect(await screen.findByText('CSV importer for workspace-1')).toBeTruthy();
  });

  it('selects five products by the highest exact values in the selected CSV and carries the criterion into the ChatGPT prompt', async () => {
    const observations = Array.from({ length: 6 }, (_, index) => ({
      ...dataset.observations[0],
      source_entity_id: `st-${index + 1}`,
      source_entity_name: `Game ${index + 1}`,
      value: (index + 1) * 100,
      source_row_number: index + 2,
    }));
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({
      items: [catalog], next_cursor: null, limit: 50,
    } as never);
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue({ ...dataset, source_rows: 6, source_apps: 6, observations } as never);

    const { unmount } = render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByText('sensor-export.csv');
    fireEvent.click(screen.getByRole('button', { name: 'Select 5 highest values in this CSV' }));
    await waitFor(() => expect(researchApi.updateWorkspaceState).toHaveBeenCalledWith(
      'workspace-1', ['st-6', 'st-5', 'st-4', 'st-3', 'st-2'], expect.stringContaining('Five highest supplied values'),
      expect.objectContaining({ dataset_id: 'dataset-1', selection_type: 'rule_based', measurement: expect.objectContaining({ geo: 'Worldwide', platform: 'Unified', period_start: '2026-09-01' }) }),
    ));
    unmount();
    render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByText('sensor-export.csv');
    expect(screen.getByText(/5 selected · sensor-export.csv/)).toBeTruthy();
    expect((screen.getByLabelText('Select Game 1 for ChatGPT research') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Select Game 6 for ChatGPT research') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Research these apps with ChatGPT' }));
    await waitFor(() => expect(screen.getByDisplayValue(/Selection criterion: Five highest supplied values/)).toBeTruthy());
    expect(screen.getByDisplayValue(/Saved source dataset: sensor-export.csv/)).toBeTruthy();
  });

  it('reopens a saved shortlist with its dataset context and does not reinterpret it after switching datasets', async () => {
    const context = {
      dataset_id: 'dataset-1', dataset_filename: 'sensor-export.csv', dataset_content_sha256: 'dataset-sha256',
      selection_type: 'manual' as const, source_entity_ids: ['st-alpha'], selection_criterion: null,
      measurement: null, observation_refs: [{ source_entity_id: 'st-alpha', source_row_number: 2, metric_id: 'downloads_absolute' }],
    };
    savedProject = { ...project, workspace_state_json: { selected_app_ids: ['st-alpha'], selected_app_criterion: null, selected_app_context: context } };
    const secondDataset = { ...dataset, id: 'dataset-2', filename: 'other-export.csv', content_sha256: 'dataset-sha256-2', observations: [{ ...dataset.observations[0], source_entity_id: 'st-beta', source_entity_name: 'Beta' }] };
    const secondCatalog = { ...catalog, id: 'dataset-2', filename: 'other-export.csv', content_sha256: 'dataset-sha256-2' };
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [catalog, secondCatalog], next_cursor: null, limit: 50 } as never);
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockImplementation(async (_projectId, id) => (id === 'dataset-1' ? dataset : secondDataset) as never);

    const { unmount } = render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByText('sensor-export.csv');
    expect((screen.getByLabelText('Select Alpha for ChatGPT research') as HTMLInputElement).checked).toBe(true);
    unmount();
    render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByText('sensor-export.csv');
    fireEvent.change(screen.getByLabelText('Dataset to explore'), { target: { value: 'dataset-2' } });
    await screen.findByText('other-export.csv');
    expect(screen.getByText(/Shortlist này thuộc dataset “sensor-export.csv”/)).toBeTruthy();
    expect((screen.getByLabelText('Select Beta for ChatGPT research') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Copy research prompt from saved shortlist' }));
    await waitFor(() => expect(reportApi.getProjectQuantitativeDataset).toHaveBeenCalledWith('workspace-1', 'dataset-1'));
    await waitFor(() => expect(screen.getByDisplayValue(/Saved source dataset: sensor-export.csv/)).toBeTruthy());
  });

  it('keeps approximate or incomplete values out of automatic selection while leaving app selection available', async () => {
    const observations = Array.from({ length: 6 }, (_, index) => ({
      ...dataset.observations[0], source_entity_id: `st-${index}`, source_entity_name: `Game ${index}`,
      value: index, value_precision: 'approximate' as const,
    }));
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue({ ...dataset, observations } as never);
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [catalog], next_cursor: null, limit: 50 } as never);
    render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByText('sensor-export.csv');
    expect(screen.getByText(/Automatic candidate selection is unavailable/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Select 5 highest values in this CSV' })).toBeNull();
    expect((screen.getByLabelText('Select Game 0 for ChatGPT research') as HTMLInputElement).disabled).toBe(false);
  });
});
