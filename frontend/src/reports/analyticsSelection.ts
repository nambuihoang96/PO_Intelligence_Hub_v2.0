import type { QuantitativeDataset, QuantitativeObservation } from './api';

export type AnalyticsSourceFilter = 'all' | 'research_report' | 'csv_dataset';
export type AnalyticsReadinessFilter = 'all' | 'complete' | 'scope_compatible' | 'comparison_ready' | 'excluded' | 'duplicate';

export type AnalyticsFilters = {
  metric: string;
  geo: string;
  platform: string;
  period: string;
  entity: string;
  source: AnalyticsSourceFilter;
  readiness: AnalyticsReadinessFilter;
};

export const emptyAnalyticsFilters: AnalyticsFilters = {
  metric: 'all', geo: 'all', platform: 'all', period: 'all', entity: 'all', source: 'all', readiness: 'all',
};

export type AnalyticsRecord = {
  key: string;
  observation: QuantitativeObservation;
  source: 'research_report' | 'csv_dataset';
  sourceLabel: string;
  sourceId: string;
  sourceName: string;
  index: number;
  importedSuccessfully: boolean;
  duplicate: boolean;
  complete: boolean;
  scopeCompatible: boolean | null;
  comparisonReady: boolean;
  exclusionReasons: string[];
};

export type AnalyticsComparisonGroup = {
  key: string;
  label: string;
  observations: AnalyticsRecord[];
  entities: string[];
  periods: string[];
};

export type AnalyticsSelectionContract = {
  selectedFilters: AnalyticsFilters;
  availableDimensions: {
    metrics: string[]; geos: string[]; platforms: string[]; periods: { key: string; label: string }[]; entities: { key: string; label: string }[];
    sources: { key: AnalyticsSourceFilter; label: string }[];
  };
  selectedObservations: AnalyticsRecord[];
  compatibleComparisonGroups: AnalyticsComparisonGroup[];
  excludedObservations: { record: AnalyticsRecord; reasons: string[] }[];
  sourceProvenance: { report: number; csvDatasets: number; datasets: { id: string; name: string }[] };
  readinessSummary: { total: number; complete: number; scopeCompatible: number; comparisonReady: number; excluded: number; duplicates: number };
  chartEligibility: { eligible: boolean; groupCount: number; observationCount: number; limitations: string[] };
};

const clean = (value: string | null | undefined) => value?.trim() || '';
const periodKey = (row: QuantitativeObservation) => `${clean(row.period_start)}|${clean(row.period_end)}`;
const periodLabel = (row: QuantitativeObservation) => row.period_start && row.period_end
  ? `${row.period_start} – ${row.period_end}` : 'Period incomplete';

function duplicateIdentity(row: QuantitativeObservation): string {
  return JSON.stringify([
    row.metric_id, row.metric_definition?.trim().toLocaleLowerCase(), row.value, row.unit?.trim().toLocaleLowerCase(),
    row.entity_id, row.geo?.trim().toLocaleLowerCase(), row.platform?.trim().toLocaleLowerCase(), row.period_start,
    row.period_end, row.granularity?.trim().toLocaleLowerCase(), row.methodology?.trim().toLocaleLowerCase(),
  ]);
}

function makeRecord(args: {
  row: QuantitativeObservation; source: AnalyticsRecord['source']; sourceId: string; sourceName: string;
  index: number; importedSuccessfully: boolean; duplicate: boolean;
}): AnalyticsRecord {
  const { row } = args;
  const complete = row.complete_observation ?? (
    row.metric_id !== null && row.metric_definition !== null && typeof row.value === 'number' && Number.isFinite(row.value)
    && Boolean(row.unit && row.entity_id && row.geo && row.platform && row.period_start && row.period_end && row.granularity
    && (row.source_reference || (args.source === 'csv_dataset' && row.provenance_id)))
    && row.validation_reasons.length === 0
  );
  const scopeCompatible = row.scope_compatible ?? null;
  const comparisonReady = complete && scopeCompatible === true
    && (row.comparison_ready ?? Boolean(row.methodology?.trim()));
  const duplicate = args.duplicate || row.validation_reasons.some((reason) => /duplicate observation/i.test(reason));
  const reasons = [...(row.validation_reasons ?? [])];
  if (!args.importedSuccessfully) reasons.push('Dataset import is not confirmed.');
  if (!complete && !reasons.some((reason) => /missing|incomplete|does not resolve/i.test(reason))) reasons.push('Observation is incomplete.');
  if (scopeCompatible === false) reasons.push('Observation is incompatible with the report scope.');
  else if (scopeCompatible === null) reasons.push('Scope compatibility is unknown or could not be confirmed.');
  if (complete && scopeCompatible === true && !comparisonReady) reasons.push('Observation is not ready for comparison; check methodology and validation details.');
  if (duplicate && !reasons.some((reason) => /duplicate observation/i.test(reason))) reasons.push('Exact duplicate observation in the report-linked data.');
  return {
    key: `${args.source}:${args.sourceId}:${args.index}`, observation: row, source: args.source,
    sourceLabel: args.source === 'research_report' ? 'ChatGPT research · report-supplied' : 'CSV imported · not automatically verified',
    sourceId: args.sourceId, sourceName: args.sourceName, index: args.index, importedSuccessfully: args.importedSuccessfully,
    duplicate, complete, scopeCompatible, comparisonReady, exclusionReasons: [...new Set(reasons)],
  };
}

function comparisonIdentity(row: QuantitativeObservation): string | null {
  const required = [row.metric_id, row.metric_definition, row.unit, row.geo, row.platform, row.granularity, row.methodology];
  if (required.some((value) => !clean(value))) return null;
  return JSON.stringify(required.map((value) => clean(value).toLocaleLowerCase()));
}

function compatibleGroupLabel(row: QuantitativeObservation): string {
  return `${row.metric_definition || row.metric_id} · ${row.unit} · ${row.geo} · ${row.platform} · ${row.granularity}`;
}

function passesReadiness(record: AnalyticsRecord, filter: AnalyticsReadinessFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'complete') return record.complete;
  if (filter === 'scope_compatible') return record.scopeCompatible === true;
  if (filter === 'comparison_ready') return record.comparisonReady;
  if (filter === 'duplicate') return record.duplicate;
  return record.exclusionReasons.length > 0;
}

export function buildAnalyticsSelection(
  reportId: string,
  reportObservations: QuantitativeObservation[] = [],
  datasets: QuantitativeDataset[] = [],
  filters: AnalyticsFilters = emptyAnalyticsFilters,
): AnalyticsSelectionContract {
  const reportRecords = reportObservations.flatMap((row, index) => row.observation_type === 'reported'
    ? [makeRecord({ row, source: 'research_report', sourceId: reportId, sourceName: 'Research report', index, importedSuccessfully: true, duplicate: false })]
    : []);
  const datasetRecords = datasets.flatMap((dataset) => dataset.observations.map((row, index) => makeRecord({
    row, source: 'csv_dataset', sourceId: dataset.id, sourceName: dataset.filename, index,
    importedSuccessfully: dataset.imported_successfully !== false, duplicate: false,
  })));
  const initialRecords = [...reportRecords, ...datasetRecords];
  const signatures = new Map<string, number>();
  for (const record of initialRecords) signatures.set(duplicateIdentity(record.observation), (signatures.get(duplicateIdentity(record.observation)) ?? 0) + 1);
  const records = initialRecords.map((record) => {
    const key = duplicateIdentity(record.observation);
    return (signatures.get(key) ?? 0) > 1 && !record.duplicate
      ? { ...record, duplicate: true, exclusionReasons: [...record.exclusionReasons, 'Exact duplicate observation in the report-linked data.'] }
      : record;
  });

  const distinct = (values: (string | null | undefined)[]) => [...new Set(values.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const metrics = distinct(records.map(({ observation }) => observation.metric_definition || observation.metric_id));
  const geos = distinct(records.map(({ observation }) => observation.geo));
  const platforms = distinct(records.map(({ observation }) => observation.platform));
  const periods = [...new Map(records.filter(({ observation }) => observation.period_start || observation.period_end).map(({ observation }) => [periodKey(observation), { key: periodKey(observation), label: periodLabel(observation) }])).values()]
    .sort((a, b) => a.key.localeCompare(b.key));
  const entitiesByKey = new Map<string, { key: string; label: string }>();
  for (const { observation } of records) {
    const key = clean(observation.entity_id);
    if (key) {
      const knownLabel = entitiesByKey.get(key)?.label;
      // CSV exports often retain only an entity ID. Preserve a report-supplied
      // display name when a later linked CSV row has no name of its own.
      entitiesByKey.set(key, { key, label: clean(observation.entity_name) || knownLabel || key });
    }
  }
  const availableEntities = [...entitiesByKey.values()].sort((a, b) => a.label.localeCompare(b.label));

  const filterSelected = records.filter(({ observation, source }) => {
    const metric = clean(observation.metric_definition || observation.metric_id);
    return (filters.metric === 'all' || metric === filters.metric)
      && (filters.geo === 'all' || clean(observation.geo) === filters.geo)
      && (filters.platform === 'all' || clean(observation.platform) === filters.platform)
      && (filters.period === 'all' || periodKey(observation) === filters.period)
      && (filters.entity === 'all' || clean(observation.entity_id) === filters.entity)
      && (filters.source === 'all' || source === filters.source);
  });
  const selectedForGroups = filterSelected.filter((record) => filters.readiness === 'excluded'
    ? true : passesReadiness(record, filters.readiness));

  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of selectedForGroups) {
    const row = record.observation;
    const identity = comparisonIdentity(row);
    const provenancePresent = Boolean(row.source_reference || (record.source === 'csv_dataset' && row.provenance_id));
    const canCompare = record.importedSuccessfully && record.complete && record.scopeCompatible === true && record.comparisonReady
      && !record.duplicate && identity !== null && Number.isFinite(row.value) && Boolean(row.entity_id && row.period_start && row.period_end && provenancePresent);
    if (!canCompare) continue;
    groups.set(identity!, [...(groups.get(identity!) ?? []), record]);
  }
  const compatibleComparisonGroups: AnalyticsComparisonGroup[] = [];
  for (const [identity, group] of groups.entries()) {
    const byPeriod = new Map<string, AnalyticsRecord[]>();
    const byEntity = new Map<string, AnalyticsRecord[]>();
    for (const record of group) {
      const period = periodKey(record.observation);
      const entity = record.observation.entity_id!;
      byPeriod.set(period, [...(byPeriod.get(period) ?? []), record]);
      byEntity.set(entity, [...(byEntity.get(entity) ?? []), record]);
    }
    // Cross-entity comparisons require the exact same period window.
    for (const [period, points] of byPeriod.entries()) {
      const entities = [...new Set(points.map(({ observation }) => observation.entity_id!).filter(Boolean))];
      if (entities.length < 2) continue;
      compatibleComparisonGroups.push({
        key: `${identity}:period:${period}`, label: `${compatibleGroupLabel(points[0].observation)} · ${periodLabel(points[0].observation)}`,
        observations: points, entities, periods: [period],
      });
    }
    // A temporal comparison stays within one entity and keeps each supplied period intact.
    for (const [entity, points] of byEntity.entries()) {
      const periods = [...new Set(points.map(({ observation }) => periodKey(observation)))].sort();
      if (periods.length < 2) continue;
      compatibleComparisonGroups.push({
        key: `${identity}:entity:${entity}`, label: `${compatibleGroupLabel(points[0].observation)} · ${points[0].observation.entity_name || entity} · ${periods.length} reported periods`,
        observations: points, entities: [entity], periods,
      });
    }
  }
  const groupedKeys = new Set(compatibleComparisonGroups.flatMap(({ observations }) => observations.map(({ key }) => key)));
  const excludedObservations = filterSelected.flatMap((record) => {
    const reasons = [...record.exclusionReasons];
    if (!reasons.length && !groupedKeys.has(record.key)) reasons.push('No compatible comparison group in the current selection; the observation remains available as a standalone fact.');
    return reasons.length ? [{ record, reasons: [...new Set(reasons)] }] : [];
  });
  const selected = filters.readiness === 'excluded'
    ? excludedObservations.map(({ record }) => record)
    : filterSelected.filter((record) => passesReadiness(record, filters.readiness));
  const limitations = [...new Set(excludedObservations.flatMap(({ reasons }) => reasons))];
  if (!compatibleComparisonGroups.length && selected.length) limitations.unshift('No compatible multi-observation group is available with the current filters.');
  return {
    selectedFilters: { ...filters },
    availableDimensions: { metrics, geos, platforms, periods, entities: availableEntities, sources: [{ key: 'all', label: 'All sources' }, { key: 'research_report', label: 'ChatGPT research' }, { key: 'csv_dataset', label: 'Linked CSV' }] },
    selectedObservations: selected,
    compatibleComparisonGroups,
    excludedObservations,
    sourceProvenance: { report: reportRecords.length, csvDatasets: datasetRecords.length, datasets: datasets.map(({ id, filename }) => ({ id, name: filename })) },
    readinessSummary: {
      total: selected.length, complete: selected.filter(({ complete }) => complete).length,
      scopeCompatible: selected.filter(({ scopeCompatible }) => scopeCompatible === true).length,
      comparisonReady: selected.filter(({ comparisonReady }) => comparisonReady).length,
      excluded: excludedObservations.length, duplicates: selected.filter(({ duplicate }) => duplicate).length,
    },
    chartEligibility: { eligible: compatibleComparisonGroups.length > 0, groupCount: compatibleComparisonGroups.length, observationCount: new Set(compatibleComparisonGroups.flatMap((group) => group.observations.map(({ key }) => key))).size, limitations },
  };
}
