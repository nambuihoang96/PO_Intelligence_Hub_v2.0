import type { QuantitativeObservation } from './api';

export type QuantitativeView = {
  kind: 'comparison' | 'time_series' | 'two_point' | 'ranking';
  label: string;
  observations: { index: number; row: QuantitativeObservation }[];
};

const hasExactScope = (row: QuantitativeObservation) => Boolean(
  row.metric_id && row.metric_definition && row.value !== null && Number.isFinite(row.value)
  && row.unit && row.entity_id && row.geo && row.platform && row.period_start && row.period_end
  && row.granularity && row.source_reference && row.evidence_reference
  && row.complete_observation && row.scope_compatible === true && row.comparison_ready,
);

function baseKey(row: QuantitativeObservation): string {
  return JSON.stringify([
    row.metric_id, row.metric_definition, row.unit, row.geo, row.platform,
    row.granularity, row.methodology?.trim().toLocaleLowerCase() || '',
  ]);
}

function isRanking(row: QuantitativeObservation): boolean {
  const id = row.metric_id?.toLocaleLowerCase() || '';
  const unit = row.unit?.toLocaleLowerCase() || '';
  return /(^|_)(rank|ranking|position)(_|$)/.test(id) || ['rank', 'ranking position', 'position'].includes(unit);
}

export function selectQuantitativeViews(rows: QuantitativeObservation[]): QuantitativeView[] {
  const eligible = rows.flatMap((row, index) => hasExactScope(row) ? [{ index, row }] : []);
  const groups = new Map<string, typeof eligible>();
  for (const point of eligible) {
    const key = baseKey(point.row);
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }

  const views: QuantitativeView[] = [];
  for (const group of groups.values()) {
    const periods = new Map<string, typeof group>();
    for (const point of group) {
      const key = `${point.row.period_start}|${point.row.period_end}`;
      periods.set(key, [...(periods.get(key) ?? []), point]);
    }
    const allRanked = group.every(({ row }) => isRanking(row));
    if (allRanked && group.length >= 2) {
      for (const samePeriod of periods.values()) {
        if (new Set(samePeriod.map(({ row }) => row.entity_id)).size >= 2) {
          views.push({ kind: 'ranking', label: samePeriod[0].row.metric_definition || 'Reported ranking position', observations: [...samePeriod].sort((a, b) => Number(a.row.value) - Number(b.row.value)) });
        }
      }
      continue;
    }

    const byEntity = new Map<string, typeof group>();
    for (const point of group) byEntity.set(point.row.entity_id!, [...(byEntity.get(point.row.entity_id!) ?? []), point]);
    const series = [...byEntity.values()].find((items) => new Set(items.map(({ row }) => `${row.period_start}|${row.period_end}`)).size >= 2);
    if (series) {
      const ordered = [...series].sort((a, b) => (a.row.period_start || '').localeCompare(b.row.period_start || ''));
      const distinctPeriods = new Set(ordered.map(({ row }) => `${row.period_start}|${row.period_end}`)).size;
      views.push({ kind: distinctPeriods === 2 ? 'two_point' : 'time_series', label: ordered[0].row.metric_definition || ordered[0].row.metric_id || 'Reported metric', observations: ordered });
      continue;
    }

    const comparablePeriod = [...periods.values()].find((items) => new Set(items.map(({ row }) => row.entity_id)).size >= 2);
    if (comparablePeriod) {
      const ordered = [...comparablePeriod].sort((a, b) => (a.row.entity_name || a.row.entity_id || '').localeCompare(b.row.entity_name || b.row.entity_id || ''));
      views.push({ kind: 'comparison', label: ordered[0].row.metric_definition || ordered[0].row.metric_id || 'Reported metric', observations: ordered });
    }
  }
  return views;
}

export function quantitativeLimitations(rows: QuantitativeObservation[]): string[] {
  const reasons = new Set(rows.filter((row) => !hasExactScope(row)).flatMap((row) => row.validation_reasons));
  if (rows.some((row) => !row.scope_compatible && !row.validation_reasons.some((reason) => /scope|GEO|platform/i.test(reason)))) {
    reasons.add('Observation scope is not confirmed as compatible with this report.');
  }
  if (rows.length && selectQuantitativeViews(rows).length === 0 && reasons.size === 0) {
    reasons.add('There are not enough compatible observations for a comparison or time-based view.');
  }
  return [...reasons];
}
