import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { reportApi, type BenchmarkSelection, type BenchmarkWorkspace, type BenchmarkWorkspaceEntry, type ImportedReport, type ResearchData } from './api';
import { extractHeadings, MarkdownReport } from './MarkdownReport';
import { buildStructuringPrompt } from './researchPrompt';
import { findingIcon, ResultsIcon, type ResultsIconName } from '../ui/ResultsIcon';
import { ResearchTextHighlighter } from './ResearchTextHighlighter';

type Tab = 'overview' | 'insights' | 'entities' | 'benchmark' | 'decisions' | 'evidence' | 'report';
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

function blankWorkspace(): BenchmarkWorkspace { return { custom_dimensions: [], entries: [] }; }

function displayResearchType(value: string): string {
  const readable = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return readable ? readable[0].toLocaleUpperCase() + readable.slice(1) : 'Research finding';
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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [workspaceSaveState, setWorkspaceSaveState] = useState<WorkspaceSaveState>('saved');
  const [workspaceSaveError, setWorkspaceSaveError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [structureResponse, setStructureResponse] = useState('');
  const [structurePrompt, setStructurePrompt] = useState('');
  const [workspace, setWorkspace] = useState<BenchmarkWorkspace>(blankWorkspace());
  const [newDimension, setNewDimension] = useState('');
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [takeawaysExpanded, setTakeawaysExpanded] = useState(false);
  const [gapsExpanded, setGapsExpanded] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapFocusedFinding, setMapFocusedFinding] = useState<string | null>(null);
  const [activeAssessment, setActiveAssessment] = useState<string | null>(null);
  const [supportFinding, setSupportFinding] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<Record<string, 'adding' | 'removing'>>({});
  const [itemFeedback, setItemFeedback] = useState<Record<string, { kind: 'success' | 'error'; text: string; diagnostics?: string }>>({});
  const reportRef = useRef<ImportedReport | null>(null);
  const workspaceRef = useRef<BenchmarkWorkspace>(blankWorkspace());
  const confirmedWorkspaceRef = useRef<BenchmarkWorkspace>(blankWorkspace());
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mutationSequenceRef = useRef(0);
  const latestItemMutationRef = useRef<Record<string, number>>({});
  const reportLoadSequenceRef = useRef(0);
  const headings = useMemo(() => report ? extractHeadings(report.content) : [], [report]);
  const imported = new URLSearchParams(window.location.search).has('imported');

  useEffect(() => {
    let active = true;
    const loadSequence = ++reportLoadSequenceRef.current;
    reportApi.get(reportId).then((value) => {
      if (!active || loadSequence !== reportLoadSequenceRef.current) return;
      const initialWorkspace = includeSelectedEntries(value.benchmark_workspace || blankWorkspace(), value.benchmark_selections);
      confirmedWorkspaceRef.current = initialWorkspace;
      applyLocalState(value, initialWorkspace);
      setWorkspaceSaveState('saved');
    }).catch((reason: unknown) => { if (active && loadSequence === reportLoadSequenceRef.current) setError(reason instanceof Error ? reason.message : 'Không mở được báo cáo.'); }).finally(() => { if (active && loadSequence === reportLoadSequenceRef.current) setLoading(false); });
    return () => { active = false; };
  }, [reportId]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedWorkspace()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [reportId]);

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
        if (latestItemMutationRef.current[key] === sequence) setItemFeedback((values) => ({ ...values, [key]: { kind: 'success', text: exists ? 'Removed from Benchmark. PO notes are preserved and can be restored.' : 'Added to Benchmark.' } }));
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
            setWorkspaceSaveError('Could not refresh the confirmed server state. Your local PO draft remains on this page; retry when the connection is available.');
          }
        }
        if (latestItemMutationRef.current[key] === sequence) {
          const failure = reason as Error & { diagnostics?: string };
          setItemFeedback((values) => ({ ...values, [key]: { kind: 'error', text: reason instanceof Error ? reason.message : 'Could not update Benchmark. Try again.', diagnostics: failure?.diagnostics } }));
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
          if (workspaceFingerprint(mergedWorkspace) === workspaceFingerprint(serverWorkspace)) setNotice('Đã lưu PO Assessment, Notes và Next Action.');
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
  if (error && !report) return <section className="research-panel report-view-state"><div className="research-alert" role="alert">{error}</div><a className="primary-action" href="/">Quay lại Research</a></section>;
  if (!report) return null;

  const data = report.research_data;
  const researchStatus = report.research_status || (report.parse_status === 'PARSED' ? 'STRUCTURED_READY' : 'TEXT_ONLY');
  const keyTakeaways = data.key_takeaways ?? [];
  const hasStructured = Boolean(data.executive_summary || keyTakeaways.length || data.findings.length + data.entities.length + data.benchmark_dimensions.length + data.research_gaps.length + data.po_recommendations.length > 0);
  const assessmentItems: { item: BenchmarkSelection; label: string; kind: string }[] = [
    ...data.findings.map((finding) => ({ item: { item_type: 'finding' as const, item_key: finding.key }, label: finding.title, kind: displayResearchType(finding.finding_type) })),
    ...data.entities.map((entity) => ({ item: { item_type: 'entity' as const, item_key: entity.key }, label: entity.name, kind: displayResearchType(entity.entity_type) })),
    ...data.benchmark_dimensions.map((dimension) => ({ item: { item_type: 'dimension' as const, item_key: dimension.key }, label: dimension.name, kind: 'Research dimension' })),
    ...workspace.entries.filter((entry) => !data.findings.some((finding) => finding.key === entry.item_key) && !data.entities.some((entity) => entity.key === entry.item_key) && !data.benchmark_dimensions.some((dimension) => dimension.key === entry.item_key)).map((entry) => ({ item: { item_type: entry.item_type, item_key: entry.item_key }, label: entry.item_key, kind: 'Preserved workspace item' })),
  ];
  const tabs: { id: Tab; label: string; icon: ResultsIconName; visible: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: 'snapshot', visible: true },
    { id: 'insights', label: 'Insights', icon: 'findings', visible: data.findings.length > 0 },
    { id: 'entities', label: 'Entities', icon: 'entity', visible: data.entities.length > 0 },
    { id: 'benchmark', label: 'Benchmark', icon: 'comparison', visible: data.entities.length + data.findings.length + data.benchmark_dimensions.length > 0 || report.benchmark_selections.length > 0 },
    { id: 'decisions', label: 'PO Assessment', icon: 'decision', visible: assessmentItems.length > 0 || workspace.entries.length > 0 || data.po_recommendations.length > 0 },
    { id: 'evidence', label: 'Evidence', icon: 'evidence', visible: data.evidence_references.length > 0 },
    { id: 'report', label: 'Full Report', icon: 'reports', visible: true },
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
    const actionText = isActive ? 'Remove from Benchmark' : hasSavedEntry ? 'Restore to Benchmark' : 'Add to Benchmark';
    return <div className="benchmark-card-actions">
      <button className={isActive ? 'text-button' : 'secondary-action'} aria-label={`${actionText}${label ? `: ${label}` : ''}`} onClick={() => void toggleSelection(item)}>{pending ? (pending === 'adding' ? 'Adding…' : 'Removing…') : actionText}</button>
      {isActive && <button className="text-button" onClick={() => setTab('benchmark')}>Xem Benchmark</button>}
      {feedback && <span className={feedback.kind === 'error' ? 'inline-action-error' : 'inline-action-success'} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}{feedback.diagnostics && <details className="inline-diagnostics"><summary>Technical details</summary><code>{feedback.diagnostics}</code></details>}</span>}
    </div>;
  }

  function relatedEntityCandidates(finding: ResearchData['findings'][number]) {
    const candidates = data.entities.filter((entity) => finding.related_entities.includes(entity.key));
    if (!candidates.length) return null;
    return <section className="related-entity-candidates"><h5>Related research subjects</h5><p>Choose only subjects that should be compared. Research type alone does not classify an item as a product.</p><ul>{candidates.map((entity) => {
      const attributes = Object.entries(entity.attributes).filter(([, value]) => value !== null && value !== undefined && value !== '');
      const descriptionEntry = attributes.find(([key]) => ['description', 'summary', 'context'].includes(key.toLocaleLowerCase()));
      const technicalAttributes = attributes.filter(([key]) => key !== descriptionEntry?.[0]);
      const description = descriptionEntry?.[1];
      const descriptionText = typeof description === 'string' ? description : description ? JSON.stringify(description) : '';
      return <li key={entity.key}>
        <div className="related-entity-copy"><div className="related-entity-heading"><strong>{entity.name}</strong><span>{entity.entity_type}</span></div>
          {descriptionText && <p>{descriptionText}</p>}
          {technicalAttributes.length > 0 && <details className="related-entity-attributes"><summary>Show attributes ({technicalAttributes.length})</summary><dl>{technicalAttributes.map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></details>}
        </div>
        <div className="related-entity-action">{benchmarkAction({ item_type: 'entity', item_key: entity.key }, entity.name)}</div>
      </li>;
    })}</ul></section>;
  }

  function scopeLabel(scope: Record<string, unknown>): string {
    const labels: Record<string, string> = { geo: 'GEO', environment: 'Environment', platform: 'Platform', os: 'Operating system', period: 'Research period', research_period: 'Research period', time_period: 'Time period', date_range: 'Date range', region: 'Region', country: 'Country', segment: 'Segment', language: 'Language', currency: 'Currency' };
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
      {item.item_type === 'dimension' && Object.entries(entry.dimension_assessments || {}).filter(([dimension]) => !workspace.custom_dimensions.includes(dimension)).map(([dimension, value]) => <label className="intake-field legacy-dimension-assessment" key={dimension}><span className="field-label">Legacy dimension assessment · {dimension}</span><textarea aria-label={`Legacy dimension assessment ${dimension} for ${label}`} value={value} onChange={(event) => changeDimensionAssessment(item, dimension, event.target.value)} /></label>)}
      {workspace.custom_dimensions.map((dimension) => <label className="intake-field" key={dimension}><span className="field-label">{dimension}</span><textarea aria-label={`${dimension} assessment for ${label}`} value={entry.dimension_assessments?.[dimension] || ''} onChange={(event) => changeDimensionAssessment(item, dimension, event.target.value)} /></label>)}
      <label className="intake-field"><span className="field-label">PO Assessment</span><textarea aria-label={`PO Assessment for ${label}`} value={entry.po_assessment} onChange={(event) => changeEntry(item, 'po_assessment', event.target.value)} /></label>
      <label className="intake-field"><span className="field-label">Notes</span><textarea aria-label={`Notes for ${label}`} value={entry.notes} onChange={(event) => changeEntry(item, 'notes', event.target.value)} /></label>
      <label className="intake-field"><span className="field-label">Next Action</span><textarea aria-label={`Next Action for ${label}`} value={entry.next_action} onChange={(event) => changeEntry(item, 'next_action', event.target.value)} /></label>
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
  const visibleMapFindings = mapFocusedFinding
    ? data.findings.filter((finding) => finding.key === mapFocusedFinding)
    : mapExpanded ? data.findings : data.findings.slice(0, 3);

  return <article className="report-viewer">
    {imported && <div className="research-success" role="status">{new URLSearchParams(window.location.search).has('duplicate') ? 'Báo cáo trùng đã mở từ History; dữ liệu gốc được giữ nguyên.' : 'Đã nhập báo cáo.'}</div>}
    <header className="research-panel report-meta results-header">
      <div className="results-breadcrumb"><a href="/" onClick={confirmWorkspaceNavigation}>Workspace</a><span aria-hidden="true">›</span><a href="/reports" onClick={confirmWorkspaceNavigation}>Reports</a><span aria-hidden="true">›</span><span>{report.question}</span></div>
      <div className="results-title-row"><div className="results-title-copy"><span className="field-label">RESEARCH REPORT · IMPORTED {new Date(report.imported_at).toLocaleString()}</span><h2>{report.question}</h2><p className="results-context"><span>{report.geo || 'GEO not specified'}</span><span>{report.os || 'Environment not specified'}</span>{report.research_period && <span>{report.research_period}</span>}<span>{report.origin === 'chatgpt_user_import' ? 'ChatGPT user import' : report.origin}</span><span className="quantitative-context">Qualitative research · No quantitative dataset linked</span></p></div><div className="results-header-actions"><span className={`results-status${researchStatus === 'TEXT_ONLY' ? ' is-text-only' : ''}`}>{researchStatus === 'STRUCTURED_READY' ? 'Structured results' : researchStatus === 'STRUCTURED_PARTIAL' ? 'Partially structured' : 'Text only'}</span><a className="text-button results-back-link" href="/reports" onClick={confirmWorkspaceNavigation}>← Back to Reports</a></div></div>
    </header>
    {error && <div className="research-alert" role="alert">{error}</div>}{notice && <div className="research-success" role="status">{notice}</div>}
    {(report.orphaned_benchmark_selections?.length || report.orphaned_benchmark_entries?.length) ? <div className="research-alert" role="alert">Có {(report.orphaned_benchmark_selections?.length || 0) + (report.orphaned_benchmark_entries?.length || 0)} benchmark reference/PO note đang trỏ tới keys không còn trong structured data. Dữ liệu được giữ nguyên; xem tab Benchmark để xử lý references khi cần.</div> : null}
    <nav className="report-tabs" aria-label="Research result sections" role="tablist">{visibleTabs.map((item, index) => <button key={item.id} role="tab" aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? 'active' : ''} onKeyDown={(event) => handleTabKeyDown(event, index)} onClick={() => setTab(item.id)}><ResultsIcon name={item.icon} />{item.label}</button>)}</nav>
    {!hasStructured && <details className="research-panel structuring-callout"><summary>{report.research_status || 'TEXT_ONLY'} · Structure this report</summary><p>The original report stays intact. The app does not turn headings or prose into findings. Use ChatGPT Plus to structure the report; existing PO notes remain available.</p><div className="intake-actions"><button className="secondary-action" type="button" disabled={busy} onClick={reprocess}>Reprocess deterministic</button><button className="secondary-action" type="button" disabled={busy} onClick={copyStructuringPrompt}>Prepare ChatGPT prompt</button></div>{structurePrompt && <label className="intake-field"><span className="field-label">Prompt for ChatGPT Plus</span><textarea rows={10} readOnly value={structurePrompt} onFocus={(event) => event.currentTarget.select()} /></label>}<label className="intake-field"><span className="field-label">Paste the complete ChatGPT response</span><textarea rows={12} value={structureResponse} onChange={(event) => setStructureResponse(event.target.value)} placeholder="Paste the full response with PO_RESEARCH_V1 and JSON payload." /></label><button className="primary-action" type="button" disabled={busy || !structureResponse.trim()} onClick={() => void applyStructuringResponse()}>{busy ? 'Updating…' : 'Update this report'}</button>{report.extraction_error && <p className="field-error">Could not apply the previous structure: {report.extraction_error}</p>}</details>}
    {tab === 'overview' && <section className="results-overview" aria-label="Overview">
      <div className={`overview-synthesis-grid${keyTakeaways.length ? '' : ' is-summary-only'}`}>
        {data.executive_summary && <section className="research-panel executive-card"><div className="overview-section-heading"><OverviewHeading icon="conclusion" eyebrow="RESEARCH CONCLUSION" title="Research conclusion" /></div><p className={`executive-summary${summaryExpanded ? ' is-expanded' : ''}`}><ResearchTextHighlighter text={data.executive_summary} /></p><button className="text-button summary-toggle" aria-expanded={summaryExpanded} onClick={() => setSummaryExpanded(!summaryExpanded)}>{summaryExpanded ? 'Show less' : 'Read full summary'}</button></section>}
        {keyTakeaways.length > 0 && <section className="research-panel overview-takeaways"><div className="overview-section-heading"><OverviewHeading icon="takeaways" eyebrow="REPORT-SUPPLIED" title="Key takeaways" /></div><ol>{(takeawaysExpanded ? keyTakeaways : keyTakeaways.slice(0, 3)).map((item, index) => <li key={index}><span className="takeaway-number">{index + 1}</span><span className="takeaway-copy"><ResearchTextHighlighter text={item} /></span></li>)}</ol>{keyTakeaways.length > 3 && <button className="text-button" aria-expanded={takeawaysExpanded} onClick={() => setTakeawaysExpanded(!takeawaysExpanded)}>{takeawaysExpanded ? 'Show fewer takeaways' : `View all ${keyTakeaways.length} takeaways`}</button>}</section>}
      </div>
      <div className="overview-main-grid">
        <section className="research-panel overview-insights"><div className="overview-section-heading"><OverviewHeading icon="findings" eyebrow="REPORT-SUPPLIED CONCLUSIONS" title="Key findings" detail={data.findings.length ? `${data.findings.length} from this research` : undefined} />{data.findings.length > 0 && <button className="text-button" onClick={() => setTab('insights')}>View all findings <ResultsIcon name="arrow" /></button>}</div>
          {data.findings.length > 0 ? <div className="finding-groups"><div className="insight-dashboard-list">{data.findings.map((finding) => {
            const refs = finding.evidence_references.map((url) => data.evidence_references.find((source) => source.url === url)).filter((source): source is NonNullable<typeof source> => Boolean(source));
            const related = data.entities.filter((entity) => finding.related_entities.includes(entity.key));
            return <article className="finding-map-card" key={finding.key}><button className="insight-dashboard-card" aria-label={`View Insight: ${finding.title}`} onClick={() => { setActiveFinding(finding.key); setTab('insights'); }}><span className="finding-icon-frame"><ResultsIcon name={findingIcon(finding.finding_type)} /></span><span className="insight-dashboard-copy"><span className="insight-type">{displayResearchType(finding.finding_type)}</span><strong><ResearchTextHighlighter text={finding.title} /></strong><span><ResearchTextHighlighter text={finding.description} /></span></span><span className="insight-open">View insight <ResultsIcon name="arrow" /></span></button>
              <div className="finding-card-evidence"><span className="evidence-count"><ResultsIcon name="evidence" />{refs.length} {refs.length === 1 ? 'source reference' : 'source references'}</span><span>{refs.length ? `${displayResearchType(finding.evidence_status)} · unverified` : 'No source references · unverified'}</span></div>
              <details className="finding-card-details"><summary>Related context and actions</summary><div className="finding-card-details-content">{related.length > 0 && <div className="finding-related"><b>Related entities</b><div>{related.map((entity) => <span className="relationship-chip" key={entity.key}>{entity.name}</span>)}</div></div>}{finding.po_implications && <p className="finding-po-implication"><b>Report-supplied PO implication</b><ResearchTextHighlighter text={finding.po_implications} /></p>}{refs.length > 0 && <div className="finding-supporting-sources"><b>Supporting source references · unverified</b><ul>{refs.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a></li>)}</ul></div>}<div className="finding-card-actions"><button className="text-button" onClick={() => openPoAssessment({ item_type: 'finding', item_key: finding.key })}>Record PO decision</button>{benchmarkAction({ item_type: 'finding', item_key: finding.key }, finding.title)}</div></div></details>
            </article>;
          })}</div></div> : <div className="overview-empty"><h4>{hasStructured ? 'No findings in this report' : 'This report needs semantic structure'}</h4><p>{hasStructured ? 'The report includes other structured information. No findings have been invented from its headings or prose.' : 'Only the original report is available. Add a structured ChatGPT response above to explore findings, evidence and comparisons.'}</p>{!hasStructured && <button className="secondary-action" onClick={() => document.querySelector('.structuring-callout')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Structure this report</button>}</div>}
        </section>
        <aside className="overview-side-column">
          <section className="research-panel overview-snapshot"><div className="overview-section-heading"><OverviewHeading icon="snapshot" eyebrow="AT A GLANCE" title="Research snapshot" /></div><dl><div><dt><ResultsIcon name="findings" />Findings</dt><dd>{data.findings.length}</dd></div><div><dt><ResultsIcon name="entity" />Research entities</dt><dd>{data.entities.length}</dd></div><div><dt><ResultsIcon name="evidence" />Source references</dt><dd>{data.evidence_references.length}</dd></div><div><dt><ResultsIcon name="gaps" />Research gaps</dt><dd>{data.research_gaps.length}</dd></div></dl></section>
          {data.research_gaps.length > 0 && <section className="research-panel overview-gaps"><div className="overview-section-heading"><OverviewHeading icon="gaps" eyebrow="WHAT REMAINS UNKNOWN" title="Research gaps" /></div><ul>{(gapsExpanded ? data.research_gaps : data.research_gaps.slice(0, 4)).map((gap, index) => <li key={index}>{gap}</li>)}</ul>{data.research_gaps.length > 4 && <button className="text-button" aria-expanded={gapsExpanded} onClick={() => setGapsExpanded(!gapsExpanded)}>{gapsExpanded ? 'Show fewer gaps' : `View all ${data.research_gaps.length} gaps`}</button>}</section>}
          <section className="research-panel overview-decisions"><div className="overview-section-heading"><OverviewHeading icon="decision" eyebrow="PRODUCT OWNER WORKSPACE" title="PO next steps" /></div>{data.po_recommendations.length > 0 && <div className="recommendations-block"><strong>Research recommendations</strong><ul>{data.po_recommendations.slice(0, 2).map((recommendation, index) => <li key={index}>{recommendation}</li>)}</ul><small>Supplied by the report · not PO decisions</small></div>}{savedPoEntries.length > 0 && <div className="saved-po-block"><strong>Saved PO decision</strong>{savedPoEntries.slice(0, 1).map((entry) => { const label = assessmentItems.find(({ item }) => item.item_type === entry.item_type && item.item_key === entry.item_key)?.label || entry.item_key; return <p key={`${entry.item_type}:${entry.item_key}`}><b>{label}</b>{entry.po_assessment || entry.next_action || entry.notes}</p>; })}</div>}<button className="primary-action" onClick={() => setTab('decisions')}>Review PO assessment <ResultsIcon name="arrow" /></button><button className="text-button" onClick={() => setTab('evidence')}>Review evidence · {data.evidence_references.length}</button>{data.entities.length > 0 && <button className="text-button" onClick={() => setTab('benchmark')}>{selectedEntityCount ? `Open Benchmark · ${selectedEntityCount} selected` : 'Open Benchmark'}</button>}</section>
        </aside>
      </div>
      {data.findings.length > 0 && <section className="research-panel overview-research-map"><div className="overview-section-heading"><OverviewHeading icon="map" eyebrow="EXPLICIT REPORT RELATIONSHIPS" title="Research map" /> <button className="text-button" onClick={() => setTab('insights')}>Explore details <ResultsIcon name="arrow" /></button></div><p className="overview-muted">Select a finding to focus its supplied links. Only relationships explicitly present in the report are shown.</p>{mapFocusedFinding && <div className="research-map-focus" role="status"><span>Focused on: {data.findings.find((finding) => finding.key === mapFocusedFinding)?.title}</span><button className="text-button" onClick={() => setMapFocusedFinding(null)}>Clear focus</button></div>}<div className="research-map-board" role="list" aria-label="Finding relationships"><div className="research-map-columns" aria-hidden="true"><span>Finding</span><span>Explicitly related entity</span><span>PO implication</span></div>{visibleMapFindings.map((finding) => { const related = [...new Map(data.entities.filter((entity) => finding.related_entities.includes(entity.key)).map((entity) => [entity.key, entity])).values()]; return <article className={`research-map-row${related.length ? ' has-entities' : ' is-unlinked'}${mapFocusedFinding === finding.key ? ' is-focused' : ''}`} key={finding.key} role="listitem"><button className="research-map-node research-map-finding" aria-pressed={mapFocusedFinding === finding.key} onClick={() => setMapFocusedFinding(mapFocusedFinding === finding.key ? null : finding.key)}><span className="research-map-node-icon"><ResultsIcon name={findingIcon(finding.finding_type)} /></span><span><small>{displayResearchType(finding.finding_type)}</small><strong>{finding.title}</strong></span></button><span className={`research-map-connector${related.length ? ' is-connected' : ''}`} aria-hidden="true" />{related.length > 0 ? <div className="research-map-entities">{related.map((entity) => <div className="research-map-node research-map-entity" key={entity.key}><ResultsIcon name="entity" /><strong>{entity.name}</strong></div>)}</div> : <div className="research-map-empty">No entity link supplied</div>}<span className={`research-map-connector${related.length && finding.po_implications ? ' is-connected' : ''}`} aria-hidden="true" />{finding.po_implications ? <div className="research-map-node research-map-implication"><ResultsIcon name="decision" /><span><small>PO implication</small><strong>{finding.po_implications}</strong></span></div> : <div className="research-map-empty">No PO implication supplied</div>}</article>; })}</div>{data.findings.length > 3 && !mapFocusedFinding && <button className="secondary-action research-map-toggle" aria-expanded={mapExpanded} onClick={() => setMapExpanded(!mapExpanded)}>{mapExpanded ? 'Show fewer relationships' : `Show all relationships · ${data.findings.length}`}</button>}</section>}
      <details className="results-fact-strip"><summary>Report details</summary><div><span>{data.findings.length} findings</span><span>{data.entities.length} research entities</span><span>{data.evidence_references.length} source references</span><span>{data.research_gaps.length} research gaps</span></div></details>
    </section>}
    {tab === 'insights' && <section className="research-panel results-panel insight-detail-page"><div className="panel-heading"><div><span className="field-label">REPORT-SUPPLIED CONCLUSIONS</span><h3>Insights</h3></div></div><div className="insight-workspace"><nav className="insight-list" aria-label="Report findings">{data.findings.map((finding) => <button className={`insight-list-item${selectedFindingKey === finding.key ? ' active' : ''}`} key={finding.key} aria-pressed={selectedFindingKey === finding.key} onClick={() => { setActiveFinding(finding.key); setSupportFinding(null); }}><span>{displayResearchType(finding.finding_type)} · {finding.evidence_status}</span><strong><ResearchTextHighlighter text={finding.title} /></strong><small>{finding.evidence_references.length} source references · unverified</small></button>)}</nav>{selectedFinding ? (() => { const finding = selectedFinding; const locations = [...(finding.source_locations || []), ...finding.evidence_references.flatMap((url) => data.evidence_references.filter((source) => source.url === url && source.source_location).map((source) => source.source_location!))]; const excerpt = excerptAtLocations(report.content, locations); const metrics = findingMetrics(finding.key); return <article className="insight-detail-panel" id={`finding-${finding.key}`}><span className="field-label">{displayResearchType(finding.finding_type)} · report-supplied</span><h4><ResearchTextHighlighter text={finding.title} /></h4><section className="insight-finding-copy"><h5>Finding</h5><p><ResearchTextHighlighter text={finding.description} /></p></section>{scopeLabel(finding.scope) && <section><h5>Research scope</h5><p><ResearchTextHighlighter text={scopeLabel(finding.scope)!} /></p></section>}{finding.po_implications && <section className="insight-po-recommendation"><h5>Report's PO implication</h5><p><ResearchTextHighlighter text={finding.po_implications} /></p></section>}{finding.uncertainty && <section><h5>What is uncertain</h5><p><ResearchTextHighlighter text={finding.uncertainty} /></p></section>}{metrics.length > 0 && <section><h5>PO-confirmed related observations</h5><ul>{metrics.map((metric, index) => <li key={`${metric.dimension}-${index}`}><strong>{metric.dimension}:</strong> <ResearchTextHighlighter text={metric.value} /> <EvidenceLinks urls={metric.urls} references={data.evidence_references} /></li>)}</ul></section>}{relatedEntityCandidates(finding)}<section><h5>Supporting source references · {finding.evidence_status} · unverified</h5><EvidenceLinks urls={finding.evidence_references} references={data.evidence_references} /></section><button className="text-button" aria-expanded={supportFinding === finding.key} onClick={() => setSupportFinding(supportFinding === finding.key ? null : finding.key)}>View support in original report</button>{supportFinding === finding.key && <div className="support-excerpt">{excerpt.length ? excerpt.map((line) => <pre key={line}>{line}</pre>) : <p>No reliable source location was provided. The app will not invent one; use Full Report to review the original content.</p>}</div>}<div className="finding-card-actions"><button className="secondary-action" onClick={() => openPoAssessment({ item_type: 'finding', item_key: finding.key })}>Record PO decision</button>{benchmarkAction({ item_type: 'finding', item_key: finding.key }, finding.title)}</div></article>; })() : <p className="overview-empty-copy">No findings were supplied.</p>}</div></section>}
    {tab === 'entities' && <section className="research-panel results-panel"><h3>Entities</h3><div className="dynamic-card-grid">{data.entities.map((entity) => <article className="dynamic-card" key={entity.key}><span className="field-label">{entity.entity_type}</span><h4>{entity.name}</h4>{Object.entries(entity.attributes).map(([key, value]) => <p key={key}><strong>{key.replaceAll('_', ' ')}:</strong> {String(value)}</p>)}<EvidenceLinks urls={entity.evidence_references} references={data.evidence_references} />{benchmarkAction({ item_type: 'entity', item_key: entity.key })}</article>)}</div></section>}
    {tab === 'benchmark' && <section className="research-panel results-panel benchmark-workspace"><h3>{selectedEntityRows.length > 0 ? (selectedEntityRows.length === 1 ? 'Subject assessment' : 'Research subject comparison') : 'Insight assessment'}</h3><p className="benchmark-intro">Only explicitly selected research subjects appear as rows. Entity type remains visible; an Insight alone never selects its related subjects. Missing observations are shown as Unknown.</p>
      {selectedEntityRows.length > 0 && <>
        <label className="intake-field"><span className="field-label">Add a comparison dimension</span><div className="dimension-add"><input aria-label="PO dimension" value={newDimension} onChange={(event) => setNewDimension(event.target.value)} placeholder="What should the PO compare?" /><button className="secondary-action" disabled={!newDimension.trim() || busy} onClick={() => void addCustomDimension()}>Add dimension</button></div></label>
        {dimensions.length > 0 && <div className="benchmark-table-wrap"><table className="benchmark-table"><thead><tr><th>Comparison target / subject</th>{dimensions.map((dimension) => <th key={dimension.key}>{dimension.name}{dimension.custom ? ' · PO-defined' : ''}</th>)}</tr></thead><tbody>{selectedEntityRows.map((entity) => { const item: BenchmarkSelection = { item_type: 'entity', item_key: entity.key }; const entry = workspace.entries.find((candidate) => candidate.item_type === 'entity' && candidate.item_key === entity.key); return <tr key={entity.key}><th><strong>{entity.name}</strong><small>{entity.entity_type} · explicitly selected</small>{benchmarkAction(item, entity.name)}</th>{dimensions.map((dimension) => { const found = dimension.custom ? null : observation(item, dimension.key); const poValue = dimension.custom ? entry?.dimension_assessments?.[dimension.name] : undefined; const supportKeys = !dimension.custom && found ? supportingFindings(entity.key, dimension.key) : []; const candidates = !dimension.custom && found ? data.findings.filter((finding) => finding.related_entities.includes(entity.key)) : []; const preservedKeys = entry?.observation_finding_links?.[dimension.key] ?? []; return <td key={dimension.key}>{dimension.custom ? <textarea aria-label={`${dimension.name} assessment for ${entity.name}`} value={poValue || ''} onChange={(event) => changeDimensionAssessment(item, dimension.name, event.target.value)} placeholder="PO assessment" /> : found ? <><span>{found.value === null || found.value === undefined || found.value === '' ? 'Unknown / Not provided' : String(found.value)}</span><small>{found.status} · source-provided, not independently verified{found.uncertainty ? ` · ${found.uncertainty}` : ''}</small>{found.urls.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Evidence</a>)}{supportKeys.map((key) => { const finding = data.findings.find((candidate) => candidate.key === key); return finding ? <button className="text-button" key={key} onClick={() => { setActiveFinding(key); setTab('insights'); }}>PO-confirmed insight: {finding.title}</button> : <small key={key}>Previously confirmed insight reference unavailable ({key}); preserved without remapping.</small>; })}{!supportKeys.length && <small>No confirmed supporting insight.</small>}{candidates.length > 0 && <label className="observation-link-control"><span>Confirm supporting insight (PO)</span><select aria-label={`Confirm supporting insight for ${entity.name} / ${dimension.name}`} value={supportKeys[0] || ''} onChange={(event) => updateObservationFindingLink(item, dimension.key, event.target.value)}><option value="">No confirmed supporting insight</option>{preservedKeys.filter((key) => !candidates.some((finding) => finding.key === key)).map((key) => <option key={key} value={key}>Unavailable prior reference ({key})</option>)}{candidates.map((finding) => <option key={finding.key} value={finding.key}>{finding.title}</option>)}</select></label>}</> : <span>Unknown / Not provided</span>}</td>; })}</tr>; })}</tbody></table></div>}
        <section className="benchmark-assessments"><h4>PO assessment and decisions</h4>{selectedEntityRows.map((entity) => { const item: BenchmarkSelection = { item_type: 'entity', item_key: entity.key }; return <details className="benchmark-po-entry" key={entity.key}><summary><strong>{entity.name}</strong><span>Assessment, notes and next action</span></summary><div className="benchmark-assessment-entry-actions">{benchmarkAction(item, entity.name)}</div>{poAssessmentFields(item, entity.name)}</details>; })}</section>
      </>}
      {selectedFindings.length > 0 && <section className="benchmark-assessments"><h4>{selectedEntityRows.length > 0 ? 'Supporting insights' : 'Contextual insight assessment'}</h4>{selectedFindings.map(({ selection, finding }) => <details className="benchmark-po-entry" key={finding.key}><summary><strong>{finding.title}</strong><span>{finding.finding_type} · {finding.evidence_status}</span></summary><div className="insight-result-detail"><p>{finding.description}</p>{scopeLabel(finding.scope) && <p><strong>Scope:</strong> {scopeLabel(finding.scope)}</p>}{finding.uncertainty && <p><strong>Uncertainty:</strong> {finding.uncertainty}</p>}<EvidenceLinks urls={finding.evidence_references} references={data.evidence_references} />{poAssessmentFields(selection, finding.title)}</div></details>)}</section>}
      {(legacyDimensions.length > 0 || orphanedDimensionEntries.length > 0) && <section className="benchmark-assessments legacy-dimension-section"><h4>Legacy dimension assessments and notes</h4><p>Historical dimension notes stay under their original keys. Removing a dimension from the active Benchmark does not delete its historical notes.</p>
        {legacyDimensions.map((dimension) => { const item: BenchmarkSelection = { item_type: 'dimension', item_key: dimension.key }; const entry = workspace.entries.find((candidate) => candidate.item_type === 'dimension' && candidate.item_key === dimension.key); return <details className="benchmark-po-entry" key={dimension.key}><summary><strong>{dimension.name}</strong><span>{isSelected(item) ? 'Active in Benchmark' : 'Not active'} · legacy dimension</span></summary><p className="legacy-stored-key">Stored dimension key: <code>{dimension.key}</code></p>{dimension.po_notes && <section className="legacy-historical-notes"><h5>Historical legacy PO notes · preserved</h5><p>{dimension.po_notes}</p></section>}{benchmarkAction(item, dimension.name)}{(isSelected(item) || entry) && <section><h5>Current PO workspace fields</h5>{entry ? poAssessmentFields(item, dimension.name) : <p>Adding this legacy dimension creates a separate PO workspace entry; its historical notes stay unchanged.</p>}</section>}</details>; })}
        {orphanedDimensionKeys.map((key) => { const item: BenchmarkSelection = { item_type: 'dimension', item_key: key }; const entry = workspace.entries.find((candidate) => candidate.item_type === 'dimension' && candidate.item_key === key); return <details className="benchmark-po-entry" key={`orphan:${key}`}><summary><strong>Unavailable legacy dimension</strong><span>Historical entry · key preserved</span></summary><p className="legacy-stored-key">Stored dimension key: <code>{key}</code>. It was not mapped to a different dimension.</p>{isSelected(item) && benchmarkAction(item, key)}{entry && <><h5>Historical PO workspace fields</h5>{poAssessmentFields(entry, key)}</>}</details>; })}
      </section>}
      {inactiveWorkspaceEntries.length > 0 && <section className="benchmark-assessments inactive-po-drafts"><h4>Saved PO drafts · not active in Benchmark</h4><p>These notes are preserved after removing their item from the active comparison.</p>{inactiveWorkspaceEntries.map((entry) => { const item: BenchmarkSelection = { item_type: entry.item_type, item_key: entry.item_key }; const label = entry.item_type === 'entity' ? data.entities.find((entity) => entity.key === entry.item_key)?.name : data.findings.find((finding) => finding.key === entry.item_key)?.title; return <details className="benchmark-po-entry" key={`${entry.item_type}:${entry.item_key}`}><summary><strong>{label || entry.item_key}</strong><span>Saved PO draft · inactive</span></summary>{benchmarkAction(item, label || entry.item_key)}{poAssessmentFields(item, label || entry.item_key)}</details>; })}</section>}
      {selectedEntityRows.length === 0 && selectedFindings.length === 0 && selectedDimensions.length === 0 && inactiveWorkspaceEntries.length === 0 && <p className="report-history-state">Select an entity or add an insight from its evidence details to begin.</p>}
      {(selectedEntityRows.length > 0 || selectedFindings.length > 0 || selectedDimensions.length > 0 || orphanedDimensionEntries.length > 0 || inactiveWorkspaceEntries.length > 0) && <div className="benchmark-save-controls"><p className={`benchmark-save-state is-${workspaceSaveState}`} role="status" aria-live="polite">{workspaceSaveState === 'saved' ? 'Saved · all PO edits are confirmed on the server.' : workspaceSaveState === 'unsaved' ? 'Unsaved changes · PO edits are still only on this page.' : workspaceSaveState === 'saving' ? 'Saving · saving PO edits…' : 'Save failed · PO edits remain on this page. Retry when ready.'}</p>{workspaceSaveError && <p className="research-alert" role="alert">{workspaceSaveError}</p>}<button className="primary-action" disabled={workspaceSaveState === 'saving' || !hasUnsavedWorkspace()} onClick={() => void saveWorkspace()}>{workspaceSaveState === 'failed' ? 'Retry save' : workspaceSaveState === 'saving' ? 'Saving…' : 'Save assessments and next actions'}</button></div>}
    </section>}
    {tab === 'decisions' && <section className="research-panel results-panel po-decisions-page"><div className="panel-heading"><div><span className="field-label">PRODUCT OWNER WORKSPACE</span><h3>PO Assessment & Next Action</h3></div><span className={`benchmark-save-state is-${workspaceSaveState}`} role="status">{workspaceSaveState === 'saved' ? 'Saved' : workspaceSaveState === 'unsaved' ? 'Unsaved changes' : workspaceSaveState === 'saving' ? 'Saving…' : 'Save failed'}</span></div><p className="decision-workflow-intro">Research recommendations come from the report. Use this workspace to record your own assessment and next action. These fields use the existing report workspace and do not add items to Benchmark.</p>
      <div className="decision-workflow-grid"><nav className="decision-item-list" aria-label="Research items for PO decision">{assessmentItems.length ? assessmentItems.map(({ item, label, kind }) => <button key={selectionId(item)} className={activeDecisionItem && selectionId(activeDecisionItem.item) === selectionId(item) ? 'active' : ''} onClick={() => openPoAssessment(item)}><span>{kind}</span><strong>{label}</strong><small>{confirmedWorkspaceRef.current.entries.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key && (entry.po_assessment || entry.next_action || entry.notes)) ? 'PO decision saved' : 'No PO decision yet'}</small></button>) : <p className="overview-muted">This report has no structured finding, entity, or comparison dimension to assess.</p>}</nav>
        {activeDecisionItem ? <section className="decision-editor"><span className="field-label">YOUR DECISION</span><h4>{activeDecisionItem.label}</h4><p className="overview-muted">{activeDecisionItem.kind} · PO-owned notes</p>{poAssessmentFields(activeDecisionItem.item, activeDecisionItem.label)}</section> : <div className="overview-empty"><h4>Choose a research item</h4><p>Select a finding, subject, or dimension from this report to write an assessment and next action.</p></div>}
      </div>
      {workspaceSaveError && <p className="research-alert" role="alert">{workspaceSaveError}</p>}
      <div className="benchmark-save-controls"><p className={`benchmark-save-state is-${workspaceSaveState}`} role="status" aria-live="polite">{workspaceSaveState === 'saved' ? 'Saved · PO decisions are confirmed on this report.' : workspaceSaveState === 'unsaved' ? 'Unsaved changes · edits are only on this page until saved.' : workspaceSaveState === 'saving' ? 'Saving PO assessment…' : 'Save failed · edits remain on this page. Retry when ready.'}</p><button className="primary-action" disabled={workspaceSaveState === 'saving' || !hasUnsavedWorkspace()} onClick={() => void saveWorkspace()}>{workspaceSaveState === 'failed' ? 'Retry save' : workspaceSaveState === 'saving' ? 'Saving…' : 'Save PO assessment'}</button></div>
    </section>}
    {tab === 'evidence' && <section className="research-panel results-panel"><h3>Evidence references</h3><p>These links were supplied in the report. Their presence does not verify a finding or the source contents.</p><ul className="evidence-results">{data.evidence_references.map((source) => <li key={source.url}><strong>{source.title || source.url}</strong><a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a><span>{source.source_location || 'No source location provided'} · Unverified</span></li>)}</ul></section>}
    {tab === 'report' && <section className="research-panel report-body full-report"><div className="panel-heading"><div><span className="field-label">ORIGINAL REPORT</span><h3>Full Report</h3></div><span className="unverified-chip">Verbatim</span></div>{headings.length > 0 && <nav className="report-toc" aria-label="Mục lục"><strong>Contents</strong><ol>{headings.map((heading, index) => <li key={`${heading.id}-${index}`} style={{ marginLeft: `${Math.max(0, heading.level - 1) * 8}px` }}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ol></nav>}<MarkdownReport markdown={report.content} /></section>}
    {report.structured_update_available && <div role="status" className="research-alert">This duplicate contains different structured results. They were not applied automatically; the saved report and PO workspace are unchanged.</div>}
  </article>;
}

function EvidenceLinks({ urls, references }: { urls: string[]; references: ResearchData['evidence_references'] }) {
  if (!urls.length) return <p className="unverified-chip">No evidence references provided · unverified</p>;
  return <ul className="evidence-link-list">{urls.map((url) => { const reference = references.find((item) => item.url === url); return <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{reference?.title || url}</a><small>{reference?.source_location || 'No source location provided'} · Unverified</small></li>; })}</ul>;
}
