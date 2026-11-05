import type { QuantitativeObservation } from '../reports/api';

// Plain-language reason why measurements are not "đủ điều kiện phân tích tự động".
// It only describes the rules already applied (isCsvAnalysisReadyObservation); it never relaxes them.
const UNKNOWN_SCOPE = ['unknown', 'unspecified', 'global / not specified', 'not specified', 'n/a'];

function unknownScope(value: string | null | undefined) {
  return !value || UNKNOWN_SCOPE.includes(value.trim().toLocaleLowerCase());
}

export function readinessGapText(observations: QuantitativeObservation[]): string {
  if (!observations.length) return '';
  const count = (predicate: (row: QuantitativeObservation) => boolean) => observations.filter(predicate).length;
  const gaps: string[] = [];
  const noMethod = count((row) => !row.methodology?.trim());
  if (noMethod) gaps.push(`phương pháp đo (${noMethod} dòng)`);
  const noUnit = count((row) => !row.unit);
  if (noUnit) gaps.push(`đơn vị hoặc tiền tệ (${noUnit} dòng)`);
  const noGeo = count((row) => unknownScope(row.geo));
  if (noGeo) gaps.push(`khu vực GEO (${noGeo} dòng)`);
  const noPeriodMeaning = count((row) => !row.period_semantics || row.period_semantics === 'unknown');
  if (noPeriodMeaning) gaps.push(`ý nghĩa của kỳ đo (${noPeriodMeaning} dòng)`);
  if (!gaps.length) return '';
  return `Còn thiếu: ${gaps.join('; ')}. Cách làm: mở “Nhập CSV”, bấm “Xem thông tin dữ liệu” và xác nhận các mục này. PO Hub không tự điền thay anh.`;
}
