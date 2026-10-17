import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { reportApi, type ImportedReport, type ReportInput, type ReportSummary } from './api';
import { extractHeadings, MarkdownReport } from './MarkdownReport';

type ResearchType = 'Market' | 'Competitors' | 'Benchmark' | 'Metrics';

export function buildResearchPrompt(input: { question: string; geo: string; os: string; researchPeriod: string; type: ResearchType }): string {
  return `# Product research request\n\n## Research question\n${input.question.trim()}\n\n## Scope\n- Research type: ${input.type}\n- GEO: ${input.geo.trim() || 'Not specified'}\n- OS: ${input.os}\n- Research period: ${input.researchPeriod.trim() || 'State the latest available period and exact dates for each source'}\n\n## Instructions\n1. Answer the research question directly in a concise executive summary.\n2. Analyze the market and category first. Only then analyze individual apps and product examples.\n3. Identify plausible benchmark candidates and explain why each is relevant. Label them as candidates, not rankings, unless a verifiable ranking source and scope are provided.\n4. Link real, accessible sources next to each verifiable conclusion. Never invent citations or URLs.\n5. Keep iOS and Android findings separate. State GEO and the exact data period for every source-backed observation; explain when a source does not disclose scope or dates.\n6. Do not infer downloads, revenue, market share, or growth from review counts, install milestones, or search results.\n7. Separate sourced facts, interpretation, and hypotheses. Mark unsupported or uncertain items clearly.\n8. Describe research gaps, coverage limitations, and a confidence level with a short rationale.\n9. End with practical next steps for a Product Owner.\n\n## Required Markdown structure\nUse these headings in this order:\n# Executive summary\n# Market overview\n# App and competitor analysis\n# Benchmark candidates\n# iOS findings\n# Android findings\n# Sources and evidence\n# Research gaps and confidence\n# Product Owner next steps\n\nDo not claim that missing data was collected. If reliable evidence is unavailable, say so explicitly.`;
}

function recentTitle(report: ReportSummary): string {
  return report.question || 'Untitled research report';
}

export function ResearchIntake() {
  const [question, setQuestion] = useState('');
  const [geo, setGeo] = useState('US');
  const [os, setOs] = useState<ReportInput['os']>('Both');
  const [researchType, setResearchType] = useState<ResearchType>('Market');
  const [researchPeriod, setResearchPeriod] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [reportContent, setReportContent] = useState('');
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
  const prompt = useMemo(() => buildResearchPrompt({ question, geo, os, researchPeriod, type: researchType }), [question, geo, os, researchPeriod, researchType]);

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
      const report = await reportApi.import({ question, geo: geo.trim().toUpperCase(), os, research_period: researchPeriod.trim() || null, content: reportContent });
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
        <label className="intake-field"><span className="field-label">OS</span><select value={os} onChange={(event) => setOs(event.target.value as ReportInput['os'])}><option>Both</option><option>iOS</option><option>Android</option></select></label>
        <label className="intake-field"><span className="field-label">Research type</span><select value={researchType} onChange={(event) => setResearchType(event.target.value as ResearchType)}><option>Market</option><option>Competitors</option><option>Benchmark</option><option>Metrics</option></select></label>
        <label className="intake-field"><span className="field-label">Kỳ nghiên cứu</span><input value={researchPeriod} onChange={(event) => setResearchPeriod(event.target.value)} maxLength={200} placeholder="Ví dụ: 2025–2026" /></label>
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

export function ReportViewer({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<ImportedReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const headings = report ? extractHeadings(report.content) : [];
  const imported = new URLSearchParams(window.location.search).has('imported');
  useEffect(() => { reportApi.get(reportId).then(setReport).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Không mở được báo cáo.')).finally(() => setLoading(false)); }, [reportId]);
  if (loading) return <section className="research-panel report-view-state" role="status">Đang mở báo cáo…</section>;
  if (error || !report) return <section className="research-panel report-view-state"><div className="research-alert" role="alert">{error || 'Không tìm thấy báo cáo.'}</div><a className="primary-action" href="/">Quay lại Research</a></section>;
  return <article className="report-viewer">
    {imported && <div className="research-success" role="status">{new URLSearchParams(window.location.search).has('duplicate') ? 'Báo cáo này đã được lưu trước đó; nội dung trùng được mở lại.' : 'Đã nhập và lưu báo cáo thành công.'}</div>}
    <header className="research-panel report-meta"><a className="text-button" href="/">← Quay lại Research</a><span className="field-label">CHATGPT REPORT · CHƯA XÁC MINH</span><h2>{report.question}</h2><dl><div><dt>GEO</dt><dd>{report.geo}</dd></div><div><dt>OS</dt><dd>{report.os}</dd></div><div><dt>Kỳ nghiên cứu</dt><dd>{report.research_period || 'Không được cung cấp'}</dd></div><div><dt>Nhập lúc</dt><dd>{new Date(report.imported_at).toLocaleString()}</dd></div></dl><a className="text-button" href="/reports">Mở lịch sử báo cáo</a></header>
    <div className="report-content-layout">{headings.length > 0 && <nav className="research-panel report-toc" aria-label="Mục lục"><strong>Mục lục</strong><ol>{headings.map((heading, index) => <li key={`${heading.id}-${index}`} style={{ marginLeft: `${Math.max(0, heading.level - 1) * 8}px` }}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ol></nav>}<section className="research-panel report-body" aria-label="Nội dung báo cáo"><MarkdownReport markdown={report.content} /></section></div>
  </article>;
}
