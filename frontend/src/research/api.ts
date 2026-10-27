const API_ROOT = '/api/v1';

export type ResearchProject = {
  id: string;
  name: string;
  owner: string | null;
  category: string | null;
  workspace_state_json?: { selected_app_ids?: string[]; selected_app_criterion?: string | null; selected_app_context?: ShortlistContext };
  created_at: string;
  updated_at: string;
};

export type ResearchSubject = {
  id: string;
  project_id: string;
  name: string;
  subject_type: string | null;
  aliases: string[];
  external_ids: { provider: string; value: string }[];
  provenance: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ResearchSubjectSource = {
  project_id: string;
  source_kind: 'report_entity' | 'csv_entity';
  source_id: string;
  source_key: string;
  source_name: string;
  source_type: string | null;
  context_name: string;
  mapped_subject_id: string | null;
  mapped_subject_name: string | null;
  source_state: 'available' | 'stale';
};

export type ResearchBenchmarkCollectionMember = {
  subject_id: string;
  name: string;
  subject_type: string | null;
  source_count: number;
  report_source_count: number;
  csv_source_count: number;
  trend_update_count: number;
  observations: ResearchBenchmarkCollectionObservation[];
};

export type ResearchBenchmarkCollectionObservation = {
  dimension_key: string;
  dimension_name: string;
  source_kind: ResearchSubjectSource['source_kind'] | 'trend_update';
  source_name: string;
  value: unknown;
  unit: string | null;
  scope: Record<string, unknown>;
  verification_status: 'unverified' | 'needs_review' | 'verified';
  evidence_status: string | null;
  source_note: string | null;
  uncertainty: string | null;
  evidence_references: string[];
  source_locations: string[];
  validation_reasons: string[];
};

export type ResearchBenchmarkCollection = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  members: ResearchBenchmarkCollectionMember[];
  dimensions: { key: string; name: string; source_kind: ResearchSubjectSource['source_kind'] | 'trend_update' }[];
  created_at: string;
  updated_at: string;
};

export type ProjectTrendUpdateCreate = {
  subject_id: string;
  collection_id?: string | null;
  exact_claim: string;
  source_note: string;
  source_title?: string | null;
  source_url?: string | null;
  published_on: string;
};

export type ProjectTrendUpdate = ProjectTrendUpdateCreate & {
  id: string;
  project_id: string;
  subject_name: string;
  collection_name: string | null;
  source_status: 'source_reported_unverified';
  created_at: string;
};

export type ShortlistContext = {
  dataset_id: string;
  dataset_filename: string;
  dataset_content_sha256: string;
  selection_type: 'manual' | 'rule_based' | 'legacy';
  source_entity_ids: string[];
  selection_criterion: string | null;
  measurement: { metric_id: string | null; metric_definition: string | null; unit: string | null; geo: string | null; platform: string | null; period_start: string | null; period_end: string | null; snapshot_date: string | null; period_semantics: string | null; granularity: string | null; methodology: string | null } | null;
  observation_refs: { source_entity_id: string; source_row_number: number | null; metric_id: string | null }[];
};

export type OpportunityEvidenceReference = {
  kind: 'quantitative' | 'report_finding' | 'report_entity';
  dataset_id?: string | null;
  source_entity_id?: string | null;
  source_row_number?: number | null;
  metric_id?: string | null;
  report_id?: string | null;
  report_content_sha256?: string | null;
  item_key?: string | null;
};

export type OpportunityAssessment = {
  dimension: string;
  kind: 'observed_fact' | 'research_finding' | 'hypothesis' | 'po_judgment' | 'unknown';
  statement: string;
  evidence_refs: OpportunityEvidenceReference[];
};

export type OpportunityDecision = {
  candidate_id: string;
  expected_revision?: number;
  revision?: number;
  dataset_id: string | null;
  dataset_content_sha256: string | null;
  source_entity_id: string;
  decision_status: 'investigate' | 'benchmark' | 'experiment' | 'implementation_candidate' | 'hold' | 'reject' | null;
  rationale: string;
  supporting_evidence: OpportunityEvidenceReference[];
  contradictory_evidence: OpportunityEvidenceReference[];
  open_questions: string[];
  assessments: OpportunityAssessment[];
  priority: 'high' | 'medium' | 'low' | 'not_assessed';
  review_date: string | null;
  next_action: string;
  candidate_name?: string;
  dataset_filename?: string;
  selection_reason?: string;
  updated_at?: string;
};

export type OpportunityCandidate = {
  candidate_id: string;
  name: string;
  source_entity_id: string;
  dataset_id: string | null;
  dataset_content_sha256: string | null;
  dataset_filename: string;
  selection_reason: string;
  active_in_shortlist?: boolean;
  historical?: boolean;
  source_available?: boolean;
  stale: boolean;
  stale_reasons: string[];
  evidence_gaps: string[];
  quantitative_evidence: Record<string, unknown>[];
  decision: OpportunityDecision | null;
  resolved_decision_evidence: Record<string, unknown>[];
  unresolved_decision_evidence: Record<string, unknown>[];
};

export type OpportunityReport = {
  report_id: string;
  question: string;
  geo: string;
  os: string;
  research_period: string | null;
  content_sha256: string;
  verification_status: 'unverified';
  parse_status: string;
  findings: { key: string; title: string; finding_type: string; description: string; evidence_status: string; uncertainty: string | null; po_implications: string | null; evidence_references: string[]; existing_po_workspace: { po_assessment?: string; notes?: string; next_action?: string } }[];
  entities: { key: string; name: string; entity_type: string; evidence_references: string[] }[];
};

export type OpportunityWorkspace = {
  project_id: string;
  shortlist_dataset_id: string | null;
  shortlist_valid: boolean;
  shortlist_warning: string | null;
  candidates: OpportunityCandidate[];
  reports: OpportunityReport[];
};

export type ResearchPlanPayload = {
  question: string;
  geos: string[];
  platforms: string[];
  period_start: string | null;
  period_end: string | null;
  comparison_period_start: string | null;
  comparison_period_end: string | null;
  goals: string[];
  keywords: string[];
  source_policy: Record<string, unknown>;
};

export type ResearchPlan = ResearchPlanPayload & {
  id: string;
  project_id: string;
  version: number;
  created_at: string;
};

export type ResearchRunState = 'queued' | 'collecting' | 'validating' | 'synthesizing' | 'completed' | 'completed_with_gaps' | 'partial' | 'failed' | 'cancelled';

export type ResearchRun = {
  id: string;
  project_id: string;
  plan_id: string;
  plan_version: number;
  state: ResearchRunState;
  started_at: string | null;
  finished_at: string | null;
  coverage_summary: Record<string, unknown>;
  created_at: string;
};

export type ResearchRunWithProject = ResearchRun & { project_name: string };

export type Page<T> = {
  items: T[];
  next_cursor: string | null;
  limit: number;
};

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('The local API could not be reached. Check that the backend is running, then retry.', 0, 'NETWORK_ERROR', {});
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorEnvelope;
    const error = body.error ?? {};
    const validationErrors = Array.isArray(error.details?.errors)
      ? error.details.errors.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const issue = item as { location?: unknown[]; message?: unknown };
        const field = Array.isArray(issue.location) ? issue.location.filter((part) => part !== 'body').join('.') : '';
        const message = typeof issue.message === 'string' ? issue.message : 'Invalid value';
        return [`${field ? `${field}: ` : ''}${message}`];
      })
      : [];
    const message = error.message ?? `The request failed (${response.status}).`;
    throw new ApiError(
      validationErrors.length ? `${message} ${validationErrors.join('; ')}` : message,
      response.status,
      error.code ?? 'HTTP_ERROR',
      error.details ?? {},
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const researchApi = {
  listProjects(cursor?: string): Promise<Page<ResearchProject>> {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    return request(`/projects?${params.toString()}`);
  },
  getProject(projectId: string): Promise<ResearchProject> {
    return request(`/projects/${encodeURIComponent(projectId)}`);
  },
  listSubjects(projectId: string, cursor?: string): Promise<Page<ResearchSubject>> {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    return request(`/projects/${encodeURIComponent(projectId)}/subjects?${params.toString()}`);
  },
  listSubjectSources(projectId: string, cursor?: string): Promise<Page<ResearchSubjectSource>> {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    return request(`/projects/${encodeURIComponent(projectId)}/subject-sources?${params.toString()}`);
  },
  createSubject(projectId: string, payload: Pick<ResearchSubject, 'name' | 'subject_type' | 'aliases' | 'external_ids' | 'provenance'>): Promise<ResearchSubject> {
    return request(`/projects/${encodeURIComponent(projectId)}/subjects`, { method: 'POST', body: JSON.stringify(payload) });
  },
  updateSubject(projectId: string, subjectId: string, payload: Partial<Pick<ResearchSubject, 'name' | 'subject_type' | 'aliases' | 'external_ids'>>): Promise<ResearchSubject> {
    return request(`/projects/${encodeURIComponent(projectId)}/subjects/${encodeURIComponent(subjectId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },
  mapSubjectSource(projectId: string, payload: { source_kind: ResearchSubjectSource['source_kind']; source_id: string; source_key: string; subject_id?: string; create_subject_from_source?: boolean; expected_subject_id?: string }): Promise<ResearchSubjectSource> {
    return request(`/projects/${encodeURIComponent(projectId)}/subject-sources`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  listBenchmarkCollections(projectId: string): Promise<Page<ResearchBenchmarkCollection>> {
    return request(`/projects/${encodeURIComponent(projectId)}/benchmark-collections?limit=100`);
  },
  createBenchmarkCollection(projectId: string, payload: { name: string; description?: string | null }): Promise<ResearchBenchmarkCollection> {
    return request(`/projects/${encodeURIComponent(projectId)}/benchmark-collections`, { method: 'POST', body: JSON.stringify(payload) });
  },
  addBenchmarkCollectionSubject(projectId: string, collectionId: string, subjectId: string): Promise<ResearchBenchmarkCollection> {
    return request(`/projects/${encodeURIComponent(projectId)}/benchmark-collections/${encodeURIComponent(collectionId)}/subjects/${encodeURIComponent(subjectId)}`, { method: 'PUT', body: JSON.stringify({ subject_id: subjectId }) });
  },
  removeBenchmarkCollectionSubject(projectId: string, collectionId: string, subjectId: string): Promise<void> {
    return request(`/projects/${encodeURIComponent(projectId)}/benchmark-collections/${encodeURIComponent(collectionId)}/subjects/${encodeURIComponent(subjectId)}`, { method: 'DELETE' });
  },
  listTrendUpdates(projectId: string, options: { cursor?: string; limit?: number; subject_id?: string; collection_id?: string } = {}): Promise<Page<ProjectTrendUpdate>> {
    const query = new URLSearchParams();
    if (options.cursor) query.set('cursor', options.cursor);
    if (options.limit) query.set('limit', String(options.limit));
    if (options.subject_id) query.set('subject_id', options.subject_id);
    if (options.collection_id) query.set('collection_id', options.collection_id);
    const queryString = query.toString();
    return request(`/projects/${encodeURIComponent(projectId)}/trend-updates${queryString ? `?${queryString}` : ''}`);
  },
  createTrendUpdate(projectId: string, payload: ProjectTrendUpdateCreate): Promise<ProjectTrendUpdate> {
    return request(`/projects/${encodeURIComponent(projectId)}/trend-updates`, { method: 'POST', body: JSON.stringify(payload) });
  },
  async getPlans(projectId: string): Promise<ResearchPlan[]> {
    const plans: ResearchPlan[] = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) params.set('cursor', cursor);
      const page = await request<Page<ResearchPlan>>(`/projects/${encodeURIComponent(projectId)}/plans?${params.toString()}`);
      plans.push(...page.items);
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    return plans;
  },
  listRuns(projectId: string, cursor?: string): Promise<Page<ResearchRun>> {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    return request(`/projects/${encodeURIComponent(projectId)}/runs?${params.toString()}`);
  },
  async getRuns(projectId: string): Promise<ResearchRun[]> {
    const runs: ResearchRun[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.listRuns(projectId, cursor);
      runs.push(...page.items);
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    return runs;
  },
  async listAllRuns(): Promise<ResearchRunWithProject[]> {
    const projects: ResearchProject[] = [];
    let projectCursor: string | undefined;
    do {
      const page = await this.listProjects(projectCursor);
      projects.push(...page.items);
      projectCursor = page.next_cursor ?? undefined;
    } while (projectCursor);
    const runsByProject = await Promise.all(projects.map(async (project) =>
      (await this.getRuns(project.id)).map((run) => ({ ...run, project_name: project.name })),
    ));
    return runsByProject.flat().sort((left, right) => right.created_at.localeCompare(left.created_at));
  },
  createProject(payload: Pick<ResearchProject, 'name' | 'owner' | 'category'>): Promise<ResearchProject> {
    return request('/projects', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateWorkspaceState(projectId: string, selected_app_ids: string[], selection_criterion: string | null = null, selected_app_context?: ShortlistContext | null): Promise<ResearchProject> {
    return request(`/projects/${encodeURIComponent(projectId)}/workspace-state`, { method: 'PUT', body: JSON.stringify({ selected_app_ids, selection_criterion, ...(selected_app_context !== undefined ? { selected_app_context } : {}) }) });
  },
  getOpportunities(projectId: string): Promise<OpportunityWorkspace> {
    return request(`/projects/${encodeURIComponent(projectId)}/opportunities`);
  },
  saveOpportunityDecision(projectId: string, payload: OpportunityDecision): Promise<OpportunityWorkspace> {
    return request(`/projects/${encodeURIComponent(projectId)}/opportunities/decisions`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  createPlan(projectId: string, payload: ResearchPlanPayload): Promise<ResearchPlan> {
    return request(`/projects/${encodeURIComponent(projectId)}/plans`, { method: 'POST', body: JSON.stringify(payload) });
  },
  revisePlan(projectId: string, latestVersion: number, payload: ResearchPlanPayload): Promise<ResearchPlan> {
    return request(`/projects/${encodeURIComponent(projectId)}/plans/${latestVersion}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  createRun(projectId: string, planVersion: number): Promise<ResearchRun> {
    return request(`/projects/${encodeURIComponent(projectId)}/runs`, { method: 'POST', body: JSON.stringify({ plan_version: planVersion }) });
  },
  getRun(runId: string): Promise<ResearchRun> {
    return request(`/runs/${encodeURIComponent(runId)}`);
  },
};
