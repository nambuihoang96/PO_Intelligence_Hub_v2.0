import { describe, expect, it } from 'vitest';
import { adaptComparisonForChart, chartEligible } from './comparisonChartAdapter';
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
});
