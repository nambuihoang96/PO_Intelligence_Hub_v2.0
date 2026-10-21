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
      const next = await reportApi.revalidateQuantitativeDataset(dataset.report_id, dataset.id);
      onRevalidated(next);
      setFeedback('Dataset đã được kiểm tra lại từ CSV gốc. ID dataset và liên kết report được giữ nguyên.');
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : 'Không thể kiểm tra lại dataset. Dữ liệu hiện tại vẫn được giữ nguyên.');
    } finally { setBusy(false); }
  }

  function observationsForCell(row: AppRow, metricId: string) {
    return row.observations.filter((item) => item.metric_id === metricId);
  }

  function renderCell(row: AppRow, metricId: string) {
    const matches = observationsForCell(row, metricId);
    if (!matches.length) return <span className="dataset-unknown">Unknown</span>;
    if (matches.length > 1) return <button type="button" className="dataset-cell-ambiguous" onClick={() => { setSelected(null); setAmbiguousCell({ entity: row.name, metric: metricNames.find(([id]) => id === metricId)?.[1] || metricId, observations: matches }); }}>{matches.length} observations · choose</button>;
    const item = matches[0];
    return <button type="button" className="dataset-value-button" onClick={() => { setAmbiguousCell(null); setSelected(item); }} aria-label={`Inspect ${row.name}, ${metricNames.find(([id]) => id === metricId)?.[1] || metricId}: ${displayValue(item)}`}>{displayValue(item)}</button>;
  }

  return <section className="dataset-explorer" aria-label={`Data explorer ${dataset.filename}`}>
    <header className="dataset-explorer-header"><div><span className="field-label">CSV DATA EXPLORER</span><h4>{dataset.filename}</h4><p>Measurements remain in the CSV's original scope. Report compatibility is assessed separately.</p></div><button type="button" className="secondary-action" onClick={() => void revalidate()} disabled={busy}>{busy ? 'Revalidating…' : 'Revalidate dataset'}</button></header>
    <div className="dataset-summary" aria-label="Dataset summary">
      <div><strong>{sourceRows.toLocaleString()}</strong><span>Source rows</span></div>
      <div><strong>{dataset.source_apps ?? distinctSources}</strong><span>Source apps</span></div>
      <div><strong>{dataset.recognized_metrics ?? metricNames.length}</strong><span>Metrics</span></div>
      <div><strong>{dataset.analysis_ready_observations ?? dataset.complete_observations ?? 0}</strong><span>Source-valid observations</span></div>
      <div><strong>{dataset.report_compatible_observations ?? dataset.scope_compatible_observations ?? 0}</strong><span>Report-compatible</span></div>
      <div><strong>{dataset.dataset_comparison_ready_observations ?? 0}</strong><span>Comparison candidates · need compatible peers</span></div>
      <div><strong>{dataset.incomplete_observations ?? Math.max(0, allObservations.length - (dataset.complete_observations ?? 0))}</strong><span>Incomplete</span></div>
    </div>
    <div className={`dataset-compatibility ${reportIncompatible ? 'is-incompatible' : ''}`} role="status">
      {reportIncompatible ? `CSV data remains available for ${datasetGeos} / ${datasetPlatforms} analysis. It cannot be used directly as ${reportScope?.geo || 'the report GEO'} / ${reportScope?.platform || 'the report platform'} measurements. No scope conversion is applied.` : dataset.compatibility_status === 'compatible' ? 'Dataset scope is compatible with this report.' : 'Some observations have incomplete or report-incompatible scope; each measurement remains available with its original details.'}
      <span>{[...new Set(allObservations.flatMap((item) => item.report_compatibility_reasons ?? []))].slice(0, 3).join(' ')}</span>
    </div>
    <div className="dataset-explorer-controls">
      <label>Search app or source ID<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search…" /></label>
      <label>GEO<select value={geo} onChange={(event) => { setGeo(event.target.value); setPage(1); }}><option value="all">All GEOs</option>{geos.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Platform<select value={platform} onChange={(event) => { setPlatform(event.target.value); setPage(1); }}><option value="all">All platforms</option>{platforms.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Period<select value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1); }}><option value="all">All periods</option>{periods.map((item) => <option key={item} value={item}>{item.replace('|', ' – ')}</option>)}</select></label>
      <label>Sort by<select value={sortMetric} onChange={(event) => setSortMetric(event.target.value)}><option value="">App name</option>{metricNames.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    </div>
    <fieldset className="dataset-metric-picker"><legend>Metric columns</legend>{metricNames.map(([id, name]) => <label key={id}><input type="checkbox" checked={selectedMetrics.includes(id)} onChange={(event) => { setMetrics((current) => { const next = current.length ? current : metricNames.map(([metricId]) => metricId); return event.target.checked ? [...next, id] : next.filter((item) => item !== id); }); }} />{name}</label>)}</fieldset>
    <div className="dataset-table-scroll"><table className="dataset-explorer-table"><thead><tr><th>App / source identity</th>{metricNames.filter(([id]) => selectedMetrics.includes(id)).map(([id, name]) => <th key={id}>{name}</th>)}</tr></thead><tbody>{pageRows.map((row) => <tr key={row.key}><th scope="row"><button type="button" className="dataset-app-button" onClick={() => { setAmbiguousCell(null); setSelected(row.observations[0]); }}>{row.name}</button><small>{row.key} · {row.observations[0]?.entity_resolution_state === 'matched' ? 'Matched to report' : 'Source-only entity'}</small></th>{metricNames.filter(([id]) => selectedMetrics.includes(id)).map(([id]) => <td key={id}>{renderCell(row, id)}</td>)}</tr>)}</tbody></table>
      {!pageRows.length && <p className="dataset-empty">No apps match these filters.</p>}</div>
    {appRows.length > pageRows.length && <button type="button" className="secondary-action" onClick={() => setPage((current) => current + 1)}>Load {Math.min(PAGE_SIZE, appRows.length - pageRows.length)} more apps</button>}
    {ambiguousCell && <section className="dataset-observation-detail" aria-live="polite" aria-label="Choose a specific source measurement"><div><h5>{ambiguousCell.entity} · {ambiguousCell.metric}</h5><button type="button" className="text-button" onClick={() => setAmbiguousCell(null)}>Close choices</button></div><p>Choose the original measurement to inspect. Values are not combined.</p><ul>{ambiguousCell.observations.map((item, index) => <li key={`${item.source_entity_id}-${item.period_start}-${item.period_end}-${item.geo}-${item.platform}-${index}`}><button type="button" className="text-button" onClick={() => { setSelected(item); setAmbiguousCell(null); }}>{displayValue(item)} · {item.geo || 'GEO unknown'} / {item.platform || 'platform unknown'} · {item.period_start || 'period unknown'} – {item.period_end || 'period unknown'} · {item.granularity || 'granularity unknown'} · {item.methodology || 'methodology not provided'}</button></li>)}</ul></section>}
    {selected && <section className="dataset-observation-detail" aria-live="polite"><div><h5>{selected.source_entity_name || selected.entity_name || selected.source_entity_id || 'Observation details'}</h5><button type="button" className="text-button" onClick={() => setSelected(null)}>Close</button></div><dl><dt>Metric</dt><dd>{selected.metric_definition || selected.metric_id || 'Unknown'}</dd><dt>Value</dt><dd>{displayValue(selected)}</dd><dt>Source identity</dt><dd>{selected.source_provider || 'CSV'} · {selected.source_entity_id || 'Unknown ID'}</dd><dt>GEO / platform</dt><dd>{selected.geo || 'Unknown'} / {selected.platform || 'Unknown'}</dd><dt>Period / granularity</dt><dd>{selected.period_start || 'Unknown'} – {selected.period_end || 'Unknown'} · {selected.granularity || 'Unknown'}</dd><dt>Methodology</dt><dd>{selected.methodology || 'Not provided'}</dd><dt>Validity</dt><dd>{selected.analysis_ready ? 'Ready for dataset analysis' : 'Incomplete'} · {selected.verification_status === 'verified' ? 'Independently verified' : 'Unverified import'}</dd><dt>Report link</dt><dd>{selected.report_compatibility || 'unknown'}{selected.entity_id ? ` · ${selected.entity_id}` : ' · not linked to a report entity'}</dd></dl>{(selected.source_validation_reasons?.length || selected.report_compatibility_reasons?.length) ? <details><summary>Validation details</summary><ul>{[...(selected.source_validation_reasons ?? []), ...(selected.report_compatibility_reasons ?? [])].map((reason, index) => <li key={index}>{reason}</li>)}</ul></details> : null}{selectedReference && <a href={selectedReference} target="_blank" rel="noreferrer">Open supplied evidence / source</a>}<p>Original CSV: {dataset.filename} · row provenance preserved</p></section>}
    {feedback && <p className="research-success" role="status">{feedback}</p>}{failure && <p className="research-alert" role="alert">{failure}</p>}
    <details className="dataset-raw-advanced"><summary>Advanced: inspect imported observations</summary><div className="dataset-raw-list">{allObservations.map((item, index) => <details key={`${item.source_entity_id}-${item.metric_id}-${index}`}><summary>{item.source_entity_name || item.entity_name || item.source_entity_id} · {item.metric_definition || item.metric_id} · {displayValue(item)}</summary><p>{item.source_entity_id} · {item.geo || 'GEO unknown'} · {item.platform || 'Platform unknown'} · {item.period_start || '?'} – {item.period_end || '?'}</p>{item.validation_reasons.map((reason, reasonIndex) => <div key={reasonIndex}>{reason}</div>)}</details>)}</div></details>
  </section>;
}
