// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { researchApi, type Page, type ProjectImageEvidence, type ProjectTrendUpdate, type ResearchSubject } from './api';
import { ImageEvidencePanel } from './ImageEvidencePanel';

const projectId = 'project-1';
const subject: ResearchSubject = { id: 'subject-1', project_id: projectId, name: 'Confirmed Product', subject_type: 'product', aliases: [], external_ids: [], provenance: {}, created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z' };
const update: ProjectTrendUpdate = { id: 'update-1', project_id: projectId, subject_id: subject.id, subject_name: subject.name, collection_id: null, collection_name: null, exact_claim: 'Exact source claim.', source_note: 'Supplied source context.', source_title: 'Source note', source_url: 'https://example.org/source', published_on: '2026-10-21', source_status: 'source_reported_unverified', created_at: '2026-10-27T00:00:00Z' };
const image: ProjectImageEvidence = { id: 'image-1', project_id: projectId, subject_id: subject.id, subject_name: subject.name, trend_update_id: update.id, filename: 'evidence.png', content_type: 'image/png', content_size: 69, content_sha256: 'a'.repeat(64), source_note: update.source_note, source_title: 'Source note', source_url: 'https://example.org/source', published_on: update.published_on, source_status: 'source_reported_unverified', content_url: '/api/v1/projects/project-1/image-evidence/image-1/content', created_at: '2026-10-27T00:00:00Z' };
const page = <T,>(items: T[]): Page<T> => ({ items, next_cursor: null, limit: 30 });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ImageEvidencePanel', () => {
  function mockReads(savedImages: ProjectImageEvidence[] = []) {
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject]));
    vi.spyOn(researchApi, 'listTrendUpdates').mockResolvedValue(page([update]));
    vi.spyOn(researchApi, 'listImageEvidence').mockResolvedValue(page(savedImages));
  }

  it('attaches a selected local image to a saved update and reloads its source context', async () => {
    mockReads();
    const saved = vi.spyOn(researchApi, 'uploadImageEvidence').mockResolvedValue(image);
    vi.spyOn(researchApi, 'listImageEvidence').mockResolvedValueOnce(page([])).mockResolvedValue(page([image]));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    render(<ImageEvidencePanel projectId={projectId} />);

    fireEvent.change(await screen.findByLabelText('Confirmed subject'), { target: { value: subject.id } });
    fireEvent.change(screen.getByLabelText(/Related saved update/), { target: { value: update.id } });
    expect(screen.getByText(update.source_note)).toBeTruthy();
    const file = new File([new Uint8Array([1, 2, 3])], 'evidence.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Image file/), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save image evidence' }).closest('form')!);

    await waitFor(() => expect(saved).toHaveBeenCalledWith(projectId, subject.id, file, { trend_update_id: update.id }));
    expect(await screen.findByText('Image saved with its source context. It remains marked as source-reported and unverified.')).toBeTruthy();
    expect(await screen.findByText('evidence.png · 0 KB')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open original image evidence.png' }).getAttribute('href')).toBe(image.content_url);
    expect(screen.getByText(image.content_sha256)).toBeTruthy();
  });

  it('keeps independent source context visible and blocks unsupported image types', async () => {
    mockReads();
    const saved = vi.spyOn(researchApi, 'uploadImageEvidence').mockResolvedValue(image);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    render(<ImageEvidencePanel projectId={projectId} />);
    fireEvent.change(await screen.findByLabelText('Confirmed subject'), { target: { value: subject.id } });
    const input = screen.getByLabelText(/Image file/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['not an image'], 'unsafe.svg', { type: 'image/svg+xml' })] } });
    expect((await screen.findByRole('alert')).textContent).toContain('Choose a PNG, JPEG, or WebP image.');
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Where did this image come from?')).toBeTruthy();
  });
});
