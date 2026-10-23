import { useEffect, useMemo, useRef, useState } from 'react';
import { reportApi, type QuantitativeDataset, type ReportSummary } from '../reports/api';
import { QuantitativeDatasetImport } from '../reports/QuantitativeDatasetImport';
import { researchApi, type ResearchProject } from './api';

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
    if (row.value === null || row.value === undefined || !Number.isFinite(Number(row.value)) || !row.metric_id || !row.metric_definition || !row.unit) continue;
    const period = row.snapshot_date || `${row.period_start || '?'}–${row.period_end || '?'}`;
    const key = [row.metric_id, row.metric_definition, row.unit, row.methodology || '', row.geo || '', row.platform || '', period].join('|');
    const label = `${row.metric_definition} · ${row.unit} · ${row.geo || 'GEO unknown'} / ${row.platform || 'platform unknown'} · ${period}`;
    const option = groups.get(key) ?? { key, label, rows: new Map<string, AppObservation>(), ambiguous: new Set<string>() };
    if (!option.ambiguous.has(app.id) && !option.rows.has(app.id)) option.rows.set(app.id, row);
    else { option.rows.delete(app.id); option.ambiguous.add(app.id); }
    groups.set(key, option);
  }
  return [...groups.values()].filter((item) => item.rows.size > 0).sort((left, right) => left.label.localeCompare(right.label));
}

function buildPrompt(project: ResearchProject, selected: AppGroup[], selectionCriterion: string | null): string {
  const observations = selected.flatMap((app) => app.rows.map((row) => ({
    app: app.name, source_identity: row.source_entity_id, metric: row.metric_definition || row.metric_id,
    value: row.value, unit: row.unit, geo: row.geo, platform: row.platform,
    period: row.snapshot_date || `${row.period_start || 'unknown'} to ${row.period_end || 'unknown'}`,
    granularity: row.granularity, methodology: row.methodology,
    source_reference: row.source_reference, evidence_reference: row.evidence_reference,
    status: row.verification_status, limitations: row.validation_reasons,
  })));
  return [
    `Research question: Investigate the product and market context for the selected products in “${project.name}”.`,
    selectionCriterion ? `Selection criterion: ${selectionCriterion}` : 'Selection context: The PO selected these products manually; do not describe them as market-wide top products.',
    '', 'Selected source data (local CSV observations; preserve exactly and treat as unverified estimates, not market-wide facts):',
    JSON.stringify(observations, null, 2),
    '', 'Keep these source types separate:',
    '- Local CSV observations above are measurements from the supplied exports only; do not present them as independently verified.',
    '- Public web evidence must include working source URLs and dates. Do not claim the local CSV was searched or uploaded to the web.',
    '- ChatGPT interpretation must be labeled as interpretation, not as observed fact.',
    '- Growth or causal explanations are hypotheses unless independently supported by compatible evidence.',
    '', 'For each selected product, research core gameplay/features, user motivation, retention mechanisms, monetization, differentiation, market context and evidence-backed growth hypotheses. Identify research gaps and useful PO next steps.',
    'Preserve GEO, platform, period, unit and methodology distinctions. Do not infer missing metrics or equate records only by display name.',
    'Return Markdown with an executive summary, findings, entities, evidence references, quantitative observations (only exact sourced measurements), research gaps and PO recommendations.',
  ].join('\n');
}

export function DataFirstWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [datasets, setDatasets] = useState<QuantitativeDataset[]>([]);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [allReports, setAllReports] = useState<ReportSummary[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [selectedCriterion, setSelectedCriterion] = useState<string | null>(null);
  const [rankingKey, setRankingKey] = useState('');
  const [showImport, setShowImport] = useState(false);
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
      const [workspace, datasetPage, reportPage] = await Promise.all([
        researchApi.getProject(projectId), reportApi.listProjectQuantitativeDatasets(projectId), reportApi.listProjectReports(projectId),
      ]);
      setProject(workspace); setDatasets(datasetPage.items); setReports(reportPage.items);
      setSelectedDatasetId((current) => datasetPage.items.some((item) => item.id === current) ? current : datasetPage.items[0]?.id ?? '');
      const savedSelection = workspace.workspace_state_json?.selected_app_ids ?? [];
      selectedAppsRef.current = savedSelection;
      setSelectedApps(savedSelection);
      const savedCriterion = workspace.workspace_state_json?.selected_app_criterion ?? null;
      selectedCriterionRef.current = savedCriterion;
      setSelectedCriterion(savedCriterion);
      const all: ReportSummary[] = []; let cursor: string | undefined;
      do { const page = await reportApi.list(cursor); all.push(...page.items); cursor = page.next_cursor ?? undefined; } while (cursor);
      setAllReports(all.filter((report) => !report.project_id || report.project_id === projectId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được workspace.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [projectId]);

  const dataset = datasets.find((item) => item.id === selectedDatasetId) ?? null;
  const apps = useMemo(() => groupsFor(dataset), [dataset]);
  const rankingOptions = useMemo(() => rankingOptionsFor(apps), [apps]);
  const rankingOption = rankingOptions.find((item) => item.key === rankingKey) ?? rankingOptions[0];
  const selected = apps.filter((app) => selectedApps.includes(app.id));

  async function toggleApp(id: string) {
    const current = selectedAppsRef.current;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    selectedAppsRef.current = next;
    selectedCriterionRef.current = null;
    setSelectedCriterion(null);
    setSelectedApps(next); setSavingSelection(true); setSelectionSaveFailed(false); setNotice(''); setError('');
    const saveOperation = selectionQueue.current.catch(() => undefined).then(async () => {
      await researchApi.updateWorkspaceState(projectId, next, null);
    });
    selectionQueue.current = saveOperation;
    try { await saveOperation; setSelectionSaveFailed(false); setNotice('Lựa chọn đã được lưu trong workspace.'); }
    catch (cause) { setSelectionSaveFailed(true); setError(cause instanceof Error ? cause.message : 'Không lưu được lựa chọn.'); }
    finally {
      if (selectionQueue.current === saveOperation) setSavingSelection(false);
    }
  }

  async function retrySaveSelection() {
    setSavingSelection(true); setSelectionSaveFailed(false); setError('');
    const current = [...selectedAppsRef.current];
    const saveOperation = selectionQueue.current.catch(() => undefined).then(async () => {
      await researchApi.updateWorkspaceState(projectId, current, selectedCriterionRef.current);
    });
    selectionQueue.current = saveOperation;
    try { await saveOperation; setSelectionSaveFailed(false); setNotice('Lựa chọn đã được lưu trong workspace.'); }
    catch (cause) { setSelectionSaveFailed(true); setError(cause instanceof Error ? cause.message : 'Không lưu được lựa chọn.'); }
    finally { if (selectionQueue.current === saveOperation) setSavingSelection(false); }
  }

  async function selectFiveHighest() {
    if (!rankingOption) return;
    const top = [...rankingOption.rows.entries()]
      .sort(([leftId, left], [rightId, right]) => Number(right.value) - Number(left.value)
        || (apps.find((app) => app.id === leftId)?.name ?? leftId).localeCompare(apps.find((app) => app.id === rightId)?.name ?? rightId))
      .slice(0, 5);
    if (top.length === 0) return;
    const next = top.map(([id]) => id);
    const criterion = `Five highest supplied values in the selected CSV for ${rankingOption.label}; this is not a market-wide ranking.`;
    selectedAppsRef.current = next;
    selectedCriterionRef.current = criterion;
    setSelectedApps(next); setSelectedCriterion(criterion); setSavingSelection(true); setSelectionSaveFailed(false); setNotice(''); setError('');
    const saveOperation = selectionQueue.current.catch(() => undefined).then(async () => {
      await researchApi.updateWorkspaceState(projectId, next, criterion);
    });
    selectionQueue.current = saveOperation;
    try { await saveOperation; setSelectionSaveFailed(false); setNotice('Đã chọn theo giá trị quan sát trong file và lưu vào workspace.'); }
    catch (cause) { setSelectionSaveFailed(true); setError(cause instanceof Error ? cause.message : 'Không lưu được lựa chọn.'); }
    finally { if (selectionQueue.current === saveOperation) setSavingSelection(false); }
  }

  async function linkReport() {
    if (!linkReportId) return;
    try { await reportApi.linkReportToProject(projectId, linkReportId); setLinkReportId(''); setNotice('Đã thêm báo cáo vào workspace.'); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể thêm báo cáo.'); }
  }

  async function createPrompt() {
    if (!project || selected.length === 0) return;
    const value = buildPrompt(project, selected, selectedCriterion); setPrompt(value);
    try { await navigator.clipboard.writeText(value); setNotice('Prompt đã được sao chép. Mở ChatGPT Plus, dán prompt rồi nhập báo cáo lại vào workspace này.'); }
    catch { setNotice('Prompt đã sẵn sàng bên dưới để bạn sao chép thủ công.'); }
  }

  if (loading) return <section className="research-panel"><p role="status">Đang mở workspace…</p></section>;
  if (!project) return <section className="research-panel"><div className="research-alert" role="alert">{error || 'Không tìm thấy workspace.'}</div><a href="/research">Quay lại Research</a></section>;

  return <div className="data-first-workspace">
    <section className="research-panel data-workspace-heading"><div><span className="state-label">RESEARCH WORKSPACE</span><h2>{project.name}</h2><p>Bắt đầu từ dữ liệu thị trường, bổ sung nghiên cứu ChatGPT sau. CSV gốc và từng phạm vi đo được giữ nguyên.</p></div><div className="data-workspace-actions"><a className="secondary-action" href={`/research?projectId=${encodeURIComponent(projectId)}`}>Research plan</a><a className="secondary-action" href={`/compare-periods?projectId=${encodeURIComponent(projectId)}`}>Compare periods</a><a className="primary-action" href={`/?projectId=${encodeURIComponent(projectId)}`}>Import ChatGPT research</a></div></section>
    {error && <div className="research-alert" role="alert">{error}</div>}{notice && <div className="research-success" role="status">{notice}</div>}
    <div className="workspace-source-grid">
      <section className="research-panel"><div className="panel-heading"><div><span className="state-label">MARKET DATA</span><h3>CSV datasets</h3></div><button className="primary-action" type="button" onClick={() => setShowImport((value) => !value)}>{showImport ? 'Close import' : 'Import CSV'}</button></div><p>{datasets.length ? `${datasets.length} dataset${datasets.length === 1 ? '' : 's'} saved` : 'Chưa cần có báo cáo ChatGPT để bắt đầu khám phá dữ liệu.'}</p>
        {datasets.length > 0 && <label className="field-label">Dataset to explore<select value={selectedDatasetId} onChange={(event) => { setSelectedDatasetId(event.target.value); setVisibleApps(50); selectedCriterionRef.current = null; setSelectedCriterion(null); }}><option value="">Select a dataset</option>{datasets.map((item) => <option value={item.id} key={item.id}>{item.filename} · {item.source_apps ?? 0} apps</option>)}</select></label>}
        {showImport && <QuantitativeDatasetImport projectId={projectId} onImported={(item) => { setDatasets((current) => current.some((row) => row.id === item.id) ? current.map((row) => row.id === item.id ? item : row) : [item, ...current]); setSelectedDatasetId(item.id); setShowImport(false); setVisibleApps(50); }} />}
      </section>
      <section className="research-panel"><div className="panel-heading"><div><span className="state-label">CHATGPT FINDINGS</span><h3>Reports in this workspace</h3></div></div><p>{reports.length ? `${reports.length} report${reports.length === 1 ? '' : 's'} linked` : 'Import a report here after researching in ChatGPT Plus.'}</p><div className="workspace-report-list">{reports.map((report) => <a key={report.id} href={`/reports/${encodeURIComponent(report.id)}`}><strong>{report.question}</strong><small>{report.geo} · {report.os} · {report.research_period || 'Period not specified'}</small></a>)}</div>
        {allReports.filter((report) => !reports.some((linked) => linked.id === report.id)).length > 0 && <div className="workspace-link-report"><label className="field-label">Add an existing report<select value={linkReportId} onChange={(event) => setLinkReportId(event.target.value)}><option value="">Choose report…</option>{allReports.filter((report) => !reports.some((linked) => linked.id === report.id)).map((report) => <option key={report.id} value={report.id}>{report.question}</option>)}</select></label><button className="secondary-action" type="button" disabled={!linkReportId} onClick={() => void linkReport()}>Add to workspace</button></div>}
      </section>
    </div>
    {dataset && <section className="research-panel workspace-explorer"><div className="panel-heading"><div><span className="state-label">DATA EXPLORER</span><h3>{dataset.filename}</h3></div><span className="data-scope-pill">{dataset.source_rows ?? dataset.observations.length} CSV rows · {dataset.source_apps ?? apps.length} source apps</span></div><p className="field-help">Rows retain their supplied GEO, platform, metric, period and source. Values are not independently verified by importing.</p>
      {apps.length === 0 ? <p>No app rows were detected in this dataset.</p> : <div className="workspace-app-table-scroll"><table className="workspace-app-table"><thead><tr><th>Select</th><th>App / source identity</th><th>Metric observations</th><th>Scope and period</th></tr></thead><tbody>{apps.slice(0, visibleApps).map((app) => <tr key={app.id}><td><input type="checkbox" aria-label={`Select ${app.name} for ChatGPT research`} checked={selectedApps.includes(app.id)} onChange={() => void toggleApp(app.id)} /></td><th scope="row">{app.name}<small>{app.id}</small></th><td>{[...new Set(app.rows.map((row) => row.metric_definition || row.metric_id || 'Unidentified metric'))].join(', ')}</td><td>{[...new Set(app.rows.map((row) => `${row.geo || 'GEO unknown'} · ${row.platform || 'platform unknown'} · ${row.snapshot_date || `${row.period_start || '?'}–${row.period_end || '?'}`}`))].join('; ')}</td></tr>)}</tbody></table></div>}
      {apps.length > visibleApps && <button type="button" className="secondary-action" onClick={() => setVisibleApps((current) => current + 50)}>Load more apps</button>}
      {rankingOption && <div className="workspace-selection-criterion"><label className="field-label">Select candidates by observed data<select value={rankingOption.key} onChange={(event) => setRankingKey(event.target.value)}>{rankingOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label><button type="button" className="secondary-action" disabled={savingSelection || rankingOption.rows.size === 0} onClick={() => void selectFiveHighest()}>Select 5 highest values in this CSV</button><span>Uses this file’s supplied values only; it does not imply a market ranking.</span></div>}
      {selectedCriterion && <p className="field-help">{selectedCriterion}</p>}
      <div className="workspace-followup"><span>{selectedApps.length} app{selectedApps.length === 1 ? '' : 's'} selected{savingSelection ? ' · saving…' : selectionSaveFailed ? ' · not saved' : ' · saved'}</span>{selectionSaveFailed && <button type="button" className="secondary-action" onClick={() => void retrySaveSelection()}>Retry saving selection</button>}<button type="button" className="primary-action" disabled={selected.length === 0 || savingSelection || selectionSaveFailed} onClick={() => void createPrompt()}>Research these apps with ChatGPT</button></div>
      {prompt && <label className="workspace-prompt"><span className="field-label">Copy-ready research prompt</span><textarea readOnly rows={16} value={prompt} onFocus={(event) => event.currentTarget.select()} /></label>}
    </section>}
    {datasets.length > 1 && <section className="research-panel"><div className="panel-heading"><div><span className="state-label">NEXT STEP</span><h3>Compare compatible periods</h3></div><a className="primary-action" href={`/compare-periods?projectId=${encodeURIComponent(projectId)}`}>Compare periods</a></div><p>Only compatible metric definitions, measurement windows and source scopes are compared.</p></section>}
  </div>;
}
