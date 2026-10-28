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
    const datasetGeo = [...new Set(datasetRows.map((row) => row.geo).filter(Boolean))].join(', ') || 'chưa rõ GEO';
    const datasetPlatform = [...new Set(datasetRows.map((row) => row.platform).filter(Boolean))].join(', ') || 'chưa rõ nền tảng';
    const reportGeo = reportScope?.geo || 'chưa rõ GEO';
    const reportPlatform = reportScope?.platform || 'chưa rõ nền tảng';
    reasons.unshift(`Có dữ liệu CSV trong phạm vi ${datasetGeo} / ${datasetPlatform}. Không thể dùng trực tiếp các số liệu này cho phạm vi ${reportGeo} / ${reportPlatform} của báo cáo.`);
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
  no_data: 'Nghiên cứu định tính · Chưa liên kết bộ dữ liệu định lượng',
  research_supplied: 'Có số liệu định lượng do báo cáo cung cấp',
  csv_linked: 'Đã liên kết dữ liệu CSV với báo cáo này',
  mixed_compatible: 'Số liệu từ báo cáo và CSV có thể kết hợp',
  report_scope_mismatch: 'CSV dùng được trong phạm vi gốc nhưng khác phạm vi báo cáo',
  partial_with_report_scope_mismatch: 'CSV có số liệu chưa đầy đủ và khác phạm vi báo cáo',
  partial_or_incompatible: 'Dữ liệu định lượng chưa đầy đủ hoặc không tương thích',
};
