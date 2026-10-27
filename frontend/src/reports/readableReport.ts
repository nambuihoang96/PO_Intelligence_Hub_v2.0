/**
 * Builds a readable view of an imported ChatGPT research report.
 * The exact original is kept in report.content for traceability.
 */
export type ReadableReport = { markdown: string; technicalAppendix: string | null };

function presentContract(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  const body = envelope.research_data ?? envelope;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;
  if (!('executive_summary' in data || 'sections' in data || 'findings' in data)) return null;
  const pieces: string[] = [];
  if (typeof data.executive_summary === 'string' && data.executive_summary.trim()) {
    pieces.push('## Tóm tắt\n\n' + data.executive_summary.trim());
  }
  const list = (title: string, items: unknown): void => {
    if (Array.isArray(items)) {
      const lines = items.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
      if (lines.length) pieces.push('## ' + title + '\n\n' + lines.map((item) => '- ' + item).join('\n'));
    }
  };
  list('Những điểm nổi bật', data.key_takeaways);
  if (Array.isArray(data.sections)) data.sections.forEach((item: unknown) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const title = typeof row.heading === 'string' ? row.heading : 'Nội dung nghiên cứu';
    const content = typeof row.content === 'string' ? row.content : '';
    if (content.trim()) pieces.push('## ' + title + '\n\n' + content);
  });
  if (Array.isArray(data.findings)) {
    const findings = data.findings.flatMap((item: unknown): string[] => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      if (typeof row.description !== 'string' || !row.description.trim()) return [];
      const title = typeof row.title === 'string' && row.title ? row.title : 'Phát hiện';
      const lines = ['### ' + title, row.description];
      if (typeof row.uncertainty === 'string' && row.uncertainty) lines.push('**Chưa chắc chắn:** ' + row.uncertainty);
      if (typeof row.po_implications === 'string' && row.po_implications) lines.push('**Ý nghĩa đối với PO:** ' + row.po_implications);
      if (row.evidence_status !== 'verified') lines.push('*Theo báo cáo, chưa xác minh độc lập.*');
      return [lines.join('\n\n')];
    });
    if (findings.length) pieces.push('## Phát hiện nghiên cứu\n\n' + findings.join('\n\n'));
  }
  list('Khoảng trống nghiên cứu', data.research_gaps);
  list('Đề xuất và bước tiếp theo', data.po_recommendations);
  return pieces.length ? pieces.join('\n\n') : null;
}

export function extractReadableReport(original: string): ReadableReport {
  const text = original.trim();
  const marker = /(?:^|\r?\n)\s*PO_RESEARCH_V1\s*\r?\n\s*\x60{3}(?:json)?\s*\r?\n([\s\S]*?)\r?\n\x60{3}\s*$/i.exec(text);
  if (marker && marker.index !== undefined) {
    const markdown = text.slice(0, marker.index).trim();
    const technicalAppendix = text.slice(marker.index).trim();
    if (markdown) return { markdown, technicalAppendix };
    try {
      const view = presentContract(JSON.parse(marker[1]));
      if (view) return { markdown: view, technicalAppendix };
    } catch { /* Keep the original bytes accessible for review. */ }
    return { markdown: 'Chưa có phần báo cáo dễ đọc. Nội dung gốc vẫn được lưu ở phần dữ liệu kỹ thuật.', technicalAppendix };
  }
  const fencedJson = /^\x60{3}(?:json)?\s*\r?\n([\s\S]*?)\r?\n\x60{3}\s*$/i.exec(text);
  const candidate = fencedJson?.[1] ?? text;
  if (/^\s*[\[{]/.test(candidate)) {
    try {
      const view = presentContract(JSON.parse(candidate));
      if (view) return { markdown: view, technicalAppendix: text };
    } catch { /* Ordinary markdown or invalid JSON must not be rewritten. */ }
  }
  return { markdown: original, technicalAppendix: null };
}
