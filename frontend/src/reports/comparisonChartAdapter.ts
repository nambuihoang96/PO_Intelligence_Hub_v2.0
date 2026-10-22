import type { QuantitativeComparisonPreview, QuantitativeComparisonRow } from './api';

export type ComparisonChartType = 'baseline_current' | 'absolute_change' | 'percentage_change';
export type ComparisonChartPoint = {
  key: string;
  label: string;
  row: QuantitativeComparisonRow;
  baseline: number | null;
  current: number | null;
  absoluteChange: number | null;
  percentageChange: number | null;
};

/** Thin presentation adapter. M2 remains the authority for matching and all calculations. */
export function adaptComparisonForChart(preview: QuantitativeComparisonPreview): ComparisonChartPoint[] {
  return preview.rows.map((row) => ({
    key: row.entity_key,
    label: row.entity_name || row.entity_key,
    row,
    baseline: row.baseline?.value ?? null,
    current: row.current?.value ?? null,
    absoluteChange: row.absolute_change,
    percentageChange: row.percentage_change,
  }));
}

export function chartEligible(point: ComparisonChartPoint, type: ComparisonChartType): boolean {
  if (point.row.status !== 'comparable') return false;
  if (type === 'baseline_current') return point.baseline !== null && point.current !== null && point.baseline >= 0 && point.current >= 0;
  if (type === 'absolute_change') return point.absoluteChange !== null;
  return point.percentageChange !== null;
}
