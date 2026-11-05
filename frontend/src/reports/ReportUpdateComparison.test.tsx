// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReportUpdateComparison } from './ReportUpdateComparison';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, '', '/'); });

const summaries = [
  { id: 'after', project_id: 'p1', question: 'How does the game onboard players?', geo: 'US', os: 'iOS', research_period: 'February', content_sha256: 'b'.repeat(64), origin: 'chatgpt_user_import', imported_at: '2026-02-10T00:00:00Z', verification_status: 'unverified', finding_count: 2, entity_count: 0 },
  { id: 'before', project_id: 'p1', question: 'How does the game onboard players?', geo: 'US', os: 'iOS', research_period: 'January', content_sha256: 'a'.repeat(64), origin: 'chatgpt_user_import', imported_at: '2026-01-10T00:00:00Z', verification_status: 'unverified', finding_count: 2, entity_count: 0 },
];
const base = { executive_summary: null, key_takeaways: [], sections: [], entities: [], evidence_references: [], benchmark_dimensions: [], research_gaps: [], po_recommendations: [] };
const reports: Record<string, any> = {
  before: { ...summaries[1], content: 'old source text', research_data: { ...base, findings: [
    { key: 'stable', title: 'Tutorial completion', description: 'Completion is high.', evidence_references: [] },
    { key: 'prior', title: 'Prior-only note', description: 'Only in the prior report.', evidence_references: [] },
  ] } },
  after: { ...summaries[0], content: 'new source text', research_data: { ...base, findings: [
    { key: 'stable', title: 'Tutorial completion', description: 'Completion varies by device.', evidence_references: [] },
    { key: 'new-key', title: 'Tutorial completion', description: 'Another same-title item with a different key.', evidence_references: [] },
  ] } },
};

describe('Report period comparison', () => {
  it('opens the exact previous and newly saved reports after a repeat study', async () => {
    window.history.pushState({}, '', '/report-updates?projectId=p1&before=before&after=after&newReportSaved=1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/v1/reports?') ? { items: summaries, next_cursor: null, limit: 100 }
        : url.endsWith('/opportunities') ? { project_id: 'p1', shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null, reports: [], candidates: [] }
        : reports[url.split('/').pop() ?? ''];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<ReportUpdateComparison projectId="p1" />);
    expect((await screen.findByRole('status')).textContent).toContain('Đã lưu báo cáo kỳ mới; đang mở đúng cặp báo cáo để đối chiếu.');
    expect((await screen.findByRole('combobox', { name: 'Báo cáo trước' }) as HTMLSelectElement).value).toBe('before');
    expect((await screen.findByRole('combobox', { name: 'Báo cáo mới' }) as HTMLSelectElement).value).toBe('after');
  });

  it('offers a direct repeat-research path and asks which saved item to update manually', async () => {
    const candidate = { candidate_id: 'tracked-1', name: 'Finding: Royal Match lead', decision: { decision_status: 'hold' } };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/v1/reports?') ? { items: [summaries[0]], next_cursor: null, limit: 100 }
        : url.endsWith('/opportunities') ? { project_id: 'p1', shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null, reports: [], candidates: [candidate] }
        : reports[url.split('/').pop() ?? ''];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<ReportUpdateComparison projectId="p1" />);
    const researchAgain = await screen.findByRole('link', { name: 'Nghiên cứu lại cùng câu hỏi' });
    expect(researchAgain.getAttribute('href')).toContain('question=How%20does%20the%20game%20onboard%20players%3F');
    expect(researchAgain.getAttribute('href')).toContain('fromReportId=after&action=research-again');
    expect(screen.getByText('Đã có báo cáo kỳ cũ, chưa có báo cáo kỳ mới')).toBeTruthy();
    expect(screen.getByText(/chọn kỳ mới, rồi nhập báo cáo mới vào chính dự án này/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận thủ công' }));
    expect((await screen.findByRole('link', { name: 'Ghi nhận mục này →' })).getAttribute('href')).toBe('/tracking?projectId=p1&manualUpdateCandidate=tracked-1');
    expect(screen.getByText(/do PO nhập và chưa tự xác minh/)).toBeTruthy();
  });

  it('distinguishes repeat reports with the same question and study year', async () => {
    const sameYearSummaries = summaries.map((report) => ({ ...report, research_period: '2026' }));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/v1/reports?') ? { items: sameYearSummaries, next_cursor: null, limit: 100 }
        : reports[url.split('/').pop() ?? ''];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<ReportUpdateComparison projectId="p1" />);
    const before = await screen.findByRole('combobox', { name: 'Báo cáo trước' });
    const labels = Array.from(before.querySelectorAll('option')).map((option) => option.textContent ?? '');
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('Kỳ: 2026');
    expect(labels[0]).toContain('Nhập:');
    expect(labels[0]).toContain('Báo cáo: ');
  });

  it('keeps missing and ambiguous report findings explicit instead of inferring disappearance or a match', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/v1/reports?') ? { items: summaries, next_cursor: null, limit: 100 }
        : reports[url.split('/').pop() ?? ''];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<ReportUpdateComparison projectId="p1" />);
    expect(await screen.findByText('Đề xuất thay đổi · cùng mã, nội dung khác · PO cần xác nhận')).toBeTruthy();
    expect(screen.getByText('Đề xuất đối chiếu · tiêu đề có thể liên quan · cần xác nhận')).toBeTruthy();
    expect(screen.getByText('Không thấy cùng mã trong báo cáo mới')).toBeTruthy();
    expect(screen.getByText('Không thấy trong báo cáo mới không có nghĩa là đã biến mất.')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Mở phát hiện trong báo cáo gốc →' }).length).toBeGreaterThan(0);
  });

  it('reclassifies a PO-rejected exact-key pair as distinct and restores the old finding to not-mentioned', async () => {
    window.history.pushState({}, '', '/report-updates?before=before&after=after');
    const before = { ...reports.before, research_data: { ...base, findings: [
      { key: 'stable', title: 'Tutorial completion', description: 'Earlier report wording.', evidence_references: [] },
    ] } };
    let after = { ...reports.after, research_data: { ...base, findings: [
      { key: 'stable', title: 'Tutorial completion', description: 'Later report wording.', evidence_references: [] },
    ] }, comparison_reviews: [] };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith('/comparison-reviews')) {
        const body = JSON.parse(String(init.body));
        after = { ...after, comparison_reviews: body.reviews };
        return new Response(JSON.stringify(after), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const body = url.includes('/api/v1/reports?') ? { items: summaries, next_cursor: null, limit: 100 }
        : url.endsWith('/before') ? before : after;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<ReportUpdateComparison projectId="p1" />);
    const selector = await screen.findByRole('combobox', { name: 'Xác nhận cặp Tutorial completion' });
    fireEvent.change(selector, { target: { value: 'different' } });
    expect(await screen.findByText('PO xác nhận đây là một phát hiện khác')).toBeTruthy();
    expect(screen.getByText('Không thấy cùng mã trong báo cáo mới')).toBeTruthy();
    expect(screen.getByText('PO xác nhận đây là một phát hiện khác').parentElement?.textContent).toContain('Mở phát hiện trong báo cáo gốc');
  });

  it('compares multiple exact compatible metric rows and shows both report references', async () => {
    window.history.pushState({}, '', '/report-updates?before=before&after=after');
    const metric = (metricId: string, value: number, start: string, end: string, url: string) => ({
      metric_id: metricId, metric_definition: `${metricId} monthly total`, value, value_precision: 'exact' as const,
      unit: 'USD', entity_id: 'alpha', entity_name: 'Game Alpha', source_entity_id: 'provider:alpha',
      source_provider: 'Provider A', entity_resolution_state: 'matched' as const, geo: 'US', platform: 'iOS',
      period_start: start, period_end: end, period_semantics: 'reporting_interval' as const, granularity: 'monthly',
      methodology: 'Monthly estimate v1', source_reference: url, evidence_reference: null,
      verification_status: 'unverified' as const, provenance_type: 'research_report' as const, provenance_id: null,
      observation_type: 'reported' as const, validation_reasons: [], comparison_ready: true,
    });
    const before = { ...reports.before, research_data: { ...base,
      findings: [], evidence_references: [{ url: 'https://example.test/old-a', title: 'Old A' }, { url: 'https://example.test/old-b', title: 'Old B' }],
      quantitative_observations: [metric('m1', 100, '2026-01-01', '2026-01-31', 'https://example.test/old-a'), metric('m2', 50, '2026-01-01', '2026-01-31', 'https://example.test/old-b')],
    } };
    const after = { ...reports.after, research_data: { ...base,
      findings: [], evidence_references: [{ url: 'https://example.test/new-a', title: 'New A' }, { url: 'https://example.test/new-b', title: 'New B' }],
      quantitative_observations: [metric('m1', 110, '2026-02-01', '2026-03-03', 'https://example.test/new-a'), metric('m2', 75, '2026-02-01', '2026-03-03', 'https://example.test/new-b')],
    } };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/v1/reports?') ? { items: summaries, next_cursor: null, limit: 100 }
        : url.endsWith('/before') ? before : after;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<ReportUpdateComparison projectId="p1" />);
    expect(await screen.findAllByText('Đủ điều kiện so sánh · cùng định nghĩa, phạm vi và độ dài kỳ')).toHaveLength(2);
    expect(screen.getByText(/Thay đổi: \+10 USD/)).toBeTruthy();
    expect(screen.getByText(/Thay đổi: \+25 USD/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Old A' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'New A' })).toHaveLength(1);
  });

  it('rejects reversed report order and displays the exact blocking reason', async () => {
    window.history.pushState({}, '', '/report-updates?before=after&after=before');
    const metric = (value: number, url: string) => ({
      metric_id: 'm1', metric_definition: 'Monthly revenue', value, value_precision: 'exact' as const,
      unit: 'USD', entity_id: 'alpha', entity_name: 'Game Alpha', source_entity_id: 'provider:alpha',
      source_provider: 'Provider A', entity_resolution_state: 'matched' as const, geo: 'US', platform: 'iOS',
      period_start: '2026-01-01', period_end: '2026-01-31', period_semantics: 'reporting_interval' as const,
      granularity: 'monthly', methodology: 'Monthly estimate v1', source_reference: url, evidence_reference: null,
      verification_status: 'unverified' as const, provenance_type: 'research_report' as const, provenance_id: null,
      observation_type: 'reported' as const, validation_reasons: [], comparison_ready: true,
    });
    const older = { ...reports.before, research_data: { ...base, findings: [], evidence_references: [], quantitative_observations: [metric(100, 'https://example.test/old')] } };
    const newer = { ...reports.after, research_data: { ...base, findings: [], evidence_references: [], quantitative_observations: [metric(110, 'https://example.test/new')] } };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/v1/reports?') ? { items: summaries, next_cursor: null, limit: 100 }
        : url.endsWith('/after') ? newer : older;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<ReportUpdateComparison projectId="p1" />);
    expect(await screen.findByText(/Báo cáo mới phải được nhập sau báo cáo trước\./)).toBeTruthy();
  });

  it('blocks duplicate metrics in the selected current report instead of calculating two deltas', async () => {
    window.history.pushState({}, '', '/report-updates?before=before&after=after');
    const metric = (value: number, url: string) => ({
      metric_id: 'm1', metric_definition: 'Monthly revenue', value, value_precision: 'exact' as const,
      unit: 'USD', entity_id: 'alpha', entity_name: 'Game Alpha', source_entity_id: 'provider:alpha',
      source_provider: 'Provider A', entity_resolution_state: 'matched' as const, geo: 'US', platform: 'iOS',
      period_start: '2026-02-01', period_end: '2026-03-03', period_semantics: 'reporting_interval' as const,
      granularity: 'monthly', methodology: 'Monthly estimate v1', source_reference: url, evidence_reference: null,
      verification_status: 'unverified' as const, provenance_type: 'research_report' as const, provenance_id: null,
      observation_type: 'reported' as const, validation_reasons: [], comparison_ready: true,
    });
    const before = { ...reports.before, research_data: { ...base, findings: [], evidence_references: [],
      quantitative_observations: [{ ...metric(100, 'https://example.test/old'), period_start: '2026-01-01', period_end: '2026-01-31' }] } };
    const after = { ...reports.after, research_data: { ...base, findings: [], evidence_references: [],
      quantitative_observations: [metric(110, 'https://example.test/new'), metric(115, 'https://example.test/new-duplicate')] } };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/v1/reports?') ? { items: summaries, next_cursor: null, limit: 100 }
        : url.endsWith('/before') ? before : after;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<ReportUpdateComparison projectId="p1" />);
    expect(await screen.findAllByText(/Báo cáo mới có số liệu trùng đối tượng, chỉ số và kỳ đo\./)).toHaveLength(2);
    expect(screen.queryByText(/Thay đổi:/)).toBeNull();
  });

  it('shows and saves a decision-scoped metric review only when both sources link to the PO-confirmed finding', async () => {
    window.history.pushState({}, '', '/report-updates?before=before&after=after');
    const oldUrl = 'https://example.test/prior-metric';
    const newUrl = 'https://example.test/current-metric';
    const metric = (value: number, start: string, end: string, url: string) => ({
      metric_id: 'completion_rate', metric_definition: 'Monthly tutorial completion rate', value,
      value_precision: 'exact' as const, unit: 'percent', entity_id: 'game-a', entity_name: 'Game A',
      source_entity_id: 'provider:game-a', source_provider: 'Provider A', entity_resolution_state: 'matched' as const,
      geo: 'US', platform: 'iOS', period_start: start, period_end: end,
      period_semantics: 'reporting_interval' as const, granularity: 'monthly', methodology: 'Provider method v1',
      source_reference: url, evidence_reference: null, verification_status: 'unverified' as const,
      provenance_type: 'research_report' as const, provenance_id: null, observation_type: 'reported' as const,
      validation_reasons: [], comparison_ready: true,
    });
    const oldFinding = { key: 'stable', title: 'Tutorial completion', description: 'Prior completion rate.', evidence_references: [oldUrl], source_locations: [] };
    const newFinding = { key: 'stable', title: 'Tutorial completion', description: 'Current completion rate.', evidence_references: [newUrl], source_locations: [] };
    const sameReview = { before_report_id: 'before', before_item_key: 'stable', after_item_key: 'stable', decision: 'same', saved_at: '2026-02-10T00:00:00Z' };
    const metricIdentity = ['provider:game-a', 'completion_rate', 'Monthly tutorial completion rate', 'percent', 'Provider A', 'US', 'iOS', 'monthly', 'Provider method v1', 'reporting_interval'];
    const selectedObservationKey = JSON.stringify([JSON.stringify(metricIdentity), '2026-01-01', '2026-01-31', '62', oldUrl, null]);
    const before = { ...reports.before, research_data: { ...base, findings: [oldFinding],
      evidence_references: [{ url: oldUrl, title: 'Prior source' }], quantitative_observations: [metric(62, '2026-01-01', '2026-01-31', oldUrl)] } };
    let after = { ...reports.after, comparison_reviews: [sameReview], research_data: { ...base, findings: [newFinding],
      evidence_references: [{ url: newUrl, title: 'Current source' }], quantitative_observations: [metric(68, '2026-02-01', '2026-03-03', newUrl)] } };
    let savedPayload: any = null;
    const candidate = { candidate_id: 'po-decision-1', name: 'Tutorial completion', decision_target: {
      kind: 'report_finding', target_id: 'stable', report_id: 'before', report_content_sha256: 'a'.repeat(64), item_key: 'stable',
    }, decision: { revision: 2, decision_status: 'investigate', decision_target: { kind: 'report_finding', target_id: 'stable', report_id: 'before', report_content_sha256: 'a'.repeat(64), item_key: 'stable' }, tracked_observation_reference: {
      report_id: 'before', report_content_sha256: 'a'.repeat(64), observation_key: selectedObservationKey,
      metric_identity_key: JSON.stringify(metricIdentity), metric_id: 'completion_rate', metric_definition: 'Monthly tutorial completion rate',
      value: 62, unit: 'percent', period_start: '2026-01-01', period_end: '2026-01-31', source_reference: oldUrl, evidence_reference: null,
      selected_at: '2026-02-10T00:00:00Z',
    } } };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith('/comparison-reviews') && init.method === 'PUT') {
        savedPayload = JSON.parse(String(init.body));
        after = { ...after, comparison_reviews: savedPayload.reviews };
        return new Response(JSON.stringify(after), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const body = url.includes('/api/v1/reports?') ? { items: summaries, next_cursor: null, limit: 100 }
        : url.endsWith('/api/v1/projects/p1/opportunities') ? { candidates: [candidate] }
          : url.endsWith('/before') ? before : after;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<ReportUpdateComparison projectId="p1" />);
    const savedSignal = await screen.findByText((_, element) => element?.tagName === 'STRONG' && Boolean(element.textContent?.includes('Số liệu gắn với phát hiện đã lưu:')));
    expect(savedSignal.textContent).toContain('62% → 68%');
    expect(screen.getByText('0 đề xuất cần xem')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Xem gợi ý đầu tiên/ })).toBeNull();
    expect(screen.getByText('PO xác nhận cùng phát hiện · nội dung có thay đổi')).toBeTruthy();
    expect(screen.getByText(/Thay đổi: \+6 điểm phần trăm · \+9\.7% so với kỳ trước/)).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Báo cáo trước' }) as HTMLSelectElement).selectedOptions[0].textContent).toMatch(/^Kỳ đo: 2026-01-01 – 2026-01-31/);
    expect((screen.getByRole('combobox', { name: 'Báo cáo mới' }) as HTMLSelectElement).selectedOptions[0].textContent).toMatch(/^Kỳ đo: 2026-02-01 – 2026-03-03/);
    const measuredPeriodSummary = screen.getByText('Kỳ đo trong số liệu:').parentElement?.textContent ?? '';
    expect(measuredPeriodSummary).toContain('2026-01-01 – 2026-01-31 → 2026-02-01 – 2026-03-03');
    expect(screen.getAllByRole('link', { name: 'Prior source' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Current source' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã xem số liệu' }));
    expect(await screen.findByText('PO đã xác nhận đã xem cặp số liệu này.')).toBeTruthy();
    expect(savedPayload.reviews).toContainEqual(expect.objectContaining({ review_type: 'tracked_observation',
      candidate_id: 'po-decision-1', before_report_id: 'before', before_item_key: 'stable', after_item_key: 'stable', decision: 'reviewed' }));
    expect(savedPayload.reviews).toContainEqual(expect.objectContaining({ before_item_key: 'stable', after_item_key: 'stable', decision: 'same' }));
  });

  it('does not assign a decision-scoped signal when several metrics share a source URL and the PO has selected none', async () => {
    window.history.pushState({}, '', '/report-updates?before=before&after=after');
    const sharedUrl = 'https://example.test/shared-source';
    const metric = (metricId: string, value: number, start: string, end: string) => ({
      metric_id: metricId, metric_definition: `${metricId} monthly measure`, value, value_precision: 'exact' as const,
      unit: 'percent', entity_id: 'game-a', entity_name: 'Game A', source_entity_id: 'provider:game-a',
      source_provider: 'Provider A', entity_resolution_state: 'matched' as const, geo: 'US', platform: 'iOS',
      period_start: start, period_end: end, period_semantics: 'reporting_interval' as const, granularity: 'monthly',
      methodology: 'Provider method v1', source_reference: sharedUrl, evidence_reference: null,
      verification_status: 'unverified' as const, provenance_type: 'research_report' as const, provenance_id: null,
      observation_type: 'reported' as const, validation_reasons: [], comparison_ready: true,
    });
    const before = { ...reports.before, research_data: { ...base,
      findings: [{ key: 'stable', title: 'Tutorial completion', description: 'Prior measure.', evidence_references: [sharedUrl] }],
      evidence_references: [{ url: sharedUrl, title: 'One shared source' }],
      quantitative_observations: [metric('completion_rate', 62, '2026-01-01', '2026-01-31'), metric('retention_rate', 42, '2026-01-01', '2026-01-31')],
    } };
    const after = { ...reports.after, comparison_reviews: [{ before_report_id: 'before', before_item_key: 'stable', after_item_key: 'stable', decision: 'same', saved_at: '2026-02-10T00:00:00Z' }], research_data: { ...base,
      findings: [{ key: 'stable', title: 'Tutorial completion', description: 'Current measure.', evidence_references: [sharedUrl] }],
      evidence_references: [{ url: sharedUrl, title: 'One shared source' }],
      quantitative_observations: [metric('completion_rate', 68, '2026-02-01', '2026-03-03'), metric('retention_rate', 48, '2026-02-01', '2026-03-03')],
    } };
    const candidate = { candidate_id: 'po-decision-unselected', name: 'Tutorial completion', decision_target: {
      kind: 'report_finding', target_id: 'stable', report_id: 'before', report_content_sha256: 'a'.repeat(64), item_key: 'stable',
    }, decision: { decision_status: 'investigate', decision_target: { kind: 'report_finding', target_id: 'stable', report_id: 'before', report_content_sha256: 'a'.repeat(64), item_key: 'stable' } } };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/v1/reports?') ? { items: summaries, next_cursor: null, limit: 100 }
        : url.endsWith('/api/v1/projects/p1/opportunities') ? { candidates: [candidate] }
          : url.endsWith('/before') ? before : after;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const { container } = render(<ReportUpdateComparison projectId="p1" />);
    expect(await screen.findByText('Chưa chọn số liệu để theo dõi trong quyết định PO này.')).toBeTruthy();
    expect(screen.queryByText(/Số liệu gắn với phát hiện đã lưu:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xác nhận đã xem số liệu' })).toBeNull();
    const trackedSection = container.querySelector('.report-update-followed');
    expect(trackedSection?.textContent).not.toContain('68 percent');
  });
});
