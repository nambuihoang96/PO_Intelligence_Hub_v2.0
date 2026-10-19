export type ReportSummary = {
  id: string;
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
  unit: string | null;
  entity_id: string | null;
  geo: string | null;
  platform: string | null;
  period_start: string | null;
  period_end: string | null;
  granularity: string | null;
  source_reference: string | null;
  verification_status: 'unverified' | 'needs_review' | 'verified';
  provenance_type: 'research_report' | 'csv_dataset';
  provenance_id: string | null;
  observation_type: 'reported' | 'imported' | 'calculated';
  validation_reasons: string[];
};
export type QuantitativeDataset = {
  id: string; report_id: string; filename: string; content_sha256: string;
  field_mapping: Record<string, string>; entity_mappings: Record<string, string>;
  observations: QuantitativeObservation[]; compatibility_status: 'compatible' | 'partial' | 'incompatible';
  validation_reasons: string[]; created_at: string; duplicate: boolean;
};
export type QuantitativeDatasetPage = { items: QuantitativeDataset[]; next_cursor: string | null; limit: number };
export type BenchmarkSelection = { item_type: 'entity' | 'finding' | 'dimension'; item_key: string };
export type BenchmarkWorkspaceEntry = BenchmarkSelection & { po_assessment: string; notes: string; next_action: string; dimension_assessments: Record<string, string>; observation_finding_links?: Record<string, string[]> };
export type BenchmarkWorkspace = { custom_dimensions: string[]; entries: BenchmarkWorkspaceEntry[] };
export type ImportedReport = ReportSummary & { content: string; parse_status: 'PARSED' | 'PARTIAL' | 'NEEDS_STRUCTURING'; research_status?: 'STRUCTURED_READY' | 'STRUCTURED_PARTIAL' | 'TEXT_ONLY'; research_contract_version?: 'po_research_v1'; research_data: ResearchData; extraction_error: string | null; benchmark_selections: BenchmarkSelection[]; benchmark_workspace: BenchmarkWorkspace; structured_update_available?: boolean; orphaned_benchmark_selections?: BenchmarkSelection[]; orphaned_benchmark_entries?: BenchmarkWorkspaceEntry[]; duplicate?: boolean };
export type ReportPage = { items: ReportSummary[]; next_cursor: string | null; limit: number };
export type ReportInput = Pick<ReportSummary, 'question' | 'geo' | 'os' | 'research_period'> & { content: string; structured_json?: string };
export type QuantitativeDatasetInput = { filename: string; csv_content: string; field_mapping: Record<string, string>; entity_mappings?: Record<string, string> };

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
  importQuantitativeDataset: (id: string, input: QuantitativeDatasetInput) => request<QuantitativeDataset>(`/api/v1/reports/${encodeURIComponent(id)}/quantitative-datasets`, { method: 'POST', body: JSON.stringify(input) }),
};
