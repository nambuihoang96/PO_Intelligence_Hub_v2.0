import type { QuantitativeObservation } from './api';

export type QuantitativeView = {
  kind: 'comparison' | 'time_series' | 'two_point' | 'period_matrix' | 'ranking' | 'observation';
  label: string;
  observations: { index: number; row: QuantitativeObservation }[];
};

const hasExactScope = (row: QuantitativeObservation) => Boolean(
  row.metric_id && row.metric_definition && row.value !== null && Number.isFinite(row.value)
  && row.unit && row.entity_id && row.geo && row.platform && row.period_start && row.period_end
  && row.granularity && row.source_reference && row.evidence_reference
  && row.complete_observation && row.scope_compatible === true && row.comparison_ready,
);

// Keep methodology and the complete metric definition in the identity. Similar labels
// alone are not enough to compare observations.
function baseKey(row: QuantitativeObservation): string {
  return JSON.stringify([
    row.metric_id, row.metric_definition, row.unit, row.geo, row.platform,
    row.granularity, row.methodology?.trim().toLocaleLowerCase() || '',
  ]);
}

function periodKey(row: QuantitativeObservation): string {
  return `${row.period_start}|${row.period_end}`;
}

function isRanking(row: QuantitativeObservation): boolean {
  const id = row.metric_id?.toLocaleLowerCase() || '';
  const unit = row.unit?.toLocaleLowerCase() || '';
  return /(^|_)(rank|ranking|position)(_|$)/.test(id) || ['rank', 'ranking position', 'position'].includes(unit);
}

function chronological(a: { row: QuantitativeObservation }, b: { row: QuantitativeObservation }): number {
  return (a.row.period_start || '').localeCompare(b.row.period_start || '')
    || (a.row.period_end || '').localeCompare(b.row.period_end || '');
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
    const byPeriod = new Map<string, typeof group>();
    const byEntity = new Map<string, typeof group>();
    for (const point of group) {
      const pKey = periodKey(point.row);
      byPeriod.set(pKey, [...(byPeriod.get(pKey) ?? []), point]);
      const eKey = point.row.entity_id!;
      byEntity.set(eKey, [...(byEntity.get(eKey) ?? []), point]);
    }

    if (group.every(({ row }) => isRanking(row))) {
      for (const period of byPeriod.values()) {
        const comparableEntities = new Set(period.map(({ row }) => row.entity_id)).size;
        views.push({
          kind: comparableEntities >= 2 ? 'ranking' : 'observation',
          label: period[0].row.metric_definition || 'Reported ranking position',
          observations: comparableEntities >= 2 ? [...period].sort((a, b) => Number(a.row.value) - Number(b.row.value)) : [...period],
        });
      }
      continue;
    }

    const distinctPeriods = new Set(group.map(({ row }) => periodKey(row)));
    const entitiesWithMultiplePeriods = [...byEntity.values()].filter((entity) => new Set(entity.map(({ row }) => periodKey(row))).size >= 2);
    const hasMultipleEntities = byEntity.size >= 2;

    // Multi-entity observations across periods are shown as a date-labeled matrix.
    // Missing cells remain empty and each supplied observation retains its own evidence action.
    if (hasMultipleEntities && distinctPeriods.size >= 2) {
      views.push({
        kind: 'period_matrix',
        label: group[0].row.metric_definition || group[0].row.metric_id || 'Reported metric',
        observations: [...group].sort((a, b) => chronological(a, b)
          || (a.row.entity_name || a.row.entity_id || '').localeCompare(b.row.entity_name || b.row.entity_id || '')),
      });
      continue;
    }

    if (entitiesWithMultiplePeriods.length) {
      const series = [...entitiesWithMultiplePeriods[0]].sort(chronological);
      const distinct = new Set(series.map(({ row }) => periodKey(row))).size;
      views.push({
        kind: distinct === 2 ? 'two_point' : 'time_series',
        label: series[0].row.metric_definition || series[0].row.metric_id || 'Reported metric',
        observations: series,
      });
      continue;
    }

    const comparablePeriod = [...byPeriod.values()].find((period) => new Set(period.map(({ row }) => row.entity_id)).size >= 2);
    if (comparablePeriod) {
      const ordered = [...comparablePeriod].sort((a, b) => (a.row.entity_name || a.row.entity_id || '').localeCompare(b.row.entity_name || b.row.entity_id || ''));
      views.push({ kind: 'comparison', label: ordered[0].row.metric_definition || ordered[0].row.metric_id || 'Reported metric', observations: ordered });
    } else if (group.length) {
      // A lone complete observation is still useful as a sourced fact; do not silently omit it.
      views.push({ kind: 'observation', label: group[0].row.metric_definition || group[0].row.metric_id || 'Reported metric', observations: [...group] });
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
