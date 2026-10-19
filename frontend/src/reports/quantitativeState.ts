import type { QuantitativeDataset, QuantitativeObservation } from './api';

export type QuantitativeDataState =
  | 'no_data'
  | 'research_supplied'
  | 'csv_linked'
  | 'mixed_compatible'
  | 'partial_or_incompatible';

export function selectQuantitativeState(
  reportObservations: QuantitativeObservation[] = [],
  datasets: QuantitativeDataset[] = [],
): { state: QuantitativeDataState; reasons: string[]; observationCount: number } {
  const reportRows = reportObservations.filter((row) => row.observation_type === 'reported');
  const datasetRows = datasets.flatMap((dataset) => dataset.observations);
  const incompleteReport = reportRows.some((row) => row.validation_reasons.length > 0);
  const incompatibleDataset = datasets.some((dataset) => dataset.compatibility_status !== 'compatible');
  const reasons = [...new Set([
    ...reportRows.flatMap((row) => row.validation_reasons),
    ...datasets.flatMap((dataset) => dataset.validation_reasons),
  ])];
  if (incompleteReport || incompatibleDataset) {
    return { state: 'partial_or_incompatible', reasons, observationCount: reportRows.length + datasetRows.length };
  }
  if (!reportRows.length && !datasetRows.length) return { state: 'no_data', reasons: [], observationCount: 0 };
  if (reportRows.length && datasetRows.length) return { state: 'mixed_compatible', reasons, observationCount: reportRows.length + datasetRows.length };
  if (datasetRows.length) return { state: 'csv_linked', reasons, observationCount: datasetRows.length };
  return { state: 'research_supplied', reasons, observationCount: reportRows.length };
}

export const quantitativeStateLabels: Record<QuantitativeDataState, string> = {
  no_data: 'Qualitative research · No quantitative dataset linked',
  research_supplied: 'Research-supplied quantitative observations',
  csv_linked: 'CSV dataset linked to this report',
  mixed_compatible: 'Compatible report and CSV observations',
  partial_or_incompatible: 'Quantitative data has incomplete or incompatible coverage',
};
