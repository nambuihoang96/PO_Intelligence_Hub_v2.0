import { useEffect, useMemo, useRef, useState } from 'react';
import { reportApi, type BenchmarkSelection, type BenchmarkWorkspace, type BenchmarkWorkspaceEntry, type ImportedReport, type ResearchData } from './api';
import { extractHeadings, MarkdownReport } from './MarkdownReport';
import { buildStructuringPrompt } from './researchPrompt';

type Tab = 'overview' | 'insights' | 'entities' | 'benchmark' | 'evidence' | 'report';

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

function includeSelectedEntries(workspace: BenchmarkWorkspace, selections: BenchmarkSelection[]): BenchmarkWorkspace {
  const entries = [...workspace.entries];
  for (const item of selections) {
    if (!entries.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key)) entries.push({ ...item, po_assessment: '', notes: '', next_action: '', dimension_assessments: {}, observation_finding_links: {} });
  }
  return { ...workspace, entries };
}

export function ReportViewer({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<ImportedReport | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [structureResponse, setStructureResponse] = useState('');
  const [structurePrompt, setStructurePrompt] = useState('');
  const [workspace, setWorkspace] = useState<BenchmarkWorkspace>(blankWorkspace());
  const [newDimension, setNewDimension] = useState('');
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<Record<string, 'adding' | 'removing'>>({});
  const [itemFeedback, setItemFeedback] = useState<Record<string, { kind: 'success' | 'error'; text: string }>>({});
  const reportRef = useRef<ImportedReport | null>(null);
  const workspaceRef = useRef<BenchmarkWorkspace>(blankWorkspace());
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mutationSequenceRef = useRef(0);
  const latestItemMutationRef = useRef<Record<string, number>>({});
  const headings = useMemo(() => report ? extractHeadings(report.content) : [], [report]);
  const imported = new URLSearchParams(window.location.search).has('imported');

  useEffect(() => {
    reportApi.get(reportId).then((value) => {
      applyLocalState(value, includeSelectedEntries(value.benchmark_workspace || blankWorkspace(), value.benchmark_selections));
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Không mở được báo cáo.')).finally(() => setLoading(false));
  }, [reportId]);

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
      applyLocalState(updated, updated.benchmark_workspace || blankWorkspace());
      setNotice(successMessage);
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không cập nhật được báo cáo.'); return false; }
    finally { setBusy(false); }
  }

  async function reprocess() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await reportApi.reprocess(reportId);
      applyLocalState(result, result.benchmark_workspace || blankWorkspace()); setNotice(result.message);
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
    if (!current || pendingItems[key]) return;
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
        if (sequence === mutationSequenceRef.current) applyLocalState(saved, saved.benchmark_workspace || blankWorkspace());
        if (latestItemMutationRef.current[key] === sequence) setItemFeedback((values) => ({ ...values, [key]: { kind: 'success', text: exists ? 'Removed from Benchmark. PO notes are preserved and can be restored.' : 'Added to Benchmark.' } }));
      } catch (reason) {
        if (sequence === mutationSequenceRef.current) {
          try {
            const latest = await reportApi.get(current.id);
            applyLocalState(latest, includeSelectedEntries(latest.benchmark_workspace || blankWorkspace(), latest.benchmark_selections));
          } catch { /* Keep the last locally known server state if refresh also fails. */ }
        }
        if (latestItemMutationRef.current[key] === sequence) setItemFeedback((values) => ({ ...values, [key]: { kind: 'error', text: reason instanceof Error ? reason.message : 'Could not update Benchmark. Try again.' } }));
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

  async function saveWorkspace(next = workspace) {
    if (!reportRef.current) return;
    const persist = mutationQueueRef.current.then(async () => {
      const current = reportRef.current;
      if (!current) return;
      await applyReportUpdate(() => reportApi.updateBenchmarkState(current.id, current.benchmark_selections, next), 'Đã lưu PO Assessment, Notes và Next Action.');
    });
    mutationQueueRef.current = persist.then(() => undefined);
    await persist;
  }

  async function addCustomDimension() {
    const value = newDimension.trim();
    if (!value || workspace.custom_dimensions.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    const next = { ...workspace, custom_dimensions: [...workspace.custom_dimensions, value] };
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
  const tabs: { id: Tab; label: string; visible: boolean }[] = [
    { id: 'overview', label: 'Overview', visible: true },
    { id: 'insights', label: 'Insights', visible: data.findings.length > 0 },
    { id: 'entities', label: 'Entities', visible: data.entities.length > 0 },
    { id: 'benchmark', label: 'Benchmark', visible: data.entities.length + data.findings.length + data.benchmark_dimensions.length > 0 || report.benchmark_selections.length > 0 },
    { id: 'evidence', label: 'Evidence', visible: data.evidence_references.length > 0 },
    { id: 'report', label: 'Full Report', visible: true },
  ];
  const selected = report.benchmark_selections;
  const selectedFindings = selected.filter((item) => item.item_type === 'finding').flatMap((item) => {
    const finding = data.findings.find((entry) => entry.key === item.item_key);
    return finding ? [{ selection: item, finding }] : [];
  });
  const selectedEntityKeys = new Set(selected.filter((item) => item.item_type === 'entity').map((item) => item.item_key));
  const selectedEntityRows = data.entities.filter((item) => selectedEntityKeys.has(item.key));
  const dimensions = [...data.benchmark_dimensions.map((dimension) => ({ key: dimension.key, name: dimension.name, custom: false })), ...workspace.custom_dimensions.map((name) => ({ key: `po:${name}`, name, custom: true }))];

  function isSelected(item: BenchmarkSelection): boolean {
    return selected.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key);
  }

  function selectionId(item: BenchmarkSelection): string { return `${item.item_type}:${item.item_key}`; }

  function benchmarkAction(item: BenchmarkSelection, label?: string) {
    const id = selectionId(item);
    const pending = pendingItems[id];
    const feedback = itemFeedback[id];
    const isActive = isSelected(item);
    const hasSavedEntry = workspace.entries.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key);
    const actionText = isActive ? 'Remove from Benchmark' : hasSavedEntry ? 'Restore to Benchmark' : 'Add to Benchmark';
    return <div className="benchmark-card-actions">
      <button className={isActive ? 'text-button' : 'secondary-action'} disabled={Boolean(pending)} aria-label={`${actionText}${label ? `: ${label}` : ''}`} onClick={() => void toggleSelection(item)}>{pending ? (pending === 'adding' ? 'Adding…' : 'Removing…') : actionText}</button>
      {isActive && <button className="text-button" onClick={() => setTab('benchmark')}>Xem Benchmark</button>}
      {feedback && <span className={feedback.kind === 'error' ? 'inline-action-error' : 'inline-action-success'} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</span>}
    </div>;
  }

  function relatedEntityCandidates(finding: ResearchData['findings'][number]) {
    const candidates = data.entities.filter((entity) => finding.related_entities.includes(entity.key));
    if (!candidates.length) return null;
    return <section className="related-entity-candidates"><h5>Related research subjects</h5><p>Choose only subjects that should be compared. Research type alone does not classify an item as a product.</p><ul>{candidates.map((entity) => <li key={entity.key}><span><strong>{entity.name}</strong><small>{entity.entity_type}{Object.keys(entity.attributes).length ? ` · ${Object.entries(entity.attributes).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`).join('; ')}` : ''}</small></span>{benchmarkAction({ item_type: 'entity', item_key: entity.key }, entity.name)}</li>)}</ul></section>;
  }

  function scopeLabel(scope: Record<string, unknown>): string {
    return Object.entries(scope).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`).join(' · ');
  }

  function poAssessmentFields(item: BenchmarkSelection, label: string) {
    const entry = workspace.entries.find((candidate) => candidate.item_type === item.item_type && candidate.item_key === item.item_key);
    if (!entry) return null;
    return <div className="benchmark-po-fields">
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

  function findingMetrics(findingKey: string): { dimension: string; value: string; urls: string[] }[] {
    return data.benchmark_dimensions.flatMap((dimension) => dimension.observations
      .filter((observation) => observation.entity_key && supportingFindings(observation.entity_key, dimension.key).includes(findingKey) && observation.value !== null && observation.value !== undefined && observation.value !== '')
      .map((observation) => ({ dimension: dimension.name, value: typeof observation.value === 'string' ? observation.value : JSON.stringify(observation.value), urls: observation.evidence_references })));
  }

  return <article className="report-viewer">
    {imported && <div className="research-success" role="status">{new URLSearchParams(window.location.search).has('duplicate') ? 'Báo cáo trùng đã mở từ History; dữ liệu gốc được giữ nguyên.' : 'Đã nhập báo cáo.'}</div>}
    <header className="research-panel report-meta"><a className="text-button" href="/">← Quay lại Research</a><span className="field-label">RESEARCH RESULTS · {researchStatus}</span><h2>{report.question}</h2><dl><div><dt>Scope</dt><dd>{report.geo} · {report.os}</dd></div><div><dt>Research period</dt><dd>{report.research_period || 'Not provided'}</dd></div><div><dt>Import status</dt><dd>{researchStatus} · Imported, unverified</dd></div><div><dt>Imported</dt><dd>{new Date(report.imported_at).toLocaleString()}</dd></div></dl><a className="text-button" href="/reports">Mở History</a></header>
    {error && <div className="research-alert" role="alert">{error}</div>}{notice && <div className="research-success" role="status">{notice}</div>}
    {(report.orphaned_benchmark_selections?.length || report.orphaned_benchmark_entries?.length) ? <div className="research-alert" role="alert">Có {(report.orphaned_benchmark_selections?.length || 0) + (report.orphaned_benchmark_entries?.length || 0)} benchmark reference/PO note đang trỏ tới keys không còn trong structured data. Dữ liệu được giữ nguyên; xem tab Benchmark để xử lý references khi cần.</div> : null}
    {!hasStructured && <section className="research-panel structuring-callout"><strong>{report.research_status || 'TEXT_ONLY'} · cần cấu trúc ngữ nghĩa</strong><p>Đây là nội dung báo cáo gốc. Hệ thống không tự biến heading hoặc văn bản thành insight. Dùng ChatGPT Plus để cấu trúc report hiện có; báo cáo gốc và ghi chú PO sẽ được giữ nguyên.</p><div className="intake-actions"><button className="secondary-action" type="button" disabled={busy} onClick={reprocess}>Reprocess deterministic</button><button className="secondary-action" type="button" disabled={busy} onClick={copyStructuringPrompt}>Chuẩn hóa bằng ChatGPT Plus</button></div>{structurePrompt && <label className="intake-field"><span className="field-label">Prompt cho ChatGPT Plus</span><textarea rows={10} readOnly value={structurePrompt} onFocus={(event) => event.currentTarget.select()} /></label>}<label className="intake-field"><span className="field-label">Dán câu trả lời ChatGPT đầy đủ</span><textarea rows={12} value={structureResponse} onChange={(event) => setStructureResponse(event.target.value)} placeholder="Dán toàn bộ câu trả lời có marker PO_RESEARCH_V1 và JSON payload." /></label><button className="primary-action" type="button" disabled={busy || !structureResponse.trim()} onClick={() => void applyStructuringResponse()}>{busy ? 'Đang cập nhật…' : 'Cập nhật báo cáo hiện tại'}</button>{report.extraction_error && <p className="field-error">Không thể áp dụng cấu trúc trước đó: {report.extraction_error}</p>}</section>}
    <nav className="report-tabs" aria-label="Research result sections" role="tablist">{tabs.filter((item) => item.visible).map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    {tab === 'overview' && <section className="research-panel results-panel" aria-label="Overview"><h3>Overview</h3>{data.executive_summary && <p className="executive-summary">{data.executive_summary}</p>}{keyTakeaways.length > 0 && <section><h4>Key takeaways</h4><ul>{keyTakeaways.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}{data.findings.length > 0 && <section><h4>Key insights</h4><div className="insight-grid">{data.findings.map((finding) => { const metrics = findingMetrics(finding.key); return <details className="insight-card" key={finding.key}><summary><span className="field-label">{finding.finding_type} · {finding.evidence_status}</span><strong>{finding.title}</strong><span>{finding.description}</span></summary><div className="insight-card-detail">{scopeLabel(finding.scope) && <p><strong>Scope:</strong> {scopeLabel(finding.scope)}</p>}{metrics.map((metric, index) => <div className="insight-metric" key={`${metric.dimension}-${index}`}><strong>{metric.dimension}:</strong> {metric.value} <EvidenceLinks urls={metric.urls} references={data.evidence_references} /></div>)}{finding.uncertainty && <p><strong>Uncertainty:</strong> {finding.uncertainty}</p>}{finding.po_implications && <p><strong>PO implications:</strong> {finding.po_implications}</p>}{relatedEntityCandidates(finding)}<EvidenceLinks urls={finding.evidence_references} references={data.evidence_references} />{benchmarkAction({ item_type: 'finding', item_key: finding.key }, finding.title)}</div></details>; })}</div></section>}{data.research_gaps.length > 0 && <section><h4>Research gaps</h4><ul>{data.research_gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></section>}{data.po_recommendations.length > 0 && <section><h4>PO recommendations</h4><ul>{data.po_recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}{data.findings.length + data.research_gaps.length + data.po_recommendations.length + keyTakeaways.length === 0 && !data.executive_summary && <p>{report.research_status === 'TEXT_ONLY' ? 'Chỉ có nội dung báo cáo gốc; chưa có insight được cấu trúc. Dùng “Chuẩn hóa bằng ChatGPT Plus” để nâng cấp báo cáo này.' : 'Structured report has no overview fields.'}</p>}</section>}
    {tab === 'insights' && <section className="research-panel results-panel"><h3>Insights</h3><div className="insight-list">{data.findings.map((finding) => { const locations = [...(finding.source_locations || []), ...finding.evidence_references.flatMap((url) => data.evidence_references.filter((source) => source.url === url && source.source_location).map((source) => source.source_location!))]; const excerpt = excerptAtLocations(report.content, locations); const metrics = findingMetrics(finding.key); return <details className="insight-result" key={finding.key} id={`finding-${finding.key}`} open={activeFinding === finding.key}><summary><div><span className="field-label">{finding.finding_type} · {finding.evidence_status}</span><h4>{finding.title}</h4><span>{finding.description}</span></div><span className="unverified-chip">Details</span></summary><div className="insight-result-detail"><p>{finding.description}</p>{metrics.length > 0 && <section><h5>PO-confirmed related observations</h5><ul>{metrics.map((metric, index) => <li key={`${metric.dimension}-${index}`}><strong>{metric.dimension}:</strong> {metric.value} <EvidenceLinks urls={metric.urls} references={data.evidence_references} /></li>)}</ul></section>}{scopeLabel(finding.scope) && <p><strong>Scope:</strong> {scopeLabel(finding.scope)}</p>}{finding.uncertainty && <p><strong>Uncertainty:</strong> {finding.uncertainty}</p>}{finding.po_implications && <p><strong>PO implications:</strong> {finding.po_implications}</p>}{relatedEntityCandidates(finding)}<EvidenceLinks urls={finding.evidence_references} references={data.evidence_references} /><button className="text-button" onClick={() => setActiveFinding(activeFinding === finding.key ? null : finding.key)}>View support in original report</button>{activeFinding === finding.key && <div className="support-excerpt">{excerpt.length ? excerpt.map((line) => <pre key={line}>{line}</pre>) : <p>No reliable source location was provided. Open Full Report and inspect the cited URL manually.</p>}</div>}{benchmarkAction({ item_type: 'finding', item_key: finding.key }, finding.title)}</div></details>; })}</div></section>}
    {tab === 'entities' && <section className="research-panel results-panel"><h3>Entities</h3><div className="dynamic-card-grid">{data.entities.map((entity) => <article className="dynamic-card" key={entity.key}><span className="field-label">{entity.entity_type}</span><h4>{entity.name}</h4>{Object.entries(entity.attributes).map(([key, value]) => <p key={key}><strong>{key.replaceAll('_', ' ')}:</strong> {String(value)}</p>)}<EvidenceLinks urls={entity.evidence_references} references={data.evidence_references} />{benchmarkAction({ item_type: 'entity', item_key: entity.key })}</article>)}</div></section>}
    {tab === 'benchmark' && <section className="research-panel results-panel benchmark-workspace"><h3>{selectedEntityRows.length > 0 ? 'Research subject comparison' : 'Insight assessment'}</h3><p>Only explicitly selected research subjects appear as rows. Entity type remains visible; an Insight alone never selects its related subjects. Missing observations are shown as Unknown.</p>
      {selectedEntityRows.length > 0 && <>
        <label className="intake-field"><span className="field-label">Add a comparison dimension</span><div className="dimension-add"><input aria-label="PO dimension" value={newDimension} onChange={(event) => setNewDimension(event.target.value)} placeholder="What should the PO compare?" /><button className="secondary-action" disabled={!newDimension.trim() || busy} onClick={() => void addCustomDimension()}>Add dimension</button></div></label>
        {dimensions.length > 0 && <div className="benchmark-table-wrap"><table className="benchmark-table"><thead><tr><th>Comparison target / subject</th>{dimensions.map((dimension) => <th key={dimension.key}>{dimension.name}{dimension.custom ? ' · PO-defined' : ''}</th>)}</tr></thead><tbody>{selectedEntityRows.map((entity) => { const item: BenchmarkSelection = { item_type: 'entity', item_key: entity.key }; const entry = workspace.entries.find((candidate) => candidate.item_type === 'entity' && candidate.item_key === entity.key); return <tr key={entity.key}><th><strong>{entity.name}</strong><small>{entity.entity_type} · explicitly selected</small>{benchmarkAction(item, entity.name)}</th>{dimensions.map((dimension) => { const found = dimension.custom ? null : observation(item, dimension.key); const poValue = dimension.custom ? entry?.dimension_assessments?.[dimension.name] : undefined; const supportKeys = !dimension.custom && found ? supportingFindings(entity.key, dimension.key) : []; const candidates = !dimension.custom && found ? data.findings.filter((finding) => finding.related_entities.includes(entity.key)) : []; const preservedKeys = entry?.observation_finding_links?.[dimension.key] ?? []; return <td key={dimension.key}>{dimension.custom ? <textarea aria-label={`${dimension.name} assessment for ${entity.name}`} value={poValue || ''} onChange={(event) => changeDimensionAssessment(item, dimension.name, event.target.value)} placeholder="PO assessment" /> : found ? <><span>{found.value === null || found.value === undefined || found.value === '' ? 'Unknown / Not provided' : String(found.value)}</span><small>{found.status} · source-provided, not independently verified{found.uncertainty ? ` · ${found.uncertainty}` : ''}</small>{found.urls.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Evidence</a>)}{supportKeys.map((key) => { const finding = data.findings.find((candidate) => candidate.key === key); return finding ? <button className="text-button" key={key} onClick={() => { setActiveFinding(key); setTab('insights'); }}>PO-confirmed insight: {finding.title}</button> : <small key={key}>Previously confirmed insight reference unavailable ({key}); preserved without remapping.</small>; })}{!supportKeys.length && <small>No confirmed supporting insight.</small>}{candidates.length > 0 && <label className="observation-link-control"><span>Confirm supporting insight (PO)</span><select aria-label={`Confirm supporting insight for ${entity.name} / ${dimension.name}`} value={supportKeys[0] || ''} onChange={(event) => updateObservationFindingLink(item, dimension.key, event.target.value)}><option value="">No confirmed supporting insight</option>{preservedKeys.filter((key) => !candidates.some((finding) => finding.key === key)).map((key) => <option key={key} value={key}>Unavailable prior reference ({key})</option>)}{candidates.map((finding) => <option key={finding.key} value={finding.key}>{finding.title}</option>)}</select></label>}</> : <span>Unknown / Not provided</span>}</td>; })}</tr>; })}</tbody></table></div>}
        <section className="benchmark-assessments"><h4>PO assessment and decisions</h4>{selectedEntityRows.map((entity) => { const item: BenchmarkSelection = { item_type: 'entity', item_key: entity.key }; return <details className="benchmark-po-entry" key={entity.key}><summary><strong>{entity.name}</strong><span>Assessment, notes and next action</span></summary>{poAssessmentFields(item, entity.name)}</details>; })}</section>
      </>}
      {selectedFindings.length > 0 && <section className="benchmark-assessments"><h4>{selectedEntityRows.length > 0 ? 'Supporting insights' : 'Contextual insight assessment'}</h4>{selectedFindings.map(({ selection, finding }) => <details className="benchmark-po-entry" key={finding.key}><summary><strong>{finding.title}</strong><span>{finding.finding_type} · {finding.evidence_status}</span></summary><div className="insight-result-detail"><p>{finding.description}</p>{scopeLabel(finding.scope) && <p><strong>Scope:</strong> {scopeLabel(finding.scope)}</p>}{finding.uncertainty && <p><strong>Uncertainty:</strong> {finding.uncertainty}</p>}<EvidenceLinks urls={finding.evidence_references} references={data.evidence_references} />{poAssessmentFields(selection, finding.title)}</div></details>)}</section>}
      {selectedEntityRows.length === 0 && selectedFindings.length === 0 && <p className="report-history-state">Select an entity or add an insight from its evidence details to begin.</p>}
      {(selectedEntityRows.length > 0 || selectedFindings.length > 0) && <button className="primary-action" disabled={busy} onClick={() => void saveWorkspace()}>{busy ? 'Saving…' : 'Save assessments and next actions'}</button>}
    </section>}
    {tab === 'evidence' && <section className="research-panel results-panel"><h3>Evidence</h3><p>Imported sources are references supplied in the report. URLs and ChatGPT-provided data are not independently verified.</p><ul className="evidence-results">{data.evidence_references.map((source) => <li key={source.url}><strong>{source.title || source.url}</strong><a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a><span>{source.source_location || 'No source location provided'} · Unverified</span></li>)}</ul></section>}
    {tab === 'report' && <section className="research-panel report-body full-report"><div className="panel-heading"><div><span className="field-label">ORIGINAL REPORT</span><h3>Full Report</h3></div><span className="unverified-chip">Verbatim</span></div>{headings.length > 0 && <nav className="report-toc" aria-label="Mục lục"><strong>Contents</strong><ol>{headings.map((heading, index) => <li key={`${heading.id}-${index}`} style={{ marginLeft: `${Math.max(0, heading.level - 1) * 8}px` }}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ol></nav>}<MarkdownReport markdown={report.content} /></section>}
    {report.structured_update_available && <div role="status" className="research-alert">This duplicate contains different structured results. They were not applied automatically; the saved report and PO workspace are unchanged.</div>}
  </article>;
}

function EvidenceLinks({ urls, references }: { urls: string[]; references: ResearchData['evidence_references'] }) {
  if (!urls.length) return <p className="unverified-chip">No evidence references provided · unverified</p>;
  return <ul className="evidence-link-list">{urls.map((url) => { const reference = references.find((item) => item.url === url); return <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{reference?.title || url}</a><small>{reference?.source_location || 'No source location provided'} · Unverified</small></li>; })}</ul>;
}
