type SourcePeriod = {
  snapshot_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  period_semantics?: string | null;
};

/** Presentation-only labels: never alter stored provider metric definitions. */
const knownMetricNames: Record<string, string> = {
  downloads_absolute: 'Lượt tải (giá trị nguồn)',
  downloads_yoy_growth_absolute: 'Thay đổi lượt tải so với cùng kỳ (số lượng)',
  downloads_yoy_growth_percent: 'Thay đổi lượt tải so với cùng kỳ (%)',
  revenue_absolute: 'Doanh thu (giá trị nguồn)',
  revenue_yoy_growth_absolute: 'Thay đổi doanh thu so với cùng kỳ (số lượng)',
  revenue_yoy_growth_percent: 'Thay đổi doanh thu so với cùng kỳ (%)',
  dau_absolute: 'Người dùng hoạt động hằng ngày (DAU)',
  dau_yoy_growth_absolute: 'Thay đổi DAU so với cùng kỳ (số lượng)',
  dau_yoy_growth_percent: 'Thay đổi DAU so với cùng kỳ (%)',
};

export function csvMetricLabel(metricId?: string | null, suppliedName?: string | null): string {
  return (metricId && knownMetricNames[metricId]) || suppliedName || metricId || 'Chỉ số chưa xác định';
}

/** A CSV Date column alone is not evidence of a confirmed reporting interval. */
export function csvSourcePeriodLabel(item: SourcePeriod): string {
  const { snapshot_date, period_start, period_end, period_semantics } = item;
  const range = period_start && period_end ? `${period_start} – ${period_end}` : null;
  if (period_semantics === 'reporting_interval' && range) return `Kỳ báo cáo đã khai báo: ${range}`;
  if (period_semantics === 'rolling_interval' && range) return `Kỳ trượt đã khai báo: ${range}`;
  if (period_semantics === 'snapshot' && snapshot_date) return `Thời điểm ghi nhận: ${snapshot_date}`;
  const sourceDate = snapshot_date || range || period_start || period_end;
  return sourceDate
    ? `Ngày ghi trong CSV: ${sourceDate} · Chưa xác nhận ý nghĩa kỳ đo`
    : 'Chưa có ngày và chưa xác nhận kỳ đo';
}

export function csvCompatibilityLabel(status: 'compatible' | 'partial' | 'incompatible'): string {
  if (status === 'partial') return 'Dữ liệu nguồn · cần kiểm tra điều kiện so sánh';
  if (status === 'incompatible') return 'Không tương thích với phạm vi báo cáo';
  return 'Phạm vi phù hợp · cần kiểm tra phép đo';
}
