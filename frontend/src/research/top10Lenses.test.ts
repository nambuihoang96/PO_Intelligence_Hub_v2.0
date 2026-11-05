import { describe, expect, it } from 'vitest';
import type { QuantitativeDataset, QuantitativeObservation } from '../reports/api';
import { availableLenses, computeTop10Rankings, rowsForLens, top10HighlightsForLens, computeTop10Insight } from './top10Insight';

function obs(row: number, metric: string, name: string, value: number | null, extra: Partial<QuantitativeObservation> = {}): QuantitativeObservation {
  return {
    metric_id: metric, metric_definition: metric, value, unit: metric === 'revenue_absolute' ? 'USD?' : 'downloads', entity_id: null, entity_name: null,
    source_entity_id: `sensor_tower:id${row}`, source_entity_name: name, source_provider: 'sensor_tower',
    geo: null, platform: 'Unified', period_start: null, period_end: null, snapshot_date: '2026-09-14',
    period_semantics: 'unknown', granularity: null, source_reference: null, verification_status: 'unverified',
    provenance_type: 'csv_dataset', provenance_id: 'd', observation_type: 'imported', validation_reasons: [],
    source_row_number: row, ...extra,
  };
}

function pct(row: number, text: string): QuantitativeObservation {
  return obs(row, 'downloads_yoy_growth_percent', '', null, { validation_reasons: [`CSV row ${row} has a non-numeric value '${text}'.`] });
}

function dataset(observations: QuantitativeObservation[]): QuantitativeDataset {
  return {
    id: 'ds', report_id: null, filename: 'Top Apps (Sep 14, 2026 - Oct 13, 2026, Worldwide).csv', content_sha256: 'x', field_mapping: {}, entity_mappings: {}, observations,
    compatibility_status: 'partial', validation_reasons: [], created_at: '', duplicate: false,
  };
}

// Four games. Downloads: A 1000, B 800, C 600, D 300.
// Growth: A prior 500 (×1.0), B no prior (new), C prior 540 (×0.111), D prior 150 (×1.0).
// Revenue: B 900, A 50, D 10; C has no revenue value.
const sample = dataset([
  obs(1, 'downloads_absolute', 'Alpha', 1000), obs(1, 'downloads_yoy_growth_absolute', 'Alpha', 500), obs(1, 'revenue_absolute', 'Alpha', 50), pct(1, '100'),
  obs(2, 'downloads_absolute', 'Bravo', 800), obs(2, 'downloads_yoy_growth_absolute', 'Bravo', 800), obs(2, 'revenue_absolute', 'Bravo', 900), pct(2, '8'),
  obs(3, 'downloads_absolute', 'Charlie', 600), obs(3, 'downloads_yoy_growth_absolute', 'Charlie', 60), pct(3, '11'),
  obs(4, 'downloads_absolute', 'Delta', 300), obs(4, 'downloads_yoy_growth_absolute', 'Delta', 150), obs(4, 'revenue_absolute', 'Delta', 10), pct(4, '100'),
]);

describe('computeTop10Rankings', () => {
  it('ranks each filter by its own arithmetic and keeps new games out of the % ranking', () => {
    const rankings = computeTop10Rankings(sample, '2026-11-05');
    expect(rankings.downloads.map((row) => row.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(rankings.revenue.map((row) => row.name)).toEqual(['Bravo', 'Alpha', 'Delta']);
    expect(rankings.growth.map((row) => row.name)).toEqual(['Alpha', 'Delta', 'Charlie']);
    expect(rankings.growth[0].growthRatio).toBe(1);
    expect(rankings.growthEligibleCount).toBe(3);
    expect(rankings.newGames.map((row) => row.name)).toEqual(['Bravo']);
    expect(rankings.growth.some((row) => row.name === 'Bravo')).toBe(false);
  });

  it('lists games that appear in more than one ranking, without a composite score', () => {
    const rankings = computeTop10Rankings(sample, '2026-11-05');
    const overlap = Object.fromEntries(rankings.overlap.map((item) => [item.name, item.lists.length]));
    expect(overlap).toEqual({ Alpha: 3, Bravo: 2, Charlie: 2, Delta: 3 });
  });

  it('keeps revenue currency unconfirmed until the PO confirms it', () => {
    const rankings = computeTop10Rankings(sample, '2026-11-05');
    expect(rankings.revenueCurrencyConfirmed).toBe(false);
    expect(rankings.revenueAvailable).toBe(true);
  });

  it('hides the revenue and growth filters when the file lacks those metrics', () => {
    const downloadsOnly = dataset([obs(1, 'downloads_absolute', 'Alpha', 1000), obs(2, 'downloads_absolute', 'Bravo', 800)]);
    const rankings = computeTop10Rankings(downloadsOnly, '2026-11-05');
    expect(rankings.revenueAvailable).toBe(false);
    expect(rankings.growthAvailable).toBe(false);
    expect(availableLenses(rankings)).toEqual(['downloads']);
    expect(availableLenses(computeTop10Rankings(sample, '2026-11-05'))).toEqual(['downloads', 'revenue', 'growth', 'combined']);
  });

  it('gives Kết hợp no single top 10 list to research', () => {
    const rankings = computeTop10Rankings(sample, '2026-11-05');
    expect(rowsForLens(rankings, 'combined')).toEqual([]);
    expect(rowsForLens(rankings, 'growth').map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('keeps the downloads ranking identical to the existing top 10 insight', () => {
    const insight = computeTop10Insight(sample, '2026-11-05');
    expect(computeTop10Rankings(sample, '2026-11-05').downloads).toEqual(insight.rows);
  });
});

describe('top10HighlightsForLens', () => {
  it('states the growth leader as a recalculated percentage and lists new games apart', () => {
    const rankings = computeTop10Rankings(sample, '2026-11-05');
    const cards = top10HighlightsForLens('growth', computeTop10Insight(sample, '2026-11-05'), rankings);
    expect(cards.find((card) => card.id === 'leader')).toMatchObject({ label: 'Tăng trưởng cao nhất (có năm trước)', value: '+100%' });
    expect(cards.find((card) => card.label.startsWith('Game mới'))?.detail).toBe('Bravo');
  });

  it('marks the revenue value unit as unconfirmed', () => {
    const rankings = computeTop10Rankings(sample, '2026-11-05');
    const cards = top10HighlightsForLens('revenue', computeTop10Insight(sample, '2026-11-05'), rankings);
    expect(cards[0]).toMatchObject({ value: 'Bravo' });
    expect(cards[0].detail).toContain('chưa xác nhận');
  });
});

describe('small prior-year base warning', () => {
  it('flags growth of 10x or more and keeps the raw percentage', () => {
    // Prior = 1,000 - 10,000 is negative, so use prior 100 with growth 10,000 → ratio 100 (flagged).
    const tiny = dataset([
      obs(1, 'downloads_absolute', 'Tiny', 10100), obs(1, 'downloads_yoy_growth_absolute', 'Tiny', 10000),
      obs(2, 'downloads_absolute', 'Normal', 1000), obs(2, 'downloads_yoy_growth_absolute', 'Normal', 500),
    ]);
    const rankings = computeTop10Rankings(tiny, '2026-11-05');
    const tinyRow = rankings.growth.find((row) => row.name === 'Tiny');
    expect(tinyRow?.growthRatio).toBe(100);
    expect(tinyRow?.smallBaseGrowth).toBe(true);
    expect(rankings.growth.find((row) => row.name === 'Normal')?.smallBaseGrowth).toBe(false);
    const cards = top10HighlightsForLens('growth', computeTop10Insight(tiny, '2026-11-05'), rankings);
    expect(cards.find((card) => card.id === 'leader')?.value).toBe('+10.000%');
    expect(cards.find((card) => card.id === 'leader')?.detail).toContain('CẦN KIỂM TRA');
  });
});
