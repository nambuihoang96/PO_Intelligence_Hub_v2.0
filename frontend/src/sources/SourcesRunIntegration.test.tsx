// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcesWorkspace } from './SourcesWorkspace';

const project = { id: 'project-1', name: 'Puzzle Market', owner: null, category: 'Games', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
const run = {
  id: 'run-1', project_id: project.id, plan_id: 'plan-1', plan_version: 1, state: 'queued',
  started_at: null, finished_at: null, coverage_summary: {}, created_at: '2026-01-03T12:00:00Z',
};
const source = (id: string, name: string) => ({
  id, name, source_type: 'publisher', url_domain: null, license_status: 'unknown', collection_mode: 'manual',
  rate_limit: null, enabled: false, created_at: '2026-01-01T00:00:00Z',
});
const evidence = (id: string, excerpt: string) => ({
  source: { id: `record-${id}`, run_id: run.id, source_registry_id: null, source_name: 'Publisher', source_type: 'publisher',
    collection_mode: 'manual', source_url: 'https://example.com/story', title: `Story ${id}`, retrieved_at: '2026-01-03T12:00:00Z',
    published_at: null, content_sha256: null, scope: {} },
  evidence: { id, run_id: run.id, source_record_id: `record-${id}`, excerpt_or_ref: excerpt, method: 'manual_user_note',
    quality: 'insufficient', status: 'needs_review', scope: {}, observed_at: null, created_at: '2026-01-03T12:00:00Z' },
});
const page = <T,>(items: T[], next_cursor: string | null = null) => ({ items, next_cursor, limit: 20 });

describe('sources and evidence run workflow', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('selects a run, adds evidence without typing an ID, and loads more source/evidence pages', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? 'GET';
      let body: unknown;
      if (url.includes('/sources?limit=20&cursor=source-1')) body = page([source('source-2', 'Second source')]);
      else if (url.includes('/sources?limit=20')) body = page([source('source-1', 'First source')], 'source-1');
      else if (url.includes('/projects?limit=50')) body = page([project]);
      else if (url.includes('/projects/project-1/runs?limit=100')) body = page([run]);
      else if (url.includes('/runs/run-1/evidence?limit=20&cursor=evidence-1')) body = page([evidence('evidence-2', 'Second evidence excerpt')]);
      else if (url.includes('/runs/run-1/evidence?limit=20')) body = page([evidence('evidence-1', 'Initial evidence excerpt')], 'evidence-1');
      else if (url.endsWith('/runs/run-1/evidence') && method === 'POST') body = evidence('evidence-3', 'Newly saved excerpt');
      else throw new Error(`Unexpected request: ${method} ${url}`);
      return new Response(JSON.stringify(body), { status: method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SourcesWorkspace />);
    expect(screen.queryByLabelText(/Research run ID/i)).toBeNull();
    fireEvent.change(await screen.findByRole('combobox', { name: 'Research run' }), { target: { value: run.id } });
    expect(await screen.findByText('Initial evidence excerpt')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Load more sources' }));
    expect(await screen.findByText('Second source')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load more evidence' }));
    expect(await screen.findByText('Second evidence excerpt')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Publisher or site name'), { target: { value: 'Publisher' } });
    fireEvent.change(screen.getByPlaceholderText('news, store, community…'), { target: { value: 'publisher' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com/story' } });
    fireEvent.change(screen.getByLabelText('Notes or excerpt'), { target: { value: 'Newly saved excerpt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save manual reference' }));

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(await screen.findByText('Newly saved excerpt')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/runs/run-1/evidence') && init?.method === 'POST')).toBe(true);
  });
});
