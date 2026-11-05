import { describe, expect, it } from 'vitest';
import { groupWarnings, proposalFromFilename } from './csvWarnings';

describe('groupWarnings', () => {
  it('collapses 113 raw row reasons into a few Vietnamese types, keeping row numbers', () => {
    const reasons = [
      'Missing GEO.', 'CSV row 2 is missing GEO.', 'CSV row 3 is missing GEO.',
      'CSV row 2 is missing period meaning.', 'Snapshot date semantics must be selected before comparison.',
      'CSV row 2 has no year-over-year value (no prior-year data, possibly a newly launched app).',
      'CSV row 3 has a non-numeric value \'15.048.858\'.', 'Missing unit.', 'CSV row 3 is missing unit.',
      'Measurement methodology is not confirmed by CSV or provider documentation. Review dataset information.',
      'Measurement window extends beyond today; completed observed data cannot be claimed.',
      'Tên tệp ghi kỳ từ 2026-09-14 đến 2026-10-13, nhưng ngày trong CSV chỉ từ 2026-09-14 đến 2026-09-14.',
    ];
    const groups = groupWarnings(reasons);
    const byId = Object.fromEntries(groups.map((group) => [group.id, group]));
    expect(reasons.length).toBe(12);
    expect(byId.geo.count).toBe(3);
    expect(byId.geo.rows).toEqual([2, 3]);
    expect(byId.period.count).toBe(2);
    expect(byId.yoy.title).toBe('Chưa có số năm trước');
    expect(byId.format.help).toContain('dấu chấm');
    expect(byId.future.title).toBe('Kỳ hoặc ngày sau hôm nay');
    expect(byId.filename.title).toBe('Tên tệp ghi kỳ khác với ngày trong CSV');
    expect(groups.map((group) => group.id)[0]).toBe('future');
    expect(groupWarnings(['Dòng 4 không có giá trị so sánh cùng kỳ năm trước.', 'CSV row 4 has an invalid snapshot_date; use YYYY-MM-DD.']).map((group) => group.id)).toEqual(['date', 'yoy']);
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(reasons.length);
  });

  it('keeps unknown messages visible under a generic group', () => {
    const groups = groupWarnings(['Something new happened.']);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('other');
    expect(groups[0].examples).toEqual(['Something new happened.']);
  });
});

describe('proposalFromFilename', () => {
  it('proposes a 30-day window and Worldwide GEO from a Sensor Tower style name', () => {
    expect(proposalFromFilename('Unified Top Apps Downloads YoY Growth (Sep 14, 2026 - Oct 13, 2026, Worldwide),rutgon.csv')).toEqual({
      periodStart: '2026-09-14', periodEnd: '2026-10-13', geo: 'Worldwide',
    });
  });
  it('proposes nothing when the name has no period or GEO', () => {
    expect(proposalFromFilename('export.csv')).toEqual({ periodStart: null, periodEnd: null, geo: null });
    expect(proposalFromFilename('Sep 30, 2026 - Sep 1, 2026.csv').periodStart).toBeNull();
  });
});
