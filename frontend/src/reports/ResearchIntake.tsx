import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { reportApi, type ReportInput, type ReportSummary } from './api';
import { extractHeadings } from './MarkdownReport';

export function buildResearchPrompt(input: { question: string; geo: string; os: string; researchPeriod: string; focus?: string }): string {
  return `# Product research request\n\n## Research question\n${input.question.trim()}\n\n## Scope\n- Research focus: ${input.focus?.trim() || 'Determine an appropriate scope from the question; do not assume an industry or taxonomy.'}\n- GEO: ${input.geo.trim() || 'Not specified'}\n- Platform or environment: ${input.os || 'Not specified'}\n- Research period: ${input.researchPeriod.trim() || 'State the available period and exact dates for each source when known.'}\n\n## Instructions\n1. Answer the research question directly, then organize the analysis around the evidence and concepts actually present in this research.\n2. Choose headings, entities, finding types, and comparison dimensions that fit this subject. Do not force irrelevant sections, categories, products, metrics, or benchmark dimensions.\n3. Identify possible comparison candidates only when relevant, explain inclusion criteria, and never imply a ranking without a cited source and explicit scope.\n4. Link real source URLs to the claims they support. Never invent citations, URLs, entities, IDs, rankings, or measurements.\n5. State GEO, platform/environment, and time scope only where applicable; distinguish unknown scope from known values.\n6. Do not infer downloads, revenue, market share, growth, or other measurements from indirect proxies such as review counts or search results.\n7. Distinguish sourced observations, interpretation, and hypotheses. Include confidence only with a reason; otherwise state that confidence was not assessed.\n8. Describe research gaps and practical next steps for a Product Owner where the evidence supports them.\n9. Preserve uncertainty and say explicitly when reliable evidence is unavailable.\n\n## Output\nReturn a readable Markdown report with headings that fit the subject, plus a JSON object in a fenced \`json\` block using this envelope:\n{\n  \"sections\": [{\"heading\": \"...\", \"content\": \"...\", \"hierarchy\": 1, \"source_location\": \"...\"}],\n  \"entities\": [{\"key\": \"stable-local-key\", \"entity_type\": \"open taxonomy label\", \"name\": \"...\", \"attributes\": {}, \"evidence_references\": [\"URL present in report\"]}],\n  \"findings\": [{\"key\": \"stable-local-key\", \"finding_type\": \"open label\", \"title\": \"...\", \"description\": \"...\", \"related_entities\": [], \"evidence_references\": [], \"scope\": {}, \"evidence_status\": \"unverified\", \"confidence\": null, \"uncertainty\": null, \"po_implications\": null}],\n  \"evidence_references\": [{\"url\": \"URL present in report\", \"title\": null, \"source_location\": null, \"verified\": false}],\n  \"benchmark_dimensions\": [{\"key\": \"stable-local-key\", \"name\": \"dimension grounded in this research\", \"related_entities\": [], \"evidence_references\": [], \"observations\": [], \"po_notes\": null}],\n  \"research_gaps\": [], \"po_recommendations\": []\n}\nUse only source URLs included in the Markdown report. Related-entity values must use entity keys above. Do not create IDs for external products or add unsupported values. If a field is not supported, leave its list empty or value null. The JSON is structured user-provided content; it is not independently verified.`;
}

function recentTitle(report: ReportSummary): string {
  return report.question || 'Untitled research report';
}

type GeoOption = { label: string; value: string; code?: string };
const PRIORITY_GEOS: GeoOption[] = [
  { label: 'Global / not specified', value: 'Global / not specified' }, { label: 'Worldwide', value: 'Worldwide' },
  { label: 'United States (US)', value: 'US', code: 'US' }, { label: 'Vietnam (VN)', value: 'VN', code: 'VN' },
  { label: 'Japan (JP)', value: 'JP', code: 'JP' }, { label: 'South Korea (KR)', value: 'KR', code: 'KR' },
  { label: 'European Union (EU)', value: 'EU', code: 'EU' },
];
const GEO_COUNTRIES: GeoOption[] = [
  ['Argentina', 'AR'], ['Australia', 'AU'], ['Austria', 'AT'], ['Bangladesh', 'BD'], ['Belgium', 'BE'], ['Brazil', 'BR'],
  ['Cambodia', 'KH'], ['Canada', 'CA'], ['Chile', 'CL'], ['China', 'CN'], ['Colombia', 'CO'], ['Czechia', 'CZ'],
  ['Denmark', 'DK'], ['Egypt', 'EG'], ['Finland', 'FI'], ['France', 'FR'], ['Germany', 'DE'], ['Greece', 'GR'],
  ['Hong Kong', 'HK'], ['India', 'IN'], ['Indonesia', 'ID'], ['Ireland', 'IE'], ['Israel', 'IL'], ['Italy', 'IT'],
  ['Malaysia', 'MY'], ['Mexico', 'MX'], ['Netherlands', 'NL'], ['New Zealand', 'NZ'], ['Nigeria', 'NG'], ['Norway', 'NO'],
  ['Pakistan', 'PK'], ['Philippines', 'PH'], ['Poland', 'PL'], ['Portugal', 'PT'], ['Romania', 'RO'], ['Russia', 'RU'],
  ['Saudi Arabia', 'SA'], ['Singapore', 'SG'], ['South Africa', 'ZA'], ['Spain', 'ES'], ['Sweden', 'SE'], ['Switzerland', 'CH'],
  ['Taiwan', 'TW'], ['Thailand', 'TH'], ['Turkey', 'TR'], ['Ukraine', 'UA'], ['United Arab Emirates', 'AE'],
  ['United Kingdom', 'GB'], ['United States', 'US'], ['Vietnam', 'VN'],
].map(([name, code]) => ({ label: `${name} (${code})`, value: code, code }));
const GEO_OPTIONS = [...PRIORITY_GEOS, ...GEO_COUNTRIES.filter((country) => !PRIORITY_GEOS.some((priority) => priority.code === country.code))];

function GeoCombobox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const results = GEO_OPTIONS.filter((option) => `${option.label} ${option.value}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = GEO_OPTIONS.find((option) => option.value === value);
  const isCustom = value === 'Other / custom' || value.startsWith('custom:');
  function choose(option: { label: string; value: string }) { onChange(option.value); setOpen(false); setQuery(''); }
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, results.length)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter' && open) { event.preventDefault(); if (results[activeIndex]) choose(results[activeIndex]); else if (activeIndex === results.length) choose({ label: 'Other / custom', value: 'Other / custom' }); }
    else if (event.key === 'Escape') { setOpen(false); setQuery(''); }
  }
  return <div className="geo-combobox">
    <label className="intake-field" htmlFor="research-geo"><span className="field-label">GEO</span>
      <input id="research-geo" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="research-geo-options" aria-activedescendant={open && activeIndex >= 0 ? `research-geo-option-${activeIndex}` : undefined} aria-label="GEO" value={open ? query : (selected?.label ?? (isCustom ? 'Other / custom' : value))} onFocus={() => { setOpen(true); setQuery(''); }} onClick={() => { if (!open) { setOpen(true); setQuery(''); } }} onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); setOpen(true); }} onKeyDown={handleKeyDown} placeholder="Tìm quốc gia hoặc thị trường…" />
    </label>
    {open && <ul className="geo-options" id="research-geo-options" role="listbox" aria-label="GEO options">
      {results.map((option, index) => <li id={`research-geo-option-${index}`} key={option.value} role="option" aria-selected={option.value === value} className={index === activeIndex ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>{option.label}</li>)}
      <li id={`research-geo-option-${results.length}`} role="option" aria-selected={isCustom} className={activeIndex === results.length ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => choose({ label: 'Other / custom', value: 'Other / custom' })}>Other / custom</li>
    </ul>}
    {isCustom && <label className="intake-field"><span className="field-label">GEO tùy chỉnh</span><input aria-label="GEO tùy chỉnh" value={value.startsWith('custom:') ? value.slice(7) : ''} onChange={(event) => onChange(event.target.value ? `custom:${event.target.value}` : 'Other / custom')} placeholder="Nhập GEO hoặc market" /></label>}
  </div>;
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
  const [importSlow, setImportSlow] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPromptFallback, setShowPromptFallback] = useState(false);
  const [fileName, setFileName] = useState('');
  const importInFlight = useRef(false);
  const structuredJsonError = useMemo(() => {
    if (!structuredJson.trim()) return '';
    try { JSON.parse(structuredJson); return ''; }
    catch { return 'Structured JSON không hợp lệ. Kiểm tra dấu ngoặc, dấu phẩy và nội dung JSON.'; }
  }, [structuredJson]);
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
    if (importInFlight.current) return;
    if (!question.trim()) { setError('Nhập câu hỏi nghiên cứu để lưu cùng báo cáo.'); return; }
    if (!geo.trim() || geo === 'Other / custom') { setError('Chọn hoặc nhập GEO để lưu cùng báo cáo.'); return; }
    if (os === 'Other' && !customEnvironment.trim()) { setError('Nhập environment cần nghiên cứu.'); return; }
    if (!reportContent.trim()) { setError('Bạn chưa dán nội dung báo cáo hoặc chọn file .md/.txt. Structured JSON không thay thế cho báo cáo gốc.'); return; }
    if (structuredJsonError) { setError(structuredJsonError); return; }
    setImportLoading(true);
    setImportSlow(false);
    importInFlight.current = true;
    const slowTimer = window.setTimeout(() => setImportSlow(true), 8000);
    try {
      const environment = os === 'Other' ? customEnvironment.trim() : os;
      const report = await reportApi.import({ question, geo: geo.startsWith('custom:') ? geo.slice(7).trim() : geo.trim(), os: environment, research_period: researchPeriod.trim() || null, content: reportContent, ...(structuredJson.trim() ? { structured_json: structuredJson } : {}) });
      window.history.pushState({}, '', `/reports/${report.id}?imported=1${report.duplicate ? '&duplicate=1' : ''}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được báo cáo. Vui lòng thử lại.'); }
    finally { window.clearTimeout(slowTimer); importInFlight.current = false; setImportLoading(false); setImportSlow(false); }
  }

  const previewHeadings = extractHeadings(reportContent);
  const validation = [
    { label: 'Research question', valid: Boolean(question.trim()), error: 'Cần có câu hỏi nghiên cứu.' },
    { label: 'GEO', valid: Boolean(geo.trim()) && geo !== 'Other / custom', error: 'Cần chọn hoặc nhập GEO.' },
    { label: 'Environment', valid: os !== 'Other' || Boolean(customEnvironment.trim()), error: 'Cần chọn hoặc nhập Environment.' },
    { label: 'Report content', valid: Boolean(reportContent.trim()), error: 'Bạn chưa dán nội dung báo cáo hoặc chọn file .md/.txt.' },
  ];
  const validationMessage = validation.every((item) => item.valid) ? 'Thông tin hợp lệ để xem trước và nhập.' : validation.filter((item) => !item.valid).map((item) => item.error).join(' ');
  const structuredJsonStatus = !structuredJson.trim() ? 'Chưa cung cấp' : structuredJsonError ? 'Không hợp lệ' : 'Hợp lệ';

  return <div className="intake-workspace">
    <section className="research-panel intake-form" aria-labelledby="intake-title">
      <div className="panel-heading"><div><span className="field-label">CHATGPT PLUS + LOCAL WORKSPACE</span><h2 id="intake-title">Bắt đầu với câu hỏi sản phẩm</h2></div></div>
      <label className="intake-field"><span className="field-label">Bạn muốn nghiên cứu gì?</span><textarea rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ví dụ: Các app học tiếng Anh cho trẻ em tại Mỹ đang tạo động lực học tập như thế nào?" /></label>
      <div className="intake-scope-grid">
        <GeoCombobox value={geo} onChange={setGeo} />
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
        <details className="structured-import"><summary>Structured JSON (tùy chọn)</summary><p>JSON chỉ bổ sung dữ liệu có cấu trúc, không thay thế báo cáo gốc.</p><label className="intake-field"><span className="field-label">Universal research data JSON</span><textarea rows={10} value={structuredJson} onChange={(event) => setStructuredJson(event.target.value)} placeholder="Dán object JSON theo định dạng trong prompt đã tạo" /></label>{structuredJsonError && <div className="research-alert" role="alert">{structuredJsonError}</div>}</details>
        <div className="report-preview" aria-live="polite"><strong>Xem trước và kiểm tra</strong><ul className="import-validation">{validation.map((item) => <li key={item.label} data-valid={item.valid}>{item.valid ? '✓' : '•'} {item.label}: {item.valid ? 'Đã có' : item.error}</li>)}</ul><p>{reportContent.trim() ? validationMessage : 'Chưa có nội dung báo cáo để import.'}</p><span>{reportContent.length.toLocaleString()} ký tự · {previewHeadings.length} heading · {Array.from(reportContent.matchAll(/https?:\/\/[^\s)<>]+/g)).length} URL nhận diện · Structured JSON: {structuredJsonStatus}</span>{reportContent && <pre>{reportContent.slice(0, 700)}{reportContent.length > 700 ? '…' : ''}</pre>}</div>
        <div className="intake-actions"><button className="primary-action" type="button" onClick={importReport} disabled={importLoading}>{importLoading ? 'Đang lưu báo cáo...' : 'Lưu báo cáo vào workspace'}</button><button className="text-button" type="button" onClick={() => setShowImport(false)}>Hủy</button></div>
        {importLoading && <div className="research-success" role="status">Đang lưu báo cáo...{importSlow && <span> Request đang lâu hơn bình thường.</span>}</div>}
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
