export type ReportSummary = {
  id: string;
  project_id?: string | null;
  question: string;
  geo: string;
  os: string;
  research_period: string | null;
  content_sha256: string;
  origin: 'chatgpt_user_import';
  imported_at: string;
  verification_status: 'unverified';
};

export type ResearchData = {
  executive_summary?: string | null;
  key_takeaways?: string[];
  sections: { heading: string; content: string; hierarchy: number; source_location: string | null; lists: { ordered: boolean; items: string[]; source_location?: string | null }[]; tables: { columns: string[]; rows: string[][]; source_location?: string | null }[] }[];
  entities: { key: string; entity_type: string; name: string; attributes: Record<string, unknown>; evidence_references: string[] }[];
  findings: { key: string; finding_type: string; title: string; description: string; related_entities: string[]; evidence_references: string[]; source_locations: string[]; scope: Record<string, unknown>; evidence_status: string; confidence: number | null; uncertainty: string | null; po_implications: string | null }[];
  evidence_references: { url: string; title: string | null; source_location: string | null; verified: boolean }[];
  benchmark_dimensions: { key: string; name: string; related_entities: string[]; evidence_references: string[]; observations: { entity_key: string | null; value: unknown; evidence_references: string[]; source_locations: string[]; evidence_status: string; uncertainty: string | null }[]; po_notes: string | null }[];
  research_gaps: string[];
  po_recommendations: string[];
  quantitative_observations?: QuantitativeObservation[];
};
export type QuantitativeObservation = {
  metric_id: string | null;
  metric_definition: string | null;
  value: number | null;
  value_precision?: 'exact' | 'approximate';
  reported_value_text?: string | null;
  unit: string | null;
  entity_id: string | null;
  entity_name?: string | null;
  source_entity_id?: string | null;
  source_entity_name?: string | null;
  source_provider?: string | null;
  entity_resolution_state?: 'matched' | 'source_only' | 'ambiguous' | 'conflict' | null;
  geo: string | null;
  platform: string | null;
  period_start: string | null;
  period_end: string | null;
  snapshot_date?: string | null;
  period_semantics?: 'reporting_interval' | 'rolling_interval' | 'snapshot' | 'unknown';
  granularity: string | null;
  methodology?: string | null;
  source_reference: string | null;
  evidence_reference?: string | null;
  verification_status: 'unverified' | 'needs_review' | 'verified';
  provenance_type: 'research_report' | 'csv_dataset';
  provenance_id: string | null;
  observation_type: 'reported' | 'imported' | 'calculated';
  validation_reasons: string[];
  source_validation_reasons?: string[];
  metadata_validation_reasons?: string[];
  metadata_provenance?: Record<string, { basis: 'csv' | 'provider_documentation' | 'po_unverified' | 'unknown'; original_value?: string | null; value?: string | null; source_url?: string | null; source_excerpt?: string; confirmed_at?: string | null }>;
  report_compatibility_reasons?: string[];
  report_compatibility?: 'compatible' | 'incompatible' | 'unknown';
  scope_compatible?: boolean | null;
  import_status?: 'preview' | 'imported' | 'reported';
  complete_observation?: boolean;
  display_ready?: boolean;
  analysis_ready?: boolean;
  dataset_comparison_ready?: boolean;
  comparison_ready?: boolean;
  source_row_number?: number | null;
};
export type QuantitativeDataset = {
  id: string; report_id: string | null; project_id?: string | null; filename: string; content_sha256: string;
  field_mapping: Record<string, string>; entity_mappings: Record<string, string>;
  observations: QuantitativeObservation[]; compatibility_status: 'compatible' | 'partial' | 'incompatible';
  validation_reasons: string[]; created_at: string; duplicate: boolean;
  imported_successfully?: boolean; complete_observations?: number; scope_compatible_observations?: number;
  comparison_ready_observations?: number; comparison_readiness?: 'no_complete_observations' | 'needs_compatible_pair';
  source_rows?: number; source_apps?: number; recognized_metrics?: number; display_ready_observations?: number;
  analysis_ready_observations?: number; dataset_comparison_ready_observations?: number;
  report_compatible_observations?: number; incomplete_observations?: number;
};
export type QuantitativeDatasetPage = { items: QuantitativeDataset[]; next_cursor: string | null; limit: number };
export type MetadataField = { value: string | null; original_value: string | null; original_basis: string; basis: string; source_url: string | null; source_excerpt: string; confirmed_at: string | null };
export type DatasetMetadata = { dataset_id: string; report_id: string | null; project_id?: string | null; filename: string; content_sha256: string; revision: number; groups: { key: string; metric: string; observations: number; fields: Record<string, MetadataField> }[]; history: { field: string; recorded_at: string; next: { value: string | null; basis: string; source_url: string | null } }[] };
export type MetadataChange = { group_key: string; field: string; value: string | null; basis: 'provider_documentation' | 'po_unverified' | 'unknown'; source_url: string | null; source_excerpt: string; attested: boolean; replace_existing: boolean };
export type BenchmarkSelection = { item_type: 'entity' | 'finding' | 'dimension'; item_key: string };
export type BenchmarkWorkspaceEntry = BenchmarkSelection & { po_assessment: string; notes: string; next_action: string; dimension_assessments: Record<string, string>; observation_finding_links?: Record<string, string[]> };
export type BenchmarkWorkspace = { custom_dimensions: string[]; entries: BenchmarkWorkspaceEntry[] };
export type ImportedReport = ReportSummary & { content: string; parse_status: 'PARSED' | 'PARTIAL' | 'NEEDS_STRUCTURING'; research_status?: 'STRUCTURED_READY' | 'STRUCTURED_PARTIAL' | 'TEXT_ONLY'; research_contract_version?: 'po_research_v1'; research_data: ResearchData; extraction_error: string | null; benchmark_selections: BenchmarkSelection[]; benchmark_workspace: BenchmarkWorkspace; structured_update_available?: boolean; orphaned_benchmark_selections?: BenchmarkSelection[]; orphaned_benchmark_entries?: BenchmarkWorkspaceEntry[]; duplicate?: boolean };
export type ReportPage = { items: ReportSummary[]; next_cursor: string | null; limit: number };
export type ReportInput = Pick<ReportSummary, 'question' | 'geo' | 'os' | 'research_period'> & { project_id?: string | null; content: string; structured_json?: string };
export type QuantitativeMetricColumnMapping = { column: string; metric_id: string; metric_definition: string; unit?: string | null; methodology?: string | null };
export type QuantitativeDatasetInput = { filename: string; csv_content: string; field_mapping: Record<string, string>; entity_mappings?: Record<string, string>; metric_mappings?: QuantitativeMetricColumnMapping[]; explicit_values?: Record<string, string> };
export type QuantitativeDatasetPreview = {
  observations: QuantitativeObservation[]; validation_reasons: string[]; ambiguities: { csv_value: string; csv_name?: string | null; row: number; candidates: string[] }[]; unmatched_entities?: { csv_value: string; csv_name?: string | null; row: number; candidates: string[] }[];
  compatibility_status: 'compatible' | 'partial' | 'incompatible'; total_rows: number; complete_observations: number;
  scope_compatible_observations: number; comparison_ready_observations: number; duplicate_rows: number;
  source_apps?: number; source_only_entities?: number; matched_entities?: number;
  dataset_analysis_ready_observations?: number; dataset_comparison_ready_observations?: number;
  report_compatible_observations?: number;
};

export type ComparisonMetric = { key: string; metric_id: string | null; metric_definition: string | null; unit: string | null; methodology: string | null; observations: number; usable_observations: number; warnings: string[] };
export type ComparisonPeriod = { key: string; semantics: 'reporting_interval' | 'rolling_interval' | 'snapshot' | 'unknown'; period_start: string | null; period_end: string | null; snapshot_date: string | null; snapshot_date_candidate: string | null; granularity: string | null; observations: number; usable_observations: number; metric_keys: string[]; geos: string[]; platforms: string[]; warnings: string[] };
export type ComparisonDataset = { id: string; report_id: string | null; project_id?: string | null; report_question: string | null; filename: string; content_sha256: string; created_at: string; compatibility_status: 'compatible' | 'partial' | 'incompatible'; metrics: ComparisonMetric[]; periods: ComparisonPeriod[]; geo_values: string[]; platform_values: string[]; source_apps: number; warnings: string[] };
export type ComparisonDatasetPage = { items: ComparisonDataset[]; next_cursor: string | null; limit: number };
export type QuantitativeComparisonRow = { entity_key: string; entity_name: string; matched_by: 'provider_source_id' | 'unmatched_source_id'; status: 'comparable' | 'missing_baseline' | 'missing_current' | 'identity_conflict' | 'duplicate_observations' | 'incompatible_periods' | 'needs_review'; baseline: ComparisonSource | null; current: ComparisonSource | null; absolute_change: number | null; change_unit: string | null; percentage_change: number | null; percentage_change_unavailable_reason: string | null; formula: string | null; evidence: ComparisonSource[]; reasons: string[] };
export type ComparisonSource = { value: number | null; value_precision: 'exact' | 'approximate'; unit: string | null; geo: string | null; platform: string | null; period_start: string | null; period_end: string | null; snapshot_date: string | null; period_semantics: 'reporting_interval' | 'rolling_interval' | 'snapshot' | 'unknown'; granularity: string | null; methodology: string | null; entity_name: string | null; source_entity_id: string | null; source_provider: string | null; verification_status: 'unverified' | 'needs_review' | 'verified'; dataset_id: string; filename: string; report_id: string | null; report_question: string | null; source_row_number: number | null; source_reference: string | null; provenance_id: string | null; validation_reasons: string[]; metadata_provenance?: QuantitativeObservation['metadata_provenance'] };
export type QuantitativeComparisonPreview = { baseline: ComparisonDataset; current: ComparisonDataset; metric: ComparisonMetric; geo: string; platform: string; baseline_period: ComparisonPeriod; current_period: ComparisonPeriod; period_readiness: { compatible: boolean; kind: 'reporting_interval' | 'rolling_interval' | 'snapshot' | 'unknown'; reasons: string[] }; summary: { matched_apps: number; baseline_only_apps: number; current_only_apps: number; distinct_apps: number; comparable_apps: number; missing_data_apps: number; ambiguous_apps: number; duplicate_observation_apps: number; invalid_observations: number }; rows: QuantitativeComparisonRow[]; metric_warnings: string[] };
export type QuantitativeComparisonInput = { baseline_dataset_id: string; current_dataset_id: string; metric_id: string; metric_definition: string; unit: string; methodology: string; geo: string; platform: string; baseline_period_key: string; current_period_key: string; baseline_semantics_confirmation?: 'reporting_interval' | 'rolling_interval' | 'snapshot'; current_semantics_confirmation?: 'reporting_interval' | 'rolling_interval' | 'snapshot' };

function readableValidationErrors(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];
  return errors.map((entry) => {
    const item = entry as { location?: unknown[]; message?: string; msg?: string };
    const location = (item.location ?? []).filter((part) => part !== 'body').join('.');
    const fieldNames: Record<string, string> = { content: 'Nội dung báo cáo', question: 'Câu hỏi nghiên cứu', geo: 'GEO', os: 'Environment', research_period: 'Kỳ nghiên cứu', structured_json: 'Structured JSON' };
    const field = location.split('.')[0];
    const label = fieldNames[field] ?? (location || 'Dữ liệu');
    let reason = item.message ?? item.msg ?? 'Giá trị không hợp lệ.';
    const maximum = /at most ([\d,]+) characters/i.exec(reason)?.[1];
    if (maximum) reason = `vượt giới hạn ${Number(maximum.replaceAll(',', '')).toLocaleString('vi-VN')} ký tự. Hãy rút ngắn nội dung rồi thử lại.`;
    else if (/at least 1 character|must not be blank/i.test(reason)) reason = 'không được để trống. Hãy bổ sung giá trị.';
    else if (/valid string/i.test(reason)) reason = 'phải là văn bản hợp lệ. Hãy kiểm tra nội dung trường này.';
    else if (/extra inputs are not permitted/i.test(reason)) reason = 'chứa trường không được hỗ trợ. Hãy xóa trường đó và thử lại.';
    return `${label}: ${reason}`;
  });
}

async function request<T>(url: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Yêu cầu quá thời gian chờ 30 giây. Nội dung vẫn được giữ; hãy kiểm tra backend rồi bấm thử lại. Hệ thống không tự gửi lại.');
    throw new Error('Không kết nối được tới backend. Nội dung vẫn được giữ; hãy kiểm tra ứng dụng local rồi thử lại. Hệ thống không tự gửi lại.');
  } finally {
    window.clearTimeout(timeout);
  }
  let body: Record<string, any> | null;
  try { body = await response.json(); } catch { body = null; }
  const apiError = body?.error;
  const detail = apiError?.message ?? body?.detail?.[0]?.msg ?? body?.detail ?? body?.message;
  if (!response.ok) {
    if (response.status === 404 && /\/api\/v1\/reports\/[^/]+\/benchmark-state(?:\?|$)/.test(url)) {
      const error = new Error('Benchmark was not saved. The local backend may be outdated. Your selection and PO notes are still on this screen; close the running PO Hub windows, reopen run.bat, then try again.') as Error & { diagnostics?: string };
      error.diagnostics = `HTTP 404 · ${url}`;
      throw error;
    }
    if (response.status === 404 && url.endsWith('/structure-from-response')) {
      throw new Error('Backend local đang chạy phiên bản cũ, chưa có chức năng cấu trúc báo cáo. Hãy đóng cửa sổ/terminal PO Intelligence Hub đang chạy, rồi mở lại run.bat. Câu trả lời vừa dán vẫn được giữ để thử lại.');
    }
    const validation = readableValidationErrors(apiError?.details?.errors ?? body?.detail?.errors);
    const reason = validation.length ? `\n${validation.map((item) => `• ${item}`).join('\n')}` : '';
    const headline = validation.length && detail === 'Request validation failed.' ? 'Hãy sửa các trường chưa hợp lệ:' : (typeof detail === 'string' ? detail : 'Backend không thể lưu báo cáo. Kiểm tra dữ liệu và thử lại.');
    const code = apiError?.code ? ` [${apiError.code}]` : '';
    throw new Error(`${headline}${code}${reason}\nHTTP ${response.status} · ${url}\nNội dung nhập vẫn được giữ. Bạn có thể sửa lỗi và thử lại.`);
  }
  if (body === null) throw new Error('Backend trả về phản hồi không đọc được. Vui lòng thử lại.');
  if (body.research_contract_version && body.research_contract_version !== 'po_research_v1') {
    throw new Error(`Phiên bản research contract không tương thích (${String(body.research_contract_version)}). Hãy khởi động backend đúng phiên bản rồi thử lại.`);
  }
  return body as T;
}

export const reportApi = {
  import: (input: ReportInput) => request<ImportedReport>('/api/v1/reports', { method: 'POST', body: JSON.stringify(input) }),
  list: (cursor?: string) => request<ReportPage>(`/api/v1/reports?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  get: (id: string) => request<ImportedReport>(`/api/v1/reports/${encodeURIComponent(id)}`),
  updateBenchmarkSelections: (id: string, selections: BenchmarkSelection[]) => request<ImportedReport>(`/api/v1/reports/${encodeURIComponent(id)}/benchmark-selections`, { method: 'PUT', body: JSON.stringify({ selections }) }),
  reprocess: (id: string) => request<ImportedReport & { reprocessed: boolean; message: string }>(`/api/v1/reports/${encodeURIComponent(id)}/reprocess`, { method: 'POST' }),
  updateStructuredData: (id: string, research_data: ResearchData) => request<ImportedReport>(`/api/v1/reports/${encodeURIComponent(id)}/structured-data`, { method: 'PUT', body: JSON.stringify({ research_data }) }),
  structureFromResponse: (id: string, response: string) => request<ImportedReport>(`/api/v1/reports/${encodeURIComponent(id)}/structure-from-response`, { method: 'PUT', body: JSON.stringify({ response }) }),
  updateBenchmarkState: (id: string, selections: BenchmarkSelection[], workspace: BenchmarkWorkspace) => request<ImportedReport>(`/api/v1/reports/${encodeURIComponent(id)}/benchmark-state`, { method: 'PUT', body: JSON.stringify({ ...workspace, selections }) }),
  updateBenchmarkWorkspace: (id: string, workspace: BenchmarkWorkspace) => request<ImportedReport>(`/api/v1/reports/${encodeURIComponent(id)}/benchmark-workspace`, { method: 'PUT', body: JSON.stringify(workspace) }),
  listQuantitativeDatasets: (id: string, cursor?: string) => request<QuantitativeDatasetPage>(`/api/v1/reports/${encodeURIComponent(id)}/quantitative-datasets?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  listComparisonDatasets: (cursor?: string, projectId?: string) => request<ComparisonDatasetPage>(`/api/v1/quantitative-comparisons/datasets?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${projectId ? `&project_id=${encodeURIComponent(projectId)}` : ''}`),
  previewQuantitativeComparison: (input: QuantitativeComparisonInput) => request<QuantitativeComparisonPreview>('/api/v1/quantitative-comparisons/preview', { method: 'POST', body: JSON.stringify(input) }),
  previewQuantitativeDataset: (id: string, input: QuantitativeDatasetInput) => request<QuantitativeDatasetPreview>(`/api/v1/reports/${encodeURIComponent(id)}/quantitative-datasets/preview`, { method: 'POST', body: JSON.stringify(input) }),
  importQuantitativeDataset: (id: string, input: QuantitativeDatasetInput) => request<QuantitativeDataset>(`/api/v1/reports/${encodeURIComponent(id)}/quantitative-datasets`, { method: 'POST', body: JSON.stringify(input) }),
  revalidateQuantitativeDataset: (reportId: string, datasetId: string) => request<QuantitativeDataset>(`/api/v1/reports/${encodeURIComponent(reportId)}/quantitative-datasets/${encodeURIComponent(datasetId)}/revalidate`, { method: 'POST' }),
  getQuantitativeDataset: (reportId: string, datasetId: string) => request<QuantitativeDataset>(`/api/v1/reports/${encodeURIComponent(reportId)}/quantitative-datasets/${encodeURIComponent(datasetId)}`),
  findQuantitativeDataset: (reportId: string, digest: string) => request<QuantitativeDataset | null>(`/api/v1/reports/${encodeURIComponent(reportId)}/quantitative-dataset-by-hash/${digest}`),
  getDatasetMetadata: (reportId: string, datasetId: string) => request<DatasetMetadata>(`/api/v1/reports/${encodeURIComponent(reportId)}/quantitative-datasets/${encodeURIComponent(datasetId)}/metadata`),
  updateDatasetMetadata: (reportId: string, datasetId: string, expected_revision: number, changes: MetadataChange[]) => request<DatasetMetadata>(`/api/v1/reports/${encodeURIComponent(reportId)}/quantitative-datasets/${encodeURIComponent(datasetId)}/metadata`, { method: 'PUT', body: JSON.stringify({ expected_revision, changes }) }),
  listProjectQuantitativeDatasets: (projectId: string) => request<QuantitativeDatasetPage>(`/api/v1/projects/${encodeURIComponent(projectId)}/quantitative-datasets?limit=100`),
  previewProjectQuantitativeDataset: (projectId: string, input: QuantitativeDatasetInput) => request<QuantitativeDatasetPreview>(`/api/v1/projects/${encodeURIComponent(projectId)}/quantitative-datasets/preview`, { method: 'POST', body: JSON.stringify(input) }),
  importProjectQuantitativeDataset: (projectId: string, input: QuantitativeDatasetInput) => request<QuantitativeDataset>(`/api/v1/projects/${encodeURIComponent(projectId)}/quantitative-datasets`, { method: 'POST', body: JSON.stringify(input) }),
  revalidateProjectQuantitativeDataset: (projectId: string, datasetId: string) => request<QuantitativeDataset>(`/api/v1/projects/${encodeURIComponent(projectId)}/quantitative-datasets/${encodeURIComponent(datasetId)}/revalidate`, { method: 'POST' }),
  getProjectQuantitativeDataset: (projectId: string, datasetId: string) => request<QuantitativeDataset>(`/api/v1/projects/${encodeURIComponent(projectId)}/quantitative-datasets/${encodeURIComponent(datasetId)}`),
  getProjectDatasetMetadata: (projectId: string, datasetId: string) => request<DatasetMetadata>(`/api/v1/projects/${encodeURIComponent(projectId)}/quantitative-datasets/${encodeURIComponent(datasetId)}/metadata`),
  updateProjectDatasetMetadata: (projectId: string, datasetId: string, expected_revision: number, changes: MetadataChange[]) => request<DatasetMetadata>(`/api/v1/projects/${encodeURIComponent(projectId)}/quantitative-datasets/${encodeURIComponent(datasetId)}/metadata`, { method: 'PUT', body: JSON.stringify({ expected_revision, changes }) }),
  listProjectReports: (projectId: string) => request<ReportPage>(`/api/v1/projects/${encodeURIComponent(projectId)}/reports?limit=100`),
  linkReportToProject: (projectId: string, reportId: string) => request<ReportSummary>(`/api/v1/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(reportId)}`, { method: 'PUT' }),
};
