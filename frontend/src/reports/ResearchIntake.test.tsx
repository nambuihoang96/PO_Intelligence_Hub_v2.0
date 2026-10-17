// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportHistory, ReportViewer, ResearchIntake, buildResearchPrompt } from './ResearchIntake';

const report = {
  id: 'saved-report', question: 'How do learning apps engage children?', geo: 'US', os: 'Both' as const,
  research_period: '2025-2026', content_sha256: 'a'.repeat(64), origin: 'chatgpt_user_import' as const,
  imported_at: '2026-10-17T10:00:00Z', verification_status: 'unverified' as const,
  parse_status: 'PARTIAL' as const, extraction_error: null, benchmark_selections: [], benchmark_workspace: { custom_dimensions: [], entries: [] },
  research_data: { sections: [], entities: [], findings: [], evidence_references: [], benchmark_dimensions: [], research_gaps: [], po_recommendations: [] },
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
    const prompt = buildResearchPrompt({ question: 'Compare regional payment products', geo: 'US', os: 'Web', researchPeriod: '2025' });
    expect(prompt).toContain('Compare regional payment products');
    expect(prompt).toContain('do not assume an industry or taxonomy');
    expect(prompt).toContain('open taxonomy label');
    expect(prompt).toContain('Do not force irrelevant sections');
    expect(prompt).toContain('evidence_references');
    expect(prompt).not.toContain('# Benchmark candidates');
    expect(prompt).not.toContain('iOS and Android findings separate');
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
    expect(writeText.mock.calls[0][0]).toContain('do not assume an industry or taxonomy');
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
    fireEvent.change(screen.getByLabelText('Chọn file .md, .txt hoặc .json'), { target: { files: [file] } });
    expect(await screen.findByText('market-report.md')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT') as HTMLTextAreaElement).value).toBe(report.content));
  });

  it('accepts a JSON file into the same single research result input', async () => {
    mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    const content = JSON.stringify({ sections: [], entities: [], findings: [] });
    fireEvent.change(screen.getByLabelText('Chọn file .md, .txt hoặc .json'), { target: { files: [new File([content], 'research.json', { type: 'application/json' })] } });
    expect(await screen.findByText('research.json')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT') as HTMLTextAreaElement).value).toBe(content));
    expect(screen.getByText(/Định dạng: JSON/)).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: report.content } });
    expect(await screen.findByText(/2 heading.*Định dạng: Markdown/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }));
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
    fireEvent.click(await screen.findByRole('tab', { name: 'Full Report' }));
    expect(await screen.findByRole('heading', { name: 'Executive summary' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Research gaps' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Source' }).getAttribute('href')).toBe('https://example.com/');
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Mục lục' })).toBeTruthy();
  });

  it('renders domain-neutral structured data and saves a selected finding as a benchmark item', async () => {
    const structured = {
      ...report,
      parse_status: 'PARSED' as const,
      research_data: {
        ...report.research_data,
        entities: [{ key: 'entity-a', entity_type: 'service', name: 'Regional transfer network', attributes: { settlement_window: 'same day' }, evidence_references: ['https://example.com/'] }],
        findings: [{ key: 'finding-a', finding_type: 'operational insight', title: 'Settlement speed differs', description: 'The two observed options report different settlement windows.', related_entities: ['entity-a'], evidence_references: ['https://example.com/'], scope: { region: 'US' }, evidence_status: 'unverified', confidence: null, uncertainty: null, po_implications: 'Validate merchant needs before comparison.' }],
        evidence_references: [{ url: 'https://example.com/', title: 'Source', source_location: 'line:3', verified: false }],
      },
    };
    let persisted = structured;
    mockFetch((url, init) => {
      if (url.includes('/benchmark-selections')) { persisted = { ...persisted, benchmark_selections: JSON.parse(String(init.body)).selections }; return persisted; }
      if (url.includes('/benchmark-workspace')) { persisted = { ...persisted, benchmark_workspace: JSON.parse(String(init.body)) }; return persisted; }
      return persisted;
    });
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Insights' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add to Benchmark' }));
    await waitFor(() => expect(screen.getByText('Settlement speed differs')).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: 'Benchmark' }));
    expect(await screen.findByText('Settlement speed differs')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('PO Assessment'), { target: { value: 'Worth validating' } });
    fireEvent.change(screen.getByLabelText('Next Action'), { target: { value: 'Check source sample' } });
    fireEvent.change(screen.getByLabelText('PO dimension'), { target: { value: 'Evidence quality' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add dimension' }));
    const customValue = await screen.findByLabelText('Evidence quality assessment for Settlement speed differs') as HTMLTextAreaElement;
    fireEvent.change(customValue, { target: { value: 'Moderate confidence for PO use' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save PO assessment and actions' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    await waitFor(() => expect((persisted.benchmark_workspace.entries[0] as { po_assessment: string }).po_assessment).toBe('Worth validating'));
    cleanup();
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Benchmark' }));
    expect((await screen.findByLabelText('PO Assessment') as HTMLTextAreaElement).value).toBe('Worth validating');
    expect((screen.getByLabelText('Next Action') as HTMLTextAreaElement).value).toBe('Check source sample');
    expect((screen.getByLabelText('Evidence quality assessment for Settlement speed differs') as HTMLTextAreaElement).value).toBe('Moderate confidence for PO use');
  });

  it('validates missing metadata and does not send an import', async () => {
    const fetchMock = mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: '# Report\nContent' } });
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: '   ' } });
    expect(screen.getByText('Cần có câu hỏi nghiên cứu.')).toBeTruthy();
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/reports?'))).toBe(true);
  });

  it('imports JSON-only content from the single research result field', async () => {
    const content = JSON.stringify({ sections: [], entities: [], findings: [], evidence_references: [], benchmark_dimensions: [], research_gaps: [], po_recommendations: [] });
    let payload: Record<string, unknown> | undefined;
    mockFetch((url, init) => {
      if (url.includes('/reports?')) return { items: [], next_cursor: null, limit: 10 };
      if (init.method === 'POST') { payload = JSON.parse(String(init.body)); return report; }
      throw new Error(`Unexpected request ${url}`);
    });
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: 'Structured research intake test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: content } });
    expect(screen.getByText(/Định dạng: JSON/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }));
    await waitFor(() => expect(payload?.content).toBe(content));
    expect(payload?.structured_json).toBeUndefined();
  });

  it('validates malformed inline JSON immediately and blocks import without losing text', async () => {
    const fetchMock = mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    const raw = '# Research\n\n```json\n{bad json\n```';
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: raw } });
    expect((await screen.findByRole('alert')).textContent).toContain('JSON không hợp lệ tại dòng 1');
    expect((screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT') as HTMLTextAreaElement).value).toBe(raw);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }));
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/reports?'))).toBe(true);
  });

  it('shows loading only while an import request is pending, then navigates on success', async () => {
    let finishImport!: (response: Response) => void;
    const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).includes('/reports?')) return Promise.resolve(new Response(JSON.stringify({ items: [], next_cursor: null, limit: 10 })));
      if (init.method === 'POST') return new Promise<Response>((resolve) => { finishImport = resolve; });
      throw new Error(`Unexpected request ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: report.question } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: report.content } });
    const save = screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' });
    fireEvent.click(save);
    expect((await screen.findByRole('status')).textContent).toContain('Đang lưu báo cáo...');
    expect((screen.getByRole('button', { name: 'Đang lưu báo cáo...' }) as HTMLButtonElement).disabled).toBe(true);
    finishImport(new Response(JSON.stringify(report)));
    await waitFor(() => expect(window.location.pathname).toBe('/reports/saved-report'));
    expect(screen.queryByText('Đang lưu báo cáo...')).toBeNull();
  });

  it('turns loading off and shows a useful backend error after import failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).includes('/reports?')) return new Response(JSON.stringify({ items: [], next_cursor: null, limit: 10 }));
      if (init.method === 'POST') return new Response(JSON.stringify({ error: { message: 'Báo cáo không hợp lệ.' } }), { status: 422 });
      throw new Error(`Unexpected request ${String(input)}`);
    }));
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: 'Question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: 'Report body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Báo cáo không hợp lệ.');
    expect(screen.queryByText('Đang lưu báo cáo...')).toBeNull();
    expect((screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows backend 422 field, reason and retry guidance while preserving entered content', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).includes('/reports?')) return new Response(JSON.stringify({ items: [], next_cursor: null, limit: 10 }));
      if (init.method === 'POST') return new Response(JSON.stringify({ error: { message: 'Request validation failed.', details: { errors: [{ location: ['body', 'geo'], message: 'String should have at most 100 characters', type: 'string_too_long' }] } } }), { status: 422 });
      throw new Error(`Unexpected request ${String(input)}`);
    }));
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: 'Question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    const raw = '# Detailed research\n\nReport body stays available after a backend error.';
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: raw } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('GEO');
    expect(alert.textContent).toContain('100 ký tự');
    expect(alert.textContent).toContain('thử lại');
    expect((screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT') as HTMLTextAreaElement).value).toBe(raw);
    expect(screen.queryByText('Đang lưu báo cáo...')).toBeNull();
  });

  it('opens the existing report and shows the duplicate notice after duplicate import', async () => {
    mockFetch((url, init) => {
      if (url.includes('/reports?')) return { items: [], next_cursor: null, limit: 10 };
      if (init.method === 'POST') return { ...report, duplicate: true };
      if (url.includes('/reports/saved-report')) return report;
      throw new Error('Unexpected request');
    });
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: report.question } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: report.content } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }));
    await waitFor(() => expect(window.location.pathname).toBe('/reports/saved-report'));
    expect(window.location.search).toContain('duplicate=1');
    cleanup();
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByText('Báo cáo trùng đã mở từ History; dữ liệu gốc được giữ nguyên.')).toBeTruthy();
  });

  it('renders the default GEO in a native dropdown with common country options', async () => {
    mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    render(<ResearchIntake />);
    const geo = await screen.findByRole('combobox', { name: 'GEO' }) as HTMLSelectElement;
    expect(geo.value).toBe('Global / not specified');
    expect(screen.getByRole('option', { name: 'United States (US)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'United Kingdom (GB)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Other / custom' })).toBeTruthy();
  });

  it('submits selected GEO code and supports custom GEO entry', async () => {
    let submitted: Record<string, unknown> | undefined;
    mockFetch((url, init) => {
      if (url.includes('/reports?')) return { items: [], next_cursor: null, limit: 10 };
      if (init.method === 'POST') { submitted = JSON.parse(String(init.body)); return report; }
      throw new Error('Unexpected request');
    });
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: 'Question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: 'Report body' } });
    const geo = screen.getByRole('combobox', { name: 'GEO' });
    fireEvent.change(geo, { target: { value: 'VN' } });
    expect((screen.getByRole('combobox', { name: 'GEO' }) as HTMLSelectElement).value).toBe('VN');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }));
    await waitFor(() => expect(submitted?.geo).toBe('VN'));

    cleanup();
    window.history.replaceState({}, '', '/');
    mockFetch((url, init) => {
      if (url.includes('/reports?')) return { items: [], next_cursor: null, limit: 10 };
      if (init.method === 'POST') { submitted = JSON.parse(String(init.body)); return report; }
      throw new Error('Unexpected request');
    });
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: 'Question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: 'Report body' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'GEO' }), { target: { value: 'Other / custom' } });
    fireEvent.change(screen.getByLabelText('GEO tùy chỉnh'), { target: { value: 'Special Market' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }));
    await waitFor(() => expect(submitted?.geo).toBe('Special Market'));
  });

  it('does not send multiple import requests on a rapid double click', async () => {
    let finishImport!: (response: Response) => void;
    const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).includes('/reports?')) return Promise.resolve(new Response(JSON.stringify({ items: [], next_cursor: null, limit: 10 })));
      if (init.method === 'POST') return new Promise<Response>((resolve) => { finishImport = resolve; });
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: report.question } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: report.content } });
    const save = screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1));
    finishImport(new Response(JSON.stringify(report)));
  });
});
