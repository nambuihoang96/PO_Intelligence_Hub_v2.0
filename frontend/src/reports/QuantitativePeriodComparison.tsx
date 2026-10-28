import { useEffect, useState } from 'react';
import { reportApi, type ComparisonDataset, type ComparisonMetric, type ComparisonPeriod, type ImportedReport, type ReportSummary, type QuantitativeComparisonInput, type QuantitativeComparisonPreview, type QuantitativeDataset } from './api';
import { QuantitativeDatasetImport } from './QuantitativeDatasetImport';
import { DatasetMetadataReview } from './DatasetMetadataReview';
import { ResultsIcon } from '../ui/ResultsIcon';
import { QuantitativeComparisonCharts } from './QuantitativeComparisonCharts';

const metricKey = (metric: ComparisonMetric) => metric.key;
const labelPeriod = (period: ComparisonPeriod) => period.semantics === 'snapshot'
  ? `Ảnh chụp số liệu · ${period.snapshot_date ?? period.snapshot_date_candidate ?? 'chưa có ngày'}`
  : period.semantics === 'unknown'
    ? `Cần xác nhận ý nghĩa ngày · ${period.snapshot_date ?? period.snapshot_date_candidate ?? ([period.period_start, period.period_end].filter(Boolean).join(' – ') || 'chưa có ngày')}`
    : `${period.period_start ?? '?'} – ${period.period_end ?? '?'} · ${period.semantics === 'rolling_interval' ? 'kỳ trượt' : 'khoảng báo cáo'}`;

const periodKindLabel = (semantics: string) => semantics === 'snapshot' ? 'Ảnh chụp số liệu' : semantics === 'rolling_interval' ? 'Kỳ trượt' : semantics === 'reporting_interval' ? 'Khoảng báo cáo' : 'Kỳ chưa xác định';

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
    setNotice(dataset.duplicate ? 'Đã nhận diện CSV trùng; đang làm mới danh sách tệp dữ liệu.' : 'CSV đã lưu. Bạn có thể chọn tệp trong phần so sánh.');
    setFailure(''); void loadCatalog(); if (dataset.duplicate) setReviewDataset(dataset);
  }

  return <div className="period-comparison-page">
    <section className="comparison-intro-panel">
      <span className="comparison-icon"><ResultsIcon name="comparison" /></span>
      <div><span className="state-label">SO SÁNH CÁC KỲ</span><h2>So sánh các tệp CSV</h2><p>Chọn hai lần xuất dữ liệu, đối chiếu bằng mã nguồn ổn định và xem mọi sản phẩm xuất hiện ở một hoặc cả hai kỳ.</p>{projectId && <a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}&view=data`}>← Về dự án</a>}</div>
    </section>

    <section className="comparison-import-panel" aria-labelledby="comparison-import-title">
      <div className="comparison-section-heading"><div><span className="state-label">THÊM TỆP NGUỒN</span><h2 id="comparison-import-title">Nhập tệp CSV</h2></div><span>{projectId ? 'CSV gốc sẽ được lưu riêng trong dự án cùng thông tin nguồn.' : 'CSV gốc sẽ gắn với báo cáo được chọn, được giữ nguyên và không bị gộp.'}</span></div>
      {projectId ? <QuantitativeDatasetImport key={projectId} projectId={projectId} onImported={onImported} /> : <>
        <label>Báo cáo để giữ provenance<select value={selectedReportId} onChange={(event) => setSelectedReportId(event.target.value)}><option value="">Chọn báo cáo…</option>{reports.map((report) => <option value={report.id} key={report.id}>{report.question}</option>)}</select></label>
        {importReport && <QuantitativeDatasetImport key={importReport.id} report={importReport} onImported={onImported} />}
        {!importReport && <p className="comparison-muted">Chọn báo cáo rồi thêm từng tệp CSV. Không cần ghép tệp bằng tay.</p>}
      </>}
    </section>

    <section className="comparison-config-panel" aria-labelledby="comparison-config-title">
      <div className="comparison-section-heading"><div><span className="state-label">THIẾT LẬP SO SÁNH</span><h2 id="comparison-config-title">Chọn tệp và phép đo</h2></div><button type="button" className="secondary-action" onClick={() => void loadCatalog()}>Làm mới danh sách tệp</button></div>
      <div className="comparison-dataset-information">{[baseline, current].filter((item): item is ComparisonDataset => Boolean(item)).map((dataset) => <article key={dataset.id}><strong>{dataset.filename}</strong><p>{dataset.geo_values.join(', ') || 'Chưa rõ thị trường'} / {dataset.platform_values.join(', ') || 'Chưa rõ nền tảng'} · {dataset.source_apps} sản phẩm · {dataset.metrics.filter((item) => item.usable_observations > 0).length} phép đo đủ thông tin</p><p>{dataset.periods.map(labelPeriod).join('; ')}</p><button type="button" className="secondary-action" onClick={() => setReviewDataset(dataset)}>Xem lại thông tin tệp</button><details><summary>Thông tin cần xem lại</summary>{dataset.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details></article>)}</div>
      <div className="comparison-select-grid">
        <label>Tệp kỳ trước<select value={baselineId} onChange={(event) => { setBaselineId(event.target.value); setResult(null); }}><option value="">Chọn tệp kỳ trước…</option>{datasets.map((dataset) => <option value={dataset.id} key={dataset.id}>{dataset.filename} · {dataset.report_question}</option>)}</select></label>
        <label>Tệp kỳ hiện tại<select value={currentId} onChange={(event) => { setCurrentId(event.target.value); setResult(null); }}><option value="">Chọn tệp kỳ hiện tại…</option>{datasets.map((dataset) => <option value={dataset.id} key={dataset.id} disabled={dataset.id === baselineId}>{dataset.filename} · {dataset.report_question}</option>)}</select></label>
        <label>Chỉ số<select value={selectedMetricKey} onChange={(event) => { setSelectedMetricKey(event.target.value); setResult(null); }} disabled={!sharedMetrics.length}><option value="">{sharedMetrics.length ? 'Chọn đúng định nghĩa chỉ số…' : 'Chưa có chỉ số trùng khớp chính xác'}</option>{sharedMetrics.map((item) => <option value={metricKey(item)} key={metricKey(item)}>{item.metric_definition} · {item.unit} · {item.methodology}</option>)}</select></label>
        <label>Thị trường<select value={geo} onChange={(event) => { setGeo(event.target.value); setResult(null); }} disabled={!compatibleGeos.length}><option value="">Chọn thị trường chung…</option>{compatibleGeos.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Nền tảng<select value={platform} onChange={(event) => { setPlatform(event.target.value); setResult(null); }} disabled={!compatiblePlatforms.length}><option value="">Chọn nền tảng chung…</option>{compatiblePlatforms.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Kỳ trong tệp trước<select value={baselinePeriodKey} onChange={(event) => { setBaselinePeriodKey(event.target.value); setBaselineMeaning(''); setResult(null); }} disabled={!baselinePeriods.length}><option value="">Chọn kỳ trước…</option>{baselinePeriods.map((period) => <option key={period.key} value={period.key}>{labelPeriod(period)}</option>)}</select></label>
        <label>Kỳ trong tệp hiện tại<select value={currentPeriodKey} onChange={(event) => { setCurrentPeriodKey(event.target.value); setCurrentMeaning(''); setResult(null); }} disabled={!currentPeriods.length}><option value="">Chọn kỳ hiện tại…</option>{currentPeriods.map((period) => <option key={period.key} value={period.key}>{labelPeriod(period)}</option>)}</select></label>
      </div>
      {(chosenBaselinePeriod?.semantics === 'unknown' || chosenCurrentPeriod?.semantics === 'unknown') && <div className="comparison-confirmations"><p>Có tệp chưa nêu rõ ý nghĩa của ngày. Hãy xác nhận trước khi so sánh.</p>{chosenBaselinePeriod?.semantics === 'unknown' && <label>Ý nghĩa ngày trong tệp trước<select value={baselineMeaning} onChange={(event) => { setBaselineMeaning(event.target.value); setResult(null); }}><option value="">Chọn…</option><option value="snapshot">Ngày chụp số liệu</option><option value="reporting_interval">Khoảng báo cáo</option><option value="rolling_interval">Khoảng thời gian trượt</option></select></label>}{chosenCurrentPeriod?.semantics === 'unknown' && <label>Ý nghĩa ngày trong tệp hiện tại<select value={currentMeaning} onChange={(event) => { setCurrentMeaning(event.target.value); setResult(null); }}><option value="">Chọn…</option><option value="snapshot">Ngày chụp số liệu</option><option value="reporting_interval">Khoảng báo cáo</option><option value="rolling_interval">Khoảng thời gian trượt</option></select></label>}</div>}
      {baseline && current && sameMetricMeaning && !sharedMetrics.some((item) => item.methodology?.trim()) && <p className="comparison-warning">Hai tệp có cùng chỉ số và đơn vị nhưng chưa ghi nhận phương pháp đo tương thích. Mở “Xem lại thông tin tệp” để bổ sung căn cứ phương pháp cho tệp đã lưu; không cần nhập lại.</p>}
      {baseline && current && sharedMetrics.length === 0 && <p className="comparison-warning">Hai tệp không có định nghĩa chỉ số, đơn vị và phương pháp đo trùng khớp chính xác. Nhãn gần giống nhau chưa đủ căn cứ để so sánh.</p>}
      <button type="button" className="primary-action" disabled={!canCompare || busy} onClick={() => void compare()}>{busy ? 'Đang đối chiếu các dòng nguồn…' : 'So sánh hai kỳ đã chọn'}</button>
    </section>

    {reviewDataset && <DatasetMetadataReview key={reviewDataset.id} reportId={reviewDataset.report_id ?? undefined} projectId={reviewDataset.project_id ?? undefined} datasetId={reviewDataset.id} onClose={() => setReviewDataset(null)} onSaved={() => { setResult(null); setSelectedMetricKey(''); setBaselinePeriodKey(''); setCurrentPeriodKey(''); void loadCatalog(); }} />}
    {failure && <div role="alert" className="research-alert">{failure}</div>}{notice && <div role="status" className="research-success">{notice}</div>}
    {result && <section className="comparison-results" aria-labelledby="comparison-results-title">
      <header className="comparison-results-heading"><div><span className="state-label">KẾT QUẢ CÓ THỂ TRUY VẾT</span><h2 id="comparison-results-title">So sánh {periodKindLabel(result.baseline_period.semantics).toLocaleLowerCase()} · {result.metric.metric_definition}</h2><p>{result.geo} · {result.platform} · {labelPeriod(result.baseline_period)} → {labelPeriod(result.current_period)}</p></div><span className={`comparison-readiness ${result.period_readiness.compatible ? 'ready' : 'blocked'}`}>{result.period_readiness.compatible ? 'Hai kỳ tương thích' : 'Chưa thể kết luận thay đổi'}</span></header>
      {!result.period_readiness.compatible && <p className="comparison-warning">{result.period_readiness.reasons.join(' ')}</p>}
      <QuantitativeComparisonCharts result={result} />
    </section>}
    {!datasets.length && <section className="empty-card"><span className="comparison-icon"><ResultsIcon name="comparison" /></span><div><h2>Chưa có tệp CSV</h2><p>{projectId ? 'Nhập tệp CSV gốc vào dự án để bắt đầu so sánh.' : 'Chọn một báo cáo ở trên rồi nhập các tệp CSV gốc để bắt đầu so sánh.'}</p></div></section>}
  </div>;
}
