import { useEffect, useMemo, useState } from 'react';
import { reportApi, type ComparisonFindingReview, type ImportedReport, type QuantitativeObservation, type ReportSummary } from './api';
import { ProjectJourneyNav, TrackingSectionNav } from '../research/ProjectJourneyNav';
import { researchApi, type OpportunityCandidate } from '../research/api';
import { opportunityDecisionHref } from '../research/decisionNavigation';
import { excerptAtLocations } from './ReportResults';
import { formatMetricChange, formatMetricValue } from './metricFormatting';

function findingKey(item: { key: string; title: string; description: string }): string {
  return `${item.key}\u0000${item.title.trim().toLocaleLowerCase()}\u0000${item.description.trim().toLocaleLowerCase()}`;
}

function periodLabel(report: ReportSummary): string {
  return report.research_period?.trim() || 'Kỳ nghiên cứu chưa ghi';
}

function measurementPeriodLabel(report?: ImportedReport): string | null {
  const periods = Array.from(new Set((report?.research_data.quantitative_observations ?? [])
    .filter((item) => item.period_start && item.period_end)
    .map((item) => `${item.period_start} – ${item.period_end}`))).sort();
  if (periods.length === 0) return null;
  return periods.length <= 2 ? periods.join(' · ') : `${periods.length} khoảng đo · ${periods[0]} … ${periods[periods.length - 1]}`;
}

function reportOptionLabel(report: ReportSummary, details?: ImportedReport): string {
  const question = report.question.trim();
  const shortQuestion = question.length > 64 ? `${question.slice(0, 61).trimEnd()}…` : question;
  const measuredPeriod = measurementPeriodLabel(details);
  if (measuredPeriod) return `Kỳ đo: ${measuredPeriod} · ${shortQuestion}`;
  const importedAt = new Date(report.imported_at);
  const importedLabel = Number.isNaN(importedAt.getTime()) ? 'ngày nhập chưa rõ' : importedAt.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  return `Kỳ: ${periodLabel(report)} · Nhập: ${importedLabel} · Báo cáo: ${report.id.slice(0, 6)} · ${shortQuestion}`;
}

type FindingItem = ImportedReport['research_data']['findings'][number];
type FindingChange = {
  kind: 'same-key' | 'changed-key' | 'ambiguous' | 'new' | 'different' | 'not-mentioned';
  title: string;
  before: FindingItem | null;
  after: FindingItem | null;
  rejectedMatch?: FindingItem;
};

async function listAllProjectReports(projectId: string): Promise<ReportSummary[]> {
  const first = await reportApi.listProject(projectId);
  const reports = [...first.items];
  let cursor = first.next_cursor ?? undefined;
  while (cursor) {
    const page = await reportApi.listProject(projectId, cursor);
    reports.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  }
  return reports;
}

function metricIdentity(row: QuantitativeObservation): string | null {
  if (!row.source_entity_id || !row.metric_id) return null;
  return JSON.stringify([row.source_entity_id.trim(), row.metric_id.trim().toLowerCase()]);
}

function observationIdentityKey(row: QuantitativeObservation): string {
  return JSON.stringify([row.source_entity_id, row.metric_id, row.metric_definition, row.unit, row.source_provider,
    row.geo, row.platform, row.granularity, row.methodology, row.period_semantics]);
}

function observationSelectionKey(row: QuantitativeObservation): string {
  return JSON.stringify([observationIdentityKey(row), row.period_start, row.period_end, String(row.value), row.source_reference, row.evidence_reference]);
}

function observationSources(row: QuantitativeObservation): string[] {
  return [row.source_reference, row.evidence_reference].filter((value): value is string => Boolean(value));
}

function overlap(a: QuantitativeObservation, b: QuantitativeObservation): boolean {
  return Boolean(a.period_start && a.period_end && b.period_start && b.period_end
    && a.period_start <= b.period_end && b.period_start <= a.period_end);
}

function periodLengthDays(row: QuantitativeObservation): number | null {
  if (!row.period_start || !row.period_end) return null;
  const start = Date.parse(`${row.period_start}T00:00:00Z`);
  const end = Date.parse(`${row.period_end}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 86_400_000) + 1 : null;
}

function sameMetadata(a: QuantitativeObservation, b: QuantitativeObservation): boolean {
  return Boolean(a.metric_definition && b.metric_definition && a.unit && b.unit && a.geo && b.geo && a.platform && b.platform
    && a.methodology && b.methodology && a.source_provider && b.source_provider && a.granularity && b.granularity
    && a.metric_definition.trim().toLocaleLowerCase() === b.metric_definition.trim().toLocaleLowerCase()
    && a.unit === b.unit && a.geo === b.geo && a.platform === b.platform && a.granularity === b.granularity
    && a.methodology.trim().toLocaleLowerCase() === b.methodology.trim().toLocaleLowerCase()
    && a.source_provider.trim().toLocaleLowerCase() === b.source_provider.trim().toLocaleLowerCase()
    && a.period_semantics === b.period_semantics && a.period_semantics === 'reporting_interval');
}

export function ReportUpdateComparison({ projectId }: { projectId: string }) {
  const [summaries, setSummaries] = useState<ReportSummary[]>([]);
  const [oldId, setOldId] = useState('');
  const [newId, setNewId] = useState('');
  const [oldReport, setOldReport] = useState<ImportedReport | null>(null);
  const [newReport, setNewReport] = useState<ImportedReport | null>(null);
  const [trackedCandidates, setTrackedCandidates] = useState<OpportunityCandidate[]>([]);
  const [showManualTargetPicker, setShowManualTargetPicker] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [trackedReviewSaving, setTrackedReviewSaving] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const params = new URLSearchParams(window.location.search);
  const newlySavedReport = params.get('newReportSaved') === '1';
  const duplicateSavedReport = params.get('duplicate') === '1';

  useEffect(() => {
    let active = true;
    setLoading(true);
    listAllProjectReports(projectId).then((items) => {
      if (!active) return;
      setSummaries(items);
      const query = new URLSearchParams(window.location.search);
      const beforeParam = query.get('before');
      const afterParam = query.get('after');
      const currentId = afterParam ?? query.get('reportId');
      const newest = currentId && items.some((item) => item.id === currentId) ? currentId : items[0]?.id ?? '';
      setNewId(newest);
      const newestReport = items.find((item) => item.id === newest);
      const normalizeQuestion = (value: string | undefined) => value?.trim().toLocaleLowerCase();
      const previous = items.find((item) => item.id !== newest && normalizeQuestion(item.question) === normalizeQuestion(newestReport?.question));
      const explicitPrevious = beforeParam && items.some((item) => item.id === beforeParam && item.id !== newest) ? beforeParam : '';
      setOldId(explicitPrevious || previous?.id || items.find((item) => item.id !== newest)?.id || '');
      setError('');
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Không tải được các báo cáo của dự án.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    researchApi.getOpportunities(projectId).then((workspace) => {
      if (active) setTrackedCandidates(workspace.candidates.filter((item) => item.decision !== null));
    }).catch(() => { if (active) setTrackedCandidates([]); });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setOldReport(null); setNewReport(null);
    if (!oldId || !newId || oldId === newId) return;
    Promise.all([reportApi.get(oldId), reportApi.get(newId)]).then(([before, after]) => {
      if (active) { setOldReport(before); setNewReport(after); setError(''); }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Không mở được báo cáo để đối chiếu.'));
    return () => { active = false; };
  }, [oldId, newId]);

  const findingChanges = useMemo<FindingChange[]>(() => {
    if (!oldReport || !newReport) return [];
    const oldFindings = oldReport.research_data.findings;
    const newFindings = newReport.research_data.findings;
    return [
      ...newFindings.map<FindingChange>((current) => {
        const exact = oldFindings.find((previous) => previous.key === current.key);
        const savedReview = exact && (newReport.comparison_reviews ?? []).find((review) =>
          review.before_report_id === oldReport.id && review.before_item_key === exact.key && review.after_item_key === current.key);
        if (exact && savedReview?.decision === 'different') {
          return { kind: 'different', title: current.title, before: null, after: current, rejectedMatch: exact };
        }
        if (exact) return { kind: findingKey(exact) === findingKey(current) ? 'same-key' : 'changed-key', title: current.title, before: exact, after: current };
        const possible = oldFindings.find((previous) => previous.title.trim().toLocaleLowerCase() === current.title.trim().toLocaleLowerCase());
        return possible ? { kind: 'ambiguous', title: current.title, before: possible, after: current }
          : { kind: 'new', title: current.title, before: null, after: current };
      }),
      ...oldFindings.filter((previous) => !newFindings.some((current) => current.key === previous.key
          && !(newReport.comparison_reviews ?? []).some((review) => review.before_report_id === oldReport.id
            && review.before_item_key === previous.key && review.after_item_key === current.key && review.decision === 'different')))
        .filter((previous) => !newFindings.some((current) => current.title.trim().toLocaleLowerCase() === previous.title.trim().toLocaleLowerCase()
          && !(newReport.comparison_reviews ?? []).some((review) => review.before_report_id === oldReport.id
            && review.before_item_key === previous.key && review.after_item_key === current.key && review.decision === 'different')))
        .map<FindingChange>((previous) => ({ kind: 'not-mentioned', title: previous.title, before: previous, after: null })),
    ];
  }, [oldReport, newReport]);

  const findingReview = (item: FindingChange) => item.before && item.after
    ? (newReport?.comparison_reviews ?? []).find((review) => review.review_type !== 'tracked_observation'
      && review.before_report_id === oldId && review.before_item_key === item.before!.key && review.after_item_key === item.after!.key)
    : undefined;
  const findingNeedsReview = (item: FindingChange) => ['same-key', 'changed-key', 'ambiguous'].includes(item.kind) && !findingReview(item);

  const metricRows = useMemo(() => {
    if (!oldReport || !newReport) return [];
    const oldRows = (oldReport.research_data.quantitative_observations ?? []).filter((row) => row.observation_type === 'reported');
    const newRows = (newReport.research_data.quantitative_observations ?? []).filter((row) => row.observation_type === 'reported');
    const chronologyValid = Date.parse(oldReport.imported_at) < Date.parse(newReport.imported_at);
    const reportScopeMatches = oldReport.question.trim().toLocaleLowerCase() === newReport.question.trim().toLocaleLowerCase()
      && oldReport.geo === newReport.geo && oldReport.os === newReport.os;
    return newRows.map((current) => {
      const key = metricIdentity(current);
      const identityMatches = key ? oldRows.filter((row) => metricIdentity(row) === key) : [];
      const currentStart = current.period_start ? Date.parse(`${current.period_start}T00:00:00Z`) : NaN;
      const prior = identityMatches.filter((row) => {
        const end = row.period_end ? Date.parse(`${row.period_end}T00:00:00Z`) : NaN;
        return Number.isFinite(end) && Number.isFinite(currentStart) && end < currentStart;
      }).sort((a, b) => (b.period_end ?? '').localeCompare(a.period_end ?? '') || (b.period_start ?? '').localeCompare(a.period_start ?? ''));
      const latestEnd = prior[0]?.period_end;
      const latestCandidates = latestEnd ? prior.filter((row) => row.period_end === latestEnd) : [];
      const before = latestCandidates.length === 1 ? latestCandidates[0] : identityMatches.length === 1 ? identityMatches[0] : undefined;
      const nameCandidates = !key ? oldRows.filter((row) => row.entity_name?.trim().toLocaleLowerCase() === current.entity_name?.trim().toLocaleLowerCase()
        && row.metric_definition?.trim().toLocaleLowerCase() === current.metric_definition?.trim().toLocaleLowerCase()) : [];
      const duplicateCurrent = Boolean(key && newRows.filter((row) => metricIdentity(row) === key && row.period_start === current.period_start && row.period_end === current.period_end).length > 1);
      const validPeriods = Boolean(periodLengthDays(current) && current.period_start && current.period_end && !Number.isNaN(Date.parse(current.period_start)) && !Number.isNaN(Date.parse(current.period_end)));
      const compatible = before && chronologyValid && reportScopeMatches && !duplicateCurrent && latestCandidates.length === 1
        && validPeriods && !overlap(before, current) && periodLengthDays(before) === periodLengthDays(current)
        && sameMetadata(before, current)
        && before.verification_status === current.verification_status
        && before.value_precision === 'exact' && current.value_precision === 'exact'
        && before.comparison_ready === true && current.comparison_ready === true
        && Boolean(before.source_reference || before.evidence_reference) && Boolean(current.source_reference || current.evidence_reference);
      const reasons = [
        !chronologyValid && 'Báo cáo mới phải được nhập sau báo cáo trước.',
        !reportScopeMatches && 'Câu hỏi nghiên cứu, thị trường hoặc nền tảng khác nhau.',
        !current.source_entity_id && 'Chưa có mã đối tượng ổn định từ nguồn.',
        !current.metric_id && 'Chưa có mã chỉ số ổn định.',
        before && !sameMetadata(before, current) && 'Định nghĩa chỉ số, đơn vị, thị trường, nền tảng, cách chia dữ liệu, nhà cung cấp, phương pháp hoặc ý nghĩa kỳ đo khác nhau.',
        before && periodLengthDays(before) !== periodLengthDays(current) && 'Hai kỳ đo không có cùng độ dài.',
        before && overlap(before, current) && 'Hai kỳ đo bị chồng lấp.',
        !validPeriods && 'Ngày bắt đầu hoặc kết thúc kỳ đo bị thiếu hoặc không hợp lệ.',
        before && (before.value_precision !== 'exact' || current.value_precision !== 'exact') && 'Có giá trị chỉ là ước tính.',
        before && (before.comparison_ready !== true || current.comparison_ready !== true) && 'Ít nhất một số liệu chưa đủ điều kiện so sánh.',
        before && before.verification_status !== current.verification_status && 'Trạng thái xác minh của hai số liệu khác nhau.',
        before && !(before.source_reference || before.evidence_reference) && 'Số liệu kỳ trước chưa có nguồn.',
        !(current.source_reference || current.evidence_reference) && 'Số liệu kỳ mới chưa có nguồn.',
        latestCandidates.length > 1 && 'Có nhiều số liệu kỳ trước cùng kỳ đo gần nhất.',
        duplicateCurrent && 'Báo cáo mới có số liệu trùng đối tượng, chỉ số và kỳ đo.',
      ].filter((item): item is string => Boolean(item));
      return { current, before, compatible: Boolean(compatible), ambiguous: Boolean(!key && nameCandidates.length), sameNameCount: nameCandidates.length, reasons };
    });
  }, [oldReport, newReport]);

  const oldSummary = summaries.find((item) => item.id === oldId);
  const newSummary = summaries.find((item) => item.id === newId);
  const researchAgainReport = newSummary ?? [...summaries].sort((a, b) => b.imported_at.localeCompare(a.imported_at))[0];
  const linkedTracking = trackedCandidates.filter((item) => {
    const target = item.decision_target ?? item.decision?.decision_target;
    return target?.kind === 'report_finding' && (target.report_id === oldId || target.report_id === newId);
  });
  const trackedSignals = linkedTracking.map((candidate) => {
    const target = candidate.decision_target ?? candidate.decision?.decision_target;
    const targetIsBefore = target?.report_id === oldId;
    const targetIsAfter = target?.report_id === newId;
    const targetItemKey = target?.item_key;
    const selectedReference = candidate.decision?.tracked_observation_reference;
    const matchedFindingReview = (newReport?.comparison_reviews ?? []).find((review) => review.review_type !== 'tracked_observation'
      && review.decision === 'same' && (targetIsBefore ? review.before_item_key === targetItemKey : targetIsAfter && review.after_item_key === targetItemKey));
    const beforeKey = targetIsBefore ? targetItemKey : matchedFindingReview?.before_item_key;
    const afterKey = targetIsAfter ? targetItemKey : matchedFindingReview?.after_item_key;
    const beforeFinding = oldReport?.research_data.findings.find((item) => item.key === beforeKey);
    const afterFinding = newReport?.research_data.findings.find((item) => item.key === afterKey);
    const pairConfirmed = Boolean(matchedFindingReview && beforeFinding && afterFinding);
    const rows = pairConfirmed && selectedReference?.report_id === oldId ? metricRows.filter(({ current, before }) => {
      const currentLinked = observationSources(current).some((url) => afterFinding!.evidence_references.includes(url));
      const beforeLinked = before && observationSources(before).some((url) => beforeFinding!.evidence_references.includes(url));
      return currentLinked && Boolean(beforeLinked) && observationSelectionKey(before!) === selectedReference.observation_key
        && observationIdentityKey(before!) === selectedReference.metric_identity_key
        && before!.period_start === selectedReference.period_start && before!.period_end === selectedReference.period_end
        && before!.source_reference === selectedReference.source_reference && before!.evidence_reference === selectedReference.evidence_reference;
    }) : [];
    return { candidate, beforeKey, afterKey, beforeFinding, afterFinding, pairConfirmed, selectedReference, rows,
      currentLinkedRows: pairConfirmed ? metricRows.filter(({ current }) => observationSources(current).some((url) => afterFinding!.evidence_references.includes(url))) : [] };
  });
  const sourceLink = (report: ImportedReport, urls: string[]) => {
    const source = report.research_data.evidence_references.find((item) => urls.includes(item.url));
    const directUrl = urls.find((url) => /^https?:\/\//i.test(url));
    const sourceUrl = source?.url ?? directUrl;
    return sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{source?.title || 'Mở nguồn do báo cáo cung cấp'}</a>
      : <small>Chưa có nguồn gắn trực tiếp · cần kiểm tra báo cáo gốc</small>;
  };
  const findingReportLink = (report: ImportedReport, itemKey: string) =>
    <a href={`/reports/${encodeURIComponent(report.id)}?section=insights&finding=${encodeURIComponent(itemKey)}`}>Mở phát hiện trong báo cáo gốc →</a>;
  const findingExcerpt = (report: ImportedReport, item: FindingItem) => {
    const locations = [...(item.source_locations ?? []), ...(item.evidence_references ?? []).flatMap((url) =>
      report.research_data.evidence_references.filter((source) => source.url === url && source.source_location).map((source) => source.source_location!))];
    const excerpt = excerptAtLocations(report.content, locations);
    return excerpt.length ? <details><summary>Đoạn trích trong báo cáo · {excerpt.length}</summary>{excerpt.map((line) => <pre key={line}>{line}</pre>)}</details>
      : <small>Không có vị trí trích đoạn rõ trong báo cáo; phần mô tả bên trên là nội dung do báo cáo cung cấp.</small>;
  };

  async function saveFindingReview(beforeItemKey: string, afterItemKey: string, decision: 'same' | 'different') {
    if (!newReport || reviewSaving) return;
    const current = newReport.comparison_reviews ?? [];
    if (current.some((item) => item.review_type !== 'tracked_observation' && item.before_report_id === oldId
      && item.before_item_key === beforeItemKey && item.after_item_key === afterItemKey)) return;
    const reviews: ComparisonFindingReview[] = [...current,
      { before_report_id: oldId, before_item_key: beforeItemKey, after_item_key: afterItemKey, decision, saved_at: new Date().toISOString() }];
    setReviewSaving(true);
    try { setNewReport(await reportApi.updateComparisonReviews(newId, reviews)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được xác nhận của PO.'); }
    finally { setReviewSaving(false); }
  }

  async function markTrackedObservationReviewed(candidateId: string, beforeItemKey: string, afterItemKey: string, row: QuantitativeObservation, selectedObservationKey: string) {
    if (!newReport || trackedReviewSaving) return;
    const observationKey = selectedObservationKey || observationSelectionKey(row);
    const reviewKey = `${candidateId}:${observationKey}`;
    const current = newReport.comparison_reviews ?? [];
    if (current.some((item) => item.review_type === 'tracked_observation' && item.candidate_id === candidateId
      && item.before_report_id === oldId && item.before_item_key === beforeItemKey
      && item.after_item_key === afterItemKey && item.observation_key === observationKey)) return;
    const reviews: ComparisonFindingReview[] = [...current, { review_type: 'tracked_observation', candidate_id: candidateId, observation_key: observationKey,
      before_report_id: oldId, before_item_key: beforeItemKey, after_item_key: afterItemKey,
      decision: 'reviewed', saved_at: new Date().toISOString() }];
    setTrackedReviewSaving(reviewKey);
    try { setNewReport(await reportApi.updateComparisonReviews(newId, reviews)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được xác nhận đã xem số liệu.'); }
    finally { setTrackedReviewSaving(''); }
  }

  const proposedFindings = findingChanges.filter(findingNeedsReview).length;
  const newMentions = findingChanges.filter((item) => item.kind === 'new').length;
  const notMentioned = findingChanges.filter((item) => item.kind === 'not-mentioned').length;
  const highlightedIndex = findingChanges.findIndex(findingNeedsReview);
  const highlightedFinding = highlightedIndex >= 0 ? findingChanges[highlightedIndex] : null;

  return <div className="tracking-workspace report-update-comparison">
    <ProjectJourneyNav projectId={projectId} active="tracking" />
    <TrackingSectionNav projectId={projectId} active="updates" />
    <section className="research-panel">
      <div className="panel-heading"><div><span className="state-label">CẬP NHẬT TỪ BÁO CÁO</span><h2>Đối chiếu hai báo cáo</h2></div><a className="text-button" href={`/tracking?projectId=${encodeURIComponent(projectId)}`}>← Về Theo dõi</a></div>
      {newlySavedReport && <div className="research-success" role="status">{duplicateSavedReport ? 'Báo cáo kỳ mới đã được lưu trước đó; đang mở đúng cặp báo cáo để đối chiếu.' : 'Đã lưu báo cáo kỳ mới; đang mở đúng cặp báo cáo để đối chiếu.'}</div>}
      <div className="report-update-actions">
        {researchAgainReport ? <a className="primary-action" href={`/?projectId=${encodeURIComponent(projectId)}&question=${encodeURIComponent(researchAgainReport.question)}&geo=${encodeURIComponent(researchAgainReport.geo)}&environment=${encodeURIComponent(researchAgainReport.os)}&fromReportId=${encodeURIComponent(researchAgainReport.id)}&action=research-again`}>Nghiên cứu lại cùng câu hỏi</a> : <a className="primary-action" href={`/?projectId=${encodeURIComponent(projectId)}`}>Tạo báo cáo đầu tiên</a>}
        <button type="button" className="secondary-action" disabled={trackedCandidates.length === 0} aria-expanded={showManualTargetPicker}
          onClick={() => setShowManualTargetPicker((visible) => !visible)}>Ghi nhận thủ công</button>
      </div>
      {showManualTargetPicker && <div className="report-update-target-picker" aria-label="Chọn mục đang theo dõi để ghi nhận thay đổi">
        <strong>Chọn đúng mục anh muốn cập nhật</strong>
        <p>Ghi chú sẽ được lưu vào lịch sử của mục đó, do PO nhập và chưa tự xác minh. Quyết định PO không bị đổi.</p>
        {trackedCandidates.length ? <ul>{trackedCandidates.map((candidate) => <li key={candidate.candidate_id}>
          <span>{candidate.name}</span>
          <a className="text-button" href={`/tracking?projectId=${encodeURIComponent(projectId)}&manualUpdateCandidate=${encodeURIComponent(candidate.candidate_id)}`}>Ghi nhận mục này →</a>
        </li>)}</ul> : <small>Chưa có mục theo dõi nào. Lưu một phát hiện hoặc quyết định trước, rồi quay lại đây.</small>}
      </div>}
      {!trackedCandidates.length && <small className="report-update-action-hint">Muốn ghi nhận thay đổi thủ công, trước hết cần lưu đúng một mục vào Theo dõi.</small>}
      {oldReport && newReport && <div className="report-update-glance" role="status">
        <strong>{proposedFindings} đề xuất cần xem</strong>
        <span>{newMentions} mới được nhắc · {notMentioned} không nhắc lại · {metricRows.filter((item) => item.compatible).length} cặp số liệu đủ điều kiện</span>
        {highlightedFinding && <a href={`#finding-change-${highlightedIndex >= 0 ? highlightedIndex : 0}`}>Xem gợi ý đầu tiên: {highlightedFinding.title} →</a>}
      </div>}
      <details className="report-update-help"><summary>Cách đọc kết quả và giới hạn</summary>
        <p>Nội dung mới, giống nhau hoặc chưa được nhắc lại chỉ là dấu hiệu để PO kiểm tra; chúng không chứng minh sự kiện mới xảy ra hay đã biến mất.</p>
        <p>Mã phát hiện thuộc từng báo cáo. Mã trùng chỉ gợi ý một cặp để PO xác nhận, không chứng minh hai dòng nói về cùng sự việc.</p>
      </details>
      <section className="report-update-scope report-update-followed" aria-label="Quyết định đã lưu có liên quan">
        <strong>Mục theo dõi đã lưu · {linkedTracking.length}</strong>
        <small>Chỉ gồm quyết định gắn trực tiếp với phát hiện trong hai báo cáo. Chênh lệch số liệu chỉ xuất hiện tại đây khi hai nguồn cùng trỏ đến phát hiện đã được PO xác nhận; không đổi quyết định PO.</small>
        {linkedTracking.length > 0 && <ul>{trackedSignals.map(({ candidate, beforeKey, afterKey, pairConfirmed, selectedReference, rows, currentLinkedRows }) => <li key={candidate.candidate_id}>
          <a href={opportunityDecisionHref(projectId, candidate)}>{candidate.name} · {candidate.decision?.decision_status ?? 'Chưa đặt trạng thái'} → Mở quyết định</a>
          {!selectedReference ? <p>Chưa chọn số liệu để theo dõi trong quyết định PO này.</p>
            : selectedReference.report_id !== oldId ? <p>Quyết định đang theo dõi một số liệu ở báo cáo khác. Chọn đúng báo cáo kỳ trước để xem cặp này.</p>
            : !pairConfirmed ? <p>Chưa có xác nhận của PO rằng phát hiện ở hai báo cáo là cùng một phát hiện; chưa gắn số liệu mới vào quyết định này.</p>
            : rows.length > 0 ? <ul>{rows.map(({ current, before, compatible, reasons }) => {
              const observationKey = selectedReference!.observation_key;
              const acknowledged = (newReport?.comparison_reviews ?? []).some((review) => review.review_type === 'tracked_observation'
                && review.candidate_id === candidate.candidate_id && review.before_report_id === oldId
                && review.before_item_key === beforeKey && review.after_item_key === afterKey && review.observation_key === observationKey);
              const savingKey = `${candidate.candidate_id}:${observationKey}`;
              return <li key={savingKey}>
                {compatible && before ? <><strong>Số liệu gắn với phát hiện đã lưu: {formatMetricValue(before.value, before.unit)} → {formatMetricValue(current.value, current.unit)}</strong>
                  <p>Thay đổi trong hai báo cáo; chỉ là số liệu được báo cáo, chưa xác minh độc lập. Quyết định PO vẫn giữ nguyên.</p>
                  <p>{sourceLink(oldReport!, observationSources(before))} · {sourceLink(newReport!, observationSources(current))}</p>
                  {acknowledged ? <small>PO đã xác nhận đã xem cặp số liệu này.</small>
                    : <button type="button" className="text-button" disabled={Boolean(trackedReviewSaving)} onClick={() => void markTrackedObservationReviewed(candidate.candidate_id, beforeKey!, afterKey!, current, observationKey)}>{trackedReviewSaving === savingKey ? 'Đang lưu…' : 'Xác nhận đã xem số liệu'}</button>}
                </> : <><strong>Chưa đủ điều kiện để đưa số liệu vào mục theo dõi.</strong><p>{reasons.length ? reasons.join(' ') : 'Cần đủ nguồn được gắn với cả hai phát hiện và một cặp số liệu tương thích.'}</p>{before && <p>{sourceLink(oldReport!, observationSources(before))} · {sourceLink(newReport!, observationSources(current))}</p>}</>}
              </li>;
            })}</ul> : currentLinkedRows.length > 0 ? <p>Số liệu báo cáo mới có nguồn gắn với phát hiện, nhưng chưa tìm được cặp kỳ trước đủ điều kiện. Lý do: {currentLinkedRows.flatMap((row) => row.reasons).filter((reason, index, all) => all.indexOf(reason) === index).join(' ') || 'chưa có số liệu kỳ trước tương thích'}.</p>
              : <p>Chưa có số liệu định lượng được liên kết bằng nguồn với phát hiện này ở cả hai báo cáo; không gắn số liệu nào vào quyết định.</p>}
        </li>)}</ul>}
      </section>
      {error && <div className="research-alert" role="alert">{error}</div>}
      {loading ? <p role="status">Đang tải báo cáo…</p> : summaries.length === 0 ? <div className="report-update-empty"><strong>Chưa có báo cáo để đối chiếu</strong><p>Nhập báo cáo đầu tiên vào dự án. Khi có báo cáo kỳ tiếp theo, PO Hub sẽ đối chiếu hai bản đã lưu tại đây.</p></div>
        : summaries.length === 1 ? <div className="report-update-empty"><strong>Đã có báo cáo kỳ cũ, chưa có báo cáo kỳ mới</strong><p>Chọn “Nghiên cứu lại cùng câu hỏi”, chọn kỳ mới, rồi nhập báo cáo mới vào chính dự án này. Khi lưu đủ hai báo cáo, kết quả đối chiếu sẽ hiện tại đây. PO Hub không tự tìm thông tin trên Internet.</p></div>
          : <div className="report-update-pickers">
        <label>Báo cáo trước<select value={oldId} onChange={(event) => setOldId(event.target.value)}>{summaries.filter((item) => item.id !== newId).map((item) => <option key={item.id} value={item.id}>{reportOptionLabel(item, item.id === oldId ? oldReport ?? undefined : undefined)}</option>)}</select></label>
        <label>Báo cáo mới<select value={newId} onChange={(event) => setNewId(event.target.value)}>{summaries.filter((item) => item.id !== oldId).map((item) => <option key={item.id} value={item.id}>{reportOptionLabel(item, item.id === newId ? newReport ?? undefined : undefined)}</option>)}</select></label>
      </div>}
      {oldReport && newReport && oldSummary && newSummary && <>
        <div className="report-update-scope"><strong>{oldSummary.question === newSummary.question ? 'Cùng câu hỏi nghiên cứu' : 'Khác câu hỏi · cần xác nhận phạm vi'}</strong><p>{oldSummary.question} → {newSummary.question}</p><small>{periodLabel(oldSummary)} → {periodLabel(newSummary)} · {oldSummary.geo}/{oldSummary.os} → {newSummary.geo}/{newSummary.os}</small>{(measurementPeriodLabel(oldReport) || measurementPeriodLabel(newReport)) && <p><strong>Kỳ đo trong số liệu:</strong> {measurementPeriodLabel(oldReport) || 'Chưa có'} → {measurementPeriodLabel(newReport) || 'Chưa có'}</p>}{(oldSummary.geo !== newSummary.geo || oldSummary.os !== newSummary.os) && <p role="status">Thị trường hoặc nền tảng khác nhau; không gộp các kết quả như cùng phạm vi.</p>}</div>
        <h3>Khám phá nội dung của hai báo cáo</h3>
        {findingChanges.length ? <div className="report-update-list">{findingChanges.map((item, index) => {
          const reviewBefore = item.before ?? item.rejectedMatch ?? null;
          return <article id={`finding-change-${index}`} key={`${item.kind}:${item.title}:${index}`}>
          <strong>{item.kind === 'same-key' ? findingReview(item)?.decision === 'same' ? 'PO xác nhận cùng phát hiện · vẫn được nêu' : 'Vẫn được nêu · cùng mã trong hai báo cáo · PO cần xác nhận' : item.kind === 'changed-key' ? findingReview(item)?.decision === 'same' ? 'PO xác nhận cùng phát hiện · nội dung có thay đổi' : 'Đề xuất thay đổi · cùng mã, nội dung khác · PO cần xác nhận' : item.kind === 'ambiguous' ? findingReview(item)?.decision === 'same' ? 'PO xác nhận hai mã thuộc cùng phát hiện' : 'Đề xuất đối chiếu · tiêu đề có thể liên quan · cần xác nhận' : item.kind === 'different' ? 'PO xác nhận đây là một phát hiện khác' : item.kind === 'new' ? 'Được nêu trong báo cáo mới' : 'Không thấy cùng mã trong báo cáo mới'}</strong>
          <h4>{item.title}</h4>
          {item.kind === 'new' && <small>Không suy ra đây là sự kiện mới; chỉ xác nhận báo cáo mới có nhắc tới.</small>}
          {item.kind === 'not-mentioned' && <small>Không thấy trong báo cáo mới không có nghĩa là đã biến mất.</small>}
          {item.kind === 'ambiguous' && <small>Mã phát hiện khác nhau dù tiêu đề gần giống; PO cần tự xác nhận cặp này.</small>}
          {(item.kind === 'ambiguous' || item.kind === 'same-key' || item.kind === 'changed-key' || item.kind === 'different') && reviewBefore && item.after && <p><label>PO xác nhận cặp này<select aria-label={`Xác nhận cặp ${item.title}`} value={(newReport.comparison_reviews ?? []).find((review) => review.before_report_id === oldId && review.before_item_key === reviewBefore.key && review.after_item_key === item.after!.key)?.decision ?? ''} disabled={reviewSaving} onChange={(event) => { if (event.target.value === 'same' || event.target.value === 'different') void saveFindingReview(reviewBefore.key, item.after!.key, event.target.value); }}><option value="">Chưa xác nhận</option><option value="same">Cùng một phát hiện</option><option value="different">Hai phát hiện khác nhau</option></select></label>{(newReport.comparison_reviews ?? []).some((review) => review.before_report_id === oldId && review.before_item_key === reviewBefore.key && review.after_item_key === item.after!.key) && <small>Đã lưu trên báo cáo mới.</small>}</p>}
          {item.kind === 'different' && item.rejectedMatch && <p>Phát hiện trước được tách riêng bên dưới là “không thấy nhắc lại”; phát hiện mới không được ghép chung với nó. {findingReportLink(oldReport, item.rejectedMatch.key)}</p>}
          <div className="report-update-sides">{item.before && <div><span>Báo cáo trước</span><p>{item.before.description || item.before.title}</p>{findingExcerpt(oldReport, item.before)}{findingReportLink(oldReport, item.before.key)}<br />{sourceLink(oldReport, item.before.evidence_references)}</div>}{item.after && <div><span>Báo cáo mới</span><p>{item.after.description || item.after.title}</p>{findingExcerpt(newReport, item.after)}{findingReportLink(newReport, item.after.key)}<br />{sourceLink(newReport, item.after.evidence_references)}</div>}</div>
        </article>;
        })}</div> : <p>Báo cáo chưa có phát hiện có cấu trúc để đối chiếu. Có thể đọc bản gốc của từng báo cáo.</p>}
        <h3>Số liệu do báo cáo cung cấp</h3>
        {metricRows.length ? <div className="report-update-list">{metricRows.map(({ current, before, compatible, ambiguous, sameNameCount }, index) => <article key={`${current.metric_id}:${current.entity_id}:${index}`}>
          <h4>{current.entity_name || current.entity_id || 'Chưa xác định đối tượng'} · {current.metric_definition || current.metric_id || 'Chưa xác định chỉ số'}</h4>
              {compatible && before ? <><strong>Đủ điều kiện so sánh · cùng định nghĩa, phạm vi và độ dài kỳ</strong><p>{formatMetricValue(before.value, before.unit)} → {formatMetricValue(current.value, current.unit)}</p><small>{formatMetricChange(before.value!, current.value!, current.unit)}.</small><small>Kỳ {before.period_start} – {before.period_end} → {current.period_start} – {current.period_end}. Không tự cập nhật quyết định PO.</small>{sourceLink(oldReport, [before.source_reference ?? '', before.evidence_reference ?? ''])} {sourceLink(newReport, [current.source_reference ?? '', current.evidence_reference ?? ''])}</>
            : <><strong>{ambiguous ? 'Đối tượng có tên giống nhau nhưng chưa xác nhận định danh' : before ? 'Chưa đủ điều kiện để tính chênh lệch' : 'Chưa tìm được phép đo trùng khớp chính xác'}</strong><p>{current.value ?? 'Chưa có giá trị'} {current.unit ?? ''} · {current.geo || 'Chưa có GEO'} · {current.platform || 'Chưa có nền tảng'} · {current.period_start || 'Chưa có kỳ'} – {current.period_end || 'chưa có kỳ'}</p><small>{ambiguous ? `${sameNameCount} ứng viên cùng tên; không tự ghép.` : 'Cần cùng mã đối tượng nguồn, chỉ số, nhà cung cấp, đơn vị, phương pháp, thị trường, nền tảng, nguồn và hai kỳ không chồng lấp có cùng độ dài.'}</small>{metricRows[index].reasons.length > 0 && <ul>{metricRows[index].reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}{sourceLink(newReport, [current.source_reference ?? '', current.evidence_reference ?? ''])}</>}
        </article>)}</div> : <p>Không có số liệu định lượng trong báo cáo để đối chiếu. Không tạo kết quả từ văn bản định tính.</p>}
      </>}
    </section>
  </div>;
}
