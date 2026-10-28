import { describe, expect, it } from 'vitest';
import { adaptComparisonForChart, chartEligible, comparisonSortLabel, defaultComparisonSort, sortComparisonPoints } from './comparisonChartAdapter';
import type { QuantitativeComparisonPreview } from './api';

const base = { value: 0, unit: 'downloads' } as const;
const preview = {
  rows: [
    { entity_key: 'paired', entity_name: 'Paired', status: 'comparable', baseline: { ...base, value: 0 }, current: { ...base, value: 5 }, absolute_change: 5, percentage_change: null, evidence: [{ dataset_id: 'old' }, { dataset_id: 'new' }] },
    { entity_key: 'missing', entity_name: 'Missing baseline', status: 'missing_baseline', baseline: null, current: { ...base, value: 5 }, absolute_change: null, percentage_change: null, evidence: [{ dataset_id: 'new' }] },
    { entity_key: 'signed', entity_name: 'Signed metric', status: 'comparable', baseline: { ...base, value: -5 }, current: { ...base, value: -8 }, absolute_change: -3, percentage_change: null, evidence: [{ dataset_id: 'old' }, { dataset_id: 'new' }] },
  ],
} as unknown as QuantitativeComparisonPreview;

describe('CSV comparison chart adapter', () => {
  it('passes backend values and source row references through without recalculation', () => {
    const points = adaptComparisonForChart(preview);
    expect(points[0].absoluteChange).toBe(5);
    expect(points[0].percentageChange).toBeNull();
    expect(points[0].row.evidence).toBe(preview.rows[0].evidence);
  });

  it('keeps missing rows out of bars and signed source values out of baseline/current bars', () => {
    const points = adaptComparisonForChart(preview);
    expect(points.filter((point) => chartEligible(point, 'baseline_current')).map((point) => point.key)).toEqual(['paired']);
    expect(points.filter((point) => chartEligible(point, 'absolute_change')).map((point) => point.key)).toEqual(['paired', 'signed']);
  });

  it('chooses an informative default and sorts baseline/current by the selected measurement', () => {
    const points = adaptComparisonForChart({ rows: [
      { ...preview.rows[0], entity_key: 'a', entity_name: 'Alphabetical First', baseline: { ...base, value: 100 }, current: { ...base, value: 10 } },
      { ...preview.rows[0], entity_key: 'z', entity_name: 'Zebra Leader', baseline: { ...base, value: 20 }, current: { ...base, value: 500 } },
      { ...preview.rows[0], entity_key: 'm', entity_name: 'Middle', baseline: { ...base, value: 100 }, current: { ...base, value: 500 } },
    ] } as unknown as QuantitativeComparisonPreview);
    expect(defaultComparisonSort('baseline_current')).toBe('current_desc');
    expect(sortComparisonPoints(points, 'current_desc').map((point) => point.key)).toEqual(['m', 'z', 'a']);
    expect(sortComparisonPoints(points, 'baseline_desc').map((point) => point.key)).toEqual(['a', 'm', 'z']);
    expect(sortComparisonPoints(points, 'name').map((point) => point.key)).toEqual(['a', 'm', 'z']);
    expect(comparisonSortLabel('current_desc', 'downloads')).toBe('giá trị kỳ hiện tại cao nhất (downloads)');
  });

  it('sorts increases, decreases and valid percentages with deterministic ties and null percentages last', () => {
    const points = adaptComparisonForChart({ rows: [
      { ...preview.rows[0], entity_key: 'b', entity_name: 'Beta', absolute_change: 9, percentage_change: -4 },
      { ...preview.rows[0], entity_key: 'z', entity_name: 'Zebra', absolute_change: 12, percentage_change: 30 },
      { ...preview.rows[0], entity_key: 'a', entity_name: 'Alpha', absolute_change: 12, percentage_change: 30 },
      { ...preview.rows[0], entity_key: 'n', entity_name: 'No percent', absolute_change: -6, percentage_change: null },
      { ...preview.rows[0], entity_key: 'c', entity_name: 'Charlie', absolute_change: -6, percentage_change: -10 },
    ] } as unknown as QuantitativeComparisonPreview);
    expect(defaultComparisonSort('absolute_change')).toBe('increase_desc');
    expect(defaultComparisonSort('percentage_change')).toBe('percentage_desc');
    expect(sortComparisonPoints(points, 'increase_desc').map((point) => point.key)).toEqual(['a', 'z', 'b', 'c', 'n']);
    expect(sortComparisonPoints(points, 'decrease_asc').map((point) => point.key)).toEqual(['c', 'n', 'b', 'a', 'z']);
    expect(sortComparisonPoints(points, 'percentage_desc').map((point) => point.key)).toEqual(['a', 'z', 'b', 'c', 'n']);
    expect(sortComparisonPoints(points, 'percentage_asc').map((point) => point.key)).toEqual(['c', 'b', 'a', 'z', 'n']);
  });
});
