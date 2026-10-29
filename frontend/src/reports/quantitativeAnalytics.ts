import type { QuantitativeObservation } from './api';

export type QuantitativeView = {
  kind: 'comparison' | 'scope_comparison' | 'grouped_bar' | 'time_series' | 'two_point' | 'period_matrix' | 'ranking' | 'observation';
  dimension?: 'geo' | 'platform';
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
          label: period[0].row.metric_definition || 'Vị trí xếp hạng được báo cáo',
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
        ...(overlapping ? { explanation: 'Các kỳ đo bị chồng lấn. Ngày chính xác được hiển thị trong bảng; các giá trị không được coi là kỳ liên tiếp hoặc xu hướng tăng trưởng.' } : {}),
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
          ? 'Giá trị có dấu được hiển thị trong bảng để số âm không bị hiểu nhầm thành cột dương.'
          : 'Các đối tượng không có cùng một cặp kỳ tương thích. Ngày chính xác được giữ trong bảng so sánh.',
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
            ? 'Các kỳ đo bị chồng lấn. Giá trị được hiển thị thành từng quan sát có ngày riêng, không nối thành xu hướng.'
            : 'Giá trị có dấu được hiển thị trong bảng để số âm không bị hiểu nhầm thành cột dương.',
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
  // Cross-GEO/platform comparisons can be valid, but only when the dimension
  // under comparison is the *sole* material scope difference. Retain identical
  // metric, methodology, period, entity, source and the other scope dimension.
  // This is dimension-driven, not an eCPM/IAP/retention name check.
  const scopeViews: QuantitativeView[] = [];
  for (const dimension of ['geo', 'platform'] as const) {
    const groups = new Map<string, typeof eligible>();
    for (const point of eligible) {
      const row = point.row;
      const dimensionValue = row[dimension];
      if (!dimensionValue || (row.value ?? 0) < 0) continue;
      const key = JSON.stringify([
        row.metric_id, row.metric_definition, row.unit,
        row.methodology?.trim().toLocaleLowerCase() || '',
        row.granularity, row.period_start, row.period_end,
        row.period_semantics, row.entity_id, row.source_reference,
        row.evidence_reference, row.source_provider,
        dimension === 'geo' ? row.platform : row.geo,
      ]);
      groups.set(key, [...(groups.get(key) ?? []), point]);
    }
    for (const group of groups.values()) {
      const labels = group.map(({ row }) => row[dimension]);
      if (group.length < 2 || labels.some((value) => !value) || new Set(labels).size !== group.length) continue;
      scopeViews.push({
        kind: 'scope_comparison',
        dimension,
        label: group[0].row.metric_definition || group[0].row.metric_id || 'Quan sát',
        observations: [...group].sort((a, b) => (a.row[dimension] || '').localeCompare(b.row[dimension] || '')),
        explanation: `Các quan sát chỉ khác ${dimension === 'geo' ? 'GEO' : 'nền tảng'}; cùng chỉ số, kỳ đo, đối tượng, phương pháp và nguồn. Đây là các giá trị do báo cáo cung cấp, chưa xác minh.`,
      });
    }
  }
  // A single-value chart duplicates data already represented by a valid
  // across-scope comparison. Keep non-singleton views and show scope groups once.
  const covered = new Set(scopeViews.flatMap((view) => view.observations.map(({ index }) => index)));
  const distinctViews = views.filter((view) => !(view.kind === 'observation' && view.observations.every(({ index }) => covered.has(index))));
  return [...scopeViews, ...distinctViews];
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
    reasons.add('Chu kỳ đo không nhất quán hoặc còn thiếu giữa các quan sát có vẻ tương tự; các quan sát vẫn được hiển thị riêng.');
  }
  if (rows.some((row) => row.value !== null && row.value < 0)) {
    reasons.add('Giá trị âm được giữ nguyên dấu trong bảng hoặc phép so sánh có dấu; không được coi là lượt tải dương.');
  }
  const rowsByEntity = new Map<string, QuantitativeObservation[]>();
  for (const row of rows.filter(hasRenderableScope)) rowsByEntity.set(row.entity_id!, [...(rowsByEntity.get(row.entity_id!) ?? []), row]);
  if ([...rowsByEntity.values()].some((entityRows) => periodsOverlap(entityRows))) {
    reasons.add('Các kỳ đo bị chồng lấn không được nối thành các mốc thời gian liên tiếp.');
  }
  if (rows.some((row) => !row.scope_compatible && !row.validation_reasons.some((reason) => /scope|GEO|platform/i.test(reason)))) {
    reasons.add('Chưa xác nhận phạm vi quan sát tương thích với báo cáo này.');
  }
  if (rows.length && selectQuantitativeViews(rows).length === 0 && reasons.size === 0) {
    reasons.add('Chưa có đủ quan sát tương thích để so sánh hoặc hiển thị theo thời gian.');
  }
  return [...reasons];
}
