const API_ROOT = '/api/v1';

export type ResearchProject = {
  id: string;
  name: string;
  owner: string | null;
  category: string | null;
  workspace_state_json?: { selected_app_ids?: string[]; selected_app_criterion?: string | null };
  created_at: string;
  updated_at: string;
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
    throw new ApiError(
      error.message ?? `The request failed (${response.status}).`,
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
  updateWorkspaceState(projectId: string, selected_app_ids: string[], selection_criterion: string | null = null): Promise<ResearchProject> {
    return request(`/projects/${encodeURIComponent(projectId)}/workspace-state`, { method: 'PUT', body: JSON.stringify({ selected_app_ids, selection_criterion }) });
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
