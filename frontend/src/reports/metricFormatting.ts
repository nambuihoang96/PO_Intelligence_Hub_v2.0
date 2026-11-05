export function isPercentageUnit(unit: string | null | undefined): boolean {
  return typeof unit === 'string' && ['%', 'percent', 'percentage'].includes(unit.trim().toLocaleLowerCase());
}

export function formatMetricValue(value: number | null | undefined, unit: string | null | undefined): string {
  const displayedValue = value ?? 'Chưa có';
  return isPercentageUnit(unit) ? `${displayedValue}%` : [displayedValue, unit].filter(Boolean).join(' ');
}

export function formatMetricChange(before: number, after: number, unit: string | null | undefined): string {
  const delta = after - before;
  const signedDelta = delta > 0 ? `+${delta}` : String(delta);
  const deltaUnit = isPercentageUnit(unit) ? 'điểm phần trăm' : unit;
  const absoluteChange = [signedDelta, deltaUnit].filter(Boolean).join(' ');
  const relativeChange = before !== 0
    ? `${delta / Math.abs(before) > 0 ? '+' : ''}${((delta / Math.abs(before)) * 100).toFixed(1)}% so với kỳ trước`
    : 'phần trăm không tính vì giá trị trước bằng 0';
  return `Thay đổi: ${absoluteChange} · ${relativeChange}`;
}
