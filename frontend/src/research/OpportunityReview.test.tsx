// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { researchApi, type OpportunityWorkspace } from './api';
import { OpportunityReview } from './OpportunityReview';

vi.mock('./api', () => ({ researchApi: { getOpportunities: vi.fn(), saveOpportunityDecision: vi.fn() } }));

const workspace: OpportunityWorkspace = {
  project_id: 'workspace-1', shortlist_dataset_id: 'dataset-1', shortlist_valid: true, shortlist_warning: null,
  candidates: [{
    candidate_id: 'csv:candidate-one', name: 'Product Alpha', source_entity_id: 'provider:alpha', dataset_id: 'dataset-1',
    dataset_content_sha256: 'a'.repeat(64), dataset_filename: 'market.csv', selection_reason: 'Selected manually',
    stale: false, stale_reasons: [], evidence_gaps: [], quantitative_evidence: [{ kind: 'quantitative', dataset_id: 'dataset-1',
      dataset_content_sha256: 'a'.repeat(64), source_entity_id: 'provider:alpha', source_row_number: 2,
      metric_id: 'downloads_absolute', metric_definition: 'Downloads', value: 1200, unit: 'downloads',
      geo: 'Worldwide', platform: 'Unified', period_start: '2026-09-01', period_end: '2026-09-30',
      verification_status: 'unverified', analysis_ready: true, validation_reasons: [] }],
    decision: null, resolved_decision_evidence: [], unresolved_decision_evidence: [],
  }],
  reports: [{ report_id: 'report-1', question: 'How do users choose?', geo: 'Worldwide', os: 'Unknown',
    research_period: null, content_sha256: 'b'.repeat(64), verification_status: 'unverified', parse_status: 'STRUCTURED',
    findings: [{ key: 'finding-1', title: 'Users value simplicity', finding_type: 'behavior', description: 'The report says users prefer simple flows.', evidence_status: 'unverified', uncertainty: 'Small sample.', po_implications: 'Test a simpler flow.', evidence_references: ['https://example.org/source'], existing_po_workspace: {} }], entities: [] }],
};

function workspaceWithTwoCandidates(): OpportunityWorkspace {
  const result = structuredClone(workspace);
  const first = result.candidates[0];
  result.candidates.push({ ...structuredClone(first), candidate_id: 'csv:candidate-two', name: 'Product Beta',
    source_entity_id: 'provider:beta', quantitative_evidence: [], decision: null,
    resolved_decision_evidence: [], unresolved_decision_evidence: [] });
  return result;
}

function savedWorkspace(payload: Parameters<typeof researchApi.saveOpportunityDecision>[1]): OpportunityWorkspace {
  const result = workspaceWithTwoCandidates();
  result.candidates = result.candidates.map((candidate) => candidate.candidate_id === payload.candidate_id
    ? { ...candidate, decision: { ...payload, revision: (payload.expected_revision ?? 0) + 1,
      candidate_name: candidate.name, dataset_filename: candidate.dataset_filename,
      selection_reason: candidate.selection_reason, updated_at: '2026-10-24T00:00:00Z' },
      resolved_decision_evidence: payload.supporting_evidence, unresolved_decision_evidence: [] }
    : candidate);
  return result;
}

describe('OpportunityReview', () => {
  beforeEach(() => {
    vi.mocked(researchApi.getOpportunities).mockResolvedValue(structuredClone(workspace));
    vi.mocked(researchApi.saveOpportunityDecision).mockImplementation(async (_projectId, payload) => savedWorkspace(payload));
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows source measurements as unverified and does not auto-attach similarly named report findings', async () => {
    render(<OpportunityReview projectId="workspace-1" />);
    expect(await screen.findByRole('heading', { name: 'Theo dõi quyết định sản phẩm' })).toBeTruthy();
    expect(await screen.findByText('Product Alpha')).toBeTruthy();
    expect(await screen.findByLabelText('Gắn Downloads ở dòng dữ liệu 2')).toBeTruthy();
    expect(screen.getByText(/dòng dữ liệu 2.*chưa xác minh/i)).toBeTruthy();
    expect(screen.queryByText('Users value simplicity')).toBeNull();
    fireEvent.change(screen.getByLabelText('Báo cáo nghiên cứu'), { target: { value: 'report-1' } });
    expect(await screen.findByText('Users value simplicity')).toBeTruthy();
    expect(screen.getByText(/Không tự ghép báo cáo theo tên sản phẩm/)).toBeTruthy();
  });

  it('opens a report finding PO decision from its explicit contextual link', async () => {
    const result = structuredClone(workspace);
    result.candidates.push({
      candidate_id: 'context:report-finding', name: 'Users value simplicity', source_entity_id: null,
      dataset_id: null, dataset_content_sha256: null, dataset_filename: 'Báo cáo nghiên cứu',
      selection_reason: 'How do users choose?', target_kind: 'report_finding',
      decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-1',
        report_content_sha256: 'b'.repeat(64), item_key: 'finding-1' },
      stale: false, stale_reasons: [], evidence_gaps: [], quantitative_evidence: [], decision: null,
      resolved_decision_evidence: [], unresolved_decision_evidence: [],
    });
    vi.mocked(researchApi.getOpportunities).mockResolvedValue(result);
    window.history.replaceState({}, '', '/research?projectId=workspace-1&view=opportunities&decisionKind=report_finding&decisionReportId=report-1&decisionReportHash=' + 'b'.repeat(64) + '&decisionItemKey=finding-1');
    render(<OpportunityReview projectId="workspace-1" />);
    expect(await screen.findByRole('heading', { name: 'Users value simplicity' })).toBeTruthy();
    expect(screen.getByText('PHÁT HIỆN TRONG BÁO CÁO')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Lý do / đánh giá của PO'), { target: { value: 'Assess this finding directly.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
    await waitFor(() => expect(researchApi.saveOpportunityDecision).toHaveBeenCalledTimes(1));
    expect(vi.mocked(researchApi.saveOpportunityDecision).mock.calls[0][1].decision_target).toEqual(result.candidates[1].decision_target);
    window.history.replaceState({}, '', '/');
  });

  it('shows prior Quyết định của PO versions without exposing raw decision JSON', async () => {
    const result = structuredClone(workspace);
    result.candidates[0].decision = {
      candidate_id: result.candidates[0].candidate_id, expected_revision: 2, revision: 2,
      dataset_id: 'dataset-1', dataset_content_sha256: 'a'.repeat(64), source_entity_id: 'provider:alpha',
      decision_status: 'investigate', rationale: 'Current rationale.', supporting_evidence: [], contradictory_evidence: [],
      open_questions: [], assessments: [], priority: 'medium', review_date: null, next_action: 'Current action.',
      revision_history: [{ revision: 1, saved_at: '2026-10-26T10:00:00Z', snapshot: {
        rationale: 'Earlier Lý do / đánh giá của PO.', decision_status: 'hold', next_action: 'Review source context.' } }],
    };
    vi.mocked(researchApi.getOpportunities).mockResolvedValue(result);
    render(<OpportunityReview projectId="workspace-1" />);
    expect(await screen.findByDisplayValue('Current rationale.')).toBeTruthy();
    fireEvent.click(screen.getByText('Các phiên bản quyết định trước (1)'));
    expect(screen.getByText('Earlier Lý do / đánh giá của PO.')).toBeTruthy();
    expect(screen.getByText(/Quyết định: Tạm hoãn · Việc tiếp theo: Review source context./)).toBeTruthy();
    expect(screen.queryByText(/\{"candidate_id"/)).toBeNull();
  });

  it('reopens saved evidence references when the API includes nullable optional fields', async () => {
    const reference = { kind: 'quantitative' as const, dataset_id: 'dataset-1', source_entity_id: 'provider:alpha',
      source_row_number: 2, metric_id: 'downloads_absolute', report_id: null, report_content_sha256: null, item_key: null };
    const candidate = structuredClone(workspace.candidates[0]);
    candidate.decision = { candidate_id: candidate.candidate_id, revision: 1, dataset_id: candidate.dataset_id,
      dataset_content_sha256: candidate.dataset_content_sha256, source_entity_id: candidate.source_entity_id,
      decision_status: 'investigate', rationale: 'Review saved evidence.', supporting_evidence: [reference],
      contradictory_evidence: [], open_questions: [], assessments: [], priority: 'medium', review_date: null, next_action: '' };
    vi.mocked(researchApi.getOpportunities).mockResolvedValue({ ...structuredClone(workspace), candidates: [candidate] });
    render(<OpportunityReview projectId="workspace-1" />);
    expect(await screen.findByLabelText('Gắn Downloads ở dòng dữ liệu 2')).toHaveProperty('checked', true);
    expect(screen.getByText(/Bằng chứng đã chọn \(1 ủng hộ · 0 trái chiều\)/)).toBeTruthy();
  });

  it('saves explicit PO judgment, priority, follow-up and attached evidence', async () => {
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByLabelText('Lý do / đánh giá của PO');
    fireEvent.click(screen.getByLabelText('Gắn Downloads ở dòng dữ liệu 2'));
    fireEvent.change(screen.getByLabelText('Quyết định của PO'), { target: { value: 'investigate' } });
    fireEvent.change(screen.getByLabelText('Chọn mức ưu tiên'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('Lý do / đánh giá của PO'), { target: { value: 'Validate retention before prioritizing.' } });
    fireEvent.change(screen.getByLabelText('Việc tiếp theo'), { target: { value: 'Request a retention study.' } });
    fireEvent.change(screen.getByLabelText('Câu hỏi còn mở'), { target: { value: 'What is D7 retention?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
    await waitFor(() => expect(researchApi.saveOpportunityDecision).toHaveBeenCalledTimes(1));
    const submitted = vi.mocked(researchApi.saveOpportunityDecision).mock.calls[0][1];
    expect(submitted.decision_status).toBe('investigate');
    expect(submitted.priority).toBe('high');
    expect(submitted.rationale).toContain('Validate retention');
    expect(submitted.next_action).toContain('retention study');
    expect(submitted.open_questions).toEqual(['What is D7 retention?']);
    expect(submitted.supporting_evidence).toEqual([{ kind: 'quantitative', dataset_id: 'dataset-1',
      source_entity_id: 'provider:alpha', source_row_number: 2, metric_id: 'downloads_absolute' }]);
    expect(await screen.findByText('Đã lưu quyết định.')).toBeTruthy();
  });

  it('saves repeatedly without echoing response-only metadata into the strict request contract', async () => {
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByLabelText('Lý do / đánh giá của PO');
    fireEvent.change(screen.getByLabelText('Lý do / đánh giá của PO'), { target: { value: 'First saved judgment.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
    await screen.findByText('Đã lưu quyết định.');
    fireEvent.change(screen.getByLabelText('Lý do / đánh giá của PO'), { target: { value: 'Updated saved judgment.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
    await waitFor(() => expect(researchApi.saveOpportunityDecision).toHaveBeenCalledTimes(2));
    const secondPayload = vi.mocked(researchApi.saveOpportunityDecision).mock.calls[1][1] as Record<string, unknown>;
    expect(secondPayload.expected_revision).toBe(1);
    expect(secondPayload.rationale).toBe('Updated saved judgment.');
    expect(secondPayload).not.toHaveProperty('candidate_name');
    expect(secondPayload).not.toHaveProperty('dataset_filename');
    expect(secondPayload).not.toHaveProperty('updated_at');
    expect(secondPayload).not.toHaveProperty('revision');
    expect(await screen.findByText('Đã lưu quyết định.')).toBeTruthy();
  });

  it('keeps stale historical judgments visible without presenting stale measurements', async () => {
    vi.mocked(researchApi.getOpportunities).mockResolvedValue({ ...structuredClone(workspace), shortlist_valid: false,
      shortlist_warning: 'The source dataset is missing.', candidates: [{ ...structuredClone(workspace.candidates[0]),
        stale: true, stale_reasons: ['Dataset hash mismatch.'], quantitative_evidence: [],
        decision: { ...structuredClone(workspace.candidates[0]).decision, candidate_id: 'csv:candidate-one',
          dataset_id: 'dataset-1', dataset_content_sha256: 'a'.repeat(64), source_entity_id: 'provider:alpha',
          decision_status: 'hold', rationale: 'Historical note', supporting_evidence: [], contradictory_evidence: [],
          open_questions: [], assessments: [], priority: 'medium', review_date: null, next_action: '' } }],
    });
    render(<OpportunityReview projectId="workspace-1" />);
    expect((await screen.findByLabelText('Lý do / đánh giá của PO') as HTMLTextAreaElement).value).toBe('Historical note');
    expect(screen.getByText(/Dataset hash mismatch/)).toBeTruthy();
    expect(screen.queryByText(/Downloads: 1200 downloads/)).toBeNull();
  });

  it('keeps draft text after a failed save and allows an explicit retry', async () => {
    vi.mocked(researchApi.saveOpportunityDecision).mockRejectedValueOnce(new Error('Network unavailable'));
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByLabelText('Lý do / đánh giá của PO');
    fireEvent.change(screen.getByLabelText('Lý do / đánh giá của PO'), { target: { value: 'Keep this draft after the failure.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
    expect(await screen.findByText('Lưu không thành công')).toBeTruthy();
    expect((screen.getByLabelText('Lý do / đánh giá của PO') as HTMLTextAreaElement).value).toBe('Keep this draft after the failure.');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lưu lại' }));
    await waitFor(() => expect(researchApi.saveOpportunityDecision).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Đã lưu quyết định.')).toBeTruthy();
  });

  it('protects an unsaved draft when switching candidates, then reopens the saved decision', async () => {
    const two = workspaceWithTwoCandidates();
    vi.mocked(researchApi.getOpportunities).mockResolvedValue(two);
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByLabelText('Lý do / đánh giá của PO');
    fireEvent.change(screen.getByLabelText('Lý do / đánh giá của PO'), { target: { value: 'Keep this decision rationale.' } });
    fireEvent.change(screen.getByLabelText('Việc tiếp theo'), { target: { value: 'Ask for comparable retention data.' } });
    fireEvent.click(screen.getByText('Product Beta').closest('button')!);
    expect(await screen.findByRole('alertdialog', { name: 'Thay đổi chưa lưu' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }));
    expect(screen.getByLabelText('Lý do / đánh giá của PO')).toHaveProperty('value', 'Keep this decision rationale.');
    fireEvent.click(screen.getByText('Product Beta').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và tiếp tục' }));
    await screen.findByRole('region', { name: 'Xem xét Product Beta' });
    expect(vi.mocked(researchApi.saveOpportunityDecision).mock.calls[0][1].rationale).toBe('Keep this decision rationale.');
    fireEvent.click(screen.getByText('Product Alpha').closest('button')!);
    expect((await screen.findByLabelText('Lý do / đánh giá của PO') as HTMLTextAreaElement).value).toBe('Keep this decision rationale.');
    expect((screen.getByLabelText('Việc tiếp theo') as HTMLTextAreaElement).value).toBe('Ask for comparable retention data.');
  });

  it('lets the PO explicitly discard a draft before changing candidates', async () => {
    vi.mocked(researchApi.getOpportunities).mockResolvedValue(workspaceWithTwoCandidates());
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByLabelText('Lý do / đánh giá của PO');
    fireEvent.change(screen.getByLabelText('Lý do / đánh giá của PO'), { target: { value: 'Discard this draft.' } });
    fireEvent.click(screen.getByText('Product Beta').closest('button')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ thay đổi' }));
    await screen.findByRole('region', { name: 'Xem xét Product Beta' });
    expect(researchApi.saveOpportunityDecision).not.toHaveBeenCalled();
  });

  it('keeps edits made while a save is pending instead of applying a stale response', async () => {
    vi.mocked(researchApi.getOpportunities).mockResolvedValue(workspaceWithTwoCandidates());
    let resolveSave!: () => void;
    vi.mocked(researchApi.saveOpportunityDecision).mockImplementation((_projectId, payload) => new Promise((resolve) => {
      resolveSave = () => resolve(savedWorkspace(payload));
    }));
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByLabelText('Lý do / đánh giá của PO');
    fireEvent.change(screen.getByLabelText('Lý do / đánh giá của PO'), { target: { value: 'First submitted draft.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
    fireEvent.change(screen.getByLabelText('Lý do / đánh giá của PO'), { target: { value: 'Newer edit after save began.' } });
    resolveSave();
    await waitFor(() => expect(screen.getByText('Chưa lưu thay đổi')).toBeTruthy());
    expect((screen.getByLabelText('Lý do / đánh giá của PO') as HTMLTextAreaElement).value).toBe('Newer edit after save began.');
  });

  it('preserves the draft and explains a revision conflict', async () => {
    vi.mocked(researchApi.saveOpportunityDecision).mockRejectedValueOnce(new Error('Decision changed in another session. Refresh and review the saved version.'));
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByLabelText('Lý do / đánh giá của PO');
    fireEvent.change(screen.getByLabelText('Lý do / đánh giá của PO'), { target: { value: 'My conflicting edit stays here.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/changed in another session/i);
    expect((screen.getByLabelText('Lý do / đánh giá của PO') as HTMLTextAreaElement).value).toBe('My conflicting edit stays here.');
  });

  it('requires evidence to be attached to an observed fact assessment and saves its exact reference', async () => {
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByLabelText('Lý do / đánh giá của PO');
    fireEvent.change(screen.getByLabelText('Khía cạnh đánh giá gợi ý'), { target: { value: 'Market signal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    fireEvent.change(screen.getByLabelText('Tín hiệu thị trường loại bằng chứng'), { target: { value: 'observed_fact' } });
    expect(screen.getByText(/Sự kiện đã quan sát cần có bằng chứng hỗ trợ được gắn/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/Gắn bằng chứng vào đánh giá này/));
    fireEvent.click(screen.getByLabelText('Tín hiệu thị trường: Downloads · dòng dữ liệu 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
    await waitFor(() => expect(researchApi.saveOpportunityDecision).toHaveBeenCalledTimes(1));
    expect(vi.mocked(researchApi.saveOpportunityDecision).mock.calls[0][1].assessments[0].evidence_refs).toEqual([
      { kind: 'quantitative', dataset_id: 'dataset-1', source_entity_id: 'provider:alpha', source_row_number: 2, metric_id: 'downloads_absolute' },
    ]);
  });

  it('labels approximate values and preserves zero as a supplied value', async () => {
    const approx = structuredClone(workspace);
    approx.candidates[0].quantitative_evidence[0] = { ...approx.candidates[0].quantitative_evidence[0], value: 0,
      value_precision: 'approximate', reported_value_text: 'approximately zero' };
    vi.mocked(researchApi.getOpportunities).mockResolvedValue(approx);
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByLabelText('Lý do / đánh giá của PO');
    expect(screen.getByText(/Downloads: 0 downloads/)).toBeTruthy();
    expect(screen.getByText(/Giá trị ước tính.*approximately zero/)).toBeTruthy();
  });
});
