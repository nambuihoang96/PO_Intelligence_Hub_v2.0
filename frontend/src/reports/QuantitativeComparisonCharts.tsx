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
  return <div className="csv-chart-evidence" aria-label={`Evidence for ${row.entity_name}`}>
    <h4>{row.entity_name} · original observations</h4>
    <div className="csv-chart-source-grid">{row.evidence.map((source, index) => <article key={`${source.dataset_id}:${source.source_row_number}:${index}`}>
      <strong>{source.filename}</strong><p>{formatQuantitativeValue(source.value, source.unit)} · {periodLabel(source)}</p>
      <p>{source.geo ?? 'GEO unknown'} · {source.platform ?? 'Platform unknown'} · {source.verification_status.replaceAll('_', ' ')}</p>
      <p>{source.methodology || 'Methodology not supplied'} · row {source.source_row_number ?? 'unknown'}</p>
      {source.source_reference && <a href={source.source_reference} target="_blank" rel="noreferrer">Open original source</a>}
      <a href={`/reports/${source.report_id}`}>Open source report</a>
      {source.metadata_provenance && <details><summary>Metadata provenance</summary><ul>{Object.entries(source.metadata_provenance).map(([field, info]) => <li key={field}>{field}: {info.value ?? 'Unknown'} · {info.basis.replaceAll('_', ' ')}{info.source_url && <> · <a href={info.source_url} target="_blank" rel="noreferrer">documentation</a></>}</li>)}</ul></details>}
    </article>)}</div>
    {row.formula && <p>Backend formula: {row.formula}</p>}
    {row.reasons.length > 0 && <ul>{row.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
  </div>;
}

function PairedChart({ points, type, unit, onSelect }: { points: ComparisonChartPoint[]; type: ComparisonChartType; unit: string; onSelect: (row: QuantitativeComparisonRow) => void }) {
  const max = Math.max(1, ...points.flatMap((point) => type === 'baseline_current' ? [point.baseline ?? 0, point.current ?? 0] : [Math.abs(type === 'absolute_change' ? point.absoluteChange ?? 0 : point.percentageChange ?? 0)]));
  const signed = type !== 'baseline_current';
  const value = (point: ComparisonChartPoint) => type === 'absolute_change' ? point.absoluteChange : point.percentageChange;
  const suffix = type === 'percentage_change' ? '%' : unit;
  return <div className={`csv-chart-bars ${signed ? 'is-signed' : ''}`} aria-label={type === 'baseline_current' ? 'Baseline and current values by app' : type === 'absolute_change' ? 'Absolute change by app' : 'Percentage change by app'}>
    {points.map((point) => <button type="button" className="csv-chart-row" key={point.key} onClick={() => onSelect(point.row)} aria-label={`Inspect evidence for ${point.label}`}>
      <strong className="csv-chart-app-name">{point.label}</strong>
      {type === 'baseline_current' ? <div className="csv-chart-period-pair">
        {[{ name: 'Baseline', amount: point.baseline, source: point.row.baseline, cls: 'baseline' }, { name: 'Current', amount: point.current, source: point.row.current, cls: 'current' }].map((item) => <div className={`csv-chart-measure ${item.cls}`} key={item.name}>
          <span>{item.name} · {item.source ? periodLabel(item.source) : 'Missing'}</span><i><b style={{ width: `${Math.max(0, (item.amount ?? 0) / max * 100)}%` }} /></i><em>{formatQuantitativeValue(item.amount, item.source?.unit ?? unit)}</em>
        </div>)}
      </div> : <div className="csv-chart-change">
        <span>{type === 'absolute_change' ? 'Absolute change' : 'Percentage change'}</span>
        <div className="csv-chart-zero-track"><i style={{ left: '50%' }} /><b className={(value(point) ?? 0) < 0 ? 'negative' : (value(point) ?? 0) > 0 ? 'positive' : 'zero'} style={{ width: `${Math.abs(value(point) ?? 0) / max * 48}%`, left: (value(point) ?? 0) < 0 ? `${50 - Math.abs(value(point) ?? 0) / max * 48}%` : '50%' }} /></div>
        <em>{type === 'absolute_change' ? formatSignedQuantitativeValue(value(point), suffix) : `${(value(point) ?? 0) > 0 ? '+' : ''}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value(point) ?? 0)}${suffix}`}</em>
      </div>}
      <small>View evidence · {point.row.evidence.length} source observations</small>
    </button>)}
  </div>;
}

function ComparisonTable({ rows, unit }: { rows: QuantitativeComparisonRow[]; unit: string }) {
  return <div className="comparison-table-scroll" role="region" aria-label="Full app comparison table" tabIndex={0}><table className="comparison-table"><thead><tr><th>Source app</th><th>Baseline</th><th>Current</th><th>Absolute change</th><th>Percent change</th><th>Coverage</th><th>Evidence</th></tr></thead><tbody>{rows.map((row) => <tr key={row.entity_key}><th scope="row">{row.entity_name}<small>{row.matched_by === 'provider_source_id' ? row.entity_key : 'No stable provider ID · not auto-matched'}</small></th>
    <td>{row.baseline ? <><strong>{formatQuantitativeValue(row.baseline.value, row.baseline.unit)}</strong><small>{row.baseline.filename} · {periodLabel(row.baseline)}</small></> : 'Missing'}</td>
    <td>{row.current ? <><strong>{formatQuantitativeValue(row.current.value, row.current.unit)}</strong><small>{row.current.filename} · {periodLabel(row.current)}</small></> : 'Missing'}</td>
    <td>{row.absolute_change === null ? 'Unavailable' : <><strong>{formatSignedQuantitativeValue(row.absolute_change, row.change_unit ?? unit)}</strong><small>{row.formula}</small></>}</td>
    <td>{row.percentage_change === null ? <span title={row.percentage_change_unavailable_reason ?? row.reasons.join(' ')}>Unavailable{row.percentage_change_unavailable_reason && <small>{row.percentage_change_unavailable_reason}</small>}</span> : `${row.percentage_change > 0 ? '+' : ''}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(row.percentage_change)}%`}</td>
    <td><span className="comparison-row-status">{row.status.replaceAll('_', ' ')}</span>{row.reasons.length > 0 && <details><summary>Why</summary>{row.reasons.map((reason) => <p key={reason}>{reason}</p>)}</details>}</td>
    <td>{row.evidence.map((source, index) => <div className="comparison-evidence" key={`${source.dataset_id}-${source.source_row_number}-${index}`}><span>{source.filename} · row {source.source_row_number ?? 'unknown'} · {source.verification_status}</span>{source.source_reference && <a href={source.source_reference} target="_blank" rel="noreferrer">Open source</a>}<a href={`/reports/${source.report_id}`}>Open report</a>{source.metadata_provenance && <details><summary>Metadata provenance</summary><ul>{Object.entries(source.metadata_provenance).map(([field, info]) => <li key={field}>{field}: {info.value ?? 'Unknown'} · {info.basis.replaceAll('_', ' ')}{info.source_url && <> · <a href={info.source_url} target="_blank" rel="noreferrer">documentation</a></>}</li>)}</ul></details>}</div>)}</td>
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
    ? 'This is an alphabetical selection, not a performance ranking.'
    : 'Ranking reflects the selected exports, not the whole market.';
  const sortOptions: Array<{ value: ComparisonChartSort; label: string }> = chartType === 'baseline_current'
    ? [{ value: 'current_desc', label: 'Highest current value' }, { value: 'baseline_desc', label: 'Highest baseline value' }, { value: 'name', label: 'App name A–Z' }]
    : chartType === 'absolute_change'
      ? [{ value: 'increase_desc', label: 'Largest increase' }, { value: 'decrease_asc', label: 'Largest decrease' }]
      : [{ value: 'percentage_desc', label: 'Highest percentage change' }, { value: 'percentage_asc', label: 'Lowest percentage change' }];

  return <div className="csv-analytics-workspace">
    <p className="csv-chart-summary">{result.summary.comparable_apps} app measurements are comparable. {increases} increased and {decreases} decreased in the selected view. Coverage: {result.summary.baseline_only_apps} baseline-only, {result.summary.current_only_apps} current-only, {result.summary.missing_data_apps} with missing or unstable identity, and {result.summary.invalid_observations} needing review. Missing values are never treated as zero.</p>
    <div className="csv-chart-toolbar">
      <label>Visualization<select aria-label="Chart type" value={chartType} onChange={(event) => { const nextType = event.target.value as ComparisonChartType; setChartType(nextType); setSort(defaultComparisonSort(nextType)); setSelectedRow(null); }}><option value="baseline_current">Baseline vs current</option><option value="absolute_change">Absolute change</option><option value="percentage_change">Percentage change</option></select></label>
      <label>Find app<input aria-label="Find app" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search apps" /></label>
      <label>Sort<select aria-label="Sort chart and table" value={sort} onChange={(event) => setSort(event.target.value as ComparisonChartSort)}>{sortOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      {display === 'chart' && <label>Show apps<select aria-label="Apps shown" value={topN} onChange={(event) => setTopN(event.target.value as typeof topN)}><option value="10">10 apps</option><option value="25">25 apps</option><option value="50">50 apps</option><option value="all">All eligible apps</option></select></label>}
      <button className="secondary-action" type="button" aria-pressed={display === 'table'} onClick={() => setDisplay(display === 'chart' ? 'table' : 'chart')}>{display === 'chart' ? 'View full table' : 'View chart'}</button>
    </div>
    {display === 'chart' ? chartPoints.length ? <>
      <p className="csv-chart-selection-summary">Showing {chartPoints.length} of {matchingEligible.length} eligible apps{normalized ? ` matching this search (${eligible.length} chart-eligible in total)` : ''}, sorted by {sortLabel}. {selectionContext} The full table retains all {result.rows.length} app rows.</p>
      <div className="csv-chart-context"><strong>{result.metric.metric_definition}</strong><span>{result.geo} · {result.platform} · {periodLabel(result.baseline_period)} → {periodLabel(result.current_period)}</span><span>Source measurements remain unverified unless the source explicitly verifies them.</span></div>
      <PairedChart points={chartPoints} type={chartType} unit={result.metric.unit ?? ''} onSelect={setSelectedRow} />
      {missingChart > 0 && <p className="csv-chart-note">{missingChart} rows are not charted in this view because a paired, eligible value is unavailable. They remain in the full table; missing values are not treated as zero.</p>}
      {selectedRow && <EvidenceDetails row={selectedRow} />}
    </> : <div className="overview-empty"><strong>No valid values for this chart.</strong><p>{chartType === 'percentage_change' ? 'Percentage changes are shown only when M2 confirms the calculation is valid. Review unavailable reasons in the full table.' : chartType === 'absolute_change' ? 'No compatible backend-derived absolute changes are available.' : 'Baseline/current bars require two non-negative, paired measurements. Review signed or incomplete observations in the table.'}</p><button type="button" className="secondary-action" onClick={() => setDisplay('table')}>Review full table</button></div>
      : <><div className="csv-table-summary">Showing {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()} app rows. Values and unavailable calculations are returned by the comparison service.</div><ComparisonTable rows={visibleRows} unit={result.metric.unit ?? ''} />{pageCount > 1 && <nav className="comparison-pagination" aria-label="Comparison table pages"><button className="secondary-action" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><span>Page {Math.min(page + 1, pageCount)} of {pageCount}</span><button className="secondary-action" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</button></nav>}</>}
    {result.metric_warnings.length > 0 && <details className="comparison-metric-warnings"><summary>Metric and source validation details</summary>{result.metric_warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}
  </div>;
}
