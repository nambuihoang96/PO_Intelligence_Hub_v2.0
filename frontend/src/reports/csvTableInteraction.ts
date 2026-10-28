/** UI-only table interactions; no CSV source values or backend fields are changed. */
export type CsvColumnSort = { column: string; direction: 'asc' | 'desc' };

export function nextCsvColumnSort(current: CsvColumnSort, column: string, firstDirection: 'asc' | 'desc' = 'desc'): CsvColumnSort {
  if (current.column !== column) return { column, direction: firstDirection };
  if (current.direction === firstDirection) return { column, direction: firstDirection === 'asc' ? 'desc' : 'asc' };
  return { column: '', direction: 'asc' };
}

function numericCsvValue(value: string): number | null {
  let text = value.trim().replace(/[\s%$€₫]/g, '');
  if (!text) return null;
  if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) text = text.replaceAll(',', '');
  else if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)) text = text.replaceAll('.', '').replace(',', '.');
  else if (/^[+-]?\d+,\d+$/.test(text)) text = text.replace(',', '.');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function compareCsvCells(left: string, right: string, direction: 'asc' | 'desc'): number {
  const a = left.trim();
  const b = right.trim();
  // Blank values are unknown, not zero: keep them last in both directions.
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  const numericA = numericCsvValue(a);
  const numericB = numericCsvValue(b);
  const order = numericA !== null && numericB !== null
    ? numericA - numericB
    : a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? order : -order;
}
