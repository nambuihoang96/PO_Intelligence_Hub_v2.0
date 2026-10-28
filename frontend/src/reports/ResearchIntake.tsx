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
  return report.question || 'Báo cáo chưa có tiêu đề';
}

type GeoOption = { label: string; value: string; code?: string };
const PRIORITY_GEOS: GeoOption[] = [
  { label: 'Toàn cầu · chưa chỉ định', value: 'Global / not specified' }, { label: 'Toàn thế giới', value: 'Worldwide' },
  { label: 'Hoa Kỳ (US)', value: 'US', code: 'US' }, { label: 'Việt Nam (VN)', value: 'VN', code: 'VN' },
  { label: 'Nhật Bản (JP)', value: 'JP', code: 'JP' }, { label: 'Hàn Quốc (KR)', value: 'KR', code: 'KR' },
  { label: 'Liên minh châu Âu (EU)', value: 'EU', code: 'EU' },
];
const GEO_COUNTRIES: GeoOption[] = [
  ['Argentina', 'AR'], ['Australia', 'AU'], ['Áo', 'AT'], ['Bangladesh', 'BD'], ['Bỉ', 'BE'], ['Brazil', 'BR'],
  ['Campuchia', 'KH'], ['Canada', 'CA'], ['Chile', 'CL'], ['Trung Quốc', 'CN'], ['Colombia', 'CO'], ['Cộng hòa Séc', 'CZ'],
  ['Đan Mạch', 'DK'], ['Ai Cập', 'EG'], ['Phần Lan', 'FI'], ['Pháp', 'FR'], ['Đức', 'DE'], ['Hy Lạp', 'GR'],
  ['Hồng Kông', 'HK'], ['Ấn Độ', 'IN'], ['Indonesia', 'ID'], ['Ireland', 'IE'], ['Israel', 'IL'], ['Italy', 'IT'],
  ['Malaysia', 'MY'], ['Mexico', 'MX'], ['Hà Lan', 'NL'], ['New Zealand', 'NZ'], ['Nigeria', 'NG'], ['Na Uy', 'NO'],
  ['Pakistan', 'PK'], ['Philippines', 'PH'], ['Ba Lan', 'PL'], ['Bồ Đào Nha', 'PT'], ['Romania', 'RO'], ['Nga', 'RU'],
  ['Ả Rập Xê Út', 'SA'], ['Singapore', 'SG'], ['Nam Phi', 'ZA'], ['Tây Ban Nha', 'ES'], ['Thụy Điển', 'SE'], ['Thụy Sĩ', 'CH'],
  ['Đài Loan', 'TW'], ['Thái Lan', 'TH'], ['Thổ Nhĩ Kỳ', 'TR'], ['Ukraine', 'UA'], ['Các Tiểu vương quốc Ả Rập Thống nhất', 'AE'],
  ['Vương quốc Anh', 'GB'], ['Hoa Kỳ', 'US'], ['Việt Nam', 'VN'],
].map(([name, code]) => ({ label: `${name} (${code})`, value: code, code }));
const GEO_OPTIONS = [...PRIORITY_GEOS, ...GEO_COUNTRIES.filter((country) => !PRIORITY_GEOS.some((priority) => priority.code === country.code))];

function localizedGeo(value: string): string {
  if (value === 'Global / not specified') return 'Toàn cầu · chưa chỉ định';
  if (value === 'Worldwide') return 'Toàn thế giới';
  return GEO_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function localizedEnvironment(value: string): string {
  const translations: Record<string, string> = {
    Unknown: 'Chưa xác định', 'Not applicable': 'Không áp dụng', Desktop: 'Máy tính', 'Cross-platform': 'Đa nền tảng',
  };
  return translations[value] ?? value;
}

type ChoiceOption = { label: string; value: string };
const ENVIRONMENT_OPTIONS: ChoiceOption[] = [
  { label: 'Chưa xác định', value: 'Unknown' }, { label: 'Không áp dụng', value: 'Not applicable' },
  { label: 'iOS', value: 'iOS' }, { label: 'Android', value: 'Android' }, { label: 'Web', value: 'Web' },
  { label: 'Máy tính', value: 'Desktop' }, { label: 'Đa nền tảng', value: 'Cross-platform' },
  { label: 'Khác / tự nhập', value: 'Other / custom' },
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
  const intakeParams = new URLSearchParams(window.location.search);
  const workspaceProjectId = intakeParams.get('projectId');
  const initialGeos = intakeParams.get('geo')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const initialEnvironments = intakeParams.get('environment')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const [question, setQuestion] = useState(() => intakeParams.get('question') ?? '');
  const [geos, setGeos] = useState<string[]>(() => initialGeos.length ? initialGeos : ['Global / not specified']);
  const [environments, setEnvironments] = useState<string[]>(() => initialEnvironments.length ? initialEnvironments : ['Unknown']);
  const [researchFocus, setResearchFocus] = useState('');
  const [researchPeriod, setResearchPeriod] = useState(() => intakeParams.get('period') ?? '');
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
    if (!environments.length || environments.includes('Other / custom')) { setError('Chọn môi trường hoặc nhập môi trường tùy chỉnh.'); return; }
    if (geos.join(', ').length > 100) { setError('Tổng GEO đã chọn vượt giới hạn 100 ký tự. Hãy giảm số lựa chọn.'); return; }
    if (environments.join(', ').length > 100) { setError('Tổng môi trường đã chọn vượt giới hạn 100 ký tự. Hãy giảm số lựa chọn.'); return; }
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
    { label: 'Câu hỏi nghiên cứu', valid: Boolean(question.trim()), error: 'Cần có câu hỏi nghiên cứu.' },
    { label: 'Thị trường', valid: geos.length > 0 && !geos.includes('Other / custom') && geos.join(', ').length <= 100, error: geos.join(', ').length > 100 ? 'Tổng thị trường đã chọn vượt giới hạn 100 ký tự.' : 'Cần chọn hoặc nhập thị trường.' },
    { label: 'Môi trường', valid: environments.length > 0 && !environments.includes('Other / custom') && environments.join(', ').length <= 100, error: environments.join(', ').length > 100 ? 'Tổng môi trường đã chọn vượt giới hạn 100 ký tự.' : 'Cần chọn hoặc nhập môi trường.' },
    { label: 'Kết quả nghiên cứu', valid: Boolean(reportContent.trim()) && reportContent.length <= 2_000_000 && !contentInspection.jsonError, error: contentInspection.jsonError || (reportContent.length > 2_000_000 ? 'Nội dung vượt 2.000.000 ký tự.' : 'Bạn chưa dán kết quả nghiên cứu hoặc chọn tệp .md/.txt/.json.') },
  ];
  const validationMessage = validation.every((item) => item.valid) ? 'Thông tin hợp lệ để xem trước và nhập.' : validation.filter((item) => !item.valid).map((item) => item.error).join(' ');

  return <div className="intake-workspace">{workspaceProjectId && <ProjectJourneyNav projectId={workspaceProjectId} active="report" />}
    <section className="research-panel intake-form" aria-labelledby="intake-title">
      <div className="panel-heading"><div><span className="field-label">CHATGPT PLUS + KHÔNG GIAN NGHIÊN CỨU</span><h2 id="intake-title">Bắt đầu với câu hỏi sản phẩm</h2></div></div>
      <label className="intake-field"><span className="field-label">Bạn muốn nghiên cứu gì?</span><textarea rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ví dụ: Các app học tiếng Anh cho trẻ em tại Mỹ đang tạo động lực học tập như thế nào?" /></label>
      <div className="intake-scope-grid">
        <MultiChoiceDropdown label="Thị trường (GEO)" values={geos} options={[...GEO_OPTIONS, { label: 'Khác / tự nhập', value: 'Other / custom' }]} onChange={setGeos} exclusiveValues={['Global / not specified', 'Worldwide']} customFieldLabel="Thị trường tùy chỉnh" customPlaceholder="Nhập thị trường" />
        <MultiChoiceDropdown label="Môi trường" values={environments} options={ENVIRONMENT_OPTIONS} onChange={setEnvironments} exclusiveValues={['Unknown', 'Not applicable']} customFieldLabel="Tên môi trường" customPlaceholder="Nhập môi trường nghiên cứu" />
        <label className="intake-field"><span className="field-label">Trọng tâm nghiên cứu (không bắt buộc)</span><input value={researchFocus} onChange={(event) => setResearchFocus(event.target.value)} maxLength={200} placeholder="Nhập lĩnh vực hoặc trọng tâm theo cách của bạn" /></label>
        <label className="intake-field"><span className="field-label">Kỳ nghiên cứu</span><input value={researchPeriod} onChange={(event) => setResearchPeriod(event.target.value)} maxLength={200} placeholder="Ví dụ: 2025–2026" /></label>
      </div>
      <div className="intake-actions">
        <button className="primary-action" type="button" onClick={copyPrompt}>Sao chép yêu cầu cho ChatGPT <span aria-hidden="true">↗</span></button>
        <button className="secondary-action" type="button" onClick={() => { setShowImport((value) => !value); setError(''); setSuccess(''); }}>Nhập báo cáo ChatGPT</button>
      </div>
      {copied && <div className="research-success" role="status">{success}</div>}
      {!copied && success && <div className="research-success" role="status">{success}</div>}
      {error && <div className="research-alert" role="alert">{error}</div>}
      {showPromptFallback && <label className="intake-field prompt-fallback"><span className="field-label">Yêu cầu gửi ChatGPT</span><textarea rows={12} readOnly value={prompt} onFocus={(event) => event.currentTarget.select()} /></label>}
      {showImport && <section className="report-import-card" aria-labelledby="import-title">
        <div className="panel-heading"><div><span className="field-label">NHẬP KẾT QUẢ NGHIÊN CỨU</span><h2 id="import-title">Dán một lần, xem kết quả có cấu trúc</h2></div><span className="unverified-chip">Sẽ lưu ở trạng thái chưa xác minh</span></div>
        <label className="intake-field"><span className="field-label">Dán kết quả nghiên cứu từ ChatGPT</span><textarea rows={16} value={reportContent} onChange={(event) => { setReportContent(event.target.value); setFileName(''); setError(''); setRepairPrompt(''); }} placeholder="# Research summary&#10;&#10;Dán nguyên kết quả Markdown, TXT hoặc JSON tại đây…" /></label>
        <div className="file-picker"><label className="secondary-action" htmlFor="report-file">Chọn file .md, .txt hoặc .json</label><input id="report-file" type="file" accept=".md,.txt,.json,text/markdown,text/plain,application/json" onChange={readFile} /><span>{fileName || 'Tối đa 2 MB'}</span></div>
        {contentInspection.jsonError && <div className="research-alert" role="alert">{contentInspection.jsonError}<button className="text-button" type="button" onClick={() => setRepairPrompt(buildRepairPrompt(reportContent, contentInspection.jsonError || 'Malformed JSON.'))}>Tạo prompt sửa JSON</button></div>}
        {repairPrompt && <div className="research-panel"><div className="intake-actions"><strong>Yêu cầu sửa dữ liệu có cấu trúc</strong><button className="secondary-action" type="button" onClick={() => { const clipboard = navigator.clipboard; if (!clipboard) { setError('Clipboard không khả dụng. Hãy chọn và copy nội dung bên dưới.'); return; } void clipboard.writeText(repairPrompt).then(() => setSuccess('Prompt sửa đã được sao chép.')).catch(() => setError('Không sao chép được prompt. Hãy chọn và copy nội dung bên dưới.')); }}>Sao chép yêu cầu sửa</button></div><textarea aria-label="Yêu cầu sửa dữ liệu có cấu trúc" rows={10} readOnly value={repairPrompt} onFocus={(event) => event.currentTarget.select()} /></div>}
        <div className="report-preview" aria-live="polite"><strong>Xem trước và kiểm tra</strong><ul className="import-validation">{validation.map((item) => <li key={item.label} data-valid={item.valid}>{item.valid ? '✓' : '•'} {item.label}: {item.valid ? 'Đã có' : item.error}</li>)}</ul><p>{reportContent.trim() ? validationMessage : 'Chưa có kết quả nghiên cứu để lưu.'}</p><span>{reportContent.length.toLocaleString()} ký tự · {previewHeadings.length} tiêu đề · {Array.from(reportContent.matchAll(/https?:\/\/[^\s)<>]+/g)).length} URL · Định dạng: {contentInspection.format}</span>{reportContent && <pre>{reportContent.slice(0, 700)}{reportContent.length > 700 ? '…' : ''}</pre>}</div>
        <div className="intake-actions"><button className="primary-action" type="button" onClick={importReport} disabled={importLoading}>{importLoading ? 'Đang lưu báo cáo...' : 'Lưu báo cáo vào dự án'}</button><button className="text-button" type="button" onClick={() => setShowImport(false)}>Hủy</button></div>
        {importLoading && <div className="research-success" role="status">Đang lưu báo cáo...{importSlow && <span> Yêu cầu đang mất nhiều thời gian hơn bình thường.</span>}</div>}
      </section>}
    </section>
    <section className="research-panel recent-reports" aria-labelledby="recent-reports-title">
      <div className="panel-heading"><div><span className="field-label">LỊCH SỬ NGHIÊN CỨU</span><h2 id="recent-reports-title">Báo cáo gần đây</h2></div><a className="text-button" href="/reports">Xem lịch sử</a></div>
      {historyLoading ? <p className="report-history-state" role="status">Đang tải báo cáo…</p> : history.length === 0 ? <div className="report-history-state"><strong>Chưa có báo cáo nào</strong><span>Báo cáo bạn nhập từ ChatGPT sẽ xuất hiện ở đây.</span></div> : <div className="report-history-list">{history.map((report) => <a className="report-history-row" href={`/reports/${report.id}`} key={report.id}><span className="report-history-copy"><strong>{recentTitle(report)}</strong><small>{localizedGeo(report.geo)} · {localizedEnvironment(report.os)} · {report.research_period || 'Chưa ghi kỳ nghiên cứu'}</small></span><span className="report-date">{new Date(report.imported_at).toLocaleDateString()}</span><span aria-hidden="true">→</span></a>)}</div>}
      {nextCursor && <div className="report-load-more"><button className="secondary-action" type="button" onClick={loadMore} disabled={moreLoading}>{moreLoading ? 'Đang tải…' : 'Tải thêm'}</button></div>}
    </section>
  </div>;
}

export function ReportHistory() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('unassigned') === '1' ? 'unassigned' : params.get('projectId') || 'all';
  });
  const [linkTargets, setLinkTargets] = useState<Record<string, string>>({});
  const [linkingReportId, setLinkingReportId] = useState<string | null>(null);
  const [linkErrors, setLinkErrors] = useState<Record<string, string>>({});
  const [linkNotice, setLinkNotice] = useState('');
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
    return reports.filter((report) => (projectFilter === 'all' || (projectFilter === 'unassigned' ? !report.project_id : report.project_id === projectFilter))
      && (!needle || `${report.question} ${report.geo} ${report.os} ${report.research_period ?? ''} ${projectNames.get(report.project_id ?? '') ?? ''}`.toLocaleLowerCase().includes(needle)));
  }, [reports, projectFilter, query, projectNames]);
  const scopedProject = projects.find((project) => project.id === projectFilter);
  function changeProjectFilter(value: string) {
    setProjectFilter(value);
    const url = new URL(window.location.href);
    url.searchParams.delete('projectId');
    url.searchParams.delete('unassigned');
    if (value === 'unassigned') url.searchParams.set('unassigned', '1');
    else if (value !== 'all') url.searchParams.set('projectId', value);
    window.history.replaceState({}, '', url);
  }
  async function linkReport(report: ReportSummary) {
    const projectId = linkTargets[report.id];
    if (!projectId || report.project_id || linkingReportId) return;
    setLinkingReportId(report.id);
    setLinkErrors((current) => ({ ...current, [report.id]: '' }));
    setLinkNotice('');
    try {
      const linked = await reportApi.linkReportToProject(projectId, report.id);
      setReports((current) => current.map((item) => item.id === linked.id ? { ...item, project_id: linked.project_id } : item));
      setLinkTargets((current) => ({ ...current, [report.id]: '' }));
      setLinkNotice(`Đã gắn “${recentTitle(report)}” vào ${projectNames.get(projectId) ?? 'dự án đã chọn'}. Báo cáo vẫn được giữ nguyên trong thư viện.`);
    } catch (reason) {
      setLinkErrors((current) => ({ ...current, [report.id]: reason instanceof Error ? reason.message : 'Không liên kết được báo cáo. Vui lòng thử lại.' }));
    } finally {
      setLinkingReportId(null);
    }
  }
  return <div className="report-library-page">{scopedProject && <ProjectJourneyNav projectId={scopedProject.id} active="report" />}
    <section className="research-panel report-history-page"><div className="panel-heading"><div><span className="field-label">THƯ VIỆN BÁO CÁO</span><h2>Báo cáo nghiên cứu đã lưu</h2><p>Tìm báo cáo và mở dự án liên quan.</p></div><a className="primary-action" href={scopedProject ? `/?projectId=${encodeURIComponent(scopedProject.id)}` : '/research'}>{scopedProject ? 'Nhập báo cáo' : 'Chọn dự án để nhập báo cáo'}</a></div>
      <div className="report-library-filters"><label className="field-label" htmlFor="report-search">Tìm báo cáo<input id="report-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Câu hỏi, thị trường, môi trường hoặc dự án" /></label><label className="field-label" htmlFor="report-project-filter">Dự án<select id="report-project-filter" value={projectFilter} onChange={(event) => changeProjectFilter(event.target.value)}><option value="all">Tất cả báo cáo</option><option value="unassigned">Chưa gắn với dự án</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label></div>
      {error && <div className="research-alert" role="alert">{error}</div>}{linkNotice && <div className="research-success" role="status">{linkNotice}</div>}{loading && <p role="status">Đang tải báo cáo…</p>}{!loading && reports.length === 0 ? <p>Chưa có báo cáo nghiên cứu nào được nhập.</p> : !loading && filtered.length === 0 ? <p>Không có báo cáo phù hợp với bộ lọc này.</p> : <><p className="report-library-count" role="status">{filtered.length} báo cáo</p><div className="report-history-list">{filtered.map((report) => <article className="report-library-row" key={report.id}><a className="report-history-row" href={`/reports/${report.id}${projectFilter === 'unassigned' ? '?from=unassigned' : ''}`}><span className="report-history-copy"><strong>{recentTitle(report)}</strong><small>{localizedGeo(report.geo)} · {localizedEnvironment(report.os)} · {report.research_period || 'Chưa ghi kỳ nghiên cứu'}</small></span><span className="report-date">{new Date(report.imported_at).toLocaleString()}</span><span aria-hidden="true">→</span></a><div className="report-project-link">{report.project_id && projectNames.has(report.project_id) ? <a href={`/research?projectId=${encodeURIComponent(report.project_id)}&view=opportunities`}>Quyết định của dự án · {projectNames.get(report.project_id)}</a> : report.project_id ? <span>Đã gắn với dự án {report.project_id}</span> : <><span>Chưa gắn với dự án</span><div className="report-link-controls"><label className="sr-only" htmlFor={`link-report-${report.id}`}>Chọn dự án cho {recentTitle(report)}</label><select id={`link-report-${report.id}`} value={linkTargets[report.id] ?? ''} disabled={Boolean(linkingReportId)} onChange={(event) => setLinkTargets((current) => ({ ...current, [report.id]: event.target.value }))}><option value="">Chọn dự án…</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><button className="secondary-action" type="button" disabled={!linkTargets[report.id] || Boolean(linkingReportId)} onClick={() => void linkReport(report)}>{linkingReportId === report.id ? 'Đang liên kết…' : 'Gắn vào dự án'}</button></div>{linkErrors[report.id] && <span className="report-link-error" role="alert">{linkErrors[report.id]}</span>}</>}</div></article>)}</div></>}
      <a className="text-button" href="/research">← Quay lại Nghiên cứu</a>
    </section>
  </div>;
}

export { ReportViewer } from './ReportResults';
