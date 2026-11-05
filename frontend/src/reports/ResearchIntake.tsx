import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { reportApi, type ReportSummary } from './api';
import { extractHeadings } from './MarkdownReport';
import { buildRepairPrompt, buildResearchPrompt } from './researchPrompt';
import { researchApi, type ResearchProject } from '../research/api';
import { ProjectJourneyNav } from '../research/ProjectJourneyNav';
import { CodexResearchSettings, useCodexResearchSettings } from '../research/CodexResearchSettings';
import { ResultsIcon } from '../ui/ResultsIcon';
import './ReportLibrary.css';
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
  const importOnly = intakeParams.get('action') === 'import' && !intakeParams.get('fromReportId');
  const csvResearchImport = importOnly && intakeParams.get('source') === 'csv';
  const researchAgainReportId = intakeParams.get('action') === 'research-again' ? intakeParams.get('fromReportId') : null;
  const researchAgainMode = Boolean(researchAgainReportId);
  const initialGeos = intakeParams.get('geo')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const initialEnvironments = intakeParams.get('environment')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const [question, setQuestion] = useState(() => intakeParams.get('question') ?? '');
  const [geos, setGeos] = useState<string[]>(() => initialGeos.length ? initialGeos : ['Global / not specified']);
  const [environments, setEnvironments] = useState<string[]>(() => initialEnvironments.length ? initialEnvironments : ['Unknown']);
  const [researchFocus, setResearchFocus] = useState('');
  const [researchPeriod, setResearchPeriod] = useState(() => intakeParams.get('period') ?? '');
  const [showImport, setShowImport] = useState(importOnly);
  const [reportContent, setReportContent] = useState('');
  const [history, setHistory] = useState<ReportSummary[]>([]);
  const [previousReport, setPreviousReport] = useState<ReportSummary | null>(null);
  const [previousReportError, setPreviousReportError] = useState('');
  const [previousReportLoading, setPreviousReportLoading] = useState(researchAgainMode);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSlow, setImportSlow] = useState(false);
  const [error, setError] = useState('');
  const [repairPrompt, setRepairPrompt] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [showPromptFallback, setShowPromptFallback] = useState(false);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [reportOrigin, setReportOrigin] = useState<'chatgpt_user_import' | 'codex_cli_research'>('chatgpt_user_import');
  const [assistantChoice, setAssistantChoice] = useState<'chatgpt' | 'claude' | 'other'>('chatgpt');
  const [codexRunning, setCodexRunning] = useState(false);
  const codexSettings = useCodexResearchSettings(!importOnly);
  const canRunCodexResearch = codexSettings.preferences.enabled && codexSettings.catalog.available && Boolean(codexSettings.preferences.model_slug) && !codexSettings.loadingModels;
  const [fileName, setFileName] = useState('');
  const importInFlight = useRef(false);
  const codexInFlight = useRef(false);
  const contentInspection = useMemo(() => inspectResearchContent(reportContent), [reportContent]);
  const promptGeo = geos.map((value) => value.startsWith('custom:') ? value.slice(7) : value).join(', ');
  const promptEnvironment = environments.map((value) => value.startsWith('custom:') ? value.slice(7) : value).join(', ');
  const prompt = useMemo(() => buildResearchPrompt({ question, geo: promptGeo, os: promptEnvironment, researchPeriod, focus: researchFocus }), [question, promptGeo, promptEnvironment, researchPeriod, researchFocus]);
  const promptDraft = promptOverride ?? prompt;

  useEffect(() => {
    if (researchAgainMode) return;
    reportApi.list().then((page) => { setHistory(page.items); setNextCursor(page.next_cursor); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Không tải được lịch sử báo cáo.'))
      .finally(() => setHistoryLoading(false));
  }, [researchAgainMode]);

  useEffect(() => {
    if (!researchAgainReportId) return;
    let active = true;
    setPreviousReportLoading(true);
    reportApi.get(researchAgainReportId).then((report) => {
      if (active) setPreviousReport(report);
    }).catch((reason: unknown) => {
      if (active) setPreviousReportError(reason instanceof Error ? reason.message : 'Không tải được báo cáo kỳ cũ.');
    }).finally(() => { if (active) setPreviousReportLoading(false); });
    return () => { active = false; };
  }, [researchAgainReportId]);

  async function copyPrompt() {
    if (!question.trim()) { setError('Hãy nhập câu hỏi nghiên cứu trước khi tạo prompt.'); return; }
    try {
      await navigator.clipboard.writeText(promptDraft);
      setError(''); setCopied(true); setPromptCopied(true); setShowPromptFallback(false);
      setShowImport(true);
      setSuccess(researchAgainMode
        ? 'Đã sao chép lời nhắc. Mở ChatGPT, gửi một lần, rồi quay lại ô “Dán báo cáo kỳ mới” ngay bên dưới và lưu.'
        : 'Đã sao chép yêu cầu. Gửi prompt một lần trong ChatGPT, rồi dán toàn bộ câu trả lời cuối cùng vào ô bên dưới.');
      window.requestAnimationFrame(() => {
        const importCard = document.querySelector('.report-import-card');
        if (typeof importCard?.scrollIntoView === 'function') importCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch {
      setCopied(false); setShowPromptFallback(true); setError('Không thể sao chép tự động. Hãy chọn và sao chép prompt bên dưới.');
    }
  }

  async function runCodexResearch() {
    setError(''); setSuccess('');
    if (codexInFlight.current) return;
    if (!question.trim()) { setError('Hãy nhập câu hỏi nghiên cứu trước khi chạy.'); return; }
    if (codexSettings.loadingModels) { setError('PO Hub đang kiểm tra danh sách model Codex. Hãy gửi lại sau vài giây.'); return; }
    if (!codexSettings.catalog.available || !codexSettings.preferences.model_slug) { setError('Chọn một model Codex đang khả dụng trước khi chạy.'); return; }
    codexInFlight.current = true;
    setCodexRunning(true);
    setImportSlow(false);
    const slowTimer = window.setTimeout(() => setImportSlow(true), 20_000);
    try {
      const result = await reportApi.runCodexResearch({ model_slug: codexSettings.preferences.model_slug, prompt: promptDraft });
      setReportContent(result.content);
      setReportOrigin('codex_cli_research');
      setFileName('');
      setShowImport(true);
      setSuccess(`Codex đã hoàn tất bằng ${result.model_slug}. Xem kết quả bên dưới rồi bấm lưu báo cáo.`);
      window.requestAnimationFrame(() => {
        const importCard = document.querySelector('.report-import-card');
        if (typeof importCard?.scrollIntoView === 'function') importCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không chạy được Codex. Câu hỏi vẫn được giữ.');
    } finally { window.clearTimeout(slowTimer); codexInFlight.current = false; setCodexRunning(false); setImportSlow(false); }
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
    if (researchAgainMode) {
      if (!researchAgainReportId || previousReportLoading) { setError('Đang kiểm tra báo cáo kỳ cũ. Hãy chờ tải xong rồi lưu.'); return; }
      if (previousReportError || !previousReport || previousReport.id !== researchAgainReportId || previousReport.project_id !== workspaceProjectId) { setError('Không xác nhận được báo cáo kỳ cũ trong dự án này. Hãy mở báo cáo cũ rồi thử lại.'); return; }
      if (!researchPeriod.trim()) { setError('Nhập kỳ nghiên cứu mới để PO Hub biết báo cáo này thuộc lần cập nhật nào.'); return; }
      if (previousReport.research_period?.trim().toLocaleLowerCase() === researchPeriod.trim().toLocaleLowerCase()) { setError('Kỳ mới đang trùng với kỳ cũ. Hãy nhập kỳ cập nhật khác để tránh so sánh nhầm.'); return; }
    }
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
      const previousReportId = researchAgainReportId ?? intakeParams.get('fromReportId');
      const report = await reportApi.import({ question, geo, os: environment, research_period: researchPeriod.trim() || null, content: reportContent, project_id: workspaceProjectId, previous_report_id: previousReportId, ...(reportOrigin === 'codex_cli_research' ? { origin: reportOrigin } : { source_assistant: assistantChoice }) });
      const compareWith = previousReportId && report.id !== previousReportId ? previousReportId : '';
      const destination = compareWith && report.project_id
        ? `/report-updates?projectId=${encodeURIComponent(report.project_id)}&before=${encodeURIComponent(compareWith)}&after=${encodeURIComponent(report.id)}&newReportSaved=1${report.duplicate ? '&duplicate=1' : ''}`
        : `/reports/${report.id}?imported=1${report.duplicate ? '&duplicate=1' : ''}`;
      window.history.pushState({}, '', destination);
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

  const reportImportPanel = <section className={`report-import-card${researchAgainMode ? ' report-import-card--research-again' : ''}`} aria-label={researchAgainMode ? 'Lưu báo cáo kỳ mới' : 'Bước cuối · lưu báo cáo'}>
    <div className="panel-heading"><div><span className="field-label">{researchAgainMode ? 'BÁO CÁO KỲ MỚI' : 'BƯỚC CUỐI · LƯU BÁO CÁO'}</span><h2>{reportOrigin === 'codex_cli_research' ? 'Kết quả nghiên cứu' : researchAgainMode ? 'Dán báo cáo kỳ mới' : 'Lưu báo cáo'}</h2><p>{researchAgainMode ? reportOrigin === 'codex_cli_research' ? 'Kết quả Codex đã được điền bên dưới. Xem lại rồi lưu thành báo cáo kỳ mới; báo cáo cũ được giữ nguyên.' : 'Dán toàn bộ câu trả lời của ChatGPT một lần vào đây. PO Hub sẽ lưu thành báo cáo mới và giữ nguyên báo cáo kỳ cũ.' : ''}</p></div><span className="unverified-chip">Chưa xác minh độc lập</span></div>
    {error && !researchAgainMode && <div className="research-alert" role="alert">{error}</div>}
    {!researchAgainMode && <label className="intake-field"><span className="field-label">Tên báo cáo / câu hỏi nghiên cứu</span><input aria-label="Câu hỏi hoặc tên báo cáo" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ví dụ: Bối cảnh sản phẩm và thị trường cần nghiên cứu" /><span className="field-help">Dùng để nhận biết báo cáo và giữ nguyên câu hỏi ban đầu.</span></label>}
    {!researchAgainMode && <details className="research-import-details"><summary>Phạm vi lưu cùng báo cáo</summary>
      <div className="intake-scope-grid">
        <MultiChoiceDropdown label="Thị trường (GEO)" values={geos} options={[...GEO_OPTIONS, { label: 'Khác / tự nhập', value: 'Other / custom' }]} onChange={setGeos} exclusiveValues={['Global / not specified', 'Worldwide']} customFieldLabel="Thị trường tùy chỉnh" customPlaceholder="Nhập thị trường" />
        <MultiChoiceDropdown label="Môi trường" values={environments} options={ENVIRONMENT_OPTIONS} onChange={setEnvironments} exclusiveValues={['Unknown', 'Not applicable']} customFieldLabel="Tên môi trường" customPlaceholder="Nhập môi trường nghiên cứu" />
        <label className="intake-field"><span className="field-label">Kỳ nghiên cứu</span><input value={researchPeriod} onChange={(event) => setResearchPeriod(event.target.value)} maxLength={200} placeholder="Ví dụ: 2025–2026" /></label>
      </div>
    </details>}
    {reportOrigin !== 'codex_cli_research' && <label className="intake-field"><span className="field-label">Trợ lý đã viết câu trả lời này</span><select aria-label="Trợ lý đã viết câu trả lời" value={assistantChoice} onChange={(event) => setAssistantChoice(event.target.value as 'chatgpt' | 'claude' | 'other')}><option value="chatgpt">ChatGPT</option><option value="claude">Claude</option><option value="other">Trợ lý khác</option></select></label>}
    <label className="intake-field"><span className="field-label">{reportOrigin === 'codex_cli_research' ? 'Kết quả Codex đã tạo' : researchAgainMode ? 'Dán toàn bộ báo cáo kỳ mới từ ChatGPT' : 'Dán toàn bộ câu trả lời cuối cùng'}</span><textarea aria-label={reportOrigin === 'codex_cli_research' ? 'Kết quả Codex đã tạo' : researchAgainMode ? 'Dán báo cáo kỳ mới từ ChatGPT' : 'Dán kết quả nghiên cứu từ ChatGPT'} rows={researchAgainMode ? 8 : 11} value={reportContent} onChange={(event) => { setReportContent(event.target.value); setFileName(''); setError(''); setRepairPrompt(''); }} placeholder="# Tóm tắt nghiên cứu\n\nDán toàn bộ câu trả lời cuối cùng tại đây…" /></label>
    <div className="file-picker"><label className="secondary-action" htmlFor="report-file">Chọn file .md, .txt hoặc .json</label><input id="report-file" type="file" accept=".md,.txt,.json,text/markdown,text/plain,application/json" onChange={readFile} /><span>{fileName || 'Tối đa 2 MB'}</span></div>
    {contentInspection.jsonError && <div className="research-alert" role="alert">{contentInspection.jsonError}<button className="text-button" type="button" onClick={() => setRepairPrompt(buildRepairPrompt(reportContent, contentInspection.jsonError || 'Malformed JSON.'))}>Tạo prompt sửa JSON</button></div>}
    {repairPrompt && <div className="research-panel"><div className="intake-actions"><strong>Yêu cầu sửa dữ liệu có cấu trúc</strong><button className="secondary-action" type="button" onClick={() => { const clipboard = navigator.clipboard; if (!clipboard) { setError('Clipboard không khả dụng. Hãy chọn và copy nội dung bên dưới.'); return; } void clipboard.writeText(repairPrompt).then(() => setSuccess('Prompt sửa đã được sao chép.')).catch(() => setError('Không sao chép được prompt. Hãy chọn và copy nội dung bên dưới.')); }}>Sao chép yêu cầu sửa</button></div><textarea aria-label="Yêu cầu sửa dữ liệu có cấu trúc" rows={10} readOnly value={repairPrompt} onFocus={(event) => event.currentTarget.select()} /></div>}
    <div className="report-preview" aria-live="polite"><strong>Kiểm tra trước khi lưu</strong><ul className="import-validation">{validation.map((item) => <li key={item.label} data-valid={item.valid}>{item.valid ? '✓' : '•'} {item.label}: {item.valid ? 'Đã có' : item.error}</li>)}</ul><p>{reportContent.trim() ? validationMessage : 'Chưa có kết quả nghiên cứu để lưu.'}</p><span>{reportContent.length.toLocaleString()} ký tự · {previewHeadings.length} tiêu đề · {Array.from(reportContent.matchAll(/https?:\/\/[^\s)<>]+/g)).length} URL · Định dạng: {contentInspection.format}</span>{reportContent && <details><summary>Xem trước nội dung</summary><pre>{reportContent.slice(0, 700)}{reportContent.length > 700 ? '…' : ''}</pre></details>}</div>
    <div className="intake-actions"><button className="primary-action" type="button" onClick={importReport} disabled={importLoading || (researchAgainMode && previousReportLoading)}>{importLoading ? 'Đang lưu báo cáo...' : researchAgainMode ? 'Lưu báo cáo kỳ mới' : 'Lưu báo cáo vào dự án'}</button>{importOnly ? <a className="text-button" href={csvResearchImport && workspaceProjectId ? `/research?projectId=${encodeURIComponent(workspaceProjectId)}&view=data` : workspaceProjectId ? `/reports?projectId=${encodeURIComponent(workspaceProjectId)}` : '/reports'}>Quay lại</a> : researchAgainMode ? <a className="text-button" href={researchAgainReportId ? `/reports/${encodeURIComponent(researchAgainReportId)}` : `/research?projectId=${encodeURIComponent(workspaceProjectId ?? '')}`}>← Về báo cáo kỳ cũ</a> : <button className="text-button" type="button" onClick={() => setShowImport(false)}>← Quay lại câu hỏi</button>}</div>
    {importLoading && <div className="research-success" role="status">Đang lưu báo cáo...{importSlow && <span> Yêu cầu đang mất nhiều thời gian hơn bình thường.</span>}</div>}
  </section>;

  return <div className="intake-workspace">{workspaceProjectId && <ProjectJourneyNav projectId={workspaceProjectId} active="report" />}
    <section className={`research-panel intake-form${researchAgainMode ? ' intake-form--research-again' : ''}`} aria-labelledby="intake-title">
      {!researchAgainMode && <ol className="report-intake-stepper" aria-label="Các bước đưa nghiên cứu vào PO Hub">
        <li className={!showImport ? 'is-current' : 'is-complete'} aria-current={!showImport ? 'step' : undefined}><span>1</span><strong>Câu hỏi</strong></li>
        <li className={showImport ? 'is-current' : ''} aria-current={showImport ? 'step' : undefined}><span>2</span><strong>Kết quả nghiên cứu</strong></li>
        <li><span>3</span><strong>Đọc báo cáo</strong></li>
      </ol>}
      {researchAgainMode ? <>
        <div className="research-again-heading"><div><span className="field-label">NGHIÊN CỨU LẠI CÙNG CÂU HỎI</span><h2 id="intake-title">Cập nhật nghiên cứu cho kỳ mới</h2><p>Giữ câu hỏi cũ, chọn kỳ mới, rồi đưa một câu trả lời nghiên cứu vào đây. Báo cáo cũ được giữ nguyên.</p></div><a className="text-button" href={researchAgainReportId ? `/reports/${encodeURIComponent(researchAgainReportId)}` : '/reports'}>← Về báo cáo kỳ cũ</a></div>
        {error && <div className="research-alert" role="alert">{error}</div>}
        {previousReportLoading && <p className="report-history-state" role="status">Đang kiểm tra báo cáo kỳ cũ…</p>}
        {previousReportError && <div className="research-alert" role="alert">Không mở được báo cáo kỳ cũ: {previousReportError}</div>}
        {previousReport && <div className="research-again-source" aria-label="Báo cáo dùng làm mốc cũ"><div><span>KỲ CŨ</span><strong>{previousReport.research_period || 'Chưa ghi kỳ'}</strong></div><p>{localizedGeo(previousReport.geo)} · {localizedEnvironment(previousReport.os)} · {recentTitle(previousReport)}</p><a href={`/reports/${encodeURIComponent(previousReport.id)}`}>Mở báo cáo kỳ cũ →</a></div>}
        <label className="intake-field"><span className="field-label">Câu hỏi nghiên cứu</span><textarea aria-label="Bạn muốn nghiên cứu gì?" rows={2} value={question} onChange={(event) => { setQuestion(event.target.value); setPromptOverride(null); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && codexSettings.preferences.enabled) { event.preventDefault(); if (canRunCodexResearch) void runCodexResearch(); else setError(codexSettings.catalog.available ? 'Chưa chọn model Codex. Hãy chọn model hoặc dùng nút ChatGPT bên dưới.' : 'Codex chưa sẵn sàng. Hãy dùng nút ChatGPT bên dưới.'); } }} placeholder="Giữ câu hỏi của kỳ cũ hoặc chỉnh nội dung cần cập nhật" /><span className="field-help">Giữ nguyên câu hỏi nếu anh muốn đối chiếu đúng chủ đề của báo cáo kỳ trước.</span></label>
        <div className="research-again-inputs">
          <label className="intake-field"><span className="field-label">Kỳ / mốc nghiên cứu mới</span><input aria-label="Kỳ nghiên cứu mới" required value={researchPeriod} onChange={(event) => { setResearchPeriod(event.target.value); setPromptOverride(null); }} maxLength={200} placeholder="Ví dụ: Tuần 45/2026 hoặc H2 2026" /><span className="field-help">Kỳ mới phải khác kỳ cũ để tránh tạo cặp so sánh nhầm.</span></label>
          <label className="intake-field"><span className="field-label">Điều muốn cập nhật thêm (không bắt buộc)</span><input aria-label="Trọng tâm cập nhật" value={researchFocus} onChange={(event) => { setResearchFocus(event.target.value); setPromptOverride(null); }} maxLength={200} placeholder="Ví dụ: game mới, doanh thu hoặc thay đổi về đối thủ" /></label>
        </div>
        <details className="research-import-details research-again-scope"><summary>Phạm vi nghiên cứu · giữ nguyên như kỳ cũ</summary><div className="intake-scope-grid">
          <MultiChoiceDropdown label="Thị trường (GEO)" values={geos} options={[...GEO_OPTIONS, { label: 'Khác / tự nhập', value: 'Other / custom' }]} onChange={(value) => { setGeos(value); setPromptOverride(null); }} exclusiveValues={['Global / not specified', 'Worldwide']} customFieldLabel="Thị trường tùy chỉnh" customPlaceholder="Nhập thị trường" />
          <MultiChoiceDropdown label="Môi trường" values={environments} options={ENVIRONMENT_OPTIONS} onChange={(value) => { setEnvironments(value); setPromptOverride(null); }} exclusiveValues={['Unknown', 'Not applicable']} customFieldLabel="Tên môi trường" customPlaceholder="Nhập môi trường nghiên cứu" />
        </div></details>
        <section className="research-again-prompt" aria-label="Yêu cầu nghiên cứu mới">
          <div className="panel-heading"><div><span className="field-label">YÊU CẦU NGHIÊN CỨU</span><p>Prompt này đã kèm câu hỏi, kỳ mới và phạm vi đang chọn.</p></div></div>
          <textarea aria-label="Yêu cầu gửi ChatGPT" rows={5} value={promptDraft} onChange={(event) => setPromptOverride(event.target.value)} />
          <div className="intake-actions"><button className="primary-action" type="button" onClick={copyPrompt}>Sao chép lời nhắc</button>{<button className="secondary-action" type="button" onClick={() => void runCodexResearch()} disabled={codexRunning || !canRunCodexResearch}>{codexRunning ? 'Codex đang nghiên cứu…' : 'Chạy bằng Codex'}</button>}</div>
          {copied && <div className="report-intake-guidance" role="status"><strong>Tiếp theo chỉ còn một lượt</strong><span>Mở ChatGPT, dán và gửi lời nhắc một lần. Quay lại PO Hub, dán câu trả lời vào ô bên dưới rồi lưu báo cáo kỳ mới.</span></div>}
          {codexRunning && <div className="research-success" role="status">Codex đang xử lý yêu cầu… Giới hạn chờ là 4 phút; câu hỏi vẫn được giữ nếu có lỗi.{importSlow && <span> Yêu cầu đang chờ phản hồi lâu hơn bình thường. Hệ thống không tự gửi lại; hãy đợi yêu cầu kết thúc.</span>}</div>}
          <details className="research-again-automation"><summary>Model Codex: {codexSettings.loadingModels ? 'Đang kiểm tra…' : codexSettings.catalog.models.find(model => model.slug === codexSettings.preferences.model_slug)?.display_name || 'Chưa chọn'} · {codexSettings.preferences.enabled ? codexSettings.catalog.available ? codexSettings.preferences.model_slug ? 'Sẵn sàng' : 'Cần chọn model' : 'CLI chưa sẵn sàng' : 'Đang tắt'} · Đổi model</summary><CodexResearchSettings {...codexSettings} /></details>
          {showPromptFallback && <p className="prompt-fallback" role="status">Không sao chép được tự động. Chọn toàn bộ lời nhắc trong ô phía trên rồi sao chép thủ công.</p>}
        </section>
        {reportImportPanel}
      </> : showImport ? <>
        <div className="panel-heading"><div><span className="field-label">{reportOrigin === 'codex_cli_research' ? 'KẾT QUẢ TỪ CODEX' : 'BƯỚC 2 · ĐƯA KẾT QUẢ VÀO DỰ ÁN'}</span><h2 id="intake-title">{reportOrigin === 'codex_cli_research' ? 'Xem kết quả trước khi lưu' : 'Dán câu trả lời nghiên cứu'}</h2><p>{reportOrigin === 'codex_cli_research' ? 'Kết quả do Codex tạo. Kiểm tra nội dung rồi lưu vào dự án.' : promptCopied ? 'Yêu cầu đã được sao chép. Gửi yêu cầu đó một lần trong ChatGPT; quay lại đây và dán toàn bộ câu trả lời cuối cùng bên dưới.' : csvResearchImport ? 'Câu hỏi đã được tạo từ dữ liệu CSV. Gửi câu hỏi đó một lần trong ChatGPT, rồi dán toàn bộ câu trả lời cuối cùng vào đây.' : 'Dán báo cáo nghiên cứu bạn đã có. Không cần dán lại nội dung này vào ô câu hỏi hoặc chạy ChatGPT lần nữa.'}</p></div></div>
        {promptCopied && <div className="report-intake-guidance" role="status"><strong>Chỉ cần một lượt ChatGPT</strong><span>1. Gửi prompt đã sao chép → 2. Copy toàn bộ câu trả lời cuối → 3. Dán vào ô này và lưu.</span></div>}
        {reportImportPanel}
      </> : <>
        <div className="panel-heading"><div><span className="field-label">NGHIÊN CỨU SẢN PHẨM</span><h2 id="intake-title">Bắt đầu với câu hỏi sản phẩm</h2></div></div>
        <label className="intake-field"><span className="field-label">Bạn muốn nghiên cứu gì?</span><textarea aria-label="Bạn muốn nghiên cứu gì?" rows={4} value={question} onChange={(event) => { setQuestion(event.target.value); setPromptOverride(null); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && codexSettings.preferences.enabled) { event.preventDefault(); if (canRunCodexResearch) void runCodexResearch(); else setError(codexSettings.catalog.available ? 'Chưa chọn model Codex. Hãy chọn model hoặc dùng nút ChatGPT bên dưới.' : 'Codex chưa sẵn sàng. Hãy dùng nút ChatGPT bên dưới.'); } }} placeholder="Ví dụ: Các app học tiếng Anh cho trẻ em tại Mỹ đang tạo động lực học tập như thế nào?" /><span className="field-help">{canRunCodexResearch ? 'Nhấn Enter để chạy bằng Codex · Shift+Enter để xuống dòng.' : codexSettings.preferences.enabled ? 'Chọn model để dùng Codex; nếu chưa chọn, có thể sao chép yêu cầu sang ChatGPT bên dưới.' : 'Bấm sao chép yêu cầu, gửi một lần trong ChatGPT rồi dán câu trả lời bên dưới.'}</span></label>
        <div className="intake-scope-grid">
          <MultiChoiceDropdown label="Thị trường (GEO)" values={geos} options={[...GEO_OPTIONS, { label: 'Khác / tự nhập', value: 'Other / custom' }]} onChange={(value) => { setGeos(value); setPromptOverride(null); }} exclusiveValues={['Global / not specified', 'Worldwide']} customFieldLabel="Thị trường tùy chỉnh" customPlaceholder="Nhập thị trường" />
          <MultiChoiceDropdown label="Môi trường" values={environments} options={ENVIRONMENT_OPTIONS} onChange={(value) => { setEnvironments(value); setPromptOverride(null); }} exclusiveValues={['Unknown', 'Not applicable']} customFieldLabel="Tên môi trường" customPlaceholder="Nhập môi trường nghiên cứu" />
          <label className="intake-field"><span className="field-label">Trọng tâm nghiên cứu (không bắt buộc)</span><input value={researchFocus} onChange={(event) => { setResearchFocus(event.target.value); setPromptOverride(null); }} maxLength={200} placeholder="Nhập lĩnh vực hoặc trọng tâm theo cách của bạn" /></label>
          <label className="intake-field"><span className="field-label">Kỳ nghiên cứu</span><input value={researchPeriod} onChange={(event) => { setResearchPeriod(event.target.value); setPromptOverride(null); }} maxLength={200} placeholder="Ví dụ: 2025–2026" /></label>
        </div>
        <CodexResearchSettings {...codexSettings} />
        <div className="intake-actions">
          {canRunCodexResearch ? <button className="primary-action" type="button" onClick={() => void runCodexResearch()} disabled={codexRunning}>{codexRunning ? 'Codex đang nghiên cứu…' : 'Chạy nghiên cứu bằng Codex'}</button> : <button className="primary-action" type="button" onClick={copyPrompt}>Sao chép yêu cầu cho ChatGPT <span aria-hidden="true">↗</span></button>}
          <button className="secondary-action" type="button" onClick={() => { setReportOrigin('chatgpt_user_import'); setShowImport(true); setError(''); setSuccess(''); }}>Tôi đã có kết quả · nhập vào PO Hub</button>
        </div>
        {codexRunning && <div className="research-success" role="status">Codex đang xử lý yêu cầu… Giới hạn chờ là 4 phút; câu hỏi vẫn được giữ nếu có lỗi.{importSlow && <span> Yêu cầu đang chờ phản hồi lâu hơn bình thường. Hệ thống không tự gửi lại; hãy đợi yêu cầu kết thúc.</span>}</div>}
        {copied && <div className="research-success" role="status">{success}</div>}
        {!copied && success && <div className="research-success" role="status">{success}</div>}
        {error && <div className="research-alert" role="alert">{error}</div>}
        <details className="prompt-editor"><summary>Xem hoặc chỉnh yêu cầu gửi ChatGPT</summary><label className="intake-field"><span className="field-label">Nội dung được sao chép khi bấm nút phía trên</span><textarea aria-label="Yêu cầu gửi ChatGPT" rows={12} value={promptDraft} onChange={(event) => setPromptOverride(event.target.value)} /></label></details>
        {showPromptFallback && <p className="prompt-fallback" role="status">Không sao chép tự động được. Hãy chọn nội dung trong ô “Yêu cầu gửi ChatGPT” ở trên rồi sao chép thủ công.</p>}
      </>}
    </section>
    {!showImport && !researchAgainMode && <section className="research-panel recent-reports" aria-labelledby="recent-reports-title">
      <div className="panel-heading"><div><span className="field-label">LỊCH SỬ NGHIÊN CỨU</span><h2 id="recent-reports-title">Báo cáo gần đây</h2></div><a className="text-button" href="/reports">Xem lịch sử</a></div>
      {historyLoading ? <p className="report-history-state" role="status">Đang tải báo cáo…</p> : history.length === 0 ? <div className="report-history-state"><strong>Chưa có báo cáo nào</strong><span>Báo cáo bạn nhập hoặc tạo bằng Codex sẽ xuất hiện ở đây.</span></div> : <div className="report-history-list">{history.map((report) => <a className="report-history-row" href={`/reports/${report.id}`} key={report.id}><span className="report-history-copy"><strong>{recentTitle(report)}</strong><small>{localizedGeo(report.geo)} · {localizedEnvironment(report.os)} · {report.research_period || 'Chưa ghi kỳ nghiên cứu'}</small></span><span className="report-date">{new Date(report.imported_at).toLocaleDateString()}</span><span aria-hidden="true">→</span></a>)}</div>}
      {nextCursor && <div className="report-load-more"><button className="secondary-action" type="button" onClick={loadMore} disabled={moreLoading}>{moreLoading ? 'Đang tải…' : 'Tải thêm'}</button></div>}
    </section>}
  </div>;
}

export function ReportHistory() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [decisionReportIds, setDecisionReportIds] = useState<Set<string>>(new Set());
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
  useEffect(() => {
    if (projectFilter === 'all' || projectFilter === 'unassigned' || reports.length === 0) {
      setDecisionReportIds(new Set());
      return;
    }
    let active = true;
    researchApi.getOpportunities(projectFilter).catch(() => null).then((workspace) => {
      if (!active) return;
      setDecisionReportIds(new Set((workspace?.candidates ?? []).filter((candidate) => candidate.decision && candidate.decision_target?.report_id).map((candidate) => candidate.decision_target!.report_id!)));
    });
    return () => { active = false; };
  }, [projectFilter, reports.length]);
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return reports.filter((report) => (projectFilter === 'all' || (projectFilter === 'unassigned' ? !report.project_id : report.project_id === projectFilter))
      && (!needle || `${report.question} ${report.geo} ${report.os} ${report.research_period ?? ''} ${projectNames.get(report.project_id ?? '') ?? ''}`.toLocaleLowerCase().includes(needle)));
  }, [reports, projectFilter, query, projectNames]);
  const scopedProject = projects.find((project) => project.id === projectFilter);
  const reportKind = (report: ReportSummary): 'structured' | 'one-finding' | 'text-only' | 'unclassified' => {
    if (report.research_status === 'TEXT_ONLY' || report.parse_status === 'NEEDS_STRUCTURING') return 'text-only';
    if (report.finding_count === 1) return 'one-finding';
    if (report.research_status === 'STRUCTURED_READY' || report.research_status === 'STRUCTURED_PARTIAL' || (report.finding_count ?? 0) > 1 || (report.entity_count ?? 0) > 0) return 'structured';
    return 'unclassified';
  };
  const kindLabels = { structured: 'Có cấu trúc', 'one-finding': 'Một phát hiện', 'text-only': 'Chỉ văn bản', unclassified: 'Chưa phân loại' } as const;
  const scopedReports = scopedProject ? reports.filter((report) => report.project_id === scopedProject.id) : [];
  const countKinds = (items: ReportSummary[]) => items.reduce((counts, report) => { counts[reportKind(report)] += 1; return counts; }, { structured: 0, 'one-finding': 0, 'text-only': 0, unclassified: 0 });
  const kindCounts = countKinds(scopedReports);
  const summaryReports = projectFilter === 'unassigned' ? reports.filter((report) => !report.project_id) : scopedProject ? scopedReports : reports;
  const summaryCounts = countKinds(summaryReports);
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
  const renderReportCards = (items: ReportSummary[]) => <div className="report-library-list">{items.map((report) => {
    const kind = reportKind(report);
    const findingCount = report.finding_count ?? 0;
    const entityCount = report.entity_count ?? 0;
    const projectContext = !scopedProject && report.project_id
      ? projectNames.get(report.project_id) ?? 'Đã gắn với dự án'
      : !report.project_id ? 'Chưa gắn dự án' : null;
    const summary = kind === 'text-only'
      ? 'Chưa cấu trúc lại'
      : kind === 'unclassified'
        ? 'Chưa có dữ liệu cấu trúc'
        : `${findingCount} phát hiện · ${entityCount} đối tượng nghiên cứu`;
    return <article className="report-library-card" key={report.id}>
      <a className="report-library-card-main" href={`/reports/${encodeURIComponent(report.id)}${projectFilter === 'unassigned' ? '?from=unassigned' : ''}`} aria-label={`Mở báo cáo ${recentTitle(report)}`}>
        <span className="report-library-card-icon" aria-hidden="true"><ResultsIcon name="reports" /></span>
        <span className="report-library-card-copy"><span className={`report-kind-badge report-kind-${kind}`}>{kindLabels[kind]}</span><strong>{recentTitle(report)}</strong><small className="report-library-scope">{localizedGeo(report.geo)} <span>·</span> {localizedEnvironment(report.os)} <span>·</span> {report.research_period || 'Chưa ghi kỳ nghiên cứu'}{projectContext && <><span>·</span> {projectContext}</>}</small><span className="report-library-summary-line">{summary}</span></span>
        <span className="report-library-card-date">{new Date(report.imported_at).toLocaleDateString('vi-VN')}</span><span className="report-library-card-open">Mở báo cáo <span aria-hidden="true">→</span></span>
      </a>
      {report.project_id && <a className="report-research-again" href={`/?projectId=${encodeURIComponent(report.project_id)}&question=${encodeURIComponent(report.question)}&geo=${encodeURIComponent(report.geo)}&environment=${encodeURIComponent(report.os)}&fromReportId=${encodeURIComponent(report.id)}&action=research-again`}>Nghiên cứu lại cùng câu hỏi →</a>}
      {projectFilter === 'unassigned' && !report.project_id && <div className="report-project-link"><span>Chưa gắn với dự án</span><div className="report-link-controls"><label className="sr-only" htmlFor={`link-report-${report.id}`}>Chọn dự án cho {recentTitle(report)}</label><select id={`link-report-${report.id}`} value={linkTargets[report.id] ?? ''} disabled={Boolean(linkingReportId)} onChange={(event) => setLinkTargets((current) => ({ ...current, [report.id]: event.target.value }))}><option value="">Chọn dự án…</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><button className="secondary-action" type="button" disabled={!linkTargets[report.id] || Boolean(linkingReportId)} onClick={() => void linkReport(report)}>{linkingReportId === report.id ? 'Đang liên kết…' : 'Gắn vào dự án'}</button></div>{linkErrors[report.id] && <span className="report-link-error" role="alert">{linkErrors[report.id]}</span>}</div>}
      {scopedProject && decisionReportIds.has(report.id) && <a className="report-library-decision" href={`/tracking?projectId=${encodeURIComponent(scopedProject.id)}`}>Có quyết định đã lưu · Mở theo dõi</a>}
    </article>;
  })}</div>;
  return <div className="report-library-page">{scopedProject && <ProjectJourneyNav projectId={scopedProject.id} active="report" />}
    {scopedProject ? <section className="research-panel report-history-page report-history-project">
      <header className="report-library-heading"><div><span className="field-label">THƯ VIỆN CỦA DỰ ÁN</span><h2>Báo cáo nghiên cứu</h2><p>Các báo cáo đã nhập cho {scopedProject.name}.</p><div className="report-library-summary" aria-label="Phân loại báo cáo">{([['Tổng số', scopedReports.length], ['Có cấu trúc', kindCounts.structured], ['Một phát hiện', kindCounts['one-finding']], ['Chỉ văn bản', kindCounts['text-only']], ['Chưa phân loại', kindCounts.unclassified]] as const).map(([label, count]) => <span className="report-library-chip" key={label}><strong>{count}</strong>{label}</span>)}</div></div></header>
      <div className="report-library-toolbar"><label className="report-library-search" htmlFor="report-search"><span className="sr-only">Tìm báo cáo</span><ResultsIcon name="search" /><input id="report-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên, thị trường hoặc kỳ nghiên cứu" /></label><label className="report-library-project-filter" htmlFor="report-project-filter"><span className="sr-only">Dự án</span><select id="report-project-filter" value={projectFilter} onChange={(event) => changeProjectFilter(event.target.value)}><option value="all">Tất cả báo cáo</option><option value="unassigned">Chưa gắn dự án</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><a className="primary-action report-library-import" href={`/?projectId=${encodeURIComponent(scopedProject.id)}&action=import`}>Nhập báo cáo</a></div>
      {error && <div className="research-alert" role="alert">{error}</div>}{linkNotice && <div className="research-success" role="status">{linkNotice}</div>}{loading && <p role="status">Đang tải báo cáo…</p>}{!loading && reports.length === 0 ? <div className="report-library-empty"><strong>Chưa có báo cáo nghiên cứu</strong><span>{scopedProject ? 'Nhập báo cáo ChatGPT để lưu kết quả vào dự án này.' : 'Báo cáo bạn nhập sẽ xuất hiện tại đây.'}</span></div> : !loading && filtered.length === 0 ? <div className="report-library-empty"><strong>Không tìm thấy báo cáo phù hợp</strong><span>Thử từ khóa khác hoặc đổi bộ lọc dự án.</span></div> : <><p className="report-library-count" role="status">{filtered.length} báo cáo</p>{renderReportCards(filtered)}</>}
      <a className="text-button" href="/research">← Quay lại Nghiên cứu</a>
    </section> : <section className="research-panel report-history-page report-history-global">
      <header className="report-library-heading"><div><span className="field-label">THƯ VIỆN BÁO CÁO</span><h2>Báo cáo nghiên cứu đã lưu</h2><p>{projectFilter === 'unassigned' ? 'Các báo cáo chưa gắn với dự án.' : 'Tìm báo cáo đã lưu và mở lại trong đúng dự án.'}</p><div className="report-library-summary" aria-label="Phân loại báo cáo">{([['Tổng số', summaryReports.length], ['Có cấu trúc', summaryCounts.structured], ['Một phát hiện', summaryCounts['one-finding']], ['Chỉ văn bản', summaryCounts['text-only']], ['Chưa phân loại', summaryCounts.unclassified]] as const).map(([label, count]) => <span className="report-library-chip" key={label}><strong>{count}</strong>{label}</span>)}</div></div></header>
      <div className="report-library-toolbar"><label className="report-library-search" htmlFor="report-search"><span className="sr-only">Tìm báo cáo</span><ResultsIcon name="search" /><input id="report-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên, thị trường, kỳ nghiên cứu hoặc dự án" /></label><label className="report-library-project-filter" htmlFor="report-project-filter"><span className="sr-only">Dự án</span><select id="report-project-filter" value={projectFilter} onChange={(event) => changeProjectFilter(event.target.value)}><option value="all">Tất cả báo cáo</option><option value="unassigned">Chưa gắn dự án</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><a className="report-library-secondary-action" href="/research">Chọn dự án để nhập</a></div>
      {error && <div className="research-alert" role="alert">{error}</div>}{linkNotice && <div className="research-success" role="status">{linkNotice}</div>}{loading && <p role="status">Đang tải báo cáo…</p>}{!loading && reports.length === 0 ? <div className="report-library-empty"><strong>Chưa có báo cáo nghiên cứu</strong><span>Báo cáo bạn nhập sẽ xuất hiện tại đây.</span></div> : !loading && filtered.length === 0 ? <div className="report-library-empty"><strong>Không tìm thấy báo cáo phù hợp</strong><span>Thử từ khóa khác hoặc đổi bộ lọc dự án.</span></div> : <><p className="report-library-count" role="status">{filtered.length} báo cáo</p>{renderReportCards(filtered)}</>}
      <a className="text-button" href="/research">← Quay lại Nghiên cứu</a>
    </section>}
  </div>;
}

export { ReportViewer } from './ReportResults';
