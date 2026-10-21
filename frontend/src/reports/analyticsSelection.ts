import type { QuantitativeDataset, QuantitativeObservation } from './api';

export type AnalyticsSourceFilter = 'all' | 'research_report' | 'csv_dataset';
export type AnalyticsReadinessFilter = 'all' | 'complete' | 'scope_compatible' | 'comparison_ready' | 'excluded' | 'duplicate';
export type AnalyticsFilters = {
  metric: string; geo: string; platform: string; period: string; entity: string;
  source: AnalyticsSourceFilter; readiness: AnalyticsReadinessFilter;
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
  entityIdentity: string;
  comparisonEntityIdentity: string;
  sourceEntityIdentity: string | null;
  importedSuccessfully: boolean;
  duplicate: boolean;
  sourceValid: boolean;
  displayReady: boolean;
  datasetAnalysisReady: boolean;
  datasetComparisonReady: boolean;
  reportCompatible: boolean | null;
  comparisonGroupReady: boolean;
  comparisonReady: boolean;
  exclusionReasons: string[];
};
export type AnalyticsComparisonGroup = {
  key: string; label: string; observations: AnalyticsRecord[]; entities: string[]; periods: string[];
};
export type AnalyticsSelectionContract = {
  selectedFilters: AnalyticsFilters;
  availableDimensions: {
    metrics: string[]; geos: string[]; platforms: string[]; periods: { key: string; label: string }[];
    entities: { key: string; label: string }[];
    sources: { key: AnalyticsSourceFilter; label: string }[];
  };
  selectedObservations: AnalyticsRecord[];
  compatibleComparisonGroups: AnalyticsComparisonGroup[];
  excludedObservations: { record: AnalyticsRecord; reasons: string[] }[];
  sourceProvenance: { report: number; csvDatasets: number; datasets: { id: string; name: string }[] };
  readinessSummary: {
    total: number; sourceValid: number; reportCompatible: number; displayReady: number;
    datasetAnalysisReady: number; comparisonCandidates: number; eligibleIndividual: number; comparisonGroups: number;
    incomplete: number; excluded: number; duplicates: number;
  };
  chartEligibility: { eligible: boolean; groupCount: number; observationCount: number; limitations: string[] };
};

const clean = (value: string | null | undefined) => value?.trim() || '';
const normalized = (value: string | null | undefined) => clean(value).toLocaleLowerCase();
const periodKey = (row: QuantitativeObservation) => `${clean(row.period_start)}|${clean(row.period_end)}`;
const periodLabel = (row: QuantitativeObservation) => row.period_start && row.period_end
  ? `${row.period_start} – ${row.period_end}` : 'Period incomplete';

/** Stable analytical identity. Report links are used only when an explicit mapping exists. */
export function analyticalEntityIdentity(row: QuantitativeObservation, source: AnalyticsRecord['source']): string | null {
  if (source === 'research_report') return row.entity_id ? `report:${row.entity_id}` : null;
  if (row.source_entity_id) return sourceIdentityKey(row);
  if (row.entity_id) return `report:${row.entity_id}`;
  return null;
}

function stableSourceIdentity(row: QuantitativeObservation, source: AnalyticsRecord['source']): string | null {
  if (source === 'csv_dataset' && row.source_entity_id) return sourceIdentityKey(row);
  return row.entity_id ? `report:${row.entity_id}` : null;
}

function sourceIdentityKey(row: QuantitativeObservation): string {
  const provider = row.source_provider || 'csv';
  const rawId = row.source_entity_id!;
  return `source:${rawId.startsWith(`${provider}:`) ? rawId : `${provider}:${rawId}`}`;
}

function duplicateIdentity(record: Pick<AnalyticsRecord, 'observation' | 'source'>): string {
  const row = record.observation;
  return JSON.stringify([
    stableSourceIdentity(row, record.source), row.metric_id, normalized(row.metric_definition), row.value,
    normalized(row.unit), normalized(row.geo), normalized(row.platform), row.period_start, row.period_end,
    normalized(row.granularity), normalized(row.methodology),
  ]);
}

function makeRecord(args: {
  row: QuantitativeObservation; source: AnalyticsRecord['source']; sourceId: string; sourceName: string;
  index: number; importedSuccessfully: boolean; duplicate: boolean;
}): AnalyticsRecord {
  const { row, source } = args;
  const entityIdentity = analyticalEntityIdentity(row, source);
  const comparisonEntityIdentity = source === 'csv_dataset' && row.entity_resolution_state === 'matched' && row.entity_id
    ? `report:${row.entity_id}` : entityIdentity;
  const sourceEntityIdentity = stableSourceIdentity(row, source);
  const hasExplicitPeriod = Boolean(row.period_start && row.period_end);
  const sourceValid = row.analysis_ready ?? row.complete_observation ?? (
    Boolean(row.metric_id && row.metric_definition && typeof row.value === 'number' && Number.isFinite(row.value)
      && row.unit && sourceEntityIdentity && row.geo && row.platform && hasExplicitPeriod
      && (row.source_reference || (source === 'csv_dataset' && row.provenance_id)))
    && (row.source_validation_reasons ?? row.validation_reasons).length === 0
  );
  const displayReady = row.display_ready ?? Boolean(row.metric_id && typeof row.value === 'number' && Number.isFinite(row.value) && entityIdentity);
  const datasetAnalysisReady = source === 'csv_dataset' ? sourceValid : false;
  const reportCompatible = row.report_compatibility === 'compatible' ? true
    : row.report_compatibility === 'incompatible' ? false
      : row.report_compatibility === 'unknown' ? null : row.scope_compatible ?? null;
  const datasetComparisonReady = row.dataset_comparison_ready ?? (sourceValid && Boolean(row.methodology?.trim()));
  const comparisonReady = source === 'csv_dataset'
    ? args.importedSuccessfully && datasetComparisonReady
    : sourceValid && reportCompatible === true && Boolean(row.methodology?.trim());
  const duplicate = args.duplicate || row.validation_reasons.some((reason) => /duplicate observation/i.test(reason));
  const reasons = [...(row.source_validation_reasons ?? row.validation_reasons ?? [])];
  if (!args.importedSuccessfully) reasons.push('Dataset import is not confirmed.');
  if (!sourceValid && !reasons.length) reasons.push('Source measurement is incomplete or invalid.');
  if (row.report_compatibility_reasons?.length) reasons.push(...row.report_compatibility_reasons);
  if (reportCompatible === false && !reasons.some((reason) => /scope|GEO|platform/i.test(reason))) reasons.push('Measurement scope differs from the linked report.');
  if (reportCompatible === null && source === 'csv_dataset') reasons.push('Compatibility with the linked report is unknown.');
  if (duplicate && !reasons.some((reason) => /duplicate observation/i.test(reason))) reasons.push('Duplicate measurement for the same source identity and measurement scope.');
  if (sourceValid && !comparisonReady) reasons.push('No compatible comparison group is confirmed for the current selection; the measurement remains displayable.');
  return {
    key: `${args.source}:${args.sourceId}:${args.index}`, observation: row, source,
    sourceLabel: source === 'research_report' ? 'ChatGPT research · report-supplied' : 'CSV imported · not automatically verified',
    sourceId: args.sourceId, sourceName: args.sourceName, index: args.index,
    entityIdentity: entityIdentity ?? `unresolved:${source}:${args.sourceId}:${args.index}`,
    comparisonEntityIdentity: comparisonEntityIdentity ?? entityIdentity ?? `unresolved:${source}:${args.sourceId}:${args.index}`,
    sourceEntityIdentity, importedSuccessfully: args.importedSuccessfully, duplicate,
    sourceValid, displayReady, datasetAnalysisReady, datasetComparisonReady,
    reportCompatible, comparisonGroupReady: false, comparisonReady, exclusionReasons: [...new Set(reasons)],
  };
}

function comparisonIdentity(row: QuantitativeObservation): string | null {
  // Exact date bounds define the observed window. Granularity is kept as metadata
  // and is never invented; peers are compared only inside identical date windows.
  const required = [row.metric_id, row.metric_definition, row.unit, row.geo, row.platform, row.methodology];
  if (required.some((value) => !clean(value)) || !row.period_start || !row.period_end) return null;
  return JSON.stringify(required.map((value) => clean(value).toLocaleLowerCase()));
}

function compatibleGroupLabel(row: QuantitativeObservation): string {
  return `${row.metric_definition || row.metric_id} · ${row.unit} · ${row.geo} · ${row.platform}`;
}

function passesReadiness(record: AnalyticsRecord, filter: AnalyticsReadinessFilter, groupedKeys: Set<string> = new Set()): boolean {
  if (filter === 'all') return true;
  if (filter === 'complete') return record.sourceValid;
  if (filter === 'scope_compatible') return record.reportCompatible === true;
  if (filter === 'comparison_ready') return groupedKeys.has(record.key);
  if (filter === 'duplicate') return record.duplicate;
  return !record.sourceValid || record.duplicate || record.reportCompatible === false
    || (record.source === 'research_report' && record.reportCompatible !== true);
}

function createComparisonGroups(records: AnalyticsRecord[]): AnalyticsComparisonGroup[] {
  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    const row = record.observation;
    const identity = comparisonIdentity(row);
    const provenancePresent = Boolean(row.source_reference || (record.source === 'csv_dataset' && row.provenance_id));
    const linkedReportAllowed = record.source === 'csv_dataset' || record.reportCompatible === true;
    if (!record.importedSuccessfully || !record.sourceValid || !record.datasetComparisonReady || !linkedReportAllowed
      || record.duplicate || !identity || !record.sourceEntityIdentity || !provenancePresent
      || typeof row.value !== 'number' || !Number.isFinite(row.value)) continue;
    groups.set(identity, [...(groups.get(identity) ?? []), record]);
  }
  const result: AnalyticsComparisonGroup[] = [];
  for (const [identity, group] of groups) {
    const byPeriod = new Map<string, AnalyticsRecord[]>();
    const byEntity = new Map<string, AnalyticsRecord[]>();
    for (const record of group) {
      const period = periodKey(record.observation);
      byPeriod.set(period, [...(byPeriod.get(period) ?? []), record]);
      byEntity.set(record.comparisonEntityIdentity, [...(byEntity.get(record.comparisonEntityIdentity) ?? []), record]);
    }
    for (const [period, points] of byPeriod) {
      const entities = [...new Set(points.map(({ comparisonEntityIdentity }) => comparisonEntityIdentity))];
      if (entities.length < 2) continue;
      result.push({
        key: `${identity}:period:${period}`,
        label: `${compatibleGroupLabel(points[0].observation)} · ${periodLabel(points[0].observation)}`,
        observations: points, entities, periods: [period],
      });
    }
    for (const [entity, points] of byEntity) {
      const sorted = [...points].sort((a, b) => (a.observation.period_start || '').localeCompare(b.observation.period_start || ''));
      const periods = [...new Set(sorted.map(({ observation }) => periodKey(observation)))];
      const nonOverlapping = sorted.every((item, index) => index === 0 || (sorted[index - 1].observation.period_end || '') < (item.observation.period_start || ''));
      if (periods.length < 2 || !nonOverlapping) continue;
      result.push({
        key: `${identity}:entity:${entity}`,
        label: `${compatibleGroupLabel(points[0].observation)} · ${points[0].observation.source_entity_name || points[0].observation.entity_name || entity} · ${periods.length} reported periods`,
        observations: sorted, entities: [entity], periods,
      });
    }
  }
  return result;
}

export function buildAnalyticsSelection(
  reportId: string,
  reportObservations: QuantitativeObservation[] = [],
  datasets: QuantitativeDataset[] = [],
  filters: AnalyticsFilters = emptyAnalyticsFilters,
): AnalyticsSelectionContract {
  const reportRecords = reportObservations.flatMap((row, index) => row.observation_type === 'reported'
    ? [makeRecord({ row, source: 'research_report', sourceId: reportId, sourceName: 'Research report', index, importedSuccessfully: true, duplicate: false })] : []);
  const datasetRecords = datasets.flatMap((dataset) => dataset.observations.map((row, index) => makeRecord({
    row, source: 'csv_dataset', sourceId: dataset.id, sourceName: dataset.filename, index,
    importedSuccessfully: dataset.imported_successfully !== false, duplicate: false,
  })));
  const initialRecords = [...reportRecords, ...datasetRecords];
  const signatures = new Map<string, number>();
  for (const record of initialRecords) {
    const signature = duplicateIdentity(record);
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
  }
  const records = initialRecords.map((record) => {
    const duplicate = (signatures.get(duplicateIdentity(record)) ?? 0) > 1;
    return duplicate && !record.duplicate ? {
      ...record, duplicate: true,
      exclusionReasons: [...record.exclusionReasons, 'Duplicate measurement for the same source identity and measurement scope.'],
    } : record;
  });

  const distinct = (values: (string | null | undefined)[]) => [...new Set(values.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const metrics = distinct(records.map(({ observation }) => observation.metric_definition || observation.metric_id));
  const geos = distinct(records.map(({ observation }) => observation.geo));
  const platforms = distinct(records.map(({ observation }) => observation.platform));
  const periods = [...new Map(records.filter(({ observation }) => observation.period_start || observation.period_end)
    .map(({ observation }) => [periodKey(observation), { key: periodKey(observation), label: periodLabel(observation) }])).values()]
    .sort((a, b) => a.key.localeCompare(b.key));
  const entitiesByKey = new Map<string, { key: string; label: string }>();
  for (const record of records) {
    const row = record.observation;
    const key = record.entityIdentity;
    if (!key.startsWith('unresolved:')) {
      const prior = entitiesByKey.get(key)?.label;
      const label = row.source_entity_name || row.entity_name || prior || row.source_entity_id || row.entity_id || key;
      entitiesByKey.set(key, { key, label });
    }
  }
  const availableEntities = [...entitiesByKey.values()].sort((a, b) => a.label.localeCompare(b.label));

  const filterSelected = records.filter(({ observation, source, entityIdentity }) => {
    const metric = clean(observation.metric_definition || observation.metric_id);
    return (filters.metric === 'all' || metric === filters.metric)
      && (filters.geo === 'all' || clean(observation.geo) === filters.geo)
      && (filters.platform === 'all' || clean(observation.platform) === filters.platform)
      && (filters.period === 'all' || periodKey(observation) === filters.period)
      && (filters.entity === 'all' || entityIdentity === filters.entity)
      && (filters.source === 'all' || source === filters.source);
  });
  const baselineGroups = createComparisonGroups(filterSelected.filter((record) => record.sourceValid && !record.duplicate));
  const baselineGroupedKeys = new Set(baselineGroups.flatMap(({ observations }) => observations.map(({ key }) => key)));
  const excludedObservations = filterSelected.flatMap((record) => {
    const reasons = [...record.exclusionReasons];
    if (record.sourceValid && !record.duplicate && !baselineGroupedKeys.has(record.key)) {
      reasons.push('No compatible comparison partner in the current selection. The measurement remains available as a standalone sourced fact.');
    }
    return passesReadiness(record, 'excluded') || (record.sourceValid && !record.duplicate && !baselineGroupedKeys.has(record.key))
      ? [{ record, reasons: [...new Set(reasons.length ? reasons : ['No compatible comparison partner in the current selection.'])] }]
      : [];
  });
  const selected = filters.readiness === 'excluded'
    ? excludedObservations.map(({ record }) => record)
    : filterSelected.filter((record) => passesReadiness(record, filters.readiness, baselineGroupedKeys));
  const selectedWithGroupState = selected.map((record) => ({ ...record, comparisonGroupReady: baselineGroupedKeys.has(record.key) }));
  // An Excluded filter must never leak eligible records into chart groups.
  const comparisonCandidates = filters.readiness === 'excluded' ? [] : selectedWithGroupState;
  const compatibleComparisonGroups = createComparisonGroups(comparisonCandidates);
  const groupedKeys = new Set(compatibleComparisonGroups.flatMap(({ observations }) => observations.map(({ key }) => key)));
  const standaloneLimitations = selectedWithGroupState.filter((record) => record.sourceValid && !record.duplicate && !groupedKeys.has(record.key));
  const limitations = [...new Set([
    ...excludedObservations.flatMap(({ reasons }) => reasons),
    ...(standaloneLimitations.length ? ['Some valid measurements have no compatible peer in the current selection. They remain available as standalone sourced facts.'] : []),
  ])];
  if (!compatibleComparisonGroups.length && selected.length && filters.readiness !== 'excluded') limitations.unshift('No compatible multi-observation group is available with the current filters.');

  return {
    selectedFilters: { ...filters },
    availableDimensions: {
      metrics, geos, platforms, periods, entities: availableEntities,
      sources: [{ key: 'all', label: 'All sources' }, { key: 'research_report', label: 'ChatGPT research' }, { key: 'csv_dataset', label: 'Linked CSV' }],
    },
    selectedObservations: selectedWithGroupState, compatibleComparisonGroups, excludedObservations,
    sourceProvenance: { report: reportRecords.length, csvDatasets: datasetRecords.length, datasets: datasets.map(({ id, filename }) => ({ id, name: filename })) },
    readinessSummary: {
      total: selected.length,
      sourceValid: selected.filter(({ sourceValid }) => sourceValid).length,
      reportCompatible: selected.filter(({ reportCompatible }) => reportCompatible === true).length,
      displayReady: selected.filter(({ displayReady }) => displayReady).length,
      datasetAnalysisReady: selected.filter(({ datasetAnalysisReady }) => datasetAnalysisReady).length,
      comparisonCandidates: selected.filter(({ comparisonReady, duplicate }) => comparisonReady && !duplicate).length,
      eligibleIndividual: selectedWithGroupState.filter(({ comparisonGroupReady }) => comparisonGroupReady).length,
      comparisonGroups: compatibleComparisonGroups.length,
      incomplete: selected.filter(({ sourceValid }) => !sourceValid).length,
      excluded: excludedObservations.length,
      duplicates: selected.filter(({ duplicate }) => duplicate).length,
    },
    chartEligibility: {
      eligible: compatibleComparisonGroups.length > 0, groupCount: compatibleComparisonGroups.length,
      observationCount: new Set(compatibleComparisonGroups.flatMap((group) => group.observations.map(({ key }) => key))).size,
      limitations,
    },
  };
}
