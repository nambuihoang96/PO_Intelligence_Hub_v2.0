// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetMetadataReview } from './DatasetMetadataReview';
import { reportApi } from './api';

vi.mock('./api', async (original) => {
  const actual = await original<typeof import('./api')>();
  return { ...actual, reportApi: { ...actual.reportApi, getDatasetMetadata: vi.fn(), updateDatasetMetadata: vi.fn(), getQuantitativeDataset: vi.fn() } };
});
const field = (value: string | null, basis = 'unknown') => ({ value, original_value: value, original_basis: basis, basis, source_url: null, source_excerpt: '', confirmed_at: null });
const metadata = { dataset_id: 'data', report_id: 'report', filename: 'existing.csv', content_sha256: 'immutable', revision: 3, history: [], groups: [{ key: 'group', metric: 'Downloads', observations: 100, fields: { methodology: field(null), geo: field('US', 'csv'), period_semantics: field('snapshot', 'provider_documentation'), snapshot_date: field('2026-08-01', 'csv') } }] };
describe('existing dataset metadata recovery', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); vi.mocked(reportApi.getDatasetMetadata).mockResolvedValue(metadata); vi.mocked(reportApi.getQuantitativeDataset).mockResolvedValue({ id: 'data', report_id: 'report' } as never); });
  it('shows missing fields, preserves confirmed fields and saves documented metadata then refreshes effective data', async () => {
    vi.mocked(reportApi.updateDatasetMetadata).mockResolvedValue({ ...metadata, revision: 4 });
    const saved = vi.fn(); render(<DatasetMetadataReview datasetId="data" reportId="report" onSaved={saved} onClose={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText(/^Phương pháp đo/), { target: { value: 'Exact provider snapshot count' } });
    expect(screen.queryByLabelText(/^GEO/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'provider_documentation' } });
    fireEvent.change(screen.getByLabelText('URL tài liệu nguồn'), { target: { value: 'https://example.com/spec' } });
    fireEvent.change(screen.getByLabelText('Đoạn trích giải thích phép đo và phạm vi'), { target: { value: 'Provider defines an exact count at the stated snapshot date.' } });
    fireEvent.click(screen.getByLabelText(/Tôi đã đối chiếu/));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và kiểm tra lại' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(reportApi.updateDatasetMetadata).toHaveBeenCalledWith('report', 'data', 3, [expect.objectContaining({ field: 'methodology', basis: 'provider_documentation', attested: true })]);
    expect(reportApi.getQuantitativeDataset).toHaveBeenCalledWith('report', 'data');
  });
  it('requires documentation before treating a correction as documented', async () => {
    render(<DatasetMetadataReview datasetId="data" reportId="report" onSaved={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText(/^Phương pháp đo/), { target: { value: 'Not enough' } });
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'provider_documentation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và kiểm tra lại' }));
    expect(await screen.findByRole('alert')).toBeTruthy(); expect(reportApi.updateDatasetMetadata).not.toHaveBeenCalled();
  });
  it('retains the draft on stale/network failure and does not report success', async () => {
    vi.mocked(reportApi.updateDatasetMetadata).mockRejectedValue(new Error('Dataset information changed. Reopen before saving.'));
    render(<DatasetMetadataReview datasetId="data" reportId="report" onSaved={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText(/^Phương pháp đo/), { target: { value: 'Draft method' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và kiểm tra lại' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText(/^Phương pháp đo/) as HTMLInputElement).value).toBe('Draft method');
    expect(screen.getByRole('button', { name: 'Lưu và kiểm tra lại' }).hasAttribute('disabled')).toBe(false);
  });
});
