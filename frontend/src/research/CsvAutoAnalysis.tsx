import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { QuantitativeDataset, QuantitativeObservation } from '../reports/api';
import { csvMetricLabel, csvSourcePeriodLabel, csvUnitLabel } from '../reports/csvPresentation';
import { groupWarnings } from './csvWarnings';
import { CsvCombinedTop10, CsvTop10Insight } from './CsvTop10Insight';
import { CsvWarningSummary } from './CsvWarningSummary';
import {
  availableLenses, computeTop10Insight, computeTop10Rankings, formatIsoAsVi, rowsForLens, top10HighlightsForLens,
  TOP10_LENS_LABELS, type Top10Lens, type Top10Row,
} from './top10Insight';
import './CsvResultPanels.css';

// Single-file page, in this order: one line of identity, one warning line, a filter (Lượt tải by default),
// up to five highlights, the top 10 table for the chosen filter, the research action under it,
// a link to comparison, then everything descriptive under "Chi tiết kỹ thuật".
// Period-over-period comparison lives only on the separate /compare-periods page.

export type CsvAutoHighlight = {
  kind: 'increase' | 'decrease' | 'unchanged' | 'new' | 'review' | 'highest' | 'lowest';
  label: string;
  detail?: string;
};

export type CsvAutoHighlightMap = Record<string, CsvAutoHighlight>;

// What the research action under the top 10 receives: the rows of the current filter, never ticked by hand.
export type Top10ResearchSelection = { lens: Top10Lens; lensLabel: string; rows: Top10Row[]; canRun: boolean; reason: string };

const norm = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const metricTuple = (row: { metric_id?: string | null; metric_definition?: string | null; unit?: string | null; methodology?: string | null }) =>
  JSON.stringify([row.metric_id, row.metric_definition, row.unit, row.methodology].map(norm));

function stableEntityId(sourceId?: string | null, provider?: string | null) {
  const value = String(sourceId ?? '').trim();
  if (!value) return '';
  const separator = value.indexOf(':');
  const providerName = (separator >= 0 ? value.slice(0, separator) : String(provider ?? '')).trim().toLocaleLowerCase();
  const id = (separator >= 0 ? value.slice(separator + 1) : value).trim();
  if (!providerName || ['csv', 'unknown'].includes(providerName) || !id || id.toLocaleLowerCase().startsWith('name-')) return '';
  return `${providerName}:${id}`;
}

function observationPeriodKey(row: QuantitativeObservation) {
  return JSON.stringify([row.period_semantics ?? 'unknown', row.period_start, row.period_end, row.snapshot_date, row.granularity]);
}

function scopePeriodKey(row: QuantitativeObservation) {
  return JSON.stringify([metricTuple(row), norm(row.geo), norm(row.platform), observationPeriodKey(row)]);
}

export function csvObservationHighlightKey(row: QuantitativeObservation) {
  return JSON.stringify([
    stableEntityId(row.source_entity_id, row.source_provider), metricTuple(row), norm(row.geo), norm(row.platform),
    row.period_semantics ?? 'unknown', row.period_start, row.period_end, row.snapshot_date, row.granularity, row.source_row_number ?? null,
  ]);
}

function isUnknownScope(value: string) {
  return ['unknown', 'unspecified', 'global / not specified', 'not specified', 'n/a'].includes(norm(value));
}

export function isCsvAnalysisReadyObservation(row: QuantitativeObservation) {
  return row.value !== null && Number.isFinite(Number(row.value)) && row.value_precision === 'exact'
    && row.analysis_ready === true && row.complete_observation === true && row.import_status === 'imported'
    && row.metric_id && row.metric_definition && row.unit && row.methodology && row.geo && row.platform
    && !isUnknownScope(row.geo) && !isUnknownScope(row.platform) && row.period_semantics && row.period_semantics !== 'unknown'
    && (row.snapshot_date || (row.period_start && row.period_end))
    && !(row.source_validation_reasons?.length) && !(row.metadata_validation_reasons?.length)
    && Boolean(stableEntityId(row.source_entity_id, row.source_provider));
}

function withinFileSignals(dataset: QuantitativeDataset) {
  const groups = new Map<string, QuantitativeObservation[]>();
  for (const row of dataset.observations) {
    if (!isCsvAnalysisReadyObservation(row)) continue;
    const key = scopePeriodKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  // A single file can show its own values and range, but must not color raw
  // rows as if they were period-over-period changes.
  const highlights: CsvAutoHighlightMap = {};
  const signals: Array<{ metric: string; geo: string; platform: string; period: string; high: QuantitativeObservation; low: QuantitativeObservation; median: number; count: number }> = [];
  for (const rows of groups.values()) {
    const byEntity = new Map<string, QuantitativeObservation[]>();
    for (const row of rows) {
      const id = stableEntityId(row.source_entity_id, row.source_provider);
      byEntity.set(id, [...(byEntity.get(id) ?? []), row]);
    }
    const unique = [...byEntity.entries()].filter(([, items]) => items.length === 1).map(([, items]) => items[0]);
    if (unique.length < 2) continue;
    const sorted = [...unique].sort((a, b) => Number(a.value) - Number(b.value));
    const low = sorted[0], high = sorted[sorted.length - 1];
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? Number(sorted[middle].value) : (Number(sorted[middle - 1].value) + Number(sorted[middle].value)) / 2;
    signals.push({ metric: high.metric_definition ?? high.metric_id ?? 'Chỉ số', geo: high.geo ?? 'Chưa rõ', platform: high.platform ?? 'Chưa rõ', period: high.snapshot_date ?? `${high.period_start} – ${high.period_end}`, high, low, median, count: unique.length });
  }
  return { signals: signals.slice(0, 4), highlights, groupsCount: signals.length };
}

function formatValue(value: number | null, unit: string | null) {
  const friendlyUnit = csvUnitLabel(unit);
  return value === null ? 'Chưa có dữ liệu' : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)}${friendlyUnit ? ` ${friendlyUnit}` : ''}`;
}

function friendlyGeo(value: string) {
  return ['worldwide', 'global', 'world'].includes(value.trim().toLocaleLowerCase()) ? 'Toàn cầu' : value;
}

function provenanceLabel(dataset: QuantitativeDataset) {
  const provenance = dataset.observations.map((row) => [row.methodology, row.source_reference].filter(Boolean).join(' ')).join(' ');
  if (/synthetic.{0,40}qa\s+fixture/i.test(provenance) && /not market data/i.test(provenance)) {
    return 'Mẫu QA tổng hợp · không phải dữ liệu thị trường';
  }
  // A PO confirmation is always named on results, never presented as CSV or documentation.
  const confirmed = dataset.observations.some((row) => Object.values(row.metadata_provenance ?? {}).some((item) => item.basis === 'po_confirmed'));
  if (confirmed) return 'PO xác nhận từ tên tệp và PO Hub · chưa xác minh độc lập';
  return 'Tệp CSV đã nhập · chưa xác minh độc lập';
}

const LENS_HEADINGS: Record<Top10Lens, string> = {
  downloads: 'Top 10 game theo lượt tải',
  revenue: 'Top 10 game theo doanh thu (trong tệp này)',
  growth: 'Top game theo tăng trưởng lượt tải (có năm trước)',
  combined: 'Kết hợp ba bảng xếp hạng',
};

export function CsvAutoAnalysis({ dataset, onHighlights, onOpenSourceRow, compareHref, renderResearchAction }: {
  dataset: QuantitativeDataset;
  onHighlights?: (value: CsvAutoHighlightMap) => void;
  onOpenSourceRow?: (sourceRowNumber?: number) => void;
  compareHref: string;
  renderResearchAction?: (selection: Top10ResearchSelection) => ReactNode;
}) {
  // ?lens=revenue|growth|combined opens that filter directly (a link, also used for screenshots); default is downloads.
  const [lens, setLens] = useState<Top10Lens>(() => {
    const requested = new URLSearchParams(window.location.search).get('lens');
    return requested === 'revenue' || requested === 'growth' || requested === 'combined' ? requested : 'downloads';
  });
  const initial = useMemo(() => withinFileSignals(dataset), [dataset]);
  const insight = useMemo(() => computeTop10Insight(dataset), [dataset]);
  const rankings = useMemo(() => computeTop10Rankings(dataset), [dataset]);
  const lenses = availableLenses(rankings);
  // The chosen filter stays valid only while the file supports it; otherwise fall back to downloads.
  const activeLens: Top10Lens = lenses.includes(lens) ? lens : 'downloads';
  const highlights = useMemo(() => top10HighlightsForLens(activeLens, insight, rankings), [activeLens, insight, rankings]);
  const eligibleCount = dataset.observations.filter(isCsvAnalysisReadyObservation).length;
  const signals = initial.signals;
  const warningGroups = groupWarnings(dataset.validation_reasons ?? []);
  const warningGroupCount = warningGroups.reduce((sum, group) => sum + group.count, 0);
  // Count topics, not rows: one line per kind of problem, however many CSV rows it touches.
  const warningTotal = warningGroups.length + insight.warnings.length;
  const lensRows = rowsForLens(rankings, activeLens);
  const researchSelection: Top10ResearchSelection = activeLens === 'combined'
    ? { lens: activeLens, lensLabel: TOP10_LENS_LABELS[activeLens], rows: [], canRun: false, reason: 'Kết hợp không có một danh sách top 10 riêng. Chọn Lượt tải, Doanh thu hoặc Tăng trưởng để nghiên cứu.' }
    : { lens: activeLens, lensLabel: TOP10_LENS_LABELS[activeLens], rows: lensRows, canRun: lensRows.length > 0, reason: lensRows.length ? '' : 'Không có game nào trong bộ lọc này để nghiên cứu.' };

  useEffect(() => {
    onHighlights?.(initial.highlights);
  }, [initial, onHighlights]);

  const period = insight.periodConfirmed
    ? `${formatIsoAsVi(insight.periodConfirmed.start)} – ${formatIsoAsVi(insight.periodConfirmed.end)}`
    : 'chưa xác nhận';
  const geo = insight.geoConfirmed ? friendlyGeo(insight.geoConfirmed) : 'chưa xác nhận';
  const productCount = dataset.source_apps ?? insight.rows.length;
  const hasSignals = signals.length > 0;

  return <section className="csv-auto-analysis" aria-labelledby="csv-auto-analysis-title">
    <h3 id="csv-auto-analysis-title" className="csv-auto-title">Kết quả tệp CSV</h3>

    <div className="csv-auto-headline" aria-label="Tệp đang xem">
      <strong>{dataset.filename}</strong>
      <span>{productCount} sản phẩm</span>
      <span>Kỳ: {period}</span>
      <span>GEO: {geo}</span>
      <span className="csv-auto-source-tag">Tính từ CSV · ước tính</span>
    </div>

    {warningTotal > 0
      ? <details className="csv-auto-warning-line">
          <summary>Có {warningTotal} điều cần kiểm tra</summary>
          <div className="csv-auto-warning-body">
            {warningGroupCount > 0 && <CsvWarningSummary reasons={dataset.validation_reasons ?? []} />}
            {insight.warnings.length > 0 && <ul>{insight.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          </div>
        </details>
      : <p className="csv-auto-warning-line csv-auto-warning-line--clear">Không có cảnh báo dữ liệu cho tệp này.</p>}

    <div className="csv-lens-filter">
      <label>
        <span>Lọc theo</span>
        <select aria-label="Lọc theo" value={activeLens} onChange={(event) => setLens(event.target.value as Top10Lens)}>
          {lenses.map((item) => <option value={item} key={item}>{TOP10_LENS_LABELS[item]}</option>)}
        </select>
      </label>
      {!rankings.revenueAvailable && <p className="csv-lens-note">Tệp này không có cột doanh thu nên không có bộ lọc Doanh thu.</p>}
      {!rankings.growthAvailable && <p className="csv-lens-note">Tệp này không có đủ số năm trước để xếp tăng trưởng, nên không có bộ lọc Tăng trưởng.</p>}
      {activeLens === 'revenue' && <p className="csv-lens-note">Chỉ xếp các game trong tệp này, không phải thứ hạng thị trường. Đơn vị tiền tệ: {rankings.revenueCurrencyConfirmed ? (rankings.revenueUnit ?? 'đã xác nhận') : 'chưa xác nhận'}.</p>}
      {activeLens === 'growth' && <p className="csv-lens-note">Tăng trưởng = tăng trưởng tuyệt đối ÷ năm trước, tính lại từ cột gốc. Chỉ {rankings.growthEligibleCount}/{rankings.productCount} game có năm trước; game mới hiện riêng, không xếp %. <strong>Game đánh dấu CẦN KIỂM TRA có năm trước nhỏ hơn 1/11 lượt tải hiện tại (tăng từ 1.000% trở lên): % chỉ tham khảo, số thô vẫn hiển thị.</strong></p>}
      {activeLens === 'combined' && <p className="csv-lens-note">Hiện ba bảng xếp hạng và các game xuất hiện ở nhiều bảng. Không có điểm tổng hợp.</p>}
    </div>

    {highlights.length > 0 && <div className="csv-auto-highlights" aria-label="Điểm nổi bật">
      {highlights.map((item) => <article key={`${activeLens}-${item.id}`} className={`csv-auto-highlight csv-auto-highlight--${item.id}`}>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.detail}</small>
      </article>)}
    </div>}

    <section className="csv-top10" aria-labelledby="csv-top10-title">
      <h4 id="csv-top10-title">{LENS_HEADINGS[activeLens]}</h4>
      {activeLens === 'combined'
        ? <CsvCombinedTop10 rankings={rankings} />
        : lensRows.length
          ? <CsvTop10Insight insight={insight} rows={lensRows} lens={activeLens} />
          : <p className="csv-auto-note">{activeLens === 'growth' ? 'Chưa có game nào có số năm trước để xếp tăng trưởng.' : activeLens === 'revenue' ? 'Chưa có game nào có doanh thu hợp lệ trong tệp.' : 'Chưa có sản phẩm nào có số lượt tải hợp lệ để xếp top 10.'}</p>}
      {renderResearchAction?.(researchSelection)}
    </section>

    <p className="csv-auto-compare-link"><a href={compareHref}>So sánh với kỳ khác →</a></p>

    <details className="csv-auto-technical">
      <summary>Chi tiết kỹ thuật</summary>
      <div className="csv-auto-technical-body">
        <p className="csv-auto-file-context"><span>{provenanceLabel(dataset)}</span> · <span>{eligibleCount}/{dataset.observations.length} dòng đủ metadata để mô tả</span>.</p>
        <p>Số hiển thị là quan sát gốc. Trung vị và khoảng giá trị được tính trong cùng tệp; đây không phải thay đổi theo thời gian, phân tích nguyên nhân hay kết luận thị trường. Không dùng ChatGPT/Codex.</p>

        <h5>Dòng CSV của top 10 lượt tải</h5>
        <ol className="csv-auto-rows">
          {insight.rows.map((row) => <li key={`${row.rank}-${row.name}`}>
            {row.name} · dòng CSV {row.sourceRow ?? 'chưa ghi'}
            {row.growthRatio !== null ? ` · tăng trưởng năm ×${row.growthRatio.toFixed(2)}` : ' · không có số năm trước'}
            {row.growthCheck === 'mismatch' ? ' · ô % không khớp, cần kiểm tra' : ''}
          </li>)}
        </ol>
        <ul>
          <li>Xếp hạng theo lượt tải tuyệt đối trong tệp. Không đại diện cho cả thị trường.</li>
          <li>Tăng trưởng = tăng trưởng tuyệt đối ÷ (lượt tải − tăng trưởng tuyệt đối). Ô % trong CSV chỉ dùng để đối chiếu chữ số.</li>
          <li>Game mới = không có năm trước và ngày phát hành nằm sau mốc so sánh của năm trước. Nhà phát hành và ngày phát hành đọc trực tiếp từ CSV đã lưu.</li>
          <li>Doanh thu của Sensor Tower có thể không gồm quảng cáo: chưa xác minh.</li>
          {insight.unreadableDownloads > 0 && <li>{insight.unreadableDownloads} sản phẩm không có lượt tải hợp lệ nên không được xếp hạng.</li>}
        </ul>

        {hasSignals && <div className="csv-auto-signals">
          <h5>Khoảng giá trị trong tệp</h5>
          {signals.map((signal) => {
            const highName = signal.high.source_entity_name ?? signal.high.entity_name ?? 'Sản phẩm cao nhất';
            const lowName = signal.low.source_entity_name ?? signal.low.entity_name ?? 'Sản phẩm thấp nhất';
            const gap = Number(signal.high.value) - Number(signal.low.value);
            return <article key={`${signal.metric}-${signal.geo}-${signal.platform}-${signal.period}`}>
              <strong>{csvMetricLabel(signal.high.metric_id, signal.metric)} <span>{friendlyGeo(signal.geo)} · {signal.platform}</span></strong>
              <span>{csvSourcePeriodLabel(signal.high)} · {signal.count} sản phẩm</span>
              <p><span>Cao nhất: {highName} · {formatValue(Number(signal.high.value), signal.high.unit)}</span><span>Trung vị: {formatValue(signal.median, signal.high.unit)}</span><span>Thấp nhất: {lowName} · {formatValue(Number(signal.low.value), signal.low.unit)}</span><b>Khoảng giá trị: {formatValue(gap, signal.high.unit)}</b></p>
              <small>Dòng CSV {signal.low.source_row_number ?? '—'} và {signal.high.source_row_number ?? '—'} · phép tính: giá trị cao nhất − thấp nhất</small>
            </article>;
          })}
        </div>}
        {!hasSignals && <p className="csv-auto-note">Chưa có nhóm gồm ít nhất hai sản phẩm cùng chỉ số, phạm vi và kỳ đo. Số gốc vẫn xem được trong bảng.</p>}
        {hasSignals && onOpenSourceRow && <button className="secondary-action" type="button" onClick={() => onOpenSourceRow(signals[0].high.source_row_number ?? undefined)}>Mở dòng CSV {signals[0].high.source_row_number ?? 'trong bảng'} · {signals[0].high.source_entity_name ?? signals[0].high.entity_name}</button>}
      </div>
    </details>
  </section>;
}
