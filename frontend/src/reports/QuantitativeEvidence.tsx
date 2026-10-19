import type { QuantitativeObservation } from './api';
import { quantitativeLimitations, selectQuantitativeViews, type QuantitativeView } from './quantitativeAnalytics';

type Props = {
  observations: QuantitativeObservation[];
  onViewEvidence: (index: number) => void;
};

function formatValue(value: number | null, unit: string | null): string {
  const number = value === null ? 'Unknown' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
  return [number, unit].filter(Boolean).join(' ');
}

function scopeOf(row: QuantitativeObservation): string {
  return [row.geo, row.platform, row.period_start && row.period_end ? `${row.period_start} – ${row.period_end}` : null].filter(Boolean).join(' · ');
}

function ViewBody({ view, onViewEvidence }: { view: QuantitativeView; onViewEvidence: Props['onViewEvidence'] }) {
  if (view.kind === 'two_point') {
    return <div className="quant-two-point" aria-label="Two reported time points; not a continuous trend">
      {view.observations.map(({ index, row }) => <button className="quant-point-card" key={index} onClick={() => onViewEvidence(index)}>
        <span>{row.period_start} – {row.period_end}</span><strong>{formatValue(row.value, row.unit)}</strong>
        <small>{row.entity_name || row.entity_id} · Reported, unverified</small><u>View evidence</u>
      </button>)}
    </div>;
  }

  if (view.kind === 'time_series') {
    const values = view.observations.map(({ row }) => row.value as number);
    const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
    const points = view.observations.map(({ row }, index) => ({
      x: view.observations.length === 1 ? 20 : 20 + index * (560 / (view.observations.length - 1)),
      y: 120 - (((row.value as number) - min) / range) * 88,
    }));
    return <div className="quant-time-series">
      <svg viewBox="0 0 600 150" role="img" aria-label={`${view.label}, observed values only`}>
        <line x1="20" y1="126" x2="580" y2="126" />
        <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="5"><title>{view.observations[index].row.period_start}: {formatValue(view.observations[index].row.value, view.observations[index].row.unit)}</title></circle>)}
      </svg>
      <p>Only supplied observation dates are plotted. The connecting line does not represent intermediate measurements.</p>
      <div className="quant-point-list">{view.observations.map(({ index, row }) => <button key={index} onClick={() => onViewEvidence(index)}><strong>{row.period_start} – {row.period_end}</strong><span>{formatValue(row.value, row.unit)}</span><small>{row.entity_name || row.entity_id} · View evidence</small></button>)}</div>
    </div>;
  }

  if (view.kind === 'ranking') {
    return <ol className="quant-ranking-list">{view.observations.map(({ index, row }) => <li key={index}><button onClick={() => onViewEvidence(index)}><span>{row.entity_name || row.entity_id}</span><strong>{formatValue(row.value, row.unit)}</strong><small>{scopeOf(row)} · Reported, unverified · View evidence</small></button></li>)}</ol>;
  }

  const values = view.observations.map(({ row }) => row.value ?? 0);
  const min = Math.min(0, ...values), max = Math.max(0, ...values), range = max - min || 1;
  return <div className="quant-comparison" role="table" aria-label={`${view.label} entity comparison`}>
    {view.observations.map(({ index, row }) => <button className="quant-comparison-row" role="row" key={index} onClick={() => onViewEvidence(index)}>
      <span className="quant-comparison-entity">{row.entity_name || row.entity_id}</span>
      <span className={`quant-comparison-track${min < 0 ? ' is-diverging' : ''}`} style={min < 0 ? { background: `linear-gradient(to right, #d7e1ee 0%, #d7e1ee ${((0 - min) / range) * 100}%, #e8eef6 ${((0 - min) / range) * 100}%, #e8eef6 100%)` } : undefined} aria-hidden="true"><span style={{ left: `${min < 0 ? ((0 - min) / range) * 100 : 0}%`, width: `${Math.max(1, (Math.abs(row.value ?? 0) / range) * 100)}%`, transform: (row.value ?? 0) < 0 ? 'translateX(-100%)' : undefined }} /></span>
      <strong>{formatValue(row.value, row.unit)}</strong>
      <small>{scopeOf(row)} · Reported, unverified · View evidence</small>
    </button>)}
  </div>;
}

export function QuantitativeEvidence({ observations, onViewEvidence }: Props) {
  const reportRows = observations.map((row, index) => ({ row, index })).filter(({ row }) => row.observation_type === 'reported');
  if (!reportRows.length) return null;
  const rows = reportRows.map(({ row }) => row);
  const views = selectQuantitativeViews(rows).map((view) => ({ ...view, observations: view.observations.map((point) => ({ ...point, index: reportRows[point.index].index })) }));
  const limitations = quantitativeLimitations(rows);
  const metricNames = [...new Set(rows.map((row) => row.metric_definition || row.metric_id).filter(Boolean))];
  return <section className="research-panel quantitative-evidence" aria-labelledby="quantitative-evidence-title">
    <div className="quantitative-evidence-heading"><div><span className="field-label">REPORT-SUPPLIED · UNVERIFIED</span><h3 id="quantitative-evidence-title">Quantitative evidence</h3><p>{metricNames.join(' · ') || 'Metric details not supplied'}</p></div><span className="quant-source-label">ChatGPT research</span></div>
    {views.length > 0 ? <div className="quantitative-views">{views.map((view, index) => <article className="quantitative-view" key={`${view.kind}:${view.label}:${index}`}>
      <div className="quantitative-view-heading"><div><h4>{view.kind === 'comparison' ? 'Entity comparison' : view.kind === 'two_point' ? 'Two reported time points' : view.kind === 'time_series' ? 'Observed time series' : 'Reported ranking positions'}</h4><p>{view.label}</p></div><span>{view.observations.length} observations</span></div>
      <p className="quant-scope-line">{scopeOf(view.observations[0].row)} · Not independently verified</p>
      <ViewBody view={view} onViewEvidence={onViewEvidence} />
    </article>)}</div> : <div className="quantitative-insufficient"><strong>No compatible visualization can be shown yet.</strong><p>The supplied observations remain available below with their validation reasons. No values have been inferred.</p></div>}
    {limitations.length > 0 && <details className="quantitative-limitations"><summary>Data limitations · {limitations.length}</summary><ul>{limitations.map((reason, index) => <li key={`${reason}:${index}`}>{reason}</li>)}</ul></details>}
    <div className="quantitative-observation-details"><strong>Observation records</strong>{reportRows.map(({ row, index }) => <details key={`${row.metric_id}:${index}`} id={`quant-observation-${index}`}>
      <summary>{row.metric_definition || row.metric_id || 'Unknown metric'} · {row.entity_name || row.entity_id || 'Entity not resolved'} · {formatValue(row.value, row.unit)}</summary>
      <p>{scopeOf(row) || 'Scope not provided'} · Report-supplied · Unverified</p>
      {row.validation_reasons.length > 0 && <ul>{row.validation_reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}</ul>}
      {row.evidence_reference && <a href={row.evidence_reference} target="_blank" rel="noreferrer">Open source reference</a>}
      {row.source_reference && row.source_reference !== row.evidence_reference && <a href={row.source_reference} target="_blank" rel="noreferrer">Open data source</a>}
    </details>)}</div>
  </section>;
}
