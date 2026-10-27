// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { researchApi, type ProjectSavedInformation, type ResearchSubject } from './api';
import { SavedInformationPanel } from './SavedInformationPanel';

const projectId = 'project-1';
const page = <T,>(items: T[]) => ({ items, next_cursor: null, limit: 50 });
const subject: ResearchSubject = { id: 'subject-1', project_id: projectId, name: 'Puzzle Topic', subject_type: 'game', aliases: [], external_ids: [], provenance: {}, created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z' };
const saved: ProjectSavedInformation = { id: 'info-1', project_id: projectId, subject_id: null, subject_name: null, collection_id: null, collection_name: null, original_content: 'Original pasted update, preserved exactly.', source_context: null, source_title: null, source_url: null, captured_on: null, image_filename: null, image_content_type: null, image_size: null, image_sha256: null, image_url: null, source_status: 'source_reported_unverified', created_at: '2026-10-27T12:00:00Z' };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mockReads(items: ProjectSavedInformation[] = []) {
  vi.spyOn(researchApi, 'listSavedInformation').mockResolvedValue(page(items));
  vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject]));
  vi.spyOn(researchApi, 'listBenchmarkCollections').mockResolvedValue(page([]));
}

describe('SavedInformationPanel', () => {
  it('saves a full original text without requiring a subject, date, or source metadata', async () => {
    mockReads();
    const create = vi.spyOn(researchApi, 'createSavedInformation').mockResolvedValue(saved);
    render(<SavedInformationPanel projectId={projectId} />);
    const original = '  A complete update as received.\nSecond paragraph remains intact.  ';
    fireEvent.change(await screen.findByLabelText(/Paste content/), { target: { value: original } });
    fireEvent.click(screen.getByRole('button', { name: 'Save information' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({ original_content: original, subject_id: null, collection_id: null, captured_on: null })));
    expect(await screen.findByText(saved.original_content)).toBeTruthy();
    expect(screen.getByText('Source-reported · unverified')).toBeTruthy();
  });

  it('allows explicit linking of a previously unassigned saved item', async () => {
    mockReads([saved]);
    const update = vi.spyOn(researchApi, 'updateSavedInformationContext').mockResolvedValue({ ...saved, subject_id: subject.id, subject_name: subject.name });
    render(<SavedInformationPanel projectId={projectId} />);
    fireEvent.change(await screen.findByLabelText(/Link saved information/), { target: { value: subject.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(projectId, saved.id, { subject_id: subject.id, collection_id: null }));
    expect(await screen.findByText('The saved information is now linked to the selected product or topic.')).toBeTruthy();
  });

  it('keeps the pasted draft and reports failure without clearing content', async () => {
    mockReads();
    vi.spyOn(researchApi, 'createSavedInformation').mockRejectedValue(new Error('Local API unavailable'));
    render(<SavedInformationPanel projectId={projectId} />);
    const field = await screen.findByLabelText(/Paste content/) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Keep this exact draft after an error.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save information' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(field.value).toBe('Keep this exact draft after an error.');
  });

  it('does not create the optional product/topic twice when saving the note fails and is retried', async () => {
    mockReads();
    const createProduct = vi.spyOn(researchApi, 'createSubject').mockResolvedValue(subject);
    const createInformation = vi.spyOn(researchApi, 'createSavedInformation').mockRejectedValueOnce(new Error('Temporary save issue.')).mockResolvedValue({ ...saved, subject_id: subject.id, subject_name: subject.name });
    render(<SavedInformationPanel projectId={projectId} />);
    fireEvent.change(await screen.findByLabelText(/Paste content/), { target: { value: 'Keep the exact note.' } });
    fireEvent.click(screen.getByLabelText('Create a product or topic profile for this item'));
    fireEvent.change(screen.getByLabelText('Product or topic name'), { target: { value: subject.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Save information' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(createProduct).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save information' }));
    await waitFor(() => expect(createInformation).toHaveBeenCalledTimes(2));
    expect(createInformation.mock.calls[1][1]).toEqual(expect.objectContaining({ subject_id: subject.id }));
    expect(createProduct).toHaveBeenCalledTimes(1);
  });
});
