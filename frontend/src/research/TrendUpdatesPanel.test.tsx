// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { researchApi, type ProjectTrendUpdate, type ResearchBenchmarkCollection, type ResearchSubject } from './api';
import { TrendUpdatesPanel } from './TrendUpdatesPanel';

const projectId = 'project-1';
const subject: ResearchSubject = { id: 'subject-1', project_id: projectId, name: 'Confirmed Product', subject_type: 'product', aliases: [], external_ids: [], provenance: {}, created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z' };
const collection: ResearchBenchmarkCollection = { id: 'collection-1', project_id: projectId, name: 'Puzzle October', description: null, members: [{ subject_id: subject.id, name: subject.name, subject_type: 'product', source_count: 0, report_source_count: 0, csv_source_count: 0, trend_update_count: 0, observations: [] }], dimensions: [], created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z' };
const page = <T,>(items: T[]) => ({ items, next_cursor: null, limit: 25 });
const saved: ProjectTrendUpdate = { id: 'update-1', project_id: projectId, subject_id: subject.id, subject_name: subject.name, collection_id: collection.id, collection_name: collection.name, exact_claim: 'Exact claim copied from the source.', source_note: 'PO supplied this source context.', source_title: 'Source report', source_url: 'https://example.org/source', published_on: '2026-10-21', source_status: 'source_reported_unverified', created_at: '2026-10-27T00:00:00Z' };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TrendUpdatesPanel', () => {
  function mockReads(updatePage: ProjectTrendUpdate[] = []) {
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject]));
    vi.spyOn(researchApi, 'listBenchmarkCollections').mockResolvedValue(page([collection]));
    vi.spyOn(researchApi, 'listTrendUpdates').mockResolvedValue(page(updatePage));
  }

  it('saves exact attributed text to an explicitly selected subject and collection, then reopens it', async () => {
    mockReads();
    const create = vi.spyOn(researchApi, 'createTrendUpdate').mockResolvedValue(saved);
    vi.spyOn(researchApi, 'listTrendUpdates').mockResolvedValueOnce(page([])).mockResolvedValue(page([saved]));
    render(<TrendUpdatesPanel projectId={projectId} />);
    fireEvent.click(await screen.findByText('Use a saved product or topic'));
    fireEvent.change(screen.getByLabelText('Product or topic'), { target: { value: subject.id } });
    fireEvent.change(screen.getByLabelText(/Benchmark collection/), { target: { value: collection.id } });
    fireEvent.change(screen.getByLabelText('Source publication date'), { target: { value: '2026-10-21' } });
    fireEvent.click(screen.getByText('More source details'));
    fireEvent.change(screen.getByLabelText(/Source title/), { target: { value: 'Source report' } });
    fireEvent.change(screen.getByLabelText(/Source link/), { target: { value: 'https://example.org/source' } });
    fireEvent.change(screen.getByLabelText('What did you observe?'), { target: { value: saved.exact_claim } });
    fireEvent.change(screen.getByLabelText('Where did you see it?'), { target: { value: saved.source_note } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trend update' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, {
      subject_id: subject.id, collection_id: collection.id, exact_claim: saved.exact_claim, source_note: saved.source_note,
      source_title: saved.source_title, source_url: saved.source_url, published_on: saved.published_on,
    }));
    expect(await screen.findByText(saved.exact_claim)).toBeTruthy();
    expect(screen.getByText('Source-reported · unverified')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open supplied source link' }).getAttribute('href')).toBe(saved.source_url);
    const decisionLink = screen.getByRole('link', { name: 'Review PO decision' });
    expect(decisionLink.getAttribute('href')).toContain('decisionKind=trend_update');
    expect(decisionLink.getAttribute('href')).toContain('decisionTargetId=update-1');
  });

  it('keeps the draft and displays a clear error when saving fails', async () => {
    mockReads();
    vi.spyOn(researchApi, 'createTrendUpdate').mockRejectedValue(new Error('Could not save update.'));
    render(<TrendUpdatesPanel projectId={projectId} />);
    fireEvent.click(await screen.findByText('Use a saved product or topic'));
    fireEvent.change(screen.getByLabelText('Product or topic'), { target: { value: subject.id } });
    fireEvent.change(screen.getByLabelText('Source publication date'), { target: { value: '2026-10-21' } });
    fireEvent.change(screen.getByLabelText('What did you observe?'), { target: { value: 'Keep this exact draft.' } });
    fireEvent.change(screen.getByLabelText('Where did you see it?'), { target: { value: 'Keep this attribution.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trend update' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not save update.');
    expect((screen.getByLabelText('What did you observe?') as HTMLTextAreaElement).value).toBe('Keep this exact draft.');
    expect((screen.getByLabelText('Where did you see it?') as HTMLTextAreaElement).value).toBe('Keep this attribution.');
  });

  it('does not submit duplicate trend updates on rapid repeated clicks', async () => {
    mockReads();
    const create = vi.spyOn(researchApi, 'createTrendUpdate').mockResolvedValue(saved);
    vi.spyOn(researchApi, 'listTrendUpdates').mockResolvedValueOnce(page([])).mockResolvedValue(page([saved]));
    render(<TrendUpdatesPanel projectId={projectId} />);
    fireEvent.click(await screen.findByText('Use a saved product or topic'));
    fireEvent.change(screen.getByLabelText('Product or topic'), { target: { value: subject.id } });
    fireEvent.change(screen.getByLabelText('Source publication date'), { target: { value: saved.published_on } });
    fireEvent.change(screen.getByLabelText('What did you observe?'), { target: { value: saved.exact_claim } });
    fireEvent.change(screen.getByLabelText('Where did you see it?'), { target: { value: saved.source_note } });
    const save = screen.getByRole('button', { name: 'Save trend update' });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it('creates a new subject within the same Trend Update flow before saving the update', async () => {
    mockReads();
    const createdSubject: ResearchSubject = { ...subject, id: 'subject-new', name: 'New Research Topic' };
    const updateForNewSubject: ProjectTrendUpdate = { ...saved, id: 'update-new', subject_id: createdSubject.id, subject_name: createdSubject.name };
    const createSubject = vi.spyOn(researchApi, 'createSubject').mockResolvedValue(createdSubject);
    const createUpdate = vi.spyOn(researchApi, 'createTrendUpdate').mockResolvedValue(updateForNewSubject);
    vi.spyOn(researchApi, 'listTrendUpdates').mockResolvedValueOnce(page([])).mockResolvedValue(page([updateForNewSubject]));
    render(<TrendUpdatesPanel projectId={projectId} />);
    fireEvent.change(await screen.findByLabelText('Product or topic name'), { target: { value: createdSubject.name } });
    fireEvent.change(screen.getByLabelText('Source publication date'), { target: { value: saved.published_on } });
    fireEvent.change(screen.getByLabelText('What did you observe?'), { target: { value: saved.exact_claim } });
    fireEvent.change(screen.getByLabelText('Where did you see it?'), { target: { value: saved.source_note } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trend update' }));
    await waitFor(() => expect(createSubject).toHaveBeenCalledWith(projectId, {
      name: createdSubject.name, subject_type: null, aliases: [], external_ids: [], provenance: { created_via: 'trend_update' },
    }));
    await waitFor(() => expect(createUpdate).toHaveBeenCalledWith(projectId, expect.objectContaining({ subject_id: createdSubject.id })));
    expect(await screen.findByText(saved.exact_claim)).toBeTruthy();
    expect(screen.getByText('Source-reported · unverified')).toBeTruthy();
  });

  it('does not create a duplicate subject when an update save fails and is retried', async () => {
    mockReads();
    const createdSubject: ResearchSubject = { ...subject, id: 'subject-new', name: 'Retry Topic' };
    const updateForNewSubject: ProjectTrendUpdate = { ...saved, id: 'update-retry', subject_id: createdSubject.id, subject_name: createdSubject.name };
    const createSubject = vi.spyOn(researchApi, 'createSubject').mockResolvedValue(createdSubject);
    const createUpdate = vi.spyOn(researchApi, 'createTrendUpdate').mockRejectedValueOnce(new Error('Temporary network issue.')).mockResolvedValue(updateForNewSubject);
    vi.spyOn(researchApi, 'listTrendUpdates').mockResolvedValueOnce(page([])).mockResolvedValue(page([updateForNewSubject]));
    render(<TrendUpdatesPanel projectId={projectId} />);
    fireEvent.change(await screen.findByLabelText('Product or topic name'), { target: { value: createdSubject.name } });
    fireEvent.change(screen.getByLabelText('Source publication date'), { target: { value: saved.published_on } });
    fireEvent.change(screen.getByLabelText('What did you observe?'), { target: { value: saved.exact_claim } });
    fireEvent.change(screen.getByLabelText('Where did you see it?'), { target: { value: saved.source_note } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trend update' }));
    expect((await screen.findByRole('alert')).textContent).toContain('“Retry Topic” is saved as a subject. Temporary network issue.');
    fireEvent.click(screen.getByRole('button', { name: 'Save trend update' }));
    await waitFor(() => expect(createUpdate).toHaveBeenCalledTimes(2));
    expect(createSubject).toHaveBeenCalledTimes(1);
    expect(createUpdate.mock.calls[1][1].subject_id).toBe(createdSubject.id);
  });
});
