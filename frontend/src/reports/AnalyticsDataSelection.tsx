import { useMemo, useState } from 'react';
import type { QuantitativeDataset, QuantitativeObservation } from './api';
import { buildAnalyticsSelection, emptyAnalyticsFilters, type AnalyticsFilters, type AnalyticsRecord } from './analyticsSelection';

const PREVIEW_PAGE_SIZE = 20;

type Props = {
  reportId: string;
  observations: QuantitativeObservation[];
  datasets: QuantitativeDataset[];
  onViewEvidence: (record: AnalyticsRecord) => void;
  onImportCsv: () => void;
};

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label className="analytics-filter"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}

function readinessLabel(record: AnalyticsRecord): string {
  if (record.duplicate) return 'Duplicate';
  if (!record.sourceValid) return 'Incomplete source measurement';
  if (record.source === 'csv_dataset' && record.reportCompatible === false) return 'Valid in CSV scope · differs from report';
  if (record.reportCompatible === null) return 'Report compatibility unknown';
  if (record.comparisonGroupReady) return 'In a compatible comparison group';
  if (record.comparisonReady) return 'No compatible comparison partner';
  return 'Valid standalone measurement';
}

function ObservationCard({ record, onViewEvidence }: { record: AnalyticsRecord; onViewEvidence: (record: AnalyticsRecord) => void }) {
  const row = record.observation;
  const entity = row.source_entity_name || row.entity_name || row.source_entity_id || row.entity_id || 'Entity not identified';
  const period = row.period_start && row.period_end ? `${row.period_start} – ${row.period_end}` : 'Period not provided';
  const sourceUrl = row.evidence_reference || row.source_reference;
  return <article className={`analytics-observation${record.exclusionReasons.length ? ' is-excluded' : ''}`}>
    <div className="analytics-observation-main">
      <div><span className="analytics-observation-entity">{entity}</span><h4>{row.metric_definition || row.metric_id || 'Metric not identified'}</h4></div>
      <strong className="analytics-observation-value">{row.value === null || row.value === undefined ? 'Unknown' : String(row.value)} <small>{row.unit || ''}</small></strong>
    </div>
    <div className="analytics-observation-primary-action"><span className={`analytics-status-chip${record.sourceValid && !record.duplicate ? ' is-ready' : ' is-muted'}`}>{readinessLabel(record)}</span><button type="button" className="text-button" onClick={() => onViewEvidence(record)}>View evidence record</button></div>
    <details className="analytics-observation-details"><summary>Measurement details, source &amp; validation</summary>
      <div className="analytics-observation-meta"><span>{[row.geo || 'GEO not provided', row.platform || 'Platform not provided', period, row.granularity || 'Granularity not provided'].join(' · ')}</span><span>{record.sourceName} · {record.sourceLabel}</span></div>
      <div className="analytics-observation-status"><span>{row.observation_type === 'reported' ? 'Report-supplied' : row.observation_type === 'imported' ? 'CSV imported' : 'Calculated'} · {row.verification_status === 'verified' ? 'Independently verified' : 'Unverified'}</span>{record.exclusionReasons.length > 0 && <details><summary>Why this cannot be compared</summary><ul>{record.exclusionReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}</div>
      <div className="analytics-observation-actions">{sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Open supplied source</a>}{row.provenance_id && <small>Source record · {record.sourceName}</small>}</div>
    </details>
  </article>;
}

export function AnalyticsDataSelection({ reportId, observations, datasets, onViewEvidence, onImportCsv }: Props) {
  const [filters, setFilters] = useState<AnalyticsFilters>(emptyAnalyticsFilters);
  const [previewQuery, setPreviewQuery] = useState('');
  const [previewLimit, setPreviewLimit] = useState(PREVIEW_PAGE_SIZE);
  const selection = useMemo(() => buildAnalyticsSelection(reportId, observations, datasets, filters), [reportId, observations, datasets, filters]);
  const options = selection.availableDimensions;
  const matchingObservations = useMemo(() => {
    const query = previewQuery.trim().toLocaleLowerCase();
    if (!query) return selection.selectedObservations;
    return selection.selectedObservations.filter(({ observation: row, sourceName }) => [row.source_entity_name, row.entity_name, row.source_entity_id, row.entity_id, row.metric_definition, row.metric_id, row.geo, row.platform, row.period_start, row.period_end, sourceName, row.value?.toString()].some((value) => value?.toLocaleLowerCase().includes(query)));
  }, [previewQuery, selection.selectedObservations]);
  const visibleObservations = matchingObservations.slice(0, previewLimit);
  const csvScopeOnlyGroups = selection.compatibleComparisonGroups.length > 0 && selection.compatibleComparisonGroups.every((group) => group.observations.every((record) => record.source === 'csv_dataset' && record.reportCompatible === false));
  const setFilter = (field: keyof AnalyticsFilters, value: string) => {
    setPreviewLimit(PREVIEW_PAGE_SIZE);
    setFilters((current) => ({ ...current, [field]: value }));
  };

  return <section className="research-panel analytics-selection" aria-labelledby="analytics-selection-title">
    <div className="analytics-selection-heading"><div><span className="field-label">REPORT-SCOPED QUANTITATIVE DATA</span><h3 id="analytics-selection-title">Analytics Data Selection</h3><p>Choose observations from this report and linked datasets. Values and source provenance are preserved; measurements are grouped only when definitions, units, methodology, GEO, platform, exact period windows and any known cadence are compatible.</p></div><button type="button" className="secondary-action" onClick={onImportCsv}>Import CSV</button></div>
    {selection.selectedObservations.length === 0 && selection.sourceProvenance.report === 0 && selection.sourceProvenance.csvDatasets === 0 ? <><div className="analytics-readiness" aria-label="Data readiness summary"><div><strong>0</strong><span>Total observations</span></div><div><strong>0</strong><span>Source-valid</span></div><div><strong>0</strong><span>Report-compatible</span></div><div><strong>0</strong><span>Comparison-eligible</span></div><div><strong>0</strong><span>Comparison groups</span></div><div><strong>0</strong><span>Incomplete</span></div><div><strong>0</strong><span>Duplicates</span></div></div><div className="analytics-empty" role="status"><strong>No quantitative observations are linked to this report.</strong><p>Qualitative research remains usable on its own. When quantitative observations are supplied, they will appear here; a CSV is optional.</p><button type="button" className="text-button" onClick={onImportCsv}>Link a CSV dataset to this report</button></div></> : <>
      <div className="analytics-filters" aria-label="Quantitative data filters">
        <SelectFilter label="Metric" value={filters.metric} onChange={(value) => setFilter('metric', value)} options={[{ value: 'all', label: 'All metrics' }, ...options.metrics.map((value) => ({ value, label: value }))]} />
        <SelectFilter label="GEO" value={filters.geo} onChange={(value) => setFilter('geo', value)} options={[{ value: 'all', label: 'All GEOs' }, ...options.geos.map((value) => ({ value, label: value }))]} />
        <SelectFilter label="Platform" value={filters.platform} onChange={(value) => setFilter('platform', value)} options={[{ value: 'all', label: 'All platforms' }, ...options.platforms.map((value) => ({ value, label: value }))]} />
        <SelectFilter label="Period" value={filters.period} onChange={(value) => setFilter('period', value)} options={[{ value: 'all', label: 'All periods' }, ...options.periods.map(({ key, label }) => ({ value: key, label }))]} />
        <SelectFilter label="Entity" value={filters.entity} onChange={(value) => setFilter('entity', value)} options={[{ value: 'all', label: 'All entities' }, ...options.entities.map(({ key, label }) => ({ value: key, label }))]} />
        <SelectFilter label="Data source" value={filters.source} onChange={(value) => setFilter('source', value)} options={options.sources.map(({ key, label }) => ({ value: key, label }))} />
        <SelectFilter label="Data readiness" value={filters.readiness} onChange={(value) => setFilter('readiness', value)} options={[
          { value: 'all', label: 'All readiness states' }, { value: 'complete', label: 'Valid measurements' },
          { value: 'scope_compatible', label: 'Report-compatible observations' }, { value: 'comparison_ready', label: 'Measurements in compatible groups' },
          { value: 'excluded', label: 'Not in a report comparison' }, { value: 'scope_mismatch', label: 'Outside report scope' }, { value: 'no_comparison_partner', label: 'No compatible peer' },
          { value: 'needs_review', label: 'Needs review' }, { value: 'duplicate', label: 'Duplicate observations' },
        ]} />
        <button type="button" className="text-button analytics-reset" onClick={() => { setFilters(emptyAnalyticsFilters); setPreviewLimit(PREVIEW_PAGE_SIZE); setPreviewQuery(''); }} disabled={Object.values(filters).every((value) => value === 'all') && previewQuery === '' && previewLimit === PREVIEW_PAGE_SIZE}>Reset filters</button>
      </div>
      <div className="analytics-readiness" aria-label="Data readiness summary">
        <div><strong>{selection.readinessSummary.total}</strong><span>Selected observations</span></div>
        <div><strong>{selection.readinessSummary.sourceValid}</strong><span>Source-valid</span></div>
        <div><strong>{selection.readinessSummary.reportCompatible}</strong><span>Report-compatible</span></div>
        <div><strong>{selection.readinessSummary.eligibleIndividual}</strong><span>Eligible measurements</span></div>
        <div><strong>{selection.readinessSummary.comparisonGroups}</strong><span>Compatible groups</span></div>
        <div><strong>{selection.readinessSummary.incomplete}</strong><span>Incomplete</span></div>
        <div><strong>{selection.readinessSummary.duplicates}</strong><span>Duplicates</span></div>
      </div>
      <div className="analytics-selection-status" role="status"><strong>{selection.chartEligibility.eligible ? `${selection.chartEligibility.groupCount} ${csvScopeOnlyGroups ? 'dataset-scope' : ''} compatible comparison group${selection.chartEligibility.groupCount === 1 ? '' : 's'}` : 'No comparison group is ready with these filters.'}</strong><span>{csvScopeOnlyGroups ? 'These measurements are comparable within the CSV’s original scope; they do not represent the linked report scope.' : selection.chartEligibility.eligible ? `${selection.chartEligibility.observationCount} observations are eligible for a future visualization.` : 'Valid measurements remain available individually. Comparison groups require compatible metric definition, unit, GEO, platform, dates, methodology and entity identity.'}</span></div>
      {selection.chartEligibility.limitations.length > 0 && <details className="analytics-limitations"><summary>Validation and comparison limitations · {selection.chartEligibility.limitations.length}</summary><ul>{selection.chartEligibility.limitations.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
      <div className="analytics-record-heading"><div><h4>Selected measurements</h4><span>{matchingObservations.length.toLocaleString()} match the current filters</span></div><label className="analytics-preview-search">Search selected data<input value={previewQuery} onChange={(event) => { setPreviewQuery(event.target.value); setPreviewLimit(PREVIEW_PAGE_SIZE); }} placeholder="App, metric, source or period" /></label></div>
      {visibleObservations.length ? <div className="analytics-observation-list">{visibleObservations.map((record) => <ObservationCard key={record.key} record={record} onViewEvidence={onViewEvidence} />)}</div> : <p className="analytics-empty-filter" role="status">No observations match these filters. Change or reset the filters to see the report-linked data.</p>}
      {matchingObservations.length > visibleObservations.length && <button type="button" className="secondary-action" onClick={() => setPreviewLimit((limit) => limit + PREVIEW_PAGE_SIZE)}>Show {Math.min(PREVIEW_PAGE_SIZE, matchingObservations.length - visibleObservations.length)} more measurements</button>}
      {selection.compatibleComparisonGroups.length > 0 && <details className="analytics-comparison-groups"><summary>Compatible comparison groups · {selection.compatibleComparisonGroups.length}</summary>{selection.compatibleComparisonGroups.map((group) => <div key={group.key}><strong>{group.label}</strong><p>{group.entities.length} entities · {group.periods.length} periods · {group.observations.length} observations. No aggregation or derived change is calculated here.</p></div>)}</details>}
      <p className="analytics-provenance-note">Sources: {selection.sourceProvenance.report} report-supplied observations · {selection.sourceProvenance.csvDatasets} linked CSV observations across {selection.sourceProvenance.datasets.length} report-specific dataset(s). CSV import does not mean independent verification.</p>
    </>}
  </section>;
}
