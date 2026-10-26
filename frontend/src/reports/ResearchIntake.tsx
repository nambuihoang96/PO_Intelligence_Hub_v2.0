import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { reportApi, type ReportSummary } from './api';
import { extractHeadings } from './MarkdownReport';
import { buildRepairPrompt, buildResearchPrompt } from './researchPrompt';
import { researchApi, type ResearchProject } from '../research/api';
import { ProjectJourneyNav } from '../research/ProjectJourneyNav';
export { buildResearchPrompt } from './researchPrompt';

export function inspectResearchContent(content: string): { format: 'Markdown/TXT' | 'JSON' | 'Markdown + JSON'; jsonError: string | null } {
  const fenced = /```json\s*\r?\n([\s\S]*?)(?:\r?\n```|$)/i.exec(content);
  const trimmed = content.trim();
  const candidate = fenced?.[1] ?? (/^[\[{]/.test(trimmed) ? trimmed : null);
  if (candidate === null) return { format: 'Markdown/TXT', jsonError: null };
  const format = fenced ? 'Markdown + JSON' : 'JSON';
  try { JSON.parse(candidate); return { format, jsonError: null }; }
  catch (error) {
    const message = error instanceof Error ? error.message : 'JSON syntax is invalid.';
    const position = Number(/position\s+(\d+)/i.exec(message)?.[1] ?? 0);
    const beforeError = candidate.slice(0, position);
    const line = beforeError.split('\n').length;
    const column = position - beforeError.lastIndexOf('\n');
    return { format, jsonError: `JSON không hợp lệ tại dòng ${line}, cột ${column}: ${message.replace(/\s+at position\s+\d+.*$/i, '')}` };
  }
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

type ChoiceOption = { label: string; value: string };
const ENVIRONMENT_OPTIONS: ChoiceOption[] = [
  { label: 'Unknown', value: 'Unknown' }, { label: 'Not applicable', value: 'Not applicable' },
  { label: 'iOS', value: 'iOS' }, { label: 'Android', value: 'Android' }, { label: 'Web', value: 'Web' },
  { label: 'Desktop', value: 'Desktop' }, { label: 'Cross-platform', value: 'Cross-platform' },
  { label: 'Other / custom', value: 'Other / custom' },
];

function toggleChoice(values: string[], value: string, exclusiveValues: string[]): string[] {
  if (values.includes(value)) return values.filter((item) => item !== value);
  if (exclusiveValues.includes(value)) return [value];
  return [...values.filter((item) => !exclusiveValues.includes(item)), value];
}

function MultiChoiceDropdown({ label, values, options, onChange, exclusiveValues, customFieldLabel, customPlaceholder }: {
  label: string;
  values: string[];
  options: ChoiceOption[];
  onChange: (values: string[]) => void;
  exclusiveValues: string[];
  customFieldLabel: string;
  customPlaceholder: string;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isCustom = values.some((value) => value === 'Other / custom' || value.startsWith('custom:'));
  const customValue = values.find((value) => value.startsWith('custom:'))?.slice(7) ?? '';
  const selectedLabels = values.map((value) => value.startsWith('custom:') ? value.slice(7) : options.find((option) => option.value === value)?.label ?? value);
  function updateCustom(value: string) {
    const rest = values.filter((item) => item !== 'Other / custom' && !item.startsWith('custom:'));
    onChange(value.trim() ? [...rest, `custom:${value}`] : [...rest, 'Other / custom']);
  }
  function toggleOption(value: string) {
    if (value === 'Other / custom' && values.some((item) => item.startsWith('custom:'))) {
      onChange(values.filter((item) => !item.startsWith('custom:')));
      return;
    }
    onChange(toggleChoice(values, value, exclusiveValues));
  }
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('click', closeOnOutsideClick);
    return () => document.removeEventListener('click', closeOnOutsideClick);
  }, [open]);
  return <div className="intake-field multi-choice-field" ref={dropdownRef}>
    <span className="field-label">{label}</span>
    <button type="button" className="multi-choice-trigger" aria-label={label} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((current) => !current)}>
      <span>{selectedLabels.length ? selectedLabels.join(', ') : `Chọn ${label.toLocaleLowerCase()}`}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="multi-choice-menu" role="group" aria-label={`${label} options`}>
      {options.map((option) => <label key={option.value} className="multi-choice-option"><input type="checkbox" checked={values.includes(option.value) || (option.value === 'Other / custom' && values.some((value) => value.startsWith('custom:')))} onChange={() => toggleOption(option.value)} /><span>{option.label}</span></label>)}
    </div>}
    {values.length > 1 && <span className="multi-choice-hint">Đã chọn {values.length} mục</span>}
    {isCustom && <label className="intake-field"><span className="field-label">{customFieldLabel}</span><input aria-label={customFieldLabel} value={customValue} onChange={(event) => updateCustom(event.target.value)} placeholder={customPlaceholder} /></label>}
  </div>;
}

export function ResearchIntake() {
  const workspaceProjectId = new URLSearchParams(window.location.search).get('projectId');
  const [question, setQuestion] = useState('');
  const [geos, setGeos] = useState<string[]>(['Global / not specified']);
  const [environments, setEnvironments] = useState<string[]>(['Unknown']);
  const [researchFocus, setResearchFocus] = useState('');
  const [researchPeriod, setResearchPeriod] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [history, setHistory] = useState<ReportSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSlow, setImportSlow] = useState(false);
  const [error, setError] = useState('');
  const [repairPrompt, setRepairPrompt] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPromptFallback, setShowPromptFallback] = useState(false);
  const [fileName, setFileName] = useState('');
  const importInFlight = useRef(false);
  const contentInspection = useMemo(() => inspectResearchContent(reportContent), [reportContent]);
  const promptGeo = geos.map((value) => value.startsWith('custom:') ? value.slice(7) : value).join(', ');
  const promptEnvironment = environments.map((value) => value.startsWith('custom:') ? value.slice(7) : value).join(', ');
  const prompt = useMemo(() => buildResearchPrompt({ question, geo: promptGeo, os: promptEnvironment, researchPeriod, focus: researchFocus }), [question, promptGeo, promptEnvironment, researchPeriod, researchFocus]);

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
    if (!/\.(md|txt|json)$/i.test(file.name)) { setError('Chỉ hỗ trợ file .md, .txt hoặc .json.'); event.currentTarget.value = ''; return; }
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
    if (!geos.length || geos.includes('Other / custom')) { setError('Chọn GEO hoặc nhập GEO tùy chỉnh.'); return; }
    if (!environments.length || environments.includes('Other / custom')) { setError('Chọn Environment hoặc nhập Environment tùy chỉnh.'); return; }
    if (geos.join(', ').length > 100) { setError('Tổng GEO đã chọn vượt giới hạn 100 ký tự. Hãy giảm số lựa chọn.'); return; }
    if (environments.join(', ').length > 100) { setError('Tổng Environment đã chọn vượt giới hạn 100 ký tự. Hãy giảm số lựa chọn.'); return; }
    if (!reportContent.trim()) { setError('Bạn chưa dán kết quả nghiên cứu hoặc chọn file .md/.txt/.json.'); return; }
    if (reportContent.length > 2_000_000) { setError('Nội dung vượt giới hạn 2.000.000 ký tự. Hãy rút gọn báo cáo rồi thử lại.'); return; }
    if (contentInspection.jsonError) { setError(contentInspection.jsonError); return; }
    setImportLoading(true);
    setImportSlow(false);
    importInFlight.current = true;
    const slowTimer = window.setTimeout(() => setImportSlow(true), 8000);
    try {
      const geo = geos.map((value) => value.startsWith('custom:') ? value.slice(7).trim() : value.trim()).join(', ');
      const environment = environments.map((value) => value.startsWith('custom:') ? value.slice(7).trim() : value.trim()).join(', ');
      const report = await reportApi.import({ question, geo, os: environment, research_period: researchPeriod.trim() || null, content: reportContent, project_id: workspaceProjectId });
      window.history.pushState({}, '', `/reports/${report.id}?imported=1${report.duplicate ? '&duplicate=1' : ''}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Không lưu được báo cáo. Vui lòng thử lại.';
      setError(message);
      if (/422|INVALID_RESEARCH_INPUT|schema|entity keys|source URL/i.test(message)) setRepairPrompt(buildRepairPrompt(reportContent, message));
    }
    finally { window.clearTimeout(slowTimer); importInFlight.current = false; setImportLoading(false); setImportSlow(false); }
  }

  const previewHeadings = extractHeadings(reportContent);
  const validation = [
    { label: 'Research question', valid: Boolean(question.trim()), error: 'Cần có câu hỏi nghiên cứu.' },
    { label: 'GEO', valid: geos.length > 0 && !geos.includes('Other / custom') && geos.join(', ').length <= 100, error: geos.join(', ').length > 100 ? 'Tổng GEO đã chọn vượt giới hạn 100 ký tự.' : 'Cần chọn hoặc nhập GEO.' },
    { label: 'Environment', valid: environments.length > 0 && !environments.includes('Other / custom') && environments.join(', ').length <= 100, error: environments.join(', ').length > 100 ? 'Tổng Environment đã chọn vượt giới hạn 100 ký tự.' : 'Cần chọn hoặc nhập Environment.' },
    { label: 'Research result', valid: Boolean(reportContent.trim()) && reportContent.length <= 2_000_000 && !contentInspection.jsonError, error: contentInspection.jsonError || (reportContent.length > 2_000_000 ? 'Nội dung vượt 2.000.000 ký tự.' : 'Bạn chưa dán kết quả nghiên cứu hoặc chọn file .md/.txt/.json.') },
  ];
  const validationMessage = validation.every((item) => item.valid) ? 'Thông tin hợp lệ để xem trước và nhập.' : validation.filter((item) => !item.valid).map((item) => item.error).join(' ');

  return <div className="intake-workspace">{workspaceProjectId && <ProjectJourneyNav projectId={workspaceProjectId} active="report" />}
    <section className="research-panel intake-form" aria-labelledby="intake-title">
      <div className="panel-heading"><div><span className="field-label">CHATGPT PLUS + LOCAL WORKSPACE</span><h2 id="intake-title">Bắt đầu với câu hỏi sản phẩm</h2></div></div>
      <label className="intake-field"><span className="field-label">Bạn muốn nghiên cứu gì?</span><textarea rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ví dụ: Các app học tiếng Anh cho trẻ em tại Mỹ đang tạo động lực học tập như thế nào?" /></label>
      <div className="intake-scope-grid">
        <MultiChoiceDropdown label="GEO" values={geos} options={[...GEO_OPTIONS, { label: 'Other / custom', value: 'Other / custom' }]} onChange={setGeos} exclusiveValues={['Global / not specified', 'Worldwide']} customFieldLabel="GEO tùy chỉnh" customPlaceholder="Nhập GEO hoặc market" />
        <MultiChoiceDropdown label="Environment" values={environments} options={ENVIRONMENT_OPTIONS} onChange={setEnvironments} exclusiveValues={['Unknown', 'Not applicable']} customFieldLabel="Environment name" customPlaceholder="Môi trường nghiên cứu" />
        <label className="intake-field"><span className="field-label">Research focus (optional)</span><input value={researchFocus} onChange={(event) => setResearchFocus(event.target.value)} maxLength={200} placeholder="Nhập lĩnh vực hoặc trọng tâm theo cách của bạn" /></label>
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
        <div className="panel-heading"><div><span className="field-label">IMPORT RESEARCH</span><h2 id="import-title">Dán một lần, xem kết quả có cấu trúc</h2></div><span className="unverified-chip">Sẽ lưu chưa xác minh</span></div>
        <label className="intake-field"><span className="field-label">Dán kết quả nghiên cứu từ ChatGPT</span><textarea rows={16} value={reportContent} onChange={(event) => { setReportContent(event.target.value); setFileName(''); setError(''); setRepairPrompt(''); }} placeholder="# Research summary&#10;&#10;Dán nguyên kết quả Markdown, TXT hoặc JSON tại đây…" /></label>
        <div className="file-picker"><label className="secondary-action" htmlFor="report-file">Chọn file .md, .txt hoặc .json</label><input id="report-file" type="file" accept=".md,.txt,.json,text/markdown,text/plain,application/json" onChange={readFile} /><span>{fileName || 'Tối đa 2 MB'}</span></div>
        {contentInspection.jsonError && <div className="research-alert" role="alert">{contentInspection.jsonError}<button className="text-button" type="button" onClick={() => setRepairPrompt(buildRepairPrompt(reportContent, contentInspection.jsonError || 'Malformed JSON.'))}>Tạo prompt sửa JSON</button></div>}
        {repairPrompt && <div className="research-panel"><div className="intake-actions"><strong>Prompt sửa structured output</strong><button className="secondary-action" type="button" onClick={() => { const clipboard = navigator.clipboard; if (!clipboard) { setError('Clipboard không khả dụng. Hãy chọn và copy nội dung bên dưới.'); return; } void clipboard.writeText(repairPrompt).then(() => setSuccess('Prompt sửa đã được sao chép.')).catch(() => setError('Không sao chép được prompt. Hãy chọn và copy nội dung bên dưới.')); }}>Copy prompt sửa</button></div><textarea aria-label="Prompt sửa structured output" rows={10} readOnly value={repairPrompt} onFocus={(event) => event.currentTarget.select()} /></div>}
        <div className="report-preview" aria-live="polite"><strong>Xem trước và kiểm tra</strong><ul className="import-validation">{validation.map((item) => <li key={item.label} data-valid={item.valid}>{item.valid ? '✓' : '•'} {item.label}: {item.valid ? 'Đã có' : item.error}</li>)}</ul><p>{reportContent.trim() ? validationMessage : 'Chưa có kết quả nghiên cứu để lưu.'}</p><span>{reportContent.length.toLocaleString()} ký tự · {previewHeadings.length} heading · {Array.from(reportContent.matchAll(/https?:\/\/[^\s)<>]+/g)).length} URL · Định dạng: {contentInspection.format}</span>{reportContent && <pre>{reportContent.slice(0, 700)}{reportContent.length > 700 ? '…' : ''}</pre>}</div>
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
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState(new URLSearchParams(window.location.search).get('projectId') || 'all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    (async () => {
      const [allReports, allProjects] = await Promise.all([(async () => {
        const result: ReportSummary[] = []; let cursor: string | undefined;
        do { const page = await reportApi.list(cursor); result.push(...page.items); cursor = page.next_cursor ?? undefined; } while (cursor);
        return result;
      })(), (async () => {
        const result: ResearchProject[] = []; let cursor: string | undefined;
        do { const page = await researchApi.listProjects(cursor); result.push(...page.items); cursor = page.next_cursor ?? undefined; } while (cursor);
        return result;
      })()]);
      if (active) { setReports(allReports); setProjects(allProjects); }
    })().catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Không tải được thư viện báo cáo.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return reports.filter((report) => (projectFilter === 'all' || report.project_id === projectFilter)
      && (!needle || `${report.question} ${report.geo} ${report.os} ${report.research_period ?? ''} ${projectNames.get(report.project_id ?? '') ?? ''}`.toLocaleLowerCase().includes(needle)));
  }, [reports, projectFilter, query, projectNames]);
  const scopedProject = projects.find((project) => project.id === projectFilter);
  return <div className="report-library-page">{scopedProject && <ProjectJourneyNav projectId={scopedProject.id} active="report" />}
    <section className="research-panel report-history-page"><div className="panel-heading"><div><span className="field-label">REPORT LIBRARY</span><h2>Saved research reports</h2><p>Search reports and open the project workspace they inform.</p></div><a className="primary-action" href={scopedProject ? `/?projectId=${encodeURIComponent(scopedProject.id)}` : '/research'}>{scopedProject ? 'Import report' : 'Choose a project to import'}</a></div>
      <div className="report-library-filters"><label className="field-label" htmlFor="report-search">Search reports<input id="report-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Question, GEO, environment, or project" /></label><label className="field-label" htmlFor="report-project-filter">Project<select id="report-project-filter" value={projectFilter} onChange={(event) => { setProjectFilter(event.target.value); const url = new URL(window.location.href); event.target.value === 'all' ? url.searchParams.delete('projectId') : url.searchParams.set('projectId', event.target.value); window.history.replaceState({}, '', url); }}><option value="all">All projects</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label></div>
      {error && <div className="research-alert" role="alert">{error}</div>}{loading && <p role="status">Loading reports…</p>}{!loading && reports.length === 0 ? <p>No reports have been imported yet.</p> : !loading && filtered.length === 0 ? <p>No reports match these filters.</p> : <div className="report-history-list">{filtered.map((report) => <article className="report-library-row" key={report.id}><a className="report-history-row" href={`/reports/${report.id}`}><span className="report-history-copy"><strong>{recentTitle(report)}</strong><small>{report.geo} · {report.os} · {report.research_period || 'Period not specified'}</small></span><span className="report-date">{new Date(report.imported_at).toLocaleString()}</span><span aria-hidden="true">→</span></a><div className="report-project-link">{report.project_id && projectNames.has(report.project_id) ? <a href={`/research?projectId=${encodeURIComponent(report.project_id)}&view=opportunities`}>Workspace decisions · {projectNames.get(report.project_id)}</a> : <span>Not linked to a project workspace</span>}</div></article>)}</div>}
      <a className="text-button" href="/research">← Back to Research</a>
    </section>
  </div>;
}

export { ReportViewer } from './ReportResults';
