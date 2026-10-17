import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { reportApi, type ReportInput, type ReportSummary } from './api';
import { extractHeadings } from './MarkdownReport';

export function buildResearchPrompt(input: { question: string; geo: string; os: string; researchPeriod: string; focus?: string }): string {
  return `# Product research request\n\n## Research question\n${input.question.trim()}\n\n## Scope\n- Research focus: ${input.focus?.trim() || 'Determine an appropriate scope from the question; do not assume an industry or taxonomy.'}\n- GEO: ${input.geo.trim() || 'Not specified'}\n- Platform or environment: ${input.os || 'Not specified'}\n- Research period: ${input.researchPeriod.trim() || 'State the available period and exact dates for each source when known.'}\n\n## Instructions\n1. Answer the research question directly, then organize the analysis around the evidence and concepts actually present in this research.\n2. Choose headings, entities, finding types, and comparison dimensions that fit this subject. Do not force irrelevant sections, categories, products, metrics, or benchmark dimensions.\n3. Identify possible comparison candidates only when relevant, explain inclusion criteria, and never imply a ranking without a cited source and explicit scope.\n4. Link real source URLs to the claims they support. Never invent citations, URLs, entities, IDs, rankings, or measurements.\n5. State GEO, platform/environment, and time scope only where applicable; distinguish unknown scope from known values.\n6. Do not infer downloads, revenue, market share, growth, or other measurements from indirect proxies such as review counts or search results.\n7. Distinguish sourced observations, interpretation, and hypotheses. Include confidence only with a reason; otherwise state that confidence was not assessed.\n8. Describe research gaps and practical next steps for a Product Owner where the evidence supports them.\n9. Preserve uncertainty and say explicitly when reliable evidence is unavailable.\n\n## Output\nReturn a readable Markdown report with headings that fit the subject, plus a JSON object in a fenced \`json\` block using this envelope:\n{\n  \"sections\": [{\"heading\": \"...\", \"content\": \"...\", \"hierarchy\": 1, \"source_location\": \"...\"}],\n  \"entities\": [{\"key\": \"stable-local-key\", \"entity_type\": \"open taxonomy label\", \"name\": \"...\", \"attributes\": {}, \"evidence_references\": [\"URL present in report\"]}],\n  \"findings\": [{\"key\": \"stable-local-key\", \"finding_type\": \"open label\", \"title\": \"...\", \"description\": \"...\", \"related_entities\": [], \"evidence_references\": [], \"scope\": {}, \"evidence_status\": \"unverified\", \"confidence\": null, \"uncertainty\": null, \"po_implications\": null}],\n  \"evidence_references\": [{\"url\": \"URL present in report\", \"title\": null, \"source_location\": null, \"verified\": false}],\n  \"benchmark_dimensions\": [{\"key\": \"stable-local-key\", \"name\": \"dimension grounded in this research\", \"related_entities\": [], \"evidence_references\": [], \"observations\": [], \"po_notes\": null}],\n  \"research_gaps\": [], \"po_recommendations\": []\n}\nUse only source URLs included in the Markdown report. Related-entity values must use entity keys above. Do not create IDs for external products or add unsupported values. If a field is not supported, leave its list empty or value null. The JSON is structured user-provided content; it is not independently verified.`;
}

function recentTitle(report: ReportSummary): string {
  return report.question || 'Untitled research report';
}

export function ResearchIntake() {
  const [question, setQuestion] = useState('');
  const [geo, setGeo] = useState('Global / not specified');
  const [os, setOs] = useState<ReportInput['os']>('Unknown');
  const [customEnvironment, setCustomEnvironment] = useState('');
  const [researchFocus, setResearchFocus] = useState('');
  const [researchPeriod, setResearchPeriod] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [structuredJson, setStructuredJson] = useState('');
  const [history, setHistory] = useState<ReportSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPromptFallback, setShowPromptFallback] = useState(false);
  const [fileName, setFileName] = useState('');
  const prompt = useMemo(() => buildResearchPrompt({ question, geo, os, researchPeriod, focus: researchFocus }), [question, geo, os, researchPeriod, researchFocus]);

  useEffect(() => {
    reportApi.list().then((page) => { setHistory(page.items); setNextCursor(page.next_cursor); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Không tải được lịch sử báo cáo.'))
      .finally(() => setHistoryLoading(false));
  }, []);

  async function copyPrompt() {
    if (!question.trim()) { setError('Hãy nhập câu hỏi nghiên cứu trước khi tạo prompt.'); return; }
    try {
      await navigator.clipboard.writeText(prompt);
      setError(''); setCopied(true); setShowPromptFallback(false); setSuccess('Prompt đã được sao chép. Hãy dán vào ChatGPT để nghiên cứu.');
    } catch {
      setCopied(false); setShowPromptFallback(true); setError('Không thể sao chép tự động. Hãy chọn và sao chép prompt bên dưới.');
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name)) { setError('Chỉ hỗ trợ file .md hoặc .txt.'); event.currentTarget.value = ''; return; }
    if (file.size > 2_000_000) { setError('File vượt quá giới hạn 2 MB.'); event.currentTarget.value = ''; return; }
    setFileName(file.name);
    setError('');
    try {
      const text = typeof file.text === 'function' ? await file.text() : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error('Không đọc được file.'));
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.readAsText(file);
      });
      setReportContent(text);
    } catch {
      setFileName(''); setError('Không đọc được nội dung file. Hãy thử lại hoặc dán báo cáo vào ô nhập.');
    }
  }

  async function loadMore() {
    if (!nextCursor || moreLoading) return;
    setMoreLoading(true); setError('');
    try {
      const page = await reportApi.list(nextCursor);
      setHistory((current) => [...current, ...page.items]); setNextCursor(page.next_cursor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải thêm được lịch sử.'); }
    finally { setMoreLoading(false); }
  }

  async function importReport() {
    setError(''); setSuccess('');
    if (!question.trim()) { setError('Nhập câu hỏi nghiên cứu để lưu cùng báo cáo.'); return; }
    if (!geo.trim()) { setError('Nhập GEO để lưu cùng báo cáo.'); return; }
    if (!reportContent.trim()) { setError('Dán nội dung báo cáo hoặc chọn file .md/.txt.'); return; }
    setImportLoading(true);
    try {
      const environment = os === 'Other' ? customEnvironment.trim() : os;
      if (!environment) { setError('Nhập environment cần nghiên cứu.'); return; }
      const report = await reportApi.import({ question, geo: geo.trim(), os: environment, research_period: researchPeriod.trim() || null, content: reportContent, ...(structuredJson.trim() ? { structured_json: structuredJson } : {}) });
      window.history.pushState({}, '', `/reports/${report.id}?imported=1${report.duplicate ? '&duplicate=1' : ''}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không nhập được báo cáo. Vui lòng thử lại.'); }
    finally { setImportLoading(false); }
  }

  const previewHeadings = extractHeadings(reportContent);
  const validationMessage = !question.trim() ? 'Cần có câu hỏi nghiên cứu.' : !geo.trim() ? 'Cần có GEO.' : !reportContent.trim() ? 'Cần có nội dung báo cáo.' : 'Thông tin hợp lệ để xem trước và nhập.';

  return <div className="intake-workspace">
    <section className="research-panel intake-form" aria-labelledby="intake-title">
      <div className="panel-heading"><div><span className="field-label">CHATGPT PLUS + LOCAL WORKSPACE</span><h2 id="intake-title">Bắt đầu với câu hỏi sản phẩm</h2></div></div>
      <label className="intake-field"><span className="field-label">Bạn muốn nghiên cứu gì?</span><textarea rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ví dụ: Các app học tiếng Anh cho trẻ em tại Mỹ đang tạo động lực học tập như thế nào?" /></label>
      <div className="intake-scope-grid">
        <label className="intake-field"><span className="field-label">GEO</span><input value={geo} onChange={(event) => setGeo(event.target.value)} maxLength={100} placeholder="US, JP, KR…" /></label>
        <label className="intake-field"><span className="field-label">Environment</span><select value={os} onChange={(event) => setOs(event.target.value)}><option>Unknown</option><option>Not applicable</option><option>iOS</option><option>Android</option><option>Both</option><option>Web</option><option>Desktop</option><option>Cross-platform</option><option value="Other">Other</option></select></label>
        <label className="intake-field"><span className="field-label">Research focus (optional)</span><input value={researchFocus} onChange={(event) => setResearchFocus(event.target.value)} maxLength={200} placeholder="Nhập lĩnh vực hoặc trọng tâm theo cách của bạn" /></label>
        <label className="intake-field"><span className="field-label">Kỳ nghiên cứu</span><input value={researchPeriod} onChange={(event) => setResearchPeriod(event.target.value)} maxLength={200} placeholder="Ví dụ: 2025–2026" /></label>
        {os === 'Other' && <label className="intake-field"><span className="field-label">Environment name</span><input value={customEnvironment} onChange={(event) => setCustomEnvironment(event.target.value)} maxLength={100} placeholder="Môi trường nghiên cứu" /></label>}
      </div>
      <div className="intake-actions">
        <button className="primary-action" type="button" onClick={copyPrompt}>Copy prompt for ChatGPT <span aria-hidden="true">↗</span></button>
        <button className="secondary-action" type="button" onClick={() => { setShowImport((value) => !value); setError(''); setSuccess(''); }}>Import ChatGPT report</button>
      </div>
      {copied && <div className="research-success" role="status">{success}</div>}
      {!copied && success && <div className="research-success" role="status">{success}</div>}
      {error && <div className="research-alert" role="alert">{error}</div>}
      {showPromptFallback && <label className="intake-field prompt-fallback"><span className="field-label">Prompt for ChatGPT</span><textarea rows={12} readOnly value={prompt} onFocus={(event) => event.currentTarget.select()} /></label>}
      {showImport && <section className="report-import-card" aria-labelledby="import-title">
        <div className="panel-heading"><div><span className="field-label">IMPORT REPORT</span><h2 id="import-title">Dán hoặc chọn báo cáo Markdown</h2></div><span className="unverified-chip">Sẽ lưu chưa xác minh</span></div>
        <label className="intake-field"><span className="field-label">Nội dung báo cáo</span><textarea rows={12} value={reportContent} onChange={(event) => { setReportContent(event.target.value); setFileName(''); }} placeholder="# Executive summary&#10;&#10;Dán toàn bộ báo cáo ChatGPT tại đây…" /></label>
        <div className="file-picker"><label className="secondary-action" htmlFor="report-file">Chọn file .md hoặc .txt</label><input id="report-file" type="file" accept=".md,.txt,text/markdown,text/plain" onChange={readFile} /><span>{fileName || 'Tối đa 2 MB'}</span></div>
        <details className="structured-import"><summary>Structured JSON (tùy chọn)</summary><p>JSON không hợp lệ sẽ được báo lỗi trích xuất; báo cáo gốc vẫn được lưu nguyên văn.</p><label className="intake-field"><span className="field-label">Universal research data JSON</span><textarea rows={10} value={structuredJson} onChange={(event) => setStructuredJson(event.target.value)} placeholder="Dán object JSON theo định dạng trong prompt đã tạo" /></label></details>
        <div className="report-preview" aria-live="polite"><strong>Xem trước và kiểm tra</strong><p>{validationMessage}</p><span>{reportContent.length.toLocaleString()} ký tự · {previewHeadings.length} heading · {Array.from(reportContent.matchAll(/https?:\/\/[^\s)<>]+/g)).length} URL nhận diện</span>{reportContent && <pre>{reportContent.slice(0, 700)}{reportContent.length > 700 ? '…' : ''}</pre>}</div>
        <div className="intake-actions"><button className="primary-action" type="button" onClick={importReport} disabled={importLoading || !question.trim() || !geo.trim() || !reportContent.trim()}>{importLoading ? 'Đang nhập…' : 'Import report'}</button><button className="text-button" type="button" onClick={() => setShowImport(false)}>Hủy</button></div>
      </section>}
    </section>
    <section className="research-panel recent-reports" aria-labelledby="recent-reports-title">
      <div className="panel-heading"><div><span className="field-label">RESEARCH HISTORY</span><h2 id="recent-reports-title">Báo cáo gần đây</h2></div><a className="text-button" href="/reports">Xem lịch sử</a></div>
      {historyLoading ? <p className="report-history-state" role="status">Đang tải báo cáo…</p> : history.length === 0 ? <div className="report-history-state"><strong>Chưa có báo cáo nào</strong><span>Báo cáo bạn nhập từ ChatGPT sẽ xuất hiện ở đây.</span></div> : <div className="report-history-list">{history.map((report) => <a className="report-history-row" href={`/reports/${report.id}`} key={report.id}><span className="report-history-copy"><strong>{recentTitle(report)}</strong><small>{report.geo} · {report.os} · {report.research_period || 'Chưa ghi kỳ nghiên cứu'}</small></span><span className="report-date">{new Date(report.imported_at).toLocaleDateString()}</span><span aria-hidden="true">→</span></a>)}</div>}
      {nextCursor && <div className="report-load-more"><button className="secondary-action" type="button" onClick={loadMore} disabled={moreLoading}>{moreLoading ? 'Đang tải…' : 'Tải thêm'}</button></div>}
    </section>
  </div>;
}

export function ReportHistory() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { reportApi.list().then((page) => { setReports(page.items); setCursor(page.next_cursor); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Không tải được lịch sử.')).finally(() => setLoading(false)); }, []);
  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    try { const page = await reportApi.list(cursor); setReports((current) => [...current, ...page.items]); setCursor(page.next_cursor); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải thêm được lịch sử.'); }
    finally { setLoading(false); }
  }
  return <section className="research-panel report-history-page"><div className="panel-heading"><div><span className="field-label">REPORT LIBRARY</span><h2>Lịch sử báo cáo</h2></div><a className="primary-action" href="/">Nhập báo cáo</a></div>{error && <div className="research-alert" role="alert">{error}</div>}{loading && reports.length === 0 ? <p role="status">Đang tải báo cáo…</p> : reports.length === 0 ? <p>Chưa có báo cáo. Hãy nhập báo cáo từ ChatGPT để lưu lại.</p> : <div className="report-history-list">{reports.map((report) => <a className="report-history-row" href={`/reports/${report.id}`} key={report.id}><span className="report-history-copy"><strong>{recentTitle(report)}</strong><small>{report.geo} · {report.os} · {report.research_period || 'Chưa ghi kỳ nghiên cứu'}</small></span><span className="report-date">{new Date(report.imported_at).toLocaleString()}</span><span aria-hidden="true">→</span></a>)}</div>}{cursor && <div className="report-load-more"><button className="secondary-action" onClick={loadMore} disabled={loading}>{loading ? 'Đang tải…' : 'Tải thêm báo cáo'}</button></div>}<a className="text-button" href="/">← Quay lại Research</a></section>;
}

export { ReportViewer } from './ReportResults';
