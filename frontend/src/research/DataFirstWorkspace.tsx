import { useEffect, useMemo, useRef, useState } from 'react';
import { reportApi, type ComparisonDataset, type QuantitativeDataset, type ReportSummary } from '../reports/api';
import { QuantitativeDatasetImport } from '../reports/QuantitativeDatasetImport';
import { researchApi, type ResearchProject, type ShortlistContext } from './api';
import { OpportunityReview } from './OpportunityReview';
import { ProjectJourneyNav } from './ProjectJourneyNav';
import { ResearchSubjectsPanel } from './ResearchSubjectsPanel';
import { TrendUpdatesPanel } from './TrendUpdatesPanel';
import { ImageEvidencePanel } from './ImageEvidencePanel';
import { SavedInformationPanel } from './SavedInformationPanel';

type AppObservation = QuantitativeDataset['observations'][number];
type AppGroup = { id: string; name: string; rows: AppObservation[] };
type RankingOption = { key: string; label: string; rows: Map<string, AppObservation>; ambiguous: Set<string> };

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
      || !row.metric_id || !row.metric_definition || !row.unit || !row.geo || !row.platform || !row.methodology
      || (!row.snapshot_date && (!row.period_start || !row.period_end))) continue;
    const period = row.snapshot_date || `${row.period_start || '?'}–${row.period_end || '?'}`;
    const key = [row.metric_id, row.metric_definition, row.unit, row.methodology || '', row.geo || '', row.platform || '', period].join('|');
    const label = `${row.metric_definition} · ${row.unit} · ${row.geo} / ${row.platform} · ${period}`;
    const option = groups.get(key) ?? { key, label, rows: new Map<string, AppObservation>(), ambiguous: new Set<string>() };
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

function buildPrompt(project: ResearchProject, dataset: QuantitativeDataset, context: ShortlistContext, selected: AppGroup[]): string {
  const observations = selected.flatMap((app) => app.rows.filter((row) => context.observation_refs.some((ref) =>
    ref.source_entity_id === (row.source_entity_id || row.entity_id || app.id)
      && ref.source_row_number === (row.source_row_number ?? null) && ref.metric_id === (row.metric_id ?? null))).map((row) => ({
    app: app.name, source_identity: row.source_entity_id, metric: row.metric_definition || row.metric_id,
    value: row.value, unit: row.unit, geo: row.geo, platform: row.platform,
    period: row.snapshot_date || `${row.period_start || 'unknown'} to ${row.period_end || 'unknown'}`,
    granularity: row.granularity, methodology: row.methodology,
    source_reference: row.source_reference, evidence_reference: row.evidence_reference,
    status: row.verification_status, limitations: row.validation_reasons,
  })));
  return [
    `Research question: Investigate the product and market context for the selected products in “${project.name}”.`,
    `Saved source dataset: ${dataset.filename} (dataset reference ${context.dataset_id}; content ${context.dataset_content_sha256}).`,
    context.selection_criterion ? `Selection criterion: ${context.selection_criterion}` : 'Selection context: The PO selected these products manually; do not describe them as market-wide top products.',
    context.measurement ? `Selection measurement: ${context.measurement.metric_definition} (${context.measurement.metric_id}); ${context.measurement.unit}; GEO ${context.measurement.geo}; platform ${context.measurement.platform}; ${context.measurement.snapshot_date || `${context.measurement.period_start} to ${context.measurement.period_end}`}; ${context.measurement.methodology}.` : 'Selection measurement: Manual selection; no single measurement scope was asserted.',
    `Source entities: ${context.source_entity_ids.join(', ')}. Observation references: ${context.observation_refs.length}.`,
    '', 'Selected source data (local CSV observations; preserve exactly and treat as unverified estimates, not market-wide facts):',
    JSON.stringify(observations, null, 2),
    '', 'Keep these source types separate:',
    '- Local CSV observations above are measurements from the supplied exports only; do not present them as independently verified.',
    '- Public web evidence must include working source URLs and dates. Do not claim the local CSV was searched or uploaded to the web.',
    '- ChatGPT interpretation must be labeled as interpretation, not as observed fact.',
    '- Growth or causal explanations are hypotheses unless independently supported by compatible evidence.',
    '', 'For each selected product, research core gameplay/features, user motivation, retention mechanisms, monetization, differentiation, market context and evidence-backed growth hypotheses. Identify research gaps and useful PO next steps.',
    'Only use observations listed above, which are selected from the saved source dataset. Preserve GEO, platform, period, unit and methodology distinctions. Do not infer missing metrics or equate records only by display name.',
    'Return Markdown with an executive summary, findings, entities, evidence references, quantitative observations (only exact sourced measurements), research gaps and PO recommendations.',
  ].join('\n');
}

export function DataFirstWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [datasets, setDatasets] = useState<ComparisonDataset[]>([]);
  const [dataset, setDataset] = useState<QuantitativeDataset | null>(null);
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
  const [showImport, setShowImport] = useState(() => new URLSearchParams(window.location.search).get('action') === 'import-csv');
  const [linkReportId, setLinkReportId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingSelection, setSavingSelection] = useState(false);
  const [selectionSaveFailed, setSelectionSaveFailed] = useState(false);
  const [visibleApps, setVisibleApps] = useState(50);
  const selectedAppsRef = useRef<string[]>([]);
  const selectedCriterionRef = useRef<string | null>(null);
  const selectionQueue = useRef<Promise<void>>(Promise.resolve());

  async function load() {
    setLoading(true); setError('');
    try {
      const [workspace, firstDatasetPage, reportPage, allReportsPage] = await Promise.all([
        researchApi.getProject(projectId), reportApi.listComparisonDatasets(undefined, projectId), reportApi.listProjectReports(projectId), reportApi.list(),
      ]);
      const allDatasets = [...firstDatasetPage.items];
      let datasetCursor = firstDatasetPage.next_cursor ?? undefined;
      while (datasetCursor) {
        const page = await reportApi.listComparisonDatasets(datasetCursor, projectId);
        allDatasets.push(...page.items.filter((item) => !allDatasets.some((existing) => existing.id === item.id)));
        datasetCursor = page.next_cursor ?? undefined;
      }
      setProject(workspace); setDatasets(allDatasets); setReports(reportPage.items); setReportsCursor(reportPage.next_cursor);
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
      setSelectedDatasetId((current) => allDatasets.some((item) => item.id === current) ? current :
        (preferredDatasetId && allDatasets.some((item) => item.id === preferredDatasetId) ? preferredDatasetId : allDatasets[0]?.id ?? ''));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được workspace.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [projectId]);

  useEffect(() => {
    if (loading || !window.location.hash) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView({ block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
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
    let active = true;
    reportApi.getProjectQuantitativeDataset(projectId, selectedDatasetId)
      .then((item) => { if (active) setDataset(item); })
      .catch((cause) => { if (active) { setDataset(null); setError(cause instanceof Error ? cause.message : 'Không mở được dataset.'); } });
    return () => { active = false; };
  }, [projectId, selectedDatasetId]);

  const apps = useMemo(() => groupsFor(dataset), [dataset]);
  const rankingOptions = useMemo(() => rankingOptionsFor(apps), [apps]);
  if (new URLSearchParams(window.location.search).get('view') === 'opportunities') {
    return <OpportunityReview projectId={projectId} />;
  }
  const rankingOption = rankingOptions.find((item) => item.key === rankingKey) ?? rankingOptions[0];
  const selected = apps.filter((app) => selectedApps.includes(app.id));
  const activeSelectionMatchesDataset = selectedApps.length === 0
    ? (!selectedContext || selectedContext.dataset_id === selectedDatasetId)
    : Boolean(selectedContext && selectedContext.dataset_id === selectedDatasetId);

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
    const criterion = `Five highest supplied values in the selected CSV for ${rankingOption.label}; this is not a market-wide ranking.`;
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
      try { await navigator.clipboard.writeText(value); setNotice('Prompt đã được sao chép từ dataset và phạm vi shortlist đã lưu. Mở ChatGPT Plus, dán prompt rồi nhập báo cáo lại vào workspace này.'); }
      catch { setNotice('Prompt đã sẵn sàng bên dưới để bạn sao chép thủ công.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể dựng prompt từ shortlist đã lưu.'); }
  }

  function startNewShortlist() {
    if (!dataset) return;
    const context: ShortlistContext = { dataset_id: dataset.id, dataset_filename: dataset.filename, dataset_content_sha256: dataset.content_sha256,
      selection_type: 'manual', source_entity_ids: [], selection_criterion: null, measurement: null, observation_refs: [] };
    const revision = ++selectionRevision.current;
    selectedAppsRef.current = []; selectedContextRef.current = context;
    setSelectedApps([]); setSelectedCriterion(null); setSelectedContext(context); setPrompt(''); setSelectionSaveFailed(false); setNotice('Đã bắt đầu shortlist mới cho dataset này. Shortlist đã lưu trước đó được thay thế khi bạn chọn ứng dụng đầu tiên.');
    const saveOperation = selectionQueue.current.catch(() => undefined).then(async () => { await researchApi.updateWorkspaceState(projectId, [], null, context); });
    selectionQueue.current = saveOperation; setSavingSelection(true);
    void saveOperation.then(() => { if (revision === selectionRevision.current) setSelectionSaveFailed(false); }).catch((cause) => { if (revision === selectionRevision.current) { setSelectionSaveFailed(true); setError(cause instanceof Error ? cause.message : 'Không lưu được shortlist mới.'); } }).finally(() => { if (selectionQueue.current === saveOperation) setSavingSelection(false); });
  }

  if (loading) return <section className="research-panel"><p role="status">Đang mở workspace…</p></section>;
  if (!project) return <section className="research-panel"><div className="research-alert" role="alert">{error || 'Không tìm thấy workspace.'}</div><a href="/research">Quay lại Research</a></section>;

  return <div className="data-first-workspace">
    <ProjectJourneyNav projectId={projectId} active="research" />
    <section className="research-panel data-workspace-heading"><div><a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}`}>← Back to project</a><span className="state-label">PROJECT RESEARCH</span><h2>{project.name}</h2><p>Saved reports, research updates, and project data stay together here.</p></div></section>
    <SavedInformationPanel projectId={projectId} />
    <ResearchSubjectsPanel projectId={projectId} />
    <details className="saved-information-legacy"><summary>Earlier trend update and image records</summary><p>These records were saved using the previous workflow. They remain available and unchanged.</p><TrendUpdatesPanel projectId={projectId} /><ImageEvidencePanel projectId={projectId} /></details>
    {error && <div className="research-alert" role="alert">{error}</div>}{notice && <div className="research-success" role="status">{notice}</div>}
    <div className="workspace-source-grid">
      <section className="research-panel" id="project-csv-data"><div className="panel-heading"><div><span className="state-label">MARKET DATA</span><h3>CSV datasets</h3></div><button className="primary-action" type="button" onClick={() => setShowImport((value) => !value)}>{showImport ? 'Close import' : 'Import CSV'}</button></div><p>{datasets.length ? `${datasets.length} dataset${datasets.length === 1 ? '' : 's'} saved` : 'You can add a dataset before or after importing a research report.'}</p>
        {datasets.length > 0 && <label className="field-label">Dataset to explore<select value={selectedDatasetId} onChange={(event) => { setSelectedDatasetId(event.target.value); setVisibleApps(50); setPrompt(''); }}><option value="">Select a dataset</option>{datasets.map((item) => <option value={item.id} key={item.id}>{item.filename} · {item.source_apps ?? 0} apps</option>)}</select></label>}
        {showImport && <QuantitativeDatasetImport projectId={projectId} onImported={(item) => { setSelectedDatasetId(item.id); setDataset(item); setShowImport(false); setVisibleApps(50); void (async () => { const all: ComparisonDataset[] = []; let cursor: string | undefined; do { const page = await reportApi.listComparisonDatasets(cursor, projectId); all.push(...page.items.filter((row) => !all.some((existing) => existing.id === row.id))); cursor = page.next_cursor ?? undefined; } while (cursor); setDatasets(all); })().catch((cause) => setError(cause instanceof Error ? cause.message : 'CSV đã lưu nhưng danh sách chưa làm mới. Hãy bấm Refresh.')); }} />}
      </section>
      <section className="research-panel" id="workspace-reports"><div className="panel-heading"><div><span className="state-label">CHATGPT FINDINGS</span><h3>Reports in this workspace</h3></div><a className="secondary-action" href={`/reports?projectId=${encodeURIComponent(projectId)}`}>Open Reports library</a></div><p>{reports.length ? `${reports.length} report${reports.length === 1 ? '' : 's'} linked` : 'Import a report here after researching in ChatGPT Plus.'}</p><div className="workspace-report-list">{reports.map((report) => <a key={report.id} href={`/reports/${encodeURIComponent(report.id)}`}><strong>{report.question}</strong><small>{report.geo} · {report.os} · {report.research_period || 'Period not specified'}</small></a>)}</div>
        {allReports.filter((report) => !reports.some((linked) => linked.id === report.id)).length > 0 && <div className="workspace-link-report"><label className="field-label">Add an existing report<select value={linkReportId} onChange={(event) => setLinkReportId(event.target.value)}><option value="">Choose report…</option>{allReports.filter((report) => !reports.some((linked) => linked.id === report.id)).map((report) => <option key={report.id} value={report.id}>{report.question}</option>)}</select></label><button className="secondary-action" type="button" disabled={!linkReportId} onClick={() => void linkReport()}>Add to workspace</button></div>}
        {(reportsCursor || allReportsCursor) && <button type="button" className="secondary-action" disabled={loadingMoreReports} onClick={() => void loadMoreReports()}>{loadingMoreReports ? 'Loading reports…' : 'Load more reports'}</button>}
      </section>
    </div>
    {selectedContext && <section className="research-panel workspace-saved-shortlist"><div className="panel-heading"><div><span className="state-label">SAVED CANDIDATES</span><h3>{selectedApps.length} selected · {selectedContext.dataset_filename || 'Legacy selection'}</h3></div><span role="status">{savingSelection ? 'Saving…' : selectionSaveFailed ? 'Save failed' : 'Saved'}</span></div><p>{selectedContext.selection_type === 'legacy' ? 'This older shortlist has no saved dataset provenance. Its original source is unknown.' : selectedContext.selection_criterion || 'Selected manually from the saved source file.'}</p>{selectedContext.measurement && <p>{selectedContext.measurement.metric_definition} · {selectedContext.measurement.unit} · {selectedContext.measurement.geo} · {selectedContext.measurement.platform} · {selectedContext.measurement.snapshot_date || `${selectedContext.measurement.period_start} – ${selectedContext.measurement.period_end}`}</p>}<button type="button" className="primary-action" onClick={() => void createPrompt()} disabled={selectedApps.length === 0 || savingSelection || selectionSaveFailed}>Copy research prompt from saved shortlist</button></section>}
    {dataset && <section className="research-panel workspace-explorer"><div className="panel-heading"><div><span className="state-label">DATA EXPLORER</span><h3>{dataset.filename}</h3></div><span className="data-scope-pill">{dataset.source_rows ?? dataset.observations.length} CSV rows · {dataset.source_apps ?? apps.length} source apps</span></div><p className="field-help">Rows retain their supplied GEO, platform, metric, period and source. Values are not independently verified by importing.</p>
      {!activeSelectionMatchesDataset && <div className="research-alert" role="status">Shortlist này thuộc dataset “{selectedContext?.dataset_filename || 'nguồn cũ chưa biết'}”. Chọn “Start new shortlist…” để bắt đầu từ file đang mở; shortlist cũ vẫn giữ nguyên cho đến khi bạn xác nhận hành động đó.</div>}
      {activeSelectionMatchesDataset && selectedApps.length === 0 && selectedContext && <p className="field-help">Shortlist mới đã mở từ dataset này. Chọn ứng dụng bên dưới để lưu candidates.</p>}
      {!activeSelectionMatchesDataset && <button type="button" className="secondary-action" onClick={startNewShortlist} disabled={savingSelection}>Start new shortlist from this dataset (replace current shortlist)</button>}
      {apps.length === 0 ? <p>No app rows were detected in this dataset.</p> : <div className="workspace-app-table-scroll"><table className="workspace-app-table"><thead><tr><th>Select</th><th>App / source identity</th><th>Metric observations</th><th>Scope and period</th></tr></thead><tbody>{apps.slice(0, visibleApps).map((app) => <tr key={app.id}><td><input type="checkbox" aria-label={`Select ${app.name} for ChatGPT research`} checked={activeSelectionMatchesDataset && selectedApps.includes(app.id)} disabled={!activeSelectionMatchesDataset || savingSelection} onChange={() => void toggleApp(app.id)} /></td><th scope="row">{app.name}<small>{app.id}</small></th><td>{[...new Set(app.rows.map((row) => row.metric_definition || row.metric_id || 'Unidentified metric'))].join(', ')}</td><td>{[...new Set(app.rows.map((row) => `${row.geo || 'GEO unknown'} · ${row.platform || 'platform unknown'} · ${row.snapshot_date || `${row.period_start || '?'}–${row.period_end || '?'}`}`))].join('; ')}</td></tr>)}</tbody></table></div>}
      {apps.length > visibleApps && <button type="button" className="secondary-action" onClick={() => setVisibleApps((current) => current + 50)}>Load more apps</button>}
      {rankingOption && <div className="workspace-selection-criterion"><label className="field-label">Select candidates by observed data<select value={rankingOption.key} onChange={(event) => setRankingKey(event.target.value)}>{rankingOptions.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label><button type="button" className="secondary-action" disabled={!activeSelectionMatchesDataset || savingSelection || rankingOption.rows.size < 5} onClick={() => void selectFiveHighest()}>Select 5 highest values in this CSV</button><span>Uses five exact, complete observations with one scope from this file. This is not a market ranking.</span></div>}
      {rankingOptions.length === 0 && <p className="field-help">Automatic candidate selection is unavailable because no group of five exact, complete observations has a shared metric, unit, GEO, platform, methodology and period. You can still select products manually after starting a shortlist for this dataset.</p>}
      {selectedCriterion && <p className="field-help">{selectedCriterion}</p>}
      <div className="workspace-followup"><span>{activeSelectionMatchesDataset ? `${selected.length} app${selected.length === 1 ? '' : 's'} selected` : 'Saved shortlist belongs to another dataset'}{savingSelection ? ' · saving…' : selectionSaveFailed ? ' · not saved' : ' · saved'}</span>{selectionSaveFailed && <button type="button" className="secondary-action" onClick={() => void retrySaveSelection()}>Retry saving selection</button>}<button type="button" className="primary-action" disabled={!activeSelectionMatchesDataset || selected.length === 0 || savingSelection || selectionSaveFailed} onClick={() => void createPrompt()}>Research these apps with ChatGPT</button></div>
      {prompt && <label className="workspace-prompt"><span className="field-label">Copy-ready research prompt</span><textarea readOnly rows={16} value={prompt} onFocus={(event) => event.currentTarget.select()} /></label>}
    </section>}
    {datasets.length > 1 && <section className="research-panel"><div className="panel-heading"><div><span className="state-label">NEXT STEP</span><h3>Compare compatible periods</h3></div><a className="primary-action" href={`/compare-periods?projectId=${encodeURIComponent(projectId)}`}>Compare periods</a></div><p>Only compatible metric definitions, measurement windows and source scopes are compared.</p></section>}
  </div>;
}
