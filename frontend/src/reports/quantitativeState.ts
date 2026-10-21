import type { QuantitativeDataset, QuantitativeObservation } from './api';

export type QuantitativeDataState =
  | 'no_data'
  | 'research_supplied'
  | 'csv_linked'
  | 'mixed_compatible'
  | 'report_scope_mismatch'
  | 'partial_with_report_scope_mismatch'
  | 'partial_or_incompatible';

export function selectQuantitativeState(
  reportObservations: QuantitativeObservation[] = [],
  datasets: QuantitativeDataset[] = [],
  reportScope?: { geo?: string | null; platform?: string | null },
): { state: QuantitativeDataState; reasons: string[]; observationCount: number } {
  const reportRows = reportObservations.filter((row) => row.observation_type === 'reported');
  const datasetRows = datasets.flatMap((dataset) => dataset.observations);
  const incompleteReport = reportRows.some((row) => row.validation_reasons.length > 0);
  const incompleteDataset = datasetRows.some((row) => (row.source_validation_reasons ?? row.validation_reasons).length > 0 || row.analysis_ready === false)
    || datasets.some((dataset) => dataset.validation_reasons.some((reason) => /missing|invalid|duplicate|non.numeric|ambiguous|does not resolve/i.test(reason)));
  const reportScopeMismatch = datasetRows.some((row) => row.report_compatibility === 'incompatible' || row.scope_compatible === false);
  const reasons = [...new Set([
    ...reportRows.flatMap((row) => row.validation_reasons),
    ...datasetRows.flatMap((row) => row.report_compatibility_reasons ?? []),
    ...datasetRows.flatMap((row) => row.source_validation_reasons ?? row.validation_reasons),
  ])];
  if (reportScopeMismatch) {
    const datasetGeo = [...new Set(datasetRows.map((row) => row.geo).filter(Boolean))].join(', ') || 'unknown GEO';
    const datasetPlatform = [...new Set(datasetRows.map((row) => row.platform).filter(Boolean))].join(', ') || 'unknown platform';
    const reportGeo = reportScope?.geo || 'unknown GEO';
    const reportPlatform = reportScope?.platform || 'unknown platform';
    reasons.unshift(`CSV data is available for ${datasetGeo} / ${datasetPlatform} analysis. It cannot be used directly as ${reportGeo} / ${reportPlatform} measurements.`);
  }
  if (incompleteReport || incompleteDataset) {
    return { state: reportScopeMismatch ? 'partial_with_report_scope_mismatch' : 'partial_or_incompatible', reasons, observationCount: reportRows.length + datasetRows.length };
  }
  if (!reportRows.length && !datasetRows.length) return { state: 'no_data', reasons: [], observationCount: 0 };
  if (reportScopeMismatch) {
    return { state: 'report_scope_mismatch', reasons: [...new Set(reasons)], observationCount: reportRows.length + datasetRows.length };
  }
  if (reportRows.length && datasetRows.length) return { state: 'mixed_compatible', reasons, observationCount: reportRows.length + datasetRows.length };
  if (datasetRows.length) return { state: 'csv_linked', reasons, observationCount: datasetRows.length };
  return { state: 'research_supplied', reasons, observationCount: reportRows.length };
}

export const quantitativeStateLabels: Record<QuantitativeDataState, string> = {
  no_data: 'Qualitative research · No quantitative dataset linked',
  research_supplied: 'Research-supplied quantitative observations',
  csv_linked: 'CSV dataset linked to this report',
  mixed_compatible: 'Compatible report and CSV observations',
  report_scope_mismatch: 'CSV data is usable in its original scope; it differs from this report scope',
  partial_with_report_scope_mismatch: 'CSV data has incomplete observations and differs from this report scope',
  partial_or_incompatible: 'Quantitative data has incomplete or incompatible coverage',
};
