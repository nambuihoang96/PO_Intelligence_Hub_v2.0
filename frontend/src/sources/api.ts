export type Page<T> = { items: T[]; next_cursor: string | null; limit: number };
export type LicenseStatus = 'unknown' | 'manual_only' | 'approved' | 'blocked' | 'review_required';
export type SourceRegistry = {
  id: string; name: string; source_type: string; url_domain: string | null;
  license_status: LicenseStatus; collection_mode: 'manual'; rate_limit: number | null;
  enabled: boolean; created_at: string;
};
export type SourceRecord = {
  id: string; run_id: string; source_registry_id: string | null; source_name: string;
  source_type: string; collection_mode: string; source_url: string | null; title: string | null;
  retrieved_at: string; published_at: string | null; content_sha256: string | null; scope: Record<string, unknown>;
};
export type Evidence = {
  id: string; run_id: string; source_record_id: string; excerpt_or_ref: string;
  method: string; quality: string; status: string; scope: Record<string, unknown>;
  observed_at: string | null; created_at: string;
};
export type ManualEvidence = { source: SourceRecord; evidence: Evidence };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error('The local API could not be reached. Start the backend and try again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string; details?: { errors?: { location: unknown[]; message: string }[] } } } | null;
    const errors = body?.error?.details?.errors?.map((item) => `${item.location.join('.')}: ${item.message}`).join('; ');
    throw new Error(errors || body?.error?.message || `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const sourcesApi = {
  listSources: (cursor?: string) => {
    const params = new URLSearchParams({ limit: '20' });
    if (cursor) params.set('cursor', cursor);
    return request<Page<SourceRegistry>>(`/sources?${params.toString()}`);
  },
  createSource: (payload: { name: string; source_type: string; url_domain?: string; license_status: LicenseStatus }) =>
    request<SourceRegistry>('/sources', { method: 'POST', body: JSON.stringify(payload) }),
  updateSource: (id: string, payload: { license_status: LicenseStatus }) =>
    request<SourceRegistry>(`/sources/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  listEvidence: (runId: string, cursor?: string) => {
    const params = new URLSearchParams({ limit: '20' });
    if (cursor) params.set('cursor', cursor);
    return request<Page<ManualEvidence>>(`/runs/${encodeURIComponent(runId)}/evidence?${params.toString()}`);
  },
  addEvidence: (runId: string, payload: Record<string, unknown>) =>
    request<ManualEvidence>(`/runs/${encodeURIComponent(runId)}/evidence`, { method: 'POST', body: JSON.stringify(payload) }),
};
