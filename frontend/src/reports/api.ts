export type ReportSummary = {
  id: string;
  question: string;
  geo: string;
  os: 'iOS' | 'Android' | 'Both';
  research_period: string | null;
  content_sha256: string;
  origin: 'chatgpt_user_import';
  imported_at: string;
  verification_status: 'unverified';
};

export type ResearchData = {
  sections: { heading: string; content: string; hierarchy: number; source_location: string; lists: { ordered: boolean; items: string[]; source_location?: string | null }[]; tables: { columns: string[]; rows: string[][]; source_location?: string | null }[] }[];
  entities: { key: string; entity_type: string; name: string; attributes: Record<string, unknown>; evidence_references: string[] }[];
  findings: { key: string; finding_type: string; title: string; description: string; related_entities: string[]; evidence_references: string[]; scope: Record<string, unknown>; evidence_status: string; confidence: number | null; uncertainty: string | null; po_implications: string | null }[];
  evidence_references: { url: string; title: string | null; source_location: string | null; verified: boolean }[];
  benchmark_dimensions: { key: string; name: string; related_entities: string[]; evidence_references: string[]; observations: { entity_key: string | null; value: unknown; evidence_references: string[] }[]; po_notes: string | null }[];
  research_gaps: string[];
  po_recommendations: string[];
};
export type BenchmarkSelection = { item_type: 'entity' | 'finding' | 'dimension'; item_key: string };
export type ImportedReport = ReportSummary & { content: string; parse_status: 'PARSED' | 'PARTIAL' | 'NEEDS_STRUCTURING'; research_data: ResearchData; extraction_error: string | null; benchmark_selections: BenchmarkSelection[]; duplicate?: boolean };
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
};
