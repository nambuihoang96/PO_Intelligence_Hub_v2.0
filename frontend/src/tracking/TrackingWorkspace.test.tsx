// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TrackingWorkspace } from './TrackingWorkspace';
import { fireEvent, waitFor } from '@testing-library/react';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(handler(String(input), init)), { status: 200, headers: { 'Content-Type': 'application/json' } })));
}

const project = { id: 'project-1', name: 'Utility research', owner: null, category: 'Utilities', created_at: '2026-01-01', updated_at: '2026-01-02' };

describe('Tracking workspace', () => {
  it('opens the manual update form for the exact tracked item selected from report updates', async () => {
    window.history.pushState({}, '', '/tracking?projectId=project-1&manualUpdateCandidate=candidate-1');
    const candidate = {
      candidate_id: 'candidate-1', name: 'Finding: Royal Match lead', stale: false,
      decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-9', report_content_sha256: 'sha-9', item_key: 'finding-1' },
      decision: { candidate_id: 'candidate-1', revision: 1, dataset_id: null, dataset_content_sha256: null, source_entity_id: null,
        decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-9', report_content_sha256: 'sha-9', item_key: 'finding-1' },
        decision_status: 'hold', rationale: 'Check again next period.', supporting_evidence: [], contradictory_evidence: [], open_questions: [], assessments: [],
        priority: 'medium', review_date: null, next_action: null, manual_updates: [] },
    };
    mockFetch((url) => url.endsWith('/opportunities') ? { project_id: project.id, shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null, reports: [], candidates: [candidate] } : project);
    render(<TrackingWorkspace projectId="project-1" />);
    expect(await screen.findByRole('heading', { name: 'Ghi nhận cập nhật thủ công' })).toBeTruthy();
    expect(screen.getByText('Finding: Royal Match lead')).toBeTruthy();
    expect(window.location.search).not.toContain('manualUpdateCandidate');
  });

  it('shows tracking as pending without fabricated updates and links to the project journey', async () => {
    mockFetch((url) => url.endsWith('/opportunities') ? { project_id: project.id, shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null, candidates: [], reports: [] } : project);
    render(<TrackingWorkspace projectId="project-1" />);
    expect(await screen.findByText('Chưa có quyết định PO nào được lưu trong dự án này.')).toBeTruthy();
    const trackingSections = screen.getByRole('navigation', { name: 'Các phần theo dõi' });
    expect(trackingSections.querySelector('a[href="/report-updates?projectId=project-1"]')?.textContent).toBe('Cập nhật từ báo cáo');
    expect(screen.getByRole('navigation', { name: 'Các phần của dự án' }).querySelector('a[href^="/research?"]')?.getAttribute('href')).toContain('projectId=project-1');
    expect(screen.getByRole('navigation', { name: 'Các phần của dự án' }).querySelector('a[href^="/reports?"]')?.getAttribute('href')).toContain('/reports?projectId=project-1');
    expect(screen.getByRole('heading', { name: 'Việc cần làm từ nghiên cứu' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Xem và cập nhật quyết định/ })).toBeNull();
  });

  it('completes a tracking task without changing the PO decision', async () => {
    const candidate = {
      candidate_id: 'candidate-1', name: 'Reward comprehension', source_entity_id: null, target_kind: 'research_subject',
      dataset_id: null, dataset_content_sha256: null, dataset_filename: 'Research report', selection_reason: 'Saved from report',
      stale: false, stale_reasons: [], evidence_gaps: [], quantitative_evidence: [], resolved_decision_evidence: [], unresolved_decision_evidence: [],
      decision: { candidate_id: 'candidate-1', revision: 2, dataset_id: null, dataset_content_sha256: null, source_entity_id: null,
        decision_target: null, decision_status: 'investigate', workflow_status: 'researching', rationale: 'Need more evidence',
        supporting_evidence: [], contradictory_evidence: [], open_questions: [], assessments: [], priority: 'medium',
        review_date: null, next_action: 'Check the interview notes', manual_updates: [] },
    };
    const workspace = { project_id: project.id, shortlist_dataset_id: null, shortlist_valid: true, shortlist_warning: null, candidates: [candidate], reports: [] };
    const sentDecisions: Record<string, unknown>[] = [];
    mockFetch((url, init) => {
      if (url.endsWith('/opportunities/decisions')) {
        sentDecisions.push(JSON.parse(String(init?.body)));
        return { ...workspace, candidates: [{ ...candidate, decision: { ...candidate.decision, revision: 3, workflow_status: 'completed' } }] };
      }
      return url.endsWith('/opportunities') ? workspace : project;
    });
    render(<TrackingWorkspace projectId="project-1" />);
    const progress = await screen.findByRole('combobox', { name: 'Tiến độ: Reward comprehension' }) as HTMLSelectElement;
    expect(progress.options).toHaveLength(6);
    fireEvent.change(progress, { target: { value: 'completed' } });
    await waitFor(() => expect(sentDecisions.at(-1)?.workflow_status).toBe('completed'));
    expect(sentDecisions.at(-1)?.decision_status).toBe('investigate');
    fireEvent.click(screen.getByRole('button', { name: 'Đã xong · 1' }));
    expect(screen.getByRole('option', { name: 'Đã xong việc', selected: true })).toBeTruthy();
  });

  it('lists existing projects as follow-up destinations without implying monitoring is active', async () => {
    mockFetch((url) => url.includes('/projects?') ? { items: [project], next_cursor: null, limit: 20 } : project);
    render(<TrackingWorkspace projectId={null} />);
    expect(await screen.findByText('Utility research')).toBeTruthy();
    expect(screen.getByText(/Các quyết định đã lưu nằm trong dự án tương ứng/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Xem theo dõi/ }).getAttribute('href')).toContain('projectId=project-1');
  });

  it('reopens a saved report finding decision in its original context', async () => {
    mockFetch((url) => url.endsWith('/opportunities') ? { project_id: project.id, shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null, reports: [], candidates: [{
      candidate_id: 'candidate-1', name: 'Finding: save progress', stale: false,
      decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-9', report_content_sha256: 'sha-9', item_key: 'progression' },
      decision: { decision_status: 'hold', rationale: 'Need stronger evidence', next_action: 'Review another source', review_date: null, updated_at: '2026-10-28' },
    }] } : project);
    render(<TrackingWorkspace projectId="project-1" />);
    expect(await screen.findByText('Finding: save progress')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở quyết định PO' }).getAttribute('href')).toBe('/research?projectId=project-1&view=opportunities&decisionKind=report_finding&decisionReportId=report-9&decisionReportHash=sha-9&decisionItemKey=progression');
  });

  it('records a dated manual update on the selected decision without changing the PO decision', async () => {
    const candidate = {
      candidate_id: 'candidate-1', name: 'Finding: save progress', stale: false,
      decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-9', report_content_sha256: 'sha-9', item_key: 'progression' },
      decision: { candidate_id: 'candidate-1', expected_revision: 4, revision: 4, candidate_name: 'Display-only name', dataset_filename: 'display.csv',
        selection_reason: 'Display-only reason', updated_at: '2026-11-02T10:00:00Z', revision_history: [], dataset_id: null, dataset_content_sha256: null,
        source_entity_id: null, decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-9', report_content_sha256: 'sha-9', item_key: 'progression' },
        decision_status: 'hold', rationale: 'Keep the current decision.', supporting_evidence: [], contradictory_evidence: [], open_questions: [], assessments: [],
        priority: 'medium', review_date: '2026-11-15', next_action: 'Review with users', manual_updates: [] },
    };
    const workspace = { project_id: project.id, shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null, reports: [], candidates: [candidate] };
    const submitted: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).endsWith('/decisions')) {
        const body = JSON.parse(String(init.body)); submitted.push(body);
        workspace.candidates[0].decision = { ...body, revision: 5, updated_at: '2026-11-02T12:00:00Z' };
      }
      return new Response(JSON.stringify(String(input).endsWith('/opportunities') ? workspace : project), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<TrackingWorkspace projectId="project-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi nhận thay đổi' }));
    fireEvent.change(screen.getByLabelText('Điều bạn nhận thấy'), { target: { value: 'Observed a new consent step.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cập nhật' }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0].decision_status).toBe('hold');
    expect(submitted[0]).not.toHaveProperty('candidate_name');
    expect(submitted[0]).not.toHaveProperty('dataset_filename');
    expect(submitted[0]).not.toHaveProperty('selection_reason');
    expect(submitted[0]).not.toHaveProperty('updated_at');
    expect(submitted[0]).not.toHaveProperty('revision_history');
    expect((submitted[0].manual_updates as Array<Record<string, unknown>>)[0].content).toBe('Observed a new consent step.');
    expect((submitted[0].manual_updates as Array<Record<string, unknown>>)[0].observed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps the manual update draft and retry action visible when save and refresh both fail', async () => {
    const candidate = {
      candidate_id: 'candidate-1', name: 'Finding: save progress', stale: false,
      decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-9', report_content_sha256: 'sha-9', item_key: 'progression' },
      decision: { candidate_id: 'candidate-1', revision: 4, dataset_id: null, dataset_content_sha256: null,
        source_entity_id: null, decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-9', report_content_sha256: 'sha-9', item_key: 'progression' },
        decision_status: 'hold', rationale: 'Keep the current decision.', supporting_evidence: [], contradictory_evidence: [], open_questions: [], assessments: [],
        priority: 'medium', review_date: null, next_action: 'Review with users', manual_updates: [] },
    };
    const workspace = { project_id: project.id, shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null, reports: [], candidates: [candidate] };
    let opportunityReads = 0;
    const submittedIds: string[] = [];
    let saveCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith('/opportunities')) {
        opportunityReads += 1;
        if (opportunityReads > 1) return new Response(JSON.stringify({ error: { message: 'Refresh unavailable.' } }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify(workspace), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/decisions') && init.method === 'PUT') {
        saveCalls += 1;
        const body = JSON.parse(String(init.body));
        submittedIds.push(body.manual_updates.at(-1).id);
        if (saveCalls === 1) return new Response(JSON.stringify({ error: { message: 'Save unavailable.' } }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        workspace.candidates[0].decision = { ...body, revision: 5, updated_at: '2026-11-02T12:00:00Z' };
        return new Response(JSON.stringify(workspace), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(project), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<TrackingWorkspace projectId="project-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi nhận thay đổi' }));
    fireEvent.change(screen.getByLabelText('Điều bạn nhận thấy'), { target: { value: 'Keep this draft after the network failure.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cập nhật' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Refresh unavailable.*Nội dung vẫn còn trong biểu mẫu/);
    expect((screen.getByLabelText('Điều bạn nhận thấy') as HTMLTextAreaElement).value).toBe('Keep this draft after the network failure.');
    expect((screen.getByRole('button', { name: 'Thử lưu lại' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('Finding: save progress')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lưu lại' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Thử lưu lại' })).toBeNull());
    expect(screen.getByText('Keep this draft after the network failure.')).toBeTruthy();
    expect(submittedIds).toHaveLength(2);
    expect(submittedIds[1]).toBe(submittedIds[0]);
  });

  it('waits for the report list before saying that no newer report exists', async () => {
    const source = 'https://example.test/january';
    const identity = ['provider:game-a', 'completion_rate', 'Monthly tutorial completion rate', 'percent', 'Provider A', 'US', 'iOS', 'monthly', 'Provider method v1', 'reporting_interval'];
    const metric = { metric_id: 'completion_rate', metric_definition: 'Monthly tutorial completion rate', value: 62, value_precision: 'exact', unit: 'percent',
      entity_id: 'game-a', entity_name: 'Game A', source_entity_id: 'provider:game-a', source_provider: 'Provider A', entity_resolution_state: 'matched',
      geo: 'US', platform: 'iOS', period_start: '2026-01-01', period_end: '2026-01-31', period_semantics: 'reporting_interval', granularity: 'monthly',
      methodology: 'Provider method v1', source_reference: source, evidence_reference: null, verification_status: 'unverified', provenance_type: 'research_report',
      provenance_id: null, observation_type: 'reported', validation_reasons: [], comparison_ready: true };
    const report = { id: 'report-9', project_id: project.id, question: 'Tutorial completion rate?', geo: 'US', os: 'iOS', research_period: 'January',
      content_sha256: 'c'.repeat(64), origin: 'chatgpt_user_import', imported_at: '2026-01-10T00:00:00Z', verification_status: 'unverified', content: 'January report',
      comparison_reviews: [], research_data: { executive_summary: null, key_takeaways: [], sections: [], entities: [], benchmark_dimensions: [], research_gaps: [],
        po_recommendations: [], findings: [{ key: 'finding-1', title: 'Tutorial completion', description: 'Prior period', evidence_references: [source] }],
        evidence_references: [{ url: source, title: 'January source' }], quantitative_observations: [metric] } };
    const reference = { report_id: report.id, report_content_sha256: report.content_sha256,
      observation_key: JSON.stringify([JSON.stringify(identity), metric.period_start, metric.period_end, '62', source, null]),
      metric_identity_key: JSON.stringify(identity), metric_id: metric.metric_id, metric_definition: metric.metric_definition, value: 62, unit: 'percent',
      period_start: metric.period_start, period_end: metric.period_end, source_reference: source, evidence_reference: null, selected_at: '2026-01-10T00:00:00Z' };
    const target = { kind: 'report_finding', target_id: 'finding-1', report_id: report.id, report_content_sha256: report.content_sha256, item_key: 'finding-1' };
    const workspace = { project_id: project.id, shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null,
      reports: [{ report_id: report.id, question: report.question, geo: report.geo, os: report.os, research_period: report.research_period,
        content_sha256: report.content_sha256, verification_status: 'unverified', parse_status: 'PARSED', findings: [
          { key: 'finding-1', title: 'Tutorial completion', finding_type: 'observation', description: 'Prior period', evidence_status: 'unverified',
            uncertainty: null, po_implications: null, evidence_references: [source], existing_po_workspace: {} }], entities: [] }],
      candidates: [{ candidate_id: 'candidate-1', name: 'Tutorial completion', stale: false, decision_target: target,
        decision: { candidate_id: 'candidate-1', revision: 3, decision_target: target, tracked_observation_reference: reference, decision_status: 'investigate',
          rationale: '', supporting_evidence: [], contradictory_evidence: [], open_questions: [], assessments: [], priority: 'medium', review_date: null,
          next_action: 'Check again', manual_updates: [] } }] };
    let releaseReportList!: (response: Response) => void;
    const pendingReportList = new Promise<Response>((resolve) => { releaseReportList = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/reports?limit=100')) return pendingReportList;
      const body = url.endsWith('/opportunities') ? workspace : url.endsWith('/report-9') ? report : project;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<TrackingWorkspace projectId="project-1" />);
    expect(await screen.findByText(/Đang kiểm tra báo cáo mới/)).toBeTruthy();
    expect(screen.queryByText(/Chưa có báo cáo mới/)).toBeNull();
    releaseReportList(new Response(JSON.stringify({ items: [], next_cursor: null, limit: 100 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    expect(await screen.findByText(/Chưa có báo cáo mới/)).toBeTruthy();
  });

  it('shows and acknowledges the exact explicitly selected observation in its saved decision card', async () => {
    const beforeUrl = 'https://example.test/old-metric';
    const afterUrl = 'https://example.test/new-metric';
    const identity = ['provider:game-a', 'completion_rate', 'Monthly tutorial completion rate', 'percent', 'Provider A', 'US', 'iOS', 'monthly', 'Provider method v1', 'reporting_interval'];
    const observationKey = JSON.stringify([JSON.stringify(identity), '2026-01-01', '2026-01-31', '62', beforeUrl, null]);
    const metric = (value: number, start: string, end: string, source: string) => ({
      metric_id: 'completion_rate', metric_definition: 'Monthly tutorial completion rate', value, value_precision: 'exact', unit: 'percent',
      entity_id: 'game-a', entity_name: 'Game A', source_entity_id: 'provider:game-a', source_provider: 'Provider A',
      entity_resolution_state: 'matched', geo: 'US', platform: 'iOS', period_start: start, period_end: end,
      period_semantics: 'reporting_interval', granularity: 'monthly', methodology: 'Provider method v1',
      source_reference: source, evidence_reference: null, verification_status: 'unverified', provenance_type: 'research_report',
      provenance_id: null, observation_type: 'reported', validation_reasons: [], comparison_ready: true,
    });
    const summaries = [
      { id: 'report-new', project_id: project.id, question: 'Tutorial completion rate?', geo: 'US', os: 'iOS', research_period: 'February', content_sha256: 'd'.repeat(64), origin: 'chatgpt_user_import', imported_at: '2026-02-10T00:00:00Z', verification_status: 'unverified' },
      { id: 'report-9', project_id: project.id, question: 'Tutorial completion rate?', geo: 'US', os: 'iOS', research_period: 'January', content_sha256: 'c'.repeat(64), origin: 'chatgpt_user_import', imported_at: '2026-01-10T00:00:00Z', verification_status: 'unverified' },
    ];
    const base = { executive_summary: null, key_takeaways: [], sections: [], entities: [], benchmark_dimensions: [], research_gaps: [], po_recommendations: [] };
    const before = { ...summaries[1], content: 'prior report', research_data: { ...base,
      findings: [{ key: 'finding-1', title: 'Tutorial completion', description: 'Prior period', evidence_references: [beforeUrl] }],
      evidence_references: [{ url: beforeUrl, title: 'Prior source' }], quantitative_observations: [metric(62, '2026-01-01', '2026-01-31', beforeUrl)],
    } };
    let after: any = { ...summaries[0], content: 'current report', comparison_reviews: [{ before_report_id: 'report-9', before_item_key: 'finding-1', after_item_key: 'finding-2', decision: 'same', saved_at: '2026-02-10T00:00:00Z' }], research_data: { ...base,
      findings: [{ key: 'finding-2', title: 'Tutorial completion', description: 'Current period', evidence_references: [afterUrl] }],
      evidence_references: [{ url: afterUrl, title: 'Current source' }], quantitative_observations: [metric(68, '2026-02-01', '2026-03-03', afterUrl)],
    } };
    const reference = { report_id: 'report-9', report_content_sha256: 'c'.repeat(64), observation_key: observationKey,
      metric_identity_key: JSON.stringify(identity), metric_id: 'completion_rate', metric_definition: 'Monthly tutorial completion rate',
      value: 62, unit: 'percent', period_start: '2026-01-01', period_end: '2026-01-31', source_reference: beforeUrl, evidence_reference: null, selected_at: '2026-02-10T00:00:00Z' };
    const candidate = { candidate_id: 'candidate-1', name: 'Tutorial completion', stale: false,
      decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-9', report_content_sha256: 'c'.repeat(64), item_key: 'finding-1' },
      decision: { candidate_id: 'candidate-1', revision: 3, dataset_id: null, dataset_content_sha256: null, source_entity_id: null,
        decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-9', report_content_sha256: 'c'.repeat(64), item_key: 'finding-1' },
        tracked_observation_reference: reference, decision_status: 'investigate', rationale: '', supporting_evidence: [], contradictory_evidence: [],
        open_questions: [], assessments: [], priority: 'medium', review_date: null, next_action: 'Check again', manual_updates: [] },
    };
    const workspace: any = { project_id: project.id, shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null,
      reports: [{ report_id: 'report-9', question: 'Tutorial completion rate?', geo: 'US', os: 'iOS', research_period: 'January',
        content_sha256: 'c'.repeat(64), verification_status: 'unverified', parse_status: 'PARSED', findings: [
          { key: 'finding-1', title: 'Tutorial completion', finding_type: 'observation', description: 'Prior period', evidence_status: 'unverified', uncertainty: null, po_implications: null, evidence_references: [beforeUrl], existing_po_workspace: {} },
        ], entities: [] }], candidates: [candidate] };
    let savedReviewPayload: any;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith('/comparison-reviews') && init.method === 'PUT') {
        savedReviewPayload = JSON.parse(String(init.body));
        after = { ...after, comparison_reviews: savedReviewPayload.reviews };
        return new Response(JSON.stringify(after), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const body = url.includes('/api/v1/reports?') ? { items: summaries, next_cursor: null, limit: 100 }
        : url.endsWith('/api/v1/projects/project-1/opportunities') ? workspace
          : url.endsWith('/api/v1/projects/project-1') ? project
            : url.endsWith('/report-9') ? before : after;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<TrackingWorkspace projectId="project-1" />);
    expect(await screen.findByText('Tín hiệu từ báo cáo: 62% → 68%')).toBeTruthy();
    expect(screen.getByText(/Thay đổi: \+6 điểm phần trăm · \+9\.7% so với kỳ trước/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nguồn kỳ trước' }).getAttribute('href')).toBe(beforeUrl);
    expect(screen.getByRole('link', { name: 'Nguồn kỳ mới' }).getAttribute('href')).toBe(afterUrl);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã xem số liệu' }));
    expect(await screen.findByText('Đã xác nhận đã xem cặp số liệu này.')).toBeTruthy();
    expect(savedReviewPayload.reviews).toHaveLength(2);
    expect(savedReviewPayload.reviews[1]).toMatchObject({ review_type: 'tracked_observation', candidate_id: 'candidate-1', observation_key: observationKey, decision: 'reviewed' });
    expect(candidate.decision.decision_status).toBe('investigate');
  });
});
