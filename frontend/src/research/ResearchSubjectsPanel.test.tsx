// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { researchApi, type ProjectSavedInformation, type ProjectTrendUpdate, type ResearchBenchmarkCollection, type ResearchSubject, type ResearchSubjectSource } from './api';
import { ResearchSubjectsPanel } from './ResearchSubjectsPanel';

const subject = (id = 'subject-1', name = 'Example Product'): ResearchSubject => ({
  id, project_id: 'project-1', name, subject_type: 'product', aliases: [], external_ids: [], provenance: {},
  created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
});
const source = (overrides: Partial<ResearchSubjectSource> = {}): ResearchSubjectSource => ({
  project_id: 'project-1', source_kind: 'report_entity', source_id: 'report-1', source_key: 'provider:one',
  source_name: 'Example Product', source_type: 'product', context_name: 'Report one', mapped_subject_id: null,
  mapped_subject_name: null, source_state: 'available', ...overrides,
});
const page = <T,>(items: T[]) => ({ items, next_cursor: null, limit: 50 });
const savedInformation = (overrides: Partial<ProjectSavedInformation> = {}): ProjectSavedInformation => ({
  id: 'saved-1', project_id: 'project-1', subject_id: 'subject-1', subject_name: 'Example Product', collection_id: null, collection_name: null,
  original_content: 'Exact source note, preserved with its original wording.', source_context: 'Release announcement', source_title: 'Supplied announcement', source_url: 'https://example.org/announcement', captured_on: null,
  image_filename: null, image_content_type: null, image_size: null, image_sha256: null, image_url: null, source_status: 'source_reported_unverified', created_at: '2026-10-27T12:00:00Z', ...overrides,
});
const collection = (members: (Omit<ResearchBenchmarkCollection['members'][number], 'observations' | 'trend_update_count'> & { observations?: ResearchBenchmarkCollection['members'][number]['observations']; trend_update_count?: number })[] = [], dimensions: ResearchBenchmarkCollection['dimensions'] = []): ResearchBenchmarkCollection => ({
  id: 'collection-1', project_id: 'project-1', name: 'Shortlist', description: null, dimensions, members: members.map((member) => ({ ...member, trend_update_count: member.trend_update_count ?? 0, observations: member.observations ?? [] })),
  created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
});

function emptyCollections() {
  vi.spyOn(researchApi, 'listBenchmarkCollections').mockResolvedValue(page<ResearchBenchmarkCollection>([]));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState({}, '', '/'); });
beforeEach(() => { vi.spyOn(researchApi, 'listTrendUpdates').mockResolvedValue(page<ProjectTrendUpdate>([])); });

describe('ResearchSubjectsPanel', () => {
  it('does not merge same-named source identities automatically and supports explicit link', async () => {
    const rows = [source(), source({ source_id: 'report-2', source_key: 'provider:two', context_name: 'Report two' })];
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject()]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page(rows));
    emptyCollections();
    const map = vi.spyOn(researchApi, 'mapSubjectSource').mockResolvedValue({ ...rows[0], mapped_subject_id: 'subject-1', mapped_subject_name: 'Example Product' });
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getByText('Hồ sơ sản phẩm và chủ đề'));
    await screen.findByText('Tên sản phẩm xuất hiện trong nguồn của dự án');
    expect(map).not.toHaveBeenCalled();
    expect(screen.getAllByText('Example Product').length).toBeGreaterThan(1);
    fireEvent.change(screen.getAllByLabelText(/Liên kết .* với hồ sơ đã lưu/)[0], { target: { value: 'subject-1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Liên kết hồ sơ' })[0]);
    await waitFor(() => expect(map).toHaveBeenCalledWith('project-1', expect.objectContaining({
      source_kind: 'report_entity', source_id: 'report-1', source_key: 'provider:one', subject_id: 'subject-1',
    })));
  });

  it('creates a persistent subject from the exact supplied name and links it only after the PO action', async () => {
    const candidate = source();
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([candidate]));
    emptyCollections();
    const map = vi.spyOn(researchApi, 'mapSubjectSource').mockResolvedValue({ ...candidate, mapped_subject_id: 'new-subject', mapped_subject_name: candidate.source_name });
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getAllByText('Hồ sơ sản phẩm và chủ đề')[0]);
    await screen.findByText('Tên sản phẩm xuất hiện trong nguồn của dự án');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ từ tên này' }));
    await waitFor(() => expect(map).toHaveBeenCalledWith('project-1', expect.objectContaining({
      source_kind: 'report_entity', source_id: 'report-1', source_key: 'provider:one', create_subject_from_source: true,
    })));
  });

  it('keeps historical source links visible but prevents remapping a stale source', async () => {
    const historical = source({ source_state: 'stale', mapped_subject_id: 'subject-1', mapped_subject_name: 'Example Product' });
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject()]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([historical]));
    emptyCollections();
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getAllByText('Hồ sơ sản phẩm và chủ đề')[0]);
    expect(await screen.findByText('Liên kết lịch sử · nguồn hiện không còn tên định danh này')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Đổi liên kết' })).toBeNull();
  });

  it('creates a project collection and adds/removes a subject without deleting its identity', async () => {
    const saved = subject();
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([saved]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([]));
    const collectionReads = vi.spyOn(researchApi, 'listBenchmarkCollections')
      .mockResolvedValueOnce(page<ResearchBenchmarkCollection>([]))
      .mockResolvedValueOnce(page([collection()]))
      .mockResolvedValueOnce(page([collection([{ subject_id: saved.id, name: saved.name, subject_type: 'product', source_count: 3, report_source_count: 1, csv_source_count: 1, trend_update_count: 1, observations: [{
        dimension_key: 'csv:downloads', dimension_name: 'Downloads', source_kind: 'csv_entity', source_name: 'export.csv',
        value: 42, unit: 'downloads', scope: { GEO: 'US', platform: 'Android' }, verification_status: 'unverified',
        evidence_status: null, source_note: null, uncertainty: null, evidence_references: ['https://example.org/source'], source_locations: ['CSV row 2'], validation_reasons: ['Original row has no confirmed period.', 'Metric value was imported without independent verification.'],
      }, {
        dimension_key: 'trend:collection-1:source-reported-updates', dimension_name: 'Trend updates (source-reported)', source_kind: 'trend_update', source_name: 'Owner note',
        value: 'Exact source claim, unchanged.', unit: null, scope: { 'published date': '2026-10-21' }, verification_status: 'unverified',
        evidence_status: 'Source-reported · unverified', source_note: 'Source context supplied by the owner.', uncertainty: 'Not independently verified.',
        evidence_references: ['https://example.org/trend'], source_locations: [], validation_reasons: [],
      }] }], [{ key: 'csv:downloads', name: 'Downloads', source_kind: 'csv_entity' }, { key: 'trend:collection-1:source-reported-updates', name: 'Trend updates (source-reported)', source_kind: 'trend_update' }])]))
      .mockResolvedValue(page([collection()]));
    const create = vi.spyOn(researchApi, 'createBenchmarkCollection').mockResolvedValue(collection());
    const add = vi.spyOn(researchApi, 'addBenchmarkCollectionSubject').mockResolvedValue(collection([{ subject_id: saved.id, name: saved.name, subject_type: 'product', source_count: 2, report_source_count: 1, csv_source_count: 1 }]));
    const remove = vi.spyOn(researchApi, 'removeBenchmarkCollectionSubject').mockResolvedValue();
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getByText('Hồ sơ sản phẩm và chủ đề'));
    await screen.findByText('Bộ so sánh');
    fireEvent.change(screen.getByLabelText('Tên bộ so sánh'), { target: { value: 'Shortlist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bộ so sánh' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('project-1', { name: 'Shortlist' }));
    await screen.findByText(/0 hồ sơ · thuộc dự án/);
    fireEvent.change(screen.getByLabelText('Chọn hồ sơ của dự án để thêm vào Shortlist'), { target: { value: saved.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm hồ sơ' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith('project-1', 'collection-1', saved.id));
    await screen.findByText(/3 nguồn đã liên kết \(1 báo cáo, 1 tệp CSV, 1 cập nhật xu hướng\)/);
    fireEvent.click(screen.getByText(/Xem đối chiếu theo nguồn/));
    expect(screen.getByText('42 downloads')).toBeTruthy();
    expect(screen.getByText('GEO: US')).toBeTruthy();
    expect(screen.getByText('CSV row 2')).toBeTruthy();
    expect(screen.getByText('Exact source claim, unchanged.')).toBeTruthy();
    expect(screen.getByText('Ghi chú nguồn: Source context supplied by the owner.')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Mở nguồn tham khảo' }).map((link) => link.getAttribute('href'))).toEqual(['https://example.org/source', 'https://example.org/trend']);
    const validationDetails = screen.getByText('Lý do cần kiểm tra · 2').closest('details');
    expect(validationDetails?.open).toBe(false);
    fireEvent.click(screen.getByText('Lý do cần kiểm tra · 2'));
    expect(await screen.findByText('Original row has no confirmed period.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi bộ so sánh' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('project-1', 'collection-1', saved.id));
    expect(screen.getAllByText(saved.name).length).toBeGreaterThan(0);
    expect(collectionReads).toHaveBeenCalled();
  });

  it('edits extensible subject analysis, saves it, refreshes and reopens the profile', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1);
    const saved = { ...subject(), aliases: ['Alias A'], external_ids: [{ provider: 'Catalog', value: 'verified-by-owner' }], analysis_sections: [{ key: 'core-loop', label: 'Core Loop', content: 'Existing PO note.' }] };
    const updated = { ...saved, analysis_sections: [
      { key: 'core-loop', label: 'Core Loop', content: 'Updated PO note, still not source verified.' },
      { key: 'accessibility-1', label: 'Accessibility', content: 'Check keyboard navigation.' },
    ] };
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValueOnce(page([saved])).mockResolvedValue(page([updated]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([]));
    emptyCollections();
    const update = vi.spyOn(researchApi, 'updateSubject').mockResolvedValue(updated);
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getByText('Hồ sơ sản phẩm và chủ đề'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mở hồ sơ' }));
    expect(screen.getByText('Alias A')).toBeTruthy();
    expect(screen.getByText('Có trong chi tiết nguồn')).toBeTruthy();
    const poDecisionLink = screen.getByRole('link', { name: 'Xem quyết định PO' });
    expect(poDecisionLink.getAttribute('href')).toContain('decisionKind=subject');
    expect(poDecisionLink.getAttribute('href')).toContain('decisionTargetId=subject-1');
    fireEvent.change(screen.getByDisplayValue('Existing PO note.'), { target: { value: 'Updated PO note, still not source verified.' } });
    fireEvent.change(screen.getByLabelText('Tên phần tự đặt'), { target: { value: 'Accessibility' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm phần' }));
    fireEvent.change(screen.getAllByLabelText('Phân tích của PO')[1], { target: { value: 'Check keyboard navigation.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phân tích PO' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('project-1', saved.id, { analysis_sections: updated.analysis_sections }));
    expect(await screen.findByText('Đã lưu phần phân tích. Đây là ghi chú của bạn, chưa được xác minh độc lập.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng hồ sơ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mở hồ sơ' }));
    expect(screen.getByDisplayValue('Updated PO note, still not source verified.')).toBeTruthy();
    expect(screen.getByDisplayValue('Check keyboard navigation.')).toBeTruthy();
  });

  it('shows exact saved information and provenance in the explicitly linked subject profile', async () => {
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject()]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([]));
    vi.spyOn(researchApi, 'listBenchmarkCollections').mockResolvedValue(page([]));
    vi.spyOn(researchApi, 'listSavedInformation').mockResolvedValue(page([savedInformation()]));
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getByText('Hồ sơ sản phẩm và chủ đề'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mở hồ sơ' }));
    expect(screen.getByText('Exact source note, preserved with its original wording.')).toBeTruthy();
    expect(screen.getByText('Do nguồn cung cấp · chưa xác minh')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở nguồn đã cung cấp' }).getAttribute('href')).toBe('https://example.org/announcement');
  });

  it('shows an explicitly linked trend update in the matching subject profile', async () => {
    const update: ProjectTrendUpdate = {
      id: 'trend-1', project_id: 'project-1', subject_id: 'subject-1', subject_name: 'Example Product',
      collection_id: null, collection_name: null, exact_claim: 'Exact supplied trend, without added interpretation.',
      source_note: 'Captured from the supplied page.', source_title: 'Owner source note', source_url: 'https://example.org/trend',
      published_on: '2026-10-21', source_status: 'source_reported_unverified', created_at: '2026-10-22T00:00:00Z',
    };
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject()]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([]));
    vi.spyOn(researchApi, 'listBenchmarkCollections').mockResolvedValue(page([]));
    const trendRead = vi.spyOn(researchApi, 'listTrendUpdates').mockResolvedValue(page([update]));
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getByText('Hồ sơ sản phẩm và chủ đề'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mở hồ sơ' }));
    expect(await screen.findByText(update.exact_claim)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cập nhật xu hướng' })).toBeTruthy();
    expect(screen.getByText(/1 cập nhật xu hướng/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở nguồn đã cung cấp' }).getAttribute('href')).toBe(update.source_url);
    await waitFor(() => expect(trendRead).toHaveBeenCalledWith('project-1', { subject_id: 'subject-1', limit: 100 }));
  });

  it('opens the requested subject profile from a Project Home deep link', async () => {
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject()]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([]));
    vi.spyOn(researchApi, 'listBenchmarkCollections').mockResolvedValue(page([]));
    vi.spyOn(researchApi, 'listSavedInformation').mockResolvedValue(page([]));
    window.history.replaceState({}, '', '/research?projectId=project-1&view=data&subjectId=subject-1#project-subject-profiles');

    render(<ResearchSubjectsPanel projectId="project-1" />);

    expect(await screen.findByRole('region', { name: 'Hồ sơ Example Product' })).toBeTruthy();
    expect((screen.getByText('Hồ sơ sản phẩm và chủ đề').closest('details') as HTMLDetailsElement).open).toBe(true);
  });

  it('opens and highlights the requested comparison collection from Project Home', async () => {
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([]));
    vi.spyOn(researchApi, 'listBenchmarkCollections').mockResolvedValue(page([collection()]));
    window.history.replaceState({}, '', '/research?projectId=project-1&view=data&collectionId=collection-1#project-benchmark-collections');

    render(<ResearchSubjectsPanel projectId="project-1" />);

    expect(await screen.findByText('Shortlist')).toBeTruthy();
    expect((screen.getByText('Shortlist').closest('.research-benchmark-collection') as HTMLElement).classList.contains('is-requested')).toBe(true);
    expect((screen.getByText('Hồ sơ sản phẩm và chủ đề').closest('details') as HTMLDetailsElement).open).toBe(true);
  });

  it('refreshes an open project’s subject history after information is linked', async () => {
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject()]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([]));
    vi.spyOn(researchApi, 'listBenchmarkCollections').mockResolvedValue(page([]));
    const savedRead = vi.spyOn(researchApi, 'listSavedInformation').mockResolvedValueOnce(page([])).mockResolvedValue(page([savedInformation()]));
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getByText('Hồ sơ sản phẩm và chủ đề'));
    await screen.findByRole('button', { name: 'Mở hồ sơ' });
    window.dispatchEvent(new CustomEvent('project-saved-information-changed', { detail: { projectId: 'project-1' } }));
    await waitFor(() => expect(savedRead).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button', { name: 'Mở hồ sơ' }));
    expect(await screen.findByText('Exact source note, preserved with its original wording.')).toBeTruthy();
  });
});
