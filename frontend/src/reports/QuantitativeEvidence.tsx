import { useState } from 'react';
import type { QuantitativeObservation } from './api';
import { quantitativeLimitations, selectQuantitativeViews, type QuantitativeView } from './quantitativeAnalytics';
import { formatQuantitativePeriod, formatQuantitativeValue } from './quantitativePresentation';

type Props = {
  observations: QuantitativeObservation[];
  onViewEvidence: (index: number) => void;
  onPrepareChartData?: () => void;
};

function displayValue(row: QuantitativeObservation): string {
  const value = formatQuantitativeValue(row.value, row.unit);
  return row.value !== null && row.value_precision === 'approximate' ? `≈${value}` : value;
}

function precisionLabel(row: QuantitativeObservation): string {
  return row.value_precision === 'approximate' ? 'Xấp xỉ · do nguồn cung cấp · chưa xác minh' : 'Chính xác theo báo cáo · chưa xác minh';
}

function periodKey(row: QuantitativeObservation): string {
  return `${row.period_start}|${row.period_end}`;
}

function periodLabel(row: QuantitativeObservation): string {
  return formatQuantitativePeriod(row.period_start, row.period_end);
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
    const entities = [...new Map(view.observations.map(({ row }) => [row.entity_id, { id: row.entity_id, name: row.entity_name || row.entity_id || 'Chưa xác định đối tượng' }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name));
    const max = Math.max(1, ...view.observations.map(({ row }) => row.value ?? 0));
    if (displayMode === 'table') return <div className="quant-matrix-scroll" role="region" aria-label="Giá trị được báo cáo theo đối tượng và kỳ" tabIndex={0}>
      <table className="quant-period-matrix"><thead><tr><th scope="col">Hồ sơ</th>{periods.map((period) => <th scope="col" key={periodKey(period)}>{periodLabel(period)}</th>)}</tr></thead>
        <tbody>{entities.map((entity) => <tr key={entity.id}><th scope="row">{entity.name}</th>{periods.map((period) => { const points = view.observations.filter(({ row }) => row.entity_id === entity.id && periodKey(row) === periodKey(period)); return <td key={periodKey(period)}>{points.length ? points.map(({ index, row }) => <button className="quant-matrix-point" key={index} onClick={() => onViewEvidence(index)} title={row.reported_value_text || undefined}><strong>{displayValue(row)}</strong><span>{precisionLabel(row)}</span><u>Xem bằng chứng</u></button>) : <span className="quant-matrix-missing">Chưa có quan sát</span>}</td>; })}</tr>)}</tbody>
      </table>
    </div>;
    return <div className="quant-grouped-chart" aria-label={`So sánh cột theo nhóm: ${view.label}`}>
      <div className="quant-bar-legend" aria-label="Chú giải kỳ">{periods.map((period, index) => <span key={periodKey(period)}><i className={`quant-bar-swatch period-${index}`} />{periodLabel(period)}</span>)}</div>
      {entities.map((entity) => <section className="quant-bar-entity" key={entity.id} aria-label={entity.name}>
        <h5>{entity.name}</h5>
        <div className="quant-bar-points">{periods.map((period, periodIndex) => {
          const points = view.observations.filter(({ row }) => row.entity_id === entity.id && periodKey(row) === periodKey(period));
          return points.length ? points.map(({ index, row }) => <button type="button" className={`quant-bar-point period-${periodIndex}`} key={index} onClick={() => onViewEvidence(index)} title={row.reported_value_text || undefined} aria-label={`Xem bằng chứng của ${entity.name}, ${periodLabel(row)}, ${displayValue(row)}, ${precisionLabel(row)}`}>
            <span className="quant-bar-period">{periodLabel(row)}</span><span className="quant-bar-track"><span className={row.value === 0 ? 'is-zero' : ''} style={{ width: `${row.value === 0 ? 0 : ((row.value ?? 0) / max) * 100}%` }} /></span><strong>{displayValue(row)}</strong><small>{precisionLabel(row)}</small>
      </button>) : <div className="quant-bar-missing" key={periodKey(period)}><span>{periodLabel(period)}</span><span>Chưa có quan sát</span></div>;
        })}</div>
      </section>)}
      {view.explanation && <p className="quant-chart-note">{view.explanation}</p>}
      <p className="quant-chart-note">Mỗi cột là một quan sát do nguồn cung cấp. Không tính giá trị trung gian hoặc tốc độ tăng trưởng.</p>
    </div>;
  }

  if (view.kind === 'period_matrix') {
    const periods = [...new Map(view.observations.map(({ row }) => [periodKey(row), row])).values()]
      .sort((a, b) => (a.period_start || '').localeCompare(b.period_start || '') || (a.period_end || '').localeCompare(b.period_end || ''));
    const entities = [...new Map(view.observations.map(({ row }) => [row.entity_id, { id: row.entity_id, name: row.entity_name || row.entity_id || 'Chưa xác định đối tượng' }])).values()]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return <>{view.explanation && <p className="quant-chart-note">{view.explanation}</p>}<div className="quant-matrix-scroll" role="region" aria-label="So sánh đối tượng và kỳ" tabIndex={0}>
      <table className="quant-period-matrix">
        <thead><tr><th scope="col">Hồ sơ</th>{periods.map((period) => <th scope="col" key={periodKey(period)}>{periodLabel(period)}</th>)}</tr></thead>
        <tbody>{entities.map((entity) => <tr key={entity.id}>
          <th scope="row">{entity.name}</th>
          {periods.map((period) => {
            const points = view.observations.filter(({ row }) => row.entity_id === entity.id && periodKey(row) === periodKey(period));
            return <td key={periodKey(period)}>{points.length ? points.map(({ index, row }) => <button className="quant-matrix-point" key={index} onClick={() => onViewEvidence(index)} aria-label={`Xem bằng chứng của ${entity.name}, ${periodLabel(row)}, ${displayValue(row)}`}>
              <strong>{displayValue(row)}</strong><span>{precisionLabel(row)}</span><u>Xem bằng chứng</u>
            </button>) : <span className="quant-matrix-missing">Chưa có quan sát</span>}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div></>;
  }

  if (view.kind === 'two_point') {
    const ordered = [...view.observations].sort((a, b) => (a.row.period_start || '').localeCompare(b.row.period_start || ''));
    const max = Math.max(1, ...ordered.map(({ row }) => row.value ?? 0));
    if (displayMode === 'table') return <div className="quant-matrix-scroll" role="region" aria-label="Hai quan sát được báo cáo" tabIndex={0}><table className="quant-period-matrix"><thead><tr><th scope="col">Kỳ</th><th scope="col">Giá trị</th><th scope="col">Bằng chứng</th></tr></thead><tbody>{ordered.map(({ index, row }) => <tr key={index}><th scope="row">{periodLabel(row)}</th><td>{displayValue(row)}</td><td><button type="button" className="text-button" onClick={() => onViewEvidence(index)}>Xem bằng chứng</button><small>{precisionLabel(row)}</small></td></tr>)}</tbody></table></div>;
    return <div className="quant-two-point" aria-label="Hai thời điểm được báo cáo; không phải xu hướng liên tục">
      {ordered.map(({ index, row }, pointIndex) => <button className={`quant-point-card period-${pointIndex}`} key={index} onClick={() => onViewEvidence(index)} title={row.reported_value_text || undefined}>
        <span>{periodLabel(row)}</span><span className="quant-two-point-track"><span className={row.value === 0 ? 'is-zero' : ''} style={{ width: `${row.value === 0 ? 0 : ((row.value ?? 0) / max) * 100}%` }} /></span><strong>{displayValue(row)}</strong>
        <small>{row.entity_name || row.entity_id} · {precisionLabel(row)}</small><u>Xem bằng chứng</u>
      </button>)}
      <p className="quant-chart-note">Chỉ có hai điểm được báo cáo; không tính giá trị trung gian hoặc tốc độ tăng trưởng.</p>
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
      <svg viewBox="0 0 600 168" role="img" aria-label={`${view.label}, các quan sát được sắp theo ngày thực tế`}>
        <line x1="20" y1="126" x2="580" y2="126" />
        <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="5"><title>{ordered[index].row.period_start}: {displayValue(ordered[index].row)}</title></circle>)}
        {labelIndexes.map((index) => <text className="quant-axis-label" key={index} x={points[index].x} y="151" textAnchor={index === 0 ? 'start' : index === ordered.length - 1 ? 'end' : 'middle'}>{ordered[index].row.period_start}</text>)}
      </svg>
      <p>Các mốc ngày được sắp theo thời gian thực. Đường nối không biểu thị số đo ở các thời điểm trung gian.</p>
      <div className="quant-point-list">{ordered.map(({ index, row }) => <button key={index} aria-label={`Xem bằng chứng của ${row.entity_name || row.entity_id}, ${periodLabel(row)}, ${displayValue(row)}`} onClick={() => onViewEvidence(index)}><strong>{periodLabel(row)}</strong><span>{displayValue(row)}</span><small>{row.entity_name || row.entity_id} · {precisionLabel(row)} · Xem bằng chứng</small></button>)}</div>
    </div>;
  }

  if (view.kind === 'ranking') {
    return <ol className="quant-ranking-list">{view.observations.map(({ index, row }) => <li key={index}><button onClick={() => onViewEvidence(index)}><span>{row.entity_name || row.entity_id}</span><strong>{displayValue(row)}</strong><small>{scopeOf(row)} · {precisionLabel(row)} · Xem bằng chứng</small></button></li>)}</ol>;
  }

  if (view.kind === 'observation') {
    return <div className="quant-single-observations">{view.observations.map(({ index, row }) => <button key={index} onClick={() => onViewEvidence(index)}>
      <span>{row.entity_name || row.entity_id}</span><strong>{displayValue(row)}</strong><small>{scopeOf(row)} · {precisionLabel(row)} · Xem bằng chứng</small>
    </button>)}</div>;
  }

  const values = view.observations.map(({ row }) => row.value ?? 0);
  const min = Math.min(0, ...values), max = Math.max(0, ...values), range = max - min || 1;
  const zero = min < 0 ? ((0 - min) / range) * 100 : 0;
    return <div className="quant-comparison" aria-label={`So sánh đối tượng: ${view.label}`}>
    {view.observations.map(({ index, row }) => <button className="quant-comparison-row" key={index} onClick={() => onViewEvidence(index)}>
      <span className="quant-comparison-entity">{row.entity_name || row.entity_id}</span>
      <span className="quant-comparison-track" aria-hidden="true" style={min < 0 ? { background: `linear-gradient(to right, #d7e1ee 0%, #d7e1ee ${zero}%, #e8eef6 ${zero}%, #e8eef6 100%)` } : undefined}><span className={row.value === 0 ? 'is-zero' : ''} style={{ left: `${zero}%`, width: `${row.value === 0 ? 0 : (Math.abs(row.value ?? 0) / range) * 100}%`, transform: (row.value ?? 0) < 0 ? 'translateX(-100%)' : undefined }} /></span>
      <strong>{displayValue(row)}</strong>
      <small>{scopeOf(row)} · {precisionLabel(row)} · Xem bằng chứng</small>
    </button>)}
  </div>;
}

export function QuantitativeEvidence({ observations, onViewEvidence, onPrepareChartData }: Props) {
  const [displayModes, setDisplayModes] = useState<Record<string, 'chart' | 'table'>>({});
  const reportRows = observations.map((row, index) => ({ row, index })).filter(({ row }) => row.observation_type === 'reported');
  if (!reportRows.length) return <section className="research-panel quantitative-evidence quantitative-no-data" aria-labelledby="quantitative-evidence-title"><div className="quantitative-evidence-heading"><div><span className="field-label">BÁO CÁO CHATGPT · ĐÃ GIỮ NGUYÊN NỘI DUNG GỐC</span><h3 id="quantitative-evidence-title">Số liệu trong báo cáo</h3></div></div><p>Báo cáo này không có quan sát số liệu có cấu trúc. PO Hub không chuyển văn bản hoặc ảnh biểu đồ thành số liệu.</p>{onPrepareChartData && <button type="button" className="secondary-action" onClick={onPrepareChartData}>Chuẩn bị dữ liệu biểu đồ từ báo cáo này</button>}</section>;
  const rows = reportRows.map(({ row }) => row);
  const views = selectQuantitativeViews(rows).map((view) => ({ ...view, observations: view.observations.map((point) => ({ ...point, index: reportRows[point.index].index })) }));
  const limitations = quantitativeLimitations(rows);
  const metricNames = [...new Set(rows.map((row) => row.metric_definition || row.metric_id).filter(Boolean))];
  return <section className="research-panel quantitative-evidence" aria-labelledby="quantitative-evidence-title">
    <div className="quantitative-evidence-heading"><div><span className="field-label">SỐ LIỆU DO NGUỒN CUNG CẤP · CHƯA XÁC MINH</span><h3 id="quantitative-evidence-title">Số liệu và biểu đồ</h3><p>{metricNames.join(' · ') || 'Chưa có định nghĩa chỉ số'}</p></div><span className="quant-source-label">Nghiên cứu ChatGPT</span></div>
    {views.length > 0 ? <div className="quantitative-views">{views.map((view, index) => { const key = `${view.kind}:${view.label}:${index}`; const displayMode = displayModes[key] || 'chart'; return <article className="quantitative-view" key={key}>
      <div className="quantitative-view-heading"><div><h4>{view.kind === 'comparison' || view.kind === 'grouped_bar' ? 'So sánh hồ sơ' : view.kind === 'period_matrix' ? 'Đối chiếu hồ sơ theo kỳ' : view.kind === 'two_point' ? 'Hai thời điểm được báo cáo' : view.kind === 'time_series' ? 'Chuỗi số liệu quan sát' : view.kind === 'ranking' ? 'Thứ hạng được báo cáo' : 'Quan sát được báo cáo'}</h4><p>{view.label}</p></div><div className="quantitative-view-actions"><span>{view.observations.length} quan sát</span>{(view.kind === 'grouped_bar' || view.kind === 'two_point') && <button type="button" className="text-button" aria-pressed={displayMode === 'table'} onClick={() => setDisplayModes((current) => ({ ...current, [key]: displayMode === 'chart' ? 'table' : 'chart' }))}>{displayMode === 'chart' ? 'Xem bảng' : 'Xem biểu đồ'}</button>}</div></div>
      <p className="quant-scope-line">{scopeOf(view.observations[0].row)} · Do nguồn cung cấp · chưa xác minh</p>
      <ViewBody view={view} onViewEvidence={onViewEvidence} displayMode={displayMode} />
  </article>; })}</div> : <div className="quantitative-insufficient"><strong>Chưa thể hiển thị biểu đồ tương thích.</strong><p>Các quan sát gốc vẫn có bên dưới cùng lý do kiểm tra. Không có giá trị nào được suy đoán.</p>{onPrepareChartData && <button className="secondary-action" type="button" onClick={onPrepareChartData}>Chuẩn bị dữ liệu biểu đồ từ báo cáo này</button>}</div>}
    {limitations.length > 0 && <details className="quantitative-limitations"><summary>Giới hạn dữ liệu · {limitations.length}</summary><ul>{limitations.map((reason, index) => <li key={`${reason}:${index}`}>{reason}</li>)}</ul></details>}
    <div className="quantitative-observation-details"><strong>Các quan sát trong báo cáo</strong>{reportRows.map(({ row, index }) => <details key={`${row.metric_id}:${index}`} id={`quant-observation-${index}`}>
      <summary>{row.metric_definition || row.metric_id || 'Chưa xác định chỉ số'} · {row.entity_name || row.entity_id || 'Chưa xác định đối tượng'} · {displayValue(row)}</summary>
      <p>{scopeOf(row) || 'Chưa cung cấp phạm vi'} · Do báo cáo cung cấp · Chưa xác minh</p>
      {row.reported_value_text && <p>Giá trị gốc được báo cáo: “{row.reported_value_text}” · {precisionLabel(row)}</p>}
      {row.validation_reasons.length > 0 && <ul>{row.validation_reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}</ul>}
      {row.evidence_reference && <a href={row.evidence_reference} target="_blank" rel="noreferrer">Mở nguồn tham chiếu</a>}
      {row.source_reference && row.source_reference !== row.evidence_reference && <a href={row.source_reference} target="_blank" rel="noreferrer">Mở nguồn dữ liệu</a>}
    </details>)}</div>
  </section>;
}
