import { useMemo, useState } from 'react';
import type { QuantitativeComparisonPreview, QuantitativeComparisonRow } from './api';
import { adaptComparisonForChart, chartEligible, comparisonSortLabel, defaultComparisonSort, sortComparisonPoints, type ComparisonChartSort, type ComparisonChartType, type ComparisonChartPoint } from './comparisonChartAdapter';
import { formatQuantitativePeriod, formatQuantitativeValue, formatSignedQuantitativeValue } from './quantitativePresentation';

type Props = { result: QuantitativeComparisonPreview };
const pageSize = 50;
const periodLabel = (source: { period_semantics?: string; semantics?: string; snapshot_date?: string | null; period_start: string | null; period_end: string | null }) => (source.period_semantics ?? source.semantics) === 'snapshot'
  ? formatQuantitativePeriod(null, null, source.snapshot_date ?? null)
  : formatQuantitativePeriod(source.period_start, source.period_end);

function EvidenceDetails({ row }: { row: QuantitativeComparisonRow }) {
  return <div className="csv-chart-evidence" aria-label={`Bằng chứng cho ${row.entity_name}`}>
    <h4>{row.entity_name} · các phép đo gốc</h4>
    <div className="csv-chart-source-grid">{row.evidence.map((source, index) => <article key={`${source.dataset_id}:${source.source_row_number}:${index}`}>
      <strong>{source.filename}</strong><p>{formatQuantitativeValue(source.value, source.unit)} · {periodLabel(source)}</p>
      <p>{source.geo ?? 'Chưa rõ thị trường'} · {source.platform ?? 'Chưa rõ nền tảng'} · {source.verification_status === 'verified' ? 'Đã xác minh độc lập' : 'Chưa xác minh độc lập'}</p>
      <p>{source.methodology || 'Chưa có phương pháp đo'} · dòng {source.source_row_number ?? 'chưa rõ'}</p>
      {source.source_reference && <a href={source.source_reference} target="_blank" rel="noreferrer">Mở nguồn gốc</a>}
      {source.report_id && <a href={`/reports/${source.report_id}`}>Mở báo cáo nguồn</a>}
      {source.metadata_provenance && <details><summary>Nguồn thông tin phạm vi</summary><ul>{Object.entries(source.metadata_provenance).map(([field, info]) => <li key={field}>{field}: {info.value ?? 'Chưa rõ'} · {info.basis.replaceAll('_', ' ')}{info.source_url && <> · <a href={info.source_url} target="_blank" rel="noreferrer">Tài liệu tham khảo</a></>}</li>)}</ul></details>}
    </article>)}</div>
    {row.formula && <p>Công thức do hệ thống tính: {row.formula}</p>}
    {row.reasons.length > 0 && <ul>{row.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
  </div>;
}

function PairedChart({ points, type, unit, onSelect }: { points: ComparisonChartPoint[]; type: ComparisonChartType; unit: string; onSelect: (row: QuantitativeComparisonRow) => void }) {
  const max = Math.max(1, ...points.flatMap((point) => type === 'baseline_current' ? [point.baseline ?? 0, point.current ?? 0] : [Math.abs(type === 'absolute_change' ? point.absoluteChange ?? 0 : point.percentageChange ?? 0)]));
  const signed = type !== 'baseline_current';
  const value = (point: ComparisonChartPoint) => type === 'absolute_change' ? point.absoluteChange : point.percentageChange;
  const suffix = type === 'percentage_change' ? '%' : unit;
  return <div className={`csv-chart-bars ${signed ? 'is-signed' : ''}`} aria-label={type === 'baseline_current' ? 'Giá trị kỳ trước và kỳ hiện tại theo sản phẩm' : type === 'absolute_change' ? 'Mức thay đổi tuyệt đối theo sản phẩm' : 'Phần trăm thay đổi theo sản phẩm'}>
    {points.map((point) => <button type="button" className="csv-chart-row" key={point.key} onClick={() => onSelect(point.row)} aria-label={`Xem bằng chứng của ${point.label}`}>
    <strong className="csv-chart-app-name">{point.label}</strong>
      {type === 'baseline_current' ? <div className="csv-chart-period-pair">
        {[{ name: 'Kỳ trước', amount: point.baseline, source: point.row.baseline, cls: 'baseline' }, { name: 'Kỳ hiện tại', amount: point.current, source: point.row.current, cls: 'current' }].map((item) => <div className={`csv-chart-measure ${item.cls}`} key={item.name}>
          <span>{item.name} · {item.source ? periodLabel(item.source) : 'Chưa có dữ liệu'}</span><i><b style={{ width: `${Math.max(0, (item.amount ?? 0) / max * 100)}%` }} /></i><em>{formatQuantitativeValue(item.amount, item.source?.unit ?? unit)}</em>
        </div>)}
      </div> : <div className="csv-chart-change">
        <span>{type === 'absolute_change' ? 'Mức thay đổi' : 'Phần trăm thay đổi'}</span>
        <div className="csv-chart-zero-track"><i style={{ left: '50%' }} /><b className={(value(point) ?? 0) < 0 ? 'negative' : (value(point) ?? 0) > 0 ? 'positive' : 'zero'} style={{ width: `${Math.abs(value(point) ?? 0) / max * 48}%`, left: (value(point) ?? 0) < 0 ? `${50 - Math.abs(value(point) ?? 0) / max * 48}%` : '50%' }} /></div>
        <em>{type === 'absolute_change' ? formatSignedQuantitativeValue(value(point), suffix) : `${(value(point) ?? 0) > 0 ? '+' : ''}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value(point) ?? 0)}${suffix}`}</em>
      </div>}
      <small>Xem bằng chứng · {point.row.evidence.length} phép đo nguồn</small>
    </button>)}
  </div>;
}

function ComparisonTable({ rows, unit }: { rows: QuantitativeComparisonRow[]; unit: string }) {
  const statusLabel = (status: string) => ({ comparable: 'Có thể đối chiếu', missing_baseline: 'Thiếu kỳ trước', missing_current: 'Thiếu kỳ hiện tại', ambiguous_identity: 'Danh tính chưa rõ', invalid_observation: 'Phép đo cần xem lại' }[status] || status.replaceAll('_', ' '));
  return <div className="comparison-table-scroll" role="region" aria-label="Bảng so sánh đầy đủ các sản phẩm" tabIndex={0}><table className="comparison-table"><thead><tr><th>Sản phẩm từ nguồn</th><th>Kỳ trước</th><th>Kỳ hiện tại</th><th>Mức thay đổi</th><th>Phần trăm thay đổi</th><th>Độ bao phủ</th><th>Bằng chứng</th></tr></thead><tbody>{rows.map((row) => <tr key={row.entity_key}><th scope="row">{row.entity_name}<small>{row.matched_by === 'provider_source_id' ? row.entity_key : 'Không có mã nguồn ổn định · không tự ghép'}</small></th>
    <td>{row.baseline ? <><strong>{formatQuantitativeValue(row.baseline.value, row.baseline.unit)}</strong><small>{row.baseline.filename} · {periodLabel(row.baseline)}</small></> : 'Chưa có dữ liệu'}</td>
    <td>{row.current ? <><strong>{formatQuantitativeValue(row.current.value, row.current.unit)}</strong><small>{row.current.filename} · {periodLabel(row.current)}</small></> : 'Chưa có dữ liệu'}</td>
    <td>{row.absolute_change === null ? 'Chưa có căn cứ tính' : <><strong>{formatSignedQuantitativeValue(row.absolute_change, row.change_unit ?? unit)}</strong><small>{row.formula}</small></>}</td>
    <td>{row.percentage_change === null ? <span title={row.percentage_change_unavailable_reason ?? row.reasons.join(' ')}>Chưa có căn cứ tính{row.percentage_change_unavailable_reason && <small>{row.percentage_change_unavailable_reason}</small>}</span> : `${row.percentage_change > 0 ? '+' : ''}${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(row.percentage_change)}%`}</td>
    <td><span className="comparison-row-status">{statusLabel(row.status)}</span>{row.reasons.length > 0 && <details><summary>Lý do</summary>{row.reasons.map((reason) => <p key={reason}>{reason}</p>)}</details>}</td>
    <td>{row.evidence.map((source, index) => <div className="comparison-evidence" key={`${source.dataset_id}-${source.source_row_number}-${index}`}><span>{source.filename} · dòng {source.source_row_number ?? 'chưa rõ'} · {source.verification_status === 'verified' ? 'Đã xác minh độc lập' : 'Chưa xác minh độc lập'}</span>{source.source_reference && <a href={source.source_reference} target="_blank" rel="noreferrer">Mở nguồn</a>}{source.report_id && <a href={`/reports/${source.report_id}`}>Mở báo cáo</a>}{source.metadata_provenance && <details><summary>Nguồn thông tin phạm vi</summary><ul>{Object.entries(source.metadata_provenance).map(([field, info]) => <li key={field}>{field}: {info.value ?? 'Chưa rõ'} · {info.basis.replaceAll('_', ' ')}{info.source_url && <> · <a href={info.source_url} target="_blank" rel="noreferrer">Tài liệu tham khảo</a></>}</li>)}</ul></details>}</div>)}</td>
  </tr>)}</tbody></table></div>;
}

export function QuantitativeComparisonCharts({ result }: Props) {
  const [chartType, setChartType] = useState<ComparisonChartType>('baseline_current');
  const [display, setDisplay] = useState<'chart' | 'table'>('chart');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ComparisonChartSort>(() => defaultComparisonSort('baseline_current'));
  const [topN, setTopN] = useState<'10' | '25' | '50' | 'all'>('10');
  const [selectedRow, setSelectedRow] = useState<QuantitativeComparisonRow | null>(null);
  const points = useMemo(() => adaptComparisonForChart(result), [result]);
  const normalized = search.trim().toLocaleLowerCase();
  const rows = useMemo(() => sortComparisonPoints(points.filter((point) => !normalized || `${point.label} ${point.key} ${point.row.status}`.toLocaleLowerCase().includes(normalized)), sort).map((point) => point.row), [points, normalized, sort]);
  const eligible = points.filter((point) => chartEligible(point, chartType));
  const matchingEligible = eligible.filter((point) => !normalized || `${point.label} ${point.key}`.toLocaleLowerCase().includes(normalized));
  const chartPoints = sortComparisonPoints(matchingEligible, sort).slice(0, topN === 'all' ? undefined : Number(topN));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const [page, setPage] = useState(0);
  const visibleRows = rows.slice(Math.min(page, pageCount - 1) * pageSize, (Math.min(page, pageCount - 1) + 1) * pageSize);
  const changeValue = (point: ComparisonChartPoint) => chartType === 'percentage_change' ? point.percentageChange : point.absoluteChange;
  const increases = matchingEligible.filter((point) => (changeValue(point) ?? 0) > 0).length;
  const decreases = matchingEligible.filter((point) => (changeValue(point) ?? 0) < 0).length;
  const missingChart = result.rows.length - eligible.length;
  const sortLabel = comparisonSortLabel(sort, result.metric.unit);
  const selectionContext = sort === 'name'
    ? 'Đây là sắp xếp theo tên, không phải xếp hạng hiệu quả.'
    : 'Thứ tự chỉ phản ánh các tệp đã chọn, không đại diện toàn thị trường.';
  const sortOptions: Array<{ value: ComparisonChartSort; label: string }> = chartType === 'baseline_current'
    ? [{ value: 'current_desc', label: 'Giá trị kỳ hiện tại cao nhất' }, { value: 'baseline_desc', label: 'Giá trị kỳ trước cao nhất' }, { value: 'name', label: 'Tên sản phẩm A–Z' }]
    : chartType === 'absolute_change'
      ? [{ value: 'increase_desc', label: 'Mức tăng lớn nhất' }, { value: 'decrease_asc', label: 'Mức giảm lớn nhất' }]
      : [{ value: 'percentage_desc', label: 'Phần trăm tăng cao nhất' }, { value: 'percentage_asc', label: 'Phần trăm tăng thấp nhất' }];

  return <div className="csv-analytics-workspace">
    <p className="csv-chart-summary">Có thể đối chiếu {result.summary.comparable_apps} phép đo sản phẩm. Ở chế độ xem này, {increases} mục tăng và {decreases} mục giảm. Độ bao phủ: {result.summary.baseline_only_apps} chỉ có ở kỳ trước, {result.summary.current_only_apps} chỉ có ở kỳ hiện tại, {result.summary.missing_data_apps} thiếu dữ liệu hoặc danh tính chưa ổn định, {result.summary.invalid_observations} cần xem lại. Giá trị thiếu không được coi là 0.</p>
    <div className="csv-chart-toolbar">
      <label>Biểu đồ<select aria-label="Kiểu biểu đồ" value={chartType} onChange={(event) => { const nextType = event.target.value as ComparisonChartType; setChartType(nextType); setSort(defaultComparisonSort(nextType)); setSelectedRow(null); }}><option value="baseline_current">Kỳ trước và kỳ hiện tại</option><option value="absolute_change">Mức thay đổi tuyệt đối</option><option value="percentage_change">Phần trăm thay đổi</option></select></label>
      <label>Tìm sản phẩm<input aria-label="Tìm sản phẩm" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Nhập tên sản phẩm…" /></label>
      <label>Sắp xếp<select aria-label="Sắp xếp biểu đồ và bảng" value={sort} onChange={(event) => setSort(event.target.value as ComparisonChartSort)}>{sortOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      {display === 'chart' && <label>Số sản phẩm hiển thị<select aria-label="Số sản phẩm hiển thị" value={topN} onChange={(event) => setTopN(event.target.value as typeof topN)}><option value="10">10 sản phẩm</option><option value="25">25 sản phẩm</option><option value="50">50 sản phẩm</option><option value="all">Tất cả sản phẩm đủ điều kiện</option></select></label>}
      <button className="secondary-action" type="button" aria-pressed={display === 'table'} onClick={() => setDisplay(display === 'chart' ? 'table' : 'chart')}>{display === 'chart' ? 'Xem bảng đầy đủ' : 'Xem biểu đồ'}</button>
    </div>
    {display === 'chart' ? chartPoints.length ? <>
      <p className="csv-chart-selection-summary">Đang hiển thị {chartPoints.length}/{matchingEligible.length} sản phẩm đủ điều kiện{normalized ? ` khớp từ khóa này (tổng cộng ${eligible.length} sản phẩm đủ dữ liệu vẽ biểu đồ)` : ''}, sắp xếp theo {sortLabel}. {selectionContext} Bảng đầy đủ vẫn giữ tất cả {result.rows.length} dòng sản phẩm.</p>
      <div className="csv-chart-context"><strong>{result.metric.metric_definition}</strong><span>{result.geo} · {result.platform} · {periodLabel(result.baseline_period)} → {periodLabel(result.current_period)}</span><span>Số liệu từ nguồn vẫn chưa được xác minh, trừ khi nguồn xác nhận rõ.</span></div>
      <PairedChart points={chartPoints} type={chartType} unit={result.metric.unit ?? ''} onSelect={setSelectedRow} />
      {missingChart > 0 && <p className="csv-chart-note">Không vẽ {missingChart} dòng trong chế độ này vì thiếu cặp giá trị đủ điều kiện. Các dòng vẫn có trong bảng đầy đủ; giá trị thiếu không được coi là 0.</p>}
      {selectedRow && <EvidenceDetails row={selectedRow} />}
    </> : <div className="overview-empty"><strong>Chưa có giá trị hợp lệ để vẽ biểu đồ.</strong><p>{chartType === 'percentage_change' ? 'Chỉ hiển thị phần trăm thay đổi khi phép tính được xác nhận hợp lệ. Xem lý do chưa tính được trong bảng đầy đủ.' : chartType === 'absolute_change' ? 'Chưa có mức thay đổi tuyệt đối tương thích do hệ thống tính.' : 'Biểu đồ cần hai phép đo không âm, ghép cặp được. Xem các phép đo có dấu hoặc chưa đầy đủ trong bảng.'}</p><button type="button" className="secondary-action" onClick={() => setDisplay('table')}>Xem bảng đầy đủ</button></div>
      : <><div className="csv-table-summary">Đang hiển thị {visibleRows.length.toLocaleString()}/{rows.length.toLocaleString()} dòng sản phẩm. Giá trị và phép tính không khả dụng do dịch vụ so sánh trả về.</div><ComparisonTable rows={visibleRows} unit={result.metric.unit ?? ''} />{pageCount > 1 && <nav className="comparison-pagination" aria-label="Các trang của bảng so sánh"><button className="secondary-action" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Trước</button><span>Trang {Math.min(page + 1, pageCount)}/{pageCount}</span><button className="secondary-action" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Tiếp</button></nav>}</>}
    {result.metric_warnings.length > 0 && <details className="comparison-metric-warnings"><summary>Chi tiết kiểm tra chỉ số và nguồn</summary>{result.metric_warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}
  </div>;
}
