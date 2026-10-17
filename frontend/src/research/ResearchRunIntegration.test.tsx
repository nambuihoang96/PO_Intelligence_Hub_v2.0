// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchWorkspace } from './ResearchWorkspace';
import { ResearchRunsWorkspace } from './ResearchRunsWorkspace';

const project = { id: 'project-1', name: 'Puzzle Market', owner: null, category: 'Games', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
const plan = (version: number) => ({
  id: `plan-${version}`, project_id: project.id, version, question: `Research question v${version}`,
  geos: [], platforms: [], period_start: null, period_end: null, comparison_period_start: null,
  comparison_period_end: null, goals: [], keywords: [], source_policy: {}, created_at: `2026-01-0${version}T00:00:00Z`,
});
const run = {
  id: 'run-1', project_id: project.id, plan_id: 'plan-1', plan_version: 1, state: 'queued' as const,
  started_at: null, finished_at: null, coverage_summary: {}, created_at: '2026-01-03T12:00:00Z',
};
const page = <T,>(items: T[], next_cursor: string | null = null) => ({ items, next_cursor, limit: 100 });

function installApi(resolver: (url: string, init: RequestInit) => unknown | Promise<unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const body = await resolver(url, init);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('research run UI integration', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('renders a run list for /research/runs data, including plan version and status', async () => {
    installApi((url) => {
      if (url.includes('/projects?')) return page([project]);
      if (url.includes('/projects/project-1/runs')) return page([run]);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<ResearchRunsWorkspace runId={null} projectId={null} />);
    expect(await screen.findByText('All research runs')).toBeTruthy();
    expect(screen.getByText(/Puzzle Market/)).toBeTruthy();
    expect(screen.getByText(/queued · Plan version 1/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /View run/ }).getAttribute('href')).toContain('runId=run-1');
  });

  it('creates a run with the explicitly selected immutable plan version', async () => {
    const fetchMock = installApi((url, init) => {
      if (url.endsWith('/projects/project-1') && init.method !== 'POST') return project;
      if (url.includes('/projects/project-1/plans?')) return page([plan(1), plan(2)]);
      if (url.includes('/projects/project-1/runs?')) return page([]);
      if (url.endsWith('/projects/project-1/runs') && init.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ plan_version: 1 });
        return { ...run, plan_id: 'plan-1' };
      }
      throw new Error(`Unexpected request: ${url} ${init.method ?? 'GET'}`);
    });

    window.history.replaceState({}, '', '/research?projectId=project-1');
    render(<ResearchWorkspace mode="list" />);
    await screen.findByText('Puzzle Market');
    fireEvent.change(screen.getByLabelText('Plan version for new run'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create run' }));

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(await screen.findByText('queued')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/projects/project-1/runs') && init?.method === 'POST')).toBe(true);
  });

  it('shows a run detail pinned to the exact saved plan version and exposes evidence navigation', async () => {
    installApi((url) => {
      if (url.endsWith('/runs/run-1')) return run;
      if (url.endsWith('/projects/project-1')) return project;
      if (url.includes('/projects/project-1/plans?')) return page([plan(1), plan(2)]);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<ResearchRunsWorkspace runId="run-1" projectId="project-1" />);
    expect(await screen.findByText('Research question v1')).toBeTruthy();
    expect(screen.getByText('queued')).toBeTruthy();
    expect(screen.getByRole('link', { name: /View or add evidence/ }).getAttribute('href')).toBe('/sources?runId=run-1');
  });
});
