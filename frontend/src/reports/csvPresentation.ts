type SourcePeriod = {
  snapshot_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  period_semantics?: string | null;
};

/** Presentation-only labels: never alter stored provider metric definitions. */
const knownMetricNames: Record<string, string> = {
  downloads_absolute: 'Lượt tải',
  downloads_yoy_growth_absolute: 'Tăng/giảm lượt tải so với cùng kỳ',
  downloads_yoy_growth_percent: 'Tăng/giảm lượt tải so với cùng kỳ (%)',
  revenue_absolute: 'Doanh thu',
  revenue_yoy_growth_absolute: 'Tăng/giảm doanh thu so với cùng kỳ',
  revenue_yoy_growth_percent: 'Tăng/giảm doanh thu so với cùng kỳ (%)',
  dau_absolute: 'Người dùng hoạt động mỗi ngày (DAU)',
  dau_yoy_growth_absolute: 'Tăng/giảm DAU so với cùng kỳ',
  dau_yoy_growth_percent: 'Tăng/giảm DAU so với cùng kỳ (%)',
};

export function csvMetricLabel(metricId?: string | null, suppliedName?: string | null): string {
  return (metricId && knownMetricNames[metricId]) || suppliedName || metricId || 'Chỉ số chưa xác định';
}

export function csvUnitLabel(unit?: string | null): string {
  const value = unit?.trim();
  if (!value) return '';
  const key = value.toLocaleLowerCase();
  if (key === 'download' || key === 'downloads') return 'lượt tải';
  if (key === 'usd') return 'USD';
  if (key === 'percent' || key === 'percentage') return '%';
  return value;
}

/** A CSV Date column alone is not evidence of a confirmed reporting interval. */
export function csvSourcePeriodLabel(item: SourcePeriod): string {
  const { snapshot_date, period_start, period_end, period_semantics } = item;
  const range = period_start && period_end ? `${period_start} – ${period_end}` : null;
  if (period_semantics === 'reporting_interval' && range) return `Kỳ báo cáo: ${range}`;
  if (period_semantics === 'rolling_interval' && range) return `Khoảng thời gian tính trượt: ${range}`;
  if (period_semantics === 'snapshot' && snapshot_date) return `Ngày ghi nhận: ${snapshot_date}`;
  const sourceDate = snapshot_date || range || period_start || period_end;
  return sourceDate
    ? `Ngày trong CSV: ${sourceDate} · Chưa xác nhận kỳ dữ liệu`
    : 'Chưa có kỳ dữ liệu';
}

export function csvCompatibilityLabel(status: 'compatible' | 'partial' | 'incompatible'): string {
  if (status === 'partial') return 'Dữ liệu nguồn · cần kiểm tra điều kiện so sánh';
  if (status === 'incompatible') return 'Không tương thích với phạm vi báo cáo';
  return 'Phạm vi phù hợp · cần kiểm tra phép đo';
}
