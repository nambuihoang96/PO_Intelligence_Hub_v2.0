import { useEffect, useMemo, useState } from 'react';
import { reportApi, type DatasetMetadata, type MetadataChange, type QuantitativeDataset } from '../reports/api';
import { formatIsoDateVi, proposalFromFilename } from './csvWarnings';
import './CsvResultPanels.css';

// Basis values that already count as confirmed. A PO confirmation is its own basis, shown on every result.
const CONFIRMED = new Set(['csv', 'provider_documentation', 'po_confirmed']);
const FILE_SOURCE = 'PO xác nhận từ tên tệp';
const PO_SOURCE = 'PO xác nhận trong PO Hub (không có trong CSV hay tên tệp)';
const CURRENCY_OPTIONS = ['USD', 'VND', 'EUR', 'Khác'];

// Units come from the column names and the stored unit key. The PO confirms them with one click.
// Only currency (not knowable from the file) and the methodology are asked as real questions.
export function proposedUnit(unitKey: string): string | null {
  const key = unitKey.trim().toLocaleLowerCase();
  if (/download|lượt tải/.test(key)) return 'lượt tải';
  if (/\buser|\bdau\b|người dùng/.test(key)) return 'người dùng';
  if (key === '%' || /percent|phần trăm/.test(key)) return '%';
  return null;
}

function isCurrencyKey(unitKey: string) {
  return /usd|vnd|eur|\$|đô|revenue|doanh thu|currency|tiền/i.test(unitKey);
}

export function CsvPoConfirmation({ projectId, dataset, onConfirmed }: {
  projectId: string;
  dataset: Pick<QuantitativeDataset, 'id' | 'filename' | 'created_at'>;
  onConfirmed: (dataset: QuantitativeDataset) => void;
}) {
  const [meta, setMeta] = useState<DatasetMetadata | null>(null);
  const [units, setUnits] = useState<Record<string, string>>({});
  const [methodology, setMethodology] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setMeta(null); setError(''); setUnits({});
    reportApi.getProjectDatasetMetadata(projectId, dataset.id)
      .then((next) => { if (active) setMeta(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Chưa tải được thông tin tệp.'); });
    return () => { active = false; };
  }, [projectId, dataset.id, dataset.created_at]);

  const plan = useMemo(() => {
    const groups = meta?.groups ?? [];
    const proposal = proposalFromFilename(dataset.filename);
    const needsBasis = (field: string) => groups.some((group) => group.fields[field] && !CONFIRMED.has(group.fields[field].basis));
    const needPeriod = Boolean(proposal.periodStart && proposal.periodEnd) && (needsBasis('period_semantics') || needsBasis('period_start') || needsBasis('period_end'));
    const needGeo = Boolean(proposal.geo) && needsBasis('geo');
    const unitGroups = groups.filter((group) => group.fields.unit && !CONFIRMED.has(group.fields.unit.basis));
    const unitKeys = [...new Set(unitGroups.map((group) => group.fields.unit.value ?? ''))];
    const needMethod = groups.some((group) => group.fields.methodology && !CONFIRMED.has(group.fields.methodology.basis));
    return { groups, proposal, needPeriod, needGeo, unitKeys, needMethod, pending: needPeriod || needGeo || unitKeys.length > 0 || needMethod };
  }, [meta, dataset.filename]);

  // Pre-fill proposals once per loaded file; the PO may overwrite any of them.
  const proposals = useMemo(() => Object.fromEntries(plan.unitKeys.map((key) => [key, proposedUnit(key) ?? ''])), [plan.unitKeys]);
  const effectiveUnit = (key: string) => (isCurrencyKey(key) ? (units['__currency'] ?? '') : (units[key] ?? proposals[key] ?? '')).trim();
  const ready = plan.pending
    && plan.unitKeys.every((key) => effectiveUnit(key).length > 0)
    && (!plan.needMethod || methodology.trim().length >= 3);

  async function confirm() {
    if (!meta || !ready || busy) return;
    const changes: MetadataChange[] = [];
    const add = (group_key: string, field: string, value: string | null, source: string) => changes.push({
      group_key, field, value, basis: 'po_confirmed', source_url: null, source_excerpt: source, attested: false, replace_existing: true,
    });
    for (const group of plan.groups) {
      const fileChange = (field: string) => group.fields[field] && !CONFIRMED.has(group.fields[field].basis);
      if (plan.needGeo && fileChange('geo') && plan.proposal.geo) add(group.key, 'geo', plan.proposal.geo, `${FILE_SOURCE}: ${dataset.filename}`);
      if (plan.needPeriod && (fileChange('period_semantics') || fileChange('period_start') || fileChange('period_end'))) {
        add(group.key, 'period_semantics', 'reporting_interval', `${FILE_SOURCE}: ${dataset.filename}`);
        add(group.key, 'period_start', plan.proposal.periodStart, `${FILE_SOURCE}: ${dataset.filename}`);
        add(group.key, 'period_end', plan.proposal.periodEnd, `${FILE_SOURCE}: ${dataset.filename}`);
        add(group.key, 'snapshot_date', null, `${FILE_SOURCE}: ngày snapshot trong CSV được thay bằng kỳ từ tên tệp`);
      }
      if (fileChange('unit')) add(group.key, 'unit', effectiveUnit(group.fields.unit.value ?? ''), PO_SOURCE);
      if (plan.needMethod && fileChange('methodology')) add(group.key, 'methodology', methodology.trim(), PO_SOURCE);
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await reportApi.updateProjectDatasetMetadata(projectId, dataset.id, meta.revision, changes);
      setMeta(next);
      const refreshed = await reportApi.getProjectQuantitativeDataset(projectId, dataset.id);
      setUnits({}); setMethodology('');
      setNotice(`Đã xác nhận ${changes.length} thông tin. Kết quả ghi rõ nguồn “PO xác nhận”. CSV gốc không đổi.`);
      onConfirmed(refreshed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa xác nhận được. Nội dung đang nhập vẫn được giữ.');
    } finally {
      setBusy(false);
    }
  }

  if (!meta && !error) return <section className="csv-po-confirm" aria-label="Xác nhận thông tin tệp"><p role="status">Đang đọc thông tin tệp…</p></section>;
  if (!plan.pending) {
    // Nothing to confirm: the form stays out of the way. A notice only appears right after a confirmation.
    return notice ? <section className="csv-po-confirm csv-po-confirm--done" aria-label="Xác nhận thông tin tệp"><p role="status">{notice}</p></section> : null;
  }
  return <section className="csv-po-confirm" aria-label="Xác nhận thông tin tệp">
    <div className="csv-po-confirm__heading">
      <div><span className="state-label">XÁC NHẬN MỘT LẦN</span><h3>Xác nhận trước khi so sánh</h3></div>
    </div>
    <p>PO Hub đề xuất từ tên cột và tên tệp. Bấm xác nhận nếu đúng; kết quả sẽ ghi nguồn “PO xác nhận”.</p>
    <ul className="csv-po-confirm__proposals">
      {plan.needPeriod && <li><strong>Kỳ đo (từ tên tệp):</strong> {formatIsoDateVi(plan.proposal.periodStart)} – {formatIsoDateVi(plan.proposal.periodEnd)}.</li>}
      {plan.needGeo && <li><strong>Khu vực (từ tên tệp):</strong> {plan.proposal.geo}</li>}
      {plan.unitKeys.map((key) => <li key={key || '__empty'}>
        <strong>Cột “{key || 'chưa có đơn vị'}”:</strong> {proposals[key] ? <>đề xuất là <b>{effectiveUnit(key)}</b></> : 'chưa nhận ra đơn vị, cần nhập'}
      </li>)}
    </ul>
    {plan.unitKeys.some((key) => isCurrencyKey(key)) && <label className="csv-po-confirm__method">
      <span>Đơn vị tiền tệ của doanh thu</span>
      <select value={units['__currency'] ?? ''} onChange={(event) => setUnits((current) => ({ ...current, __currency: event.target.value }))} disabled={busy}>
        <option value="">Chọn đơn vị tiền tệ…</option>
        {CURRENCY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>}
    {plan.unitKeys.filter((key) => !proposedUnit(key) && !isCurrencyKey(key)).map((key) => <label key={key || '__empty'} className="csv-po-confirm__method">
      <span>Cột “{key || 'chưa có đơn vị'}” đo bằng gì?</span>
      <input type="text" value={units[key] ?? ''} placeholder="Ví dụ: lượt tải, người dùng, USD, %" onChange={(event) => setUnits((current) => ({ ...current, [key]: event.target.value }))} disabled={busy} />
    </label>)}
    {plan.needMethod && <label className="csv-po-confirm__method">
      <span>Phương pháp đo (ví dụ nguồn và cách xuất)</span>
      <input type="text" value={methodology} onChange={(event) => setMethodology(event.target.value)} disabled={busy} placeholder="Ví dụ: Sensor Tower Unified, xuất theo tháng" />
    </label>}
    <div className="csv-po-confirm__actions">
      <button className="primary-action" type="button" disabled={!ready || busy} onClick={() => void confirm()}>{busy ? 'Đang xác nhận…' : 'Xác nhận đề xuất'}</button>
      {!ready && <span className="field-help">Điền các mục còn thiếu để bật nút.</span>}
    </div>
    {error && <p role="alert" className="research-alert">{error}</p>}
    {notice && <p role="status" className="research-success">{notice}</p>}
  </section>;
}
