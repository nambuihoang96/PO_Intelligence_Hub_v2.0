import { describe, expect, it } from 'vitest';
import { compareCsvCells, nextCsvColumnSort } from './csvTableInteraction';

describe('CSV table column controls', () => {
  it('cycles a numeric header through descending, ascending and unsorted', () => {
    const first = nextCsvColumnSort({ column: '', direction: 'asc' }, 'Downloads');
    expect(first).toEqual({ column: 'Downloads', direction: 'desc' });
    const second = nextCsvColumnSort(first, 'Downloads');
    expect(second).toEqual({ column: 'Downloads', direction: 'asc' });
    expect(nextCsvColumnSort(second, 'Downloads').column).toBe('');
  });
  it('starts product names in alphabetical order', () => {
    expect(nextCsvColumnSort({ column: '', direction: 'asc' }, 'Product Name', 'asc')).toEqual({ column: 'Product Name', direction: 'asc' });
  });
  it('sorts source downloads numerically without treating missing cells as zero', () => {
    expect(compareCsvCells('1,948,943', '13,837,982', 'asc')).toBeLessThan(0);
    expect(compareCsvCells('1.948.943', '13.837.982', 'desc')).toBeGreaterThan(0);
    expect(compareCsvCells('12.5%', '10%', 'desc')).toBeLessThan(0);
    expect(compareCsvCells('', '0', 'asc')).toBeGreaterThan(0);
    expect(compareCsvCells('', '0', 'desc')).toBeGreaterThan(0);
  });
});
