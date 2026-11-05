import { describe, expect, it } from 'vitest';
import type { QuantitativeObservation } from '../reports/api';
import { readinessGapText } from './readinessGaps';

function row(extra: Partial<QuantitativeObservation>): QuantitativeObservation {
  return { metric_id: 'downloads_absolute', metric_definition: 'Downloads', value: 1, unit: 'downloads', geo: 'Worldwide', platform: 'Unified',
    methodology: 'Sensor Tower', period_semantics: 'reporting_interval', ...extra } as QuantitativeObservation;
}

describe('readinessGapText', () => {
  it('names the fields actually missing, with counts, and what the PO can do', () => {
    const text = readinessGapText([row({ methodology: null }), row({ methodology: null, geo: null, unit: '' }), row({})]);
    expect(text).toContain('phương pháp đo (2 dòng)');
    expect(text).toContain('đơn vị hoặc tiền tệ (1 dòng)');
    expect(text).toContain('khu vực GEO (1 dòng)');
    expect(text).not.toContain('ý nghĩa của kỳ đo');
    expect(text).toContain('Xem thông tin dữ liệu');
  });

  it('says nothing when every field is present', () => {
    expect(readinessGapText([row({})])).toBe('');
    expect(readinessGapText([])).toBe('');
  });

  it('flags unknown period meaning as its own gap', () => {
    expect(readinessGapText([row({ period_semantics: 'unknown' })])).toContain('ý nghĩa của kỳ đo (1 dòng)');
  });
});
