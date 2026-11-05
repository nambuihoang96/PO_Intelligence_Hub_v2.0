import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reportApi, type ComparisonDataset, type QuantitativeDataset, type ReportSummary } from '../reports/api';
import { buildResearchPrompt } from '../reports/researchPrompt';
import { QuantitativeDatasetImport } from '../reports/QuantitativeDatasetImport';
import { csvMetricLabel, csvSourcePeriodLabel, csvUnitLabel } from '../reports/csvPresentation';
import { nextCsvColumnSort } from '../reports/csvTableInteraction';
import { researchApi, type ResearchBenchmarkCollection, type ResearchProject, type ResearchSubjectSource, type ShortlistContext } from './api';
import { OpportunityReview } from './OpportunityReview';
import { ProjectJourneyNav } from './ProjectJourneyNav';
import './projectThemePrototype.css';
import { ResearchSubjectsPanel } from './ResearchSubjectsPanel';
import { TrendUpdatesPanel } from './TrendUpdatesPanel';
import { ImageEvidencePanel } from './ImageEvidencePanel';
import { SavedInformationPanel } from './SavedInformationPanel';
import { CsvAutoAnalysis, csvObservationHighlightKey, isCsvAnalysisReadyObservation, type CsvAutoHighlightMap, type Top10ResearchSelection } from './CsvAutoAnalysis';
import { CodexResearchSettings, useCodexResearchSettings } from './CodexResearchSettings';
import { readinessGapText } from './readinessGaps';
import { top5FactLines, TOP5_OUTPUT_RULES } from './top5Prompt';
import { computeTop10Rankings } from './top10Insight';

export function followHashAnchorWhenReady(hash = window.location.hash): () => void {
  if (!hash) return () => undefined;
  const anchorId = decodeURIComponent(hash.slice(1));
  let handled = false;
  let frame = 0;
  let timeout = 0;
  let observer: MutationObserver | null = null;
  const scrollWhenReady = () => {
    if (handled) return;
    const target = document.getElementById(anchorId);
    if (!target) return;
    target.scrollIntoView?.({ block: 'start' });
    handled = true;
    observer?.disconnect();
    window.clearTimeout(timeout);
  };
  observer = new MutationObserver(scrollWhenReady);
  observer.observe(document.body, { childList: true, subtree: true });
  frame = window.requestAnimationFrame(scrollWhenReady);
  timeout = window.setTimeout(() => observer?.disconnect(), 5000);
  return () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timeout);
    observer?.disconnect();
  };
}

function displayReportScope(geo: string, environment: string, period?: string | null) {
  const visibleGeo = geo === 'Global / not specified' ? 'Toàn cầu · chưa chỉ định' : geo;
  const visibleEnvironment = environment === 'Unknown' ? 'Chưa xác định môi trường' : environment;
  return `${visibleGeo} · ${visibleEnvironment} · ${period || 'Chưa có kỳ nghiên cứu'}`;
}

type AppObservation = QuantitativeDataset['observations'][number];
type AppGroup = { id: string; name: string; rows: AppObservation[] };
type RankingOption = { key: string; label: string; metricId: string; rows: Map<string, AppObservation>; ambiguous: Set<string> };
type CsvScopeFilters = { geo: string; platform: string; period: string };
const ALL_CSV_FILTER = '__all__';
const UNKNOWN_CSV_FILTER = '__unknown__';

const unhelpfulScopeValues = new Set(['unknown', 'unspecified', 'global / not specified', 'not specified', 'n/a']);

function hasKnownScope(value: string | null | undefined): value is string {
  const normalized = value?.trim().toLocaleLowerCase() ?? '';
  return Boolean(normalized) && !unhelpfulScopeValues.has(normalized);
}

function periodFilterKey(row: AppObservation): string {
  if (row.snapshot_date) return `snapshot|${row.snapshot_date}|${row.period_semantics || ''}`;
  if (row.period_start && row.period_end) return `range|${row.period_start}|${row.period_end}|${row.period_semantics || ''}|${row.granularity || ''}`;
  return UNKNOWN_CSV_FILTER;
}

function matchesCsvScope(row: AppObservation, filters: CsvScopeFilters): boolean {
  const matchesValue = (selected: string, value: string | null | undefined) => selected === ALL_CSV_FILTER
    || (selected === UNKNOWN_CSV_FILTER ? !hasKnownScope(value) : value === selected);
  return matchesValue(filters.geo, row.geo)
    && matchesValue(filters.platform, row.platform)
    && (filters.period === ALL_CSV_FILTER || periodFilterKey(row) === filters.period);
}

function csvScopeOptionLabel(value: string, missingLabel: string): string {
  if (value === UNKNOWN_CSV_FILTER || !hasKnownScope(value)) return missingLabel;
  if (value.trim().toLocaleLowerCase() === 'worldwide') return 'Toàn cầu';
  return value;
}

function csvObservationScopeLabel(row: AppObservation): string {
  return [csvScopeOptionLabel(row.geo || UNKNOWN_CSV_FILTER, 'Chưa ghi khu vực'), csvScopeOptionLabel(row.platform || UNKNOWN_CSV_FILTER, 'Chưa ghi nền tảng'), csvSourcePeriodLabel(row)].join(' · ');
}

function groupsFor(dataset: QuantitativeDataset | null): AppGroup[] {
  const groups = new Map<string, AppGroup>();
  for (const row of dataset?.observations ?? []) {
    const key = row.source_entity_id || row.entity_id || `row:${row.source_row_number ?? groups.size}`;
    const group = groups.get(key) ?? { id: key, name: row.source_entity_name || row.entity_name || key, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function rankingOptionsFor(apps: AppGroup[]): RankingOption[] {
  const groups = new Map<string, RankingOption>();
  for (const app of apps) for (const row of app.rows) {
    if (row.value === null || row.value === undefined || !Number.isFinite(Number(row.value)) || row.value_precision !== 'exact'
      || row.analysis_ready !== true || row.complete_observation !== true || row.import_status !== 'imported'
      || (row.source_validation_reasons?.length ?? 0) > 0 || (row.metadata_validation_reasons?.length ?? 0) > 0
      || !row.metric_id || !row.metric_definition || !row.unit || !hasKnownScope(row.geo) || !hasKnownScope(row.platform) || !row.methodology
      || !row.period_semantics || row.period_semantics === 'unknown'
      || !(row.source_entity_id || row.entity_id)
      || (!row.snapshot_date && (!row.period_start || !row.period_end))) continue;
    const period = row.snapshot_date || `${row.period_start || '?'}–${row.period_end || '?'}`;
    const key = [row.metric_id, row.metric_definition, row.unit, row.methodology || '', row.geo || '', row.platform || '', row.period_semantics, row.granularity || '', period].join('|');
    const label = `${csvMetricLabel(row.metric_id, row.metric_definition)} · ${csvUnitLabel(row.unit)} · ${csvScopeOptionLabel(row.geo, 'Chưa ghi khu vực')} / ${row.platform} · ${csvSourcePeriodLabel(row)}`;
    const option = groups.get(key) ?? { key, label, metricId: row.metric_id, rows: new Map<string, AppObservation>(), ambiguous: new Set<string>() };
    if (!option.ambiguous.has(app.id) && !option.rows.has(app.id)) option.rows.set(app.id, row);
    else { option.rows.delete(app.id); option.ambiguous.add(app.id); }
    groups.set(key, option);
  }
  return [...groups.values()].filter((item) => item.rows.size > 0).sort((left, right) => left.label.localeCompare(right.label));
}

function makeSelectionContext(dataset: QuantitativeDataset, selectedIds: string[], apps: AppGroup[], type: 'manual' | 'rule_based', criterion: string | null, option?: RankingOption): ShortlistContext {
  const selectedGroups = apps.filter((app) => selectedIds.includes(app.id));
  const measurement = option ? option.rows.values().next().value as AppObservation | undefined : undefined;
  const refs = selectedGroups.flatMap((app) => {
    const rows = option ? [option.rows.get(app.id)].filter((row): row is AppObservation => Boolean(row)) : app.rows.slice(0, 12);
    return rows.map((row) => ({ source_entity_id: row.source_entity_id || row.entity_id || app.id, source_row_number: row.source_row_number ?? null, metric_id: row.metric_id ?? null }));
  }).slice(0, 500);
  return {
    dataset_id: dataset.id, dataset_filename: dataset.filename, dataset_content_sha256: dataset.content_sha256,
    selection_type: type, source_entity_ids: selectedGroups.map((app) => app.id), selection_criterion: criterion,
    measurement: measurement ? {
      metric_id: measurement.metric_id, metric_definition: measurement.metric_definition, unit: measurement.unit,
      geo: measurement.geo, platform: measurement.platform, period_start: measurement.period_start,
      period_end: measurement.period_end, snapshot_date: measurement.snapshot_date ?? null,
      period_semantics: measurement.period_semantics ?? null, granularity: measurement.granularity,
      methodology: measurement.methodology ?? null,
    } : null,
    observation_refs: refs,
  };
}

function selectedResearchQuestion(project: ResearchProject): string {
  // The project topic is the research question. Projects created before topics existed keep the old sentence.
  const topic = project.topic?.trim();
  if (topic) return `Nghiên cứu chủ đề “${topic}” dựa trên các sản phẩm đã chọn trong “${project.name}”.`;
  return `Tìm hiểu bối cảnh sản phẩm và thị trường của các sản phẩm đã chọn trong “${project.name}”.`;
}

function top10ResearchQuestion(project: ResearchProject, filterLabel: string, filename: string, count: number): string {
  const topic = project.topic?.trim();
  const subject = topic ? `chủ đề “${topic}”` : `dự án “${project.name}”`;
  return `Nghiên cứu ${subject}: ${count} game đứng đầu theo ${filterLabel.toLocaleLowerCase()} trong tệp “${filename}”.`;
}

function buildPrompt(project: ResearchProject, dataset: QuantitativeDataset, context: ShortlistContext, selected: AppGroup[], filterLabel?: string, facts?: string[]): string {
  const observations = selected.flatMap((app) => app.rows.filter((row) => context.observation_refs.some((ref) =>
    ref.source_entity_id === (row.source_entity_id || row.entity_id || app.id)
      && ref.source_row_number === (row.source_row_number ?? null) && ref.metric_id === (row.metric_id ?? null))).map((row) => ({
    app: app.name, source_identity: row.source_entity_id, metric: row.metric_definition || row.metric_id,
    value: row.value, unit: row.unit, geo: row.geo, platform: row.platform,
    period: row.snapshot_date || `${row.period_start || 'unknown'} to ${row.period_end || 'unknown'}`,
    granularity: row.granularity, methodology: row.methodology,
    source_reference: row.source_reference, evidence_reference: row.evidence_reference,
    status: row.verification_status,
    // The top 10 path omits repeated validation text per row to stay inside the Codex input limit.
    ...(filterLabel ? {} : { limitations: row.validation_reasons }),
  })));
  const measurement = context.measurement;
  const period = measurement?.snapshot_date || (measurement?.period_start && measurement?.period_end ? `${measurement.period_start} đến ${measurement.period_end}` : 'Chưa xác định');
  const basePrompt = buildResearchPrompt({
    question: filterLabel ? top10ResearchQuestion(project, filterLabel, dataset.filename, selected.length) : selectedResearchQuestion(project),
    geo: measurement?.geo || 'Global / not specified',
    os: measurement?.platform || 'Unknown', researchPeriod: period,
    focus: context.selection_criterion || `Nghiên cứu thêm ${selected.length} sản phẩm PO đã chọn từ dữ liệu CSV.`,
  });
  if (filterLabel && facts) {
    // Top 5 path: Layer 1 facts first, then the source rows, then the output rules. Shorter than the manual prompt.
    return [
      basePrompt,
      '', '## Tính từ CSV (PO Hub tính, số liệu chưa xác minh; hãy diễn giải, không chỉ nhắc lại)',
      ...facts,
      '', `## Dữ liệu nguồn của ${selected.length} game đã chọn (JSON)`,
      JSON.stringify(observations),
      '', ...TOP5_OUTPUT_RULES,
    ].join('\n');
  }
  return [
    basePrompt,
    '', '## Dữ liệu nguồn đã chọn',
    filterLabel ? `Bộ lọc PO đã chọn: ${filterLabel}. Chỉ nghiên cứu ${selected.length} game đứng đầu theo bộ lọc đó trong tệp đã nhập; không suy ra cho game khác. Đây không phải thứ hạng toàn thị trường.` : '',
    `Tệp CSV trong dự án: ${dataset.filename}. PO Hub đã tự phân tích các số liệu CSV; Codex chỉ bổ sung phần giải thích hoặc bối cảnh khi có căn cứ.`,
    context.selection_criterion ? `Tiêu chí chọn: ${context.selection_criterion}` : 'Phạm vi lựa chọn: PO đã chọn các sản phẩm này thủ công; không mô tả chúng là các sản phẩm dẫn đầu toàn thị trường.',
    measurement ? `Phép đo liên quan: ${measurement.metric_definition} (${measurement.metric_id}); ${measurement.unit}; GEO ${measurement.geo}; nền tảng ${measurement.platform}; ${period}; ${measurement.methodology || 'chưa ghi phương pháp'}.` : 'Phạm vi số liệu: Chọn thủ công; chưa xác định một phạm vi đo lường chung.',
    'Các dòng JSON bên dưới là dữ liệu nguồn được PO chọn; chưa xác minh độc lập và không đại diện toàn thị trường:',
    JSON.stringify(observations, null, filterLabel ? 0 : 2),
    '', 'Tách biệt rõ các loại nguồn sau:',
    '- Quan sát CSV phía trên chỉ là số đo từ các tệp đã cung cấp; coi là số liệu chưa xác minh và không trình bày như dữ liệu đã được xác minh độc lập.',
    '- Bằng chứng công khai trên web phải có URL hoạt động và ngày. Không nói rằng CSV trên máy đã được tìm kiếm hoặc tải lên web.',
    '- Diễn giải của Codex phải được ghi rõ là diễn giải, không phải dữ kiện quan sát.',
    '- Giải thích tăng trưởng hoặc quan hệ nhân quả là giả thuyết nếu chưa có bằng chứng tương thích hỗ trợ độc lập.',
    '', 'Với mỗi sản phẩm đã chọn, trình bày: lối chơi, cơ chế (core loop và cơ chế chính), sub-genre và cách kiếm tiền, mỗi mục kèm link nguồn công khai. Ghi rõ đây là NHẬN ĐỊNH AI, tách khỏi số liệu CSV.',
    'Sub-genre là phân loại của AI, không có trong CSV. Nếu cộng lượt tải theo nhóm sub-genre, ghi rõ phần cộng là phép tính trên CSV và phần phân loại là nhận định AI.',
    'Game không tìm được nguồn công khai: ghi đúng cụm “chưa tìm được nguồn”, không tự điền.',
    'Kết thúc bằng mục “Gợi ý cho PO”. Mỗi gợi ý phải nêu: chỉ số (metric) đang dùng, bằng chứng (số CSV hoặc nguồn có link), và tác động dự kiến cho sản phẩm của PO. Không viết gợi ý chung chung.',
    'Trong khối JSON PO_RESEARCH_V1: mỗi gợi ý cho PO đặt trong findings[].po_implications, một mục cho mỗi gợi ý, viết một câu gồm metric, bằng chứng và tác động. Đặt nhận định AI trong description/po_implications, còn số CSV chỉ đặt trong quantitative_observations với đúng đơn vị và kỳ.',
    'Chỉ dùng các quan sát liệt kê phía trên trong bộ dữ liệu đã lưu. Giữ riêng GEO, nền tảng, kỳ, đơn vị và phương pháp. Không suy ra chỉ số còn thiếu hoặc ghép bản ghi chỉ dựa trên tên hiển thị.',
    'Giữ đúng định dạng PO_RESEARCH_V1 trong yêu cầu gốc để kết quả hiện được trong Tổng quan báo cáo. Đưa CSV vào bối cảnh, không sao chép số CSV thành số liệu web; mọi quan sát CSV giữ nguyên là chưa xác minh.',
  ].join('\n');
}

// Guided top 5 route: copy the prompt, open an assistant, paste the answer, save, and open the new report.
// No model is called here. Each step says what happens next. The numbers are linked to this CSV on save.
const ASSISTANT_LINKS = [{ label: 'Mở ChatGPT (tab mới)', href: 'https://chatgpt.com/' }, { label: 'Mở Claude (tab mới)', href: 'https://claude.ai/new' }];

export function Top5GuidedPanel({ projectId, prompt, question, measurement, dataset, lens, lensLabel, rows }: {
  projectId: string; prompt: string; question: string; measurement: ShortlistContext['measurement'];
  dataset: { id: string; filename: string }; lens: 'downloads' | 'revenue' | 'growth'; lensLabel: string;
  rows: { sourceRow: number; name: string }[];
}) {
  const [copied, setCopied] = useState<number | null>(null);
  const [copyFallback, setCopyFallback] = useState(false);
  const [pasted, setPasted] = useState('');
  const [assistant, setAssistant] = useState<'chatgpt' | 'claude' | 'other'>('chatgpt');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The backend decides what is valid. This only warns, because copying from a chat window can drop the ``` fences.
  const hasStructure = /"?schema_version"?\s*:\s*"?po_research_v1/i.test(pasted);
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(prompt.length); setCopyFallback(false);
    } catch { setCopied(null); setCopyFallback(true); }
  }
  async function save() {
    setSaving(true); setError('');
    try {
      const period = measurement?.snapshot_date || (measurement?.period_start && measurement?.period_end ? `${measurement.period_start} to ${measurement.period_end}` : null);
      const saved = await reportApi.import({
        project_id: projectId, question, geo: measurement?.geo || 'Global / not specified', os: measurement?.platform || 'Unknown',
        research_period: period, content: pasted, source_assistant: assistant,
      });
      await reportApi.updateCsvSelection(saved.id, { dataset_id: dataset.id, dataset_filename: dataset.filename, lens, lens_label: lensLabel, rows: rows.map((row) => ({ source_row: row.sourceRow, name: row.name })) });
      window.history.pushState({}, '', `/reports/${encodeURIComponent(saved.id)}?imported=1`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (cause) {
      const detail = cause instanceof Error ? ` Chi tiết kỹ thuật: ${cause.message}` : '';
      setError(`Chưa lưu được vì phần dữ liệu cuối câu trả lời bị lỗi. Câu trả lời vẫn còn trong ô. Bước tiếp theo: trong cùng cuộc trò chuyện, gửi “Phần JSON PO_RESEARCH_V1 bị lỗi, hãy viết lại toàn bộ phần đó cho đúng, giữ nguyên nội dung”, rồi dán lại vào đây.${detail}`);
    } finally { setSaving(false); }
  }
  return <section className="csv-top5-guided" aria-label="Nghiên cứu top 5 bằng ChatGPT hoặc Claude">
    <div className="csv-top5-guided__step">
      <strong>1 · Sao chép yêu cầu</strong>
      <button className="secondary-action" type="button" onClick={() => void copy()}>Sao chép yêu cầu để dán vào ChatGPT hoặc Claude</button>
      <span role="status">{copied !== null ? `Đã sao chép ${copied.toLocaleString('vi-VN')} ký tự. Bước tiếp theo: mở ChatGPT hoặc Claude ở bước 2.` : copyFallback ? 'Trình duyệt không cho sao chép tự động. Mở “Xem nội dung đã soạn”, chọn tất cả và sao chép.' : 'Yêu cầu gồm số liệu top 5 từ tệp CSV và hướng dẫn trả lời.'}</span>
      <details><summary>Xem nội dung đã soạn · {prompt.length.toLocaleString('vi-VN')} ký tự</summary><textarea aria-label="Nội dung yêu cầu nghiên cứu" readOnly rows={8} value={prompt} onFocus={(event) => event.currentTarget.select()} /></details>
    </div>
    <div className="csv-top5-guided__step">
      <strong>2 · Mở trợ lý và gửi yêu cầu</strong>
      <div className="csv-top5-guided__links">{ASSISTANT_LINKS.map((link) => <a className="secondary-action" href={link.href} target="_blank" rel="noreferrer" key={link.href}>{link.label} ↗</a>)}</div>
      <span>Dán yêu cầu vào khung chat, gửi, đợi trả lời đủ, rồi chép toàn bộ câu trả lời.</span>
    </div>
    <div className="csv-top5-guided__step">
      <strong>3 · Dán câu trả lời và lưu</strong>
      <label className="intake-field"><span className="field-label">Dán toàn bộ câu trả lời</span><textarea aria-label="Dán câu trả lời của trợ lý" rows={6} value={pasted} onChange={(event) => setPasted(event.target.value)} /></label>
      <label className="intake-field"><span className="field-label">Trợ lý đã trả lời</span><select aria-label="Trợ lý đã trả lời" value={assistant} onChange={(event) => setAssistant(event.target.value as 'chatgpt' | 'claude' | 'other')}><option value="chatgpt">ChatGPT</option><option value="claude">Claude</option><option value="other">Trợ lý khác</option></select></label>
      {pasted.trim() && !hasStructure && <p className="csv-top5-guided__next" role="status">Chưa thấy phần dữ liệu PO_RESEARCH_V1 trong nội dung đã dán, nên báo cáo sẽ chỉ lưu dạng văn bản, thiếu phần phát hiện và nhãn bằng chứng. Nên làm: trong cùng cuộc trò chuyện, gửi “Hãy trả lời lại đúng định dạng PO_RESEARCH_V1 (JSON cuối cùng), giữ nguyên nội dung”, bấm nút sao chép của câu trả lời rồi dán lại vào đây. Anh vẫn có thể lưu ngay.</p>}
      {error && <p role="alert">{error}</p>}
      <button className="primary-action" type="button" onClick={() => void save()} disabled={saving || !pasted.trim()}>{saving ? 'Đang lưu…' : 'Lưu và mở báo cáo'}</button>
      <span className="field-help">Khi lưu, báo cáo được gắn với tệp “{dataset.filename}” và 5 game này; phần số trong báo cáo đọc từ tệp đó, không từ câu trả lời.</span>
    </div>
  </section>;
}

export function DataFirstWorkspace({ projectId, view = 'all' }: { projectId: string; view?: 'all' | 'csv' | 'notes' }) {
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [datasets, setDatasets] = useState<ComparisonDataset[]>([]);
  const [collections, setCollections] = useState<ResearchBenchmarkCollection[]>([]);
  const [subjectSources, setSubjectSources] = useState<ResearchSubjectSource[]>([]);
  const [targetCollectionId, setTargetCollectionId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [geoFilter, setGeoFilter] = useState(ALL_CSV_FILTER);
  const [platformFilter, setPlatformFilter] = useState(ALL_CSV_FILTER);
  const [periodFilter, setPeriodFilter] = useState(ALL_CSV_FILTER);
  const [displayMetric, setDisplayMetric] = useState('');
  const [visibleProductMetrics, setVisibleProductMetrics] = useState<string[]>([]);
  const [productSort, setProductSort] = useState<'asc' | 'desc'>('desc');
  const [productActionBusy, setProductActionBusy] = useState<string | null>(null);
  const [dataset, setDataset] = useState<QuantitativeDataset | null>(null);
  const [csvHighlights, setCsvHighlights] = useState<CsvAutoHighlightMap>({});
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [allReports, setAllReports] = useState<ReportSummary[]>([]);
  const [reportsCursor, setReportsCursor] = useState<string | null>(null);
  const [allReportsCursor, setAllReportsCursor] = useState<string | null>(null);
  const [loadingMoreReports, setLoadingMoreReports] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [selectedCriterion, setSelectedCriterion] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<ShortlistContext | null>(null);
  const selectedContextRef = useRef<ShortlistContext | null>(null);
  const selectionRevision = useRef(0);
  const [rankingKey, setRankingKey] = useState('');
  const csvImportFocus = new URLSearchParams(window.location.search).get('action') === 'import-csv';
  const isCsvView = view === 'csv';
  const isNotesView = view === 'notes';
  const codexSettings = useCodexResearchSettings(true);
  const [showImport, setShowImport] = useState(csvImportFocus);
  const [linkReportId, setLinkReportId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [codexResult, setCodexResult] = useState<{ content: string; model_slug: string; context: ShortlistContext; filterLabel: string | null } | null>(null);
  const [codexRunning, setCodexRunning] = useState(false);
  const [codexSaveRunning, setCodexSaveRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingSelection, setSavingSelection] = useState(false);
  const [selectionSaveFailed, setSelectionSaveFailed] = useState(false);
  const [visibleApps, setVisibleApps] = useState(50);
  const selectedAppsRef = useRef<string[]>([]);
  const selectedCriterionRef = useRef<string | null>(null);
  const selectionQueue = useRef<Promise<void>>(Promise.resolve());
  const codexInFlight = useRef(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const [workspace, firstDatasetPage, reportPage, allReportsPage, collectionPage, subjectSourcePage] = await Promise.all([
        researchApi.getProject(projectId), reportApi.listComparisonDatasets(undefined, projectId), reportApi.listProjectReports(projectId), reportApi.list(),
        researchApi.listBenchmarkCollections(projectId), researchApi.listSubjectSources(projectId),
      ]);
      const allDatasets = [...firstDatasetPage.items];
      let datasetCursor = firstDatasetPage.next_cursor ?? undefined;
      while (datasetCursor) {
        const page = await reportApi.listComparisonDatasets(datasetCursor, projectId);
        allDatasets.push(...page.items.filter((item) => !allDatasets.some((existing) => existing.id === item.id)));
        datasetCursor = page.next_cursor ?? undefined;
      }
      setProject(workspace); setDatasets(allDatasets); setCollections(collectionPage.items); setSubjectSources(subjectSourcePage.items); setReports(reportPage.items); setReportsCursor(reportPage.next_cursor);
      setAllReports(allReportsPage.items.filter((report) => !report.project_id || report.project_id === projectId)); setAllReportsCursor(allReportsPage.next_cursor);
      const savedSelection = workspace.workspace_state_json?.selected_app_ids ?? [];
      selectedAppsRef.current = savedSelection;
      setSelectedApps(savedSelection);
      const savedCriterion = workspace.workspace_state_json?.selected_app_criterion ?? null;
      selectedCriterionRef.current = savedCriterion;
      setSelectedCriterion(savedCriterion);
      const savedContext = workspace.workspace_state_json?.selected_app_context ?? null;
      selectedContextRef.current = savedContext;
      setSelectedContext(savedContext);
      const preferredDatasetId = savedContext?.dataset_id;
      const requestedDatasetId = new URLSearchParams(window.location.search).get('datasetId');
      setSelectedDatasetId((current) => requestedDatasetId && allDatasets.some((item) => item.id === requestedDatasetId) ? requestedDatasetId :
        allDatasets.some((item) => item.id === current) ? current :
          (preferredDatasetId && allDatasets.some((item) => item.id === preferredDatasetId) ? preferredDatasetId : allDatasets[0]?.id ?? ''));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được workspace.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [projectId]);

  useEffect(() => {
    if (loading || !window.location.hash) return;
    return followHashAnchorWhenReady();
  }, [loading]);

  async function loadMoreReports() {
    if (loadingMoreReports) return;
    setLoadingMoreReports(true); setError('');
    try {
      const [linkedPage, libraryPage] = await Promise.all([
        reportsCursor ? reportApi.listProjectReports(projectId, reportsCursor) : Promise.resolve(null),
        allReportsCursor ? reportApi.list(allReportsCursor) : Promise.resolve(null),
      ]);
      if (linkedPage) {
        setReports((current) => [...current, ...linkedPage.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
        setReportsCursor(linkedPage.next_cursor);
      }
      if (libraryPage) {
        setAllReports((current) => [...current, ...libraryPage.items.filter((item) => (!item.project_id || item.project_id === projectId) && !current.some((existing) => existing.id === item.id))]);
        setAllReportsCursor(libraryPage.next_cursor);
      }
      if (!linkedPage && !libraryPage) setNotice('Đã tải hết báo cáo trong workspace và thư viện.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải thêm được báo cáo. Hãy thử lại.'); }
    finally { setLoadingMoreReports(false); }
  }

  useEffect(() => {
    if (!selectedDatasetId) { setDataset(null); return; }
    setCsvHighlights({});
    let active = true;
    reportApi.getProjectQuantitativeDataset(projectId, selectedDatasetId)
      .then((item) => { if (active) setDataset(item); })
      .catch((cause) => { if (active) { setDataset(null); setError(cause instanceof Error ? cause.message : 'Không mở được dataset.'); } });
    return () => { active = false; };
  }, [projectId, selectedDatasetId]);

  useEffect(() => {
    setGeoFilter(ALL_CSV_FILTER);
    setPlatformFilter(ALL_CSV_FILTER);
    setPeriodFilter(ALL_CSV_FILTER);
  }, [selectedDatasetId]);

  const apps = useMemo(() => groupsFor(dataset), [dataset]);
  const rankingOptions = useMemo(() => rankingOptionsFor(apps), [apps]);
  const scopeFilters = { geo: geoFilter, platform: platformFilter, period: periodFilter };
  const scopeFilterOptions = useMemo(() => {
    const observations = dataset?.observations ?? [];
    const valuesFor = (values: (string | null | undefined)[]) => [...new Set(values.map((value) => value?.trim() || UNKNOWN_CSV_FILTER))].sort((left, right) => left.localeCompare(right, 'vi'));
    const periods = new Map<string, string>();
    for (const row of observations) periods.set(periodFilterKey(row), csvSourcePeriodLabel(row));
    return {
      geo: valuesFor(observations.map((row) => row.geo)),
      platform: valuesFor(observations.map((row) => row.platform)),
      period: [...periods.entries()].map(([key, label]) => ({ key, label })).sort((left, right) => left.label.localeCompare(right.label, 'vi')),
    };
  }, [dataset]);
  const filteredApps = useMemo(() => apps.filter((app) => app.rows.some((row) => matchesCsvScope(row, scopeFilters))), [apps, geoFilter, platformFilter, periodFilter]);
  const filteredRankingOptions = rankingOptions.filter((option) => {
    const sample = option.rows.values().next().value as AppObservation | undefined;
    return Boolean(sample && matchesCsvScope(sample, scopeFilters));
  });
  const datasetMetrics = useMemo(() => [...new Map((dataset?.observations ?? []).filter((row) => row.metric_id).map((row) => [row.metric_id!, row.metric_definition || row.metric_id!])).entries()], [dataset]);
  const selectedVisibleMetrics = datasetMetrics.filter(([id]) => visibleProductMetrics.includes(id));
  const visibleDatasetMetrics = selectedVisibleMetrics.length ? selectedVisibleMetrics : datasetMetrics.slice(0, 4);
  const datasetScopeSummary = useMemo(() => {
    const scopes = [...new Set((dataset?.observations ?? []).map(csvObservationScopeLabel))];
    if (scopes.length === 0) return 'Chưa có phạm vi nguồn trong tệp.';
    if (scopes.length === 1) return `Phạm vi trong tệp: ${scopes[0]}.`;
    return `Tệp có ${scopes.length} phạm vi khác nhau; chọn bộ lọc để xem từng nhóm.`;
  }, [dataset]);
  const rankingOption = filteredRankingOptions.find((item) => item.key === rankingKey) ?? filteredRankingOptions[0];
  const chartOptions = filteredRankingOptions.filter((item) => item.rows.size >= 2);
  const chartOption = chartOptions.find((item) => item.key === rankingKey) ?? chartOptions[0];
  const chartRows = chartOption
    ? [...chartOption.rows.entries()]
      .map(([id, observation]) => ({ id, observation, app: apps.find((item) => item.id === id) }))
      .filter((row): row is { id: string; observation: AppObservation; app: AppGroup } => Boolean(row.app))
      .sort((left, right) => Number(right.observation.value) - Number(left.observation.value) || left.app.name.localeCompare(right.app.name, 'vi', { numeric: true }))
      .slice(0, 5)
    : [];
  const chartMaxAbsValue = Math.max(0, ...chartRows.map(({ observation }) => Math.abs(Number(observation.value))));
  const chartMetricName = chartOption ? datasetMetrics.find(([id]) => id === chartOption.metricId)?.[1] || chartOption.metricId : '';
  function sortProductsBy(column: string) {
    const next = nextCsvColumnSort({ column: displayMetric, direction: productSort }, column, column === '__name__' ? 'asc' : 'desc');
    setDisplayMetric(next.column); setProductSort(next.direction);
  }
  function toggleProductMetric(id: string) {
    const selected = visibleDatasetMetrics.map(([key]) => key);
    if (selected.includes(id) && selected.length <= 1) return;
    setVisibleProductMetrics(selected.includes(id) ? selected.filter((key) => key !== id) : [...selected, id]);
    if (displayMetric === id && selected.includes(id)) setDisplayMetric('');
  }
  const visibleProductRows = useMemo(() => {
    const filtered = filteredApps.filter((app) => `${app.name} ${app.id}`.toLocaleLowerCase().includes(productQuery.trim().toLocaleLowerCase()));
    if (displayMetric === '__name__') {
      filtered.sort((left, right) => (productSort === 'asc' ? 1 : -1) * left.name.localeCompare(right.name, 'vi', { numeric: true }));
    } else if (datasetMetrics.some(([id]) => id === displayMetric)) {
      filtered.sort((left, right) => {
        const a = (chartOption?.metricId === displayMetric ? chartOption.rows.get(left.id) : undefined)?.value
          ?? (chartOption?.metricId === displayMetric ? undefined : left.rows.find((row) => row.metric_id === displayMetric && matchesCsvScope(row, scopeFilters))?.value);
        const b = (chartOption?.metricId === displayMetric ? chartOption.rows.get(right.id) : undefined)?.value
          ?? (chartOption?.metricId === displayMetric ? undefined : right.rows.find((row) => row.metric_id === displayMetric && matchesCsvScope(row, scopeFilters))?.value);
        // Missing source values are unknown, never zero and never put first.
        if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
        const difference = Number(a) - Number(b);
        return (productSort === 'desc' ? -difference : difference) || left.name.localeCompare(right.name);
      });
    }
    return filtered;
  }, [filteredApps, productQuery, displayMetric, productSort, datasetMetrics, chartOption, geoFilter, platformFilter, periodFilter]);
  if (new URLSearchParams(window.location.search).get('view') === 'opportunities') {
    return <OpportunityReview projectId={projectId} />;
  }
  const activeSelectionMatchesDataset = selectedApps.length === 0
    ? (!selectedContext || selectedContext.dataset_id === selectedDatasetId)
    : Boolean(selectedContext && selectedContext.dataset_id === selectedDatasetId);

  const updateCsvHighlights = useCallback((highlights: CsvAutoHighlightMap) => setCsvHighlights(highlights), []);

  async function toggleApp(id: string) {
    if (!dataset || !activeSelectionMatchesDataset) return;
    const current = selectedAppsRef.current;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    const context = next.length ? makeSelectionContext(dataset, next, apps, 'manual', null) : null;
    const revision = ++selectionRevision.current;
    selectedAppsRef.current = next;
    selectedContextRef.current = context;
    setSelectedContext(context);
    selectedCriterionRef.current = null;
    setSelectedCriterion(null);
    setSelectedApps(next); setSavingSelection(true); setSelectionSaveFailed(false); setNotice(''); setError('');
    const saveOperation = selectionQueue.current.catch(() => undefined).then(async () => {
      await researchApi.updateWorkspaceState(projectId, next, null, context);
    });
    selectionQueue.current = saveOperation;
    try { await saveOperation; if (revision === selectionRevision.current) { setSelectionSaveFailed(false); setNotice('Lựa chọn đã được lưu trong workspace.'); } }
    catch (cause) { if (revision === selectionRevision.current) { setSelectionSaveFailed(true); setError(cause instanceof Error ? cause.message : 'Không lưu được lựa chọn.'); } }
    finally {
      if (selectionQueue.current === saveOperation) setSavingSelection(false);
    }
  }

  function sourceMappingFor(app: AppGroup) {
    return subjectSources.find((source) => source.source_kind === 'csv_entity' && source.source_id === dataset?.id && source.source_key === app.id);
  }

  async function resolveSubject(app: AppGroup): Promise<string> {
    const existingSource = sourceMappingFor(app);
    if (existingSource?.mapped_subject_id) return existingSource.mapped_subject_id;
    if (!dataset) throw new Error('Chưa chọn được CSV nguồn.');
    const mapped = await researchApi.mapSubjectSource(projectId, { source_kind: 'csv_entity', source_id: dataset.id, source_key: app.id, create_subject_from_source: true });
    setSubjectSources((current) => [...current.filter((item) => !(item.source_kind === mapped.source_kind && item.source_id === mapped.source_id && item.source_key === mapped.source_key)), mapped]);
    return mapped.mapped_subject_id || (() => { throw new Error('Đã lưu liên kết nguồn nhưng chưa nhận được mã hồ sơ.'); })();
  }

  async function addProductToCollection(app: AppGroup) {
    if (!targetCollectionId) { setError('Chọn bộ so sánh trước khi thêm sản phẩm.'); return; }
    setProductActionBusy(app.id); setError(''); setNotice('');
    try {
      const subjectId = await resolveSubject(app);
      const saved = await researchApi.addBenchmarkCollectionSubject(projectId, targetCollectionId, subjectId);
      setCollections((current) => current.map((item) => item.id === saved.id ? saved : item));
      setNotice(`Đã thêm ${app.name} vào bộ so sánh “${saved.name}”. Dữ liệu nguồn vẫn được giữ nguyên.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thêm được sản phẩm vào bộ so sánh.'); }
    finally { setProductActionBusy(null); }
  }

  async function retrySaveSelection() {
    setSavingSelection(true); setSelectionSaveFailed(false); setError('');
    const current = [...selectedAppsRef.current];
    const context = selectedContextRef.current;
    const saveOperation = selectionQueue.current.catch(() => undefined).then(async () => {
      await researchApi.updateWorkspaceState(projectId, current, selectedCriterionRef.current, context);
    });
    selectionQueue.current = saveOperation;
    try { await saveOperation; setSelectionSaveFailed(false); setNotice('Lựa chọn đã được lưu trong workspace.'); }
    catch (cause) { setSelectionSaveFailed(true); setError(cause instanceof Error ? cause.message : 'Không lưu được lựa chọn.'); }
    finally { if (selectionQueue.current === saveOperation) setSavingSelection(false); }
  }

  async function selectFiveHighest() {
    if (!rankingOption || !dataset || !activeSelectionMatchesDataset) return;
    const top = [...rankingOption.rows.entries()]
      .sort(([leftId, left], [rightId, right]) => Number(right.value) - Number(left.value)
        || (apps.find((app) => app.id === leftId)?.name ?? leftId).localeCompare(apps.find((app) => app.id === rightId)?.name ?? rightId))
      .slice(0, 5);
    if (top.length === 0) return;
    const next = top.map(([id]) => id);
    const criterion = `Năm giá trị cao nhất được cung cấp trong CSV đã chọn cho ${rankingOption.label}; đây không phải thứ hạng toàn thị trường.`;
    const context = makeSelectionContext(dataset, next, apps, 'rule_based', criterion, rankingOption);
    const revision = ++selectionRevision.current;
    selectedAppsRef.current = next;
    selectedContextRef.current = context;
    setSelectedContext(context);
    selectedCriterionRef.current = criterion;
    setSelectedApps(next); setSelectedCriterion(criterion); setSavingSelection(true); setSelectionSaveFailed(false); setNotice(''); setError('');
    const saveOperation = selectionQueue.current.catch(() => undefined).then(async () => {
      await researchApi.updateWorkspaceState(projectId, next, criterion, context);
    });
    selectionQueue.current = saveOperation;
    try { await saveOperation; if (revision === selectionRevision.current) { setSelectionSaveFailed(false); setNotice('Đã chọn theo giá trị quan sát trong file và lưu vào workspace.'); } }
    catch (cause) { if (revision === selectionRevision.current) { setSelectionSaveFailed(true); setError(cause instanceof Error ? cause.message : 'Không lưu được lựa chọn.'); } }
    finally { if (selectionQueue.current === saveOperation) setSavingSelection(false); }
  }

  async function linkReport() {
    if (!linkReportId) return;
    try { await reportApi.linkReportToProject(projectId, linkReportId); setLinkReportId(''); setNotice('Đã thêm báo cáo vào workspace.'); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể thêm báo cáo.'); }
  }

  async function createPrompt() {
    if (!project || !selectedContext || selectedContext.selection_type === 'legacy') {
      setError('Shortlist cũ không lưu nguồn dataset. Hãy mở dataset và bắt đầu shortlist mới để tạo prompt có provenance chính xác.'); return;
    }
    setError('');
    try {
      const sourceDataset = selectedDatasetId === selectedContext.dataset_id && dataset?.id === selectedContext.dataset_id
        ? dataset : await reportApi.getProjectQuantitativeDataset(projectId, selectedContext.dataset_id);
      const sourceApps = groupsFor(sourceDataset).filter((app) => selectedContext.source_entity_ids.includes(app.id));
      if (!sourceApps.length) throw new Error('Không tìm thấy các ứng dụng đã lưu trong dataset ban đầu. Hãy tải lại workspace để thử lại.');
      const value = buildPrompt(project, sourceDataset, selectedContext, sourceApps); setPrompt(value);
      try { await navigator.clipboard.writeText(value); setPromptCopied(true); setNotice('Đã sao chép yêu cầu. PO Hub vẫn ở tab này; mở ChatGPT ở tab mới, dán yêu cầu rồi quay lại đây để lưu câu trả lời.'); }
      catch { setPromptCopied(false); setNotice('Yêu cầu đã soạn xong. Sao chép nội dung trong phần bên dưới, rồi mở ChatGPT ở tab mới.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể dựng prompt từ shortlist đã lưu.'); }
  }

  // One Codex path for both routes: the manual selection (default context) and the top 10 of a filter (explicit context).
  async function runCodexResearchFromCsv(override?: { context: ShortlistContext; filterLabel: string; facts?: string[] }) {
    const context = override?.context ?? selectedContext;
    if (!project || !context || codexInFlight.current) return;
    if (!override && (savingSelection || selectionSaveFailed)) { setError('Hãy đợi lưu lựa chọn sản phẩm xong rồi chạy nghiên cứu.'); return; }
    if (codexSettings.loadingModels) { setError('PO Hub đang kiểm tra danh sách model Codex. Hãy thử lại sau vài giây.'); return; }
    if (!codexSettings.catalog.available || !codexSettings.preferences.model_slug) { setError('Chọn một model Codex đang khả dụng trước khi chạy.'); return; }
    codexInFlight.current = true; setCodexRunning(true); setCodexResult(null); setError(''); setNotice('');
    try {
      const sourceDataset = selectedDatasetId === context.dataset_id && dataset?.id === context.dataset_id
        ? dataset : await reportApi.getProjectQuantitativeDataset(projectId, context.dataset_id);
      const sourceApps = groupsFor(sourceDataset).filter((app) => context.source_entity_ids.includes(app.id));
      if (!sourceApps.length) throw new Error('Không tìm thấy sản phẩm đã chọn trong tệp CSV. Hãy tải lại dự án rồi thử lại.');
      const result = await reportApi.runCodexResearch({
        model_slug: codexSettings.preferences.model_slug,
        prompt: buildPrompt(project, sourceDataset, context, sourceApps, override?.filterLabel, override?.facts),
      });
      setCodexResult({ ...result, context, filterLabel: override?.filterLabel ?? null });
      setNotice(`Codex đã trả kết quả bằng ${result.model_slug}. Xem lại nguồn rồi mới lưu.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không chạy được Codex. Lựa chọn CSV vẫn được giữ.'); }
    finally { codexInFlight.current = false; setCodexRunning(false); }
  }

  async function saveCodexResearchFromCsv() {
    if (!codexResult || !project || codexSaveRunning) return;
    const measurement = codexResult.context.measurement;
    const period = measurement?.snapshot_date || (measurement?.period_start && measurement?.period_end ? `${measurement.period_start} to ${measurement.period_end}` : null);
    setCodexSaveRunning(true); setError('');
    try {
      const saved = await reportApi.import({
        project_id: projectId,
        question: codexResult.filterLabel
          ? top10ResearchQuestion(project, codexResult.filterLabel, codexResult.context.dataset_filename, codexResult.context.source_entity_ids.length)
          : selectedResearchQuestion(project),
        geo: measurement?.geo || 'Global / not specified', os: measurement?.platform || 'Unknown',
        research_period: period, content: codexResult.content, origin: 'codex_cli_research',
      });
      window.history.pushState({}, '', `/reports/${encodeURIComponent(saved.id)}?imported=1${saved.duplicate ? '&duplicate=1' : ''}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được kết quả. Nội dung vẫn còn trên màn hình.'); }
    finally { setCodexSaveRunning(false); }
  }

  async function copyGeneratedPrompt() {
    if (!prompt) return;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard không khả dụng.');
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setNotice('Đã sao chép yêu cầu. Dán vào ChatGPT để lấy báo cáo.');
      setError('');
    } catch {
      setPromptCopied(false);
      setError('Không sao chép được tự động. Mở “Xem nội dung yêu cầu” rồi sao chép thủ công.');
    }
  }

  function startNewShortlist() {
    if (!dataset) return;
    const context: ShortlistContext = { dataset_id: dataset.id, dataset_filename: dataset.filename, dataset_content_sha256: dataset.content_sha256,
      selection_type: 'manual', source_entity_ids: [], selection_criterion: null, measurement: null, observation_refs: [] };
    const revision = ++selectionRevision.current;
    selectedAppsRef.current = []; selectedContextRef.current = context;
    setSelectedApps([]); setSelectedCriterion(null); setSelectedContext(context); setPrompt(''); setPromptCopied(false); setSelectionSaveFailed(false); setNotice('Đã bắt đầu shortlist mới cho dataset này. Shortlist đã lưu trước đó được thay thế khi bạn chọn ứng dụng đầu tiên.');
    const saveOperation = selectionQueue.current.catch(() => undefined).then(async () => { await researchApi.updateWorkspaceState(projectId, [], null, context); });
    selectionQueue.current = saveOperation; setSavingSelection(true);
    void saveOperation.then(() => { if (revision === selectionRevision.current) setSelectionSaveFailed(false); }).catch((cause) => { if (revision === selectionRevision.current) { setSelectionSaveFailed(true); setError(cause instanceof Error ? cause.message : 'Không lưu được shortlist mới.'); } }).finally(() => { if (selectionQueue.current === saveOperation) setSavingSelection(false); });
  }

  if (loading) return <section className="research-panel"><p role="status">Đang mở dự án…</p></section>;
  if (!project) return <section className="research-panel"><div className="research-alert" role="alert">{error || 'Không tìm thấy dự án.'}</div><a href="/research">Quay lại trang Nghiên cứu</a></section>;

  const csvAnalysisReadyCount = dataset?.observations.filter(isCsvAnalysisReadyObservation).length ?? 0;

  function openCsvSourceRow(sourceRowNumber?: number) {
    const details = document.querySelector<HTMLDetailsElement>('.csv-values-table-details');
    if (!details) return;
    details.open = true;
    const row = sourceRowNumber === undefined ? null : details.querySelector<HTMLElement>(`[data-csv-source-rows~="${sourceRowNumber}"]`);
    row?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    row?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
  }

  // The action under the top 10 takes the rows of the current filter. It never needs ticks and runs only on click.
  // One request for both the Codex run and the copy-to-assistant prompt, so they always match.
  function buildTop5Request(selection: Top10ResearchSelection, ids: string[]) {
    if (!dataset || !project) return null;
    const criterion = `Top ${ids.length} game theo ${selection.lensLabel.toLocaleLowerCase()} trong tệp ${dataset.filename}; nghiên cứu chỉ gồm ${ids.length} game này. Đây không phải thứ hạng toàn thị trường.`;
    const context = makeSelectionContext(dataset, ids, apps, 'rule_based', criterion);
    // Keep the download period and scope of the games in the saved report, not a generic placeholder.
    const sample = apps.filter((app) => ids.includes(app.id)).flatMap((app) => app.rows).find((row) => row.metric_id === 'downloads_absolute');
    // Keep the prompt inside the Codex input limit: only the metrics the top 5 analysis needs.
    const researchMetrics = new Set(['downloads_absolute', 'downloads_yoy_growth_absolute', 'revenue_absolute', 'dau_absolute']);
    context.observation_refs = context.observation_refs.filter((ref) => ref.metric_id !== null && researchMetrics.has(ref.metric_id));
    if (sample) context.measurement = { metric_id: sample.metric_id, metric_definition: sample.metric_definition, unit: sample.unit, geo: sample.geo, platform: sample.platform, period_start: sample.period_start, period_end: sample.period_end, snapshot_date: sample.snapshot_date ?? null, period_semantics: sample.period_semantics ?? null, granularity: sample.granularity, methodology: sample.methodology ?? null };
    const facts = top5FactLines(dataset, selection.rows, selection.rows.slice(0, 5), computeTop10Rankings(dataset));
    const sourceApps = groupsFor(dataset).filter((app) => ids.includes(app.id));
    const prompt = buildPrompt(project, dataset, context, sourceApps, selection.lensLabel, facts);
    return { context, facts, prompt };
  }

  function renderTop10Research(selection: Top10ResearchSelection) {
    // The table shows the top 10; one Codex run researches only the first 5 of the same filter.
    const ids = selection.rows.slice(0, 5)
      .map((row) => apps.find((app) => app.rows.some((observation) => observation.source_row_number === row.sourceRow))?.id)
      .filter((id): id is string => Boolean(id));
    const request = buildTop5Request(selection, ids);
    const codexEnabled = codexSettings.preferences.enabled;
    const blockedReason = !codexEnabled ? 'Bật Codex trong “Cài đặt Codex và model” để dùng nút này.'
      : !codexSettings.catalog.available ? 'Codex chưa sẵn sàng trên máy này.' : '';
    const canRun = selection.canRun && ids.length > 0 && codexEnabled && !codexRunning && !codexSettings.loadingModels && codexSettings.catalog.available && Boolean(codexSettings.preferences.model_slug);
    return <div className="csv-top10-research">
      <button className="primary-action" type="button" disabled={!canRun || !dataset || !project}
        onClick={() => {
          if (!request) return;
          void runCodexResearchFromCsv({ context: request.context, filterLabel: selection.lensLabel, facts: request.facts });
        }}>
        {codexRunning ? 'Codex đang nghiên cứu…' : 'Nghiên cứu top 5 bằng Codex'}
      </button>
      <p className="field-help">
        {ids.length ? `Nút này chỉ nghiên cứu top ${ids.length} game của bộ lọc “${selection.lensLabel}”; bảng trên hiển thị top 10. Mỗi lần chạy dùng hạn mức Codex; chỉ chạy khi anh bấm.` : selection.reason}
        {blockedReason ? ` ${blockedReason}` : ''}
      </p>
      {request && dataset && project && ids.length > 0 && selection.lens !== 'combined' && <Top5GuidedPanel
        projectId={projectId} prompt={request.prompt} question={top10ResearchQuestion(project, selection.lensLabel, dataset.filename, ids.length)}
        measurement={request.context.measurement} dataset={{ id: dataset.id, filename: dataset.filename }} lens={selection.lens} lensLabel={selection.lensLabel}
        rows={selection.rows.slice(0, 5).filter((row) => row.sourceRow !== null).map((row) => ({ sourceRow: row.sourceRow as number, name: row.name }))} />}
    </div>;
  }

  return <div className={`data-first-workspace${isCsvView ? ' data-first-workspace--csv' : ''}${isNotesView ? ' data-first-workspace--notes' : ''}${csvImportFocus ? ' csv-import-focus' : ''}`}>
    <ProjectJourneyNav projectId={projectId} active="research" />
    <details className="workspace-codex-configuration" id="workspace-codex-settings">
      <summary>Cài đặt Codex và model</summary>
      <p>Câu hỏi nghiên cứu chạy khi nhấn Enter; phân tích sản phẩm chỉ chạy khi anh bấm nút. Mỗi yêu cầu dùng hạn mức Codex.</p>
      <CodexResearchSettings {...codexSettings} purpose="workspace" />
    </details>
    {view !== 'all' && <section className={`research-panel data-workspace-heading${isCsvView ? ' data-workspace-heading--csv' : ''}`}><div>{!isCsvView && <a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}`}>← Tổng quan dự án</a>}<span className="state-label">{isCsvView ? 'PHÂN TÍCH DỮ LIỆU' : 'THÔNG TIN DỰ ÁN'}</span><h2>{isCsvView ? 'Phân tích CSV' : 'Thông tin đã lưu'}</h2><p>{isCsvView ? 'Mô tả số liệu trong một tệp; tính chênh lệch chỉ khi chọn hai kỳ tương thích. Không dùng ChatGPT/Codex.' : 'Ghi nhận và mở lại thông tin, hồ sơ, bộ so sánh đã lưu trong dự án.'}</p></div></section>}
    {!isCsvView && <>
      <SavedInformationPanel projectId={projectId} />
      <ResearchSubjectsPanel projectId={projectId} codexSettings={codexSettings} />
      <details className="saved-information-legacy"><summary>Các cập nhật xu hướng và ảnh đã lưu trước đây</summary><p>Các nội dung này được lưu theo quy trình trước. Chúng vẫn được giữ nguyên và có thể xem tại đây.</p><TrendUpdatesPanel projectId={projectId} /><ImageEvidencePanel projectId={projectId} /></details>
    </>}
    {error && <div className="research-alert" role="alert">{error}</div>}{notice && <div className="research-success" role="status">{notice}</div>}
    {!isNotesView && <>
    <div className={`workspace-source-grid${isCsvView ? ' workspace-source-grid--focused' : ''}`}>
      <section className={`research-panel${isCsvView ? ' csv-dataset-toolbar' : ''}`} id="project-csv-data">{isCsvView ? <>
        <div className="csv-dataset-toolbar__meta"><span className="state-label">TỆP TRONG BẢNG</span><strong>{datasets.length ? `${datasets.length} tệp trong dự án` : 'Chưa có tệp dữ liệu'}</strong></div>
        {datasets.length > 0 && <label className="field-label">Tệp đang mở trong bảng<select value={selectedDatasetId} onChange={(event) => { setSelectedDatasetId(event.target.value); setVisibleApps(50); setPrompt(''); setPromptCopied(false); setVisibleProductMetrics([]); setDisplayMetric(''); }}><option value="">Chọn tệp dữ liệu</option>{datasets.map((item) => <option value={item.id} key={item.id}>{item.filename} · {item.source_apps ?? 0} sản phẩm</option>)}</select></label>}
        <button className="secondary-action" type="button" onClick={() => setShowImport((value) => !value)}>{showImport ? 'Đóng phần nhập' : 'Nhập CSV'}</button>
      </> : <><div className="panel-heading"><div><span className="state-label">SỐ LIỆU TỪ TỆP CSV</span><h3>Tệp dữ liệu CSV</h3></div><button className="primary-action" type="button" onClick={() => setShowImport((value) => !value)}>{showImport ? 'Đóng phần nhập' : 'Nhập CSV'}</button></div><p>{datasets.length ? `Đã lưu ${datasets.length} tệp CSV` : 'Nhập tệp CSV để xem số liệu, điểm nổi bật và thay đổi giữa các kỳ.'}</p>
        {datasets.length > 0 && <label className="field-label">Tệp đang mở trong bảng<select value={selectedDatasetId} onChange={(event) => { setSelectedDatasetId(event.target.value); setVisibleApps(50); setPrompt(''); setPromptCopied(false); setVisibleProductMetrics([]); setDisplayMetric(''); }}><option value="">Chọn tệp dữ liệu</option>{datasets.map((item) => <option value={item.id} key={item.id}>{item.filename} · {item.source_apps ?? 0} sản phẩm</option>)}</select></label>}
      </>}
        {showImport && <QuantitativeDatasetImport projectId={projectId} onImported={(item) => { setSelectedDatasetId(item.id); setDataset(item); setCsvHighlights({}); setShowImport(false); setVisibleApps(50); void (async () => { const all: ComparisonDataset[] = []; let cursor: string | undefined; do { const page = await reportApi.listComparisonDatasets(cursor, projectId); all.push(...page.items.filter((row) => !all.some((existing) => existing.id === row.id))); cursor = page.next_cursor ?? undefined; } while (cursor); setDatasets(all); })().catch((cause) => setError(cause instanceof Error ? cause.message : 'CSV đã lưu nhưng danh sách chưa làm mới. Hãy bấm Refresh.')); }} />}
      </section>
      {view === 'all' && <section className="research-panel" id="workspace-reports"><div className="panel-heading"><div><span className="state-label">KẾT QUẢ CHATGPT</span><h3>Báo cáo trong dự án</h3></div><a className="secondary-action" href={`/reports?projectId=${encodeURIComponent(projectId)}`}>Mở thư viện báo cáo</a></div><p>{reports.length ? `Đã liên kết ${reports.length} báo cáo` : 'Nhập báo cáo tại đây sau khi nghiên cứu bằng ChatGPT Plus.'}</p><div className="workspace-report-list">{reports.map((report) => <a key={report.id} href={`/reports/${encodeURIComponent(report.id)}`}><strong>{report.question}</strong><small>{displayReportScope(report.geo, report.os, report.research_period)}</small></a>)}</div>
        {allReports.filter((report) => !reports.some((linked) => linked.id === report.id)).length > 0 && <div className="workspace-link-report"><label className="field-label">Thêm báo cáo đã lưu<select value={linkReportId} onChange={(event) => setLinkReportId(event.target.value)}><option value="">Chọn báo cáo…</option>{allReports.filter((report) => !reports.some((linked) => linked.id === report.id)).map((report) => <option key={report.id} value={report.id}>{report.question}</option>)}</select></label><button className="secondary-action" type="button" disabled={!linkReportId} onClick={() => void linkReport()}>Thêm vào dự án</button></div>}
        {(reportsCursor || allReportsCursor) && <button type="button" className="secondary-action" disabled={loadingMoreReports} onClick={() => void loadMoreReports()}>{loadingMoreReports ? 'Đang tải báo cáo…' : 'Tải thêm báo cáo'}</button>}
      </section>}
    </div>
    {dataset && <div className="csv-result-stack" aria-label="Kết quả tệp CSV">
      <CsvAutoAnalysis dataset={dataset} onHighlights={updateCsvHighlights} onOpenSourceRow={isCsvView ? openCsvSourceRow : undefined} compareHref={`/compare-periods?projectId=${encodeURIComponent(projectId)}`} renderResearchAction={renderTop10Research} />
    </div>}
    {dataset && <details className="csv-technical-details"><summary>Chi tiết kỹ thuật: bảng số liệu gốc và rà soát dòng CSV</summary><section className={`research-panel workspace-explorer${isCsvView ? ' workspace-explorer--csv' : ''}`}><div className="panel-heading"><div>{!isCsvView && <span className="state-label">KHÁM PHÁ DỮ LIỆU CSV</span>}<h3>{dataset.filename}</h3></div><span className="data-scope-pill">{dataset.source_rows ?? dataset.observations.length} dòng CSV · {dataset.source_apps ?? apps.length} sản phẩm nguồn</span></div><p className="csv-readiness-summary" role="status">CSV chưa được xác minh độc lập · {dataset.observations.length} phép đo · {csvAnalysisReadyCount} đủ điều kiện phân tích tự động · {dataset.observations.length - csvAnalysisReadyCount} cần rà soát. {datasetScopeSummary} {csvAnalysisReadyCount > 0 ? 'Chỉ so sánh các số liệu cùng phạm vi và định nghĩa.' : 'Chưa thể kết luận tăng trưởng hoặc so sánh chuẩn hóa. Số liệu gốc vẫn hiển thị bên dưới.'} {csvAnalysisReadyCount < dataset.observations.length ? readinessGapText(dataset.observations) : ''}</p>
      {!activeSelectionMatchesDataset && <div className="research-alert" role="status">Danh sách đã lưu thuộc tệp dữ liệu “{selectedContext?.dataset_filename || 'nguồn cũ chưa biết'}”, không phải tệp đang xem. Chọn “Tạo danh sách mới…” để bắt đầu từ tệp này; danh sách cũ vẫn được giữ cho đến khi bạn xác nhận hành động đó.</div>}
      {activeSelectionMatchesDataset && selectedApps.length === 0 && selectedContext && <p className="field-help">Danh sách mới đã mở từ tệp này. Chọn sản phẩm bên dưới để lưu vào danh sách.</p>}
      {!activeSelectionMatchesDataset && <button type="button" className="secondary-action" onClick={startNewShortlist} disabled={savingSelection}>Tạo danh sách mới từ tệp này (thay danh sách hiện tại)</button>}
      {apps.length > 0 && <div className="workspace-product-controls">
        <label>Tìm sản phẩm<input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Tên sản phẩm…" /></label>
        <details className="csv-advanced-filters"><summary>Bộ lọc phạm vi, chỉ số và so sánh</summary><div className="csv-advanced-filters__body">
        <div className="csv-scope-filters" role="group" aria-label="Lọc dữ liệu theo phạm vi">
          <label>Khu vực<select aria-label="Lọc theo khu vực" value={geoFilter} onChange={(event) => setGeoFilter(event.target.value)}><option value={ALL_CSV_FILTER}>Tất cả khu vực</option>{scopeFilterOptions.geo.map((value) => <option value={value} key={value}>{csvScopeOptionLabel(value, 'Chưa ghi khu vực')}</option>)}</select></label>
          <label>Nền tảng<select aria-label="Lọc theo nền tảng" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value={ALL_CSV_FILTER}>Tất cả nền tảng</option>{scopeFilterOptions.platform.map((value) => <option value={value} key={value}>{csvScopeOptionLabel(value, 'Chưa ghi nền tảng')}</option>)}</select></label>
          <label>Kỳ dữ liệu<select aria-label="Lọc theo kỳ dữ liệu" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}><option value={ALL_CSV_FILTER}>Tất cả các kỳ</option>{scopeFilterOptions.period.map(({ key, label }) => <option value={key} key={key}>{label}</option>)}</select></label>
        </div>
        {datasetMetrics.length > 0 && <details className="quant-column-picker workspace-column-picker">
          <summary>Chọn cột chỉ số · {visibleDatasetMetrics.length}/{datasetMetrics.length}</summary>
          <div role="group" aria-label="Chọn chỉ số hiển thị trong bảng sản phẩm">
            {datasetMetrics.map(([id, name]) => <label key={id}>
              <input type="checkbox" checked={visibleDatasetMetrics.some(([key]) => key === id)} disabled={visibleDatasetMetrics.length === 1 && visibleDatasetMetrics[0]?.[0] === id} onChange={() => toggleProductMetric(id)} aria-label={`Hiển thị cột ${csvMetricLabel(id, name)}`} />
              <span>{csvMetricLabel(id, name)}<small>Tên cột nguồn: {name}</small></span>
            </label>)}
          </div>
        </details>}
        <details className="workspace-benchmark-picker"><summary>Bộ so sánh</summary><label>Danh sách so sánh<select aria-label="Danh sách so sánh" value={targetCollectionId} onChange={(event) => setTargetCollectionId(event.target.value)}><option value="">Chọn danh sách…</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label></details>
        </div></details>
        <span className="quant-sort-instruction">Trong bảng, chọn tên cột để sắp xếp.</span>
      </div>}
      {filteredApps.length === 0 ? <p className="field-help">Không có sản phẩm trong phạm vi đã chọn. Hãy chọn “Tất cả” ở bộ lọc để xem lại dữ liệu.</p> : <div className="csv-product-analysis-grid">
        <details className="csv-values-table-details"><summary>Mở bảng số liệu gốc · {filteredApps.length} sản phẩm</summary><div className="workspace-app-table-scroll">
        <table className="workspace-app-table" style={{ minWidth: `${Math.max(620, 490 + visibleDatasetMetrics.length * 115)}px` }}>
          <thead><tr>
            <th title="Chọn sản phẩm nếu muốn nghiên cứu sâu hơn (tùy chọn)">Chọn · tùy chọn</th>
            <th aria-sort={displayMetric === '__name__' ? productSort === 'asc' ? 'ascending' : 'descending' : 'none'}>
              <button type="button" className="quant-sort-header" onClick={() => sortProductsBy('__name__')}>
                <span>Sản phẩm</span><span aria-hidden="true">{displayMetric === '__name__' ? productSort === 'asc' ? '↑' : '↓' : '↕'}</span>
              </button>
            </th>
            {visibleDatasetMetrics.map(([id, name]) => <th key={id} aria-sort={displayMetric === id ? productSort === 'asc' ? 'ascending' : 'descending' : 'none'}>
              <div className="csv-metric-header"><button className="quant-sort-header" type="button" onClick={() => sortProductsBy(id)}>
                <span>{csvMetricLabel(id, name)}</span><span aria-hidden="true">{displayMetric === id ? productSort === 'asc' ? '↑' : '↓' : '↕'}</span>
              </button>{csvMetricLabel(id, name) !== name && <details className="workspace-metric-source"><summary>Tên cột nguồn</summary><code>{name}</code></details>}</div>
            </th>)}
            <th>Hành động</th>
          </tr></thead>
          <tbody>{visibleProductRows.slice(0, visibleApps).map((app) => {
            const mapping = sourceMappingFor(app);
            const profileHref = mapping?.mapped_subject_id ? `/research?projectId=${encodeURIComponent(projectId)}&view=notes&subjectId=${encodeURIComponent(mapping.mapped_subject_id)}#project-subject-profiles` : '';
            return <tr key={app.id} data-csv-source-rows={[...new Set(app.rows.map((row) => row.source_row_number).filter((row): row is number => typeof row === 'number'))].join(' ')}>
              <td><input type="checkbox" aria-label={`Chọn ${app.name} để nghiên cứu thêm (tùy chọn)`} checked={activeSelectionMatchesDataset && selectedApps.includes(app.id)} disabled={!activeSelectionMatchesDataset || savingSelection} onChange={() => void toggleApp(app.id)} /></td>
              <th scope="row">{app.name}<details className="csv-product-source"><summary>Phạm vi &amp; nguồn</summary><span>{[...new Set(app.rows.filter((row) => matchesCsvScope(row, scopeFilters)).map(csvObservationScopeLabel))].join('; ') || 'Chưa có phạm vi ghi nhận'}</span><span>Dòng CSV: {[...new Set(app.rows.map((row) => row.source_row_number).filter((row): row is number => typeof row === 'number'))].join(', ') || 'chưa ghi'}</span><span>Phương pháp: {[...new Set(app.rows.map((row) => row.methodology).filter(Boolean))].join('; ') || 'chưa ghi'}</span><code>{app.id}</code></details></th>
              {visibleDatasetMetrics.map(([metricId, metricName]) => {
                const isSelectedChartMetric = chartOption?.metricId === metricId;
                const observation = (isSelectedChartMetric ? chartOption.rows.get(app.id) : undefined)
                  ?? app.rows.find((row) => row.metric_id === metricId && matchesCsvScope(row, scopeFilters));
                const outsideChartGroup = isSelectedChartMetric && !chartOption.rows.has(app.id) && Boolean(observation?.value != null);
                const highlight = observation ? csvHighlights[csvObservationHighlightKey(observation)] : undefined;
                return <td key={metricId} data-label={csvMetricLabel(metricId, metricName)}>
                  <strong className={`workspace-source-value${highlight ? ` csv-auto-value csv-auto-value--${highlight.kind}` : ''}`}>{observation?.value == null ? (observation?.source_validation_reasons?.some((reason) => reason.includes('non-numeric value')) ? 'Giá trị không hợp lệ' : 'Chưa có giá trị') : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(observation.value)}${csvUnitLabel(observation.unit) ? ` ${csvUnitLabel(observation.unit)}` : ''}`}</strong>
                  <small>{observation?.verification_status === 'verified' ? 'Đã xác minh độc lập' : 'Đọc từ CSV · chưa xác minh độc lập'}{observation && !observation.analysis_ready ? ' · Chưa đủ metadata so sánh' : ''}</small>
                  {outsideChartGroup && <small>Ngoài nhóm đang đối chiếu</small>}
                  {highlight && <small className={`csv-auto-value-label csv-auto-value-label--${highlight.kind}`}><span aria-hidden="true">{highlight.kind === 'increase' || highlight.kind === 'highest' ? '↑' : highlight.kind === 'decrease' || highlight.kind === 'lowest' ? '↓' : highlight.kind === 'unchanged' ? '•' : '!'}</span> {highlight.label}{highlight.detail ? ` · ${highlight.detail}` : ''}</small>}
                </td>;
              })}
              <td className="workspace-product-actions" data-label="Hành động">{profileHref ? <a className="secondary-action" href={profileHref}>Mở hồ sơ</a> : <button type="button" className="secondary-action" disabled={productActionBusy === app.id} onClick={async () => { setProductActionBusy(app.id); setError(''); try { const subjectId = await resolveSubject(app); setNotice(`Đã tạo hồ sơ cho ${app.name}.`); window.history.pushState({}, '', `/research?projectId=${encodeURIComponent(projectId)}&view=notes&subjectId=${encodeURIComponent(subjectId)}#project-subject-profiles`); window.dispatchEvent(new PopStateEvent('popstate')); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được hồ sơ.'); } finally { setProductActionBusy(null); } }}>{productActionBusy === app.id ? 'Đang tạo…' : 'Tạo hồ sơ'}</button>}<button type="button" className="text-button" disabled={productActionBusy === app.id || !targetCollectionId} onClick={() => void addProductToCollection(app)}>Thêm vào bộ so sánh</button></td>
            </tr>;
          })}</tbody>
        </table>
        </div></details>
        <aside className="csv-values-chart" aria-label="Biểu đồ số liệu CSV theo cùng phạm vi">
          <div className="csv-values-chart__heading"><span className="state-label">TOP {Math.min(chartRows.length || 5, 5)} TRONG TỆP CSV</span><h4>{chartMetricName ? csvMetricLabel(chartOption?.metricId || '', chartMetricName) : 'So sánh giá trị sản phẩm'}</h4></div>
          {chartOptions.length > 1 && <label className="field-label">Nhóm số liệu biểu đồ<select aria-label="Nhóm số liệu biểu đồ" value={chartOption?.key || ''} onChange={(event) => {
            const next = chartOptions.find((item) => item.key === event.target.value);
            setRankingKey(event.target.value);
            if (next) {
              setVisibleProductMetrics((current) => [...new Set([...current, next.metricId])]);
              setDisplayMetric(next.metricId);
              setProductSort('desc');
            }
          }}>{chartOptions.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label>}
          {chartOption && chartRows.length >= 2 ? <>
            <p className="csv-values-chart__scope">{chartOption.label}</p>
            <ol className="csv-values-chart__rows" aria-label={`${csvMetricLabel(chartOption.metricId, chartMetricName)} theo từng sản phẩm`}>
              {chartRows.map(({ id, observation, app }) => {
                const value = Number(observation.value);
                const width = chartMaxAbsValue ? Math.max(0, Math.min(48, Math.abs(value) / chartMaxAbsValue * 48)) : 0;
                return <li key={id} aria-label={`${app.name}: ${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(value)} ${csvUnitLabel(observation.unit)}`}>
                  <strong>{new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(value)}<small>{csvUnitLabel(observation.unit)}</small></strong>
                  <span className="csv-values-chart__track" aria-hidden="true"><span className={`csv-values-chart__bar${value < 0 ? ' csv-values-chart__bar--negative' : ''}`} style={{ height: `${width}%` }} /></span>
                  <span className="csv-values-chart__name" title={app.name}>{app.name}</span>
                </li>;
              })}
            </ol>
          </> : <p className="csv-values-chart__empty">Chưa có ít nhất hai sản phẩm với cùng chỉ số, kỳ, phạm vi, đơn vị và phương pháp để vẽ. Số gốc vẫn có trong bảng.</p>}
          <p className="csv-values-chart__note">Chỉ so sánh các dòng đủ thông tin trong tệp này; không phải thứ hạng thị trường.</p>
          {rankingOption && <button type="button" className="secondary-action" disabled={!activeSelectionMatchesDataset || savingSelection || rankingOption.rows.size < 5} onClick={() => void selectFiveHighest()}>Chọn 5 giá trị cao nhất trong nhóm này</button>}
        </aside>
      </div>}
      {visibleProductRows.length > visibleApps && <button type="button" className="secondary-action" onClick={() => setVisibleApps((current) => current + 50)}>Tải thêm sản phẩm</button>}
      {filteredRankingOptions.length === 0 && <p className="field-help">Chưa thể so sánh giá trị tự động vì chưa có nhóm số liệu đủ thông tin về chỉ số, đơn vị, khu vực, nền tảng, phương pháp và kỳ. Bạn vẫn xem được số liệu gốc và có thể tự chọn sản phẩm.</p>}
      {selectedCriterion && <p className="field-help">{selectedCriterion}</p>}
      <div className="workspace-followup"><span>{activeSelectionMatchesDataset ? (savingSelection ? 'Đang lưu danh sách đã chọn…' : selectionSaveFailed ? 'Danh sách chưa được lưu' : 'Danh sách đã được lưu') : 'Danh sách đã lưu thuộc một tệp dữ liệu khác'}</span>{selectionSaveFailed && <button type="button" className="secondary-action" onClick={() => void retrySaveSelection()}>Thử lưu lại lựa chọn</button>}</div>
    </section></details>}
    {selectedContext && <section className="research-panel workspace-saved-shortlist"><div className="panel-heading"><div><span className="state-label">NGHIÊN CỨU THÊM · TÙY CHỌN</span><h3>Tìm hiểu thêm về sản phẩm đã chọn</h3></div><span role="status">{savingSelection ? 'Đang lưu lựa chọn…' : selectionSaveFailed ? 'Lưu lựa chọn thất bại' : 'Lựa chọn đã lưu'}</span></div><p>{selectedApps.length ? `${selectedApps.length} sản phẩm từ “${selectedContext.dataset_filename || 'tệp CSV'}”. Phân tích số liệu CSV đã có phía trên; Codex chỉ bổ sung bối cảnh.` : 'Chọn sản phẩm trong bảng nếu muốn tìm hiểu thêm. Phân tích CSV vẫn chạy mà không cần Codex.'}</p><p className="field-help">Tên sản phẩm và các số CSV đã chọn sẽ được gửi cho Codex. Kết quả chưa xác minh độc lập; PO Hub không lưu gì cho tới khi anh bấm Lưu.</p>{codexSettings.preferences.enabled ? <button type="button" className="primary-action" onClick={() => void runCodexResearchFromCsv()} disabled={!selectedApps.length || savingSelection || selectionSaveFailed || codexRunning || codexSettings.loadingModels || !codexSettings.catalog.available || !codexSettings.preferences.model_slug}>{codexRunning ? 'Codex đang nghiên cứu…' : 'Nghiên cứu sản phẩm bằng Codex'}</button> : <details className="workspace-manual-research"><summary>Dùng ChatGPT thủ công (tùy chọn)</summary>{prompt ? <p className="workspace-prompt-ready" role="status">{promptCopied ? 'Yêu cầu đã sao chép. PO Hub vẫn mở ở tab này.' : 'Yêu cầu đã soạn. Sao chép nội dung bên dưới nếu muốn tiếp tục.'}</p> : <button type="button" className="secondary-action" onClick={() => void createPrompt()} disabled={!selectedApps.length || savingSelection || selectionSaveFailed}>Soạn và sao chép yêu cầu cho ChatGPT</button>}</details>}</section>}
    {codexRunning && <div className="research-success" role="status">Codex đang tạo phần nghiên cứu bổ sung… Đây là yêu cầu dùng hạn mức Codex.</div>}
    {codexResult && <section className="research-panel workspace-codex-result" aria-labelledby="workspace-codex-result-title"><div className="panel-heading"><div><span className="state-label">KẾT QUẢ TỪ CODEX · CHƯA XÁC MINH</span><h3 id="workspace-codex-result-title">Xem lại trước khi lưu</h3></div><button type="button" className="text-button" onClick={() => setCodexResult(null)}>Bỏ kết quả</button></div><p>{notice}</p><div className="workspace-codex-result__body">{codexResult.content}</div><p className="field-help">Kiểm tra các nguồn dẫn và phạm vi. Khi lưu, báo cáo sẽ xuất hiện trong dự án và kết quả có cấu trúc sẽ nằm ở Tổng quan.</p><div className="intake-actions"><button type="button" className="primary-action" onClick={() => void saveCodexResearchFromCsv()} disabled={codexSaveRunning}>{codexSaveRunning ? 'Đang lưu báo cáo…' : 'Lưu báo cáo vào dự án'}</button><a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}&view=csv`}>Quay lại CSV</a></div></section>}
    {prompt && <section className="research-panel workspace-prompt-card" aria-labelledby="workspace-prompt-title"><div className="workspace-prompt-card__heading"><span className="state-label">CHATGPT · TÙY CHỌN</span><h3 id="workspace-prompt-title">Bổ sung bối cảnh ngoài CSV</h3><p>CSV phía trên đã được PO Hub phân tích. Chỉ dùng bước này nếu muốn nghiên cứu thêm bằng ChatGPT.</p></div><div className="workspace-prompt-card__steps"><div><strong>Mở ChatGPT</strong><span>PO Hub vẫn mở ở tab này. Dán yêu cầu đã sao chép vào ChatGPT.</span><a className="secondary-action" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Mở ChatGPT ở tab mới ↗</a></div><div><strong>Lưu câu trả lời (nếu đã chạy nghiên cứu)</strong><span>Quay lại đây để lưu kết quả vào đúng dự án; có thể bỏ qua nếu chỉ cần phân tích CSV.</span><a className="secondary-action" href={`/?projectId=${encodeURIComponent(projectId)}&action=import&source=csv&question=${encodeURIComponent(selectedResearchQuestion(project))}`}>Nhập câu trả lời vào PO Hub</a></div></div><details className="workspace-prompt-source"><summary>Xem yêu cầu đã sao chép</summary><textarea aria-label="Yêu cầu nghiên cứu cho ChatGPT" rows={8} readOnly value={prompt} onFocus={(event) => event.currentTarget.select()} /><button type="button" className="text-button workspace-prompt-copy" onClick={() => void copyGeneratedPrompt()}>Sao chép lại yêu cầu</button></details></section>}
    </>}
  </div>;
}
