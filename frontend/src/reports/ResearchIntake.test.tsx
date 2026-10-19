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

  it('shows a qualitative research dashboard from supplied findings without invented metrics', async () => {
    const structured = {
      ...report,
      research_status: 'STRUCTURED_READY' as const,
      parse_status: 'PARSED' as const,
      research_data: {
        ...report.research_data,
        executive_summary: 'Players value quick creative sessions and visible progress.',
        key_takeaways: ['Short sessions support repeat play.'],
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
    expect(await screen.findByRole('heading', { name: 'Executive summary' })).toBeTruthy();
    expect(screen.getByText('Players value quick creative sessions and visible progress.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Key findings' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Source references' })).toBeTruthy();
    expect(screen.getByText(/No quantitative dataset linked/)).toBeTruthy();
    expect((document.querySelector('.results-fact-strip') as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByRole('button', { name: 'Read full summary' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read full summary' }));
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByText(/retention|revenue|market size/i)).toBeNull();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Insights' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'View Insight: Creative control supports engagement' }));
    expect(await screen.findByRole('heading', { name: 'Insights' })).toBeTruthy();
    expect(document.querySelector('.insight-list-item.active')?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Test whether customization is discoverable.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Research source' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View support in original report' }));
    expect(screen.getByText(/line:3: A sourced finding/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View support in original report' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Insights' })).toBeTruthy();
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
    await screen.findByRole('heading', { name: 'Executive summary' });
    fireEvent.click(screen.getByRole('button', { name: 'Record PO decision' }));
    expect(screen.getByRole('tab', { name: 'PO Assessment' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.change(screen.getByLabelText('PO Assessment for A report-supplied insight'), { target: { value: 'Test the hypothesis before prioritizing.' } });
    fireEvent.change(screen.getByLabelText('Next Action for A report-supplied insight'), { target: { value: 'Plan a small usability study.' } });
    expect(screen.getByText('Unsaved changes · edits are only on this page until saved.')).toBeTruthy();
    expect(screen.getByText('No PO decision yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save PO assessment' }));
    await screen.findByText('Đã lưu PO Assessment, Notes và Next Action.');
    expect(await screen.findByText('PO decision saved')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/benchmark-state') && init?.method === 'PUT')).toBe(true);
    view.unmount();
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'PO Assessment' }));
    expect((await screen.findByLabelText('PO Assessment for A report-supplied insight') as HTMLTextAreaElement).value).toBe('Test the hypothesis before prioritizing.');
    expect((screen.getByLabelText('Next Action for A report-supplied insight') as HTMLTextAreaElement).value).toBe('Plan a small usability study.');
  });

  it('keeps a sparse structured report useful without filling absent sections with placeholders', async () => {
    const sparse = { ...report, research_status: 'STRUCTURED_PARTIAL' as const, research_data: { ...report.research_data, executive_summary: 'A short research summary.', findings: [{ key: 'one-finding', finding_type: 'observation', title: 'One supplied finding', description: 'A limited observation.', related_entities: [], evidence_references: [], source_locations: [], scope: {}, evidence_status: 'unverified', confidence: null, uncertainty: null, po_implications: null }] } };
    mockFetch(() => sparse);
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByRole('heading', { name: 'Executive summary' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View Insight: One supplied finding' })).toBeTruthy();
    expect(document.querySelector('.results-fact-strip')?.textContent).toContain('1 findings');
    expect(screen.queryByRole('heading', { name: 'Research gaps' })).toBeNull();
    expect(screen.getByText('No source references were supplied.')).toBeTruthy();
  });

  it('shows text-only reports as needing structure and never promotes headings into insights', async () => {
    const textOnly = { ...report, research_status: 'TEXT_ONLY' as const };
    mockFetch(() => textOnly);
    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByText('TEXT_ONLY · Structure this report')).toBeTruthy();
    fireEvent.click(screen.getByText('TEXT_ONLY · Structure this report'));
    expect(screen.getByRole('button', { name: 'Prepare ChatGPT prompt' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Insights' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Research gaps' })).toBeNull();
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
    expect(await screen.findByText('Saved PO decisions')).toBeTruthy();
    expect(screen.getByText('Keep the onboarding flow in the next prototype.')).toBeTruthy();
    view.unmount();

    render(<ReportViewer reportId="saved-report" />);
    expect(await screen.findByText('Keep the onboarding flow in the next prototype.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Benchmark · 1 selected' })).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('tab', { name: 'Insights' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add to Benchmark: Daily habit and reward loop' }));
    await waitFor(() => expect(persisted.benchmark_selections).toEqual([{ item_type: 'finding', item_key: 'finding-a' }]));
    fireEvent.click(screen.getByRole('button', { name: 'Xem Benchmark' }));
    expect(await screen.findByRole('heading', { name: 'Insight assessment' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Insights' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add to Benchmark: Learning App A' }));
    await waitFor(() => expect(persisted.benchmark_selections).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Xem Benchmark' }).at(-1)!);
    const table = await screen.findByRole('table');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(table.textContent).toContain('Learning App A');
    expect(table.textContent).not.toContain('Streak mechanic');
    expect(table.textContent).not.toContain('Reward system');
    expect(screen.getAllByText('No confirmed supporting insight.')).toHaveLength(2);

    const speakingLink = screen.getByLabelText('Confirm supporting insight for Learning App A / Speaking feedback');
    expect((speakingLink as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Confirm supporting insight for Learning App A / Daily practice'), { target: { value: 'finding-a' } });
    await waitFor(() => expect(persisted.benchmark_workspace.entries.find((entry: { item_key: string }) => entry.item_key === 'learning-app-a')?.observation_finding_links?.['daily-practice']).toEqual(['finding-a']));
    expect((screen.getByLabelText('Confirm supporting insight for Learning App A / Speaking feedback') as HTMLSelectElement).value).toBe('');
    expect(screen.getByText('PO-confirmed insight: Daily habit and reward loop')).toBeTruthy();
    expect(screen.getAllByText('No confirmed supporting insight.')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('PO Assessment for Daily habit and reward loop'), { target: { value: 'Worth validating' } });
    fireEvent.change(screen.getByLabelText('Next Action for Daily habit and reward loop'), { target: { value: 'Test the reminder timing' } });
    fireEvent.change(screen.getByLabelText('PO dimension'), { target: { value: 'Evidence quality' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add dimension' }));
    const customValue = await screen.findByLabelText('Evidence quality assessment for Daily habit and reward loop') as HTMLTextAreaElement;
    fireEvent.change(customValue, { target: { value: 'Moderate confidence for PO use' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save assessments and next actions' }));
    expect(await screen.findByText('Đã lưu PO Assessment, Notes và Next Action.')).toBeTruthy();
    await waitFor(() => expect(persisted.benchmark_workspace.entries.find((entry: { item_key: string }) => entry.item_key === 'finding-a')?.po_assessment).toBe('Worth validating'));
    fireEvent.click(screen.getByRole('tab', { name: 'Insights' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Benchmark: Daily habit and reward loop' }));
    await waitFor(() => expect(persisted.benchmark_selections).toEqual([{ item_type: 'entity', item_key: 'learning-app-a' }]));
    cleanup();
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Benchmark' }));
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(1);
    expect((screen.getByLabelText('Confirm supporting insight for Learning App A / Daily practice') as HTMLSelectElement).value).toBe('finding-a');
    fireEvent.click(screen.getByRole('tab', { name: 'Insights' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore to Benchmark: Daily habit and reward loop' }));
    await waitFor(() => expect(persisted.benchmark_selections).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Xem Benchmark' }).at(-1)!);
    expect((await screen.findByLabelText('PO Assessment for Daily habit and reward loop') as HTMLTextAreaElement).value).toBe('Worth validating');
    expect((screen.getByLabelText('Next Action for Daily habit and reward loop') as HTMLTextAreaElement).value).toBe('Test the reminder timing');
    expect((screen.getByLabelText('Evidence quality assessment for Daily habit and reward loop') as HTMLTextAreaElement).value).toBe('Moderate confidence for PO use');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Benchmark: Learning App A' }).at(-1)!);
    await waitFor(() => expect(persisted.benchmark_selections).toEqual([{ item_type: 'finding', item_key: 'finding-a' }]));
    expect(screen.queryByRole('table')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Insight assessment' })).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('tab', { name: 'Entities' }));
    const [addSubjectA, addSubjectB] = screen.getAllByRole('button', { name: 'Add to Benchmark' });
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
    fireEvent.click(await screen.findByRole('button', { name: 'View Insight: An observed pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Benchmark: An observed pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Benchmark: An observed pattern' }));
    await waitFor(() => expect(submittedSelections).toHaveLength(2));
    expect(submittedSelections).toEqual([[{ item_type: 'finding', item_key: 'finding-a' }], []]);
    await waitFor(() => expect(persisted.benchmark_selections).toEqual([]));
    expect(await screen.findByText('Removed from Benchmark. PO notes are preserved and can be restored.')).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('tab', { name: 'Entities' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Benchmark' }));
    await waitFor(() => expect(requestBodies).toHaveLength(1));
    fireEvent.click(screen.getByRole('tab', { name: 'Benchmark' }));
    fireEvent.click(screen.getByText('Subject A').closest('summary')!);
    fireEvent.change(await screen.findByLabelText('Notes for Subject A'), { target: { value: 'PO note added while selection is saving' } });
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save assessments and next actions' }));
    expect(screen.getByText(/Saving · saving PO edits/)).toBeTruthy();
    const firstBody = requestBodies[0];
    persisted = { ...persisted, benchmark_selections: firstBody.selections, benchmark_workspace: { custom_dimensions: firstBody.custom_dimensions, entries: firstBody.entries } };
    releaseFirst?.(jsonResponse(persisted));
    await waitFor(() => expect(requestBodies).toHaveLength(2));
    expect(requestBodies[1].entries[0].notes).toBe('PO note added while selection is saving');
    await waitFor(() => expect(persisted.benchmark_workspace.entries[0].notes).toBe('PO note added while selection is saving'));
    expect(await screen.findByText(/Saved · all PO edits are confirmed/)).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('tab', { name: 'Benchmark' }));
    fireEvent.click(screen.getByText('Subject A').closest('summary')!);
    const assessment = await screen.findByLabelText('PO Assessment for Subject A') as HTMLTextAreaElement;
    fireEvent.change(assessment, { target: { value: 'Do not lose this draft' } });
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: '← Quay lại Research' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/reports/saved-report');
    fireEvent.click(screen.getByRole('button', { name: 'Save assessments and next actions' }));
    expect(await screen.findByText(/Save failed · PO edits remain/)).toBeTruthy();
    expect((screen.getByLabelText('PO Assessment for Subject A') as HTMLTextAreaElement).value).toBe('Do not lose this draft');
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    expect(await screen.findByText(/Saved · all PO edits are confirmed/)).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('tab', { name: 'Benchmark' }));
    expect(screen.getByText('Historical dimension PO note; do not discard.')).toBeTruthy();
    expect(screen.getByText('Stored dimension key:').parentElement?.textContent).toContain('retention-key-v1');
    fireEvent.click(screen.getByText('Retention pattern').closest('summary')!);
    expect((screen.getByLabelText('Legacy dimension assessment Retention / old wording for Retention pattern') as HTMLTextAreaElement).value).toBe('Old dimension-specific assessment');
    const notes = screen.getByLabelText('Notes for Retention pattern') as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: 'Edited current workspace note; historical note remains separate.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save assessments and next actions' }));
    await waitFor(() => expect(persisted.benchmark_workspace.entries[0].notes).toBe('Edited current workspace note; historical note remains separate.'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Benchmark: Retention pattern' }));
    await waitFor(() => expect(persisted.benchmark_selections).toEqual([]));
    expect(persisted.benchmark_workspace.entries[0].notes).toBe('Edited current workspace note; historical note remains separate.');
    expect(persisted.research_data.benchmark_dimensions[0].po_notes).toBe('Historical dimension PO note; do not discard.');
    view.unmount();
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Benchmark' }));
    expect(screen.getByText('Historical dimension PO note; do not discard.')).toBeTruthy();
    expect((screen.getByLabelText('Notes for Retention pattern') as HTMLTextAreaElement).value).toBe('Edited current workspace note; historical note remains separate.');
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
    fireEvent.click(await screen.findByRole('button', { name: 'View Insight: Guidance precedes first action' }));
    expect(await screen.findByText('Validate the flow with first-time users.')).toBeTruthy();
    expect(screen.getByText('Guided steps are shown before the first action.')).toBeTruthy();
    expect(screen.getAllByText('The report states that setup guidance is shown before the first transfer.')).toHaveLength(1);
    expect(screen.getByText('Region: US · Research period: 2025')).toBeTruthy();
    expect(screen.queryByText(/Operating system:|source:|audience:/i)).toBeNull();
    expect(screen.getByText('Show attributes (1)')).toBeTruthy();
    expect(screen.getByText('platform signature').closest('details')?.open).toBe(false);
    fireEvent.click(screen.getByText('Show attributes (1)'));
    expect(screen.getByText('platform signature')).toBeTruthy();
    expect(screen.queryByText(/Setup time reported:/)).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Source report' }).every((link) => link.getAttribute('href') === 'https://example.com/')).toBe(true);
    expect(screen.getByRole('heading', { name: /Supporting source references · needs_review · unverified/ })).toBeTruthy();
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
    expect(await screen.findByText('Seasonal access changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View Insight: Seasonal access changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Benchmark: Seasonal access changes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xem Benchmark' }));
    expect(await screen.findByRole('heading', { name: 'Insight assessment' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.change(screen.getByLabelText('PO Assessment for Seasonal access changes'), { target: { value: 'Needs local validation' } });
    fireEvent.change(screen.getByLabelText('Next Action for Seasonal access changes'), { target: { value: 'Interview service users' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save assessments and next actions' }));
    await waitFor(() => expect(persisted.benchmark_workspace.entries[0].po_assessment).toBe('Needs local validation'));
    cleanup();
    render(<ReportViewer reportId="saved-report" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Benchmark' }));
    expect((await screen.findByLabelText('PO Assessment for Seasonal access changes') as HTMLTextAreaElement).value).toBe('Needs local validation');
    expect((screen.getByLabelText('Next Action for Seasonal access changes') as HTMLTextAreaElement).value).toBe('Interview service users');
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
    await screen.findByText('An observed pattern');
    fireEvent.click(screen.getByRole('button', { name: 'View Insight: An observed pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Benchmark: An observed pattern' }));
    expect(await screen.findByText('Adding…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove from Benchmark: An observed pattern' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Xem Benchmark' }));
    const pendingDraft = await screen.findByLabelText('PO Assessment for An observed pattern') as HTMLTextAreaElement;
    fireEvent.change(pendingDraft, { target: { value: 'Draft typed while save was pending' } });
    releaseState.current?.();
    fireEvent.click(screen.getByRole('tab', { name: 'Benchmark' }));
    expect((screen.getByLabelText('PO Assessment for An observed pattern') as HTMLTextAreaElement).value).toBe('Draft typed while save was pending');
    fireEvent.click(screen.getByRole('tab', { name: 'Insights' }));
    expect(await screen.findByText('Added to Benchmark.')).toBeTruthy();
    failNextState = true;
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Benchmark: An observed pattern' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The selection could not be saved.');
    expect(screen.getByRole('button', { name: 'Remove from Benchmark: An observed pattern' })).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('tab', { name: 'Benchmark' }));
    fireEvent.click(screen.getByText('Transfer service A').closest('summary')!);
    const assessment = await screen.findByLabelText('PO Assessment for Transfer service A') as HTMLTextAreaElement;
    fireEvent.change(assessment, { target: { value: 'Unsaved decision draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Benchmark: Transfer service A' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('local backend may be outdated');
    expect(alert.textContent).toContain('reopen run.bat');
    expect((screen.getByLabelText('PO Assessment for Transfer service A') as HTMLTextAreaElement).value).toBe('Unsaved decision draft');
    expect(screen.getByRole('button', { name: 'Remove from Benchmark: Transfer service A' })).toBeTruthy();
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
    fireEvent.click(await screen.findByText('TEXT_ONLY · Structure this report'));
    const response = '{"schema_version":"po_research_v1","research_data":{}}';
    fireEvent.change(await screen.findByLabelText('Paste the complete ChatGPT response'), { target: { value: response } });
    fireEvent.click(screen.getByRole('button', { name: 'Update this report' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Backend local đang chạy phiên bản cũ');
    expect((screen.getByLabelText('Paste the complete ChatGPT response') as HTMLTextAreaElement).value).toBe(response);
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

  it('renders the default GEO with common choices in a multiselect dropdown', async () => {
    mockFetch(() => ({ items: [], next_cursor: null, limit: 10 }));
    render(<ResearchIntake />);
    const geo = await screen.findByRole('button', { name: 'GEO' });
    expect(geo.textContent).toContain('Global / not specified');
    fireEvent.click(geo);
    expect(screen.getByLabelText('United States (US)')).toBeTruthy();
    expect(screen.getByLabelText('United Kingdom (GB)')).toBeTruthy();
    expect(screen.getByLabelText('Other / custom')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: 'Report body' } });
    fireEvent.click(screen.getByRole('button', { name: 'GEO' }));
    fireEvent.click(screen.getByLabelText('Vietnam (VN)'));
    fireEvent.click(screen.getByLabelText('United States (US)'));
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));
    fireEvent.click(screen.getByLabelText('iOS'));
    fireEvent.click(screen.getByLabelText('Android'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: 'Report body' } });
    fireEvent.click(screen.getByRole('button', { name: 'GEO' }));
    fireEvent.click(screen.getByLabelText('Other / custom'));
    fireEvent.change(screen.getByLabelText('GEO tùy chỉnh'), { target: { value: 'Special Market' } });
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));
    fireEvent.click(screen.getByLabelText('Web'));
    fireEvent.click(screen.getByLabelText('Other / custom'));
    fireEvent.change(screen.getByLabelText('Environment name'), { target: { value: 'AR device' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Import ChatGPT report' }));
    fireEvent.change(screen.getByLabelText('Dán kết quả nghiên cứu từ ChatGPT'), { target: { value: report.content } });
    const save = screen.getByRole('button', { name: 'Lưu báo cáo vào workspace' });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1));
    finishImport(new Response(JSON.stringify(report)));
  });
});
