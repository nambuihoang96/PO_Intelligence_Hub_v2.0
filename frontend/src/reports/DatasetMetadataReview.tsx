import { useEffect, useState } from 'react';
import { reportApi, type DatasetMetadata, type MetadataChange, type QuantitativeDataset } from './api';

const labels: Record<string, string> = { geo: 'GEO', platform: 'Nền tảng', methodology: 'Phương pháp đo', unit: 'Đơn vị / tiền tệ', period_start: 'Ngày bắt đầu', period_end: 'Ngày kết thúc', snapshot_date: 'Ngày snapshot', period_semantics: 'Ý nghĩa kỳ đo', granularity: 'Chu kỳ đo (nếu biết)', source_reference: 'Nguồn dữ liệu' };
const basisLabel: Record<string, string> = { csv: 'Có trong CSV', provider_documentation: 'PO xác nhận theo tài liệu nguồn', po_unverified: 'PO cung cấp · chưa xác minh', unknown: 'Chưa biết' };

export function DatasetMetadataReview({ reportId, datasetId, onSaved, onClose }: { reportId: string; datasetId: string; onSaved: (dataset: QuantitativeDataset) => void; onClose: () => void }) {
  const [data, setData] = useState<DatasetMetadata | null>(null);
  const [groupKey, setGroupKey] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [basis, setBasis] = useState<MetadataChange['basis']>('po_unverified');
  const [source, setSource] = useState(''); const [excerpt, setExcerpt] = useState('');
  const [attested, setAttested] = useState(false); const [replace, setReplace] = useState(false);
  const [showAll, setShowAll] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { let active = true; reportApi.getDatasetMetadata(reportId, datasetId).then((next) => { if (active) { setData(next); setGroupKey(next.groups[0]?.key ?? ''); } }).catch((reason) => { if (active) setError(String(reason.message || reason)); }); return () => { active = false; }; }, [reportId, datasetId]);
  useEffect(() => { if (!Object.keys(draft).length) return; const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [draft]);
  const group = data?.groups.find((item) => item.key === groupKey);
  const semantics = draft.period_semantics ?? group?.fields.period_semantics.value;
  const fields = group ? Object.entries(group.fields).filter(([field, value]) => showAll || (
    !['csv', 'provider_documentation'].includes(value.basis) &&
    (semantics !== 'snapshot' || !['period_start', 'period_end', 'granularity'].includes(field)) &&
    (!['reporting_interval', 'rolling_interval'].includes(semantics ?? '') || field !== 'snapshot_date')
  )) : [];
  async function save() {
    if (!data || !group || busy) return;
    if (basis === 'provider_documentation' && (!source.trim() || excerpt.trim().length < 10 || !attested)) { setError('Cần URL tài liệu, đoạn trích hỗ trợ và xác nhận đã đối chiếu các trường được sửa.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const changes = Object.entries(draft).map(([field, value]) => ({ group_key: group.key, field, value: basis === 'unknown' ? null : value.trim() || null, basis, source_url: source.trim() || null, source_excerpt: excerpt, attested, replace_existing: replace }));
      const next = await reportApi.updateDatasetMetadata(reportId, datasetId, data.revision, changes);
      setData(next); setDraft({}); setReplace(false);
      const refreshed = await reportApi.getQuantitativeDataset(reportId, datasetId);
      onSaved(refreshed); setNotice('Đã lưu và kiểm tra lại. CSV gốc được giữ nguyên. Chỉ quan sát đủ căn cứ mới được so sánh.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa lưu được. Nội dung đang nhập vẫn được giữ.'); }
    finally { setBusy(false); }
  }
  function close() { if (!Object.keys(draft).length || window.confirm('Có thay đổi chưa lưu. Đóng phần xem lại?')) onClose(); }
  return <section className="dataset-metadata-review" aria-label="Review dataset information">
    <header><div><h3>Review dataset information</h3><p>Xem lại thông tin file · {data?.filename ?? 'Đang tải…'}</p></div><button type="button" className="text-button" onClick={close} disabled={busy}>Đóng</button></header>
    <p>Chỉ bổ sung điều có căn cứ. Tên file là gợi ý; URL và lời xác nhận của PO không đồng nghĩa dữ liệu đã được xác minh độc lập.</p>
    {data && <>
      <label>Nhóm phép đo<select value={groupKey} disabled={busy || Object.keys(draft).length > 0} onChange={(event) => { setGroupKey(event.target.value); setShowAll(false); }}>{data.groups.map((item) => <option key={item.key} value={item.key}>{item.metric} · {item.fields.geo?.value ?? '?'} / {item.fields.platform?.value ?? '?'} · {item.fields.period_start?.value || item.fields.snapshot_date?.value || '?'} · {item.observations} quan sát</option>)}</select></label>
      <p>Áp dụng cho {group?.observations} quan sát trong nhóm được chọn. Các nhóm kỳ đo khác được giữ riêng.</p>
      <label className="metadata-check"><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />Xem cả thông tin đã có căn cứ để kiểm tra hoặc sửa</label>
      <div className="metadata-field-grid">{fields.map(([field, value]) => <label key={field}>{labels[field]}{field === 'period_semantics' ? <select disabled={busy} value={draft[field] ?? value.value ?? 'unknown'} onChange={(event) => setDraft((current) => {
        const next: Record<string, string> = { ...current, [field]: event.target.value };
        if (event.target.value === 'snapshot') {
          if (group?.fields.period_start) next.period_start = '';
          if (group?.fields.period_end) next.period_end = '';
          if (group?.fields.granularity) next.granularity = '';
        } else if (['reporting_interval', 'rolling_interval'].includes(event.target.value)) {
          if (group?.fields.snapshot_date) next.snapshot_date = '';
        }
        return next;
      })}><option value="unknown">Chưa biết</option><option value="snapshot">Một thời điểm (snapshot)</option><option value="reporting_interval">Tổng trong khoảng báo cáo</option><option value="rolling_interval">Tổng trong khoảng trượt</option></select> : <input disabled={busy} type={['period_start', 'period_end', 'snapshot_date'].includes(field) ? 'date' : 'text'} value={draft[field] ?? value.value ?? ''} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} /> }<small>{basisLabel[value.basis] ?? value.basis}{value.source_url && <> · <a href={value.source_url} target="_blank" rel="noreferrer">Tài liệu xác nhận</a></>}</small>{draft[field] === undefined && <button type="button" className="text-button" onClick={() => setDraft((current) => ({ ...current, [field]: value.value ?? '' }))}>Xác nhận lại trường này</button>}</label>)}</div>
      {!fields.length && <p>Các thông tin cần thiết đã có căn cứ được ghi nhận.</p>}
      <fieldset disabled={busy}><legend>Căn cứ cho các trường đang sửa</legend><label>Trạng thái<select value={basis} onChange={(event) => setBasis(event.target.value as MetadataChange['basis'])}><option value="po_unverified">PO cung cấp, chưa có tài liệu xác nhận</option><option value="provider_documentation">Đối chiếu tài liệu nhà cung cấp / export</option><option value="unknown">Giữ là chưa biết</option></select></label><label>URL tài liệu nguồn<input type="url" value={source} onChange={(event) => setSource(event.target.value)} /></label><label>Đoạn trích giải thích phép đo và phạm vi<textarea value={excerpt} onChange={(event) => setExcerpt(event.target.value)} /></label>{basis === 'provider_documentation' && <label className="metadata-check"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />Tôi đã đối chiếu: tài liệu này hỗ trợ các giá trị đang sửa, bao gồm tổng theo kỳ hay số tại một thời điểm.</label>}<label className="metadata-check"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />Tôi đã xem lại và cho phép thay thế giá trị metadata đang có nếu khác.</label></fieldset>
      <div className="metadata-actions"><button type="button" className="primary-action" disabled={busy || !Object.keys(draft).length} onClick={() => void save()}>{busy ? 'Đang lưu và kiểm tra…' : 'Lưu và kiểm tra lại'}</button><span>{Object.keys(draft).length ? 'Có thay đổi chưa lưu' : 'Không có thay đổi chưa lưu'}</span></div>
      <details><summary>Lịch sử xác nhận ({data.history.length})</summary>{data.history.map((item, index) => <p key={index}>{labels[item.field]}: {item.next.value ?? 'Chưa biết'} · {basisLabel[item.next.basis]} · {item.recorded_at}{item.next.source_url && <> · <a href={item.next.source_url} target="_blank" rel="noreferrer">Nguồn</a></>}</p>)}<small>SHA-256 CSV gốc: {data.content_sha256}</small></details>
    </>}
    {error && <p role="alert" className="research-alert">{error}</p>}{notice && <p role="status" className="research-success">{notice}</p>}
  </section>;
}
