// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportHistory, ReportViewer, ResearchIntake, buildResearchPrompt } from './ResearchIntake';

const report = {
  id: 'saved-report', question: 'How do learning apps engage children?', geo: 'US', os: 'Both' as const,
  research_period: '2025-2026', content_sha256: 'a'.repeat(64), origin: 'chatgpt_user_import' as const,
  imported_at: '2026-10-17T10:00:00Z', verification_status: 'unverified' as const,
  content: '# Executive summary\n\nA sourced finding [Source](https://example.com).\n\n## Research gaps\n\nNot available.\n\n<script>alert(1)</script>',
};

function mockFetch(resolve: (url: string, init: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => new Response(JSON.stringify(resolve(String(input), init)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ChatGPT research intake', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState({}, '', '/'); });

  it('builds a scoped prompt with market-first and anti-inference safeguards', () => {
    const prompt = buildResearchPrompt({ question: 'Compare puzzle games', geo: 'US', os: 'iOS', researchPeriod: '2025', type: 'Benchmark' });
    expect(prompt).toContain('Compare puzzle games');
    expect(prompt).toContain('Analyze the market and category first');
    expect(prompt).toContain('Do not infer downloads, revenue, market share, or growth');
    expect(prompt).toContain('# Benchmark candidates');
    expect(prompt).toContain('Keep iOS and Android findings separate');
  });

  it('copies the prompt for ChatGPT without calling an AI service', async () => {
    mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: 'Compare kids learning apps' } });
    fireEvent.click(screen.getByRole('button', { name: /Copy prompt for ChatGPT/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain('Analyze the market and category first');
    expect(await screen.findByText(/Prompt đã được sao chép/)).toBeTruthy();
  });

  it('accepts a Markdown file and fills the import preview', async () => {
    mockFetch((url, init) => {
      if (url.includes('/reports?')) return { items: [], next_cursor: null, limit: 10 };
      if (init.method === 'POST') return report;
      throw new Error(`Unexpected request ${url}`);
    });
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: report.question } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    const file = new File([report.content], 'market-report.md', { type: 'text/markdown' });
    fireEvent.change(screen.getByLabelText('Chọn file .md hoặc .txt'), { target: { files: [file] } });
    expect(await screen.findByText('market-report.md')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Nội dung báo cáo') as HTMLTextAreaElement).value).toBe(report.content));
  });

  it('previews pasted Markdown, imports once and navigates to the saved report', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.includes('/reports?')) return { items: [], next_cursor: null, limit: 10 };
      if (url === '/api/v1/reports' && init.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body.content).toBe(report.content);
        expect(body.origin).toBeUndefined();
        return report;
      }
      throw new Error(`Unexpected request ${url}`);
    });
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: report.question } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Nội dung báo cáo'), { target: { value: report.content } });
    expect(await screen.findByText(/2 heading · 1 URL nhận diện/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import report' }));
    await waitFor(() => expect(window.location.pathname).toBe('/reports/saved-report'));
    expect(fetchMock.mock.calls.some(([url, init]) => String(url) === '/api/v1/reports' && init?.method === 'POST')).toBe(true);
  });

  it('loads history again and displays Markdown headings and safe source links', async () => {
    mockFetch((url) => url.includes('/reports?') ? { items: [report], next_cursor: null, limit: 10 } : report);
    render(<ReportHistory />);
    const saved = await screen.findByRole('link', { name: /How do learning apps engage children/ });
    expect(saved.getAttribute('href')).toBe('/reports/saved-report');
    cleanup();
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByRole('heading', { name: 'Executive summary' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Research gaps' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Source' }).getAttribute('href')).toBe('https://example.com/');
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Mục lục' })).toBeTruthy();
  });

  it('validates missing metadata and does not send an import', async () => {
    const fetchMock = mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Nội dung báo cáo'), { target: { value: '# Report\nContent' } });
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: '   ' } });
    expect(screen.getByText('Cần có câu hỏi nghiên cứu.')).toBeTruthy();
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/reports?'))).toBe(true);
  });
});
