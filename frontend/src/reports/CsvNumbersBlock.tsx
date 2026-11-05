import { useEffect, useMemo, useState } from 'react';
import { computeTop10Rankings, top10RowsBySourceRow, type Top10Row } from '../research/top10Insight';
import { reportApi, type ComparisonDataset, type ImportedReport, type QuantitativeDataset, type ReportSummary } from './api';

// "Tính từ CSV · ước tính": the numbers come only from the saved CSV dataset, never from the model's text.
// A report without a link shows a clear step to attach one. Attaching records the link; the report text is not changed.

const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const pct1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

type Lens = 'downloads' | 'revenue' | 'growth';
const LENS_LABEL: Record<Lens, string> = { downloads: 'Lượt tải', revenue: 'Doanh thu', growth: 'Tăng trưởng' };

function growthText(row: Top10Row | undefined) {
  if (!row) return null;
  if (row.growthRatio === null) return 'Không có năm trước';
  return `+${pct1.format(row.growthRatio * 100)}%`;
}

export function CsvNumbersBlock({ report, onLinked }: { report: ImportedReport; onLinked?: (updated: ReportSummary) => void }) {
  const projectId = report.project_id;
  const [dataset, setDataset] = useState<QuantitativeDataset | null>(null);
  const [loadError, setLoadError] = useState('');
  const [datasets, setDatasets] = useState<ComparisonDataset[]>([]);
  const [pickedDataset, setPickedDataset] = useState('');
  const [lens, setLens] = useState<Lens>('downloads');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selection = report.source_selection ?? null;

  useEffect(() => {
    if (!projectId || !selection) return;
    let active = true;
    reportApi.getProjectQuantitativeDataset(projectId, selection.dataset_id)
      .then((item) => { if (active) setDataset(item); })
      .catch((cause) => { if (active) setLoadError(cause instanceof Error ? cause.message : 'Không đọc được tệp CSV đã gắn.'); });
    return () => { active = false; };
  }, [projectId, selection?.dataset_id]);

  useEffect(() => {
    if (!projectId || selection) return;
    reportApi.listComparisonDatasets(undefined, projectId)
      .then((page) => { setDatasets(page.items); setPickedDataset((current) => current || page.items[0]?.id || ''); })
      .catch(() => setDatasets([]));
  }, [projectId, selection]);

  const shownRows = useMemo(() => {
    if (!dataset || !selection) return [];
    const bySource = top10RowsBySourceRow(dataset);
    return selection.rows.map((saved) => ({ saved, row: bySource.get(saved.source_row) }));
  }, [dataset, selection]);
  const maxDownloads = Math.max(1, ...shownRows.map(({ row }) => row?.downloads ?? 0));

  if (!projectId) return null;

  async function attach() {
    if (!projectId || !pickedDataset) return;
    setBusy(true); setMessage('');
    try {
      const full = await reportApi.getProjectQuantitativeDataset(projectId, pickedDataset);
      const rankings = computeTop10Rankings(full);
      const rows = rankings[lens].slice(0, 5).filter((row) => row.sourceRow !== null)
        .map((row) => ({ source_row: row.sourceRow as number, name: row.name }));
      if (!rows.length) { setMessage('Tệp này không có game nào xếp được theo bộ lọc đã chọn.'); return; }
      const datasetInfo = datasets.find((item) => item.id === pickedDataset);
      const updated = await reportApi.updateCsvSelection(report.id, {
        dataset_id: pickedDataset, dataset_filename: datasetInfo?.filename ?? full.filename, lens, lens_label: LENS_LABEL[lens], rows,
      });
      onLinked?.(updated);
      setMessage(`Đã gắn ${rows.length} game từ tệp “${datasetInfo?.filename ?? full.filename}”. Số bên dưới đọc từ tệp này.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Chưa gắn được tệp CSV. Thử lại.');
    } finally { setBusy(false); }
  }

  return <section className="csv-numbers-block" aria-labelledby={`csv-numbers-${report.id}`}>
    <span className="field-label">TÍNH TỪ CSV · ƯỚC TÍNH · CHƯA XÁC MINH</span>
    <h3 id={`csv-numbers-${report.id}`}>Số liệu top game từ tệp đã lưu</h3>
    {!selection && <div className="csv-numbers-attach">
      <p>Báo cáo này chưa gắn với tệp CSV, nên chưa có bảng số. Chọn tệp và bộ lọc để gắn 5 game đứng đầu. Việc này không thay đổi nội dung báo cáo.</p>
      {datasets.length === 0 ? <p>Chưa có tệp CSV trong dự án. Nhập CSV ở trang Nghiên cứu trước.</p> : <div className="csv-numbers-controls">
        <label>Tệp CSV<select aria-label="Tệp CSV để gắn" value={pickedDataset} onChange={(event) => setPickedDataset(event.target.value)}>{datasets.map((item) => <option key={item.id} value={item.id}>{item.filename}</option>)}</select></label>
        <label>Xếp theo<select aria-label="Bộ lọc để gắn" value={lens} onChange={(event) => setLens(event.target.value as Lens)}><option value="downloads">Lượt tải</option><option value="revenue">Doanh thu</option><option value="growth">Tăng trưởng</option></select></label>
        <button className="secondary-action" type="button" onClick={() => void attach()} disabled={busy || !pickedDataset}>{busy ? 'Đang gắn…' : 'Gắn 5 game đứng đầu'}</button>
      </div>}
      {message && <p role="status">{message}</p>}
    </div>}
    {selection && loadError && <p role="alert">{loadError}</p>}
    {selection && !dataset && !loadError && <p role="status">Đang đọc tệp “{selection.dataset_filename}”…</p>}
    {selection && dataset && <>
      <p className="csv-numbers-scope">Tệp “{selection.dataset_filename}” · xếp theo {selection.lens_label.toLocaleLowerCase()} · {shownRows.length} game. Nguồn: tệp CSV đã lưu, không lấy từ câu trả lời của mô hình.</p>
      <div className="csv-numbers-table-scroll" role="region" aria-label="Bảng số liệu top game từ CSV" tabIndex={0}>
        <table className="csv-numbers-table">
          <thead><tr><th scope="col">Hạng</th><th scope="col">Game</th><th scope="col">Lượt tải</th><th scope="col">DAU</th><th scope="col">Doanh thu</th><th scope="col">Tăng trưởng</th></tr></thead>
          <tbody>{shownRows.map(({ saved, row }, index) => <tr key={saved.source_row}>
            <td>{index + 1}</td>
            <th scope="row">{row?.name ?? saved.name}</th>
            <td>
              {row ? <><span>{nf0.format(row.downloads)}</span><span className="csv-numbers-bar" aria-hidden="true"><span style={{ width: `${Math.round((row.downloads / maxDownloads) * 100)}%` }} /></span></> : <span>Không còn trong tệp</span>}
            </td>
            <td>{row?.dau == null ? 'Chưa có' : nf0.format(row.dau)}</td>
            <td>{row?.revenue == null ? 'Chưa có' : `${nf2.format(row.revenue)}${row.zeroRevenue ? ' (0)' : ''}`}</td>
            <td>{growthText(row) ?? 'Không có'}{row?.smallBaseGrowth && <small className="csv-numbers-warning"> · CẦN KIỂM TRA: nền năm trước nhỏ, % chỉ tham khảo</small>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="csv-numbers-note">Doanh thu chưa có đơn vị tiền tệ đã xác nhận. Số là quan sát từ CSV, chưa phải số thị trường.</p>
    </>}
  </section>;
}
