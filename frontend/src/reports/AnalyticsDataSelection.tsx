import { useMemo, useState } from 'react';
import type { QuantitativeDataset, QuantitativeObservation } from './api';
import { buildAnalyticsSelection, emptyAnalyticsFilters, type AnalyticsFilters, type AnalyticsRecord } from './analyticsSelection';

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
  if (!record.complete) return 'Incomplete';
  if (record.scopeCompatible === false) return 'Incompatible scope';
  if (record.scopeCompatible === null) return 'Scope unknown';
  if (record.comparisonReady) return 'Comparison-ready observation';
  return 'Complete · not comparison-ready';
}

function ObservationCard({ record, onViewEvidence }: { record: AnalyticsRecord; onViewEvidence: (record: AnalyticsRecord) => void }) {
  const row = record.observation;
  const entity = row.entity_name || row.entity_id || 'Entity not identified';
  const period = row.period_start && row.period_end ? `${row.period_start} – ${row.period_end}` : 'Period not provided';
  const sourceUrl = row.evidence_reference || row.source_reference;
  return <article className={`analytics-observation${record.exclusionReasons.length ? ' is-excluded' : ''}`}>
    <div className="analytics-observation-main">
      <div><span className="analytics-observation-entity">{entity}</span><h4>{row.metric_definition || row.metric_id || 'Metric not identified'}</h4></div>
      <strong className="analytics-observation-value">{row.value === null || row.value === undefined ? 'Unknown' : String(row.value)} <small>{row.unit || ''}</small></strong>
    </div>
    <div className="analytics-observation-meta"><span>{[row.geo || 'GEO not provided', row.platform || 'Platform not provided', period, row.granularity || 'Granularity not provided'].join(' · ')}</span><span>{record.sourceName} · {record.sourceLabel}</span></div>
    <div className="analytics-observation-status">
      <span className={`analytics-status-chip${record.comparisonReady && !record.duplicate ? ' is-ready' : ' is-muted'}`}>{readinessLabel(record)}</span>
      <span>{row.observation_type === 'reported' ? 'Report-supplied' : row.observation_type === 'imported' ? 'CSV imported' : 'Calculated'} · {row.verification_status === 'verified' ? 'Independently verified' : 'Unverified'}</span>
      {record.exclusionReasons.length > 0 && <details><summary>Why excluded · {record.exclusionReasons.length}</summary><ul>{record.exclusionReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
    </div>
    <div className="analytics-observation-actions">
      <button type="button" className="text-button" onClick={() => onViewEvidence(record)}>View evidence record</button>
      {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Open supplied source</a>}
      {row.provenance_id && <small>Provenance · {record.sourceName}</small>}
    </div>
  </article>;
}

export function AnalyticsDataSelection({ reportId, observations, datasets, onViewEvidence, onImportCsv }: Props) {
  const [filters, setFilters] = useState<AnalyticsFilters>(emptyAnalyticsFilters);
  const selection = useMemo(() => buildAnalyticsSelection(reportId, observations, datasets, filters), [reportId, observations, datasets, filters]);
  const options = selection.availableDimensions;
  const setFilter = (field: keyof AnalyticsFilters, value: string) => setFilters((current) => ({ ...current, [field]: value }));

  return <section className="research-panel analytics-selection" aria-labelledby="analytics-selection-title">
    <div className="analytics-selection-heading"><div><span className="field-label">REPORT-SCOPED QUANTITATIVE DATA</span><h3 id="analytics-selection-title">Analytics Data Selection</h3><p>Choose observations from this report and linked datasets. Values and source provenance are preserved; the same metric is grouped only when its definition, unit, methodology, GEO, platform and granularity match.</p></div><button type="button" className="secondary-action" onClick={onImportCsv}>Import CSV</button></div>
    {selection.selectedObservations.length === 0 && selection.sourceProvenance.report === 0 && selection.sourceProvenance.csvDatasets === 0 ? <><div className="analytics-readiness" aria-label="Data readiness summary"><div><strong>0</strong><span>Total observations</span></div><div><strong>0</strong><span>Complete</span></div><div><strong>0</strong><span>Scope compatible</span></div><div><strong>0</strong><span>Comparison-ready</span></div><div><strong>0</strong><span>Excluded / review</span></div><div><strong>0</strong><span>Duplicates</span></div></div><div className="analytics-empty" role="status"><strong>No quantitative observations are linked to this report.</strong><p>Qualitative research remains usable on its own. When quantitative observations are supplied, they will appear here; a CSV is optional.</p><button type="button" className="text-button" onClick={onImportCsv}>Link a CSV dataset to this report</button></div></> : <>
      <div className="analytics-filters" aria-label="Quantitative data filters">
        <SelectFilter label="Metric" value={filters.metric} onChange={(value) => setFilter('metric', value)} options={[{ value: 'all', label: 'All metrics' }, ...options.metrics.map((value) => ({ value, label: value }))]} />
        <SelectFilter label="GEO" value={filters.geo} onChange={(value) => setFilter('geo', value)} options={[{ value: 'all', label: 'All GEOs' }, ...options.geos.map((value) => ({ value, label: value }))]} />
        <SelectFilter label="Platform" value={filters.platform} onChange={(value) => setFilter('platform', value)} options={[{ value: 'all', label: 'All platforms' }, ...options.platforms.map((value) => ({ value, label: value }))]} />
        <SelectFilter label="Period" value={filters.period} onChange={(value) => setFilter('period', value)} options={[{ value: 'all', label: 'All periods' }, ...options.periods.map(({ key, label }) => ({ value: key, label }))]} />
        <SelectFilter label="Entity" value={filters.entity} onChange={(value) => setFilter('entity', value)} options={[{ value: 'all', label: 'All entities' }, ...options.entities.map(({ key, label }) => ({ value: key, label }))]} />
        <SelectFilter label="Data source" value={filters.source} onChange={(value) => setFilter('source', value)} options={options.sources.map(({ key, label }) => ({ value: key, label }))} />
        <SelectFilter label="Data readiness" value={filters.readiness} onChange={(value) => setFilter('readiness', value)} options={[
          { value: 'all', label: 'All readiness states' }, { value: 'complete', label: 'Complete observations' },
          { value: 'scope_compatible', label: 'Scope-compatible observations' }, { value: 'comparison_ready', label: 'Comparison-ready observations' },
          { value: 'excluded', label: 'Excluded / needs review' }, { value: 'duplicate', label: 'Duplicate observations' },
        ]} />
        <button type="button" className="text-button analytics-reset" onClick={() => setFilters(emptyAnalyticsFilters)} disabled={Object.values(filters).every((value) => value === 'all')}>Reset filters</button>
      </div>
      <div className="analytics-readiness" aria-label="Data readiness summary">
        <div><strong>{selection.readinessSummary.total}</strong><span>Selected observations</span></div>
        <div><strong>{selection.readinessSummary.complete}</strong><span>Complete</span></div>
        <div><strong>{selection.readinessSummary.scopeCompatible}</strong><span>Scope compatible</span></div>
        <div><strong>{selection.readinessSummary.comparisonReady}</strong><span>Comparison-ready</span></div>
        <div><strong>{selection.readinessSummary.excluded}</strong><span>Excluded / review</span></div>
        <div><strong>{selection.readinessSummary.duplicates}</strong><span>Duplicates</span></div>
      </div>
      <div className="analytics-selection-status" role="status"><strong>{selection.chartEligibility.eligible ? `${selection.chartEligibility.groupCount} compatible comparison group${selection.chartEligibility.groupCount === 1 ? '' : 's'}` : 'No comparison group is ready with these filters.'}</strong><span>{selection.chartEligibility.eligible ? `${selection.chartEligibility.observationCount} observations are eligible for a future visualization.` : 'Observations remain available below as sourced records; no missing values or comparisons have been inferred.'}</span></div>
      {selection.chartEligibility.limitations.length > 0 && <details className="analytics-limitations"><summary>Validation and comparison limitations · {selection.chartEligibility.limitations.length}</summary><ul>{selection.chartEligibility.limitations.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
      <div className="analytics-record-heading"><h4>Selected observations</h4><span>{selection.selectedObservations.length} in the current filter</span></div>
      {selection.selectedObservations.length ? <div className="analytics-observation-list">{selection.selectedObservations.map((record) => <ObservationCard key={record.key} record={record} onViewEvidence={onViewEvidence} />)}</div> : <p className="analytics-empty-filter" role="status">No observations match these filters. Change or reset the filters to see the report-linked data.</p>}
      {selection.compatibleComparisonGroups.length > 0 && <details className="analytics-comparison-groups"><summary>Compatible comparison groups · {selection.compatibleComparisonGroups.length}</summary>{selection.compatibleComparisonGroups.map((group) => <div key={group.key}><strong>{group.label}</strong><p>{group.entities.length} entities · {group.periods.length} periods · {group.observations.length} observations. No aggregation or derived change is calculated here.</p></div>)}</details>}
      <p className="analytics-provenance-note">Sources: {selection.sourceProvenance.report} report-supplied observations · {selection.sourceProvenance.csvDatasets} linked CSV observations across {selection.sourceProvenance.datasets.length} report-specific dataset(s). CSV import does not mean independent verification.</p>
    </>}
  </section>;
}
