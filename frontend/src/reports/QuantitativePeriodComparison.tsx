import { useEffect, useState } from 'react';
import { reportApi, type ComparisonDataset, type ComparisonMetric, type ComparisonPeriod, type ImportedReport, type ReportSummary, type QuantitativeComparisonInput, type QuantitativeComparisonPreview, type QuantitativeDataset } from './api';
import { QuantitativeDatasetImport } from './QuantitativeDatasetImport';
import { DatasetMetadataReview } from './DatasetMetadataReview';
import { ResultsIcon } from '../ui/ResultsIcon';
import { QuantitativeComparisonCharts } from './QuantitativeComparisonCharts';

const metricKey = (metric: ComparisonMetric) => metric.key;
const labelPeriod = (period: ComparisonPeriod) => period.semantics === 'snapshot'
  ? `Snapshot · ${period.snapshot_date ?? period.snapshot_date_candidate ?? 'date missing'}`
  : period.semantics === 'unknown'
    ? `Meaning needs confirmation · ${period.snapshot_date ?? period.snapshot_date_candidate ?? ([period.period_start, period.period_end].filter(Boolean).join(' – ') || 'date missing')}`
    : `${period.period_start ?? '?'} – ${period.period_end ?? '?'} · ${period.semantics === 'rolling_interval' ? 'rolling interval' : 'reporting interval'}`;

export function QuantitativePeriodComparison() {
  const [reviewDataset, setReviewDataset] = useState<{ id: string; report_id: string | null; project_id?: string | null } | null>(null);
  const projectId = new URLSearchParams(window.location.search).get('projectId') ?? undefined;
  const [datasets, setDatasets] = useState<ComparisonDataset[]>([]);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [importReport, setImportReport] = useState<ImportedReport | null>(null);
  const [baselineId, setBaselineId] = useState('');
  const [currentId, setCurrentId] = useState('');
  const [selectedMetricKey, setSelectedMetricKey] = useState('');
  const [geo, setGeo] = useState('');
  const [platform, setPlatform] = useState('');
  const [baselinePeriodKey, setBaselinePeriodKey] = useState('');
  const [currentPeriodKey, setCurrentPeriodKey] = useState('');
  const [baselineMeaning, setBaselineMeaning] = useState('');
  const [currentMeaning, setCurrentMeaning] = useState('');
  const [result, setResult] = useState<QuantitativeComparisonPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');

  async function loadCatalog() {
    try {
      const loaded: ComparisonDataset[] = [];
      let cursor: string | undefined;
      do {
        const response = await reportApi.listComparisonDatasets(cursor, projectId);
        loaded.push(...response.items);
        cursor = response.next_cursor ?? undefined;
      } while (cursor);
      setDatasets(loaded);
      setBaselineId((current) => loaded.some((item) => item.id === current) ? current : '');
      setCurrentId((current) => loaded.some((item) => item.id === current) ? current : '');
    } catch (error) { setFailure(error instanceof Error ? error.message : 'Không tải được danh sách CSV.'); }
  }

  useEffect(() => {
    void loadCatalog();
    if (projectId) { setReports([]); setSelectedReportId(''); setImportReport(null); return; }
    void (async () => {
      const loaded: ReportSummary[] = [];
      let cursor: string | undefined;
      do {
        const page = await reportApi.list(cursor);
        loaded.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      setReports(loaded);
    })().catch((error) => setFailure(error instanceof Error ? error.message : 'Không tải được danh sách báo cáo.'));
  }, [projectId]);

  useEffect(() => {
    if (!selectedReportId) { setImportReport(null); return; }
    let active = true;
    reportApi.get(selectedReportId).then((report) => { if (active) setImportReport(report); })
      .catch((error) => { if (active) setFailure(error instanceof Error ? error.message : 'Không mở được báo cáo đã chọn.'); });
    return () => { active = false; };
  }, [selectedReportId]);

  const baseline = datasets.find((dataset) => dataset.id === baselineId);
  const current = datasets.find((dataset) => dataset.id === currentId);
  const baselineMetrics = baseline?.metrics ?? [];
  const currentMetricKeys = new Set((current?.metrics ?? []).map(metricKey));
  const sharedMetrics = baselineMetrics.filter((metric) => currentMetricKeys.has(metricKey(metric)));
  const sameMetricMeaning = baselineMetrics.some((left) => (current?.metrics ?? []).some((right) =>
    [left.metric_id, left.metric_definition, left.unit].every((value, index) => (value ?? '').trim().toLocaleLowerCase() === ([right.metric_id, right.metric_definition, right.unit][index] ?? '').trim().toLocaleLowerCase())));
  const metric = sharedMetrics.find((item) => metricKey(item) === selectedMetricKey);
  const compatibleGeos = metric && baseline && current
    ? baseline.periods.flatMap((period) => period.geos).filter((value, index, list) => list.findIndex((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase()) === index && current.geo_values.some((other) => other.toLocaleLowerCase() === value.toLocaleLowerCase()))
    : [];
  const compatiblePlatforms = metric && baseline && current
    ? baseline.periods.flatMap((period) => period.platforms).filter((value, index, list) => list.findIndex((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase()) === index && current.platform_values.some((other) => other.toLocaleLowerCase() === value.toLocaleLowerCase()))
    : [];
  const periodHasMetricScope = (period: ComparisonPeriod) => Boolean(metric && period.metric_keys.includes(metricKey(metric)) && (!geo || period.geos.some((value) => value.toLocaleLowerCase() === geo.toLocaleLowerCase())) && (!platform || period.platforms.some((value) => value.toLocaleLowerCase() === platform.toLocaleLowerCase())));
  const baselinePeriods = (baseline?.periods ?? []).filter(periodHasMetricScope);
  const currentPeriods = (current?.periods ?? []).filter(periodHasMetricScope);

  useEffect(() => {
    setResult(null); setFailure('');
    setSelectedMetricKey((previous) => sharedMetrics.some((item) => metricKey(item) === previous) ? previous : sharedMetrics.length === 1 ? metricKey(sharedMetrics[0]) : '');
    setGeo((previous) => compatibleGeos.some((value) => value.toLocaleLowerCase() === previous.toLocaleLowerCase()) ? previous : compatibleGeos.length === 1 ? compatibleGeos[0] : '');
    setPlatform((previous) => compatiblePlatforms.some((value) => value.toLocaleLowerCase() === previous.toLocaleLowerCase()) ? previous : compatiblePlatforms.length === 1 ? compatiblePlatforms[0] : '');
  }, [baselineId, currentId, sharedMetrics.map(metricKey).join('|'), compatibleGeos.join('|'), compatiblePlatforms.join('|')]);

  useEffect(() => {
    if (!baselinePeriods.some((period) => period.key === baselinePeriodKey)) setBaselinePeriodKey(baselinePeriods.length === 1 ? baselinePeriods[0].key : '');
    if (!currentPeriods.some((period) => period.key === currentPeriodKey)) setCurrentPeriodKey(currentPeriods.length === 1 ? currentPeriods[0].key : '');
    setResult(null);
  }, [baselineId, currentId, selectedMetricKey, geo, platform, baselinePeriods.map((period) => period.key).join('|'), currentPeriods.map((period) => period.key).join('|')]);

  const chosenBaselinePeriod = baselinePeriods.find((period) => period.key === baselinePeriodKey);
  const chosenCurrentPeriod = currentPeriods.find((period) => period.key === currentPeriodKey);
  const canCompare = Boolean(baseline && current && baselineId !== currentId && metric?.metric_id && metric.metric_definition && metric.unit && metric.methodology && geo && platform && baselinePeriodKey && currentPeriodKey
    && (chosenBaselinePeriod?.semantics !== 'unknown' || baselineMeaning) && (chosenCurrentPeriod?.semantics !== 'unknown' || currentMeaning));

  async function compare() {
    if (!canCompare || !baseline || !current || !metric) return;
    const input: QuantitativeComparisonInput = {
      baseline_dataset_id: baseline.id, current_dataset_id: current.id,
      metric_id: metric.metric_id!, metric_definition: metric.metric_definition!, unit: metric.unit!, methodology: metric.methodology!,
      geo, platform, baseline_period_key: baselinePeriodKey, current_period_key: currentPeriodKey,
      ...(baselineMeaning ? { baseline_semantics_confirmation: baselineMeaning as QuantitativeComparisonInput['baseline_semantics_confirmation'] } : {}),
      ...(currentMeaning ? { current_semantics_confirmation: currentMeaning as QuantitativeComparisonInput['current_semantics_confirmation'] } : {}),
    };
    setBusy(true); setFailure(''); setNotice(''); setResult(null);
    try { setResult(await reportApi.previewQuantitativeComparison(input)); }
    catch (error) { setFailure(error instanceof Error ? error.message : 'Không tạo được bản xem trước so sánh.'); }
    finally { setBusy(false); }
  }

  function onImported(dataset: QuantitativeDataset) {
    setNotice(dataset.duplicate ? 'CSV trùng đã được nhận diện; đang làm mới danh sách dataset.' : 'CSV đã lưu. Bạn có thể chọn nó ở phần so sánh.');
    setFailure(''); void loadCatalog(); if (dataset.duplicate) setReviewDataset(dataset);
  }

  return <div className="period-comparison-page">
    <section className="comparison-intro-panel">
      <span className="comparison-icon"><ResultsIcon name="comparison" /></span>
      <div><span className="state-label">PERIOD COMPARISON</span><h2>Compare CSV exports</h2><p>Chọn hai lần export, đối chiếu theo ID nguồn ổn định và xem mọi app xuất hiện ở một hoặc cả hai kỳ.</p>{projectId && <a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}&view=data`}>← Back to research workspace</a>}</div>
    </section>

    <section className="comparison-import-panel" aria-labelledby="comparison-import-title">
      <div className="comparison-section-heading"><div><span className="state-label">ADD SOURCE FILES</span><h2 id="comparison-import-title">Import an export</h2></div><span>{projectId ? 'CSV gốc sẽ được lưu riêng trong workspace này cùng provenance.' : 'CSV gốc sẽ gắn với báo cáo được chọn, được giữ nguyên và không bị gộp.'}</span></div>
      {projectId ? <QuantitativeDatasetImport key={projectId} projectId={projectId} onImported={onImported} /> : <>
        <label>Báo cáo để giữ provenance<select value={selectedReportId} onChange={(event) => setSelectedReportId(event.target.value)}><option value="">Chọn báo cáo…</option>{reports.map((report) => <option value={report.id} key={report.id}>{report.question}</option>)}</select></label>
        {importReport && <QuantitativeDatasetImport key={importReport.id} report={importReport} onImported={onImported} />}
        {!importReport && <p className="comparison-muted">Chọn báo cáo rồi thêm mỗi file export một lần. Không cần ghép CSV bằng tay.</p>}
      </>}
    </section>

    <section className="comparison-config-panel" aria-labelledby="comparison-config-title">
      <div className="comparison-section-heading"><div><span className="state-label">BUILD A COMPARISON</span><h2 id="comparison-config-title">Choose datasets and measurement</h2></div><button type="button" className="secondary-action" onClick={() => void loadCatalog()}>Refresh datasets</button></div>
      <div className="comparison-dataset-information">{[baseline, current].filter((item): item is ComparisonDataset => Boolean(item)).map((dataset) => <article key={dataset.id}><strong>{dataset.filename}</strong><p>{dataset.geo_values.join(', ') || 'GEO chưa rõ'} / {dataset.platform_values.join(', ') || 'Nền tảng chưa rõ'} · {dataset.source_apps} ứng dụng · {dataset.metrics.filter((item) => item.usable_observations > 0).length} phép đo đủ thông tin</p><p>{dataset.periods.map(labelPeriod).join('; ')}</p><button type="button" className="secondary-action" onClick={() => setReviewDataset(dataset)}>Review dataset information</button><details><summary>Thông tin cần xem lại</summary>{dataset.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details></article>)}</div>
      <div className="comparison-select-grid">
        <label>Baseline dataset<select value={baselineId} onChange={(event) => { setBaselineId(event.target.value); setResult(null); }}><option value="">Choose earlier export…</option>{datasets.map((dataset) => <option value={dataset.id} key={dataset.id}>{dataset.filename} · {dataset.report_question}</option>)}</select></label>
        <label>Current dataset<select value={currentId} onChange={(event) => { setCurrentId(event.target.value); setResult(null); }}><option value="">Choose later export…</option>{datasets.map((dataset) => <option value={dataset.id} key={dataset.id} disabled={dataset.id === baselineId}>{dataset.filename} · {dataset.report_question}</option>)}</select></label>
        <label>Metric<select value={selectedMetricKey} onChange={(event) => { setSelectedMetricKey(event.target.value); setResult(null); }} disabled={!sharedMetrics.length}><option value="">{sharedMetrics.length ? 'Choose exact metric definition…' : 'No exact metric shared yet'}</option>{sharedMetrics.map((item) => <option value={metricKey(item)} key={metricKey(item)}>{item.metric_definition} · {item.unit} · {item.methodology}</option>)}</select></label>
        <label>GEO<select value={geo} onChange={(event) => { setGeo(event.target.value); setResult(null); }} disabled={!compatibleGeos.length}><option value="">Choose shared GEO…</option>{compatibleGeos.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Platform<select value={platform} onChange={(event) => { setPlatform(event.target.value); setResult(null); }} disabled={!compatiblePlatforms.length}><option value="">Choose shared platform…</option>{compatiblePlatforms.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Baseline period<select value={baselinePeriodKey} onChange={(event) => { setBaselinePeriodKey(event.target.value); setBaselineMeaning(''); setResult(null); }} disabled={!baselinePeriods.length}><option value="">Choose baseline…</option>{baselinePeriods.map((period) => <option key={period.key} value={period.key}>{labelPeriod(period)}</option>)}</select></label>
        <label>Current period<select value={currentPeriodKey} onChange={(event) => { setCurrentPeriodKey(event.target.value); setCurrentMeaning(''); setResult(null); }} disabled={!currentPeriods.length}><option value="">Choose current…</option>{currentPeriods.map((period) => <option key={period.key} value={period.key}>{labelPeriod(period)}</option>)}</select></label>
      </div>
      {(chosenBaselinePeriod?.semantics === 'unknown' || chosenCurrentPeriod?.semantics === 'unknown') && <div className="comparison-confirmations"><p>At least one file does not state what its date means. Confirm it before comparing.</p>{chosenBaselinePeriod?.semantics === 'unknown' && <label>Baseline date meaning<select value={baselineMeaning} onChange={(event) => { setBaselineMeaning(event.target.value); setResult(null); }}><option value="">Choose…</option><option value="snapshot">Snapshot date</option><option value="reporting_interval">Reporting interval</option><option value="rolling_interval">Rolling interval</option></select></label>}{chosenCurrentPeriod?.semantics === 'unknown' && <label>Current date meaning<select value={currentMeaning} onChange={(event) => { setCurrentMeaning(event.target.value); setResult(null); }}><option value="">Choose…</option><option value="snapshot">Snapshot date</option><option value="reporting_interval">Reporting interval</option><option value="rolling_interval">Rolling interval</option></select></label>}</div>}
      {baseline && current && sameMetricMeaning && !sharedMetrics.some((item) => item.methodology?.trim()) && <p className="comparison-warning">The files contain the same metric and unit, but no matching measurement methodology is recorded. Mở Review dataset information để bổ sung căn cứ phương pháp đo cho file đã lưu; không cần import lại.</p>}
      {baseline && current && sharedMetrics.length === 0 && <p className="comparison-warning">These files have no exact shared metric definition, unit, and methodology. Similar labels are not enough to compare them.</p>}
      <button type="button" className="primary-action" disabled={!canCompare || busy} onClick={() => void compare()}>{busy ? 'Comparing source rows…' : 'Compare selected periods'}</button>
    </section>

    {reviewDataset && <DatasetMetadataReview key={reviewDataset.id} reportId={reviewDataset.report_id ?? undefined} projectId={reviewDataset.project_id ?? undefined} datasetId={reviewDataset.id} onClose={() => setReviewDataset(null)} onSaved={() => { setResult(null); setSelectedMetricKey(''); setBaselinePeriodKey(''); setCurrentPeriodKey(''); void loadCatalog(); }} />}
    {failure && <div role="alert" className="research-alert">{failure}</div>}{notice && <div role="status" className="research-success">{notice}</div>}
    {result && <section className="comparison-results" aria-labelledby="comparison-results-title">
      <header className="comparison-results-heading"><div><span className="state-label">SOURCE-TRACEABLE RESULT</span><h2 id="comparison-results-title">{result.baseline_period.semantics} comparison · {result.metric.metric_definition}</h2><p>{result.geo} · {result.platform} · {labelPeriod(result.baseline_period)} → {labelPeriod(result.current_period)}</p></div><span className={`comparison-readiness ${result.period_readiness.compatible ? 'ready' : 'blocked'}`}>{result.period_readiness.compatible ? 'Periods compatible' : 'Changes withheld'}</span></header>
      {!result.period_readiness.compatible && <p className="comparison-warning">{result.period_readiness.reasons.join(' ')}</p>}
      <QuantitativeComparisonCharts result={result} />
    </section>}
    {!datasets.length && <section className="empty-card"><span className="comparison-icon"><ResultsIcon name="comparison" /></span><div><h2>No CSV exports linked yet</h2><p>{projectId ? 'Import original exports into this workspace to begin a comparison.' : 'Choose a report above and import the original exports to begin a comparison.'}</p></div></section>}
  </div>;
}
