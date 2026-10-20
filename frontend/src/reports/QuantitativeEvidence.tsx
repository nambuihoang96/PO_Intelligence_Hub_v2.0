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

function ViewBody({ view, onViewEvidence }: { view: QuantitativeView; onViewEvidence: Props['onViewEvidence'] }) {
  if (view.kind === 'period_matrix') {
    const periods = [...new Map(view.observations.map(({ row }) => [periodKey(row), row])).values()]
      .sort((a, b) => (a.period_start || '').localeCompare(b.period_start || '') || (a.period_end || '').localeCompare(b.period_end || ''));
    const entities = [...new Map(view.observations.map(({ row }) => [row.entity_id, { id: row.entity_id, name: row.entity_name || row.entity_id || 'Unknown entity' }])).values()]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return <div className="quant-matrix-scroll" role="region" aria-label="Entity and period comparison" tabIndex={0}>
      <table className="quant-period-matrix">
        <thead><tr><th scope="col">Entity</th>{periods.map((period) => <th scope="col" key={periodKey(period)}>{periodLabel(period)}</th>)}</tr></thead>
        <tbody>{entities.map((entity) => <tr key={entity.id}>
          <th scope="row">{entity.name}</th>
          {periods.map((period) => {
            const points = view.observations.filter(({ row }) => row.entity_id === entity.id && periodKey(row) === periodKey(period));
            return <td key={periodKey(period)}>{points.length ? points.map(({ index, row }) => <button className="quant-matrix-point" key={index} onClick={() => onViewEvidence(index)} aria-label={`View evidence for ${entity.name}, ${periodLabel(row)}, ${formatValue(row.value, row.unit)}`}>
              <strong>{formatValue(row.value, row.unit)}</strong><span>Reported · unverified</span><u>View evidence</u>
            </button>) : <span className="quant-matrix-missing">No observation</span>}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>;
  }

  if (view.kind === 'two_point') {
    return <div className="quant-two-point" aria-label="Two reported time points; not a continuous trend">
      {view.observations.map(({ index, row }) => <button className="quant-point-card" key={index} onClick={() => onViewEvidence(index)}>
        <span>{periodLabel(row)}</span><strong>{formatValue(row.value, row.unit)}</strong>
        <small>{row.entity_name || row.entity_id} · Reported, unverified</small><u>View evidence</u>
      </button>)}
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
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="5"><title>{ordered[index].row.period_start}: {formatValue(ordered[index].row.value, ordered[index].row.unit)}</title></circle>)}
        {labelIndexes.map((index) => <text className="quant-axis-label" key={index} x={points[index].x} y="151" textAnchor={index === 0 ? 'start' : index === ordered.length - 1 ? 'end' : 'middle'}>{ordered[index].row.period_start}</text>)}
      </svg>
      <p>Dates are spaced chronologically. The connecting line does not represent intermediate measurements.</p>
      <div className="quant-point-list">{ordered.map(({ index, row }) => <button key={index} onClick={() => onViewEvidence(index)}><strong>{periodLabel(row)}</strong><span>{formatValue(row.value, row.unit)}</span><small>{row.entity_name || row.entity_id} · View evidence</small></button>)}</div>
    </div>;
  }

  if (view.kind === 'ranking') {
    return <ol className="quant-ranking-list">{view.observations.map(({ index, row }) => <li key={index}><button onClick={() => onViewEvidence(index)}><span>{row.entity_name || row.entity_id}</span><strong>{formatValue(row.value, row.unit)}</strong><small>{scopeOf(row)} · Reported, unverified · View evidence</small></button></li>)}</ol>;
  }

  if (view.kind === 'observation') {
    return <div className="quant-single-observations">{view.observations.map(({ index, row }) => <button key={index} onClick={() => onViewEvidence(index)}>
      <span>{row.entity_name || row.entity_id}</span><strong>{formatValue(row.value, row.unit)}</strong><small>{scopeOf(row)} · Reported, unverified · View evidence</small>
    </button>)}</div>;
  }

  const values = view.observations.map(({ row }) => row.value ?? 0);
  const min = Math.min(0, ...values), max = Math.max(0, ...values), range = max - min || 1;
  const zero = min < 0 ? ((0 - min) / range) * 100 : 0;
  return <div className="quant-comparison" aria-label={`${view.label} entity comparison`}>
    {view.observations.map(({ index, row }) => <button className="quant-comparison-row" key={index} onClick={() => onViewEvidence(index)}>
      <span className="quant-comparison-entity">{row.entity_name || row.entity_id}</span>
      <span className="quant-comparison-track" aria-hidden="true" style={min < 0 ? { background: `linear-gradient(to right, #d7e1ee 0%, #d7e1ee ${zero}%, #e8eef6 ${zero}%, #e8eef6 100%)` } : undefined}><span style={{ left: `${zero}%`, width: `${Math.max(1, (Math.abs(row.value ?? 0) / range) * 100)}%`, transform: (row.value ?? 0) < 0 ? 'translateX(-100%)' : undefined }} /></span>
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
      <div className="quantitative-view-heading"><div><h4>{view.kind === 'comparison' ? 'Entity comparison' : view.kind === 'period_matrix' ? 'Entity and period comparison' : view.kind === 'two_point' ? 'Two reported time points' : view.kind === 'time_series' ? 'Observed time series' : view.kind === 'ranking' ? 'Reported ranking positions' : 'Reported observation'}</h4><p>{view.label}</p></div><span>{view.observations.length} observations</span></div>
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
