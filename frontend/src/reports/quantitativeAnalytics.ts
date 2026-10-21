import type { QuantitativeObservation } from './api';

export type QuantitativeView = {
  kind: 'comparison' | 'grouped_bar' | 'time_series' | 'two_point' | 'period_matrix' | 'ranking' | 'observation';
  label: string;
  observations: { index: number; row: QuantitativeObservation }[];
  explanation?: string;
};

function validPeriod(row: QuantitativeObservation): boolean {
  const dateOnly = (value: string | null) => value !== null
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!dateOnly(row.period_start) || !dateOnly(row.period_end)) return false;
  const start = Date.parse(`${row.period_start}T00:00:00Z`);
  const end = Date.parse(`${row.period_end}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) && start <= end;
}

const hasRenderableScope = (row: QuantitativeObservation) => Boolean(
  row.metric_id && row.metric_definition && row.value !== null && Number.isFinite(row.value)
  && row.unit && row.entity_id && row.geo && row.platform && validPeriod(row)
  && row.source_reference && row.evidence_reference
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

function periodsOverlap(points: ({ row: QuantitativeObservation } | QuantitativeObservation)[]): boolean {
  const rows = points.map((point) => ('row' in point ? point.row : point));
  const periods = [...new Map(rows.map((row) => [periodKey(row), row])).values()]
    .sort((a, b) => (a.period_start || '').localeCompare(b.period_start || '')
      || (a.period_end || '').localeCompare(b.period_end || ''));
  let latestEnd = '';
  for (const period of periods) {
    if (latestEnd && latestEnd >= (period.period_start || '')) return true;
    if ((period.period_end || '') > latestEnd) latestEnd = period.period_end || '';
  }
  return false;
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
  const eligible = rows.flatMap((row, index) => hasRenderableScope(row) ? [{ index, row }] : []);
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
    const hasNegativeValues = group.some(({ row }) => (row.value ?? 0) < 0);

    // Multi-entity observations across periods are shown as a date-labeled matrix.
    // Missing cells remain empty and each supplied observation retains its own evidence action.
    if (hasMultipleEntities && distinctPeriods.size === 2 && !hasNegativeValues) {
      const overlapping = periodsOverlap(group);
      views.push({
        kind: overlapping ? 'period_matrix' : 'grouped_bar',
        label: group[0].row.metric_definition || group[0].row.metric_id || 'Reported metric',
        observations: [...group].sort((a, b) => chronological(a, b)
          || (a.row.entity_name || a.row.entity_id || '').localeCompare(b.row.entity_name || b.row.entity_id || '')),
        ...(overlapping ? { explanation: 'Measurement windows overlap. Exact dates are shown in a table; values are not presented as consecutive periods or a growth trend.' } : {}),
      });
      continue;
    }

    if (hasNegativeValues || (hasMultipleEntities && distinctPeriods.size >= 2)) {
      views.push({
        kind: 'period_matrix',
        label: group[0].row.metric_definition || group[0].row.metric_id || 'Reported metric',
        observations: [...group].sort((a, b) => chronological(a, b)
          || (a.row.entity_name || a.row.entity_id || '').localeCompare(b.row.entity_name || b.row.entity_id || '')),
        explanation: hasNegativeValues
          ? 'Signed values are shown in a table so negative measurements cannot look like positive-width bars.'
          : 'The entities do not share one compatible pair of period windows. Exact dates are preserved in a comparison table.',
      });
      continue;
    }

    if (entitiesWithMultiplePeriods.length) {
      const series = [...entitiesWithMultiplePeriods[0]].sort(chronological);
      const distinct = new Set(series.map(({ row }) => periodKey(row))).size;
      const entityHasOverlap = periodsOverlap(series);
      if (entityHasOverlap || hasNegativeValues) {
        views.push({
          kind: 'period_matrix',
          label: series[0].row.metric_definition || series[0].row.metric_id || 'Reported metric',
          observations: series,
          explanation: entityHasOverlap
            ? 'Measurement windows overlap. These values are shown as separate dated observations instead of a connected trend.'
            : 'Signed values are shown in a table so negative measurements cannot look like positive-width bars.',
        });
        continue;
      }
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
  const reasons = new Set(rows.filter((row) => !hasRenderableScope(row)).flatMap((row) => row.validation_reasons));
  const byGranularityFreeIdentity = new Map<string, Set<string>>();
  for (const row of rows.filter(hasRenderableScope)) {
    const identity = JSON.stringify([row.metric_id, row.metric_definition, row.unit, row.geo, row.platform, row.methodology?.trim().toLocaleLowerCase() || '']);
    const granularities = byGranularityFreeIdentity.get(identity) ?? new Set<string>();
    granularities.add(row.granularity?.trim().toLocaleLowerCase() || '(not supplied)');
    byGranularityFreeIdentity.set(identity, granularities);
  }
  if ([...byGranularityFreeIdentity.values()].some((values) => values.size > 1)) {
    reasons.add('Known granularity is inconsistent or missing within otherwise similar observations; observations remain in separate views.');
  }
  if (rows.some((row) => row.value !== null && row.value < 0)) {
    reasons.add('Negative values are shown with their sign in a table or signed comparison; they are not treated as positive downloads.');
  }
  const rowsByEntity = new Map<string, QuantitativeObservation[]>();
  for (const row of rows.filter(hasRenderableScope)) rowsByEntity.set(row.entity_id!, [...(rowsByEntity.get(row.entity_id!) ?? []), row]);
  if ([...rowsByEntity.values()].some((entityRows) => periodsOverlap(entityRows))) {
    reasons.add('Overlapping measurement windows are not connected as consecutive time points.');
  }
  if (rows.some((row) => !row.scope_compatible && !row.validation_reasons.some((reason) => /scope|GEO|platform/i.test(reason)))) {
    reasons.add('Observation scope is not confirmed as compatible with this report.');
  }
  if (rows.length && selectQuantitativeViews(rows).length === 0 && reasons.size === 0) {
    reasons.add('There are not enough compatible observations for a comparison or time-based view.');
  }
  return [...reasons];
}
