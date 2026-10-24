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

describe('OpportunityReview', () => {
  beforeEach(() => {
    vi.mocked(researchApi.getOpportunities).mockResolvedValue(structuredClone(workspace));
    vi.mocked(researchApi.saveOpportunityDecision).mockImplementation(async (_projectId, payload) => ({
      ...structuredClone(workspace), candidates: [{ ...structuredClone(workspace.candidates[0]), decision: payload,
        resolved_decision_evidence: payload.supporting_evidence, unresolved_decision_evidence: [] }],
    }));
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows source measurements as unverified and does not auto-attach similarly named report findings', async () => {
    render(<OpportunityReview projectId="workspace-1" />);
    expect(await screen.findByText('Product Alpha')).toBeTruthy();
    expect(await screen.findByLabelText('Attach Downloads source row 2')).toBeTruthy();
    expect(screen.getByText(/row 2.*unverified/)).toBeTruthy();
    expect(screen.queryByText('Users value simplicity')).toBeNull();
    fireEvent.change(screen.getByLabelText('Research report'), { target: { value: 'report-1' } });
    expect(await screen.findByText('Users value simplicity')).toBeTruthy();
    expect(screen.getByText(/Reports are not matched by product name/i)).toBeTruthy();
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
    expect(await screen.findByLabelText('Attach Downloads source row 2')).toHaveProperty('checked', true);
    expect(screen.getByText(/Selected evidence \(1 supporting · 0 contradictory\)/)).toBeTruthy();
  });

  it('saves explicit PO judgment, priority, follow-up and attached evidence', async () => {
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByText('Product Alpha');
    fireEvent.click(screen.getByLabelText('Attach Downloads source row 2'));
    fireEvent.change(screen.getByLabelText('PO decision'), { target: { value: 'investigate' } });
    fireEvent.change(screen.getByLabelText('Set PO priority'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('PO rationale'), { target: { value: 'Validate retention before prioritizing.' } });
    fireEvent.change(screen.getByLabelText('Next action'), { target: { value: 'Request a retention study.' } });
    fireEvent.change(screen.getByLabelText('Open questions'), { target: { value: 'What is D7 retention?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save PO decision' }));
    await waitFor(() => expect(researchApi.saveOpportunityDecision).toHaveBeenCalledTimes(1));
    const submitted = vi.mocked(researchApi.saveOpportunityDecision).mock.calls[0][1];
    expect(submitted.decision_status).toBe('investigate');
    expect(submitted.priority).toBe('high');
    expect(submitted.rationale).toContain('Validate retention');
    expect(submitted.next_action).toContain('retention study');
    expect(submitted.open_questions).toEqual(['What is D7 retention?']);
    expect(submitted.supporting_evidence).toEqual([{ kind: 'quantitative', dataset_id: 'dataset-1',
      source_entity_id: 'provider:alpha', source_row_number: 2, metric_id: 'downloads_absolute' }]);
    expect(await screen.findByText('Decision saved.')).toBeTruthy();
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
    expect((await screen.findByLabelText('PO rationale') as HTMLTextAreaElement).value).toBe('Historical note');
    expect(screen.getByText(/Dataset hash mismatch/)).toBeTruthy();
    expect(screen.queryByText(/Downloads: 1200 downloads/)).toBeNull();
  });

  it('keeps draft text after a failed save and allows an explicit retry', async () => {
    vi.mocked(researchApi.saveOpportunityDecision).mockRejectedValueOnce(new Error('Network unavailable'));
    render(<OpportunityReview projectId="workspace-1" />);
    await screen.findByText('Product Alpha');
    fireEvent.change(screen.getByLabelText('PO rationale'), { target: { value: 'Keep this draft after the failure.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save PO decision' }));
    expect(await screen.findByText('Save failed')).toBeTruthy();
    expect((screen.getByLabelText('PO rationale') as HTMLTextAreaElement).value).toBe('Keep this draft after the failure.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(researchApi.saveOpportunityDecision).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Decision saved.')).toBeTruthy();
  });
});
