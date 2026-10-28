// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { researchApi, type ProjectSavedInformation, type ResearchSubject } from './api';
import { SavedInformationPanel } from './SavedInformationPanel';

const projectId = 'project-1';
const page = <T,>(items: T[]) => ({ items, next_cursor: null, limit: 50 });
const subject: ResearchSubject = { id: 'subject-1', project_id: projectId, name: 'Puzzle Topic', subject_type: 'game', aliases: [], external_ids: [], provenance: {}, created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z' };
const saved: ProjectSavedInformation = { id: 'info-1', project_id: projectId, subject_id: null, subject_name: null, collection_id: null, collection_name: null, original_content: 'Original pasted update, preserved exactly.', source_context: null, source_title: null, source_url: null, captured_on: null, image_filename: null, image_content_type: null, image_size: null, image_sha256: null, image_url: null, source_status: 'source_reported_unverified', created_at: '2026-10-27T12:00:00Z' };
const savedWithImage: ProjectSavedInformation = { ...saved, image_filename: 'evidence.png', image_content_type: 'image/png', image_size: 9, image_sha256: 'a'.repeat(64), image_url: `/api/v1/projects/${projectId}/saved-information/info-1/image` };

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
    fireEvent.change(await screen.findByLabelText(/Nội dung cần lưu/), { target: { value: original } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({ original_content: original, subject_id: null, collection_id: null, captured_on: null })));
    expect(await screen.findByText(saved.original_content)).toBeTruthy();
    expect(screen.getByText('Theo nguồn cung cấp · chưa xác minh')).toBeTruthy();
  });

  it('allows explicit linking of a previously unassigned saved item', async () => {
    mockReads([saved]);
    const update = vi.spyOn(researchApi, 'updateSavedInformationContext').mockResolvedValue({ ...saved, subject_id: subject.id, subject_name: subject.name });
    render(<SavedInformationPanel projectId={projectId} />);
    fireEvent.change(await screen.findByLabelText(/Gắn thông tin từ .* với sản phẩm hoặc chủ đề/), { target: { value: subject.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu liên kết' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(projectId, saved.id, { subject_id: subject.id, collection_id: null }));
    expect(await screen.findByText('Đã liên kết thông tin với sản phẩm hoặc chủ đề đã chọn.')).toBeTruthy();
  });

  it('saves an image with project information without requiring a product or topic, then reloads it', async () => {
    const savedRead = vi.spyOn(researchApi, 'listSavedInformation').mockResolvedValueOnce(page([])).mockResolvedValue(page([savedWithImage]));
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject]));
    vi.spyOn(researchApi, 'listBenchmarkCollections').mockResolvedValue(page([]));
    const create = vi.spyOn(researchApi, 'createSavedInformation').mockResolvedValue(savedWithImage);
    render(<SavedInformationPanel projectId={projectId} />);

    fireEvent.change(await screen.findByLabelText(/Nội dung cần lưu/), { target: { value: 'Quan sát kèm ảnh chụp màn hình.' } });
    const image = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], 'evidence.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Tệp ảnh/), { target: { files: [image] } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({
      original_content: 'Quan sát kèm ảnh chụp màn hình.',
      subject_id: null,
      image_filename: 'evidence.png',
      image_content_type: 'image/png',
      image_base64: 'iVBORw0KGgoA',
    })));
    expect(await screen.findByRole('status')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() => expect(savedRead).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('img', { name: 'Ảnh đính kèm' })).toBeTruthy();
    expect(screen.getByText('evidence.png · Tệp lưu cục bộ · Chưa xác minh')).toBeTruthy();
  });

  it('keeps the pasted draft and reports failure without clearing content', async () => {
    mockReads();
    vi.spyOn(researchApi, 'createSavedInformation').mockRejectedValue(new Error('Local API unavailable'));
    render(<SavedInformationPanel projectId={projectId} />);
    const field = await screen.findByLabelText(/Nội dung cần lưu/) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Keep this exact draft after an error.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(field.value).toBe('Keep this exact draft after an error.');
  });

  it('does not create the optional product/topic twice when saving the note fails and is retried', async () => {
    mockReads();
    const createProduct = vi.spyOn(researchApi, 'createSubject').mockResolvedValue(subject);
    const createInformation = vi.spyOn(researchApi, 'createSavedInformation').mockRejectedValueOnce(new Error('Temporary save issue.')).mockResolvedValue({ ...saved, subject_id: subject.id, subject_name: subject.name });
    render(<SavedInformationPanel projectId={projectId} />);
    fireEvent.change(await screen.findByLabelText(/Nội dung cần lưu/), { target: { value: 'Keep the exact note.' } });
    fireEvent.click(screen.getByLabelText('Tạo hồ sơ sản phẩm hoặc chủ đề cho nội dung này'));
    fireEvent.change(screen.getByLabelText('Tên sản phẩm hoặc chủ đề'), { target: { value: subject.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(createProduct).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    await waitFor(() => expect(createInformation).toHaveBeenCalledTimes(2));
    expect(createInformation.mock.calls[1][1]).toEqual(expect.objectContaining({ subject_id: subject.id }));
    expect(createProduct).toHaveBeenCalledTimes(1);
  });
});
