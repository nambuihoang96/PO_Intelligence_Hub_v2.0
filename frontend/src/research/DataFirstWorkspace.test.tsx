// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataFirstWorkspace, followHashAnchorWhenReady } from './DataFirstWorkspace';
import { researchApi, type ResearchProject } from './api';
import { reportApi } from '../reports/api';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, researchApi: { ...original.researchApi, getProject: vi.fn(), updateWorkspaceState: vi.fn(), listSavedInformation: vi.fn(), listSubjects: vi.fn(), listSubjectSources: vi.fn(), listBenchmarkCollections: vi.fn(), mapSubjectSource: vi.fn(), addBenchmarkCollectionSubject: vi.fn() } };
});

vi.mock('../reports/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../reports/api')>();
  return { ...original, reportApi: {
    ...original.reportApi,
    listProjectQuantitativeDatasets: vi.fn(), listProjectReports: vi.fn(), listComparisonDatasets: vi.fn(), getProjectQuantitativeDataset: vi.fn(), list: vi.fn(),
    linkReportToProject: vi.fn(), codexModels: vi.fn(), runCodexResearch: vi.fn(), import: vi.fn(),
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
    localStorage.clear(); localStorage.setItem('po-hub.codex-research-settings.v1', JSON.stringify({ enabled: false, model_slug: '' }));
    savedProject = project;
    vi.mocked(researchApi.getProject).mockImplementation(async () => savedProject as never);
    vi.mocked(researchApi.listSavedInformation).mockResolvedValue({ items: [], next_cursor: null, limit: 50 } as never);
    vi.mocked(researchApi.listSubjects).mockResolvedValue({ items: [], next_cursor: null, limit: 100 } as never);
    vi.mocked(researchApi.listSubjectSources).mockResolvedValue({ items: [], next_cursor: null, limit: 50 } as never);
    vi.mocked(researchApi.listBenchmarkCollections).mockResolvedValue({ items: [], next_cursor: null, limit: 100 } as never);
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
    vi.mocked(reportApi.codexModels).mockResolvedValue({ available: false, models: [], recommended_model_slug: null, message: 'Codex CLI chưa sẵn sàng.' });
    vi.mocked(reportApi.runCodexResearch).mockResolvedValue({ content: '# Codex research\n\nSource: https://example.com', model_slug: 'gpt-codex-mini' });
    vi.mocked(reportApi.import).mockResolvedValue({ ...report, id: 'saved-codex-report', origin: 'codex_cli_research' } as never);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); });

  async function openProductTable() {
    const summary = await screen.findByText(/Mở bảng số liệu gốc/);
    const details = summary.closest('details');
    if (details && !details.open) fireEvent.click(summary);
  }

  async function openAdvancedCsvFilters() {
    const summary = await screen.findByText(/Bộ lọc phạm vi, chỉ số và so sánh/);
    const details = summary.closest('details');
    if (details && !details.open) fireEvent.click(summary);
  }

  it('explores workspace-owned CSV, saves product selection, creates a manual ChatGPT prompt, and links the report', async () => {
    render(<DataFirstWorkspace projectId="workspace-1" />);
    // Default findBy timeout is 1000 ms; under the full parallel suite this render needs longer.
    await screen.findByRole('heading', { name: 'sensor-export.csv' }, { timeout: 5000 });
    await openProductTable();
    expect(screen.getByText(/1 phép đo · 0 đủ điều kiện phân tích tự động · 1 cần rà soát/)).toBeTruthy();
    expect(screen.getByText(/Tệp dữ liệu CSV/)).toBeTruthy();
    expect(screen.getAllByText(/Unified/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText('Chọn Alpha để nghiên cứu thêm (tùy chọn)'));
    await waitFor(() => expect(researchApi.updateWorkspaceState).toHaveBeenCalledWith('workspace-1', ['st-alpha'], null, expect.objectContaining({ dataset_id: 'dataset-1', selection_type: 'manual', source_entity_ids: ['st-alpha'] })));
    fireEvent.click(screen.getByText('Dùng ChatGPT thủ công (tùy chọn)'));
    expect(screen.getAllByRole('button', { name: 'Soạn và sao chép yêu cầu cho ChatGPT' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Soạn và sao chép yêu cầu cho ChatGPT' }));
    await waitFor(() => expect(screen.getByDisplayValue(/Dữ liệu nguồn đã chọn/)).toBeTruthy());
    expect(screen.getByDisplayValue(/coi là số liệu chưa xác minh/)).toBeTruthy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Soạn và sao chép yêu cầu cho ChatGPT' })).toBeNull();
    const openChatGPT = screen.getByRole('link', { name: 'Mở ChatGPT ở tab mới ↗' });
    expect(openChatGPT.getAttribute('href')).toBe('https://chatgpt.com/');
    expect(openChatGPT.getAttribute('target')).toBe('_blank');
    const importAnswerLink = new URL(screen.getByRole('link', { name: 'Nhập câu trả lời vào PO Hub' }).getAttribute('href')!, window.location.origin);
    expect(importAnswerLink.searchParams.get('projectId')).toBe('workspace-1');
    expect(importAnswerLink.searchParams.get('action')).toBe('import');
    expect(importAnswerLink.searchParams.get('source')).toBe('csv');
    expect(importAnswerLink.searchParams.get('question')).toBe('Tìm hiểu bối cảnh sản phẩm và thị trường của các sản phẩm đã chọn trong “ASMR market”.');
    expect(screen.getByText(/chỉ dùng bước này nếu muốn nghiên cứu thêm bằng ChatGPT/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Thêm báo cáo đã lưu'), { target: { value: 'report-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào dự án' }));
    await waitFor(() => expect(reportApi.linkReportToProject).toHaveBeenCalledWith('workspace-1', 'report-1'));
  }, 20000); // long multi-step flow; default 5000 ms testTimeout is exceeded under the full parallel suite

  it('opens CSV import in the active workspace without requiring a report', async () => {
    render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    fireEvent.click(screen.getByRole('button', { name: 'Nhập CSV' }));
    expect(await screen.findByText('CSV importer for workspace-1')).toBeTruthy();
  });

  it('keeps CSV analysis focused on datasets and removes saved notes and reports from that screen', async () => {
    render(<DataFirstWorkspace projectId="workspace-1" view="csv" />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Phân tích CSV' })).toBeTruthy();
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    expect(screen.getByText('TỆP TRONG BẢNG')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Ghi nhận xu hướng hoặc bằng chứng' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Báo cáo trong dự án' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'sensor-export.csv' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Kết quả tệp CSV' })).toBeTruthy();
    const analysis = document.querySelector('.csv-auto-analysis')!;
    const explorer = document.querySelector('.workspace-explorer')!;
    expect(analysis.compareDocumentPosition(explorer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('runs selected CSV research through Codex once and saves the preview as a Codex report', async () => {
    localStorage.setItem('po-hub.codex-research-settings.v1', JSON.stringify({ enabled: true, model_slug: '' }));
    vi.mocked(reportApi.codexModels).mockResolvedValue({ available: true, models: [{ slug: 'gpt-codex-mini', display_name: 'Codex Mini', is_default: false, recommended_for_testing: true }], recommended_model_slug: 'gpt-codex-mini', message: null });
    render(<DataFirstWorkspace projectId="workspace-1" view="csv" />);
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    await openProductTable();
    fireEvent.click(screen.getByLabelText('Chọn Alpha để nghiên cứu thêm (tùy chọn)'));
    await waitFor(() => expect(screen.getByLabelText('Model trả lời')).toHaveProperty('value', 'gpt-codex-mini'));
    fireEvent.click(screen.getByRole('button', { name: 'Nghiên cứu sản phẩm bằng Codex' }));
    expect(await screen.findByRole('heading', { name: 'Xem lại trước khi lưu' })).toBeTruthy();
    expect(reportApi.runCodexResearch).toHaveBeenCalledOnce();
    const request = vi.mocked(reportApi.runCodexResearch).mock.calls[0][0];
    expect(request.model_slug).toBe('gpt-codex-mini');
    expect(request.prompt).toContain('PO_RESEARCH_V1');
    expect(request.prompt).toContain('Downloads (Absolute)');
    expect(request.prompt).toContain('unverified');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }));
    await waitFor(() => expect(window.location.pathname).toBe('/reports/saved-codex-report'));
    expect(reportApi.import).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'workspace-1', origin: 'codex_cli_research', geo: 'Global / not specified', os: 'Unknown',
      content: '# Codex research\n\nSource: https://example.com',
    }));
  });

  it('keeps saved project information separate from CSV datasets', async () => {
    render(<DataFirstWorkspace projectId="workspace-1" view="notes" />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Thông tin đã lưu' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Ghi nhận xu hướng hoặc bằng chứng' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Tệp dữ liệu CSV' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'sensor-export.csv' })).toBeNull();
  });

  it('shows source values in a searchable and sortable product table, then creates and adds a profile to a selected comparison', async () => {
    const observations = [
      { ...dataset.observations[0], source_entity_id: 'st-alpha', source_entity_name: 'Alpha', value: 120 },
      { ...dataset.observations[0], source_entity_id: 'st-beta', source_entity_name: 'Beta', value: 240 },
    ];
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue({ ...dataset, source_apps: 2, observations } as never);
    const collection = { id: 'collection-1', project_id: 'workspace-1', name: 'Shortlist', description: null, members: [], dimensions: [], created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z' };
    vi.mocked(researchApi.listBenchmarkCollections).mockResolvedValue({ items: [collection], next_cursor: null, limit: 100 } as never);
    vi.mocked(researchApi.mapSubjectSource).mockResolvedValue({ project_id: 'workspace-1', source_kind: 'csv_entity', source_id: 'dataset-1', source_key: 'st-beta', source_name: 'Beta', source_type: null, context_name: 'sensor-export.csv', mapped_subject_id: 'subject-beta', mapped_subject_name: 'Beta', source_state: 'available' } as never);
    vi.mocked(researchApi.addBenchmarkCollectionSubject).mockResolvedValue({ ...collection, members: [{ subject_id: 'subject-beta', name: 'Beta', subject_type: 'product', source_count: 1, report_source_count: 0, csv_source_count: 1, trend_update_count: 0, observations: [] }] } as never);
    render(<DataFirstWorkspace projectId="workspace-1" />);
    // Default findBy timeout is 1000 ms; under the full parallel suite this render needs longer.
    await screen.findByRole('heading', { name: 'sensor-export.csv' }, { timeout: 5000 });
    await openProductTable();
    await openAdvancedCsvFilters();
    expect(screen.getAllByRole('columnheader', { name: /Lượt tải/ }).at(-1)).toBeTruthy();
    expect(screen.getByText(/240 lượt tải/)).toBeTruthy();
    expect(screen.getAllByText(/Đọc từ CSV · chưa xác minh độc lập/)).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Tìm sản phẩm'), { target: { value: 'Alpha' } });
    expect(within(within(document.querySelector('.workspace-explorer') as HTMLElement).getByRole('row', { name: /Alpha/ })).getByText('Alpha')).toBeTruthy();
    expect(within(document.querySelector('.workspace-explorer') as HTMLElement).queryByRole('row', { name: /Beta/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Tìm sản phẩm'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Bộ so sánh', { selector: 'summary' }));
    fireEvent.change(screen.getByLabelText('Danh sách so sánh'), { target: { value: 'collection-1' } });
    fireEvent.click(within(within(document.querySelector('.workspace-explorer') as HTMLElement).getByRole('row', { name: /Beta/ })).getByRole('button', { name: 'Thêm vào bộ so sánh' }));
    await waitFor(() => expect(researchApi.mapSubjectSource).toHaveBeenCalledWith('workspace-1', { source_kind: 'csv_entity', source_id: 'dataset-1', source_key: 'st-beta', create_subject_from_source: true }));
    await waitFor(() => expect(researchApi.addBenchmarkCollectionSubject).toHaveBeenCalledWith('workspace-1', 'collection-1', 'subject-beta'));
    expect((await screen.findAllByRole('status')).length).toBeGreaterThan(0);
  });

  it('adds multiple saved CSV metrics as columns and sorts directly from the chosen metric header', async () => {
    const observations = [
      { ...dataset.observations[0], source_entity_id: 'st-alpha', source_entity_name: 'Alpha', value: 120 },
      { ...dataset.observations[0], source_entity_id: 'st-alpha', source_entity_name: 'Alpha', metric_id: 'downloads_yoy_growth_percent', metric_definition: 'Downloads (YoY Growth %)', unit: '%', value: 10 },
      { ...dataset.observations[0], source_entity_id: 'st-alpha', source_entity_name: 'Alpha', metric_id: 'revenue_absolute', metric_definition: 'Revenue (Absolute)', unit: 'USD', value: 12 },
      { ...dataset.observations[0], source_entity_id: 'st-alpha', source_entity_name: 'Alpha', metric_id: 'dau_absolute', metric_definition: 'DAU (Absolute)', unit: 'users', value: 1000 },
      { ...dataset.observations[0], source_entity_id: 'st-alpha', source_entity_name: 'Alpha', metric_id: 'revenue_yoy_growth_percent', metric_definition: 'Revenue (YoY Growth %)', unit: '%', value: 7 },
      { ...dataset.observations[0], source_entity_id: 'st-beta', source_entity_name: 'Beta', value: 240 },
      { ...dataset.observations[0], source_entity_id: 'st-beta', source_entity_name: 'Beta', metric_id: 'downloads_yoy_growth_percent', metric_definition: 'Downloads (YoY Growth %)', unit: '%', value: 20 },
      { ...dataset.observations[0], source_entity_id: 'st-beta', source_entity_name: 'Beta', metric_id: 'revenue_absolute', metric_definition: 'Revenue (Absolute)', unit: 'USD', value: 30 },
      { ...dataset.observations[0], source_entity_id: 'st-beta', source_entity_name: 'Beta', metric_id: 'dau_absolute', metric_definition: 'DAU (Absolute)', unit: 'users', value: 2000 },
      { ...dataset.observations[0], source_entity_id: 'st-beta', source_entity_name: 'Beta', metric_id: 'revenue_yoy_growth_percent', metric_definition: 'Revenue (YoY Growth %)', unit: '%', value: 12 },
    ];
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue({ ...dataset, source_apps: 2, observations } as never);
    const { container } = render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    await openProductTable();
    await openAdvancedCsvFilters();
    const table = container.querySelector('.workspace-app-table') as HTMLTableElement;
    expect(table.querySelectorAll('thead th')).toHaveLength(7); // Selection, name, four visible metrics and action.
    fireEvent.click(screen.getByText('Chọn cột chỉ số · 4/5'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hiển thị cột Tăng/giảm doanh thu so với cùng kỳ (%)' }));
    expect(table.querySelectorAll('thead th')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: /Tăng\/giảm lượt tải so với cùng kỳ/ }));
    expect(table.querySelector('tbody tr th')?.textContent).toContain('Beta');
    fireEvent.click(screen.getByRole('button', { name: /Tăng\/giảm lượt tải so với cùng kỳ/ }));
    expect(table.querySelector('tbody tr th')?.textContent).toContain('Alpha');
    expect(screen.getAllByText(/Đọc từ CSV · chưa xác minh độc lập/)).toHaveLength(10);
  });

  it('shows the chart beside the table and excludes values from a different GEO group', async () => {
    const observations = [
      { ...dataset.observations[0], source_entity_id: 'st-alpha', source_entity_name: 'Alpha', value: 120 },
      { ...dataset.observations[0], source_entity_id: 'st-beta', source_entity_name: 'Beta', value: 240 },
      { ...dataset.observations[0], source_entity_id: 'st-gamma', source_entity_name: 'Gamma', geo: 'Canada', value: 500 },
    ];
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue({ ...dataset, source_apps: 3, observations } as never);
    const { container } = render(<DataFirstWorkspace projectId="workspace-1" view="csv" />);

    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    await openProductTable();
    const analysisGrid = container.querySelector('.csv-product-analysis-grid') as HTMLElement;
    expect(analysisGrid.querySelector('.workspace-app-table')).toBeTruthy();
    expect(analysisGrid.querySelector('.csv-values-chart')).toBeTruthy();
    const chart = screen.getByRole('list', { name: /Lượt tải theo từng sản phẩm/ });
    expect(within(chart).getAllByRole('listitem')).toHaveLength(2);
    expect(within(chart).getByText('Alpha')).toBeTruthy();
    expect(within(chart).getByText('Beta')).toBeTruthy();
    expect(within(chart).queryByText('Gamma')).toBeNull();
    expect(within(within(document.querySelector('.workspace-explorer') as HTMLElement).getByRole('row', { name: /Gamma/ })).getByText('Ngoài nhóm đang đối chiếu')).toBeTruthy();
  });

  it('does not draw a comparison chart when scope or period is unknown', async () => {
    const observations = ['Alpha', 'Beta'].map((name, index) => ({
      ...dataset.observations[0], source_entity_id: `st-${name.toLocaleLowerCase()}`, source_entity_name: name,
      value: 120 + index * 120, geo: 'Unknown', period_semantics: 'unknown',
    }));
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue({ ...dataset, source_apps: 2, observations } as never);
    render(<DataFirstWorkspace projectId="workspace-1" view="csv" />);

    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    expect(screen.queryByRole('list', { name: /theo từng sản phẩm/ })).toBeNull();
    expect(screen.getByText(/Chưa có ít nhất hai sản phẩm với cùng chỉ số, kỳ, phạm vi, đơn vị và phương pháp/)).toBeTruthy();
  });

  it('filters the data table and chart by the selected area without mixing other regions', async () => {
    const observations = [
      { ...dataset.observations[0], source_entity_id: 'st-alpha', source_entity_name: 'Alpha', value: 120 },
      { ...dataset.observations[0], source_entity_id: 'st-beta', source_entity_name: 'Beta', value: 240 },
      { ...dataset.observations[0], source_entity_id: 'st-gamma', source_entity_name: 'Gamma', geo: 'Canada', value: 500 },
    ];
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue({ ...dataset, source_apps: 3, observations } as never);
    render(<DataFirstWorkspace projectId="workspace-1" view="csv" />);
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    await openProductTable();
    await openAdvancedCsvFilters();

    fireEvent.change(screen.getByLabelText('Lọc theo khu vực'), { target: { value: 'Canada' } });
    expect(within(document.querySelector('.workspace-explorer') as HTMLElement).getByRole('row', { name: /Gamma/ })).toBeTruthy();
    expect(within(document.querySelector('.workspace-explorer') as HTMLElement).queryByRole('row', { name: /Alpha/ })).toBeNull();
    expect(screen.queryByRole('list', { name: /theo từng sản phẩm/ })).toBeNull();
    expect(screen.getByText(/Chưa có ít nhất hai sản phẩm với cùng chỉ số/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Lọc theo khu vực'), { target: { value: '__all__' } });
    expect(await screen.findByRole('list', { name: /Lượt tải theo từng sản phẩm/ })).toBeTruthy();
  });

  it('distinguishes an empty CSV cell from a non-numeric cell when both lack scope metadata', async () => {
    const observations = [
      { ...dataset.observations[0], source_entity_id: 'empty', source_entity_name: 'Empty', value: null, source_validation_reasons: ['CSV row 2 has an empty mapped value.', 'CSV row 2 is missing GEO.'] },
      { ...dataset.observations[0], source_entity_id: 'invalid', source_entity_name: 'Invalid', value: null, source_validation_reasons: ["CSV row 3 has a non-numeric value 'bad'.", 'CSV row 3 is missing GEO.'] },
    ];
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue({ ...dataset, source_apps: 2, observations } as never);
    render(<DataFirstWorkspace projectId="workspace-1" />);
    await openProductTable();
    const emptyRow = await screen.findByRole('row', { name: /Empty/ });
    expect(within(emptyRow).getByText('Chưa có giá trị')).toBeTruthy();
    expect(within(within(document.querySelector('.workspace-explorer') as HTMLElement).getByRole('row', { name: /Invalid/ })).getByText('Giá trị không hợp lệ')).toBeTruthy();
  });

  it('opens the explicitly selected project dataset from a Project Home deep link', async () => {
    const otherDataset = { ...dataset, id: 'dataset-2', filename: 'second-export.csv', content_sha256: 'second-hash' };
    const otherCatalog = { ...catalog, id: 'dataset-2', filename: 'second-export.csv', content_sha256: 'second-hash' };
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [catalog, otherCatalog], next_cursor: null, limit: 50 } as never);
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockImplementation(async (_id, datasetId) =>
      (datasetId === 'dataset-2' ? otherDataset : dataset) as never);
    window.history.replaceState({}, '', '/research?projectId=workspace-1&view=data&datasetId=dataset-2#project-csv-data');

    render(<DataFirstWorkspace projectId="workspace-1" />);

    await screen.findByRole('heading', { name: 'second-export.csv' });
    expect((screen.getByLabelText('Tệp đang mở trong bảng') as HTMLSelectElement).value).toBe('dataset-2');
    expect(reportApi.getProjectQuantitativeDataset).toHaveBeenCalledWith('workspace-1', 'dataset-2');
  });

  it('follows a deep link when its section is inserted after the workspace loads', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    window.history.replaceState({}, '', '/research#project-subject-profiles');
    const stopFollowing = followHashAnchorWhenReady();
    const anchor = document.createElement('section');
    anchor.id = 'project-subject-profiles';
    document.body.append(anchor);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' }));
    stopFollowing();
    anchor.remove();
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
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    await openProductTable();
    fireEvent.click(screen.getByRole('button', { name: 'Chọn 5 giá trị cao nhất trong nhóm này' }));
    await waitFor(() => expect(researchApi.updateWorkspaceState).toHaveBeenCalledWith(
      'workspace-1', ['st-6', 'st-5', 'st-4', 'st-3', 'st-2'], expect.stringContaining('Năm giá trị cao nhất được cung cấp'),
      expect.objectContaining({ dataset_id: 'dataset-1', dataset_filename: 'sensor-export.csv', selection_type: 'rule_based', measurement: expect.objectContaining({ geo: 'Worldwide', platform: 'Unified', period_start: '2026-09-01', period_end: '2026-09-30', metric_id: 'downloads_absolute' }) }),
    ));
    unmount();
    render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    await openProductTable();
    expect(screen.getByText(/5 sản phẩm từ “sensor-export.csv”/)).toBeTruthy();
    expect((screen.getByLabelText('Chọn Game 1 để nghiên cứu thêm (tùy chọn)') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Chọn Game 6 để nghiên cứu thêm (tùy chọn)') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByText('Dùng ChatGPT thủ công (tùy chọn)'));
    fireEvent.click(screen.getByRole('button', { name: 'Soạn và sao chép yêu cầu cho ChatGPT' }));
    await waitFor(() => expect(screen.getByDisplayValue(/Tiêu chí chọn: Năm giá trị cao nhất/)).toBeTruthy());
    expect(screen.getByDisplayValue(/Tệp CSV trong dự án: sensor-export.csv/)).toBeTruthy();
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
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    await openProductTable();
    expect((screen.getByLabelText('Chọn Alpha để nghiên cứu thêm (tùy chọn)') as HTMLInputElement).checked).toBe(true);
    unmount();
    render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    await openProductTable();
    fireEvent.change(screen.getByLabelText('Tệp đang mở trong bảng'), { target: { value: 'dataset-2' } });
    await screen.findByRole('heading', { name: 'other-export.csv' });
    expect(screen.getByText(/Danh sách đã lưu thuộc tệp dữ liệu “sensor-export.csv”/)).toBeTruthy();
    expect((screen.getByLabelText('Chọn Beta để nghiên cứu thêm (tùy chọn)') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Dùng ChatGPT thủ công (tùy chọn)'));
    fireEvent.click(screen.getByRole('button', { name: 'Soạn và sao chép yêu cầu cho ChatGPT' }));
    await waitFor(() => expect(reportApi.getProjectQuantitativeDataset).toHaveBeenCalledWith('workspace-1', 'dataset-1'));
    await waitFor(() => expect(screen.getByDisplayValue(/Tệp CSV trong dự án: sensor-export.csv/)).toBeTruthy());
  });

  it('does not claim a CSV insight product was selected while a saved shortlist belongs to another dataset', async () => {
    const context = {
      dataset_id: 'dataset-1', dataset_filename: 'sensor-export.csv', dataset_content_sha256: 'dataset-sha256',
      selection_type: 'manual' as const, source_entity_ids: ['appmagic:app-old'], selection_criterion: null,
      measurement: null, observation_refs: [],
    };
    savedProject = { ...project, workspace_state_json: { selected_app_ids: ['appmagic:app-old'], selected_app_criterion: null, selected_app_context: context } };
    const secondCatalog = { ...catalog, id: 'dataset-2', filename: 'new-export.csv', content_sha256: 'second-hash' };
    const secondDataset = {
      ...dataset, id: 'dataset-2', filename: 'new-export.csv', content_sha256: 'second-hash', source_apps: 2,
      observations: [
        { ...dataset.observations[0], source_entity_id: 'appmagic:app-a', source_provider: 'appmagic', source_entity_name: 'Puzzle A', value: 300 },
        { ...dataset.observations[0], source_entity_id: 'appmagic:app-b', source_provider: 'appmagic', source_entity_name: 'Puzzle B', value: 120, source_row_number: 3 },
      ],
    };
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [catalog, secondCatalog], next_cursor: null, limit: 50 } as never);
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockImplementation(async (_projectId, id) => (id === 'dataset-2' ? secondDataset : dataset) as never);

    render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    await openProductTable();
    fireEvent.change(screen.getByLabelText('Tệp đang mở trong bảng'), { target: { value: 'dataset-2' } });
    await screen.findByRole('heading', { name: 'new-export.csv' });
    await openProductTable();
    expect(screen.getByText(/Danh sách đã lưu thuộc tệp dữ liệu “sensor-export\.csv”, không phải tệp đang xem/)).toBeTruthy();
    expect((screen.getByLabelText('Chọn Puzzle A để nghiên cứu thêm (tùy chọn)') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Tạo danh sách mới từ tệp này (thay danh sách hiện tại)' })).toBeTruthy();
    expect(researchApi.updateWorkspaceState).not.toHaveBeenCalled();
  });

  it('keeps approximate or incomplete values out of automatic selection while leaving app selection available', async () => {
    const observations = Array.from({ length: 6 }, (_, index) => ({
      ...dataset.observations[0], source_entity_id: `st-${index}`, source_entity_name: `Game ${index}`,
      value: index, value_precision: 'approximate' as const,
    }));
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue({ ...dataset, observations } as never);
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [catalog], next_cursor: null, limit: 50 } as never);
    render(<DataFirstWorkspace projectId="workspace-1" />);
    await screen.findByRole('heading', { name: 'sensor-export.csv' });
    await openProductTable();
    expect(screen.getByText(/Chưa thể so sánh giá trị tự động/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Chọn 5 giá trị cao nhất trong nhóm này' })).toBeNull();
    expect((screen.getByLabelText('Chọn Game 0 để nghiên cứu thêm (tùy chọn)') as HTMLInputElement).disabled).toBe(false);
  });
  it('opens CSV intake from Project Home and clearly separates source date from an unverified measurement period', async () => {
    window.history.replaceState({}, '', '/research?projectId=workspace-1&view=data&action=import-csv#project-csv-data');
    vi.mocked(reportApi.getProjectQuantitativeDataset).mockResolvedValue({
      ...dataset,
      observations: [{
        ...dataset.observations[0],
        snapshot_date: '2026-10-14',
        period_start: null,
        period_end: null,
        period_semantics: 'unknown',
        analysis_ready: false,
        complete_observation: false,
      }],
    } as never);

    const { container } = render(<DataFirstWorkspace projectId="workspace-1" />);
    expect(await screen.findByText('CSV importer for workspace-1')).toBeTruthy();
    expect(container.querySelector('.data-first-workspace.csv-import-focus')).not.toBeNull();
    expect(container.querySelector('#project-csv-data')).not.toBeNull();
    await screen.findByText(/1 phép đo · 0 đủ điều kiện phân tích tự động · 1 cần rà soát/);
    expect(screen.getByText(/Chưa thể kết luận tăng trưởng hoặc so sánh chuẩn hóa/)).toBeTruthy();
    expect(screen.getAllByText(/Ngày trong CSV: 2026-10-14 · Chưa xác nhận kỳ dữ liệu/).length).toBeGreaterThan(0);
    const valueCell = container.querySelector('.workspace-app-table tbody td[data-label]');
    expect(valueCell?.getAttribute('data-label')).toContain('Lượt tải');
  });

});
