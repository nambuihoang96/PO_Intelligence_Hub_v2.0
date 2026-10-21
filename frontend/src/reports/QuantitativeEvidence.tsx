import { useState } from 'react';
import type { QuantitativeObservation } from './api';
import { quantitativeLimitations, selectQuantitativeViews, type QuantitativeView } from './quantitativeAnalytics';

type Props = {
  observations: QuantitativeObservation[];
  onViewEvidence: (index: number) => void;
  onPrepareChartData?: () => void;
};

function formatValue(value: number | null, unit: string | null): string {
  const number = value === null ? 'Unknown' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
  return [number, unit].filter(Boolean).join(' ');
}

function displayValue(row: QuantitativeObservation): string {
  const value = formatValue(row.value, row.unit);
  return row.value !== null && row.value_precision === 'approximate' ? `≈${value}` : value;
}

function precisionLabel(row: QuantitativeObservation): string {
  return row.value_precision === 'approximate' ? 'Approximate · source-reported · unverified' : 'Exact as reported · unverified';
}

function periodKey(row: QuantitativeObservation): string {
  return `${row.period_start}|${row.period_end}`;
}

function periodLabel(row: QuantitativeObservation): string {
  return row.period_start === row.period_end ? row.period_start || 'Period not supplied' : `${row.period_start} – ${row.period_end}`;
}

function scopeOf(row: QuantitativeObservation): string {
  return [row.geo, row.platform, row.period_start && row.period_end ? periodLabel(row) : null].filter(Boolean).join(' · ');
}

function dateValue(value: string | null): number {
  if (!value) return Number.NaN;
  return Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
}

function ViewBody({ view, onViewEvidence, displayMode }: { view: QuantitativeView; onViewEvidence: Props['onViewEvidence']; displayMode: 'chart' | 'table' }) {
  if (view.kind === 'grouped_bar') {
    const periods = [...new Map(view.observations.map(({ row }) => [periodKey(row), row])).values()]
      .sort((a, b) => (a.period_start || '').localeCompare(b.period_start || '') || (a.period_end || '').localeCompare(b.period_end || ''));
    const entities = [...new Map(view.observations.map(({ row }) => [row.entity_id, { id: row.entity_id, name: row.entity_name || row.entity_id || 'Unknown entity' }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name));
    const max = Math.max(1, ...view.observations.map(({ row }) => row.value ?? 0));
    if (displayMode === 'table') return <div className="quant-matrix-scroll" role="region" aria-label="Exact reported values by entity and period" tabIndex={0}>
      <table className="quant-period-matrix"><thead><tr><th scope="col">Entity</th>{periods.map((period) => <th scope="col" key={periodKey(period)}>{periodLabel(period)}</th>)}</tr></thead>
        <tbody>{entities.map((entity) => <tr key={entity.id}><th scope="row">{entity.name}</th>{periods.map((period) => { const points = view.observations.filter(({ row }) => row.entity_id === entity.id && periodKey(row) === periodKey(period)); return <td key={periodKey(period)}>{points.length ? points.map(({ index, row }) => <button className="quant-matrix-point" key={index} onClick={() => onViewEvidence(index)} title={row.reported_value_text || undefined}><strong>{displayValue(row)}</strong><span>{precisionLabel(row)}</span><u>View evidence</u></button>) : <span className="quant-matrix-missing">No observation</span>}</td>; })}</tr>)}</tbody>
      </table>
    </div>;
    return <div className="quant-grouped-chart" aria-label={`Grouped bar comparison for ${view.label}`}>
      <div className="quant-bar-legend" aria-label="Period legend">{periods.map((period, index) => <span key={periodKey(period)}><i className={`quant-bar-swatch period-${index}`} />{periodLabel(period)}</span>)}</div>
      {entities.map((entity) => <section className="quant-bar-entity" key={entity.id} aria-label={entity.name}>
        <h5>{entity.name}</h5>
        <div className="quant-bar-points">{periods.map((period, periodIndex) => {
          const points = view.observations.filter(({ row }) => row.entity_id === entity.id && periodKey(row) === periodKey(period));
          return points.length ? points.map(({ index, row }) => <button type="button" className={`quant-bar-point period-${periodIndex}`} key={index} onClick={() => onViewEvidence(index)} title={row.reported_value_text || undefined} aria-label={`View evidence for ${entity.name}, ${periodLabel(row)}, ${displayValue(row)}, ${precisionLabel(row)}`}>
            <span className="quant-bar-period">{periodLabel(row)}</span><span className="quant-bar-track"><span className={row.value === 0 ? 'is-zero' : ''} style={{ width: `${row.value === 0 ? 0 : ((row.value ?? 0) / max) * 100}%` }} /></span><strong>{displayValue(row)}</strong><small>{precisionLabel(row)}</small>
          </button>) : <div className="quant-bar-missing" key={periodKey(period)}><span>{periodLabel(period)}</span><span>No observation</span></div>;
        })}</div>
      </section>)}
      {view.explanation && <p className="quant-chart-note">{view.explanation}</p>}
      <p className="quant-chart-note">Each bar is a source-reported observation. No intermediate values or growth rates are calculated.</p>
    </div>;
  }

  if (view.kind === 'period_matrix') {
    const periods = [...new Map(view.observations.map(({ row }) => [periodKey(row), row])).values()]
      .sort((a, b) => (a.period_start || '').localeCompare(b.period_start || '') || (a.period_end || '').localeCompare(b.period_end || ''));
    const entities = [...new Map(view.observations.map(({ row }) => [row.entity_id, { id: row.entity_id, name: row.entity_name || row.entity_id || 'Unknown entity' }])).values()]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return <>{view.explanation && <p className="quant-chart-note">{view.explanation}</p>}<div className="quant-matrix-scroll" role="region" aria-label="Entity and period comparison" tabIndex={0}>
      <table className="quant-period-matrix">
        <thead><tr><th scope="col">Entity</th>{periods.map((period) => <th scope="col" key={periodKey(period)}>{periodLabel(period)}</th>)}</tr></thead>
        <tbody>{entities.map((entity) => <tr key={entity.id}>
          <th scope="row">{entity.name}</th>
          {periods.map((period) => {
            const points = view.observations.filter(({ row }) => row.entity_id === entity.id && periodKey(row) === periodKey(period));
            return <td key={periodKey(period)}>{points.length ? points.map(({ index, row }) => <button className="quant-matrix-point" key={index} onClick={() => onViewEvidence(index)} aria-label={`View evidence for ${entity.name}, ${periodLabel(row)}, ${displayValue(row)}`}>
              <strong>{displayValue(row)}</strong><span>{precisionLabel(row)}</span><u>View evidence</u>
            </button>) : <span className="quant-matrix-missing">No observation</span>}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div></>;
  }

  if (view.kind === 'two_point') {
    const ordered = [...view.observations].sort((a, b) => (a.row.period_start || '').localeCompare(b.row.period_start || ''));
    const max = Math.max(1, ...ordered.map(({ row }) => row.value ?? 0));
    if (displayMode === 'table') return <div className="quant-matrix-scroll" role="region" aria-label="Two reported observations" tabIndex={0}><table className="quant-period-matrix"><thead><tr><th scope="col">Period</th><th scope="col">Value</th><th scope="col">Evidence</th></tr></thead><tbody>{ordered.map(({ index, row }) => <tr key={index}><th scope="row">{periodLabel(row)}</th><td>{displayValue(row)}</td><td><button type="button" className="text-button" onClick={() => onViewEvidence(index)}>View evidence</button><small>{precisionLabel(row)}</small></td></tr>)}</tbody></table></div>;
    return <div className="quant-two-point" aria-label="Two reported time points; not a continuous trend">
      {ordered.map(({ index, row }, pointIndex) => <button className={`quant-point-card period-${pointIndex}`} key={index} onClick={() => onViewEvidence(index)} title={row.reported_value_text || undefined}>
        <span>{periodLabel(row)}</span><span className="quant-two-point-track"><span className={row.value === 0 ? 'is-zero' : ''} style={{ width: `${row.value === 0 ? 0 : ((row.value ?? 0) / max) * 100}%` }} /></span><strong>{displayValue(row)}</strong>
        <small>{row.entity_name || row.entity_id} · {precisionLabel(row)}</small><u>View evidence</u>
      </button>)}
      <p className="quant-chart-note">Two reported points only; no intermediate values or growth rates are calculated.</p>
    </div>;
  }

  if (view.kind === 'time_series') {
    const ordered = [...view.observations].sort((a, b) => dateValue(a.row.period_start) - dateValue(b.row.period_start));
    const values = ordered.map(({ row }) => row.value as number);
    const dates = ordered.map(({ row }) => dateValue(row.period_start));
    const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
    const minDate = Math.min(...dates), maxDate = Math.max(...dates), dateRange = maxDate - minDate || 1;
    const points = ordered.map(({ row }) => ({
      x: 28 + ((dateValue(row.period_start) - minDate) / dateRange) * 544,
      y: 120 - (((row.value as number) - min) / range) * 88,
    }));
    const labelIndexes = [...new Set([0, Math.floor((ordered.length - 1) / 2), ordered.length - 1])];
    return <div className="quant-time-series">
      <svg viewBox="0 0 600 168" role="img" aria-label={`${view.label}, observations placed by actual date`}>
        <line x1="20" y1="126" x2="580" y2="126" />
        <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="5"><title>{ordered[index].row.period_start}: {displayValue(ordered[index].row)}</title></circle>)}
        {labelIndexes.map((index) => <text className="quant-axis-label" key={index} x={points[index].x} y="151" textAnchor={index === 0 ? 'start' : index === ordered.length - 1 ? 'end' : 'middle'}>{ordered[index].row.period_start}</text>)}
      </svg>
      <p>Dates are spaced chronologically. The connecting line does not represent intermediate measurements.</p>
      <div className="quant-point-list">{ordered.map(({ index, row }) => <button key={index} onClick={() => onViewEvidence(index)}><strong>{periodLabel(row)}</strong><span>{displayValue(row)}</span><small>{row.entity_name || row.entity_id} · {precisionLabel(row)} · View evidence</small></button>)}</div>
    </div>;
  }

  if (view.kind === 'ranking') {
    return <ol className="quant-ranking-list">{view.observations.map(({ index, row }) => <li key={index}><button onClick={() => onViewEvidence(index)}><span>{row.entity_name || row.entity_id}</span><strong>{displayValue(row)}</strong><small>{scopeOf(row)} · {precisionLabel(row)} · View evidence</small></button></li>)}</ol>;
  }

  if (view.kind === 'observation') {
    return <div className="quant-single-observations">{view.observations.map(({ index, row }) => <button key={index} onClick={() => onViewEvidence(index)}>
      <span>{row.entity_name || row.entity_id}</span><strong>{displayValue(row)}</strong><small>{scopeOf(row)} · {precisionLabel(row)} · View evidence</small>
    </button>)}</div>;
  }

  const values = view.observations.map(({ row }) => row.value ?? 0);
  const min = Math.min(0, ...values), max = Math.max(0, ...values), range = max - min || 1;
  const zero = min < 0 ? ((0 - min) / range) * 100 : 0;
  return <div className="quant-comparison" aria-label={`${view.label} entity comparison`}>
    {view.observations.map(({ index, row }) => <button className="quant-comparison-row" key={index} onClick={() => onViewEvidence(index)}>
      <span className="quant-comparison-entity">{row.entity_name || row.entity_id}</span>
      <span className="quant-comparison-track" aria-hidden="true" style={min < 0 ? { background: `linear-gradient(to right, #d7e1ee 0%, #d7e1ee ${zero}%, #e8eef6 ${zero}%, #e8eef6 100%)` } : undefined}><span className={row.value === 0 ? 'is-zero' : ''} style={{ left: `${zero}%`, width: `${row.value === 0 ? 0 : (Math.abs(row.value ?? 0) / range) * 100}%`, transform: (row.value ?? 0) < 0 ? 'translateX(-100%)' : undefined }} /></span>
      <strong>{displayValue(row)}</strong>
      <small>{scopeOf(row)} · {precisionLabel(row)} · View evidence</small>
    </button>)}
  </div>;
}

export function QuantitativeEvidence({ observations, onViewEvidence, onPrepareChartData }: Props) {
  const [displayModes, setDisplayModes] = useState<Record<string, 'chart' | 'table'>>({});
  const reportRows = observations.map((row, index) => ({ row, index })).filter(({ row }) => row.observation_type === 'reported');
  if (!reportRows.length) return <section className="research-panel quantitative-evidence quantitative-no-data" aria-labelledby="quantitative-evidence-title"><div className="quantitative-evidence-heading"><div><span className="field-label">CHATGPT REPORT · ORIGINAL TEXT PRESERVED</span><h3 id="quantitative-evidence-title">Quantitative findings</h3></div></div><p>This report does not contain structured numeric observations. PO Hub will not turn prose or chart images into numbers.</p>{onPrepareChartData && <button type="button" className="secondary-action" onClick={onPrepareChartData}>Prepare chart data from this report</button>}</section>;
  const rows = reportRows.map(({ row }) => row);
  const views = selectQuantitativeViews(rows).map((view) => ({ ...view, observations: view.observations.map((point) => ({ ...point, index: reportRows[point.index].index })) }));
  const limitations = quantitativeLimitations(rows);
  const metricNames = [...new Set(rows.map((row) => row.metric_definition || row.metric_id).filter(Boolean))];
  return <section className="research-panel quantitative-evidence" aria-labelledby="quantitative-evidence-title">
    <div className="quantitative-evidence-heading"><div><span className="field-label">SOURCE-REPORTED MEASUREMENTS · UNVERIFIED</span><h3 id="quantitative-evidence-title">Market Data &amp; Charts</h3><p>{metricNames.join(' · ') || 'Metric details not supplied'}</p></div><span className="quant-source-label">ChatGPT research</span></div>
    {views.length > 0 ? <div className="quantitative-views">{views.map((view, index) => { const key = `${view.kind}:${view.label}:${index}`; const displayMode = displayModes[key] || 'chart'; return <article className="quantitative-view" key={key}>
      <div className="quantitative-view-heading"><div><h4>{view.kind === 'comparison' || view.kind === 'grouped_bar' ? 'Entity comparison' : view.kind === 'period_matrix' ? 'Entity and period comparison' : view.kind === 'two_point' ? 'Two reported time points' : view.kind === 'time_series' ? 'Observed time series' : view.kind === 'ranking' ? 'Reported ranking positions' : 'Reported observation'}</h4><p>{view.label}</p></div><div className="quantitative-view-actions"><span>{view.observations.length} observations</span>{(view.kind === 'grouped_bar' || view.kind === 'two_point') && <button type="button" className="text-button" aria-pressed={displayMode === 'table'} onClick={() => setDisplayModes((current) => ({ ...current, [key]: displayMode === 'chart' ? 'table' : 'chart' }))}>{displayMode === 'chart' ? 'View table' : 'View chart'}</button>}</div></div>
      <p className="quant-scope-line">{scopeOf(view.observations[0].row)} · Source-reported · unverified</p>
      <ViewBody view={view} onViewEvidence={onViewEvidence} displayMode={displayMode} />
    </article>; })}</div> : <div className="quantitative-insufficient"><strong>No compatible chart can be shown yet.</strong><p>The original observations remain available below with validation reasons. No values have been inferred.</p>{onPrepareChartData && <button className="secondary-action" type="button" onClick={onPrepareChartData}>Prepare chart data from this report</button>}</div>}
    {limitations.length > 0 && <details className="quantitative-limitations"><summary>Data limitations · {limitations.length}</summary><ul>{limitations.map((reason, index) => <li key={`${reason}:${index}`}>{reason}</li>)}</ul></details>}
    <div className="quantitative-observation-details"><strong>Observation records</strong>{reportRows.map(({ row, index }) => <details key={`${row.metric_id}:${index}`} id={`quant-observation-${index}`}>
      <summary>{row.metric_definition || row.metric_id || 'Unknown metric'} · {row.entity_name || row.entity_id || 'Entity not resolved'} · {displayValue(row)}</summary>
      <p>{scopeOf(row) || 'Scope not provided'} · Report-supplied · Unverified</p>
      {row.reported_value_text && <p>Original reported value: “{row.reported_value_text}” · {precisionLabel(row)}</p>}
      {row.validation_reasons.length > 0 && <ul>{row.validation_reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}</ul>}
      {row.evidence_reference && <a href={row.evidence_reference} target="_blank" rel="noreferrer">Open source reference</a>}
      {row.source_reference && row.source_reference !== row.evidence_reference && <a href={row.source_reference} target="_blank" rel="noreferrer">Open data source</a>}
    </details>)}</div>
  </section>;
}
