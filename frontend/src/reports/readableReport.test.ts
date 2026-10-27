import { describe, expect, it } from 'vitest';
import { extractReadableReport } from './readableReport';

describe('extractReadableReport', () => {
  const fence = String.fromCharCode(96).repeat(3);

  it('hides the JSON appendix without losing the human-readable report', () => {
    const original = '# Puzzle\n\nBáo cáo dễ đọc.\n\nPO_RESEARCH_V1\n' + fence + 'json\n{"schema_version":"po_research_v1"}\n' + fence;
    const result = extractReadableReport(original);
    expect(result.markdown).toBe('# Puzzle\n\nBáo cáo dễ đọc.');
    expect(result.technicalAppendix).toContain('PO_RESEARCH_V1');
  });

  it('displays report sections for JSON-only research contract without inventing evidence', () => {
    const original = JSON.stringify({ schema_version: 'po_research_v1', research_data: {
      executive_summary: 'Kết luận', key_takeaways: ['Điểm chính'],
      sections: [{ heading: 'Thị trường', content: 'Mô tả' }],
      findings: [{ title: 'Rotate Rings', description: 'Nguồn báo cáo', evidence_status: 'unverified' }],
      research_gaps: ['Thiếu GEO'], po_recommendations: ['Kiểm tra thêm'],
    } });
    const result = extractReadableReport(original);
    expect(result.markdown).toContain('## Tóm tắt');
    expect(result.markdown).toContain('Rotate Rings');
    expect(result.markdown).toContain('chưa xác minh độc lập');
    expect(result.markdown).toContain('Thiếu GEO');
    expect(result.technicalAppendix).toBe(original);
  });

  it('preserves ordinary markdown and invalid JSON', () => {
    expect(extractReadableReport('## Báo cáo\n\nNội dung').markdown).toBe('## Báo cáo\n\nNội dung');
    expect(extractReadableReport('{not json}').markdown).toBe('{not json}');
  });
});
