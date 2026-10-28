import { useMemo, useState } from 'react';
import type { QuantitativeDataset, QuantitativeObservation } from './api';
import { buildAnalyticsSelection, emptyAnalyticsFilters, type AnalyticsFilters, type AnalyticsRecord } from './analyticsSelection';

const PREVIEW_PAGE_SIZE = 20;

function unitLabel(unit: string | null | undefined): string {
  const key = unit?.trim().toLocaleLowerCase();
  if (key === 'download' || key === 'downloads') return 'lượt tải';
  if (key === 'user' || key === 'users') return 'người dùng';
  if (key === 'position' || key === 'positions') return 'vị trí';
  return unit || '';
}

function validationLabel(reason: string): string {
  const known: Record<string, string> = {
    'Missing exact numeric value.': 'Thiếu giá trị số chính xác.',
    'Missing unit.': 'Chưa có đơn vị đo.',
    'Missing period start.': 'Chưa có ngày bắt đầu kỳ.',
    'Missing period end.': 'Chưa có ngày kết thúc kỳ.',
    'Missing GEO.': 'Chưa có thị trường GEO.',
    'Missing platform.': 'Chưa có nền tảng hoặc môi trường.',
  };
  return known[reason] ?? reason;
}

type Props = {
  reportId: string;
  observations: QuantitativeObservation[];
  datasets: QuantitativeDataset[];
  onViewEvidence: (record: AnalyticsRecord) => void;
  onImportCsv: () => void;
};

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label className="analytics-filter"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}

function readinessLabel(record: AnalyticsRecord): string {
  if (record.duplicate) return 'Số liệu trùng lặp';
  if (!record.sourceValid) return 'Số liệu nguồn chưa đầy đủ';
  if (record.source === 'csv_dataset' && record.reportCompatible === false) return 'Hợp lệ trong CSV · khác phạm vi báo cáo';
  if (record.reportCompatible === null) return 'Chưa xác định độ phù hợp với báo cáo';
  if (record.comparisonGroupReady) return 'Thuộc nhóm có thể so sánh';
  if (record.comparisonReady) return 'Chưa có đối tượng tương thích để so sánh';
  return 'Số liệu độc lập hợp lệ';
}

function ObservationCard({ record, onViewEvidence }: { record: AnalyticsRecord; onViewEvidence: (record: AnalyticsRecord) => void }) {
  const row = record.observation;
  const entity = row.source_entity_name || row.entity_name || row.source_entity_id || row.entity_id || 'Chưa xác định đối tượng';
  const period = row.period_start && row.period_end ? `${row.period_start} – ${row.period_end}` : 'Chưa có kỳ đo';
  const sourceUrl = row.evidence_reference || row.source_reference;
  return <article className={`analytics-observation${record.exclusionReasons.length ? ' is-excluded' : ''}`}>
    <div className="analytics-observation-main">
      <div><span className="analytics-observation-entity">{entity}</span><h4>{row.metric_definition || row.metric_id || 'Chưa xác định chỉ số'}</h4></div>
      <strong className="analytics-observation-value">{row.value === null || row.value === undefined ? 'Chưa có dữ liệu' : String(row.value)} <small>{unitLabel(row.unit)}</small></strong>
    </div>
    <div className="analytics-observation-primary-action"><span className={`analytics-status-chip${record.sourceValid && !record.duplicate ? ' is-ready' : ' is-muted'}`}>{readinessLabel(record)}</span><button type="button" className="text-button" onClick={() => onViewEvidence(record)}>Xem bằng chứng</button></div>
    <details className="analytics-observation-details"><summary>Chi tiết phép đo, nguồn và kiểm tra</summary>
      <div className="analytics-observation-meta"><span>{[row.geo || 'Chưa có GEO', row.platform || 'Chưa có nền tảng', period, row.granularity || 'Chưa có chu kỳ đo'].join(' · ')}</span><span>{record.sourceName} · {record.sourceLabel}</span></div>
      <div className="analytics-observation-status"><span>{row.observation_type === 'reported' ? 'Do báo cáo cung cấp' : row.observation_type === 'imported' ? 'Nhập từ CSV' : 'Đã tính toán'} · {row.verification_status === 'verified' ? 'Đã xác minh độc lập' : 'Chưa xác minh'}</span>{record.exclusionReasons.length > 0 && <details><summary>Lý do chưa thể so sánh</summary><ul>{record.exclusionReasons.map((reason) => <li key={reason}>{validationLabel(reason)}</li>)}</ul></details>}</div>
      <div className="analytics-observation-actions">{sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Mở nguồn đã cung cấp</a>}{row.provenance_id && <small>Bản ghi nguồn · {record.sourceName}</small>}</div>
    </details>
  </article>;
}

export function AnalyticsDataSelection({ reportId, observations, datasets, onViewEvidence, onImportCsv }: Props) {
  const [filters, setFilters] = useState<AnalyticsFilters>(emptyAnalyticsFilters);
  const [previewQuery, setPreviewQuery] = useState('');
  const [previewLimit, setPreviewLimit] = useState(PREVIEW_PAGE_SIZE);
  const selection = useMemo(() => buildAnalyticsSelection(reportId, observations, datasets, filters), [reportId, observations, datasets, filters]);
  const options = selection.availableDimensions;
  const matchingObservations = useMemo(() => {
    const query = previewQuery.trim().toLocaleLowerCase();
    if (!query) return selection.selectedObservations;
    return selection.selectedObservations.filter(({ observation: row, sourceName }) => [row.source_entity_name, row.entity_name, row.source_entity_id, row.entity_id, row.metric_definition, row.metric_id, row.geo, row.platform, row.period_start, row.period_end, sourceName, row.value?.toString()].some((value) => value?.toLocaleLowerCase().includes(query)));
  }, [previewQuery, selection.selectedObservations]);
  const visibleObservations = matchingObservations.slice(0, previewLimit);
  const csvScopeOnlyGroups = selection.compatibleComparisonGroups.length > 0 && selection.compatibleComparisonGroups.every((group) => group.observations.every((record) => record.source === 'csv_dataset' && record.reportCompatible === false));
  const setFilter = (field: keyof AnalyticsFilters, value: string) => {
    setPreviewLimit(PREVIEW_PAGE_SIZE);
    setFilters((current) => ({ ...current, [field]: value }));
  };

  return <section className="research-panel analytics-selection" aria-labelledby="analytics-selection-title">
    <div className="analytics-selection-heading"><div><span className="field-label">SỐ LIỆU THUỘC BÁO CÁO NÀY</span><h3>Chọn số liệu phân tích</h3><p>Chọn quan sát từ báo cáo này và các bộ dữ liệu đã liên kết. Chỉ nhóm các số liệu khi định nghĩa, đơn vị, phương pháp, GEO, nền tảng, kỳ đo và chu kỳ đã biết tương thích.</p></div><button type="button" className="secondary-action" onClick={onImportCsv}>Nhập CSV</button></div>
    {selection.selectedObservations.length === 0 && selection.sourceProvenance.report === 0 && selection.sourceProvenance.csvDatasets === 0 ? <><div className="analytics-readiness" aria-label="Tóm tắt mức độ sẵn sàng dữ liệu"><div><strong>0</strong><span>Tổng quan sát</span></div><div><strong>0</strong><span>Nguồn hợp lệ</span></div><div><strong>0</strong><span>Phù hợp báo cáo</span></div><div><strong>0</strong><span>Đủ điều kiện so sánh</span></div><div><strong>0</strong><span>Nhóm so sánh</span></div><div><strong>0</strong><span>Chưa đầy đủ</span></div><div><strong>0</strong><span>Trùng lặp</span></div></div><div className="analytics-empty" role="status"><strong>Chưa có số liệu định lượng liên kết với báo cáo này.</strong><p>Nghiên cứu định tính vẫn sử dụng độc lập được. Số liệu sẽ xuất hiện tại đây khi được cung cấp; không bắt buộc phải có CSV.</p><button type="button" className="text-button" onClick={onImportCsv}>Liên kết tệp CSV với báo cáo</button></div></> : <>
      <div className="analytics-filters" aria-label="Bộ lọc số liệu định lượng">
        <SelectFilter label="Chỉ số" value={filters.metric} onChange={(value) => setFilter('metric', value)} options={[{ value: 'all', label: 'Tất cả chỉ số' }, ...options.metrics.map((value) => ({ value, label: value }))]} />
        <SelectFilter label="GEO" value={filters.geo} onChange={(value) => setFilter('geo', value)} options={[{ value: 'all', label: 'Tất cả GEO' }, ...options.geos.map((value) => ({ value, label: value }))]} />
        <SelectFilter label="Nền tảng" value={filters.platform} onChange={(value) => setFilter('platform', value)} options={[{ value: 'all', label: 'Tất cả nền tảng' }, ...options.platforms.map((value) => ({ value, label: value }))]} />
        <SelectFilter label="Kỳ" value={filters.period} onChange={(value) => setFilter('period', value)} options={[{ value: 'all', label: 'Tất cả các kỳ' }, ...options.periods.map(({ key, label }) => ({ value: key, label }))]} />
        <SelectFilter label="Đối tượng" value={filters.entity} onChange={(value) => setFilter('entity', value)} options={[{ value: 'all', label: 'Tất cả đối tượng' }, ...options.entities.map(({ key, label }) => ({ value: key, label }))]} />
        <SelectFilter label="Nguồn dữ liệu" value={filters.source} onChange={(value) => setFilter('source', value)} options={options.sources.map(({ key, label }) => ({ value: key, label }))} />
        <SelectFilter label="Mức độ sẵn sàng" value={filters.readiness} onChange={(value) => setFilter('readiness', value)} options={[
          { value: 'all', label: 'Tất cả trạng thái' }, { value: 'complete', label: 'Số liệu hợp lệ' },
          { value: 'scope_compatible', label: 'Quan sát phù hợp báo cáo' }, { value: 'comparison_ready', label: 'Số liệu trong nhóm tương thích' },
          { value: 'excluded', label: 'Không thuộc so sánh của báo cáo' }, { value: 'scope_mismatch', label: 'Ngoài phạm vi báo cáo' }, { value: 'no_comparison_partner', label: 'Không có đối tượng tương thích' },
          { value: 'needs_review', label: 'Cần xem lại' }, { value: 'duplicate', label: 'Quan sát trùng lặp' },
        ]} />
        <button type="button" className="text-button analytics-reset" onClick={() => { setFilters(emptyAnalyticsFilters); setPreviewLimit(PREVIEW_PAGE_SIZE); setPreviewQuery(''); }} disabled={Object.values(filters).every((value) => value === 'all') && previewQuery === '' && previewLimit === PREVIEW_PAGE_SIZE}>Xóa bộ lọc</button>
      </div>
      <div className="analytics-readiness" aria-label="Tóm tắt mức độ sẵn sàng dữ liệu">
        <div><strong>{selection.readinessSummary.total}</strong><span>Quan sát đã chọn</span></div>
        <div><strong>{selection.readinessSummary.sourceValid}</strong><span>Nguồn hợp lệ</span></div>
        <div><strong>{selection.readinessSummary.reportCompatible}</strong><span>Phù hợp báo cáo</span></div>
        <div><strong>{selection.readinessSummary.eligibleIndividual}</strong><span>Số liệu đủ điều kiện</span></div>
        <div><strong>{selection.readinessSummary.comparisonGroups}</strong><span>Nhóm tương thích</span></div>
        <div><strong>{selection.readinessSummary.incomplete}</strong><span>Chưa đầy đủ</span></div>
        <div><strong>{selection.readinessSummary.duplicates}</strong><span>Trùng lặp</span></div>
      </div>
      <div className="analytics-selection-status" role="status"><strong>{selection.chartEligibility.eligible ? `${selection.chartEligibility.groupCount} nhóm so sánh tương thích` : 'Chưa có nhóm so sánh sẵn sàng với bộ lọc này.'}</strong><span>{csvScopeOnlyGroups ? 'Các số liệu này tương thích trong phạm vi gốc của CSV; chúng không đại diện cho phạm vi báo cáo đã liên kết.' : selection.chartEligibility.eligible ? `${selection.chartEligibility.observationCount} quan sát đủ điều kiện cho biểu đồ.` : 'Các số liệu hợp lệ vẫn có thể xem riêng lẻ. Nhóm so sánh cần tương thích về định nghĩa chỉ số, đơn vị, GEO, nền tảng, ngày, phương pháp và định danh đối tượng.'}</span></div>
      {selection.chartEligibility.limitations.length > 0 && <details className="analytics-limitations"><summary>Giới hạn kiểm tra và so sánh · {selection.chartEligibility.limitations.length}</summary><ul>{selection.chartEligibility.limitations.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
      <div className="analytics-record-heading"><div><h4>Số liệu đã chọn</h4><span>{matchingObservations.length.toLocaleString()} số liệu khớp bộ lọc hiện tại</span></div><label className="analytics-preview-search">Tìm trong số liệu<input value={previewQuery} onChange={(event) => { setPreviewQuery(event.target.value); setPreviewLimit(PREVIEW_PAGE_SIZE); }} placeholder="Sản phẩm, chỉ số, nguồn hoặc kỳ" /></label></div>
      {visibleObservations.length ? <div className="analytics-observation-list">{visibleObservations.map((record) => <ObservationCard key={record.key} record={record} onViewEvidence={onViewEvidence} />)}</div> : <p className="analytics-empty-filter" role="status">Không có quan sát khớp bộ lọc. Hãy đổi hoặc xóa bộ lọc để xem số liệu liên kết với báo cáo.</p>}
      {matchingObservations.length > visibleObservations.length && <button type="button" className="secondary-action" onClick={() => setPreviewLimit((limit) => limit + PREVIEW_PAGE_SIZE)}>Hiển thị thêm {Math.min(PREVIEW_PAGE_SIZE, matchingObservations.length - visibleObservations.length)} số liệu</button>}
      {selection.compatibleComparisonGroups.length > 0 && <details className="analytics-comparison-groups"><summary>Các nhóm so sánh tương thích · {selection.compatibleComparisonGroups.length}</summary>{selection.compatibleComparisonGroups.map((group) => <div key={group.key}><strong>{group.label}</strong><p>{group.entities.length} đối tượng · {group.periods.length} kỳ · {group.observations.length} quan sát. Không tính tổng hợp hoặc thay đổi dẫn xuất tại đây.</p></div>)}</details>}
      <p className="analytics-provenance-note">Nguồn: {selection.sourceProvenance.report} quan sát do báo cáo cung cấp · {selection.sourceProvenance.csvDatasets} quan sát từ CSV đã liên kết trong {selection.sourceProvenance.datasets.length} bộ dữ liệu gắn với báo cáo. Nhập CSV không đồng nghĩa với xác minh độc lập.</p>
    </>}
  </section>;
}
