import { DatasetMetadataReview } from './DatasetMetadataReview';
import { useMemo, useState } from 'react';
import { reportApi, type QuantitativeDataset, type QuantitativeObservation } from './api';

const PAGE_SIZE = 50;
type AppRow = { key: string; name: string; observations: QuantitativeObservation[] };

function observationEntityKey(item: QuantitativeObservation): string {
  if (item.source_entity_id) {
    const provider = item.source_provider || 'csv';
    return item.source_entity_id.startsWith(`${provider}:`) ? item.source_entity_id : `${provider}:${item.source_entity_id}`;
  }
  return item.entity_id ? `report:${item.entity_id}` : `unknown:${item.source_entity_name || item.entity_name || 'entity'}`;
}

function displayValue(item: QuantitativeObservation): string {
  return item.value === null || item.value === undefined ? 'Unknown' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(item.value)}${item.unit ? ` ${item.unit}` : ''}`;
}

function scopeKey(item: QuantitativeObservation): string {
  return `${item.geo || 'GEO unknown'}|${item.platform || 'Platform unknown'}|${item.period_start || '?'}|${item.period_end || '?'}`;
}

export function QuantitativeDatasetExplorer({ dataset, onRevalidated, reportScope }: {
  dataset: QuantitativeDataset;
  onRevalidated: (dataset: QuantitativeDataset) => void;
  reportScope?: { geo?: string | null; platform?: string | null };
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [geo, setGeo] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [period, setPeriod] = useState('all');
  const [metrics, setMetrics] = useState<string[]>([]);
  const [sortMetric, setSortMetric] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<QuantitativeObservation | null>(null);
  const [ambiguousCell, setAmbiguousCell] = useState<{ entity: string; metric: string; observations: QuantitativeObservation[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [failure, setFailure] = useState('');

  const allObservations = dataset.observations;
  const metricNames = useMemo(() => [...new Map(allObservations.filter((item) => item.metric_id).map((item) => [item.metric_id!, item.metric_definition || item.metric_id!])).entries()], [allObservations]);
  const geos = useMemo(() => [...new Set(allObservations.map((item) => item.geo).filter((item): item is string => Boolean(item)))].sort(), [allObservations]);
  const platforms = useMemo(() => [...new Set(allObservations.map((item) => item.platform).filter((item): item is string => Boolean(item)))].sort(), [allObservations]);
  const periods = useMemo(() => [...new Set(allObservations.map((item) => scopeKey(item).split('|').slice(2).join('|')))].sort(), [allObservations]);
  const selectedMetrics = metrics.length ? metrics : metricNames.map(([id]) => id);

  const appRows = useMemo<AppRow[]>(() => {
    const grouped = new Map<string, AppRow>();
    for (const item of allObservations) {
      if ((geo !== 'all' && item.geo !== geo) || (platform !== 'all' && item.platform !== platform)) continue;
      const itemPeriod = `${item.period_start || '?'}|${item.period_end || '?'}`;
      if (period !== 'all' && itemPeriod !== period) continue;
      const key = observationEntityKey(item);
      const row = grouped.get(key) ?? { key, name: item.source_entity_name || item.entity_name || item.entity_id || key, observations: [] };
      row.observations.push(item);
      grouped.set(key, row);
    }
    const normalized = [...grouped.values()].filter((row) => `${row.name} ${row.key}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    if (sortMetric) normalized.sort((left, right) => {
      const leftValues = left.observations.filter((item) => item.metric_id === sortMetric && item.value !== null).map((item) => item.value!);
      const rightValues = right.observations.filter((item) => item.metric_id === sortMetric && item.value !== null).map((item) => item.value!);
      const a = leftValues.length === 1 ? leftValues[0] : Number.NEGATIVE_INFINITY;
      const b = rightValues.length === 1 ? rightValues[0] : Number.NEGATIVE_INFINITY;
      return b - a || left.name.localeCompare(right.name);
    });
    return normalized;
  }, [allObservations, geo, platform, period, query, sortMetric]);

  const pageRows = appRows.slice(0, page * PAGE_SIZE);
  const distinctSources = new Set(allObservations.map((item) => item.source_entity_id || item.entity_id).filter(Boolean)).size;
  const sourceRows = dataset.source_rows ?? allObservations.length;
  const selectedReference = selected?.evidence_reference || selected?.source_reference;
  const reportIncompatible = dataset.compatibility_status === 'incompatible';
  const datasetGeos = [...new Set(allObservations.map((item) => item.geo).filter(Boolean))].join(', ') || 'unknown GEO';
  const datasetPlatforms = [...new Set(allObservations.map((item) => item.platform).filter(Boolean))].join(', ') || 'unknown platform';

  async function revalidate() {
    setBusy(true); setFailure(''); setFeedback('');
    try {
      const next = dataset.report_id
        ? await reportApi.revalidateQuantitativeDataset(dataset.report_id, dataset.id)
        : await reportApi.revalidateProjectQuantitativeDataset(dataset.project_id!, dataset.id);
      onRevalidated(next);
      setFeedback('Đã kiểm tra lại từ CSV gốc. Mã tệp dữ liệu và liên kết báo cáo được giữ nguyên.');
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : 'Không thể kiểm tra lại dataset. Dữ liệu hiện tại vẫn được giữ nguyên.');
    } finally { setBusy(false); }
  }

  function observationsForCell(row: AppRow, metricId: string) {
    return row.observations.filter((item) => item.metric_id === metricId);
  }

  function renderCell(row: AppRow, metricId: string) {
    const matches = observationsForCell(row, metricId);
    if (!matches.length) return <span className="dataset-unknown">Chưa có dữ liệu</span>;
    if (matches.length > 1) return <button type="button" className="dataset-cell-ambiguous" onClick={() => { setSelected(null); setAmbiguousCell({ entity: row.name, metric: metricNames.find(([id]) => id === metricId)?.[1] || metricId, observations: matches }); }}>{matches.length} phép đo · chọn để xem</button>;
    const item = matches[0];
    return <button type="button" className="dataset-value-button" onClick={() => { setAmbiguousCell(null); setSelected(item); }} aria-label={`Xem ${row.name}, ${metricNames.find(([id]) => id === metricId)?.[1] || metricId}: ${displayValue(item)}`}>{displayValue(item)}</button>;
  }

  return <section className="dataset-explorer" aria-label={`Khám phá dữ liệu ${dataset.filename}`}>
    <header className="dataset-explorer-header"><div><span className="field-label">KHÁM PHÁ DỮ LIỆU CSV</span><h4>{dataset.filename}</h4><p>Số liệu được giữ trong phạm vi gốc của CSV. Mức độ phù hợp với báo cáo được đánh giá riêng.</p></div><button type="button" className="secondary-action" onClick={() => void revalidate()} disabled={busy}>{busy ? 'Đang kiểm tra lại…' : 'Kiểm tra lại dữ liệu'}</button></header>
    <button type="button" className="secondary-action" onClick={() => setReviewOpen(true)}>Xem lại thông tin tệp</button>
    {reviewOpen && <DatasetMetadataReview reportId={dataset.report_id ?? undefined} projectId={dataset.project_id ?? undefined} datasetId={dataset.id} onSaved={onRevalidated} onClose={() => setReviewOpen(false)} />}
    <div className="dataset-summary" aria-label="Tóm tắt tệp dữ liệu">
      <div><strong>{sourceRows.toLocaleString()}</strong><span>Dòng nguồn</span></div>
      <div><strong>{dataset.source_apps ?? distinctSources}</strong><span>Sản phẩm nguồn</span></div>
      <div><strong>{dataset.recognized_metrics ?? metricNames.length}</strong><span>Chỉ số</span></div>
      <div><strong>{dataset.analysis_ready_observations ?? dataset.complete_observations ?? 0}</strong><span>Phép đo đủ thông tin trong tệp</span></div>
      <div><strong>{dataset.report_compatible_observations ?? dataset.scope_compatible_observations ?? 0}</strong><span>Phù hợp với báo cáo</span></div>
      <div><strong>{dataset.dataset_comparison_ready_observations ?? 0}</strong><span>Có thể so sánh khi có tệp phù hợp</span></div>
      <div><strong>{dataset.incomplete_observations ?? Math.max(0, allObservations.length - (dataset.complete_observations ?? 0))}</strong><span>Chưa đầy đủ</span></div>
    </div>
    <div className={`dataset-compatibility ${reportIncompatible ? 'is-incompatible' : ''}`} role="status">
      {reportIncompatible ? `Số liệu CSV vẫn có thể xem trong phạm vi ${datasetGeos} / ${datasetPlatforms}. Không thể dùng trực tiếp thay cho số đo ${reportScope?.geo || 'thị trường của báo cáo'} / ${reportScope?.platform || 'nền tảng của báo cáo'}. Phạm vi không được tự chuyển đổi.` : dataset.compatibility_status === 'compatible' ? 'Phạm vi tệp dữ liệu phù hợp với báo cáo.' : 'Một số phép đo thiếu thông tin hoặc không phù hợp với báo cáo; mỗi phép đo vẫn có thể xem cùng chi tiết gốc.'}
      <span>{[...new Set(allObservations.flatMap((item) => item.report_compatibility_reasons ?? []))].slice(0, 3).join(' ')}</span>
    </div>
    <div className="dataset-explorer-controls">
      <label>Tìm sản phẩm hoặc mã nguồn<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Nhập từ khóa…" /></label>
      <label>Thị trường<select value={geo} onChange={(event) => { setGeo(event.target.value); setPage(1); }}><option value="all">Tất cả thị trường</option>{geos.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Nền tảng<select value={platform} onChange={(event) => { setPlatform(event.target.value); setPage(1); }}><option value="all">Tất cả nền tảng</option>{platforms.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Kỳ dữ liệu<select value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1); }}><option value="all">Tất cả các kỳ</option>{periods.map((item) => <option key={item} value={item}>{item.replace('|', ' – ')}</option>)}</select></label>
      <label>Sắp xếp theo<select value={sortMetric} onChange={(event) => setSortMetric(event.target.value)}><option value="">Tên sản phẩm</option>{metricNames.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    </div>
    <fieldset className="dataset-metric-picker"><legend>Các chỉ số đang xem</legend>{metricNames.map(([id, name]) => <label key={id}><input type="checkbox" checked={selectedMetrics.includes(id)} onChange={(event) => { setMetrics((current) => { const next = current.length ? current : metricNames.map(([metricId]) => metricId); return event.target.checked ? [...next, id] : next.filter((item) => item !== id); }); }} />{name}</label>)}</fieldset>
    <div className="dataset-table-scroll"><table className="dataset-explorer-table"><thead><tr><th>Sản phẩm / mã từ nguồn</th>{metricNames.filter(([id]) => selectedMetrics.includes(id)).map(([id, name]) => <th key={id}>{name}</th>)}</tr></thead><tbody>{pageRows.map((row) => <tr key={row.key}><th scope="row"><button type="button" className="dataset-app-button" onClick={() => { setAmbiguousCell(null); setSelected(row.observations[0]); }}>{row.name}</button><small>{row.key} · {row.observations[0]?.entity_resolution_state === 'matched' ? 'Đã khớp với báo cáo' : 'Chỉ có trong tệp nguồn'}</small></th>{metricNames.filter(([id]) => selectedMetrics.includes(id)).map(([id]) => <td key={id}>{renderCell(row, id)}</td>)}</tr>)}</tbody></table>
      {!pageRows.length && <p className="dataset-empty">Không có sản phẩm khớp với các bộ lọc này.</p>}</div>
    {appRows.length > pageRows.length && <button type="button" className="secondary-action" onClick={() => setPage((current) => current + 1)}>Tải thêm {Math.min(PAGE_SIZE, appRows.length - pageRows.length)} sản phẩm</button>}
    {ambiguousCell && <section className="dataset-observation-detail" aria-live="polite" aria-label="Chọn một phép đo từ nguồn"><div><h5>{ambiguousCell.entity} · {ambiguousCell.metric}</h5><button type="button" className="text-button" onClick={() => setAmbiguousCell(null)}>Đóng danh sách</button></div><p>Chọn phép đo gốc cần xem. Các giá trị không được gộp.</p><ul>{ambiguousCell.observations.map((item, index) => <li key={`${item.source_entity_id}-${item.period_start}-${item.period_end}-${item.geo}-${item.platform}-${index}`}><button type="button" className="text-button" onClick={() => { setSelected(item); setAmbiguousCell(null); }}>{displayValue(item)} · {item.geo || 'chưa rõ thị trường'} / {item.platform || 'chưa rõ nền tảng'} · {item.period_start || 'chưa rõ kỳ'} – {item.period_end || 'chưa rõ kỳ'} · {item.granularity || 'chưa rõ độ chi tiết'} · {item.methodology || 'chưa có phương pháp đo'}</button></li>)}</ul></section>}
    {selected && <section className="dataset-observation-detail" aria-live="polite"><div><h5>{selected.source_entity_name || selected.entity_name || selected.source_entity_id || 'Chi tiết phép đo'}</h5><button type="button" className="text-button" onClick={() => setSelected(null)}>Đóng</button></div><dl><dt>Chỉ số</dt><dd>{selected.metric_definition || selected.metric_id || 'Chưa xác định'}</dd><dt>Giá trị</dt><dd>{displayValue(selected)}</dd><dt>Danh tính nguồn</dt><dd>{selected.source_provider || 'CSV'} · {selected.source_entity_id || 'Chưa có mã định danh'}</dd><dt>Thị trường / nền tảng</dt><dd>{selected.geo || 'Chưa rõ'} / {selected.platform || 'Chưa rõ'}</dd><dt>Kỳ / độ chi tiết</dt><dd>{selected.period_start || 'Chưa rõ'} – {selected.period_end || 'Chưa rõ'} · {selected.granularity || 'Chưa rõ'}</dd><dt>Phương pháp đo</dt><dd>{selected.methodology || 'Chưa được cung cấp'}</dd><dt>Trạng thái số liệu</dt><dd>{selected.analysis_ready ? 'Đủ thông tin để phân tích trong tệp' : 'Chưa đầy đủ'} · {selected.verification_status === 'verified' ? 'Đã xác minh độc lập' : 'CSV chưa được xác minh độc lập'}</dd><dt>Liên kết báo cáo</dt><dd>{selected.report_compatibility || 'chưa rõ'}{selected.entity_id ? ` · ${selected.entity_id}` : ' · chưa liên kết với hồ sơ trong báo cáo'}</dd></dl>{(selected.source_validation_reasons?.length || selected.metadata_validation_reasons?.length || selected.report_compatibility_reasons?.length) ? <details><summary>Lý do kiểm tra</summary><ul>{[...(selected.source_validation_reasons ?? []), ...(selected.metadata_validation_reasons ?? []), ...(selected.report_compatibility_reasons ?? [])].map((reason, index) => <li key={index}>{reason}</li>)}</ul></details> : null}{selected.metadata_provenance && <details><summary>Nguồn và rà soát thông tin</summary><ul>{Object.entries(selected.metadata_provenance).map(([field, info]) => <li key={field}>{field}: {info.value ?? 'Chưa rõ'} · {info.basis.replaceAll('_', ' ')}{info.source_url && <> · <a href={info.source_url} target="_blank" rel="noreferrer">Tài liệu tham khảo</a></>}</li>)}</ul></details>}{selectedReference && <a href={selectedReference} target="_blank" rel="noreferrer">Mở bằng chứng hoặc nguồn đã cung cấp</a>}<p>CSV gốc: {dataset.filename} · thông tin dòng được giữ lại</p></section>}
    {feedback && <p className="research-success" role="status">{feedback}</p>}{failure && <p className="research-alert" role="alert">{failure}</p>}
    <details className="dataset-raw-advanced"><summary>Nâng cao: xem từng phép đo đã nhập</summary><div className="dataset-raw-list">{allObservations.map((item, index) => <details key={`${item.source_entity_id}-${item.metric_id}-${index}`}><summary>{item.source_entity_name || item.entity_name || item.source_entity_id} · {item.metric_definition || item.metric_id} · {displayValue(item)}</summary><p>{item.source_entity_id} · {item.geo || 'chưa rõ thị trường'} · {item.platform || 'chưa rõ nền tảng'} · {item.period_start || '?'} – {item.period_end || '?'}</p>{item.validation_reasons.map((reason, reasonIndex) => <div key={reasonIndex}>{reason}</div>)}</details>)}</div></details>
  </section>;
}
