// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Top5GuidedPanel } from './DataFirstWorkspace';
import { reportApi } from '../reports/api';

vi.mock('../reports/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../reports/api')>();
  return { ...original, reportApi: { ...original.reportApi, import: vi.fn(), updateCsvSelection: vi.fn() } };
});

const props = {
  projectId: 'project-a', prompt: 'PROMPT TEXT', question: 'Nghiên cứu top 5', measurement: null,
  dataset: { id: 'ds-1', filename: 'sample.csv' }, lens: 'downloads' as const, lensLabel: 'Lượt tải',
  rows: [{ sourceRow: 1, name: 'Meowdoku' }, { sourceRow: 2, name: 'Alpha' }],
};

describe('Top5GuidedPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportApi.import).mockResolvedValue({ id: 'report-new', duplicate: false } as never);
    vi.mocked(reportApi.updateCsvSelection).mockResolvedValue({ id: 'report-new' } as never);
  });
  afterEach(() => cleanup());

  it('shows the three steps in plain Vietnamese with links that open in a new tab', () => {
    render(<Top5GuidedPanel {...props} />);
    expect(screen.getByText('1 · Sao chép yêu cầu')).toBeTruthy();
    expect(screen.getByText('2 · Mở trợ lý và gửi yêu cầu')).toBeTruthy();
    expect(screen.getByText('3 · Dán câu trả lời và lưu')).toBeTruthy();
    const chatgpt = screen.getByRole('link', { name: /Mở ChatGPT/ });
    expect(chatgpt.getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('link', { name: /Mở Claude/ }).getAttribute('href')).toBe('https://claude.ai/new');
  });

  it('blocks save only while the box is empty', () => {
    render(<Top5GuidedPanel {...props} />);
    expect((screen.getByRole('button', { name: 'Lưu và mở báo cáo' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Dán câu trả lời của trợ lý'), { target: { value: 'Câu trả lời tự do không có JSON.' } });
    expect(screen.getByText(/Chưa thấy phần dữ liệu PO_RESEARCH_V1/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Lưu và mở báo cáo' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('allows saving when a chat copy dropped the code fences and shows no warning', () => {
    render(<Top5GuidedPanel {...props} />);
    fireEvent.change(screen.getByLabelText('Dán câu trả lời của trợ lý'), { target: { value: 'Nội dung\nPO_RESEARCH_V1\njson\n{"schema_version": "po_research_v1"}' } });
    expect(screen.queryByText(/Chưa thấy phần dữ liệu/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Lưu và mở báo cáo' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the pasted answer and gives one next step when the backend rejects it', async () => {
    vi.mocked(reportApi.import).mockRejectedValueOnce(new Error('JSON syntax error'));
    render(<Top5GuidedPanel {...props} />);
    const box = screen.getByLabelText('Dán câu trả lời của trợ lý') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Nội dung {"schema_version": "po_research_v1", ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và mở báo cáo' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Bước tiếp theo'));
    expect(box.value).toContain('Nội dung');
    expect(reportApi.updateCsvSelection).not.toHaveBeenCalled();
  });

  it('saves a valid answer with the chosen assistant and links the report to this CSV top games', async () => {
    render(<Top5GuidedPanel {...props} />);
    fireEvent.change(screen.getByLabelText('Dán câu trả lời của trợ lý'), { target: { value: 'Nội dung\n\nPO_RESEARCH_V1\n```json\n{"schema_version":"po_research_v1"}\n```' } });
    fireEvent.change(screen.getByLabelText('Trợ lý đã trả lời'), { target: { value: 'claude' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và mở báo cáo' }));
    await waitFor(() => expect(reportApi.updateCsvSelection).toHaveBeenCalledTimes(1));
    const importPayload = vi.mocked(reportApi.import).mock.calls[0][0];
    expect(importPayload).toMatchObject({ project_id: 'project-a', source_assistant: 'claude' });
    expect(importPayload.origin).toBeUndefined();
    const [id, body] = vi.mocked(reportApi.updateCsvSelection).mock.calls[0];
    expect(id).toBe('report-new');
    expect(body).toMatchObject({ dataset_id: 'ds-1', lens: 'downloads', lens_label: 'Lượt tải' });
    expect(body.rows).toEqual([{ source_row: 1, name: 'Meowdoku' }, { source_row: 2, name: 'Alpha' }]);
    expect(window.location.pathname).toBe('/reports/report-new');
  });
});
