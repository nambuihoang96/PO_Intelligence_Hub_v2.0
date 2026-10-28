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
  content: '# Executive summary\n\nA sourced finding [Source](https://example.com).\n\n## Câu hỏi còn mở\n\nNot available.\n\n<script>alert(1)</script>',
};

function mockFetch(resolve: (url: string, init: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => new Response(JSON.stringify(resolve(String(input), init)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('ChatGPT research intake', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState({}, '', '/'); });

  it('builds a scoped prompt with market-first and anti-inference safeguards', () => {
    const prompt = buildResearchPrompt({ question: 'Compare regional payment products', geo: 'US', os: 'Web', researchPeriod: '2025' });
    expect(prompt).toContain('Compare regional payment products');
    expect(prompt).toContain('do not assume an industry or taxonomy');
    expect(prompt).toContain('open descriptive type');
    expect(prompt).toContain('Do not force mobile, app, competitor');
    expect(prompt).toContain('evidence_references');
    expect(prompt).toContain('po_research_v1');
    expect(prompt).toContain('schema_version');
    expect(prompt).toContain('quantitative_observations');
    expect(prompt).toContain('source explicitly states a numeric measurement');
    expect(prompt).toContain('value_precision="approximate"');
    expect(prompt).toContain('Do not derive growth rates or precise changes from approximate values');
    expect(prompt).toContain('Do not invent report IDs');
    expect(prompt).toContain('chart pixels');
    expect(prompt).not.toContain('# Benchmark candidates');
    expect(prompt).not.toContain('iOS and Android findings separate');
  });

  it('searches the report library and filters reports by project while keeping workspace decisions linked', async () => {
    const linked = { ...report, id: 'linked-report', project_id: 'project-1' };
    const unlinked = { ...report, id: 'unlinked-report', question: 'Unlinked utility research' };
    mockFetch((url) => {
      if (url.includes('/api/v1/reports?')) return { items: [linked, unlinked], next_cursor: null, limit: 10 };
      if (url.includes('/api/v1/projects?')) return { items: [{ id: 'project-1', name: 'Learning apps', owner: null, category: null, created_at: '2026-01-01', updated_at: '2026-01-02' }], next_cursor: null, limit: 20 };
      throw new Error(`Unexpected request ${url}`);
    });
    render(<ReportHistory />);
    expect(await screen.findByText('How do learning apps engage children?')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Quyết định của dự án · Learning apps/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tìm báo cáo'), { target: { value: 'utility' } });
    expect(screen.getByText('Unlinked utility research')).toBeTruthy();
    expect(screen.queryByText('How do learning apps engage children?')).toBeNull();
    fireEvent.change(screen.getByLabelText('Dự án'), { target: { value: 'project-1' } });
    expect(screen.getByText('Không có báo cáo phù hợp với bộ lọc này.')).toBeTruthy();
  });

  it('shows the same five reports from the shared library and filters three for Project A and two for Project B', async () => {
    const projects = [
      { id: 'project-a', name: 'Project A', owner: null, category: null, created_at: '2026-01-01', updated_at: '2026-01-02' },
      { id: 'project-b', name: 'Project B', owner: null, category: null, created_at: '2026-01-01', updated_at: '2026-01-02' },
    ];
    const reports = [
      ...[1, 2, 3].map((index) => ({ ...report, id: `a-${index}`, question: `Project A report ${index}`, project_id: 'project-a' })),
      ...[1, 2].map((index) => ({ ...report, id: `b-${index}`, question: `Project B report ${index}`, project_id: 'project-b' })),
    ];
    mockFetch((url) => {
      if (url.includes('/api/v1/reports?')) return { items: reports, next_cursor: null, limit: 10 };
      if (url.includes('/api/v1/projects?')) return { items: projects, next_cursor: null, limit: 20 };
      if (url.includes('/api/v1/projects/project-a/plans') || url.includes('/api/v1/projects/project-b/plans')) return { items: [], next_cursor: null, limit: 100 };
      if (url.includes('/api/v1/projects/project-a') || url.includes('/api/v1/projects/project-b')) return projects.find((item) => url.includes(item.id));
      throw new Error(`Unexpected request ${url}`);
    });
    render(<ReportHistory />);
    expect(await screen.findByText('5 báo cáo')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Project A report 1/ }).getAttribute('href')).toBe('/reports/a-1');

    fireEvent.change(screen.getByLabelText('Dự án'), { target: { value: 'project-a' } });
    expect(await screen.findByText('3 báo cáo')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Project A report 1/ }).getAttribute('href')).toBe('/reports/a-1');
    expect(screen.getByRole('link', { name: /Project A report 3/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Project B report 1/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('Dự án'), { target: { value: 'project-b' } });
    expect(await screen.findByText('2 báo cáo')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Project B report 2/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Project A report 1/ })).toBeNull();
  });

  it('explicitly links an unassigned report to the selected project without changing its report ID', async () => {
    const unassigned = { ...report, id: 'legacy-unassigned', question: 'Historical report without a project', project_id: null };
    const projects = [
      { id: 'project-a', name: 'Project A', owner: null, category: null, created_at: '2026-01-01', updated_at: '2026-01-02' },
      { id: 'project-b', name: 'Project B', owner: null, category: null, created_at: '2026-01-01', updated_at: '2026-01-02' },
    ];
    const fetchMock = mockFetch((url, init) => {
      if (url.includes('/api/v1/reports?')) return { items: [unassigned], next_cursor: null, limit: 10 };
      if (url.includes('/api/v1/projects?')) return { items: projects, next_cursor: null, limit: 20 };
      if (url.includes('/api/v1/projects/project-a/reports/legacy-unassigned') && init.method === 'PUT') return { ...unassigned, project_id: 'project-a' };
      throw new Error(`Unexpected request ${url}`);
    });
    render(<ReportHistory />);
    expect(await screen.findByText('1 báo cáo')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Dự án'), { target: { value: 'unassigned' } });
    expect(await screen.findByText('1 báo cáo')).toBeTruthy();
    expect(screen.getAllByText('Chưa gắn với dự án')[0]).toBeTruthy();
    expect(screen.getByRole('link', { name: /Historical report without a project/ }).getAttribute('href')).toBe('/reports/legacy-unassigned?from=unassigned');
    fireEvent.change(screen.getByLabelText('Chọn dự án cho Historical report without a project'), { target: { value: 'project-a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gắn vào dự án' }));
    expect(await screen.findByText(/Đã gắn .* vào Project A/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/projects/project-a/reports/legacy-unassigned', expect.objectContaining({ method: 'PUT' }));
    expect(screen.getByText('Không có báo cáo phù hợp với bộ lọc này.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Dự án'), { target: { value: 'project-a' } });
    expect(await screen.findByText('1 báo cáo')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Historical report without a project/ }).getAttribute('href')).toBe('/reports/legacy-unassigned');
  });

  it('keeps the project filter in report breadcrumb and back navigation', async () => {
    const linked = { ...report, project_id: 'project-a' };
    mockFetch((url) => {
      if (url.includes('/api/v1/reports/saved-report')) return linked;
      if (url.includes('/api/v1/projects/project-a')) return { id: 'project-a', name: 'Project A', owner: null, category: null, created_at: '2026-01-01', updated_at: '2026-01-02' };
      if (url.includes('/api/v1/projects/project-a/plans')) return { items: [], next_cursor: null, limit: 100 };
      throw new Error(`Unexpected request ${url}`);
    });
    render(<ReportViewer reportId="saved-report" />);
    await screen.findByRole('heading', { name: report.question });
    expect(screen.getByRole('link', { name: '← Về thư viện báo cáo' }).getAttribute('href')).toBe('/reports?projectId=project-a');
    expect(screen.getByRole('link', { name: 'Báo cáo' }).getAttribute('href')).toBe('/reports?projectId=project-a');
  });

  it('copies the prompt for ChatGPT without calling an AI service', async () => {
    mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: 'Compare kids learning apps' } });
    fireEvent.click(screen.getByRole('button', { name: /Sao chép yêu cầu cho ChatGPT/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain('do not assume an industry or taxonomy');
    expect(await screen.findByText(/Prompt đã được sao chép/)).toBeTruthy();
  });

  it('continues a saved project brief into report import and preserves project context', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.includes('/reports?')) return { items: [], next_cursor: null, limit: 10 };
      if (url === '/api/v1/reports' && init.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
          project_id: 'project-from-brief',
          question: 'How do players use creative tools?',
          geo: 'US',
          os: 'Android',
          research_period: '2026',
          content: report.content,
        });
        return { ...report, project_id: 'project-from-brief' };
      }
      throw new Error(`Unexpected request ${url}`);
    });
    window.history.replaceState({}, '', '/?projectId=project-from-brief&question=How%20do%20players%20use%20creative%20tools%3F&geo=US&environment=Android&period=2026');
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    expect((screen.getByLabelText('Bạn muốn nghiên cứu gì?') as HTMLTextAreaElement).value).toBe('How do players use creative tools?');
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: report.content } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }));
    await waitFor(() => expect(window.location.pathname).toBe('/reports/saved-report'));
    expect(fetchMock.mock.calls.some(([url, init]) => String(url) === '/api/v1/reports' && init?.method === 'POST')).toBe(true);
  });

  it('uses safe default scope when a saved brief has empty GEO and environment', async () => {
    mockFetch((url) => {
      if (url.includes('/reports?')) return { items: [], next_cursor: null, limit: 10 };
      throw new Error(`Unexpected request ${url}`);
    });
    window.history.replaceState({}, '', '/?projectId=project-1&question=New%20research&geo=&environment=&period=');
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    expect(screen.getByRole('button', { name: 'Thị trường (GEO)' }).textContent).toContain('Toàn cầu · chưa chỉ định');
    expect(screen.getByRole('button', { name: 'Môi trường' }).textContent).toContain('Chưa xác định');
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
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    const file = new File([report.content], 'market-report.md', { type: 'text/markdown' });
    fireEvent.change(screen.getByLabelText('Chọn file .md, .txt hoặc .json'), { target: { files: [file] } });
    expect(await screen.findByText('market-report.md')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT') as HTMLTextAreaElement).value).toBe(report.content));
  });

  it('accepts a JSON file into the same single research result input', async () => {
    mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: report.content } });
    expect(await screen.findByText(/2 tiêu đề.*Định dạng: Markdown/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }));
    await waitFor(() => expect(window.location.pathname).toBe('/reports/saved-report'));
    expect(fetchMock.mock.calls.some(([url, init]) => String(url) === '/api/v1/reports' && init?.method === 'POST')).toBe(true);
  });

  it('loads history again and displays Markdown headings and safe source links', async () => {
    mockFetch((url) => url.includes('/api/v1/reports?') ? { items: [report], next_cursor: null, limit: 10 } : url.includes('/api/v1/projects?') ? { items: [], next_cursor: null, limit: 20 } : report);
    render(<ReportHistory />);
    const saved = await screen.findByRole('link', { name: /How do learning apps engage children/ });
    expect(saved.getAttribute('href')).toBe('/reports/saved-report');
    cleanup();
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Báo cáo đầy đủ' }));
    expect(await screen.findByRole('heading', { name: 'Executive summary' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Câu hỏi còn mở' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Source' }).getAttribute('href')).toBe('https://example.com/');
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Mục lục' })).toBeTruthy();
  });

  it('shows a qualitative research dashboard from supplied findings without invented metrics', async () => {
    const structured = {
      ...report,
      research_status: 'STRUCTURED_READY' as const,
      parse_status: 'PARSED' as const,
      research_data: {
        ...report.research_data,
        executive_summary: 'Players value quick creative sessions and visible progress.',
        key_takeaways: ['Takeaway one.', 'Takeaway two.', 'Takeaway three.', 'Takeaway four.', 'Takeaway five.'],
        entities: [{ key: 'tool-a', entity_type: 'product', name: 'Product A', attributes: {}, evidence_references: ['https://example.com/'] }],
        findings: [{ key: 'finding-a', finding_type: 'motivation', title: 'Creative control supports engagement', description: 'Players return when they can personalize an outcome.', related_entities: ['tool-a'], evidence_references: ['https://example.com/'], source_locations: ['line:3'], scope: { region: 'US' }, evidence_status: 'unverified', confidence: null, uncertainty: 'Based on qualitative accounts.', po_implications: 'Test whether customization is discoverable.' }],
        evidence_references: [{ url: 'https://example.com/', title: 'Research source', source_location: 'line:3', verified: false }],
        benchmark_dimensions: [{ key: 'creative-control', name: 'Creative control', related_entities: ['tool-a'], evidence_references: ['https://example.com/'], observations: [{ entity_key: 'tool-a', value: 'Player customization', evidence_references: ['https://example.com/'], source_locations: ['line:3'], evidence_status: 'unverified', uncertainty: null }], po_notes: null }],
        research_gaps: ['No behavioral data was supplied.'],
        po_recommendations: ['Validate the customization flow with users.'],
      },
    };
    mockFetch(() => structured);
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByRole('heading', { name: 'Kết luận nghiên cứu' })).toBeTruthy();
    expect(screen.getByText('Players value quick creative sessions and visible progress.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Phát hiện chính' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Điểm chính' })).toBeTruthy();
    expect(screen.getByText('Tổng quan nghiên cứu')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Research source' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bản đồ nghiên cứu' })).toBeTruthy();
    expect(document.querySelector('.research-map-entities')?.textContent).toContain('Product A');
    expect(document.querySelectorAll('.research-map-connector.is-connected')).toHaveLength(2);
    expect(document.querySelector('.finding-icon-frame svg')).toBeTruthy();
    expect(screen.getAllByText('1 nguồn tham khảo').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Chưa liên kết bộ dữ liệu định lượng/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Xem cả 5 điểm chính' })).toBeTruthy();
    expect(screen.queryByText('Takeaway four.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Xem cả 5 điểm chính' }));
    expect(screen.getByText('Takeaway five.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thu gọn điểm chính' }).getAttribute('aria-expanded')).toBe('true');
    expect((document.querySelector('.results-fact-strip') as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByRole('button', { name: 'Đọc toàn bộ kết luận' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đọc toàn bộ kết luận' }));
    expect(screen.getByRole('button', { name: 'Thu gọn' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByText(/retention|revenue|market size/i)).toBeNull();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Tổng quan' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Phát hiện' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Tổng quan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xem phát hiện: Creative control supports engagement' }));
    expect(await screen.findAllByRole('heading', { name: 'Phát hiện' })).toBeTruthy();
    expect(document.querySelector('.insight-list-item.active')?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Test whether customization is discoverable.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Research source' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xem đoạn hỗ trợ trong báo cáo gốc' }));
    expect(screen.getByText(/line:3: A sourced finding/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem đoạn hỗ trợ trong báo cáo gốc' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('heading', { name: 'Phát hiện' })).toBeTruthy();
  });

  it('uses consistent report-supplied ranking, category, metric, and period highlights in Overview and Insight Detail', async () => {
    const text = {
      ...report,
      research_status: 'STRUCTURED_READY' as const,
      research_data: {
        ...report.research_data,
        executive_summary: 'At US Android, product reached #5 Top Free Casual; weekly downloads fell from 23.7K to 11K in Q2/2025.',
        key_takeaways: ['The product appeared at #28 Top 50 DIY.'],
        findings: [{ key: 'ranked-finding', finding_type: 'unrecognized report type', title: 'Reached #5 Top Free Casual', description: 'Downloads fell from 23.7K to 11K in Q2/2025.', related_entities: [], evidence_references: ['https://example.com/'], source_locations: [], scope: {}, evidence_status: 'unverified', confidence: null, uncertainty: null, po_implications: null }],
        evidence_references: [{ url: 'https://example.com/', title: 'Chưa xác minh source', source_location: null, verified: false }],
      },
    };
    mockFetch(() => text);
    render(<ReportViewer reportId="saved-report" />);
    await screen.findByRole('heading', { name: 'Kết luận nghiên cứu' });
    const summary = document.querySelector('.executive-summary') as HTMLElement;
    expect(summary.textContent).toBe('At US Android, product reached #5 Top Free Casual; weekly downloads fell from 23.7K to 11K in Q2/2025.');
    expect(summary.querySelectorAll('.research-highlight.is-rank')).toHaveLength(1);
    expect(summary.querySelectorAll('.research-highlight.is-category')).toHaveLength(1);
    expect(summary.querySelectorAll('.research-highlight.is-metric.is-decrease')).toHaveLength(2);
    expect(summary.querySelector('[data-highlight-kind="period"]')?.textContent).toBe('Q2/2025');
    expect(document.querySelector('.overview-takeaways .takeaway-number')?.textContent).toBe('1');
    expect(document.querySelector('.overview-takeaways .takeaway-copy')?.textContent).toContain('Top 50 DIY');
    expect(document.querySelector('.finding-card-evidence')?.textContent).toContain('chưa xác minh');
    fireEvent.click(screen.getByRole('button', { name: 'Xem phát hiện: Reached #5 Top Free Casual' }));
    expect(await screen.findAllByRole('heading', { name: 'Phát hiện' })).toBeTruthy();
    expect(document.querySelector('.insight-detail-panel [data-highlight-kind="rank"]')?.textContent).toBe('#5');
    expect(document.querySelector('.insight-detail-panel [data-highlight-kind="category"]')?.textContent).toBe('Top Free Casual');
    expect(document.querySelectorAll('.insight-detail-panel .research-highlight.is-metric.is-decrease')).toHaveLength(2);
  });

  it('opens a dedicated PO decision path from an insight and saves fields for reopen', async () => {
    const structured = {
      ...report,
      research_status: 'STRUCTURED_READY' as const,
      research_data: {
        ...report.research_data,
        executive_summary: 'The report supports a supplied qualitative conclusion.',
        findings: [{ key: 'finding-po', finding_type: 'observation', title: 'A report-supplied insight', description: 'This conclusion is supported by the cited source.', related_entities: [], evidence_references: [], source_locations: [], scope: {}, evidence_status: 'unverified', confidence: null, uncertainty: 'The original research does not quantify impact.', po_implications: 'Consider validating this flow with users.' }],
      },
    };
    let savedReport = structured;
    const fetchMock = mockFetch((url, init) => {
      if (url.includes('/reports/saved-report') && init.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        savedReport = { ...savedReport, benchmark_selections: body.selections, benchmark_workspace: { custom_dimensions: body.custom_dimensions, entries: body.entries } };
        return savedReport;
      }
      return savedReport;
    });
    window.history.replaceState({}, '', '/reports/saved-report');
    const view = render(<ReportViewer reportId="saved-report" />);
    await screen.findByRole('heading', { name: 'Kết luận nghiên cứu' });
    fireEvent.click(screen.getByText('Thông tin và thao tác liên quan'));
    fireEvent.click(screen.getByRole('button', { name: 'Ghi quyết định PO' }));
    expect(screen.getByRole('tab', { name: 'Đánh giá của PO' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.change(screen.getByLabelText('Đánh giá của PO cho A report-supplied insight'), { target: { value: 'Test the hypothesis before prioritizing.' } });
    fireEvent.change(screen.getByLabelText('Việc tiếp theo cho A report-supplied insight'), { target: { value: 'Plan a small usability study.' } });
    expect(screen.getByText('Chưa lưu · thay đổi mới chỉ có trên trang này.')).toBeTruthy();
    expect(screen.getByText('Chưa có quyết định')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu đánh giá PO' }));
    await screen.findByText('Đã lưu đánh giá của PO, ghi chú và việc tiếp theo.');
    expect(await screen.findByText('Đã lưu đánh giá của PO, ghi chú và việc tiếp theo.')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/benchmark-state') && init?.method === 'PUT')).toBe(true);
    view.unmount();
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Đánh giá của PO' }));
    expect((await screen.findByLabelText('Đánh giá của PO cho A report-supplied insight') as HTMLTextAreaElement).value).toBe('Test the hypothesis before prioritizing.');
    expect((screen.getByLabelText('Việc tiếp theo cho A report-supplied insight') as HTMLTextAreaElement).value).toBe('Plan a small usability study.');
  });

  it('keeps a sparse structured report useful without filling absent sections with placeholders', async () => {
    const sparse = { ...report, research_status: 'STRUCTURED_PARTIAL' as const, research_data: { ...report.research_data, executive_summary: 'A short research summary.', findings: [{ key: 'one-finding', finding_type: 'observation', title: 'One supplied finding', description: 'A limited observation.', related_entities: [], evidence_references: [], source_locations: [], scope: {}, evidence_status: 'unverified', confidence: null, uncertainty: null, po_implications: null }] } };
    mockFetch(() => sparse);
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByRole('heading', { name: 'Kết luận nghiên cứu' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem phát hiện: One supplied finding' })).toBeTruthy();
    expect(document.querySelector('.results-fact-strip')?.textContent).toContain('1 phát hiện');
    expect(document.querySelectorAll('.research-map-row')).toHaveLength(1);
    expect(screen.getByText('Báo cáo chưa liên kết đối tượng')).toBeTruthy();
    expect(screen.getByText('Báo cáo chưa nêu gợi ý cho PO')).toBeTruthy();
    expect(document.querySelector('.research-map-connector.is-connected')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Câu hỏi còn mở' })).toBeNull();
    expect(screen.getByText('Tổng quan nghiên cứu')).toBeTruthy();
    expect(screen.getByText('Chưa có nguồn tham khảo · chưa xác minh')).toBeTruthy();
  });

  it('keeps finding actions available on demand and lets the PO focus and expand explicit map relationships', async () => {
    const findings = Array.from({ length: 5 }, (_, index) => ({
      key: `finding-${index + 1}`,
      finding_type: 'observation',
      title: `Supplied finding ${index + 1}`,
      description: `Report description for finding ${index + 1}.`,
      related_entities: index === 0 ? ['subject-a'] : [],
      evidence_references: index === 0 ? ['https://example.com/'] : [],
      source_locations: [], scope: {}, evidence_status: 'unverified', confidence: null,
      uncertainty: null, po_implications: index === 0 ? 'Review the supplied workflow.' : null,
    }));
    const structured = {
      ...report,
      research_status: 'STRUCTURED_READY' as const,
      research_data: {
        ...report.research_data,
        entities: [{ key: 'subject-a', entity_type: 'product', name: 'Supplied subject', attributes: {}, evidence_references: ['https://example.com/'] }],
        findings,
        evidence_references: [{ url: 'https://example.com/', title: 'Supplied source', source_location: null, verified: false }],
      },
    };
    mockFetch(() => structured);
    render(<ReportViewer reportId="saved-report" />);
    await screen.findByRole('heading', { name: 'Phát hiện chính' });
    const details = screen.getAllByText('Thông tin và thao tác liên quan')[0];
    expect(details.closest('details')?.open).toBe(false);
    fireEvent.click(details);
    expect(screen.getAllByRole('button', { name: 'Ghi quyết định PO' }).length).toBe(5);
    expect(screen.getByRole('link', { name: 'Supplied source' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm vào so sánh: Supplied finding 1' })).toBeTruthy();

    const map = document.querySelector('.research-map-board[role="list"]') as HTMLElement;
    expect(map.querySelectorAll('[role="listitem"]')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Xem tất cả mối liên hệ · 5' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Xem tất cả mối liên hệ/ }));
    expect(map.querySelectorAll('[role="listitem"]')).toHaveLength(5);
    expect(map.querySelectorAll('.research-map-connector.is-connected')).toHaveLength(2);

    const focusButton = [...map.querySelectorAll<HTMLButtonElement>('.research-map-finding')].find((button) => button.textContent?.includes('Supplied finding 4'))!;
    fireEvent.click(focusButton);
    expect(map.querySelectorAll('[role="listitem"]')).toHaveLength(1);
    expect(focusButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Đang xem: Supplied finding 4/)).toBeTruthy();
    expect(map.querySelector('.research-map-row')?.classList.contains('is-unlinked')).toBe(true);
    expect(map.querySelector('.research-map-row .research-map-connector.is-connected')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn' }));
    expect(map.querySelectorAll('[role="listitem"]')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn mối liên hệ' }));
    expect(map.querySelectorAll('[role="listitem"]')).toHaveLength(3);
  });

  it('shows text-only reports as needing structure and never promotes headings into insights', async () => {
    const textOnly = { ...report, research_status: 'TEXT_ONLY' as const };
    mockFetch(() => textOnly);
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByText('Báo cáo văn bản · Bổ sung kết quả có cấu trúc')).toBeTruthy();
    fireEvent.click(screen.getByText('Báo cáo văn bản · Bổ sung kết quả có cấu trúc'));
    expect(screen.getByRole('button', { name: 'Tạo prompt cho ChatGPT' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Phát hiện' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mở đánh giá PO' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Câu hỏi còn mở' })).toBeNull();
  });

  it('shows saved PO work in the Overview after reopening an existing report', async () => {
    const saved = {
      ...report,
      benchmark_selections: [{ item_type: 'entity' as const, item_key: 'service-a' }],
      benchmark_workspace: { custom_dimensions: [], entries: [{ item_type: 'entity' as const, item_key: 'service-a', po_assessment: 'Keep the onboarding flow in the next prototype.', notes: 'Discuss with the design team.', next_action: 'Schedule a usability review.', dimension_assessments: {}, observation_finding_links: {} }] },
      research_data: { ...report.research_data, entities: [{ key: 'service-a', entity_type: 'service', name: 'Service A', attributes: {}, evidence_references: [] }] },
    };
    mockFetch(() => saved);
    window.history.replaceState({}, '', '/reports/saved-report');
    const view = render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByText('Đánh giá PO đã lưu')).toBeTruthy();
    expect(screen.getByText('Keep the onboarding flow in the next prototype.')).toBeTruthy();
    view.unmount();

    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByText('Keep the onboarding flow in the next prototype.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mở so sánh · đã chọn 1' })).toBeTruthy();
  });

  it('labels report-local notes separately from project decisions', async () => {
    const saved = { ...report, project_id: 'project-qa', benchmark_workspace: { custom_dimensions: [], entries: [{ item_type: 'finding' as const, item_key: 'finding-a', po_assessment: '', notes: 'Ghi chú cũ', next_action: '', dimension_assessments: {}, observation_finding_links: {} }] } };
    mockFetch(() => saved);
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByText('Ghi chú riêng của báo cáo đã lưu')).toBeTruthy();
    expect(screen.queryByText('Quyết định PO đã lưu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mở ghi chú báo cáo cũ' })).toBeTruthy();
  });

  it('keeps insight and comparison targets independent and preserves PO notes across remove, refresh, and restore', async () => {
    const structured = {
      ...report,
      parse_status: 'PARSED' as const,
      research_data: {
        ...report.research_data,
        entities: [
          { key: 'learning-app-a', entity_type: 'learning app', name: 'Learning App A', attributes: { practice: 'daily sessions' }, evidence_references: ['https://example.com/'] },
          { key: 'streak-mechanic', entity_type: 'mechanic', name: 'Streak mechanic', attributes: { behavior: 'daily return' }, evidence_references: ['https://example.com/'] },
          { key: 'reward-system', entity_type: 'feature', name: 'Reward system', attributes: { behavior: 'progress reward' }, evidence_references: ['https://example.com/'] },
        ],
        findings: [{ key: 'finding-a', finding_type: 'engagement insight', title: 'Daily habit and reward loop', description: 'The report connects reminders and rewards to a daily practice routine.', related_entities: ['learning-app-a', 'streak-mechanic', 'reward-system'], evidence_references: ['https://example.com/'], scope: { region: 'US', environment: 'Web' }, evidence_status: 'unverified', confidence: null, uncertainty: 'Impact is not experimentally measured.', po_implications: 'Validate which elements are useful to learners.' }],
        evidence_references: [{ url: 'https://example.com/', title: 'Source', source_location: 'line:3', verified: false }],
        benchmark_dimensions: [
          { key: 'daily-practice', name: 'Daily practice', related_entities: ['learning-app-a'], evidence_references: ['https://example.com/'], observations: [{ entity_key: 'learning-app-a', value: 'Daily reminder and streak', evidence_references: ['https://example.com/'], source_locations: [], evidence_status: 'unverified', uncertainty: 'Single report source.' }], po_notes: null },
          { key: 'speaking-feedback', name: 'Speaking feedback', related_entities: ['learning-app-a'], evidence_references: ['https://example.com/'], observations: [{ entity_key: 'learning-app-a', value: 'Immediate pronunciation feedback', evidence_references: ['https://example.com/'], source_locations: [], evidence_status: 'unverified', uncertainty: 'The cited article covers multiple features.' }], po_notes: null },
        ],
      },
    };
    let persisted: any = structured;
    mockFetch((url, init) => {
      if (url.includes('/benchmark-state')) {
        const body = JSON.parse(String(init.body));
        persisted = { ...persisted, benchmark_selections: body.selections, benchmark_workspace: { custom_dimensions: body.custom_dimensions, entries: body.entries } };
        return persisted;
      }
      if (url.includes('/benchmark-selections')) { persisted = { ...persisted, benchmark_selections: JSON.parse(String(init.body)).selections }; return persisted; }
      if (url.includes('/benchmark-workspace')) { persisted = { ...persisted, benchmark_workspace: JSON.parse(String(init.body)) }; return persisted; }
      return persisted;
    });
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Phát hiện' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm vào so sánh: Daily habit and reward loop' }));
    await waitFor(() => expect(persisted.benchmark_selections).toEqual([{ item_type: 'finding', item_key: 'finding-a' }]));
    fireEvent.click(screen.getByRole('button', { name: 'Mở bảng so sánh' }));
    expect(await screen.findByRole('heading', { name: 'Đánh giá phát hiện' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Phát hiện' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm vào so sánh: Learning App A' }));
    await waitFor(() => expect(persisted.benchmark_selections).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Mở bảng so sánh' }).at(-1)!);
    const table = await screen.findByRole('table');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(table.textContent).toContain('Learning App A');
    expect(table.textContent).not.toContain('Streak mechanic');
    expect(table.textContent).not.toContain('Reward system');
    expect(screen.getAllByText('Chưa có phát hiện hỗ trợ được xác nhận.')).toHaveLength(2);

    const speakingLink = screen.getByLabelText('Xác nhận phát hiện hỗ trợ cho Learning App A / Speaking feedback');
    expect((speakingLink as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Xác nhận phát hiện hỗ trợ cho Learning App A / Daily practice'), { target: { value: 'finding-a' } });
    await waitFor(() => expect(persisted.benchmark_workspace.entries.find((entry: { item_key: string }) => entry.item_key === 'learning-app-a')?.observation_finding_links?.['daily-practice']).toEqual(['finding-a']));
    expect((screen.getByLabelText('Xác nhận phát hiện hỗ trợ cho Learning App A / Speaking feedback') as HTMLSelectElement).value).toBe('');
    expect(screen.getByText('Phát hiện được PO xác nhận: Daily habit and reward loop')).toBeTruthy();
    expect(screen.getAllByText('Chưa có phát hiện hỗ trợ được xác nhận.')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Đánh giá của PO cho Daily habit and reward loop'), { target: { value: 'Worth validating' } });
    fireEvent.change(screen.getByLabelText('Việc tiếp theo cho Daily habit and reward loop'), { target: { value: 'Test the reminder timing' } });
    fireEvent.change(screen.getByLabelText('Khía cạnh do PO xác định'), { target: { value: 'Evidence quality' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khía cạnh' }));
    const customValue = await screen.findByLabelText('Đánh giá Evidence quality cho Daily habit and reward loop') as HTMLTextAreaElement;
    fireEvent.change(customValue, { target: { value: 'Moderate confidence for PO use' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu đánh giá và việc tiếp theo' }));
    expect(await screen.findByText('Đã lưu đánh giá của PO, ghi chú và việc tiếp theo.')).toBeTruthy();
    await waitFor(() => expect(persisted.benchmark_workspace.entries.find((entry: { item_key: string }) => entry.item_key === 'finding-a')?.po_assessment).toBe('Worth validating'));
    fireEvent.click(screen.getByRole('tab', { name: 'Phát hiện' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi so sánh: Daily habit and reward loop' }));
    await waitFor(() => expect(persisted.benchmark_selections).toEqual([{ item_type: 'entity', item_key: 'learning-app-a' }]));
    cleanup();
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'So sánh' }));
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(1);
    expect((screen.getByLabelText('Xác nhận phát hiện hỗ trợ cho Learning App A / Daily practice') as HTMLSelectElement).value).toBe('finding-a');
    fireEvent.click(screen.getByRole('tab', { name: 'Phát hiện' }));
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục vào so sánh: Daily habit and reward loop' }));
    await waitFor(() => expect(persisted.benchmark_selections).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Mở bảng so sánh' }).at(-1)!);
    expect((await screen.findByLabelText('Đánh giá của PO cho Daily habit and reward loop') as HTMLTextAreaElement).value).toBe('Worth validating');
    expect((screen.getByLabelText('Việc tiếp theo cho Daily habit and reward loop') as HTMLTextAreaElement).value).toBe('Test the reminder timing');
    expect((screen.getByLabelText('Đánh giá Evidence quality cho Daily habit and reward loop') as HTMLTextAreaElement).value).toBe('Moderate confidence for PO use');
    fireEvent.click(screen.getAllByRole('button', { name: 'Gỡ khỏi so sánh: Learning App A' }).at(-1)!);
    await waitFor(() => expect(persisted.benchmark_selections).toEqual([{ item_type: 'finding', item_key: 'finding-a' }]));
    expect(screen.queryByRole('table')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Đánh giá phát hiện' })).toBeTruthy();
  });

  it('serializes rapid Add → Add and ends with both confirmed memberships', async () => {
    const structured = { ...report, research_data: { ...report.research_data, entities: [
      { key: 'subject-a', entity_type: 'service', name: 'Subject A', attributes: {}, evidence_references: [] },
      { key: 'subject-b', entity_type: 'service', name: 'Subject B', attributes: {}, evidence_references: [] },
    ] } };
    let persisted: any = structured;
    const requestBodies: any[] = [];
    const releases: Array<(response: Response) => void> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).includes('/benchmark-state')) {
        requestBodies.push(JSON.parse(String(init.body)));
        return await new Promise<Response>((resolve) => releases.push(resolve));
      }
      return jsonResponse(persisted);
    }));
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Đối tượng' }));
    const [addSubjectA, addSubjectB] = screen.getAllByRole('button', { name: 'Thêm vào so sánh' });
    fireEvent.click(addSubjectA);
    fireEvent.click(addSubjectB);
    await waitFor(() => expect(requestBodies).toHaveLength(1));
    const apply = (body: any) => { persisted = { ...persisted, benchmark_selections: body.selections, benchmark_workspace: { custom_dimensions: body.custom_dimensions, entries: body.entries } }; return jsonResponse(persisted); };
    releases[0](apply(requestBodies[0]));
    await waitFor(() => expect(requestBodies).toHaveLength(2));
    expect(requestBodies[1].selections).toEqual([{ item_type: 'entity', item_key: 'subject-a' }, { item_type: 'entity', item_key: 'subject-b' }]);
    releases[1](apply(requestBodies[1]));
    await waitFor(() => expect(persisted.benchmark_selections).toEqual(requestBodies[1].selections));
  });

  it('queues Add → Remove while a request is pending and reconciles after first request failure', async () => {
    const structured = { ...report, research_data: { ...report.research_data, findings: [{ key: 'finding-a', finding_type: 'observation', title: 'An observed pattern', description: 'A report-supported pattern.', related_entities: [], evidence_references: [], source_locations: [], scope: {}, evidence_status: 'unverified', confidence: null, uncertainty: null, po_implications: null }] } };
    let persisted: any = structured;
    const submittedSelections: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).includes('/benchmark-state')) {
        const body = JSON.parse(String(init.body));
        submittedSelections.push(body.selections);
        if (submittedSelections.length === 1) throw new Error('temporary network failure');
        persisted = { ...persisted, benchmark_selections: body.selections, benchmark_workspace: { custom_dimensions: body.custom_dimensions, entries: body.entries } };
        return jsonResponse(persisted);
      }
      return jsonResponse(persisted);
    }));
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem phát hiện: An observed pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào so sánh: An observed pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi so sánh: An observed pattern' }));
    await waitFor(() => expect(submittedSelections).toHaveLength(2));
    expect(submittedSelections).toEqual([[{ item_type: 'finding', item_key: 'finding-a' }], []]);
    await waitFor(() => expect(persisted.benchmark_selections).toEqual([]));
    expect(await screen.findByText('Đã gỡ khỏi bảng so sánh. Ghi chú PO vẫn được giữ và có thể khôi phục.')).toBeTruthy();
  });

  it('saves PO notes queued during a pending membership request and does not call them saved early', async () => {
    const structured = { ...report, research_data: { ...report.research_data, entities: [{ key: 'subject-a', entity_type: 'service', name: 'Subject A', attributes: {}, evidence_references: [] }] } };
    let persisted: any = structured;
    const requestBodies: any[] = [];
    let releaseFirst: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).includes('/benchmark-state')) {
        const body = JSON.parse(String(init.body));
        requestBodies.push(body);
        if (requestBodies.length === 1) return await new Promise<Response>((resolve) => { releaseFirst = resolve; });
        persisted = { ...persisted, benchmark_selections: body.selections, benchmark_workspace: { custom_dimensions: body.custom_dimensions, entries: body.entries } };
        return jsonResponse(persisted);
      }
      return jsonResponse(persisted);
    }));
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Đối tượng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào so sánh' }));
    await waitFor(() => expect(requestBodies).toHaveLength(1));
    fireEvent.click(screen.getByRole('tab', { name: 'So sánh' }));
    fireEvent.click(screen.getByText('Subject A').closest('summary')!);
    fireEvent.change(await screen.findByLabelText('Ghi chú cho Subject A'), { target: { value: 'PO note added while selection is saving' } });
    expect(screen.getByText(/Chưa lưu/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu đánh giá và việc tiếp theo' }));
    expect(screen.getByText(/Đang lưu thay đổi PO/)).toBeTruthy();
    const firstBody = requestBodies[0];
    persisted = { ...persisted, benchmark_selections: firstBody.selections, benchmark_workspace: { custom_dimensions: firstBody.custom_dimensions, entries: firstBody.entries } };
    releaseFirst?.(jsonResponse(persisted));
    await waitFor(() => expect(requestBodies).toHaveLength(2));
    expect(requestBodies[1].entries[0].notes).toBe('PO note added while selection is saving');
    await waitFor(() => expect(persisted.benchmark_workspace.entries[0].notes).toBe('PO note added while selection is saving'));
    expect(await screen.findByText(/Đã lưu · mọi thay đổi PO đã được máy chủ xác nhận/)).toBeTruthy();
  });

  it('keeps a failed PO draft visible, warns before leaving, and supports retry', async () => {
    const selected = { ...report,
      benchmark_selections: [{ item_type: 'entity' as const, item_key: 'subject-a' }],
      benchmark_workspace: { custom_dimensions: [], entries: [{ item_type: 'entity' as const, item_key: 'subject-a', po_assessment: '', notes: '', next_action: '', dimension_assessments: {}, observation_finding_links: {} }] },
      research_data: { ...report.research_data, entities: [{ key: 'subject-a', entity_type: 'service', name: 'Subject A', attributes: {}, evidence_references: [] }] },
    };
    let persisted: any = selected;
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).includes('/benchmark-state')) {
        attempts += 1;
        if (attempts === 1) throw new Error('network offline');
        const body = JSON.parse(String(init.body));
        persisted = { ...persisted, benchmark_selections: body.selections, benchmark_workspace: { custom_dimensions: body.custom_dimensions, entries: body.entries } };
        return jsonResponse(persisted);
      }
      return jsonResponse(persisted);
    }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'So sánh' }));
    fireEvent.click(screen.getByText('Subject A').closest('summary')!);
    const assessment = await screen.findByLabelText('Đánh giá của PO cho Subject A') as HTMLTextAreaElement;
    fireEvent.change(assessment, { target: { value: 'Do not lose this draft' } });
    expect(screen.getByText(/Chưa lưu/)).toBeTruthy();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: '← Về thư viện báo cáo' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/reports/saved-report');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu đánh giá và việc tiếp theo' }));
    expect(await screen.findByText(/Lưu thất bại · nội dung vẫn còn trên trang/)).toBeTruthy();
    expect((screen.getByLabelText('Đánh giá của PO cho Subject A') as HTMLTextAreaElement).value).toBe('Do not lose this draft');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lưu lại' }));
    expect(await screen.findByText(/Đã lưu · mọi thay đổi PO đã được máy chủ xác nhận/)).toBeTruthy();
    expect(persisted.benchmark_workspace.entries[0].po_assessment).toBe('Do not lose this draft');
  });

  it('keeps legacy dimension notes visible and editable after removing an active dimension selection', async () => {
    const legacy = { ...report,
      benchmark_selections: [{ item_type: 'dimension' as const, item_key: 'retention-key-v1' }],
      benchmark_workspace: { custom_dimensions: [], entries: [{ item_type: 'dimension' as const, item_key: 'retention-key-v1', po_assessment: 'Prior assessment', notes: 'Workspace note from the old dimension flow', next_action: 'Review next quarter', dimension_assessments: { 'Retention / old wording': 'Old dimension-specific assessment' }, observation_finding_links: {} }] },
      research_data: { ...report.research_data, benchmark_dimensions: [{ key: 'retention-key-v1', name: 'Retention pattern', related_entities: [], evidence_references: [], observations: [], po_notes: 'Historical dimension PO note; do not discard.' }] },
    };
    let persisted: any = legacy;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).includes('/benchmark-state')) {
        const body = JSON.parse(String(init.body));
        persisted = { ...persisted, benchmark_selections: body.selections, benchmark_workspace: { custom_dimensions: body.custom_dimensions, entries: body.entries } };
      }
      return jsonResponse(persisted);
    }));
    window.history.replaceState({}, '', '/reports/saved-report');
    const view = render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'So sánh' }));
    expect(screen.getByText('Historical dimension PO note; do not discard.')).toBeTruthy();
    expect(screen.getByText('Khóa khía cạnh đã lưu:').parentElement?.textContent).toContain('retention-key-v1');
    fireEvent.click(screen.getByText('Retention pattern').closest('summary')!);
    expect((screen.getByLabelText('Đánh giá chiều dữ liệu cũ Retention / old wording cho Retention pattern') as HTMLTextAreaElement).value).toBe('Old dimension-specific assessment');
    const notes = screen.getByLabelText('Ghi chú cho Retention pattern') as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: 'Edited current workspace note; historical note remains separate.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu đánh giá và việc tiếp theo' }));
    await waitFor(() => expect(persisted.benchmark_workspace.entries[0].notes).toBe('Edited current workspace note; historical note remains separate.'));
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi so sánh: Retention pattern' }));
    await waitFor(() => expect(persisted.benchmark_selections).toEqual([]));
    expect(persisted.benchmark_workspace.entries[0].notes).toBe('Edited current workspace note; historical note remains separate.');
    expect(persisted.research_data.benchmark_dimensions[0].po_notes).toBe('Historical dimension PO note; do not discard.');
    view.unmount();
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'So sánh' }));
    expect(screen.getByText('Historical dimension PO note; do not discard.')).toBeTruthy();
    expect((screen.getByLabelText('Ghi chú cho Retention pattern') as HTMLTextAreaElement).value).toBe('Edited current workspace note; historical note remains separate.');
  });

  it('opens an actual insight from the default Overview without inferring a KPI relationship from a shared entity', async () => {
    const structured = {
      ...report,
      research_status: 'STRUCTURED_READY' as const,
      research_data: {
        ...report.research_data,
        executive_summary: 'Guided setup is documented; outcome impact is not measured.',
        key_takeaways: ['Setup guidance appears before the first action.'],
        entities: [{ key: 'subject-a', entity_type: 'service', name: 'Transfer service A', attributes: { description: 'Guided steps are shown before the first action.', platform_signature: 'web portal' }, evidence_references: ['https://example.com/'] }],
        findings: [{ key: 'finding-a', finding_type: 'workflow observation', title: 'Guidance precedes first action', description: 'The report states that setup guidance is shown before the first transfer.', related_entities: ['subject-a'], evidence_references: ['https://example.com/'], source_locations: [], scope: { region: 'US', period: '2025', os: null, source: '', audience: [] }, evidence_status: 'needs_review', confidence: null, uncertainty: 'Only one source was supplied.', po_implications: 'Validate the flow with first-time users.' }],
        evidence_references: [{ url: 'https://example.com/', title: 'Source report', source_location: null, verified: false }],
        benchmark_dimensions: [{ key: 'setup-time', name: 'Setup time reported', related_entities: ['subject-a'], evidence_references: ['https://example.com/'], observations: [{ entity_key: 'subject-a', value: 'About 3 minutes', evidence_references: ['https://example.com/'], source_locations: [], evidence_status: 'unverified', uncertainty: 'Source method is not described.' }], po_notes: null }],
      },
    };
    mockFetch(() => structured);
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByText('Guided setup is documented; outcome impact is not measured.')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Xem phát hiện: Guidance precedes first action' }));
    expect(await screen.findByText('Validate the flow with first-time users.')).toBeTruthy();
    expect(screen.getByText('Guided steps are shown before the first action.')).toBeTruthy();
    expect(screen.getAllByText('The report states that setup guidance is shown before the first transfer.')).toHaveLength(1);
    expect(screen.getByText('Khu vực: US · Thời gian nghiên cứu: 2025')).toBeTruthy();
    expect(screen.queryByText(/Operating system:|source:|audience:/i)).toBeNull();
    expect(screen.getByText('Xem thuộc tính bổ sung (1)')).toBeTruthy();
    expect(screen.getByText('platform signature').closest('details')?.open).toBe(false);
    fireEvent.click(screen.getByText('Xem thuộc tính bổ sung (1)'));
    expect(screen.getByText('platform signature')).toBeTruthy();
    expect(screen.queryByText(/Setup time reported:/)).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Source report' }).every((link) => link.getAttribute('href') === 'https://example.com/')).toBe(true);
    expect(screen.getByRole('heading', { name: /Nguồn tham khảo hỗ trợ · needs_review · chưa xác minh/ })).toBeTruthy();
  });

  it('keeps the contextual assessment workflow for a non-mobile report with no comparison entities', async () => {
    const contextual = {
      ...report,
      research_data: {
        ...report.research_data,
        entities: [],
        findings: [{ key: 'river-finding', finding_type: 'service observation', title: 'Seasonal access changes', description: 'The report notes access varies by season.', related_entities: [], evidence_references: [], source_locations: [], scope: { environment: 'Public infrastructure' }, evidence_status: 'needs_review', confidence: null, uncertainty: 'One region only.', po_implications: 'Check service continuity.' }],
      },
    };
    let persisted: any = contextual;
    mockFetch((url, init) => {
      if (url.includes('/benchmark-state')) {
        const body = JSON.parse(String(init.body));
        persisted = { ...persisted, benchmark_selections: body.selections, benchmark_workspace: { custom_dimensions: body.custom_dimensions, entries: body.entries } };
      }
      return persisted;
    });
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByRole('button', { name: 'Xem phát hiện: Seasonal access changes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xem phát hiện: Seasonal access changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào so sánh: Seasonal access changes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mở bảng so sánh' }));
    expect(await screen.findByRole('heading', { name: 'Đánh giá phát hiện' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.change(screen.getByLabelText('Đánh giá của PO cho Seasonal access changes'), { target: { value: 'Needs local validation' } });
    fireEvent.change(screen.getByLabelText('Việc tiếp theo cho Seasonal access changes'), { target: { value: 'Interview service users' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu đánh giá và việc tiếp theo' }));
    await waitFor(() => expect(persisted.benchmark_workspace.entries[0].po_assessment).toBe('Needs local validation'));
    cleanup();
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'So sánh' }));
    expect((await screen.findByLabelText('Đánh giá của PO cho Seasonal access changes') as HTMLTextAreaElement).value).toBe('Needs local validation');
    expect((screen.getByLabelText('Việc tiếp theo cho Seasonal access changes') as HTMLTextAreaElement).value).toBe('Interview service users');
  });

  it('shows pending and inline failure feedback for the selected card and restores server state on failure', async () => {
    const structured = { ...report, research_data: { ...report.research_data, findings: [{ key: 'finding-a', finding_type: 'observation', title: 'An observed pattern', description: 'A report-supported pattern.', related_entities: [], evidence_references: [], source_locations: [], scope: {}, evidence_status: 'unverified', confidence: null, uncertainty: null, po_implications: null }] } };
    let persisted: any = structured;
    const releaseState: { current: (() => void) | null } = { current: null };
    let failNextState = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.includes('/benchmark-state')) {
        if (failNextState) {
          failNextState = false;
          return new Response(JSON.stringify({ error: { code: 'INVALID_BENCHMARK_STATE', message: 'The selection could not be saved.', details: {} } }), { status: 422, headers: { 'Content-Type': 'application/json' } });
        }
        const body = JSON.parse(String(init.body));
        return await new Promise<Response>((resolve) => {
          releaseState.current = () => {
            persisted = { ...persisted, benchmark_selections: body.selections, benchmark_workspace: { custom_dimensions: body.custom_dimensions, entries: body.entries } };
            resolve(new Response(JSON.stringify(persisted), { status: 200, headers: { 'Content-Type': 'application/json' } }));
          };
        });
      }
      return new Response(JSON.stringify(persisted), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    await screen.findByRole('button', { name: 'Xem phát hiện: An observed pattern' });
    fireEvent.click(screen.getByRole('button', { name: 'Xem phát hiện: An observed pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào so sánh: An observed pattern' }));
    expect(await screen.findByText('Đang thêm…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gỡ khỏi so sánh: An observed pattern' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Mở bảng so sánh' }));
    const pendingDraft = await screen.findByLabelText('Đánh giá của PO cho An observed pattern') as HTMLTextAreaElement;
    fireEvent.change(pendingDraft, { target: { value: 'Draft typed while save was pending' } });
    releaseState.current?.();
    fireEvent.click(screen.getByRole('tab', { name: 'So sánh' }));
    expect((screen.getByLabelText('Đánh giá của PO cho An observed pattern') as HTMLTextAreaElement).value).toBe('Draft typed while save was pending');
    fireEvent.click(screen.getByRole('tab', { name: 'Phát hiện' }));
    expect(await screen.findByText('Đã thêm vào bảng so sánh.')).toBeTruthy();
    failNextState = true;
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi so sánh: An observed pattern' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The selection could not be saved.');
    expect(screen.getByRole('button', { name: 'Gỡ khỏi so sánh: An observed pattern' })).toBeTruthy();
    expect(persisted.benchmark_selections).toEqual([{ item_type: 'finding', item_key: 'finding-a' }]);
  });

  it('explains a benchmark 404 and preserves a local PO draft and confirmed membership', async () => {
    const selectedEntity = {
      ...report,
      benchmark_selections: [{ item_type: 'entity' as const, item_key: 'subject-a' }],
      benchmark_workspace: { custom_dimensions: [], entries: [{ item_type: 'entity' as const, item_key: 'subject-a', po_assessment: 'Previously saved', notes: 'Keep these notes', next_action: 'Review later', dimension_assessments: {}, observation_finding_links: {} }] },
      research_data: { ...report.research_data, entities: [{ key: 'subject-a', entity_type: 'service', name: 'Transfer service A', attributes: {}, evidence_references: [] }] },
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/benchmark-state')) return new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(selectedEntity), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'So sánh' }));
    fireEvent.click(screen.getByText('Transfer service A').closest('summary')!);
    const assessment = await screen.findByLabelText('Đánh giá của PO cho Transfer service A') as HTMLTextAreaElement;
    fireEvent.change(assessment, { target: { value: 'Unsaved decision draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi so sánh: Transfer service A' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('local backend may be outdated');
    expect(alert.textContent).toContain('reopen run.bat');
    expect((screen.getByLabelText('Đánh giá của PO cho Transfer service A') as HTMLTextAreaElement).value).toBe('Unsaved decision draft');
    expect(screen.getByRole('button', { name: 'Gỡ khỏi so sánh: Transfer service A' })).toBeTruthy();
    const diagnostics = screen.getByText(/HTTP 404 · \/api\/v1\/reports\/saved-report\/benchmark-state/);
    expect(diagnostics.closest('details')?.open).toBe(false);
  });

  it('explains an outdated backend and keeps the full ChatGPT response after a 404', async () => {
    const textOnlyReport = { ...report, research_status: 'TEXT_ONLY' as const };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).endsWith('/structure-from-response') && init.method === 'PUT') return new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 });
      if (String(input).includes('/api/v1/reports/saved-report')) return new Response(JSON.stringify(textOnlyReport));
      throw new Error(`Unexpected request ${String(input)}`);
    }));
    window.history.replaceState({}, '', '/reports/saved-report');
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByText('Báo cáo văn bản · Bổ sung kết quả có cấu trúc'));
    const response = '{"schema_version":"po_research_v1","research_data":{}}';
    fireEvent.change(await screen.findByLabelText('Dán toàn bộ câu trả lời ChatGPT'), { target: { value: response } });
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật báo cáo' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Backend local đang chạy phiên bản cũ');
    expect((screen.getByLabelText('Dán toàn bộ câu trả lời ChatGPT') as HTMLTextAreaElement).value).toBe(response);
  });

  it('validates missing metadata and does not send an import', async () => {
    const fetchMock = mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: content } });
    expect(screen.getByText(/Định dạng: JSON/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }));
    await waitFor(() => expect(payload?.content).toBe(content));
    expect(payload?.structured_json).toBeUndefined();
  });

  it('validates malformed inline JSON immediately and blocks import without losing text', async () => {
    const fetchMock = mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    const raw = '# Research\n\n```json\n{bad json\n```';
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: raw } });
    expect((await screen.findByRole('alert')).textContent).toContain('JSON không hợp lệ tại dòng 1');
    expect((screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT') as HTMLTextAreaElement).value).toBe(raw);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: report.content } });
    const save = screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' });
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
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: 'Report body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Báo cáo không hợp lệ.');
    expect(screen.queryByText('Đang lưu báo cáo...')).toBeNull();
    expect((screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }) as HTMLButtonElement).disabled).toBe(false);
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
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    const raw = '# Detailed research\n\nReport body stays available after a backend error.';
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: raw } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: report.content } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }));
    await waitFor(() => expect(window.location.pathname).toBe('/reports/saved-report'));
    expect(window.location.search).toContain('duplicate=1');
    cleanup();
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByText('Báo cáo đã tồn tại được mở từ lịch sử; dữ liệu gốc được giữ nguyên.')).toBeTruthy();
  });

  it('renders the default GEO with common choices in a multiselect dropdown', async () => {
    mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    render(<ResearchIntake />);
    const geo = await screen.findByRole('button', { name: 'Thị trường (GEO)' });
    expect(geo.textContent).toContain('Toàn cầu · chưa chỉ định');
    fireEvent.click(geo);
    expect(screen.getByLabelText('Hoa Kỳ (US)')).toBeTruthy();
    expect(screen.getByLabelText('Vương quốc Anh (GB)')).toBeTruthy();
    expect(screen.getByLabelText('Khác / tự nhập')).toBeTruthy();
  });

  it('submits multiple GEOs and environments and supports custom values', async () => {
    let submitted: Record<string, unknown> | undefined;
    mockFetch((url, init) => {
      if (url.includes('/reports?')) return { items: [], next_cursor: null, limit: 10 };
      if (init.method === 'POST') { submitted = JSON.parse(String(init.body)); return report; }
      throw new Error('Unexpected request');
    });
    render(<ResearchIntake />);
    await screen.findByText('Chưa có báo cáo nào');
    fireEvent.change(screen.getByLabelText('Bạn muốn nghiên cứu gì?'), { target: { value: 'Question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: 'Report body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thị trường (GEO)' }));
    fireEvent.click(screen.getByLabelText('Việt Nam (VN)'));
    fireEvent.click(screen.getByLabelText('Hoa Kỳ (US)'));
    fireEvent.click(screen.getByRole('button', { name: 'Môi trường' }));
    fireEvent.click(screen.getByLabelText('iOS'));
    fireEvent.click(screen.getByLabelText('Android'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }));
    await waitFor(() => expect(submitted?.geo).toBe('VN, US'));
    expect(submitted?.os).toBe('iOS, Android');

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
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: 'Report body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thị trường (GEO)' }));
    fireEvent.click(screen.getByLabelText('Khác / tự nhập'));
    fireEvent.change(screen.getByLabelText('Thị trường tùy chỉnh'), { target: { value: 'Special Market' } });
    fireEvent.click(screen.getByRole('button', { name: 'Môi trường' }));
    fireEvent.click(screen.getByLabelText('Web'));
    fireEvent.click(screen.getByLabelText('Khác / tự nhập'));
    fireEvent.change(screen.getByLabelText('Tên môi trường'), { target: { value: 'AR device' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' }));
    await waitFor(() => expect(submitted?.geo).toBe('Special Market'));
    expect(submitted?.os).toBe('Web, AR device');
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
    fireEvent.click(screen.getByRole('button', { name: 'Nhập báo cáo ChatGPT' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: report.content } });
    const save = screen.getByRole('button', { name: 'Lưu báo cáo vào dự án' });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1));
    finishImport(new Response(JSON.stringify(report)));
  });
});
