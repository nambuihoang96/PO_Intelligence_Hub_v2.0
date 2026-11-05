import { describe, expect, it } from 'vitest';
import type { QuantitativeDataset, QuantitativeObservation } from '../reports/api';
import { computeTop10Insight, filenamePeriodEnd, parseCalendarDate, percentCellMatches, top10Highlights } from './top10Insight';

function obs(row: number, metric: string, name: string, value: number | null, extra: Partial<QuantitativeObservation> = {}): QuantitativeObservation {
  return {
    metric_id: metric, metric_definition: metric, value, unit: 'downloads', entity_id: null, entity_name: null,
    source_entity_id: `sensor_tower:id${row}`, source_entity_name: name, source_provider: 'sensor_tower',
    geo: null, platform: 'Unified', period_start: null, period_end: null, snapshot_date: '2026-09-14',
    period_semantics: 'unknown', granularity: null, source_reference: null, verification_status: 'unverified',
    provenance_type: 'csv_dataset', provenance_id: 'd', observation_type: 'imported', validation_reasons: [],
    source_row_number: row, ...extra,
  };
}

// Percent cells are stored as null value with the raw text in the import reason.
function pct(row: number, metric: string, text: string): QuantitativeObservation {
  return obs(row, metric, '', null, { validation_reasons: [`CSV row ${row} has a non-numeric value '${text}'.`, 'Missing numeric value.'] });
}

function dataset(observations: QuantitativeObservation[], filename = 'Top Apps (Sep 14, 2026 - Oct 13, 2026, Worldwide),rutgon.csv'): QuantitativeDataset {
  return {
    id: 'ds', report_id: null, filename, content_sha256: 'x', field_mapping: {}, entity_mappings: {}, observations,
    compatibility_status: 'partial', validation_reasons: [], created_at: '', duplicate: false,
  };
}

// Values copied from the real CSV (rows 2, 3, 4, 6, 7, 15), not invented.
const realLike = dataset([
  obs(2, 'downloads_absolute', 'Meowdoku', 13837982), obs(2, 'downloads_yoy_growth_absolute', 'Meowdoku', 13837982),
  obs(2, 'revenue_absolute', 'Meowdoku', 17501.08), obs(2, 'dau_absolute', 'Meowdoku', 4880848),
  pct(2, 'downloads_yoy_growth_percent', ''),
  obs(3, 'downloads_absolute', 'Color Block', 12549196), obs(3, 'downloads_yoy_growth_absolute', 'Color Block', 11767259),
  obs(3, 'revenue_absolute', 'Color Block', 186.03), obs(3, 'dau_absolute', 'Color Block', 4536333),
  pct(3, 'downloads_yoy_growth_percent', '15.048.858'),
  obs(6, 'downloads_absolute', 'Block Out', 8904102), obs(6, 'downloads_yoy_growth_absolute', 'Block Out', 8897238),
  obs(6, 'revenue_absolute', 'Block Out', 9299108.75), obs(6, 'dau_absolute', 'Block Out', 1272169),
  pct(6, 'downloads_yoy_growth_percent', '1.296.217.657'),
  obs(7, 'downloads_absolute', 'Gossip Harbor', 11798507), obs(7, 'downloads_yoy_growth_absolute', 'Gossip Harbor', 6440415),
  obs(7, 'revenue_absolute', 'Gossip Harbor', 102516544.2), obs(7, 'dau_absolute', 'Gossip Harbor', 9180134),
  pct(7, 'downloads_yoy_growth_percent', '1.201.998'),
  obs(15, 'downloads_absolute', 'Ball Sort', 4434384), obs(15, 'downloads_yoy_growth_absolute', 'Ball Sort', 3344865),
  obs(15, 'revenue_absolute', 'Ball Sort', 103.08), obs(15, 'dau_absolute', 'Ball Sort', 1183657),
  pct(15, 'downloads_yoy_growth_percent', '3.070.038'),
], 'Unified Top Apps Downloads YoY Growth (Sep 14, 2026 - Oct 13, 2026, Worldwide),rutgon.csv');

describe('percentCellMatches', () => {
  it('matches the four real % cells against growth / (absolute - growth)', () => {
    expect(percentCellMatches('15.048.858', 11767259 / 781937)).toBe(true);
    expect(percentCellMatches('1.296.217.657', 8897238 / 6864)).toBe(true);
    expect(percentCellMatches('1.201.998', 6440415 / 5358092)).toBe(true);
    expect(percentCellMatches('3.070.038', 3344865 / 1089519)).toBe(true);
  });

  it('rejects digits that do not match the recalculated ratio', () => {
    expect(percentCellMatches('3.070.039', 3344865 / 1089519)).toBe(false);
  });
});

describe('computeTop10Insight', () => {
  const insight = computeTop10Insight(realLike, '2026-11-05');

  it('ranks by downloads with revenue and DAU as secondary fields', () => {
    expect(insight.rows.map((row) => row.name)).toEqual(['Meowdoku', 'Color Block', 'Gossip Harbor', 'Block Out', 'Ball Sort']);
    expect(insight.rows[0]).toMatchObject({ downloads: 13837982, revenue: 17501.08, dau: 4880848, rank: 1 });
  });

  it('recalculates growth as growth / (absolute - growth) and cross-checks the % cell', () => {
    expect(insight.rows[1].growthRatio).toBeCloseTo(15.048858, 5);
    expect(insight.rows[1].growthCheck).toBe('matched');
    expect(insight.rows[3].growthRatio).toBeCloseTo(1296.2176, 3);
    expect(insight.rows[3].growthCheck).toBe('matched');
    expect(insight.rows[4].growthRatio).toBeCloseTo(3.07004, 4);
  });

  it('counts products with no prior-year downloads when growth equals absolute', () => {
    expect(insight.rows[0].priorDownloads).toBeNull();
    expect(insight.rows[0].growthRatio).toBeNull();
    expect(insight.noPriorCount).toBe(1);
  });

  it('flags growth above absolute and warns when the file period ends after today', () => {
    const bad = dataset([obs(2, 'downloads_absolute', 'A', 100), obs(2, 'downloads_yoy_growth_absolute', 'A', 150)],
      'Unified (Oct 14, 2026 - Nov 13, 2026, Worldwide),x.csv');
    const result = computeTop10Insight(bad, '2026-11-05');
    expect(result.growthExceedsAbsoluteCount).toBe(1);
    expect(result.warnings.join(' ')).toContain('13/11/2026');
    expect(result.warnings.join(' ')).toContain('lớn hơn lượt tải');
  });

  it('keeps GEO and period unconfirmed when the file does not state them', () => {
    expect(insight.geoConfirmed).toBeNull();
    expect(insight.periodConfirmed).toBeNull();
    expect(insight.snapshotDate).toBe('2026-09-14');
  });

  it('never treats a 0 revenue as zero earnings, only flags it', () => {
    const zero = computeTop10Insight(dataset([obs(4, 'downloads_absolute', 'Arrows GO!', 9362027), obs(4, 'revenue_absolute', 'Arrows GO!', 0)]), '2026-11-05');
    expect(zero.rows[0].zeroRevenue).toBe(true);
  });

  it('reads the filename period end only as a warning input', () => {
    expect(filenamePeriodEnd('x (Sep 14, 2026 - Oct 13, 2026, Worldwide).csv')).toBe('2026-10-13');
    expect(filenamePeriodEnd('no period here.csv')).toBeNull();
  });

  it('calls a game new only when its release date fits the prior-year gap', () => {
    const fits = dataset([obs(2, 'downloads_absolute', 'Meowdoku', 100), obs(2, 'downloads_yoy_growth_absolute', 'Meowdoku', 100),
      obs(2, 'source_publisher', 'x', null)].slice(0, 2).map((item) => ({ ...item, source_release_date: item.metric_id === 'downloads_absolute' ? '25/04/2026' : null })));
    expect(computeTop10Insight(fits, '2026-11-05').rows[0].newStatus).toBe('new');
  });

  it('does not call a game new when its release date is before the prior-year reference (Pocket Sort case)', () => {
    const pocket = dataset([obs(23, 'downloads_absolute', 'Pocket Sort', 100), obs(23, 'downloads_yoy_growth_absolute', 'Pocket Sort', 100)]);
    pocket.observations.forEach((item) => { item.source_release_date = '05/09/2025'; });
    const result = computeTop10Insight(pocket, '2026-11-05');
    expect(result.rows[0].newStatus).toBe('release_conflict');
    expect(result.newCount).toBe(0);
    expect(result.checkCount).toBe(1);
  });

  it('keeps no-prior games without a release date as unknown, never new', () => {
    expect(computeTop10Insight(realLike, '2026-11-05').rows[0].newStatus).toBe('release_unknown');
  });

  it('finds repeated publishers inside the top 10, case-insensitively', () => {
    const pub = dataset([
      obs(2, 'downloads_absolute', 'A', 300), obs(2, 'revenue_absolute', 'A', 1),
      obs(3, 'downloads_absolute', 'B', 200), obs(3, 'revenue_absolute', 'B', 1),
      obs(4, 'downloads_absolute', 'C', 100), obs(4, 'revenue_absolute', 'C', 1),
    ]);
    pub.observations.forEach((item) => { item.source_publisher_name = item.source_row_number === 4 ? 'other' : (item.source_row_number === 2 ? 'Learnings' : 'LEARNINGS'); });
    const result = computeTop10Insight(pub, '2026-11-05');
    expect(result.repeatedPublishers).toEqual([{ publisher: 'Learnings', count: 2, games: ['A', 'B'] }]);
  });

  it('names every tied publisher in the highlight, not only the first', () => {
    const pub = dataset([
      obs(2, 'downloads_absolute', 'A', 400), obs(3, 'downloads_absolute', 'B', 300),
      obs(4, 'downloads_absolute', 'C', 200), obs(5, 'downloads_absolute', 'D', 100),
    ]);
    pub.observations.forEach((item) => { item.source_publisher_name = (item.source_row_number ?? 0) <= 3 ? 'Learnings' : 'Grand Games'; });
    const highlight = top10Highlights(computeTop10Insight(pub, '2026-11-05')).find((item) => item.id === 'publisher');
    expect(highlight?.value).toBe('Grand Games, Learnings');
    expect(highlight?.detail).toBe('Grand Games: 2 game · Learnings: 2 game');
  });

  it('reports an unreadable snapshot date in Vietnamese instead of a broken date', () => {
    const bad = dataset([obs(2, 'downloads_absolute', 'A', 100, { snapshot_date: '14/9' })]);
    const result = computeTop10Insight(bad, '2026-11-05');
    expect(result.snapshotDate).toBeNull();
    expect(result.invalidSnapshotText).toContain('không đọc được');
    expect(result.warnings.join(' ')).toContain('không đọc được');
  });

  it('shows period and GEO only when marked PO-confirmed', () => {
    const confirmed = dataset([obs(2, 'downloads_absolute', 'A', 100, {
      geo: 'Worldwide', period_semantics: 'reporting_interval', period_start: '2026-09-14', period_end: '2026-10-13',
      metadata_provenance: { geo: { basis: 'po_confirmed' }, period_start: { basis: 'po_confirmed' } },
    })]);
    const result = computeTop10Insight(confirmed, '2026-11-05');
    expect(result.periodConfirmed).toEqual({ start: '2026-09-14', end: '2026-10-13' });
    expect(result.geoConfirmed).toBe('Worldwide');
    expect(result.referenceSource).toBe('period_end');
  });

  it('rejects impossible calendar dates', () => {
    expect(parseCalendarDate('31/02/2026')).toBeNull();
    expect(parseCalendarDate('05/09/2025')).toBe('2025-09-05');
    expect(parseCalendarDate('2026-09-14')).toBe('2026-09-14');
  });
});
