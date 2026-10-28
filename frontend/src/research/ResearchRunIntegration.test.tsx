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

    window.history.replaceState({}, '', '/research?projectId=project-1&view=plan');
    render(<ResearchWorkspace mode="list" />);
    await screen.findByRole('heading', { name: 'Chuẩn bị nghiên cứu' });
    fireEvent.change(screen.getByLabelText('Dùng phiên bản yêu cầu'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lượt nghiên cứu' }));

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(await screen.findByText('Đang chờ')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/projects/project-1/runs') && init?.method === 'POST')).toBe(true);
  });

  it('opens a product-first Project Home with the three contextual actions by default', async () => {
    installApi((url) => {
      if (url.endsWith('/projects/project-1')) return project;
      if (url.includes('/projects/project-1/reports?')) return page([]);
      if (url.includes('/projects/project-1/benchmark-collections?')) return page([]);
      if (url.includes('/projects/project-1/subjects?')) return page([]);
      if (url.includes('/projects/project-1/trend-updates?')) return page([]);
      if (url.includes('/projects/project-1/saved-information?')) return page([]);
      throw new Error(`Unexpected request: ${url}`);
    });

    window.history.replaceState({}, '', '/research?projectId=project-1');
    render(<ResearchWorkspace mode="list" />);
    expect(await screen.findByRole('heading', { name: 'Bạn muốn thực hiện gì?' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Nghiên cứu chuyên sâu Tạo câu hỏi/ }).getAttribute('href')).toContain('view=plan');
    expect(screen.getByRole('link', { name: /Lưu thông tin Lưu quan sát, bài viết/ }).getAttribute('href')).toContain('#project-saved-information');
    expect(screen.getByRole('link', { name: /Phân tích CSV Khám phá số liệu/ }).getAttribute('href')).toContain('action=import-csv');
  });

  it('keeps Research Home focused on reopening a project or creating one', async () => {
    const recentReport = { id: 'recent-report', project_id: project.id, question: 'Báo cáo gần đây để QA', geo: 'US', os: 'Android', research_period: '2026', content_sha256: 'a'.repeat(64), origin: 'chatgpt_user_import', imported_at: '2026-10-27T12:00:00Z', verification_status: 'unverified' };
    installApi((url) => {
      if (url.includes('/projects?')) return page([project]);
      if (url.includes('/api/v1/reports?')) return page([recentReport]);
      throw new Error(`Unexpected request: ${url}`);
    });
    window.history.replaceState({}, '', '/research');
    render(<ResearchWorkspace mode="list" />);
    expect(await screen.findByRole('heading', { name: 'Dự án của bạn' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Puzzle Market/ }).getAttribute('href')).toBe('/research?projectId=project-1');
    expect(screen.getByRole('link', { name: /Tạo dự án/ }).getAttribute('href')).toBe('/research/new');
    expect(screen.getByRole('heading', { name: 'Báo cáo nghiên cứu' })).toBeTruthy();
    expect((await screen.findByRole('link', { name: /Báo cáo gần đây để QA/ })).getAttribute('href')).toBe('/reports/recent-report');
    expect(screen.queryByRole('link', { name: /Khám phá danh sách ứng dụng/ })).toBeNull();
  });

  it('keeps a saved report, benchmark collection, and subject visible in the same Project Home', async () => {
    const report = { id: 'report-1', project_id: project.id, question: 'What keeps puzzle players engaged?', geo: 'US', os: 'Android', research_period: '2026', content_sha256: 'a'.repeat(64), origin: 'chatgpt_user_import', imported_at: '2026-10-24T12:00:00Z', verification_status: 'unverified' };
    const collection = { id: 'collection-1', project_id: project.id, name: 'Puzzle October', description: null, members: [{ subject_id: 'subject-1', name: 'Puzzle One', subject_type: 'game', source_count: 1, report_source_count: 1, csv_source_count: 0, trend_update_count: 0, observations: [] }], dimensions: [], created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z' };
    const subject = { id: 'subject-1', project_id: project.id, name: 'Puzzle One', subject_type: 'game', aliases: [], external_ids: [], provenance: {}, created_at: '2026-10-20T12:00:00Z', updated_at: '2026-10-20T12:00:00Z' };
    installApi((url) => {
      if (url.endsWith('/projects/project-1')) return project;
      if (url.includes('/projects/project-1/reports?')) return page([report]);
      if (url.includes('/projects/project-1/benchmark-collections?')) return page([collection]);
      if (url.includes('/projects/project-1/subjects?')) return page([subject]);
      if (url.includes('/projects/project-1/trend-updates?')) return page([]);
      if (url.includes('/projects/project-1/saved-information?')) return page([]);
      throw new Error(`Unexpected request: ${url}`);
    });

    window.history.replaceState({}, '', '/research?projectId=project-1');
    render(<ResearchWorkspace mode="list" />);
    const savedReport = (await screen.findAllByRole('link', { name: /What keeps puzzle players engaged/ })).find((link) => link.getAttribute('href') === '/reports/report-1');
    expect(savedReport).toBeTruthy();
    expect(savedReport?.getAttribute('href')).toBe('/reports/report-1');
    expect(screen.getByText('Puzzle October')).toBeTruthy();
    expect(screen.getByText('Puzzle One')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Báo cáo nghiên cứu' })).toBeTruthy();
    expect(screen.queryByText('Đã lưu báo cáo')).toBeNull();
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
