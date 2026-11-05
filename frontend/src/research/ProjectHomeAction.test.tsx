// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectHome } from './ProjectHome';
import { researchApi } from './api';
import { reportApi } from '../reports/api';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, researchApi: {
    ...original.researchApi,
    getProject: vi.fn(), listBenchmarkCollections: vi.fn(), listSubjects: vi.fn(),
    listTrendUpdates: vi.fn(), listSavedInformation: vi.fn(), getOpportunities: vi.fn(), saveOpportunityDecision: vi.fn(),
  } };
});

vi.mock('../reports/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../reports/api')>();
  return { ...original, reportApi: { ...original.reportApi, listProjectReports: vi.fn(), listComparisonDatasets: vi.fn(), get: vi.fn() } };
});

const target = { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-codex', report_content_sha256: 'hash', item_key: 'finding-1' };
const candidate = {
  candidate_id: 'context:abc', name: 'Tăng lượt tải ở game đầu bảng', source_entity_id: null, decision_target: target, dataset_id: null,
  dataset_content_sha256: null, dataset_filename: 'Báo cáo', selection_reason: 'Explicit research target', stale: false, stale_reasons: [],
  evidence_gaps: [], quantitative_evidence: [], decision: null, resolved_decision_evidence: [], unresolved_decision_evidence: [],
};

describe('ProjectHome saves a report next action as a PO decision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(researchApi.getProject).mockResolvedValue({ id: 'project-a', name: 'Dự án A', created_at: '2026-11-05', updated_at: '2026-11-05', owner: null, category: null, topic: 'Game puzzle', workspace_state_json: null } as never);
    vi.mocked(researchApi.listBenchmarkCollections).mockResolvedValue({ items: [], next_cursor: null, limit: 100 } as never);
    vi.mocked(researchApi.listSubjects).mockResolvedValue({ items: [], next_cursor: null, limit: 100 } as never);
    vi.mocked(researchApi.listTrendUpdates).mockResolvedValue({ items: [], next_cursor: null, limit: 10 } as never);
    vi.mocked(researchApi.listSavedInformation).mockResolvedValue({ items: [], next_cursor: null, limit: 10 } as never);
    vi.mocked(researchApi.getOpportunities).mockResolvedValue({ candidates: [candidate] } as never);
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [], next_cursor: null, limit: 100 } as never);
    vi.mocked(reportApi.listProjectReports).mockResolvedValue({ items: [{
      id: 'report-codex', project_id: 'project-a', question: 'Chủ đề puzzle', geo: 'Global / not specified', os: 'Unknown',
      research_period: null, content_sha256: 'hash', origin: 'codex_cli_research', imported_at: '2026-11-05T10:00:00Z',
      verification_status: 'unverified', finding_count: 1, entity_count: 0,
    }], next_cursor: null, limit: 100 } as never);
    vi.mocked(reportApi.get).mockResolvedValue({
      id: 'report-codex', content_sha256: 'hash', research_data: {
        executive_summary: 'Tóm tắt',
        findings: [{ key: 'finding-1', finding_type: 'x', title: 'Tăng lượt tải ở game đầu bảng', description: 'd', related_entities: [], evidence_references: ['https://example.com/source'], source_locations: [], scope: {}, evidence_status: 'unverified', confidence: null, uncertainty: null, po_implications: 'Chỉ số: downloads_absolute 13.837.982 (CSV dòng 2). Tác động: ưu tiên kiểm tra mechanic đầu tiên.' }],
      },
    } as never);
  });

  afterEach(() => cleanup());

  it('lists the PO implication with a save button and saves it through the existing decision endpoint', async () => {
    vi.mocked(researchApi.saveOpportunityDecision).mockResolvedValue({
      candidates: [{ ...candidate, decision: { candidate_id: candidate.candidate_id, decision_target: target, decision_status: 'investigate', next_action: 'x', revision: 1 } }],
    } as never);
    render(<ProjectHome projectId="project-a" />);
    expect(await screen.findByRole('heading', { name: 'Hành động gợi ý từ báo cáo · nhận định AI, chưa xác minh' })).toBeTruthy();
    expect(screen.getByText(/downloads_absolute 13.837.982/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thành Quyết định PO' }));
    await waitFor(() => expect(researchApi.saveOpportunityDecision).toHaveBeenCalledTimes(1));
    const [projectId, payload] = vi.mocked(researchApi.saveOpportunityDecision).mock.calls[0];
    expect(projectId).toBe('project-a');
    expect(payload).toMatchObject({ candidate_id: 'context:abc', decision_target: target, decision_status: 'investigate', next_action: expect.stringContaining('downloads_absolute') });
    expect(await screen.findByText('Đã lưu “Tăng lượt tải ở game đầu bảng” thành Quyết định PO.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đã là Quyết định PO' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows no save button when the report has no PO implication to save', async () => {
    vi.mocked(reportApi.get).mockResolvedValue({ id: 'report-codex', content_sha256: 'hash', research_data: { executive_summary: 'Tóm tắt', findings: [] } } as never);
    render(<ProjectHome projectId="project-a" />);
    await screen.findByRole('heading', { name: 'Kết quả mới nhất' });
    expect(screen.queryByRole('button', { name: 'Lưu thành Quyết định PO' })).toBeNull();
    expect(researchApi.saveOpportunityDecision).not.toHaveBeenCalled();
  });

  it('marks an action without evidence and does not allow saving it as a decision', async () => {
    vi.mocked(reportApi.get).mockResolvedValue({ id: 'report-codex', content_sha256: 'hash', research_data: { executive_summary: 'Tóm tắt', findings: [
      { key: 'finding-1', finding_type: 'x', title: 'So downloads theo sub-genre', description: 'd', related_entities: [], evidence_references: [], source_locations: [], scope: {}, evidence_status: 'unverified', confidence: null, uncertainty: null, po_implications: 'Chuẩn hóa taxonomy sub-genre rồi so downloads.' },
    ] } } as never);
    render(<ProjectHome projectId="project-a" />);
    expect(await screen.findByText('Chưa có bằng chứng · không lưu được thành quyết định')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lưu thành Quyết định PO' })).toBeNull();
    expect(researchApi.saveOpportunityDecision).not.toHaveBeenCalled();
  });

  it('labels an action whose source link is recorded as broken', async () => {
    vi.mocked(reportApi.get).mockResolvedValue({ id: 'report-codex', content_sha256: 'hash', research_data: { executive_summary: 'Tóm tắt', findings: [
      { key: 'finding-1', finding_type: 'x', title: 'Nguồn Color Block', description: 'd', related_entities: [], evidence_references: ['https://play.google.com/store/apps/details?id=com.puzzlegames.puzzlebrickslegend'], source_locations: [], scope: {}, evidence_status: 'unverified', confidence: null, uncertainty: null, po_implications: 'Gợi ý có nguồn hỏng.' },
    ] } } as never);
    render(<ProjectHome projectId="project-a" />);
    expect(await screen.findByText('Có nguồn Link hỏng (1) · xem báo cáo trước khi dùng')).toBeTruthy();
  });

  it('shows which assistant wrote the latest pasted answer on Project Home', async () => {
    vi.mocked(reportApi.listProjectReports).mockResolvedValue({ items: [{
      id: 'report-claude', project_id: 'project-a', question: 'Chủ đề puzzle', geo: 'Global / not specified', os: 'Unknown',
      research_period: null, content_sha256: 'hash', origin: 'chatgpt_user_import', source_assistant: 'claude', imported_at: '2026-11-05T10:00:00Z',
      verification_status: 'unverified', finding_count: 0, entity_count: 0,
    }], next_cursor: null, limit: 100 } as never);
    vi.mocked(reportApi.get).mockResolvedValue({ id: 'report-claude', content_sha256: 'hash', research_data: { executive_summary: 'Tóm tắt', findings: [] } } as never);
    render(<ProjectHome projectId="project-a" />);
    expect(await screen.findByText('Nhập từ Claude')).toBeTruthy();
  });
});
