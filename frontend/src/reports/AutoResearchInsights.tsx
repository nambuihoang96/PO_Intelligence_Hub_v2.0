import type { QuantitativeObservation, ResearchData } from './api';
import { QuantitativeEvidence } from './QuantitativeEvidence';
import { formatAutoValue, selectAutoPresentation } from './autoPresentation';
import './AutoResearchInsights.css';

type Props = {
  data: ResearchData;
  onViewEvidence: (originalIndex: number) => void;
  onPrepareChartData?: () => void;
};

function sourceName(row: QuantitativeObservation, data: ResearchData): string {
  const source = data.evidence_references.find((item) => item.url === row.source_reference);
  if (source?.title) return source.title;
  if (!row.source_reference) return 'Chưa rõ nguồn';
  try { return new URL(row.source_reference).hostname; }
  catch { return 'Nguồn trong báo cáo'; }
}

function periodLabel(row: QuantitativeObservation): string {
  if (row.snapshot_date) return `Mốc ${row.snapshot_date}`;
  if (row.period_start && row.period_end) return row.period_start === row.period_end
    ? row.period_start : `${row.period_start} – ${row.period_end}`;
  return 'Chưa rõ kỳ đo';
}

function kpiLabel(row: QuantitativeObservation, featuredRows: QuantitativeObservation[]): string {
  const metricDefinitions = new Set(featuredRows.map((item) => item.metric_definition).filter(Boolean));
  if (metricDefinitions.size > 1) return row.metric_definition || row.entity_name || row.entity_id || 'Quan sát';
  const sameEntityAcrossGeos = new Set(featuredRows.map((item) => item.entity_name).filter(Boolean)).size === 1
    && new Set(featuredRows.map((item) => item.geo).filter(Boolean)).size > 1;
  if (sameEntityAcrossGeos) return row.geo || row.entity_name || row.metric_definition || 'Quan sát';
  return row.entity_name || row.entity_id || row.metric_definition || 'Quan sát';
}

/** Evidence-index references always point back to the original report observations. */
export function AutoResearchInsights({ data, onViewEvidence, onPrepareChartData }: Props) {
  const rows = data.quantitative_observations ?? [];
  const selection = selectAutoPresentation(data);
  const sourceCount = new Set([...selection.chartIndexes, ...selection.featuredIndexes].map((index) => rows[index].source_reference).filter(Boolean)).size;

  if (selection.mode === 'qualitative') {
    return <div className="auto-insights-qualitative" role="note">
      <strong>Báo cáo định tính</strong>
      <span>Không có phép đo định lượng được báo cáo. Các phát hiện, bằng chứng, điều chưa rõ và hành động PO được trình bày bên dưới; không tạo KPI hay biểu đồ giả.</span>
    </div>;
  }

  if (selection.mode === 'needs_review') {
    return <section className="auto-insights-not-ready" aria-label="Số liệu chưa đủ điều kiện hiển thị">
      <strong>Có {selection.otherIndexes.length} quan sát số liệu được báo cáo</strong>
      <p>Chưa có nhóm quan sát đáp ứng đầy đủ điều kiện so sánh để tạo biểu đồ. Các số liệu vẫn được giữ nguyên để kiểm tra nguồn, phạm vi, đơn vị và kỳ đo.</p>
      <details>
        <summary>Xem các quan sát và lý do chưa đủ điều kiện</summary>
        <QuantitativeEvidence observations={rows} onViewEvidence={onViewEvidence} onPrepareChartData={onPrepareChartData} />
      </details>
    </section>;
  }

  const chartRows = selection.chartIndexes.map((index) => rows[index]);
  const featuredRows = selection.featuredIndexes.map((index) => rows[index]);
  const otherRows = selection.otherIndexes.map((index) => rows[index]);
  const highlight = data.presentation_plan?.headline?.trim();
  const chartName = selection.view?.label || 'Quan sát số liệu trong báo cáo';

  return <section className="auto-report-insights" aria-label="Số liệu và biểu đồ tự động">
    <header className="auto-insights-heading">
      <div>
        <span className="auto-insights-eyebrow">PHÂN TÍCH ĐỊNH LƯỢNG · DO BÁO CÁO CUNG CẤP</span>
        <h3>Số liệu nổi bật</h3>
        {highlight && <p className="auto-insights-headline">{highlight}</p>}
      </div>
      <span className="auto-insights-unverified">Chưa xác minh độc lập</span>
    </header>

    <div className="auto-insights-kpis" aria-label="Các quan sát nổi bật">
      {selection.featuredIndexes.map((index) => {
        const row = rows[index];
        return <button type="button" className="auto-insights-kpi" key={index} onClick={() => onViewEvidence(index)}
          aria-label={`Xem bằng chứng cho ${row.entity_name || row.entity_id || row.metric_definition || 'quan sát'}: ${formatAutoValue(row)}`}>
          <span className="auto-kpi-label">{kpiLabel(row, featuredRows)}</span>
          <strong>{formatAutoValue(row)}</strong>
          <span className="auto-kpi-period">{periodLabel(row)} · {row.geo || 'GEO chưa rõ'} · {row.platform || 'Nền tảng chưa rõ'}</span>
          <small>{sourceName(row, data)} · {row.value_precision === 'approximate' ? 'Ước tính' : 'Theo báo cáo'} · Chưa xác minh</small>
        </button>;
      })}
    </div>

    {selection.view ? <div className="auto-insights-visual-grid">
      <div className="auto-insights-visual" aria-label="Biểu đồ của nhóm quan sát đủ điều kiện">
        <div className="auto-insights-chart-header">
          <span className="auto-insights-eyebrow">BIỂU ĐỒ · CÁC QUAN SÁT TƯƠNG THÍCH</span>
          <h4>{chartName}</h4>
          <p>{selection.usedSuggestedChart ? 'Nhóm dữ liệu được ChatGPT đề xuất; PO Hub đã kiểm tra lại điều kiện so sánh.' : 'PO Hub tự chọn nhóm quan sát đủ điều kiện dựa trên dữ liệu.'}</p>
        </div>
        <QuantitativeEvidence
          observations={chartRows}
          onViewEvidence={(localIndex) => onViewEvidence(selection.chartIndexes[localIndex])}
          onPrepareChartData={onPrepareChartData}
        />
      </div>
      <aside className="auto-insights-context" aria-label="Phạm vi và lưu ý khi diễn giải">
        <span className="auto-insights-eyebrow">HIỂU ĐÚNG SỐ LIỆU</span>
        <h4>Phạm vi & nguồn</h4>
        <p>{sourceCount} nguồn được báo cáo trong nhóm đang hiển thị. Các giá trị không được PO Hub xác minh độc lập.</p>
        <ul>
          <li>Chỉ so sánh những quan sát đủ điều kiện về metric, phương pháp, nguồn, đơn vị, kỳ đo và phạm vi.</li>
          <li>Không suy ra tăng trưởng, nguyên nhân hoặc cộng các phân khúc từ biểu đồ nếu không có căn cứ.</li>
          <li>Nhấn vào KPI hoặc giá trị biểu đồ để xem đúng quan sát và bằng chứng gốc.</li>
        </ul>
      </aside>
    </div> : <div className="auto-insights-not-ready">
      <strong>Những chỉ số riêng lẻ — không ghép thành biểu đồ</strong>
      <p>Các phép đo có tên, đơn vị hoặc phạm vi khác nhau. Mỗi thẻ KPI giữ đúng nguồn và kỳ đo; không được tự coi chúng là một chuỗi hay một phép so sánh.</p>
    </div>}
    {otherRows.length > 0 && <details className="auto-insights-other">
      <summary>{otherRows.length} quan sát khác trong báo cáo · Xem thêm</summary>
      <QuantitativeEvidence observations={otherRows} onViewEvidence={(localIndex) => onViewEvidence(selection.otherIndexes[localIndex])} onPrepareChartData={onPrepareChartData} />
    </details>}
  </section>;
}
