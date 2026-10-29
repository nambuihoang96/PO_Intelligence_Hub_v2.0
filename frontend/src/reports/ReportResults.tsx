import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { reportApi, type BenchmarkSelection, type BenchmarkWorkspace, type BenchmarkWorkspaceEntry, type ImportedReport, type ResearchData } from './api';
import { extractHeadings, MarkdownReport } from './MarkdownReport';
import { extractReadableReport } from './readableReport';
import { buildStructuringPrompt } from './researchPrompt';
import { findingIcon, ResultsIcon, type ResultsIconName } from '../ui/ResultsIcon';
import { ResearchTextHighlighter } from './ResearchTextHighlighter';
import { quantitativeStateLabels, selectQuantitativeState } from './quantitativeState';
import type { QuantitativeDataset } from './api';
import { QuantitativeDatasetImport } from './QuantitativeDatasetImport';
import { QuantitativeEvidence } from './QuantitativeEvidence';
import { AnalyticsDataSelection } from './AnalyticsDataSelection';
import type { AnalyticsRecord } from './analyticsSelection';
import { QuantitativeDatasetExplorer } from './QuantitativeDatasetExplorer';
import { ProjectJourneyNav } from '../research/ProjectJourneyNav';

type Tab = 'overview' | 'insights' | 'entities' | 'benchmark' | 'decisions' | 'evidence' | 'report';
const resultTabs: Tab[] = ['overview', 'insights', 'entities', 'benchmark', 'decisions', 'evidence', 'report'];
type WorkspaceSaveState = 'saved' | 'unsaved' | 'saving' | 'failed';

function excerptAtLocations(content: string, locations: string[]): string[] {
  const lines = content.split(/\r?\n/);
  return [...new Set(locations.flatMap((location) => {
    const match = /^line:(\d+)$/.exec(location);
    if (!match) return [];
    const line = Number(match[1]);
    if (line < 1 || line > lines.length) return [];
    return [`${location}: ${lines[line - 1]}`];
  }))];
}

function sourceLocationLabel(location: string | null | undefined): string {
  if (!location) return 'Vị trí chưa được nêu';
  const line = /^line:(\d+)$/i.exec(location.trim());
  return line ? `Vị trí trong báo cáo · dòng ${line[1]}` : location;
}

function isUnavailableFixtureUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLocaleLowerCase().endsWith('.invalid');
  } catch {
    return false;
  }
}

function blankWorkspace(): BenchmarkWorkspace { return { custom_dimensions: [], entries: [] }; }
function displayReportGeo(value: string | null | undefined): string {
  if (!value?.trim()) return 'Chưa xác định thị trường';
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === 'global / not specified') return 'Toàn cầu · chưa chỉ định';
  if (normalized === 'global' || normalized === 'worldwide') return 'Toàn cầu';
  if (normalized === 'unknown') return 'Chưa xác định thị trường';
  return value;
}
function displayReportEnvironment(value: string | null | undefined): string {
  if (!value?.trim() || value.trim().toLocaleLowerCase() === 'unknown') return 'Chưa xác định môi trường';
  if (value.trim().toLocaleLowerCase() === 'both') return 'Nhiều nền tảng';
  return value;
}

function displayResearchType(value: string): string {
  const readable = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return readable ? readable[0].toLocaleUpperCase() + readable.slice(1) : 'Phát hiện nghiên cứu';
}

function OverviewHeading({ icon, eyebrow, title, detail }: { icon: ResultsIconName; eyebrow: string; title: string; detail?: string }) {
  return <div className="overview-heading-title"><span className="results-icon-frame"><ResultsIcon name={icon} /></span><div><span className="field-label">{eyebrow}</span><h3>{title}{detail && <small aria-hidden="true">{detail}</small>}</h3></div></div>;
}

function includeSelectedEntries(workspace: BenchmarkWorkspace, selections: BenchmarkSelection[]): BenchmarkWorkspace {
  const entries = [...workspace.entries];
  for (const item of selections) {
    if (!entries.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key)) entries.push({ ...item, po_assessment: '', notes: '', next_action: '', dimension_assessments: {}, observation_finding_links: {} });
  }
  return { ...workspace, entries };
}

function preserveLocalBenchmarkDraft(server: BenchmarkWorkspace, local: BenchmarkWorkspace): BenchmarkWorkspace {
  const localEntries = new Map(local.entries.map((entry) => [`${entry.item_type}:${entry.item_key}`, entry]));
  const serverEntries = server.entries.map((entry) => {
    const draft = localEntries.get(`${entry.item_type}:${entry.item_key}`);
    if (!draft) return entry;
    localEntries.delete(`${entry.item_type}:${entry.item_key}`);
    return {
      ...entry,
      po_assessment: draft.po_assessment,
      notes: draft.notes,
      next_action: draft.next_action,
      dimension_assessments: draft.dimension_assessments,
      observation_finding_links: draft.observation_finding_links,
    };
  });
  return {
    custom_dimensions: [...new Set([...server.custom_dimensions, ...local.custom_dimensions])],
    entries: [...serverEntries, ...localEntries.values()],
  };
}

function workspaceFingerprint(workspace: BenchmarkWorkspace): string {
  const sortRecord = (value: Record<string, string | string[]> = {}) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  const entries = [...workspace.entries].filter((entry) => Boolean(entry.po_assessment || entry.notes || entry.next_action || Object.keys(entry.dimension_assessments || {}).length || Object.keys(entry.observation_finding_links || {}).length)).map((entry) => ({
    ...entry,
    dimension_assessments: sortRecord(entry.dimension_assessments),
    observation_finding_links: sortRecord(entry.observation_finding_links ?? {}),
  })).sort((a, b) => `${a.item_type}:${a.item_key}`.localeCompare(`${b.item_type}:${b.item_key}`));
  return JSON.stringify({ custom_dimensions: workspace.custom_dimensions, entries });
}

export function ReportViewer({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<ImportedReport | null>(null);
  const [quantitativeDatasets, setQuantitativeDatasets] = useState<QuantitativeDataset[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [workspaceSaveState, setWorkspaceSaveState] = useState<WorkspaceSaveState>('saved');
  const [workspaceSaveError, setWorkspaceSaveError] = useState('');
  const [tab, setTab] = useState<Tab>(() => {
    const requested = new URLSearchParams(window.location.search).get('section') as Tab | null;
    return requested && resultTabs.includes(requested) ? requested : 'overview';
  });
  const [quantEvidenceIndex, setQuantEvidenceIndex] = useState<number | null>(null);
  const [quantEvidenceTarget, setQuantEvidenceTarget] = useState<string | null>(null);
  const [csvEvidenceExpanded, setCsvEvidenceExpanded] = useState(false);
  const [structureResponse, setStructureResponse] = useState('');
  const [structurePrompt, setStructurePrompt] = useState('');
  const [quantitativeStructuringOpen, setQuantitativeStructuringOpen] = useState(false);
  const [workspace, setWorkspace] = useState<BenchmarkWorkspace>(blankWorkspace());
  const [newDimension, setNewDimension] = useState('');
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [activeEntity, setActiveEntity] = useState<string | null>(null);
  const [entityReturnFinding, setEntityReturnFinding] = useState<string | null>(null);
  const [benchmarkFocusEntity, setBenchmarkFocusEntity] = useState<string | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [takeawaysExpanded, setTakeawaysExpanded] = useState(false);
  const [gapsExpanded, setGapsExpanded] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapFocusedFinding, setMapFocusedFinding] = useState<string | null>(null);
  const [activeAssessment, setActiveAssessment] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<Record<string, 'adding' | 'removing'>>({});
  const [itemFeedback, setItemFeedback] = useState<Record<string, { kind: 'success' | 'error'; text: string; diagnostics?: string }>>({});
  const reportRef = useRef<ImportedReport | null>(null);
  const workspaceRef = useRef<BenchmarkWorkspace>(blankWorkspace());
  const confirmedWorkspaceRef = useRef<BenchmarkWorkspace>(blankWorkspace());
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mutationSequenceRef = useRef(0);
  const latestItemMutationRef = useRef<Record<string, number>>({});
  const reportLoadSequenceRef = useRef(0);
  const readableReport = useMemo(() => extractReadableReport(report?.content ?? ''), [report?.content]);
  const headings = useMemo(() => extractHeadings(readableReport.markdown), [readableReport.markdown]);
  const imported = new URLSearchParams(window.location.search).has('imported');

  useEffect(() => {
    let active = true;
    const loadSequence = ++reportLoadSequenceRef.current;
    setQuantitativeDatasets([]);
    reportApi.get(reportId).then((value) => {
      if (!active || loadSequence !== reportLoadSequenceRef.current) return;
      const initialWorkspace = includeSelectedEntries(value.benchmark_workspace || blankWorkspace(), value.benchmark_selections);
      confirmedWorkspaceRef.current = initialWorkspace;
      applyLocalState(value, initialWorkspace);
      setWorkspaceSaveState('saved');
      (async () => {
        const datasets: QuantitativeDataset[] = [];
        let cursor: string | undefined;
        do {
          const page = await reportApi.listQuantitativeDatasets(value.id, cursor);
          datasets.push(...(Array.isArray(page.items) ? page.items : []));
          cursor = page.next_cursor || undefined;
        } while (cursor);
        if (active && loadSequence === reportLoadSequenceRef.current) setQuantitativeDatasets(datasets);
      })().catch(() => {
        // Report reading remains available if this optional foundation endpoint is offline.
      });
    }).catch((reason: unknown) => { if (active && loadSequence === reportLoadSequenceRef.current) setError(reason instanceof Error ? reason.message : 'Không mở được báo cáo.'); }).finally(() => { if (active && loadSequence === reportLoadSequenceRef.current) setLoading(false); });
    return () => { active = false; };
  }, [reportId]);

  useEffect(() => {
    if (tab !== 'evidence' || !quantEvidenceTarget) return;
    document.getElementById(quantEvidenceTarget)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [tab, quantEvidenceIndex, quantEvidenceTarget]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedWorkspace()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [reportId]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === 'overview') url.searchParams.delete('section');
    else url.searchParams.set('section', tab);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [tab]);

  function hasUnsavedWorkspace(): boolean {
    return workspaceFingerprint(workspaceRef.current) !== workspaceFingerprint(confirmedWorkspaceRef.current);
  }

  function updateWorkspaceSaveCheckpoint(serverWorkspace: BenchmarkWorkspace) {
    confirmedWorkspaceRef.current = serverWorkspace;
    setWorkspaceSaveState(workspaceFingerprint(workspaceRef.current) === workspaceFingerprint(serverWorkspace) ? 'saved' : 'unsaved');
  }

  function applyLocalState(nextReport: ImportedReport, nextWorkspace: BenchmarkWorkspace) {
    reportRef.current = nextReport;
    workspaceRef.current = nextWorkspace;
    setReport(nextReport);
    setWorkspace(nextWorkspace);
  }

  async function applyReportUpdate(action: () => Promise<ImportedReport>, successMessage: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await action();
      applyLocalState(updated, preserveLocalBenchmarkDraft(updated.benchmark_workspace || blankWorkspace(), workspaceRef.current));
      setNotice(successMessage);
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không cập nhật được báo cáo.'); return false; }
    finally { setBusy(false); }
  }

  async function reprocess() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await reportApi.reprocess(reportId);
      applyLocalState(result, preserveLocalBenchmarkDraft(result.benchmark_workspace || blankWorkspace(), workspaceRef.current)); setNotice(result.message);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể xử lý lại báo cáo.'); }
    finally { setBusy(false); }
  }

  async function copyStructuringPrompt() {
    if (!report) return;
    const prompt = buildStructuringPrompt(report);
    setStructurePrompt(prompt);
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice('Prompt chuẩn hóa đã được sao chép. Gửi vào ChatGPT Plus, rồi dán toàn bộ câu trả lời vào ô bên dưới.');
    } catch {
      setNotice('Sao chép tự động không khả dụng. Prompt đầy đủ đang hiển thị để bạn sao chép.');
    }
  }

  async function prepareChartData() {
    setQuantitativeStructuringOpen(true);
    await copyStructuringPrompt();
    window.setTimeout(() => document.querySelector('.structuring-callout')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  async function applyStructuringResponse() {
    if (!structureResponse.trim()) { setError('Dán toàn bộ câu trả lời ChatGPT có payload po_research_v1.'); return; }
    const updated = await applyReportUpdate(() => reportApi.structureFromResponse(reportId, structureResponse), 'Đã cấu trúc báo cáo. Báo cáo gốc, Benchmark và PO notes được giữ nguyên.');
    if (updated) setStructureResponse('');
  }

  async function toggleSelection(item: BenchmarkSelection) {
    const current = reportRef.current;
    const key = `${item.item_type}:${item.item_key}`;
    if (!current) return;
    const exists = current.benchmark_selections.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key);
    const selections = exists ? current.benchmark_selections.filter((entry) => entry.item_type !== item.item_type || entry.item_key !== item.item_key) : [...current.benchmark_selections, item];
    // Workspace entries are intentionally retained when membership changes so PO notes can be restored.
    const nextWorkspace = includeSelectedEntries(workspaceRef.current, selections);
    const optimistic = { ...current, benchmark_selections: selections };
    applyLocalState(optimistic, nextWorkspace);
    const sequence = ++mutationSequenceRef.current;
    latestItemMutationRef.current[key] = sequence;
    setPendingItems((values) => ({ ...values, [key]: exists ? 'removing' : 'adding' }));
    setItemFeedback((values) => { const next = { ...values }; delete next[key]; return next; });
    mutationQueueRef.current = mutationQueueRef.current.then(async () => {
      try {
        const saved = await reportApi.updateBenchmarkState(current.id, selections, nextWorkspace);
        if (sequence === mutationSequenceRef.current) {
          const serverWorkspace = includeSelectedEntries(saved.benchmark_workspace || blankWorkspace(), saved.benchmark_selections);
          const mergedWorkspace = preserveLocalBenchmarkDraft(serverWorkspace, workspaceRef.current);
          confirmedWorkspaceRef.current = serverWorkspace;
          applyLocalState(saved, mergedWorkspace);
          updateWorkspaceSaveCheckpoint(serverWorkspace);
        }
        if (latestItemMutationRef.current[key] === sequence) setItemFeedback((values) => ({ ...values, [key]: { kind: 'success', text: exists ? 'Đã gỡ khỏi bảng so sánh. Ghi chú PO vẫn được giữ và có thể khôi phục.' : 'Đã thêm vào bảng so sánh.' } }));
      } catch (reason) {
        if (sequence === mutationSequenceRef.current) {
          try {
            const latest = await reportApi.get(current.id);
            const serverWorkspace = includeSelectedEntries(latest.benchmark_workspace || blankWorkspace(), latest.benchmark_selections);
            const mergedWorkspace = preserveLocalBenchmarkDraft(serverWorkspace, workspaceRef.current);
            confirmedWorkspaceRef.current = serverWorkspace;
            applyLocalState(latest, mergedWorkspace);
            updateWorkspaceSaveCheckpoint(serverWorkspace);
          } catch {
            setWorkspaceSaveState('unsaved');
            setWorkspaceSaveError('Chưa tải lại được trạng thái đã xác nhận từ máy chủ. Bản nháp PO vẫn còn trên trang này; hãy thử lưu lại khi kết nối hoạt động.');
          }
        }
        if (latestItemMutationRef.current[key] === sequence) {
          const failure = reason as Error & { diagnostics?: string };
          setItemFeedback((values) => ({ ...values, [key]: { kind: 'error', text: reason instanceof Error ? reason.message : 'Không cập nhật được bảng so sánh. Hãy thử lại.', diagnostics: failure?.diagnostics } }));
        }
      } finally {
        if (latestItemMutationRef.current[key] === sequence) setPendingItems((values) => { const next = { ...values }; delete next[key]; return next; });
      }
    });
  }

  function changeEntry(item: BenchmarkSelection, field: keyof Pick<BenchmarkWorkspaceEntry, 'po_assessment' | 'notes' | 'next_action'>, value: string) {
    updateWorkspace((current) => ({ ...current, entries: current.entries.map((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key ? { ...entry, [field]: value } : entry) }));
  }

  function changeDimensionAssessment(item: BenchmarkSelection, dimensionKey: string, value: string) {
    updateWorkspace((current) => ({ ...current, entries: current.entries.map((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key ? { ...entry, dimension_assessments: { ...entry.dimension_assessments, [dimensionKey]: value } } : entry) }));
  }

  function updateWorkspace(updater: (current: BenchmarkWorkspace) => BenchmarkWorkspace) {
    const next = updater(workspaceRef.current);
    workspaceRef.current = next;
    setWorkspace(next);
    setWorkspaceSaveState(workspaceFingerprint(next) === workspaceFingerprint(confirmedWorkspaceRef.current) ? 'saved' : 'unsaved');
    setWorkspaceSaveError('');
  }

  function updateObservationFindingLink(item: BenchmarkSelection, dimensionKey: string, findingKey: string) {
    const next = {
      ...workspaceRef.current,
      entries: workspaceRef.current.entries.map((entry) => {
        if (entry.item_type !== item.item_type || entry.item_key !== item.item_key) return entry;
        const links = { ...(entry.observation_finding_links ?? {}) };
        if (findingKey) links[dimensionKey] = [findingKey];
        else delete links[dimensionKey];
        return { ...entry, observation_finding_links: links };
      }),
    };
    updateWorkspace(() => next);
    void saveWorkspace(next);
  }

  async function saveWorkspace(next?: BenchmarkWorkspace) {
    if (!reportRef.current) return;
    const snapshot = next || workspaceRef.current;
    const sequence = ++mutationSequenceRef.current;
    setWorkspaceSaveState('saving');
    setWorkspaceSaveError('');
    const persist = mutationQueueRef.current.then(async () => {
      const current = reportRef.current;
      if (!current) return;
      try {
        const updated = await reportApi.updateBenchmarkState(current.id, current.benchmark_selections, snapshot);
        if (sequence === mutationSequenceRef.current) {
          const serverWorkspace = updated.benchmark_workspace || snapshot;
          const mergedWorkspace = preserveLocalBenchmarkDraft(serverWorkspace, workspaceRef.current);
          confirmedWorkspaceRef.current = serverWorkspace;
          applyLocalState(updated, mergedWorkspace);
          updateWorkspaceSaveCheckpoint(serverWorkspace);
          setWorkspaceSaveError('');
          if (workspaceFingerprint(mergedWorkspace) === workspaceFingerprint(serverWorkspace)) setNotice(current.project_id ? 'Đã lưu ghi chú báo cáo.' : 'Đã lưu đánh giá của PO, ghi chú và việc tiếp theo.');
        }
      } catch (reason) {
        if (sequence === mutationSequenceRef.current) {
          const message = reason instanceof Error ? reason.message : 'Không lưu được PO work. Hãy thử lại.';
          try {
            const latest = await reportApi.get(current.id);
            if (sequence === mutationSequenceRef.current) {
              const serverWorkspace = includeSelectedEntries(latest.benchmark_workspace || blankWorkspace(), latest.benchmark_selections);
              const mergedWorkspace = preserveLocalBenchmarkDraft(serverWorkspace, workspaceRef.current);
              confirmedWorkspaceRef.current = serverWorkspace;
              applyLocalState(latest, mergedWorkspace);
            }
          } catch { /* Keep the local draft and latest confirmed selection when reconciliation is unavailable. */ }
          if (sequence === mutationSequenceRef.current) {
            setWorkspaceSaveState('failed');
            setWorkspaceSaveError(message);
          }
        }
      }
    });
    mutationQueueRef.current = persist.then(() => undefined);
    await persist;
  }

  async function addCustomDimension() {
    const value = newDimension.trim();
    if (!value || workspace.custom_dimensions.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    const next = { ...workspaceRef.current, custom_dimensions: [...workspaceRef.current.custom_dimensions, value] };
    updateWorkspace(() => next);
    setNewDimension('');
    await saveWorkspace(next);
  }

  if (loading) return <section className="research-panel report-view-state" role="status">Đang mở kết quả nghiên cứu…</section>;
  if (error && !report) return <section className="research-panel report-view-state"><div className="research-alert" role="alert">{error}</div><a className="primary-action" href="/">Quay lại Nghiên cứu</a></section>;
  if (!report) return null;

  const reportsLibraryHref = report.project_id
    ? `/reports?projectId=${encodeURIComponent(report.project_id)}`
    : new URLSearchParams(window.location.search).get('from') === 'unassigned' ? '/reports?unassigned=1' : '/reports';
  const projectHomeHref = report.project_id ? `/research?projectId=${encodeURIComponent(report.project_id)}` : '/research';
  const data = report.research_data;
  const researchStatus = report.research_status || (report.parse_status === 'PARSED' ? 'STRUCTURED_READY' : 'TEXT_ONLY');
  const keyTakeaways = data.key_takeaways ?? [];
  const hasStructured = Boolean(data.executive_summary || keyTakeaways.length || data.findings.length + data.entities.length + data.benchmark_dimensions.length + data.research_gaps.length + data.po_recommendations.length + (data.quantitative_observations?.length || 0) > 0);
  const hasSnapshotData = data.findings.length + data.entities.length + data.evidence_references.length + data.research_gaps.length > 0;
  const assessmentItems: { item: BenchmarkSelection; label: string; kind: string }[] = [
    ...data.findings.map((finding) => ({ item: { item_type: 'finding' as const, item_key: finding.key }, label: finding.title, kind: displayResearchType(finding.finding_type) })),
    ...data.entities.map((entity) => ({ item: { item_type: 'entity' as const, item_key: entity.key }, label: entity.name, kind: displayResearchType(entity.entity_type) })),
    ...data.benchmark_dimensions.map((dimension) => ({ item: { item_type: 'dimension' as const, item_key: dimension.key }, label: dimension.name, kind: 'Khía cạnh nghiên cứu' })),
    ...workspace.entries.filter((entry) => !data.findings.some((finding) => finding.key === entry.item_key) && !data.entities.some((entity) => entity.key === entry.item_key) && !data.benchmark_dimensions.some((dimension) => dimension.key === entry.item_key)).map((entry) => ({ item: { item_type: entry.item_type, item_key: entry.item_key }, label: entry.item_key, kind: 'Mục đã lưu trong không gian làm việc' })),
  ];
  const tabs: { id: Tab; label: string; icon: ResultsIconName; visible: boolean }[] = [
    { id: 'overview', label: 'Tổng quan', icon: 'snapshot', visible: true },
    { id: 'insights', label: 'Phát hiện', icon: 'findings', visible: data.findings.length > 0 },
    { id: 'entities', label: 'Đối tượng', icon: 'entity', visible: data.entities.length > 0 },
    { id: 'benchmark', label: 'So sánh', icon: 'comparison', visible: data.entities.length + data.findings.length + data.benchmark_dimensions.length > 0 || report.benchmark_selections.length > 0 },
    { id: 'decisions', label: report.project_id ? 'Ghi chú báo cáo' : 'Đánh giá của PO', icon: 'decision', visible: assessmentItems.length > 0 || workspace.entries.length > 0 || data.po_recommendations.length > 0 },
    { id: 'evidence', label: 'Bằng chứng', icon: 'evidence', visible: data.evidence_references.length > 0 },
    { id: 'report', label: 'Báo cáo đầy đủ', icon: 'reports', visible: true },
  ];
  const visibleTabs = tabs.filter((item) => item.visible);
  const selected = report.benchmark_selections;
  const selectedFindings = selected.filter((item) => item.item_type === 'finding').flatMap((item) => {
    const finding = data.findings.find((entry) => entry.key === item.item_key);
    return finding ? [{ selection: item, finding }] : [];
  });
  const selectedEntityKeys = new Set(selected.filter((item) => item.item_type === 'entity').map((item) => item.item_key));
  const selectedEntityRows = data.entities.filter((item) => selectedEntityKeys.has(item.key));
  const selectedDimensions = selected.filter((item) => item.item_type === 'dimension').flatMap((selection) => {
    const dimension = data.benchmark_dimensions.find((entry) => entry.key === selection.item_key);
    return dimension ? [{ selection, dimension }] : [];
  });
  const legacyDimensions = data.benchmark_dimensions.filter((dimension) => Boolean(dimension.po_notes) || selected.some((item) => item.item_type === 'dimension' && item.item_key === dimension.key) || workspace.entries.some((entry) => entry.item_type === 'dimension' && entry.item_key === dimension.key));
  const orphanedDimensionEntries = workspace.entries.filter((entry) => entry.item_type === 'dimension' && !data.benchmark_dimensions.some((dimension) => dimension.key === entry.item_key));
  const orphanedDimensionKeys = [...new Set([...orphanedDimensionEntries.map((entry) => entry.item_key), ...selected.filter((item) => item.item_type === 'dimension' && !data.benchmark_dimensions.some((dimension) => dimension.key === item.item_key)).map((item) => item.item_key)])];
  const inactiveWorkspaceEntries = workspace.entries.filter((entry) => entry.item_type !== 'dimension' && !selected.some((item) => item.item_type === entry.item_type && item.item_key === entry.item_key) && Boolean(entry.po_assessment || entry.notes || entry.next_action || Object.keys(entry.dimension_assessments || {}).length || Object.keys(entry.observation_finding_links || {}).length));
  const dimensions = [...data.benchmark_dimensions.map((dimension) => ({ key: dimension.key, name: dimension.name, custom: false })), ...workspace.custom_dimensions.map((name) => ({ key: `po:${name}`, name, custom: true }))];
  const savedPoEntries = confirmedWorkspaceRef.current.entries.filter((entry) => Boolean(entry.po_assessment.trim() || entry.notes.trim() || entry.next_action.trim()));
  const selectedEntityCount = selected.filter((item) => item.item_type === 'entity').length;

  function isSelected(item: BenchmarkSelection): boolean {
    return selected.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key);
  }

  function selectionId(item: BenchmarkSelection): string { return `${item.item_type}:${item.item_key}`; }

  function openPoAssessment(item: BenchmarkSelection) {
    if (!workspaceRef.current.entries.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key)) {
      updateWorkspace((current) => includeSelectedEntries(current, [item]));
    }
    setActiveAssessment(selectionId(item));
    setTab('decisions');
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const buttonCount = visibleTabs.length;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttonCount;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + buttonCount) % buttonCount;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = buttonCount - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = visibleTabs[nextIndex];
    const nextButton = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex];
    setTab(nextTab.id);
    nextButton?.focus();
  }

  function benchmarkAction(item: BenchmarkSelection, label?: string) {
    const id = selectionId(item);
    const pending = pendingItems[id];
    const feedback = itemFeedback[id];
    const isActive = isSelected(item);
    const hasSavedEntry = workspace.entries.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key);
    const actionText = isActive ? 'Gỡ khỏi so sánh' : hasSavedEntry ? 'Khôi phục vào so sánh' : 'Thêm vào so sánh';
    return <div className="benchmark-card-actions">
      <button className={isActive ? 'text-button' : 'secondary-action'} aria-label={`${actionText}${label ? `: ${label}` : ''}`} onClick={() => void toggleSelection(item)}>{pending ? (pending === 'adding' ? 'Đang thêm…' : 'Đang gỡ…') : actionText}</button>
      {isActive && <button className="text-button" onClick={() => setTab('benchmark')}>Mở bảng so sánh</button>}
      {feedback && <span className={feedback.kind === 'error' ? 'inline-action-error' : 'inline-action-success'} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}{feedback.diagnostics && <details className="inline-diagnostics"><summary>Chi tiết kỹ thuật</summary><code>{feedback.diagnostics}</code></details>}</span>}
    </div>;
  }

  function relatedEntityCandidates(finding: ResearchData['findings'][number]) {
    const candidates = data.entities.filter((entity) => finding.related_entities.includes(entity.key));
    if (!candidates.length) return null;
    return <section className="related-entity-candidates"><h5>Đối tượng nghiên cứu liên quan</h5><p>Chỉ chọn những đối tượng bạn muốn so sánh. Loại nghiên cứu không tự xác định một mục có phải là sản phẩm hay không.</p><ul>{candidates.map((entity) => {
      const attributes = Object.entries(entity.attributes).filter(([, value]) => value !== null && value !== undefined && value !== '');
      const descriptionEntry = attributes.find(([key]) => ['description', 'summary', 'context'].includes(key.toLocaleLowerCase()));
      const technicalAttributes = attributes.filter(([key]) => key !== descriptionEntry?.[0]);
      const description = descriptionEntry?.[1];
      const descriptionText = typeof description === 'string' ? description : description ? JSON.stringify(description) : '';
      return <li key={entity.key}>
        <div className="related-entity-copy"><div className="related-entity-heading"><strong>{entity.name}</strong><span>{entity.entity_type}</span></div>
          {descriptionText && <p>{descriptionText}</p>}
          {technicalAttributes.length > 0 && <details className="related-entity-attributes"><summary>Xem thuộc tính bổ sung ({technicalAttributes.length})</summary><dl>{technicalAttributes.map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></details>}
        </div>
        <div className="related-entity-action"><button className="text-button" onClick={() => { setEntityReturnFinding(finding.key); setActiveEntity(entity.key); setTab('entities'); }}>Mở hồ sơ đối tượng <ResultsIcon name="arrow" /></button>{benchmarkAction({ item_type: 'entity', item_key: entity.key }, entity.name)}</div>
      </li>;
    })}</ul></section>;
  }

  function scopeLabel(scope: Record<string, unknown>): string {
    const labels: Record<string, string> = { geo: 'GEO', environment: 'Môi trường', platform: 'Nền tảng', os: 'Hệ điều hành', period: 'Thời gian nghiên cứu', research_period: 'Thời gian nghiên cứu', time_period: 'Giai đoạn', date_range: 'Khoảng ngày', region: 'Khu vực', country: 'Quốc gia', segment: 'Phân khúc', language: 'Ngôn ngữ', currency: 'Tiền tệ' };
    return Object.entries(scope).flatMap(([key, value]) => {
      if (value === null || value === undefined || value === '') return [];
      if (Array.isArray(value) && value.length === 0) return [];
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) return [];
      const readableValue = Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
      return [`${labels[key.toLocaleLowerCase()] ?? key.replaceAll('_', ' ')}: ${readableValue}`];
    }).join(' · ');
  }

  function poAssessmentFields(item: BenchmarkSelection, label: string) {
    const entry = workspace.entries.find((candidate) => candidate.item_type === item.item_type && candidate.item_key === item.item_key);
    if (!entry) return null;
    return <div className="benchmark-po-fields">
      {item.item_type === 'dimension' && Object.entries(entry.dimension_assessments || {}).filter(([dimension]) => !workspace.custom_dimensions.includes(dimension)).map(([dimension, value]) => <label className="intake-field legacy-dimension-assessment" key={dimension}><span className="field-label">Đánh giá chiều dữ liệu cũ · {dimension}</span><textarea aria-label={`Đánh giá chiều dữ liệu cũ ${dimension} cho ${label}`} value={value} onChange={(event) => changeDimensionAssessment(item, dimension, event.target.value)} /></label>)}
      {workspace.custom_dimensions.map((dimension) => <label className="intake-field" key={dimension}><span className="field-label">{dimension}</span><textarea aria-label={`Đánh giá ${dimension} cho ${label}`} value={entry.dimension_assessments?.[dimension] || ''} onChange={(event) => changeDimensionAssessment(item, dimension, event.target.value)} /></label>)}
      <label className="intake-field"><span className="field-label">{report?.project_id ? 'Nhận định cho báo cáo' : 'Đánh giá của PO'}</span><textarea aria-label={`${report?.project_id ? 'Nhận định cho báo cáo' : 'Đánh giá của PO'} cho ${label}`} value={entry.po_assessment} onChange={(event) => changeEntry(item, 'po_assessment', event.target.value)} /></label>
      <label className="intake-field"><span className="field-label">{report?.project_id ? 'Ghi chú báo cáo' : 'Ghi chú'}</span><textarea aria-label={`${report?.project_id ? 'Ghi chú báo cáo' : 'Ghi chú'} cho ${label}`} value={entry.notes} onChange={(event) => changeEntry(item, 'notes', event.target.value)} /></label>
      <label className="intake-field"><span className="field-label">{report?.project_id ? 'Bước tiếp theo trong ghi chú' : 'Việc tiếp theo'}</span><textarea aria-label={`${report?.project_id ? 'Bước tiếp theo trong ghi chú' : 'Việc tiếp theo'} cho ${label}`} value={entry.next_action} onChange={(event) => changeEntry(item, 'next_action', event.target.value)} /></label>
    </div>;
  }

  function supportingFindings(entityKey: string, dimensionKey: string): string[] {
    const entry = workspace.entries.find((candidate) => candidate.item_type === 'entity' && candidate.item_key === entityKey);
    return entry?.observation_finding_links?.[dimensionKey] ?? [];
  }

  function observation(item: BenchmarkSelection, dimensionKey: string): { value: unknown; urls: string[]; status: string; uncertainty: string | null } | null {
    const dimension = data.benchmark_dimensions.find((entry) => entry.key === dimensionKey);
    if (!dimension) return null;
    if (item.item_type === 'entity') {
      const matches = dimension.observations.filter((entry) => entry.entity_key === item.item_key);
      const usable = matches.filter((entry) => entry.value !== null && entry.value !== undefined && entry.value !== '');
      if (usable.length) return { value: usable.map((entry) => typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)).join('; '), urls: [...new Set(usable.flatMap((entry) => entry.evidence_references))], status: [...new Set(usable.map((entry) => entry.evidence_status))].join(', '), uncertainty: usable.map((entry) => entry.uncertainty).filter(Boolean).join('; ') || null };
    }
    return null;
  }

  function confirmWorkspaceNavigation(event: { preventDefault: () => void }) {
    if (hasUnsavedWorkspace() && !window.confirm('PO draft có thay đổi chưa lưu. Rời trang sẽ làm mất thay đổi này. Bạn có muốn tiếp tục không?')) event.preventDefault();
  }

  function findingMetrics(findingKey: string): { dimension: string; value: string; urls: string[] }[] {
    return data.benchmark_dimensions.flatMap((dimension) => dimension.observations
      .filter((observation) => observation.entity_key && supportingFindings(observation.entity_key, dimension.key).includes(findingKey) && observation.value !== null && observation.value !== undefined && observation.value !== '')
      .map((observation) => ({ dimension: dimension.name, value: typeof observation.value === 'string' ? observation.value : JSON.stringify(observation.value), urls: observation.evidence_references })));
  }

  const activeDecisionItem = assessmentItems.find(({ item }) => selectionId(item) === activeAssessment) ?? assessmentItems.find(({ item }) => workspace.entries.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key));
  const selectedFindingKey = activeFinding ?? data.findings[0]?.key ?? null;
  const selectedFinding = data.findings.find((finding) => finding.key === selectedFindingKey) ?? null;
  const selectedEntityKey = activeEntity ?? data.entities[0]?.key ?? null;
  const selectedEntity = data.entities.find((entity) => entity.key === selectedEntityKey) ?? null;
  const visibleMapFindings = mapFocusedFinding
    ? data.findings.filter((finding) => finding.key === mapFocusedFinding)
    : mapExpanded ? data.findings : data.findings.slice(0, 3);
  const quantitativeState = selectQuantitativeState(data.quantitative_observations ?? [], quantitativeDatasets, { geo: report.geo, platform: report.os });
  const reportQuantitativeRows = (data.quantitative_observations ?? []).filter((row) => row.observation_type === 'reported');
  const linkedQuantitativeRows = quantitativeDatasets.reduce((count, dataset) => count + dataset.observations.length, 0);
  const hasQuantitativeObservations = reportQuantitativeRows.length + linkedQuantitativeRows > 0;
  const projectDataHref = report.project_id ? `/research?projectId=${encodeURIComponent(report.project_id)}&view=data#project-csv-data` : null;

  function viewQuantitativeEvidence(record: AnalyticsRecord) {
    if (record.source === 'research_report') {
      setQuantEvidenceIndex(record.index);
      setQuantEvidenceTarget(`quant-observation-${record.index}`);
    } else {
      setQuantEvidenceIndex(null);
      setQuantEvidenceTarget(`quant-dataset-summary-observation-${record.sourceId}-${record.index}`);
      setCsvEvidenceExpanded(true);
    }
    setTab('evidence');
  }

  return <article className="report-viewer">
    {report.project_id && <ProjectJourneyNav projectId={report.project_id} active="report" />}
    {imported && <div className="research-success" role="status">{new URLSearchParams(window.location.search).has('duplicate') ? 'Báo cáo đã tồn tại được mở từ lịch sử; dữ liệu gốc được giữ nguyên.' : 'Đã nhập báo cáo.'}</div>}
    <header className="research-panel report-meta results-header">
      <div className="results-breadcrumb"><a href={projectHomeHref} onClick={confirmWorkspaceNavigation}>Dự án</a><span aria-hidden="true">›</span><a href={reportsLibraryHref} onClick={confirmWorkspaceNavigation}>Báo cáo</a><span aria-hidden="true">›</span><span>{report.question}</span></div>
      <div className="results-title-row"><div className="results-title-copy"><span className="field-label">BÁO CÁO NGHIÊN CỨU · NHẬP LÚC {new Date(report.imported_at).toLocaleString('vi-VN')}</span><h2>{report.question}</h2><p className="results-context"><span>{displayReportGeo(report.geo)}</span><span>{displayReportEnvironment(report.os)}</span>{report.research_period && <span>{report.research_period}</span>}<span>{report.origin === 'chatgpt_user_import' ? 'Nhập từ ChatGPT' : report.origin}</span></p></div><div className="results-header-actions"><span className={`results-status${researchStatus === 'TEXT_ONLY' ? ' is-text-only' : ''}`}>{researchStatus === 'STRUCTURED_READY' ? 'Đã có kết quả có cấu trúc' : researchStatus === 'STRUCTURED_PARTIAL' ? 'Kết quả có cấu trúc một phần' : 'Chỉ có báo cáo văn bản'}</span><a className="text-button results-back-link" href={reportsLibraryHref} onClick={confirmWorkspaceNavigation}>← Về thư viện báo cáo</a></div></div>
    </header>
    <section className={`quantitative-foundation${hasQuantitativeObservations ? ' has-observations' : ' is-qualitative'}`} aria-label="Nguồn dữ liệu">
      <div className="quant-data-compact"><span className={`quant-state quant-state-${quantitativeState.state}`}>{hasQuantitativeObservations ? quantitativeStateLabels[quantitativeState.state] : 'Nghiên cứu định tính · Chưa liên kết bộ dữ liệu định lượng'}</span>{projectDataHref && <a className="quant-data-manage-link" href={projectDataHref}>Quản lý dữ liệu</a>}<details className="quant-data-details"><summary>{hasQuantitativeObservations ? 'Xem số liệu và nguồn' : projectDataHref ? 'Nhập dữ liệu gắn trực tiếp với báo cáo' : 'Quản lý dữ liệu định lượng'}</summary>
      <div className="quant-data-expanded"><div className="quant-data-heading"><strong>Nguồn dữ liệu của báo cáo</strong>{quantitativeDatasets.length > 0 && <a className="text-button" href={`/compare-periods${report.project_id ? `?projectId=${encodeURIComponent(report.project_id)}` : ''}`}>So sánh các tệp CSV</a>}</div>
      {(data.quantitative_observations ?? []).some((row) => row.observation_type === 'reported') && <p className="quant-data-summary">{data.quantitative_observations!.filter((row) => row.observation_type === 'reported').length} số liệu do báo cáo cung cấp · chưa xác minh độc lập. <button className="text-button" onClick={() => setTab('overview')}>Xem số liệu</button></p>}
      {quantitativeDatasets.map((dataset) => <QuantitativeDatasetExplorer key={dataset.id} dataset={dataset} reportScope={{ geo: report.geo, platform: report.os }} onRevalidated={(updated) => setQuantitativeDatasets((current) => current.map((item) => item.id === updated.id ? updated : item))} />)}
      {quantitativeState.reasons.length > 0 && <details><summary>Lý do và giới hạn</summary><ul>{quantitativeState.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>}
      <QuantitativeDatasetImport report={report} onImported={(dataset) => setQuantitativeDatasets((current) => [dataset, ...current.filter((item) => item.id !== dataset.id)])} />
      {hasQuantitativeObservations && <AnalyticsDataSelection reportId={report.id} observations={data.quantitative_observations ?? []} datasets={quantitativeDatasets} onViewEvidence={viewQuantitativeEvidence} onImportCsv={() => document.querySelector('.quantitative-foundation')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />}
      {!hasQuantitativeObservations && <p className="quant-data-qualitative-note">Báo cáo định tính vẫn dùng được độc lập. Số liệu chỉ xuất hiện khi được cung cấp và liên kết với báo cáo.</p>}
      </div></details></div>
    </section>
    {error && <div className="research-alert" role="alert">{error}</div>}{notice && <div className="research-success" role="status">{notice}</div>}
    {(report.orphaned_benchmark_selections?.length || report.orphaned_benchmark_entries?.length) ? <div className="research-alert" role="alert">Có {(report.orphaned_benchmark_selections?.length || 0) + (report.orphaned_benchmark_entries?.length || 0)} liên kết so sánh hoặc ghi chú PO đang tham chiếu tới mục không còn trong dữ liệu đã cấu trúc. Dữ liệu được giữ nguyên; mở tab So sánh để xem khi cần.</div> : null}
    <div className="report-reading-layout">
    <aside className="report-reading-index" aria-label="Điều hướng báo cáo">
      <span className="report-reading-eyebrow">TRONG BÁO CÁO</span>
      <nav className="report-tabs" aria-label="Các phần kết quả nghiên cứu" role="tablist">{visibleTabs.map((item, index) => <button id={`report-tab-${item.id}`} aria-controls="report-content" key={item.id} role="tab" aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? 'active' : ''} onKeyDown={(event) => handleTabKeyDown(event, index)} onClick={() => setTab(item.id)}><ResultsIcon name={item.icon} />{item.label}</button>)}</nav>
      {tab === 'report' && headings.length > 0 && <nav className="report-toc" aria-label="Mục lục báo cáo"><strong>Mục lục</strong><ol>{headings.map((heading, index) => <li key={`${heading.id}-${index}`} style={{ marginLeft: `${Math.max(0, heading.level - 1) * 8}px` }}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ol></nav>}
    </aside>
    <div className="report-reading-main" id="report-content" role="tabpanel" aria-labelledby={`report-tab-${tab}`} tabIndex={0}>
    {(!hasStructured || quantitativeStructuringOpen) && <details className="research-panel structuring-callout" open={quantitativeStructuringOpen} onToggle={(event) => setQuantitativeStructuringOpen(event.currentTarget.open)}><summary>{hasStructured ? 'Chuẩn bị dữ liệu biểu đồ từ báo cáo này' : 'Báo cáo văn bản · Bổ sung kết quả có cấu trúc'}</summary><p>Báo cáo gốc luôn được giữ nguyên. Chọn “Tạo prompt cho ChatGPT”, gửi vào ChatGPT Plus rồi dán toàn bộ câu trả lời vào đây và chọn “Cập nhật báo cáo”. Ứng dụng không tự chuyển văn bản hoặc ảnh biểu đồ thành số liệu; chỉ cấu trúc những số liệu được nêu trong nguồn. Ghi chú PO và lựa chọn so sánh vẫn được giữ lại.</p><div className="intake-actions"><button className="secondary-action" type="button" disabled={busy} onClick={reprocess}>Xử lý lại theo quy tắc hiện có</button><button className="secondary-action" type="button" disabled={busy} onClick={copyStructuringPrompt}>Tạo prompt cho ChatGPT</button></div>{structurePrompt && <label className="intake-field"><span className="field-label">Prompt cho ChatGPT Plus</span><textarea rows={10} readOnly value={structurePrompt} onFocus={(event) => event.currentTarget.select()} /></label>}<label className="intake-field"><span className="field-label">Dán toàn bộ câu trả lời ChatGPT</span><textarea rows={12} value={structureResponse} onChange={(event) => setStructureResponse(event.target.value)} placeholder="Dán đầy đủ câu trả lời, gồm marker PO_RESEARCH_V1 và phần dữ liệu JSON." /></label><button className="primary-action" type="button" disabled={busy || !structureResponse.trim()} onClick={() => void applyStructuringResponse()}>{busy ? 'Đang cập nhật…' : 'Cập nhật báo cáo'}</button>{report.extraction_error && <p className="field-error">Không thể áp dụng cấu trúc trước đó: {report.extraction_error}</p>}</details>}
    {tab === 'overview' && <section className="results-overview" aria-label="Tổng quan">
      <div className={`overview-synthesis-grid${keyTakeaways.length ? '' : ' is-summary-only'}`}>
        {data.executive_summary && <section className="research-panel executive-card"><div className="overview-section-heading"><OverviewHeading icon="conclusion" eyebrow="KẾT LUẬN NGHIÊN CỨU" title="Kết luận nghiên cứu" /></div><p className={`executive-summary${summaryExpanded ? ' is-expanded' : ''}`}><ResearchTextHighlighter text={data.executive_summary} /></p><button className="text-button summary-toggle" aria-expanded={summaryExpanded} onClick={() => setSummaryExpanded(!summaryExpanded)}>{summaryExpanded ? 'Thu gọn' : 'Đọc toàn bộ kết luận'}</button></section>}
        {keyTakeaways.length > 0 && <section className="research-panel overview-takeaways"><div className="overview-section-heading"><OverviewHeading icon="takeaways" eyebrow="DO BÁO CÁO CUNG CẤP" title="Điểm chính" /></div><ol>{(takeawaysExpanded ? keyTakeaways : keyTakeaways.slice(0, 3)).map((item, index) => <li key={index}><span className="takeaway-number">{index + 1}</span><span className="takeaway-copy"><ResearchTextHighlighter text={item} /></span></li>)}</ol>{keyTakeaways.length > 3 && <button className="text-button" aria-expanded={takeawaysExpanded} onClick={() => setTakeawaysExpanded(!takeawaysExpanded)}>{takeawaysExpanded ? 'Thu gọn điểm chính' : `Xem cả ${keyTakeaways.length} điểm chính`}</button>}</section>}
      </div>
      {(data.quantitative_observations ?? []).some((row) => row.observation_type === 'reported') && <QuantitativeEvidence observations={data.quantitative_observations ?? []} onPrepareChartData={() => void prepareChartData()} onViewEvidence={(index) => { setQuantEvidenceIndex(index); setQuantEvidenceTarget(`quant-observation-${index}`); setTab('evidence'); }} />}
      <div className={`overview-main-grid${hasSnapshotData || data.po_recommendations.length || savedPoEntries.length || data.evidence_references.length || data.entities.length ? '' : ' is-single-column'}`}>
        <section className="research-panel overview-insights"><div className="overview-section-heading"><OverviewHeading icon="findings" eyebrow="PHÁT HIỆN DO BÁO CÁO CUNG CẤP" title="Phát hiện chính" detail={data.findings.length ? `${data.findings.length} phát hiện` : undefined} />{data.findings.length > 0 && <button className="text-button" onClick={() => setTab('insights')}>Xem tất cả <ResultsIcon name="arrow" /></button>}</div>
          {data.findings.length > 0 ? <div className="finding-groups"><div className="insight-dashboard-list">{data.findings.map((finding) => {
            const refs = finding.evidence_references.map((url) => data.evidence_references.find((source) => source.url === url)).filter((source): source is NonNullable<typeof source> => Boolean(source));
            const related = data.entities.filter((entity) => finding.related_entities.includes(entity.key));
            return <article className="finding-map-card" key={finding.key}><button className="insight-dashboard-card" aria-label={`Xem phát hiện: ${finding.title}`} onClick={() => { setActiveFinding(finding.key); setTab('insights'); }}><span className="finding-icon-frame"><ResultsIcon name={findingIcon(finding.finding_type)} /></span><span className="insight-dashboard-copy"><span className="insight-type">{displayResearchType(finding.finding_type)}</span><strong><ResearchTextHighlighter text={finding.title} /></strong><span><ResearchTextHighlighter text={finding.description} /></span></span><span className="insight-open">Xem chi tiết <ResultsIcon name="arrow" /></span></button>
              <div className="finding-card-evidence"><span className="evidence-count"><ResultsIcon name="evidence" />{refs.length} {refs.length === 1 ? 'nguồn tham khảo' : 'nguồn tham khảo'}</span><span>{refs.length ? `${displayResearchType(finding.evidence_status)} · chưa xác minh` : 'Chưa có nguồn tham khảo · chưa xác minh'}</span></div>
              <details className="finding-card-details"><summary>Thông tin và thao tác liên quan</summary><div className="finding-card-details-content">{related.length > 0 && <div className="finding-related"><b>Đối tượng liên quan</b><div>{related.map((entity) => <span className="relationship-chip" key={entity.key}>{entity.name}</span>)}</div></div>}{finding.po_implications && <p className="finding-po-implication"><b>Gợi ý cho PO trong báo cáo</b><ResearchTextHighlighter text={finding.po_implications} /></p>}{refs.length > 0 && <div className="finding-supporting-sources"><b>Nguồn tham khảo · chưa xác minh</b><ul>{refs.map((source) => <li key={source.url}><SourceLink url={source.url}>{source.title || source.url}</SourceLink></li>)}</ul></div>}<div className="finding-card-actions"><button className="text-button" onClick={() => openPoAssessment({ item_type: 'finding', item_key: finding.key })}>{report.project_id ? 'Ghi chú báo cáo' : 'Ghi đánh giá PO'}</button>{benchmarkAction({ item_type: 'finding', item_key: finding.key }, finding.title)}</div></div></details>
            </article>;
          })}</div></div> : <div className="overview-empty"><h4>{hasStructured ? 'Báo cáo chưa có phát hiện' : 'Báo cáo cần được cấu trúc'}</h4><p>{hasStructured ? 'Báo cáo có thông tin có cấu trúc khác. Hệ thống không tạo phát hiện từ tiêu đề hoặc văn bản.' : 'Hiện chỉ có báo cáo gốc. Hãy bổ sung kết quả ChatGPT có cấu trúc để xem phát hiện, chứng cứ và nội dung so sánh.'}</p>{!hasStructured && <button className="secondary-action" onClick={() => document.querySelector('.structuring-callout')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Cấu trúc báo cáo này</button>}</div>}
        </section>
        {(hasSnapshotData || data.research_gaps.length > 0 || data.po_recommendations.length > 0 || savedPoEntries.length > 0 || data.evidence_references.length > 0 || data.entities.length > 0) && <aside className="overview-side-column">
          {hasSnapshotData && <section className="research-panel overview-snapshot"><div className="overview-section-heading"><OverviewHeading icon="snapshot" eyebrow="TÓM TẮT" title="Tổng quan nghiên cứu" /></div><dl><div><dt><ResultsIcon name="findings" />Phát hiện</dt><dd>{data.findings.length}</dd></div><div><dt><ResultsIcon name="entity" />Đối tượng nghiên cứu</dt><dd>{data.entities.length}</dd></div><div><dt><ResultsIcon name="evidence" />Nguồn tham khảo</dt><dd>{data.evidence_references.length}</dd></div><div><dt><ResultsIcon name="gaps" />Câu hỏi còn mở</dt><dd>{data.research_gaps.length}</dd></div></dl></section>}
          {data.research_gaps.length > 0 && <section className="research-panel overview-gaps"><div className="overview-section-heading"><OverviewHeading icon="gaps" eyebrow="ĐIỀU CHƯA RÕ" title="Khoảng trống nghiên cứu" /></div><ul>{(gapsExpanded ? data.research_gaps : data.research_gaps.slice(0, 4)).map((gap, index) => <li key={index}>{gap}</li>)}</ul>{data.research_gaps.length > 4 && <button className="text-button" aria-expanded={gapsExpanded} onClick={() => setGapsExpanded(!gapsExpanded)}>{gapsExpanded ? 'Thu gọn' : `Xem cả ${data.research_gaps.length} câu hỏi`}</button>}</section>}
          {(data.po_recommendations.length > 0 || savedPoEntries.length > 0 || tabs.find((item) => item.id === 'decisions')?.visible || data.evidence_references.length > 0 || data.entities.length > 0) && <section className="research-panel overview-decisions"><div className="overview-section-heading"><OverviewHeading icon="decision" eyebrow="KHÔNG GIAN CỦA PO" title="Bước tiếp theo" /></div>{data.po_recommendations.length > 0 && <div className="recommendations-block"><strong>Đề xuất trong báo cáo</strong><ul>{data.po_recommendations.slice(0, 2).map((recommendation, index) => <li key={index}>{recommendation}</li>)}</ul><small>Do báo cáo cung cấp · chưa phải quyết định của PO</small></div>}{savedPoEntries.length > 0 && <div className="saved-po-block"><strong>{report.project_id ? 'Ghi chú báo cáo đã lưu' : 'Đánh giá PO đã lưu'}</strong>{savedPoEntries.slice(0, 1).map((entry) => { const label = assessmentItems.find(({ item }) => item.item_type === entry.item_type && item.item_key === entry.item_key)?.label || entry.item_key; return <p key={`${entry.item_type}:${entry.item_key}`}><b>{label}</b>{entry.po_assessment || entry.next_action || entry.notes}</p>; })}</div>}{tabs.find((item) => item.id === 'decisions')?.visible && <button className="primary-action" onClick={() => setTab('decisions')}>{report.project_id ? 'Mở ghi chú báo cáo' : 'Mở đánh giá PO'} <ResultsIcon name="arrow" /></button>}{data.evidence_references.length > 0 && <button className="text-button" onClick={() => setTab('evidence')}>Xem chứng cứ · {data.evidence_references.length}</button>}{data.entities.length > 0 && <button className="text-button" onClick={() => setTab('benchmark')}>{selectedEntityCount ? `Mở so sánh · đã chọn ${selectedEntityCount}` : 'Mở so sánh'}</button>}</section>}
        </aside>}
      </div>
      {data.findings.length > 0 && <section className="research-panel overview-research-map"><div className="overview-section-heading"><OverviewHeading icon="map" eyebrow="MỐI LIÊN HỆ TRONG BÁO CÁO" title="Bản đồ nghiên cứu" /> <button className="text-button" onClick={() => setTab('insights')}>Xem chi tiết <ResultsIcon name="arrow" /></button></div><p className="overview-muted">Chọn một phát hiện để làm nổi bật các liên kết được nêu trong báo cáo. Chỉ hiển thị mối liên hệ có trong dữ liệu nguồn.</p>{mapFocusedFinding && <div className="research-map-focus" role="status"><span>Đang xem: {data.findings.find((finding) => finding.key === mapFocusedFinding)?.title}</span><button className="text-button" onClick={() => setMapFocusedFinding(null)}>Bỏ chọn</button></div>}<div className="research-map-board" role="list" aria-label="Mối liên hệ giữa các phát hiện"><div className="research-map-columns" aria-hidden="true"><span>Phát hiện</span><span>Đối tượng được liên kết</span><span>Gợi ý cho PO</span></div>{visibleMapFindings.map((finding) => { const related = [...new Map(data.entities.filter((entity) => finding.related_entities.includes(entity.key)).map((entity) => [entity.key, entity])).values()]; return <article className={`research-map-row${related.length ? ' has-entities' : ' is-unlinked'}${mapFocusedFinding === finding.key ? ' is-focused' : ''}`} key={finding.key} role="listitem"><button className="research-map-node research-map-finding" aria-pressed={mapFocusedFinding === finding.key} onClick={() => setMapFocusedFinding(mapFocusedFinding === finding.key ? null : finding.key)}><span className="research-map-node-icon"><ResultsIcon name={findingIcon(finding.finding_type)} /></span><span><small>{displayResearchType(finding.finding_type)}</small><strong>{finding.title}</strong></span></button><span className={`research-map-connector${related.length ? ' is-connected' : ''}`} aria-hidden="true" />{related.length > 0 ? <div className="research-map-entities">{related.map((entity) => <div className="research-map-node research-map-entity" key={entity.key}><ResultsIcon name="entity" /><strong>{entity.name}</strong></div>)}</div> : <div className="research-map-empty">Báo cáo chưa liên kết đối tượng</div>}<span className={`research-map-connector${related.length && finding.po_implications ? ' is-connected' : ''}`} aria-hidden="true" />{finding.po_implications ? <div className="research-map-node research-map-implication"><ResultsIcon name="decision" /><span><small>Gợi ý cho PO</small><strong>{finding.po_implications}</strong></span></div> : <div className="research-map-empty">Báo cáo chưa nêu gợi ý cho PO</div>}</article>; })}</div>{data.findings.length > 3 && !mapFocusedFinding && <button className="secondary-action research-map-toggle" aria-expanded={mapExpanded} onClick={() => setMapExpanded(!mapExpanded)}>{mapExpanded ? 'Thu gọn mối liên hệ' : `Xem tất cả mối liên hệ · ${data.findings.length}`}</button>}</section>}
      <details className="results-fact-strip"><summary>Chi tiết báo cáo</summary><div><span>{data.findings.length} phát hiện</span><span>{data.entities.length} đối tượng nghiên cứu</span><span>{data.evidence_references.length} nguồn tham khảo</span><span>{data.research_gaps.length} câu hỏi còn mở</span></div></details>
    </section>}
    {tab === 'insights' && <section className="research-panel results-panel insight-detail-page"><div className="panel-heading"><div><span className="field-label">PHÁT HIỆN DO BÁO CÁO CUNG CẤP</span><h3>Phát hiện</h3></div></div>{data.findings.length === 0 ? <p className="overview-empty-copy">Báo cáo chưa cung cấp phát hiện. Không có phát hiện nào được suy ra từ tiêu đề hoặc văn bản gốc.</p> : <div className={`insight-workspace${data.findings.length === 1 ? ' is-single-item' : ''}`}>{data.findings.length > 1 && <nav className="insight-list" aria-label="Các phát hiện trong báo cáo">{data.findings.map((finding) => <button className={`insight-list-item${selectedFindingKey === finding.key ? ' active' : ''}`} key={finding.key} aria-pressed={selectedFindingKey === finding.key} onClick={() => { setActiveFinding(finding.key); }}><span>{displayResearchType(finding.finding_type)}</span><strong><ResearchTextHighlighter text={finding.title} /></strong></button>)}</nav>}{selectedFinding ? (() => { const finding = selectedFinding; const locations = [...(finding.source_locations || []), ...finding.evidence_references.flatMap((url) => data.evidence_references.filter((source) => source.url === url && source.source_location).map((source) => source.source_location!))]; const excerpt = excerptAtLocations(report.content, locations); const metrics = findingMetrics(finding.key); const poEntry = workspace.entries.find((entry) => entry.item_type === 'finding' && entry.item_key === finding.key); const savedPoEntry = confirmedWorkspaceRef.current.entries.find((entry) => entry.item_type === 'finding' && entry.item_key === finding.key); const hasPoDecision = Boolean(savedPoEntry && (savedPoEntry.po_assessment || savedPoEntry.notes || savedPoEntry.next_action)); const hasPoDraft = Boolean(poEntry && (poEntry.po_assessment || poEntry.notes || poEntry.next_action)); return <article className="insight-detail-panel" id={`finding-${finding.key}`}><span className="field-label">{displayResearchType(finding.finding_type)} · do báo cáo cung cấp</span><h4><ResearchTextHighlighter text={finding.title} /></h4><section className="insight-finding-copy"><h5>Phát hiện</h5><p><ResearchTextHighlighter text={finding.description} /></p></section>{scopeLabel(finding.scope) && <section><h5>Phạm vi nghiên cứu</h5><p><ResearchTextHighlighter text={scopeLabel(finding.scope)!} /></p></section>}<section className="finding-evidence-section"><h5>Bằng chứng · {finding.evidence_references.length ? `${finding.evidence_references.length} nguồn tham khảo, chưa xác minh độc lập` : 'chưa có nguồn liên kết'}</h5>{finding.evidence_references.length ? <EvidenceLinks urls={finding.evidence_references} references={data.evidence_references} /> : <p>Báo cáo không liên kết nguồn cho phát hiện này.</p>}</section>{finding.uncertainty && <section><h5>Điều chưa rõ</h5><p><ResearchTextHighlighter text={finding.uncertainty} /></p></section>}{finding.po_implications && <section className="insight-po-recommendation"><h5>Gợi ý trong báo cáo</h5><p><ResearchTextHighlighter text={finding.po_implications} /></p><small>Đây là nội dung do báo cáo cung cấp, chưa phải quyết định của PO.</small></section>}{metrics.length > 0 && <section><h5>Số liệu PO đã liên kết</h5><ul>{metrics.map((metric, index) => <li key={`${metric.dimension}-${index}`}><strong>{metric.dimension}:</strong> <ResearchTextHighlighter text={metric.value} /> <EvidenceLinks urls={metric.urls} references={data.evidence_references} /></li>)}</ul></section>}{relatedEntityCandidates(finding)}<details className="finding-original-support"><summary>Xem đoạn hỗ trợ trong báo cáo gốc</summary>{excerpt.length ? excerpt.map((line) => <pre key={line}>{line}</pre>) : <p>Báo cáo không cung cấp vị trí nguồn đáng tin cậy. Hãy mở Báo cáo đầy đủ để xem nội dung gốc.</p>}</details><section className="finding-po-decision"><h5>{report.project_id ? 'Ghi chú báo cáo' : 'Đánh giá của PO'}</h5>{hasPoDecision ? <dl className="finding-po-fields">{savedPoEntry?.po_assessment && <div><dt>{report.project_id ? 'Nhận định' : 'Đánh giá'}</dt><dd>{savedPoEntry.po_assessment}</dd></div>}{savedPoEntry?.notes && <div><dt>{report.project_id ? 'Ghi chú' : 'Ghi chú PO'}</dt><dd>{savedPoEntry.notes}</dd></div>}{savedPoEntry?.next_action && <div><dt>{report.project_id ? 'Việc tiếp theo' : 'Việc tiếp theo'}</dt><dd>{savedPoEntry.next_action}</dd></div>}</dl> : <p>Chưa có đánh giá PO được lưu cho phát hiện này.</p>}{hasPoDraft && !hasPoDecision && <p className="finding-po-draft">Có nội dung PO đang chỉnh sửa nhưng chưa được xác nhận đã lưu.</p>}<button className="primary-action" onClick={() => openPoAssessment({ item_type: 'finding', item_key: finding.key })}>{report.project_id ? (hasPoDecision ? 'Mở ghi chú báo cáo đã lưu' : 'Ghi chú báo cáo cho phát hiện này') : (hasPoDecision ? 'Mở đánh giá PO đã lưu' : 'Đánh giá phát hiện này')} <ResultsIcon name="arrow" /></button></section><details className="finding-more-actions"><summary>Thao tác bổ sung</summary>{benchmarkAction({ item_type: 'finding', item_key: finding.key }, finding.title)}</details></article>; })() : <p className="overview-empty-copy">Không tìm thấy phát hiện đang chọn.</p>}</div>}</section>}
    {tab === 'entities' && <section className="research-panel results-panel entity-detail-page"><div className="panel-heading"><div><span className="field-label">ĐỐI TƯỢNG ĐƯỢC BÁO CÁO NÊU</span><h3>Đối tượng nghiên cứu</h3></div></div>{data.entities.length === 0 ? <p className="overview-empty-copy">Báo cáo chưa nêu đối tượng nghiên cứu. Không có đối tượng nào được suy ra.</p> : <div className={`entity-workspace${data.entities.length === 1 ? ' is-single-item' : ''}`}>{data.entities.length > 1 && <nav className="entity-list" aria-label="Đối tượng trong báo cáo">{data.entities.map((entity) => <button className={`entity-list-item${selectedEntityKey === entity.key ? ' active' : ''}`} key={entity.key} aria-pressed={selectedEntityKey === entity.key} onClick={() => setActiveEntity(entity.key)}><span>{entity.entity_type}</span><strong>{entity.name}</strong></button>)}</nav>}{selectedEntity && (() => { const entity = selectedEntity; const attributes = Object.entries(entity.attributes).filter(([, value]) => value !== null && value !== undefined && value !== ''); const descriptionEntry = attributes.find(([key]) => ['description', 'summary', 'context'].includes(key.toLocaleLowerCase())); const linkedFindings = data.findings.filter((finding) => finding.related_entities.includes(entity.key)); const item: BenchmarkSelection = { item_type: 'entity', item_key: entity.key }; const selectedForBenchmark = isSelected(item); return <article className="entity-detail-panel">{entityReturnFinding && <button className="text-button entity-context-return" onClick={() => { setActiveFinding(entityReturnFinding); setEntityReturnFinding(null); setTab('insights'); }}>← Quay lại phát hiện</button>}<span className="field-label">{entity.entity_type}</span><h4>{entity.name}</h4>{descriptionEntry && <p className="entity-description">{String(descriptionEntry[1])}</p>}<section><h5>Phát hiện liên quan</h5>{linkedFindings.length ? <ul className="entity-related-findings">{linkedFindings.map((finding) => <li key={finding.key}><button className="text-button" onClick={() => { setActiveFinding(finding.key); setEntityReturnFinding(null); setTab('insights'); }}>{finding.title} <ResultsIcon name="arrow" /></button><span>{finding.evidence_references.length ? `${finding.evidence_references.length} nguồn tham khảo · chưa xác minh` : 'Chưa có nguồn liên kết'}</span></li>)}</ul> : <p>Báo cáo chưa liên kết phát hiện nào với đối tượng này.</p>}</section><section><h5>Nguồn gắn trực tiếp với đối tượng</h5><EvidenceLinks urls={entity.evidence_references} references={data.evidence_references} /></section>{attributes.filter(([key]) => key !== descriptionEntry?.[0]).length > 0 && <details className="related-entity-attributes"><summary>Xem thông tin bổ sung ({attributes.filter(([key]) => key !== descriptionEntry?.[0]).length})</summary><dl>{attributes.filter(([key]) => key !== descriptionEntry?.[0]).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></details>}<div className="entity-actions"><button className={selectedForBenchmark ? 'secondary-action' : 'primary-action'} aria-label={`${selectedForBenchmark ? 'Gỡ khỏi' : 'Thêm vào'} so sánh: ${entity.name}`} disabled={Boolean(pendingItems[selectionId(item)])} onClick={() => void toggleSelection(item)}>{pendingItems[selectionId(item)] ? (pendingItems[selectionId(item)] === 'adding' ? 'Đang thêm…' : 'Đang gỡ…') : selectedForBenchmark ? 'Gỡ khỏi so sánh' : workspace.entries.some((entry) => entry.item_type === 'entity' && entry.item_key === entity.key) ? 'Khôi phục vào so sánh' : 'Thêm vào so sánh'}</button>{selectedForBenchmark && <button className="text-button" onClick={() => { setBenchmarkFocusEntity(entity.key); setTab('benchmark'); }}>Mở bộ so sánh <ResultsIcon name="arrow" /></button>}{itemFeedback[selectionId(item)] && <span className={itemFeedback[selectionId(item)].kind === 'error' ? 'inline-action-error' : 'inline-action-success'} role={itemFeedback[selectionId(item)].kind === 'error' ? 'alert' : 'status'}>{itemFeedback[selectionId(item)].text}</span>}</div></article>; })()}</div>}</section>}
    {tab === 'benchmark' && <section className="research-panel results-panel benchmark-workspace"><h3>{selectedEntityRows.length > 0 ? (selectedEntityRows.length === 1 ? 'Đánh giá đối tượng' : 'So sánh đối tượng nghiên cứu') : 'Đánh giá phát hiện'}</h3><p className="benchmark-intro">Chỉ những đối tượng bạn chọn mới xuất hiện trong bảng. Loại đối tượng vẫn được giữ rõ; chọn một phát hiện không tự thêm sản phẩm liên quan. Quan sát còn thiếu được ghi là chưa có dữ liệu.</p>{benchmarkFocusEntity && selectedEntityKeys.has(benchmarkFocusEntity) && <p className="benchmark-context-focus" role="status">Đang mở bộ so sánh từ đối tượng: <strong>{data.entities.find((entity) => entity.key === benchmarkFocusEntity)?.name}</strong></p>}
      {selectedEntityRows.length > 0 && <>
        <label className="intake-field"><span className="field-label">Thêm khía cạnh so sánh</span><div className="dimension-add"><input aria-label="Khía cạnh do PO xác định" value={newDimension} onChange={(event) => setNewDimension(event.target.value)} placeholder="Bạn muốn so sánh điều gì?" /><button className="secondary-action" disabled={!newDimension.trim() || busy} onClick={() => void addCustomDimension()}>Thêm khía cạnh</button></div></label>
      {dimensions.length > 0 && <div className="benchmark-table-wrap"><table className="benchmark-table"><thead><tr><th>Sản phẩm hoặc đối tượng được so sánh</th>{dimensions.map((dimension) => <th key={dimension.key}>{dimension.name}{dimension.custom ? ' · Do PO xác định' : ''}</th>)}</tr></thead><tbody>{selectedEntityRows.map((entity) => { const item: BenchmarkSelection = { item_type: 'entity', item_key: entity.key }; const entry = workspace.entries.find((candidate) => candidate.item_type === 'entity' && candidate.item_key === entity.key); return <tr key={entity.key}><th><strong>{entity.name}</strong><small>{entity.entity_type} · được chọn rõ ràng</small>{benchmarkAction(item, entity.name)}</th>{dimensions.map((dimension) => { const found = dimension.custom ? null : observation(item, dimension.key); const poValue = dimension.custom ? entry?.dimension_assessments?.[dimension.name] : undefined; const supportKeys = !dimension.custom && found ? supportingFindings(entity.key, dimension.key) : []; const candidates = !dimension.custom && found ? data.findings.filter((finding) => finding.related_entities.includes(entity.key)) : []; const preservedKeys = entry?.observation_finding_links?.[dimension.key] ?? []; return <td key={dimension.key}>{dimension.custom ? <textarea aria-label={`Đánh giá ${dimension.name} cho ${entity.name}`} value={poValue || ''} onChange={(event) => changeDimensionAssessment(item, dimension.name, event.target.value)} placeholder="Đánh giá của PO" /> : found ? <><span>{found.value === null || found.value === undefined || found.value === '' ? 'Chưa có dữ liệu' : String(found.value)}</span><small>{found.status} · do nguồn cung cấp, chưa xác minh độc lập{found.uncertainty ? ` · ${found.uncertainty}` : ''}</small>{found.urls.map((url) => <SourceLink key={url} url={url}>Mở bằng chứng</SourceLink>)}{supportKeys.map((key) => { const finding = data.findings.find((candidate) => candidate.key === key); return finding ? <button className="text-button" key={key} onClick={() => { setActiveFinding(key); setTab('insights'); }}>Phát hiện được PO xác nhận: {finding.title}</button> : <small key={key}>Tham chiếu phát hiện đã xác nhận ({key}) không còn khả dụng; vẫn được giữ nguyên, không tự ánh xạ lại.</small>; })}{!supportKeys.length && <small>Chưa có phát hiện hỗ trợ được xác nhận.</small>}{candidates.length > 0 && <label className="observation-link-control"><span>Xác nhận phát hiện hỗ trợ (PO)</span><select aria-label={`Xác nhận phát hiện hỗ trợ cho ${entity.name} / ${dimension.name}`} value={supportKeys[0] || ''} onChange={(event) => updateObservationFindingLink(item, dimension.key, event.target.value)}><option value="">Chưa xác nhận phát hiện hỗ trợ</option>{preservedKeys.filter((key) => !candidates.some((finding) => finding.key === key)).map((key) => <option key={key} value={key}>Tham chiếu cũ chưa khả dụng ({key})</option>)}{candidates.map((finding) => <option key={finding.key} value={finding.key}>{finding.title}</option>)}</select></label>}</> : <span>Chưa có dữ liệu</span>}</td>; })}</tr>; })}</tbody></table></div>}
        <section className="benchmark-assessments"><h4>Đánh giá và quyết định của PO</h4>{selectedEntityRows.map((entity) => { const item: BenchmarkSelection = { item_type: 'entity', item_key: entity.key }; return <details className="benchmark-po-entry" key={entity.key}><summary><strong>{entity.name}</strong><span>Đánh giá, ghi chú và việc tiếp theo</span></summary><div className="benchmark-assessment-entry-actions">{benchmarkAction(item, entity.name)}</div>{poAssessmentFields(item, entity.name)}</details>; })}</section>
      </>}
      {selectedFindings.length > 0 && <section className="benchmark-assessments"><h4>{selectedEntityRows.length > 0 ? 'Phát hiện hỗ trợ' : 'Đánh giá phát hiện đã chọn'}</h4>{selectedFindings.map(({ selection, finding }) => <details className="benchmark-po-entry" key={finding.key}><summary><strong>{finding.title}</strong><span>{finding.finding_type} · {finding.evidence_status}</span></summary><div className="insight-result-detail"><p>{finding.description}</p>{scopeLabel(finding.scope) && <p><strong>Phạm vi:</strong> {scopeLabel(finding.scope)}</p>}{finding.uncertainty && <p><strong>Điều chưa chắc chắn:</strong> {finding.uncertainty}</p>}<EvidenceLinks urls={finding.evidence_references} references={data.evidence_references} />{poAssessmentFields(selection, finding.title)}</div></details>)}</section>}
      {(legacyDimensions.length > 0 || orphanedDimensionEntries.length > 0) && <section className="benchmark-assessments legacy-dimension-section"><h4>Đánh giá và ghi chú cũ theo khía cạnh</h4><p>Ghi chú theo khía cạnh vẫn giữ khóa ban đầu. Gỡ một khía cạnh khỏi bảng so sánh không xóa ghi chú đã lưu trước đó.</p>
        {legacyDimensions.map((dimension) => { const item: BenchmarkSelection = { item_type: 'dimension', item_key: dimension.key }; const entry = workspace.entries.find((candidate) => candidate.item_type === 'dimension' && candidate.item_key === dimension.key); return <details className="benchmark-po-entry" key={dimension.key}><summary><strong>{dimension.name}</strong><span>{isSelected(item) ? 'Đang dùng trong bảng so sánh' : 'Không còn hoạt động'} · dữ liệu cũ</span></summary><p className="legacy-stored-key">Khóa khía cạnh đã lưu: <code>{dimension.key}</code></p>{dimension.po_notes && <section className="legacy-historical-notes"><h5>Ghi chú PO cũ · được giữ nguyên</h5><p>{dimension.po_notes}</p></section>}{benchmarkAction(item, dimension.name)}{(isSelected(item) || entry) && <section><h5>Trường đánh giá PO hiện tại</h5>{entry ? poAssessmentFields(item, dimension.name) : <p>Nếu thêm khía cạnh cũ này, ứng dụng sẽ tạo một mục đánh giá PO riêng; ghi chú lịch sử vẫn không thay đổi.</p>}</section>}</details>; })}
        {orphanedDimensionKeys.map((key) => { const item: BenchmarkSelection = { item_type: 'dimension', item_key: key }; const entry = workspace.entries.find((candidate) => candidate.item_type === 'dimension' && candidate.item_key === key); return <details className="benchmark-po-entry" key={`orphan:${key}`}><summary><strong>Khía cạnh cũ không còn khả dụng</strong><span>Mục lịch sử · khóa được giữ nguyên</span></summary><p className="legacy-stored-key">Khóa khía cạnh đã lưu: <code>{key}</code>. Ứng dụng không gán khóa này sang khía cạnh khác.</p>{isSelected(item) && benchmarkAction(item, key)}{entry && <><h5>Trường đánh giá PO trong lịch sử</h5>{poAssessmentFields(entry, key)}</>}</details>; })}
      </section>}
      {inactiveWorkspaceEntries.length > 0 && <section className="benchmark-assessments inactive-po-drafts"><h4>Bản nháp PO đã lưu · không dùng trong bảng so sánh</h4><p>Ghi chú vẫn được giữ sau khi gỡ mục khỏi bảng so sánh đang dùng.</p>{inactiveWorkspaceEntries.map((entry) => { const item: BenchmarkSelection = { item_type: entry.item_type, item_key: entry.item_key }; const label = entry.item_type === 'entity' ? data.entities.find((entity) => entity.key === entry.item_key)?.name : data.findings.find((finding) => finding.key === entry.item_key)?.title; return <details className="benchmark-po-entry" key={`${entry.item_type}:${entry.item_key}`}><summary><strong>{label || entry.item_key}</strong><span>Bản nháp PO đã lưu · không hoạt động</span></summary>{benchmarkAction(item, label || entry.item_key)}{poAssessmentFields(item, label || entry.item_key)}</details>; })}</section>}
      {selectedEntityRows.length === 0 && selectedFindings.length === 0 && selectedDimensions.length === 0 && inactiveWorkspaceEntries.length === 0 && <p className="report-history-state">Chọn một đối tượng hoặc thêm phát hiện từ phần bằng chứng để bắt đầu.</p>}
      {(selectedEntityRows.length > 0 || selectedFindings.length > 0 || selectedDimensions.length > 0 || orphanedDimensionEntries.length > 0 || inactiveWorkspaceEntries.length > 0) && <div className="benchmark-save-controls"><p className={`benchmark-save-state is-${workspaceSaveState}`} role="status" aria-live="polite">{workspaceSaveState === 'saved' ? 'Đã lưu · mọi thay đổi PO đã được máy chủ xác nhận.' : workspaceSaveState === 'unsaved' ? 'Chưa lưu thay đổi · nội dung vẫn chỉ nằm trên trang này.' : workspaceSaveState === 'saving' ? 'Đang lưu thay đổi PO…' : 'Lưu thất bại · nội dung vẫn còn trên trang. Hãy thử lưu lại.'}</p>{workspaceSaveError && <p className="research-alert" role="alert">{workspaceSaveError}</p>}<button className="primary-action" disabled={workspaceSaveState === 'saving' || !hasUnsavedWorkspace()} onClick={() => void saveWorkspace()}>{workspaceSaveState === 'failed' ? 'Thử lưu lại' : workspaceSaveState === 'saving' ? 'Đang lưu…' : 'Lưu đánh giá và việc tiếp theo'}</button></div>}
    </section>}
    {tab === 'decisions' && <section className="research-panel results-panel po-decisions-page"><div className="panel-heading"><div><span className="field-label">{report.project_id ? 'GHI CHÚ BÁO CÁO' : 'KHÔNG GIAN QUYẾT ĐỊNH CỦA BẠN'}</span><h3>{report.project_id ? 'Ghi chú cho báo cáo này' : 'Đánh giá và việc tiếp theo'}</h3></div><span className={`benchmark-save-state is-${workspaceSaveState}`} role="status">{workspaceSaveState === 'saved' ? 'Đã lưu' : workspaceSaveState === 'unsaved' ? 'Chưa lưu thay đổi' : workspaceSaveState === 'saving' ? 'Đang lưu…' : 'Lưu thất bại'}</span></div><p className="decision-workflow-intro">Đề xuất nghiên cứu là nội dung của báo cáo. Hãy dùng không gian này để ghi đánh giá và việc bạn dự định làm tiếp theo. Ghi chú được lưu riêng, không tự thêm mục vào bảng so sánh.</p>
      {report.project_id && <div className="workspace-decision-link"><strong>Quyết định PO chính thức được lưu riêng trong dự án.</strong><span>Ghi chú ở trang này chỉ gắn với báo cáo; chúng không thay đổi quyết định của dự án.</span><a className="primary-action" href={`/research?projectId=${encodeURIComponent(report.project_id)}&view=opportunities`}>Mở quyết định PO của dự án</a></div>}
      <div className="decision-workflow-grid"><nav className="decision-item-list" aria-label="Nội dung nghiên cứu để đánh giá">{assessmentItems.length ? assessmentItems.map(({ item, label, kind }) => <button key={selectionId(item)} className={activeDecisionItem && selectionId(activeDecisionItem.item) === selectionId(item) ? 'active' : ''} onClick={() => openPoAssessment(item)}><span>{kind}</span><strong>{label}</strong><small>{confirmedWorkspaceRef.current.entries.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key && (entry.po_assessment || entry.next_action || entry.notes)) ? 'Đã có ghi chú' : 'Chưa có ghi chú'}</small></button>) : <p className="overview-muted">Báo cáo này chưa có phát hiện, đối tượng hoặc khía cạnh so sánh có cấu trúc để đánh giá.</p>}</nav>
        {activeDecisionItem ? <section className="decision-editor"><span className="field-label">{report.project_id ? 'NHẬN ĐỊNH GẮN VỚI BÁO CÁO' : 'QUYẾT ĐỊNH CỦA BẠN'}</span><h4>{activeDecisionItem.label}</h4><p className="overview-muted">{activeDecisionItem.kind} · {report.project_id ? 'chỉ áp dụng cho báo cáo này' : 'ghi nhận của bạn'}</p>{poAssessmentFields(activeDecisionItem.item, activeDecisionItem.label)}</section> : <div className="overview-empty"><h4>Chọn nội dung cần đánh giá</h4><p>Chọn một phát hiện, đối tượng hoặc khía cạnh để ghi đánh giá và việc tiếp theo.</p></div>}
      </div>
      {workspaceSaveError && <p className="research-alert" role="alert">{workspaceSaveError}</p>}
      <div className="benchmark-save-controls"><p className={`benchmark-save-state is-${workspaceSaveState}`} role="status" aria-live="polite">{workspaceSaveState === 'saved' ? (report.project_id ? 'Đã lưu ghi chú báo cáo · máy chủ đã xác nhận thay đổi.' : 'Đã lưu · máy chủ đã xác nhận thay đổi PO.') : workspaceSaveState === 'unsaved' ? 'Chưa lưu · thay đổi mới chỉ có trên trang này.' : workspaceSaveState === 'saving' ? (report.project_id ? 'Đang lưu ghi chú báo cáo…' : 'Đang lưu đánh giá PO…') : 'Lưu thất bại · nội dung vẫn còn trên trang. Hãy thử lại.'}</p><button className="primary-action" disabled={workspaceSaveState === 'saving' || !hasUnsavedWorkspace()} onClick={() => void saveWorkspace()}>{workspaceSaveState === 'failed' ? 'Thử lưu lại' : workspaceSaveState === 'saving' ? 'Đang lưu…' : (report.project_id ? 'Lưu ghi chú báo cáo' : 'Lưu đánh giá PO')}</button></div>
    </section>}
    {tab === 'evidence' && <section className="research-panel results-panel"><h3>Tham chiếu nguồn</h3><p>Đường dẫn này do báo cáo cung cấp. Việc có đường dẫn không xác minh phát hiện hoặc nội dung nguồn.</p><ul className="evidence-results">{data.evidence_references.map((source) => <li key={source.url}><strong>{source.title || source.url}</strong><SourceLink url={source.url}>{source.url}</SourceLink><span>{sourceLocationLabel(source.source_location)} · Chưa xác minh</span></li>)}</ul>
      {(data.quantitative_observations ?? []).filter((row) => row.observation_type === 'reported').length > 0 && <section className="quantitative-evidence-records"><h4>Số liệu do báo cáo cung cấp</h4><p>Số liệu chưa được xác minh và vẫn liên kết về nguồn cùng báo cáo gốc.</p>{data.quantitative_observations!.map((row, index) => {
        if (row.observation_type !== 'reported') return null;
        const source = data.evidence_references.find((item) => item.url === row.evidence_reference || item.url === row.source_reference);
        const sourceExcerpt = source?.source_location ? excerptAtLocations(report.content, [source.source_location]) : [];
        return <article id={`quant-observation-${index}`} className={quantEvidenceIndex === index ? 'is-focused' : ''} key={`${row.metric_id}:${index}`}><strong>{row.metric_definition || row.metric_id || 'Chưa xác định chỉ số'}</strong><span>{row.entity_name || data.entities.find((entity) => entity.key === row.entity_id)?.name || row.entity_id || 'Chưa xác định đối tượng'} · {row.value ?? 'Chưa có dữ liệu'} {row.unit ?? ''}</span><span>{[row.geo, row.platform, row.period_start && row.period_end ? `${row.period_start} – ${row.period_end}` : 'Chưa cung cấp kỳ'].filter(Boolean).join(' · ')}</span><span>Do báo cáo cung cấp · {row.verification_status === 'verified' ? 'Đã xác minh độc lập' : 'Chưa xác minh'}{row.provenance_id ? ` · Báo cáo ${row.provenance_id}` : ''}</span>{source?.source_location ? <details><summary>Đoạn nội dung hỗ trợ · {sourceLocationLabel(source.source_location)}</summary>{sourceExcerpt.map((line) => <pre className="quant-source-excerpt" key={line}>{line}</pre>)}</details> : <small>Báo cáo không nêu vị trí đoạn trích đáng tin cậy; vẫn có thể xem nguồn liên kết và toàn bộ báo cáo gốc.</small>}{row.validation_reasons.length > 0 && <ul>{row.validation_reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}</ul>}{row.evidence_reference && <SourceLink url={row.evidence_reference}>Mở nguồn bằng chứng</SourceLink>}{row.source_reference && row.source_reference !== row.evidence_reference && <SourceLink url={row.source_reference}>Mở nguồn dữ liệu</SourceLink>}<button className="text-button" onClick={() => setTab('report')}>Mở báo cáo gốc</button></article>;
      })}</section>}
      {quantitativeDatasets.length > 0 && <details className="quantitative-evidence-records" open={csvEvidenceExpanded} onToggle={(event) => setCsvEvidenceExpanded(event.currentTarget.open)}><summary>Nâng cao: xem từng phép đo CSV ({quantitativeDatasets.reduce((count, dataset) => count + dataset.observations.length, 0)})</summary><h4>Các quan sát CSV gắn với báo cáo này</h4><p>Số liệu được giữ cùng nguồn dữ liệu và chưa xác minh độc lập, trừ khi được kiểm tra riêng. Mở mục Nguồn dữ liệu để khám phá theo sản phẩm và chỉ số.</p>{quantitativeDatasets.flatMap((dataset) => dataset.observations.map((row, index) => <article id={`quant-dataset-summary-observation-${dataset.id}-${index}`} key={`${dataset.id}:${index}`}><strong>{row.metric_definition || row.metric_id || 'Chưa xác định chỉ số'}</strong><span>{row.source_entity_name || row.entity_name || row.source_entity_id || row.entity_id || 'Chưa xác định đối tượng'} · {row.value ?? 'Chưa có dữ liệu'} {row.unit ?? ''}</span><span>{[row.geo || 'Chưa cung cấp GEO', row.platform || 'Chưa cung cấp nền tảng', row.period_start && row.period_end ? `${row.period_start} – ${row.period_end}` : 'Chưa cung cấp kỳ', row.granularity || 'Chưa cung cấp chu kỳ đo'].join(' · ')}</span><span>{dataset.filename} · Đã nhập CSV · {row.verification_status === 'verified' ? 'Đã xác minh độc lập' : 'Chưa xác minh'}</span>{row.validation_reasons.length > 0 && <ul>{row.validation_reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}</ul>}{row.evidence_reference && <SourceLink url={row.evidence_reference}>Mở nguồn tham chiếu</SourceLink>}{row.source_reference && row.source_reference !== row.evidence_reference && <SourceLink url={row.source_reference}>Mở nguồn dữ liệu</SourceLink>}<button className="text-button" onClick={() => setTab('report')}>Mở báo cáo gốc</button></article>))}</details>}
    </section>}
    {tab === 'report' && <section className="research-panel report-body full-report"><div className="panel-heading"><div><span className="field-label">BÁO CÁO GỐC</span><h3>Nội dung nghiên cứu</h3></div><span className="unverified-chip">Lưu nguyên văn</span></div><MarkdownReport markdown={readableReport.markdown} />{readableReport.technicalAppendix && <details className="report-technical-source"><summary>Xem dữ liệu JSON gốc (dành cho kỹ thuật)</summary><p>Báo cáo gốc được giữ nguyên để đối chiếu.</p><pre><code>{readableReport.technicalAppendix}</code></pre></details>}</section>}
    </div>
    <aside className="report-reading-support" aria-label="Nguồn và ghi chú hỗ trợ">
      <section className="report-reading-support-section"><div className="report-reading-support-heading"><div><span className="report-reading-eyebrow">THAM KHẢO</span><h3>Nguồn trong báo cáo</h3></div><span>{data.evidence_references.length}</span></div>
        {(tab === 'insights' || tab === 'entities') ? (data.evidence_references.length ? <><p className="report-reading-muted">Nguồn được hiển thị tại phát hiện hoặc đối tượng đang mở để tránh lặp lại danh sách.</p><button className="text-button" type="button" onClick={() => setTab('evidence')}>Mở danh sách nguồn <ResultsIcon name="arrow" /></button></> : <p className="report-reading-muted">Báo cáo chưa cung cấp đường dẫn nguồn.</p>) : data.evidence_references.length ? <><ul className="report-reading-source-list">{data.evidence_references.slice(0, 4).map((source) => <li key={source.url}><SourceLink url={source.url}>{source.title || source.url}</SourceLink><small>{sourceLocationLabel(source.source_location)} · Chưa xác minh</small></li>)}</ul><button className="text-button" type="button" onClick={() => setTab('evidence')}>Xem toàn bộ nguồn <ResultsIcon name="arrow" /></button></> : <p className="report-reading-muted">Báo cáo chưa cung cấp đường dẫn nguồn.</p>}
      </section>
      {tab !== 'insights' && tab !== 'entities' && <section className="report-reading-support-section report-reading-po"><div className="report-reading-support-heading"><div><span className="report-reading-eyebrow">GÓC NHÌN PO</span><h3>Đánh giá và bước tiếp theo</h3></div></div>
        {data.po_recommendations.length > 0 && <div className="report-reading-recommendation"><strong>Đề xuất trong báo cáo</strong><p>{data.po_recommendations[0]}</p><small>Do báo cáo cung cấp · chưa phải quyết định của PO</small></div>}
        {savedPoEntries.length > 0 ? <div className="report-reading-saved-decision"><strong>Đã lưu đánh giá của PO</strong>{savedPoEntries.slice(0, 1).map((entry) => { const savedItem = assessmentItems.find(({ item }) => item.item_type === entry.item_type && item.item_key === entry.item_key); return <div key={`${entry.item_type}:${entry.item_key}`}><span>{savedItem?.label || 'Mục đã đánh giá'}</span>{entry.po_assessment && <p>{entry.po_assessment}</p>}{entry.next_action && <small>Tiếp theo: {entry.next_action}</small>}</div>; })}</div> : <p className="report-reading-muted">Chưa có đánh giá PO được lưu.</p>}
        {tabs.find((item) => item.id === 'decisions')?.visible && <button className="report-reading-decision-link" type="button" onClick={() => setTab('decisions')}>Mở phần đánh giá <ResultsIcon name="arrow" /></button>}
      </section>}
      <section className="report-reading-context"><span className="report-reading-eyebrow">PHẠM VI</span><p>{[displayReportGeo(report.geo), displayReportEnvironment(report.os), report.research_period].filter(Boolean).join(' · ')}</p><small>Nhập {new Date(report.imported_at).toLocaleDateString('vi-VN')} · {report.origin === 'chatgpt_user_import' ? 'ChatGPT' : report.origin}</small></section>
    </aside>
    </div>
    {report.structured_update_available && <div role="status" className="research-alert">Bản nhập trùng có kết quả có cấu trúc khác. Hệ thống chưa tự áp dụng; báo cáo đã lưu và ghi chú PO được giữ nguyên.</div>}
  </article>;
}

function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  if (isUnavailableFixtureUrl(url)) return <span className="source-fixture-link">{children}<small>Liên kết fixture QA · không truy cập được · không phải bằng chứng thật</small></span>;
  return <a href={url} target="_blank" rel="noopener noreferrer">{children}</a>;
}

function EvidenceLinks({ urls, references }: { urls: string[]; references: ResearchData['evidence_references'] }) {
  if (!urls.length) return <p className="unverified-chip">Chưa có nguồn tham khảo · chưa xác minh</p>;
  return <ul className="evidence-link-list">{urls.map((url) => { const reference = references.find((item) => item.url === url); return <li key={url}><SourceLink url={url}>{reference?.title || url}</SourceLink><small>{sourceLocationLabel(reference?.source_location)} · Chưa xác minh</small></li>; })}</ul>;
}
