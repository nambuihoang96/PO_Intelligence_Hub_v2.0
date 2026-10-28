import type { QuantitativeComparisonPreview, QuantitativeComparisonRow } from './api';

export type ComparisonChartType = 'baseline_current' | 'absolute_change' | 'percentage_change';
export type ComparisonChartSort = 'name' | 'current_desc' | 'baseline_desc' | 'increase_desc' | 'decrease_asc' | 'percentage_desc' | 'percentage_asc';
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

export function defaultComparisonSort(type: ComparisonChartType): ComparisonChartSort {
  if (type === 'baseline_current') return 'current_desc';
  if (type === 'absolute_change') return 'increase_desc';
  return 'percentage_desc';
}

export function comparisonSortLabel(sort: ComparisonChartSort, unit: string | null): string {
  switch (sort) {
    case 'name': return 'tên sản phẩm theo thứ tự A–Z';
    case 'current_desc': return `giá trị kỳ hiện tại cao nhất${unit ? ` (${unit})` : ''}`;
    case 'baseline_desc': return `giá trị kỳ trước cao nhất${unit ? ` (${unit})` : ''}`;
    case 'increase_desc': return `mức tăng lớn nhất${unit ? ` (${unit})` : ''}`;
    case 'decrease_asc': return `mức giảm lớn nhất${unit ? ` (${unit})` : ''}`;
    case 'percentage_desc': return 'phần trăm thay đổi hợp lệ cao nhất';
    case 'percentage_asc': return 'phần trăm thay đổi hợp lệ thấp nhất';
  }
}

function compareNames(a: ComparisonChartPoint, b: ComparisonChartPoint): number {
  const left = a.label.toLocaleLowerCase('en');
  const right = b.label.toLocaleLowerCase('en');
  if (left !== right) return left < right ? -1 : 1;
  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}

/** Sorts values supplied by M2 and resolves ties by app name then stable source key. */
export function sortComparisonPoints(points: ComparisonChartPoint[], sort: ComparisonChartSort): ComparisonChartPoint[] {
  return [...points].sort((a, b) => {
    let difference = 0;
    switch (sort) {
      case 'current_desc': difference = (b.current ?? Number.NEGATIVE_INFINITY) - (a.current ?? Number.NEGATIVE_INFINITY); break;
      case 'baseline_desc': difference = (b.baseline ?? Number.NEGATIVE_INFINITY) - (a.baseline ?? Number.NEGATIVE_INFINITY); break;
      case 'increase_desc': difference = (b.absoluteChange ?? Number.NEGATIVE_INFINITY) - (a.absoluteChange ?? Number.NEGATIVE_INFINITY); break;
      case 'decrease_asc': difference = (a.absoluteChange ?? Number.POSITIVE_INFINITY) - (b.absoluteChange ?? Number.POSITIVE_INFINITY); break;
      case 'percentage_desc': difference = (b.percentageChange ?? Number.NEGATIVE_INFINITY) - (a.percentageChange ?? Number.NEGATIVE_INFINITY); break;
      case 'percentage_asc': difference = (a.percentageChange ?? Number.POSITIVE_INFINITY) - (b.percentageChange ?? Number.POSITIVE_INFINITY); break;
      case 'name': return compareNames(a, b);
    }
    return difference || compareNames(a, b);
  });
}
