import type { QuantitativeObservation, ResearchData } from './api';
import { selectQuantitativeViews, type QuantitativeView } from './quantitativeAnalytics';

export type AutoPresentationSelection = {
  mode: 'qualitative' | 'needs_review' | 'visual';
  view: QuantitativeView | null;
  chartIndexes: number[];
  featuredIndexes: number[];
  otherIndexes: number[];
  usedSuggestedChart: boolean;
};

/** Chart selection is semantic and metric-agnostic. No metric ID or industry name is special-cased. */
export function selectAutoPresentation(data: ResearchData): AutoPresentationSelection {
  const rows = data.quantitative_observations ?? [];
  const reportRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.observation_type === 'reported');
  const rawIndexes = reportRows.map(({ index }) => index);
  const empty = (mode: AutoPresentationSelection['mode']): AutoPresentationSelection => ({
    mode, view: null, chartIndexes: [], featuredIndexes: [], otherIndexes: rawIndexes, usedSuggestedChart: false,
  });
  if (!reportRows.length) return empty('qualitative');

  // Keep original array indexes when calling selectQuantitativeViews, whose output
  // uses indexes from its own input array.
  const views = selectQuantitativeViews(rows).filter((view) => view.observations.length > 0);
  if (!views.length) return empty('needs_review');

  const suggestions = data.presentation_plan?.chart_observation_indexes ?? [];
  const matched = suggestions.length
    ? views.find((view) => suggestions.every((index) => view.observations.some((point) => point.index === index)))
    : undefined;
  const score = (view: QuantitativeView): number => {
    const kind = view.kind === 'comparison' || view.kind === 'grouped_bar' || view.kind === 'time_series' || view.kind === 'two_point' ? 3
      : view.kind === 'ranking' || view.kind === 'period_matrix' ? 2 : 1;
    return kind * 100 + Math.min(view.observations.length, 20);
  };
  const chosen = matched ?? [...views].sort((a, b) => score(b) - score(a))[0];
  const chartIndexes = chosen.observations.map(({ index }) => index);
  const chartSet = new Set(chartIndexes);
  const preferredKpis = data.presentation_plan?.featured_observation_indexes ?? [];
  const supportedKpis = preferredKpis.filter((index) => chartSet.has(index) && rows[index]?.value != null);
  const kpis = supportedKpis.length ? supportedKpis : [...chartIndexes].sort((a, b) => {
    const ap = rows[a].period_end ?? '', bp = rows[b].period_end ?? '';
    return bp.localeCompare(ap) || a - b;
  });
  // A time-series has one subject observed over multiple periods: prefer the
  // latest value, not three cards suggesting three distinct subjects.
  const picked = chosen.kind === 'time_series' || chosen.kind === 'two_point' ? kpis.slice(0, 1) : kpis.slice(0, 3);

  return {
    mode: 'visual',
    view: chosen,
    chartIndexes,
    featuredIndexes: [...new Set(picked)],
    otherIndexes: rawIndexes.filter((index) => !chartSet.has(index)),
    usedSuggestedChart: Boolean(matched),
  };
}

export function formatAutoValue(row: QuantitativeObservation): string {
  if (row.value === null || !Number.isFinite(row.value)) return 'Chưa có giá trị';
  const abs = Math.abs(row.value);
  let divisor = 1;
  let suffix = '';
  if (abs >= 1_000_000_000) { divisor = 1_000_000_000; suffix = 'tỷ'; }
  else if (abs >= 1_000_000) { divisor = 1_000_000; suffix = 'triệu'; }
  else if (abs >= 10_000) { divisor = 1_000; suffix = 'nghìn'; }
  const formatted = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: divisor > 1 ? 2 : 3 }).format(row.value / divisor);
  return `${row.value_precision === 'approximate' ? '≈' : ''}${formatted}${suffix ? ` ${suffix}` : ''}${row.unit ? ` ${row.unit}` : ''}`;
}
