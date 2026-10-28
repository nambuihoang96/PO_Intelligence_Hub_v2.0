import { describe, expect, it } from 'vitest';
import { csvCompatibilityLabel, csvMetricLabel, csvSourcePeriodLabel } from './csvPresentation';

describe('CSV presentation', () => {
  it('never implies partial compatibility means an analysis-ready observation', () => {
    expect(csvCompatibilityLabel('partial')).toContain('cần kiểm tra');
    expect(csvCompatibilityLabel('partial')).not.toContain('Một phần tương thích');
  });

  it('keeps an unknown provider name unchanged', () => {
    expect(csvMetricLabel('unknown_provider_metric', 'Downloads by cohort')).toBe('Downloads by cohort');
    expect(csvMetricLabel('downloads_yoy_growth_percent', 'Downloads YoY Growth %')).toContain('(%)');
  });

  it('labels an unconfirmed Date as a source date rather than a confirmed period', () => {
    const value = csvSourcePeriodLabel({ snapshot_date: '2026-10-14', period_semantics: 'unknown' });
    expect(value).toContain('Ngày ghi trong CSV: 2026-10-14');
    expect(value).toContain('Chưa xác nhận ý nghĩa kỳ đo');
    expect(value).not.toContain('Kỳ báo cáo đã khai báo');
  });

  it('labels an explicitly provided reporting interval as an interval', () => {
    expect(csvSourcePeriodLabel({
      period_start: '2026-09-01', period_end: '2026-09-30', period_semantics: 'reporting_interval',
    })).toContain('Kỳ báo cáo đã khai báo: 2026-09-01 – 2026-09-30');
  });
});
