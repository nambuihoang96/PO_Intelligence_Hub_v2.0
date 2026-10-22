/** Presentation helpers shared by report-supplied and CSV-supplied measurements. */
export function formatQuantitativeValue(value: number | null, unit: string | null): string {
  const number = value === null ? 'Unknown' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
  return [number, unit].filter(Boolean).join(' ');
}

export function formatSignedQuantitativeValue(value: number | null, unit: string | null): string {
  if (value === null) return formatQuantitativeValue(value, unit);
  return `${value > 0 ? '+' : ''}${formatQuantitativeValue(value, unit)}`;
}

export function formatQuantitativePeriod(start: string | null, end: string | null, snapshot: string | null = null): string {
  if (snapshot) return `Snapshot · ${snapshot}`;
  if (!start && !end) return 'Period not supplied';
  if (start === end) return start || 'Period not supplied';
  return `${start ?? '?'} – ${end ?? '?'}`;
}
