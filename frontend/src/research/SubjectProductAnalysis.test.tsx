// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportApi, type ImportedReport, type QuantitativeDataset } from '../reports/api';
import { researchApi, type ResearchSubject, type ResearchSubjectSource } from './api';
import type { CodexResearchControls } from './CodexResearchSettings';
import { SubjectProductAnalysis } from './SubjectProductAnalysis';

const subject: ResearchSubject = {
  id: 'subject-1', project_id: 'project-1', name: 'Puzzle A', subject_type: 'game', aliases: ['Puzzle Alpha'],
  external_ids: [], provenance: {}, analysis_sections: [], created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
};
const sources: ResearchSubjectSource[] = [
  { project_id: 'project-1', source_kind: 'report_entity', source_id: 'report-1', source_key: 'report-app-1', source_name: 'Puzzle A', source_type: 'game', context_name: 'Puzzle retention research', mapped_subject_id: 'subject-1', mapped_subject_name: 'Puzzle A', source_state: 'available' },
  { project_id: 'project-1', source_kind: 'csv_entity', source_id: 'dataset-1', source_key: 'sensor:app-1', source_name: 'Puzzle A', source_type: null, context_name: 'weekly.csv', mapped_subject_id: 'subject-1', mapped_subject_name: 'Puzzle A', source_state: 'available' },
];
const settings: CodexResearchControls = {
  preferences: { enabled: true, model_slug: 'codex-mini' }, update: vi.fn(),
  catalog: { available: true, models: [], recommended_model_slug: 'codex-mini', message: null }, loadingModels: false,
};
const report = {
  id: 'report-1', project_id: 'project-1', question: 'Puzzle retention research', geo: 'US', os: 'iOS', research_period: '2026-10',
  content_sha256: 'hash-report', origin: 'chatgpt_user_import', imported_at: '2026-11-01T00:00:00Z', verification_status: 'unverified',
  content: '', parse_status: 'PARSED', research_status: 'STRUCTURED_READY', research_contract_version: 'po_research_v1',
  research_data: {
    executive_summary: null, key_takeaways: [], sections: [],
    entities: [{ key: 'report-app-1', entity_type: 'game', name: 'Puzzle A', attributes: { tutorial: 'short' }, evidence_references: ['[1]'] }],
    findings: [{ key: 'tutorial', finding_type: 'finding', title: 'Tutorial is short', description: 'The report says the first tutorial step is short.', related_entities: ['report-app-1'], evidence_references: ['[1]'], source_locations: ['section 2'], scope: {}, evidence_status: 'source_reported_unverified', confidence: null, uncertainty: 'No independent validation', po_implications: 'Test first-session completion' }],
    evidence_references: [], benchmark_dimensions: [], research_gaps: ['No retention cohort data'], po_recommendations: [], quantitative_observations: [],
  }, extraction_error: null, benchmark_selections: [], benchmark_workspace: { custom_dimensions: [], entries: [] },
} as unknown as ImportedReport;
const dataset = (id = 'sensor:app-1') => ({
  id: 'dataset-1', report_id: null, project_id: 'project-1', filename: 'weekly.csv', content_sha256: 'hash-csv', field_mapping: {}, entity_mappings: {},
  observations: [{ source_entity_id: id, entity_id: id, source_entity_name: 'Puzzle A', entity_name: 'Puzzle A', source_row_number: 8, metric_id: 'downloads', metric_definition: 'Downloads', value: 1200, value_precision: 'exact', reported_value_text: null, unit: 'downloads', geo: 'US', platform: 'iOS', period_start: '2026-10-01', period_end: '2026-10-07', snapshot_date: null, period_semantics: 'reporting_interval', granularity: 'week', methodology: 'provider reported', source_reference: 'row 8', evidence_reference: 'source link', verification_status: 'unverified', provenance_type: 'csv_dataset', provenance_id: 'dataset-1', observation_type: 'imported', validation_reasons: [], source_validation_reasons: [], metadata_validation_reasons: [], report_compatibility: 'unknown', report_compatibility_reasons: [] }],
  compatibility_status: 'partial', validation_reasons: [], created_at: '2026-11-01T00:00:00Z', duplicate: false,
} as unknown as QuantitativeDataset);

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('SubjectProductAnalysis', () => {
  it('sends only explicitly linked report and exact-id CSV evidence, then saves only after PO action', async () => {
    vi.spyOn(reportApi, 'get').mockResolvedValue(report);
    vi.spyOn(reportApi, 'getProjectQuantitativeDataset').mockResolvedValue(dataset());
    const run = vi.spyOn(reportApi, 'runCodexResearch').mockResolvedValue({ content: '1. Điều nguồn ghi nhận\nPuzzle A có 1.200 lượt tải [C1].\n5. Bước tiếp theo cho PO\nKiểm tra kỳ sau.', model_slug: 'codex-mini' });
    const save = vi.spyOn(researchApi, 'updateSubject').mockResolvedValue({ ...subject, analysis_sections: [] });
    const onSaved = vi.fn();
    render(<SubjectProductAnalysis projectId="project-1" subject={subject} sources={sources} codexSettings={settings} hasUnsavedChanges={false} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: 'Phân tích sản phẩm bằng Codex' }));
    await screen.findByText('Kết quả xem trước');
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ model_slug: 'codex-mini', allow_web_search: false }));
    const prompt = run.mock.calls[0][0].prompt;
    expect(prompt).toContain('[R1]');
    expect(prompt).toContain('[C1]');
    expect(prompt).toContain('No retention cohort data');
    expect(prompt).toContain('1200');
    expect(prompt).toContain('Không biến ghi chú nguồn chưa xác minh');
    expect(save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu phân tích vào hồ sơ' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][2].analysis_sections?.[0].content).toContain('dataset-1');
    expect(save.mock.calls[0][2].analysis_sections?.[0].content).toContain('Codex CLI');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('refuses CSV observations whose exact linked entity id no longer matches', async () => {
    vi.spyOn(reportApi, 'get').mockResolvedValue(report);
    vi.spyOn(reportApi, 'getProjectQuantitativeDataset').mockResolvedValue(dataset('different-provider-id'));
    const run = vi.spyOn(reportApi, 'runCodexResearch');
    render(<SubjectProductAnalysis projectId="project-1" subject={subject} sources={sources} codexSettings={settings} hasUnsavedChanges={false} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Phân tích sản phẩm bằng Codex' }));
    expect((await screen.findByRole('alert')).textContent).toContain('không còn số liệu cho đúng mã sản phẩm');
    expect(run).not.toHaveBeenCalled();
  });

  it('preserves unsaved PO notes while analysis is open', () => {
    render(<SubjectProductAnalysis projectId="project-1" subject={subject} sources={sources} codexSettings={settings} hasUnsavedChanges onSaved={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Phân tích sản phẩm bằng Codex' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
