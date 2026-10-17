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
  sections: { heading: string; content: string; hierarchy: number; source_location: string; lists: { ordered: boolean; items: string[]; source_location?: string | null }[]; tables: { columns: string[]; rows: string[][]; source_location?: string | null }[] }[];
  entities: { key: string; entity_type: string; name: string; attributes: Record<string, unknown>; evidence_references: string[] }[];
  findings: { key: string; finding_type: string; title: string; description: string; related_entities: string[]; evidence_references: string[]; source_locations: string[]; scope: Record<string, unknown>; evidence_status: string; confidence: number | null; uncertainty: string | null; po_implications: string | null }[];
  evidence_references: { url: string; title: string | null; source_location: string | null; verified: boolean }[];
  benchmark_dimensions: { key: string; name: string; related_entities: string[]; evidence_references: string[]; observations: { entity_key: string | null; value: unknown; evidence_references: string[]; source_locations: string[]; evidence_status: string; uncertainty: string | null }[]; po_notes: string | null }[];
  research_gaps: string[];
  po_recommendations: string[];
};
export type BenchmarkSelection = { item_type: 'entity' | 'finding' | 'dimension'; item_key: string };
export type BenchmarkWorkspaceEntry = BenchmarkSelection & { po_assessment: string; notes: string; next_action: string; dimension_assessments: Record<string, string> };
export type BenchmarkWorkspace = { custom_dimensions: string[]; entries: BenchmarkWorkspaceEntry[] };
export type ImportedReport = ReportSummary & { content: string; parse_status: 'PARSED' | 'PARTIAL' | 'NEEDS_STRUCTURING'; research_data: ResearchData; extraction_error: string | null; benchmark_selections: BenchmarkSelection[]; benchmark_workspace: BenchmarkWorkspace; structured_update_available?: boolean; orphaned_benchmark_selections?: BenchmarkSelection[]; orphaned_benchmark_entries?: BenchmarkWorkspaceEntry[]; duplicate?: boolean };
export type ReportPage = { items: ReportSummary[]; next_cursor: string | null; limit: number };
export type ReportInput = Pick<ReportSummary, 'question' | 'geo' | 'os' | 'research_period'> & { content: string; structured_json?: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? 'Không thể kết nối tới kho báo cáo.');
  return body as T;
}

export const reportApi = {
  import: (input: ReportInput) => request<ImportedReport>('/api/v1/reports', { method: 'POST', body: JSON.stringify(input) }),
  list: (cursor?: string) => request<ReportPage>(`/api/v1/reports?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  get: (id: string) => request<ImportedReport>(`/api/v1/reports/${encodeURIComponent(id)}`),
  updateBenchmarkSelections: (id: string, selections: BenchmarkSelection[]) => request<ImportedReport>(`/api/v1/reports/${encodeURIComponent(id)}/benchmark-selections`, { method: 'PUT', body: JSON.stringify({ selections }) }),
  reprocess: (id: string) => request<ImportedReport & { reprocessed: boolean; message: string }>(`/api/v1/reports/${encodeURIComponent(id)}/reprocess`, { method: 'POST' }),
  updateStructuredData: (id: string, research_data: ResearchData) => request<ImportedReport>(`/api/v1/reports/${encodeURIComponent(id)}/structured-data`, { method: 'PUT', body: JSON.stringify({ research_data }) }),
  updateBenchmarkWorkspace: (id: string, workspace: BenchmarkWorkspace) => request<ImportedReport>(`/api/v1/reports/${encodeURIComponent(id)}/benchmark-workspace`, { method: 'PUT', body: JSON.stringify(workspace) }),
};
