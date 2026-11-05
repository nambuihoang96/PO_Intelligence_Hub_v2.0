// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportApi, type ImportedReport, type QuantitativeDatasetPage } from './api';
import { ReportViewer } from './ReportResults';
import { researchApi, type OpportunityCandidate, type OpportunityWorkspace } from '../research/api';

const report = {
  id: 'report-1', project_id: 'project-1', question: 'Product research', geo: 'US', os: 'iOS', research_period: '2026',
  content_sha256: 'report-hash', origin: 'chatgpt_user_import', imported_at: '2026-11-01T00:00:00Z', verification_status: 'unverified',
  parse_status: 'PARSED', research_status: 'STRUCTURED_READY', research_contract_version: 'po_research_v1', content: '# Research', extraction_error: null,
  benchmark_selections: [], benchmark_workspace: { custom_dimensions: [], entries: [] }, comparison_reviews: [],
  research_data: {
    executive_summary: 'Summary', key_takeaways: [], sections: [],
    entities: [
      { key: 'game-one', entity_type: 'game', name: 'First Product', attributes: { description: 'First description' }, evidence_references: [] },
      { key: 'game-two', entity_type: 'game', name: 'Exact Product', attributes: { description: 'Exact requested entity detail' }, evidence_references: [] },
    ],
    findings: [], evidence_references: [], benchmark_dimensions: [], research_gaps: [], po_recommendations: [], quantitative_observations: [],
  },
} as unknown as ImportedReport;

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState({}, '', '/'); });

describe('ReportViewer deep links', () => {
  it('opens the exact linked entity from a subject profile source link', async () => {
    window.history.replaceState({}, '', '/reports/report-1?section=entities&entity=game-two');
    vi.spyOn(reportApi, 'get').mockResolvedValue(report);
    vi.spyOn(reportApi, 'listQuantitativeDatasets').mockResolvedValue({ items: [], next_cursor: null, limit: 20 } as QuantitativeDatasetPage);
    render(<ReportViewer reportId="report-1" />);

    const reportTabs = await screen.findAllByRole('tab');
    expect(reportTabs.map((tab) => tab.textContent?.trim())).toEqual(['Tóm tắt', 'Phát hiện', 'Đối tượng', 'So sánh', 'Nguồn', 'Bản gốc']);
    const exactEntityButtons = await screen.findAllByRole('button', { name: /Exact Product/ });
    const exactEntity = exactEntityButtons.find((button) => button.hasAttribute('aria-pressed'));
    await waitFor(() => expect(exactEntity?.getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByText('Exact requested entity detail')).toBeTruthy();
    expect(screen.getByRole('button', { name: /First Product/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('saves a finding to Tracking in the report and keeps the exact finding open', async () => {
    const finding = {
      key: 'finding-1', finding_type: 'research_finding', title: 'Players misunderstand the reward',
      description: 'The supplied report says some players do not understand the first reward.',
      related_entities: [], evidence_references: [], source_locations: [], scope: {}, evidence_status: 'reported',
      confidence: null, uncertainty: 'The report does not describe the sample size.', po_implications: null,
    };
    const reportWithFinding = { ...report, content: '# Research\n\nA supplied excerpt.', research_data: { ...report.research_data, findings: [finding] } } as ImportedReport;
    const candidate: OpportunityCandidate = {
      candidate_id: 'candidate-finding-1', name: finding.title, source_entity_id: null, target_kind: 'report_finding',
      decision_target: { kind: 'report_finding', target_id: 'report-1:finding-1', report_id: 'report-1', report_content_sha256: 'report-hash', item_key: 'finding-1' },
      dataset_id: null, dataset_content_sha256: null, dataset_filename: 'Product research', selection_reason: 'PO decision for this research project',
      stale: false, stale_reasons: [], evidence_gaps: [], quantitative_evidence: [], decision: null,
      resolved_decision_evidence: [], unresolved_decision_evidence: [],
    };
    const workspace: OpportunityWorkspace = { project_id: 'project-1', shortlist_dataset_id: null, shortlist_valid: true, shortlist_warning: null, candidates: [candidate], reports: [] };
    const savedWorkspace: OpportunityWorkspace = { ...workspace, candidates: [{ ...candidate, decision: {
      candidate_id: candidate.candidate_id, revision: 1, expected_revision: 1, dataset_id: null, dataset_content_sha256: null,
      source_entity_id: null, decision_target: candidate.decision_target!, decision_status: null, rationale: '',
      supporting_evidence: [], contradictory_evidence: [], open_questions: [], assessments: [], priority: 'not_assessed',
      review_date: '2026-11-10', next_action: 'Check player interviews', manual_updates: [],
    } }] };
    window.history.replaceState({}, '', '/reports/report-1?section=insights&finding=finding-1');
    vi.spyOn(reportApi, 'get').mockResolvedValue(reportWithFinding);
    vi.spyOn(reportApi, 'listQuantitativeDatasets').mockResolvedValue({ items: [], next_cursor: null, limit: 20 } as QuantitativeDatasetPage);
    vi.spyOn(researchApi, 'getOpportunities').mockResolvedValue(workspace);
    const saveDecision = vi.spyOn(researchApi, 'saveOpportunityDecision').mockResolvedValue(savedWorkspace);

    render(<ReportViewer reportId="report-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu phát hiện này vào Theo dõi' }));
    fireEvent.change(screen.getByLabelText(/Việc muốn làm tiếp/), { target: { value: 'Check player interviews' } });
    fireEvent.change(screen.getByLabelText(/Ngày xem lại/), { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu vào Theo dõi' }));

    await waitFor(() => expect(saveDecision).toHaveBeenCalledWith('project-1', expect.objectContaining({
      candidate_id: candidate.candidate_id, decision_target: candidate.decision_target,
      decision_status: null, review_date: '2026-11-10', next_action: 'Check player interviews',
    })));
    expect(await screen.findByText(/vẫn đang ở đúng phát hiện trong báo cáo/)).toBeTruthy();
    expect(screen.getAllByText(finding.title).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Đã theo dõi · chỉnh sửa' })).toBeTruthy();
    expect(window.location.pathname).toBe('/reports/report-1');
  });
});
