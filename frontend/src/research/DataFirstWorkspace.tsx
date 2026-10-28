import { useEffect, useMemo, useRef, useState } from 'react';
import { reportApi, type ComparisonDataset, type QuantitativeDataset, type ReportSummary } from '../reports/api';
import { QuantitativeDatasetImport } from '../reports/QuantitativeDatasetImport';
import { csvMetricLabel, csvSourcePeriodLabel } from '../reports/csvPresentation';
import { researchApi, type ResearchBenchmarkCollection, type ResearchProject, type ResearchSubjectSource, type ShortlistContext } from './api';
import { OpportunityReview } from './OpportunityReview';
import { ProjectJourneyNav } from './ProjectJourneyNav';
import { ResearchSubjectsPanel } from './ResearchSubjectsPanel';
import { TrendUpdatesPanel } from './TrendUpdatesPanel';
import { ImageEvidencePanel } from './ImageEvidencePanel';
import { SavedInformationPanel } from './SavedInformationPanel';

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
    `Câu hỏi nghiên cứu: Tìm hiểu bối cảnh sản phẩm và thị trường của các sản phẩm đã chọn trong “${project.name}”.`,
    `Tệp dữ liệu nguồn đã lưu: ${dataset.filename} (mã tham chiếu ${context.dataset_id}; mã nội dung ${context.dataset_content_sha256}).`,
    context.selection_criterion ? `Tiêu chí chọn: ${context.selection_criterion}` : 'Phạm vi lựa chọn: PO đã chọn các sản phẩm này thủ công; không mô tả chúng là các sản phẩm dẫn đầu toàn thị trường.',
    context.measurement ? `Số liệu dùng để chọn: ${context.measurement.metric_definition} (${context.measurement.metric_id}); ${context.measurement.unit}; GEO ${context.measurement.geo}; nền tảng ${context.measurement.platform}; ${context.measurement.snapshot_date || `${context.measurement.period_start} đến ${context.measurement.period_end}`}; ${context.measurement.methodology}.` : 'Phạm vi số liệu: Chọn thủ công; chưa xác định một phạm vi đo lường chung.',
    `Mã đối tượng nguồn: ${context.source_entity_ids.join(', ')}. Số tham chiếu quan sát: ${context.observation_refs.length}.`,
    '', 'Dữ liệu nguồn đã chọn (quan sát từ CSV tại máy; giữ nguyên và coi là số liệu chưa xác minh, không đại diện toàn thị trường):',
    JSON.stringify(observations, null, 2),
    '', 'Tách biệt rõ các loại nguồn sau:',
    '- Quan sát CSV phía trên chỉ là số đo từ các tệp đã cung cấp; không trình bày như dữ liệu đã được xác minh độc lập.',
    '- Bằng chứng công khai trên web phải có URL hoạt động và ngày. Không nói rằng CSV trên máy đã được tìm kiếm hoặc tải lên web.',
    '- Diễn giải của ChatGPT phải được ghi rõ là diễn giải, không phải dữ kiện quan sát.',
    '- Giải thích tăng trưởng hoặc quan hệ nhân quả là giả thuyết nếu chưa có bằng chứng tương thích hỗ trợ độc lập.',
    '', 'Với mỗi sản phẩm đã chọn, nghiên cứu lối chơi/tính năng, động lực người dùng, cơ chế duy trì, kiếm tiền, khác biệt, bối cảnh thị trường và giả thuyết tăng trưởng có bằng chứng. Nêu khoảng trống nghiên cứu và bước tiếp theo hữu ích cho PO.',
    'Chỉ dùng các quan sát liệt kê phía trên trong bộ dữ liệu đã lưu. Giữ riêng GEO, nền tảng, kỳ, đơn vị và phương pháp. Không suy ra chỉ số còn thiếu hoặc ghép bản ghi chỉ dựa trên tên hiển thị.',
    'Trả về Markdown gồm tóm tắt điều hành, phát hiện, đối tượng, tham chiếu bằng chứng, quan sát định lượng (chỉ dùng số đo chính xác có nguồn), khoảng trống nghiên cứu và đề xuất cho PO.',
  ].join('\n');
}

export function DataFirstWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [datasets, setDatasets] = useState<ComparisonDataset[]>([]);
  const [collections, setCollections] = useState<ResearchBenchmarkCollection[]>([]);
  const [subjectSources, setSubjectSources] = useState<ResearchSubjectSource[]>([]);
  const [targetCollectionId, setTargetCollectionId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [displayMetric, setDisplayMetric] = useState('');
  const [productSort, setProductSort] = useState<'asc' | 'desc'>('desc');
  const [productActionBusy, setProductActionBusy] = useState<string | null>(null);
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
  const csvImportFocus = new URLSearchParams(window.location.search).get('action') === 'import-csv';
  const [showImport, setShowImport] = useState(csvImportFocus);
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
    let active = true;
    reportApi.getProjectQuantitativeDataset(projectId, selectedDatasetId)
      .then((item) => { if (active) setDataset(item); })
      .catch((cause) => { if (active) { setDataset(null); setError(cause instanceof Error ? cause.message : 'Không mở được dataset.'); } });
    return () => { active = false; };
  }, [projectId, selectedDatasetId]);

  const apps = useMemo(() => groupsFor(dataset), [dataset]);
  const rankingOptions = useMemo(() => rankingOptionsFor(apps), [apps]);
  const datasetMetrics = useMemo(() => [...new Map((dataset?.observations ?? []).filter((row) => row.metric_id).map((row) => [row.metric_id!, row.metric_definition || row.metric_id!])).entries()], [dataset]);
  const activeMetric = datasetMetrics.find(([id]) => id === displayMetric)?.[0] ?? datasetMetrics[0]?.[0] ?? '';
  const visibleProductRows = useMemo(() => {
    const filtered = apps.filter((app) => `${app.name} ${app.id}`.toLocaleLowerCase().includes(productQuery.trim().toLocaleLowerCase()));
    const metricId = activeMetric;
    if (metricId) filtered.sort((left, right) => {
      const a = left.rows.find((row) => row.metric_id === metricId)?.value;
      const b = right.rows.find((row) => row.metric_id === metricId)?.value;
      const difference = (a == null ? Number.NEGATIVE_INFINITY : Number(a)) - (b == null ? Number.NEGATIVE_INFINITY : Number(b));
      return (productSort === 'desc' ? -difference : difference) || left.name.localeCompare(right.name);
    });
    return filtered;
  }, [apps, productQuery, activeMetric, productSort]);
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

  if (loading) return <section className="research-panel"><p role="status">Đang mở dự án…</p></section>;
  if (!project) return <section className="research-panel"><div className="research-alert" role="alert">{error || 'Không tìm thấy dự án.'}</div><a href="/research">Quay lại trang Nghiên cứu</a></section>;

  return <div className={`data-first-workspace${csvImportFocus ? ' csv-import-focus' : ''}`}>
    <ProjectJourneyNav projectId={projectId} active="research" />
    <section className="research-panel data-workspace-heading"><div><a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}`}>← Về trang dự án</a><span className="state-label">NGHIÊN CỨU TRONG DỰ ÁN</span><h2>{project.name}</h2><p>Báo cáo, cập nhật nghiên cứu và dữ liệu được lưu cùng một nơi.</p></div></section>
    <SavedInformationPanel projectId={projectId} />
    <ResearchSubjectsPanel projectId={projectId} />
    <details className="saved-information-legacy"><summary>Các cập nhật xu hướng và ảnh đã lưu trước đây</summary><p>Các nội dung này được lưu theo quy trình trước. Chúng vẫn được giữ nguyên và có thể xem tại đây.</p><TrendUpdatesPanel projectId={projectId} /><ImageEvidencePanel projectId={projectId} /></details>
    {error && <div className="research-alert" role="alert">{error}</div>}{notice && <div className="research-success" role="status">{notice}</div>}
    <div className="workspace-source-grid">
      <section className="research-panel" id="project-csv-data"><div className="panel-heading"><div><span className="state-label">SỐ LIỆU THỊ TRƯỜNG</span><h3>Tệp dữ liệu CSV</h3></div><button className="primary-action" type="button" onClick={() => setShowImport((value) => !value)}>{showImport ? 'Đóng phần nhập' : 'Nhập CSV'}</button></div><p>{datasets.length ? `Đã lưu ${datasets.length} bộ dữ liệu` : 'Bạn có thể thêm tệp dữ liệu trước hoặc sau khi nhập báo cáo nghiên cứu.'}</p>
        {datasets.length > 0 && <label className="field-label">Tệp dữ liệu cần xem<select value={selectedDatasetId} onChange={(event) => { setSelectedDatasetId(event.target.value); setVisibleApps(50); setPrompt(''); }}><option value="">Chọn tệp dữ liệu</option>{datasets.map((item) => <option value={item.id} key={item.id}>{item.filename} · {item.source_apps ?? 0} sản phẩm</option>)}</select></label>}
        {showImport && <QuantitativeDatasetImport projectId={projectId} onImported={(item) => { setSelectedDatasetId(item.id); setDataset(item); setShowImport(false); setVisibleApps(50); void (async () => { const all: ComparisonDataset[] = []; let cursor: string | undefined; do { const page = await reportApi.listComparisonDatasets(cursor, projectId); all.push(...page.items.filter((row) => !all.some((existing) => existing.id === row.id))); cursor = page.next_cursor ?? undefined; } while (cursor); setDatasets(all); })().catch((cause) => setError(cause instanceof Error ? cause.message : 'CSV đã lưu nhưng danh sách chưa làm mới. Hãy bấm Refresh.')); }} />}
      </section>
      <section className="research-panel" id="workspace-reports"><div className="panel-heading"><div><span className="state-label">KẾT QUẢ CHATGPT</span><h3>Báo cáo trong dự án</h3></div><a className="secondary-action" href={`/reports?projectId=${encodeURIComponent(projectId)}`}>Mở thư viện báo cáo</a></div><p>{reports.length ? `Đã liên kết ${reports.length} báo cáo` : 'Nhập báo cáo tại đây sau khi nghiên cứu bằng ChatGPT Plus.'}</p><div className="workspace-report-list">{reports.map((report) => <a key={report.id} href={`/reports/${encodeURIComponent(report.id)}`}><strong>{report.question}</strong><small>{displayReportScope(report.geo, report.os, report.research_period)}</small></a>)}</div>
        {allReports.filter((report) => !reports.some((linked) => linked.id === report.id)).length > 0 && <div className="workspace-link-report"><label className="field-label">Thêm báo cáo đã lưu<select value={linkReportId} onChange={(event) => setLinkReportId(event.target.value)}><option value="">Chọn báo cáo…</option>{allReports.filter((report) => !reports.some((linked) => linked.id === report.id)).map((report) => <option key={report.id} value={report.id}>{report.question}</option>)}</select></label><button className="secondary-action" type="button" disabled={!linkReportId} onClick={() => void linkReport()}>Thêm vào dự án</button></div>}
        {(reportsCursor || allReportsCursor) && <button type="button" className="secondary-action" disabled={loadingMoreReports} onClick={() => void loadMoreReports()}>{loadingMoreReports ? 'Đang tải báo cáo…' : 'Tải thêm báo cáo'}</button>}
      </section>
    </div>
    {selectedContext && <section className="research-panel workspace-saved-shortlist"><div className="panel-heading"><div><span className="state-label">SẢN PHẨM ĐÃ CHỌN</span><h3>{selectedApps.length} sản phẩm · {selectedContext.dataset_filename || 'Lựa chọn cũ'}</h3></div><span role="status">{savingSelection ? 'Đang lưu…' : selectionSaveFailed ? 'Lưu thất bại' : 'Đã lưu'}</span></div><p>{selectedContext.selection_type === 'legacy' ? 'Danh sách cũ này không lưu nguồn dữ liệu; không xác định được nguồn ban đầu.' : selectedContext.selection_criterion || 'Đã chọn thủ công từ tệp nguồn đã lưu.'}</p>{selectedContext.measurement && <p>{selectedContext.measurement.metric_definition} · {selectedContext.measurement.unit} · {selectedContext.measurement.geo} · {selectedContext.measurement.platform} · {selectedContext.measurement.snapshot_date || `${selectedContext.measurement.period_start} – ${selectedContext.measurement.period_end}`}</p>}<button type="button" className="primary-action" onClick={() => void createPrompt()} disabled={selectedApps.length === 0 || savingSelection || selectionSaveFailed}>Tạo yêu cầu nghiên cứu từ danh sách đã lưu</button></section>}
    {dataset && <section className="research-panel workspace-explorer"><div className="panel-heading"><div><span className="state-label">KHÁM PHÁ DỮ LIỆU</span><h3>{dataset.filename}</h3></div><span className="data-scope-pill">{dataset.source_rows ?? dataset.observations.length} dòng CSV · {dataset.source_apps ?? apps.length} sản phẩm nguồn</span></div><p className="field-help">Đọc và lọc trực tiếp số liệu từ CSV, không cần bổ sung metadata trước. Số liệu chưa được xác minh độc lập.</p><p className="csv-readiness-summary" role="status">{dataset.observations.length} phép đo đọc từ CSV · {dataset.observations.filter((row) => row.complete_observation === true && row.analysis_ready === true).length} phép đo đủ thông tin để phân tích. {dataset.observations.some((row) => row.complete_observation === true && row.analysis_ready === true) ? 'Chỉ được so sánh những phép đo có cùng phạm vi và định nghĩa.' : 'Chưa thể kết luận tăng trưởng hoặc so sánh chuẩn hóa. Vẫn có thể xem mọi giá trị gốc bên dưới.'}</p>
      {!activeSelectionMatchesDataset && <div className="research-alert" role="status">Danh sách đã lưu thuộc tệp dữ liệu “{selectedContext?.dataset_filename || 'nguồn cũ chưa biết'}”, không phải tệp đang xem. Chọn “Tạo danh sách mới…” để bắt đầu từ tệp này; danh sách cũ vẫn được giữ cho đến khi bạn xác nhận hành động đó.</div>}
      {activeSelectionMatchesDataset && selectedApps.length === 0 && selectedContext && <p className="field-help">Danh sách mới đã mở từ tệp này. Chọn sản phẩm bên dưới để lưu vào danh sách.</p>}
      {!activeSelectionMatchesDataset && <button type="button" className="secondary-action" onClick={startNewShortlist} disabled={savingSelection}>Tạo danh sách mới từ tệp này (thay danh sách hiện tại)</button>}
      {apps.length > 0 && <div className="workspace-product-controls"><label>Tìm sản phẩm<input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Tên hoặc mã sản phẩm…" /></label><label>Chỉ số cần xem<select aria-label="Chỉ số cần xem trong bảng sản phẩm" value={activeMetric} onChange={(event) => setDisplayMetric(event.target.value)}>{datasetMetrics.map(([id, name]) => <option key={id} value={id} title={name}>{csvMetricLabel(id, name)}</option>)}</select></label><button type="button" className="secondary-action" onClick={() => setProductSort((current) => current === 'desc' ? 'asc' : 'desc')}>Giá trị: {productSort === 'desc' ? 'cao → thấp' : 'thấp → cao'}</button><label>Bộ so sánh<select aria-label="Bộ so sánh đích" value={targetCollectionId} onChange={(event) => setTargetCollectionId(event.target.value)}><option value="">Chọn bộ so sánh…</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label></div>}
      {apps.length === 0 ? <p>Không tìm thấy dòng sản phẩm trong tệp dữ liệu này.</p> : <div className="workspace-app-table-scroll"><table className="workspace-app-table"><thead><tr><th>Chọn nghiên cứu</th><th>Sản phẩm / mã nguồn</th><th>{csvMetricLabel(activeMetric, datasetMetrics.find(([id]) => id === activeMetric)?.[1])}<span className="table-source-label">Tên cột CSV: {datasetMetrics.find(([id]) => id === activeMetric)?.[1] || 'Không rõ'}</span></th><th>Phạm vi trong file</th><th>Hồ sơ và bộ so sánh</th></tr></thead><tbody>{visibleProductRows.slice(0, visibleApps).map((app) => { const observation = app.rows.find((row) => row.metric_id === activeMetric); const mapping = sourceMappingFor(app); const profileHref = mapping?.mapped_subject_id ? `/research?projectId=${encodeURIComponent(projectId)}&view=data&subjectId=${encodeURIComponent(mapping.mapped_subject_id)}#project-subject-profiles` : ''; return <tr key={app.id}><td><input type="checkbox" aria-label={`Chọn ${app.name} để nghiên cứu bằng ChatGPT`} checked={activeSelectionMatchesDataset && selectedApps.includes(app.id)} disabled={!activeSelectionMatchesDataset || savingSelection} onChange={() => void toggleApp(app.id)} /></td><th scope="row">{app.name}<small>{app.id}</small></th><td data-label={csvMetricLabel(activeMetric, datasetMetrics.find(([id]) => id === activeMetric)?.[1])}><strong className="workspace-source-value">{observation?.value == null ? (observation?.source_validation_reasons?.length ? 'Giá trị không hợp lệ' : 'Chưa có giá trị') : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(observation.value)}${observation.unit ? ` ${observation.unit}` : ''}`}</strong><small>{observation?.verification_status === 'verified' ? 'Đã xác minh độc lập' : 'Đọc từ CSV · chưa xác minh độc lập'}{observation && !observation.analysis_ready ? ' · Chưa đủ metadata so sánh' : ''}</small></td><td data-label="Phạm vi nguồn">{[...new Set(app.rows.map((row) => `${row.geo || 'Chưa có GEO'} · ${row.platform || 'Chưa rõ nền tảng'} · ${csvSourcePeriodLabel(row)}`))].join('; ')}</td><td className="workspace-product-actions" data-label="Xem hồ sơ / so sánh">{profileHref ? <a className="secondary-action" href={profileHref}>Mở hồ sơ</a> : <button type="button" className="secondary-action" disabled={productActionBusy === app.id} onClick={async () => { setProductActionBusy(app.id); setError(''); try { const subjectId = await resolveSubject(app); setNotice(`Đã tạo hồ sơ cho ${app.name}.`); window.history.pushState({}, '', `/research?projectId=${encodeURIComponent(projectId)}&view=data&subjectId=${encodeURIComponent(subjectId)}#project-subject-profiles`); window.dispatchEvent(new PopStateEvent('popstate')); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được hồ sơ.'); } finally { setProductActionBusy(null); } }}>{productActionBusy === app.id ? 'Đang tạo…' : 'Tạo hồ sơ'}</button>}<button type="button" className="text-button" disabled={productActionBusy === app.id || !targetCollectionId} onClick={() => void addProductToCollection(app)}>Thêm vào bộ so sánh</button></td></tr>; })}</tbody></table></div>}
      {visibleProductRows.length > visibleApps && <button type="button" className="secondary-action" onClick={() => setVisibleApps((current) => current + 50)}>Tải thêm sản phẩm</button>}
      {rankingOption && <div className="workspace-selection-criterion"><label className="field-label">Chọn sản phẩm theo số liệu đã ghi nhận<select value={rankingOption.key} onChange={(event) => setRankingKey(event.target.value)}>{rankingOptions.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label><button type="button" className="secondary-action" disabled={!activeSelectionMatchesDataset || savingSelection || rankingOption.rows.size < 5} onClick={() => void selectFiveHighest()}>Chọn 5 giá trị cao nhất trong CSV này</button><span>Dùng 5 quan sát chính xác, đầy đủ và cùng phạm vi trong tệp này. Đây không phải thứ hạng thị trường.</span></div>}
      {rankingOptions.length === 0 && <p className="field-help">Chưa thể tự chọn sản phẩm vì không có nhóm 5 quan sát chính xác, đầy đủ cùng chỉ số, đơn vị, thị trường, nền tảng, phương pháp và kỳ. Bạn vẫn có thể tự chọn sản phẩm sau khi tạo danh sách từ tệp này.</p>}
      {selectedCriterion && <p className="field-help">{selectedCriterion}</p>}
      <div className="workspace-followup"><span>{activeSelectionMatchesDataset ? `${selected.length} sản phẩm đã chọn` : 'Danh sách đã lưu thuộc một tệp dữ liệu khác'}{savingSelection ? ' · đang lưu…' : selectionSaveFailed ? ' · chưa lưu' : ' · đã lưu'}</span>{selectionSaveFailed && <button type="button" className="secondary-action" onClick={() => void retrySaveSelection()}>Thử lưu lại lựa chọn</button>}<button type="button" className="primary-action" disabled={!selectedContext || selectedContext.source_entity_ids.length === 0 || savingSelection || selectionSaveFailed} onClick={() => void createPrompt()}>Nghiên cứu các sản phẩm này bằng ChatGPT</button></div>
      {prompt && <label className="workspace-prompt"><span className="field-label">Yêu cầu nghiên cứu sẵn sàng sao chép</span><textarea readOnly rows={16} value={prompt} onFocus={(event) => event.currentTarget.select()} /></label>}
    </section>}
    {datasets.length > 1 && <section className="research-panel"><div className="panel-heading"><div><span className="state-label">BƯỚC TIẾP THEO</span><h3>So sánh các kỳ phù hợp</h3></div><a className="primary-action" href={`/compare-periods?projectId=${encodeURIComponent(projectId)}`}>So sánh các kỳ</a></div><p>Chỉ so sánh các định nghĩa chỉ số, khoảng đo và phạm vi nguồn tương thích.</p></section>}
  </div>;
}
