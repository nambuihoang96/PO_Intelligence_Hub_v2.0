import { useEffect, useRef, useState, type FormEvent } from 'react';
import { researchApi, type ManualTrackingUpdate, type OpportunityCandidate, type OpportunityDecision, type OpportunityWorkspace, type ResearchProject } from '../research/api';
import { ProjectJourneyNav, TrackingSectionNav } from '../research/ProjectJourneyNav';
import { opportunityDecisionHref } from '../research/decisionNavigation';
import { ReportUpdateComparison } from '../reports/ReportUpdateComparison';
import { reportApi, type ImportedReport, type QuantitativeObservation } from '../reports/api';
import { formatMetricChange, formatMetricValue } from '../reports/metricFormatting';
import './TrackingWorkflows.css';

const decisions: Record<string, string> = {
  investigate: 'Cần nghiên cứu thêm', benchmark: 'Đưa vào so sánh', experiment: 'Cần thử nghiệm',
  implementation_candidate: 'Đề xuất triển khai', hold: 'Tạm hoãn', reject: 'Không tiếp tục',
};
type TrackingFilter = 'open' | 'due' | 'done' | 'all';
type TrackingWorkflowStatus = 'not_started' | 'researching' | 'waiting_for_data' | 'evaluating' | 'completed' | 'paused';
const workflowLabels: Record<TrackingWorkflowStatus, string> = {
  not_started: 'Chưa bắt đầu', researching: 'Đang tìm hiểu', waiting_for_data: 'Chờ dữ liệu',
  evaluating: 'Đang đánh giá', completed: 'Đã xong việc', paused: 'Tạm dừng',
};

function localDate(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `update-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function metricIdentityKey(row: QuantitativeObservation): string {
  return JSON.stringify([row.source_entity_id, row.metric_id, row.metric_definition, row.unit, row.source_provider,
    row.geo, row.platform, row.granularity, row.methodology, row.period_semantics]);
}

function metricSelectionKey(row: QuantitativeObservation): string {
  return JSON.stringify([metricIdentityKey(row), row.period_start, row.period_end, String(row.value), row.source_reference, row.evidence_reference]);
}

function periodDays(row: QuantitativeObservation): number | null {
  if (!row.period_start || !row.period_end) return null;
  const start = Date.parse(`${row.period_start}T00:00:00Z`), end = Date.parse(`${row.period_end}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 86_400_000) + 1 : null;
}

function compatibleTrackedMetric(before: QuantitativeObservation, after: QuantitativeObservation): boolean {
  const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase());
  const oldDays = periodDays(before), newDays = periodDays(after);
  return Boolean(metricIdentityKey(before) === metricIdentityKey(after) && same(before.metric_definition, after.metric_definition)
    && before.value !== null && after.value !== null && before.value_precision === 'exact' && after.value_precision === 'exact'
    && before.unit === after.unit && before.geo === after.geo && before.platform === after.platform
    && same(before.methodology, after.methodology) && same(before.source_provider, after.source_provider)
    && before.period_semantics === 'reporting_interval' && after.period_semantics === 'reporting_interval'
    && before.entity_resolution_state === 'matched' && after.entity_resolution_state === 'matched'
    && before.verification_status === after.verification_status && before.comparison_ready === true && after.comparison_ready === true
    && oldDays !== null && oldDays === newDays && before.period_end! < after.period_start!
    && before.source_entity_id && before.metric_id && (before.source_reference || before.evidence_reference)
    && (after.source_reference || after.evidence_reference));
}

export function TrackingWorkspace({ projectId }: { projectId: string | null }) {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [workspace, setWorkspace] = useState<OpportunityWorkspace | null>(null);
  const [decisionReports, setDecisionReports] = useState<Record<string, ImportedReport>>({});
  const [trackingFollowUps, setTrackingFollowUps] = useState<Record<string, ImportedReport | null>>({});
  const [metricChoices, setMetricChoices] = useState<Record<string, string>>({});
  const [selectionSavingId, setSelectionSavingId] = useState('');
  const [acknowledgingId, setAcknowledgingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [workflowSavingId, setWorkflowSavingId] = useState('');
  const [trackingFilter, setTrackingFilter] = useState<TrackingFilter>('open');
  const [editingId, setEditingId] = useState('');
  const [observedOn, setObservedOn] = useState(localDate());
  const [content, setContent] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const pendingUpdateRef = useRef<{ candidateId: string; update: ManualTrackingUpdate } | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    const load = async () => {
      if (projectId) {
        const value = await researchApi.getProject(projectId);
        if (!current) return;
        setProject(value);
        const saved = await researchApi.getOpportunities(projectId);
        if (current) setWorkspace(saved);
      } else {
        const all: ResearchProject[] = [];
        let cursor: string | undefined;
        do {
          const page = await researchApi.listProjects(cursor);
          all.push(...page.items);
          cursor = page.next_cursor ?? undefined;
        } while (cursor);
        if (current) setProjects(all);
      }
    };
    load().catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : 'Không mở được trang theo dõi.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [projectId]);

  const decisionReportIds = Array.from(new Set((workspace?.candidates ?? []).map((item) =>
    item.decision_target?.report_id ?? item.decision?.decision_target?.report_id).filter((id): id is string => Boolean(id)))).sort();
  const decisionReportIdsKey = decisionReportIds.join('|');
  useEffect(() => {
    let active = true;
    if (!decisionReportIds.length) { setDecisionReports({}); return () => { active = false; }; }
    Promise.all(decisionReportIds.map(async (id) => [id, await reportApi.get(id)] as const))
      .then((pairs) => { if (active) setDecisionReports(Object.fromEntries(pairs)); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Không tải được số liệu của báo cáo đã lưu.'); });
    return () => { active = false; };
  }, [projectId, decisionReportIdsKey]);

  const selectedMetricContextKey = (workspace?.candidates ?? []).map((item) => {
    const reference = item.decision?.tracked_observation_reference;
    return reference ? `${item.candidate_id}:${reference.report_id}:${reference.observation_key}` : '';
  }).filter(Boolean).sort().join('|');
  useEffect(() => {
    let active = true;
    const candidates = (workspace?.candidates ?? []).filter((item) => item.decision?.tracked_observation_reference);
    if (!projectId || !candidates.length) { setTrackingFollowUps({}); return () => { active = false; }; }
    (async () => {
      const page = await reportApi.listProject(projectId);
      const followUps = await Promise.all(candidates.map(async (candidate) => {
        const reference = candidate.decision!.tracked_observation_reference!;
        const old = decisionReports[reference.report_id] ?? await reportApi.get(reference.report_id);
        const nextSummary = page.items.filter((item) => item.id !== old.id && Date.parse(item.imported_at) > Date.parse(old.imported_at)
          && item.question.trim().toLocaleLowerCase() === old.question.trim().toLocaleLowerCase()
          && item.geo === old.geo && item.os === old.os).sort((a, b) => b.imported_at.localeCompare(a.imported_at))[0];
        return [candidate.candidate_id, nextSummary ? await reportApi.get(nextSummary.id) : null] as const;
      }));
      if (active) setTrackingFollowUps(Object.fromEntries(followUps));
    })().catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Không tải được báo cáo mới để đối chiếu số liệu đã chọn.'); });
    return () => { active = false; };
  }, [projectId, selectedMetricContextKey, decisionReportIdsKey]);

  function openUpdate(candidate: OpportunityCandidate, correction?: ManualTrackingUpdate) {
    pendingUpdateRef.current = null;
    setEditingId(candidate.candidate_id);
    setObservedOn(correction?.observed_on ?? localDate());
    setContent(correction?.content ?? '');
    setSourceTitle(correction?.source_title ?? '');
    setSourceUrl(correction?.source_url ?? '');
    setSourceNote(correction?.source_note ?? '');
    setError('');
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const candidateId = params.get('manualUpdateCandidate');
    if (!candidateId || !workspace) return;
    const candidate = workspace.candidates.find((item) => item.candidate_id === candidateId && item.decision);
    params.delete('manualUpdateCandidate');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    if (!candidate) {
      setError('Mục theo dõi này không còn sẵn sàng để ghi nhận. Không có bản ghi nào được tạo.');
      return;
    }
    openUpdate(candidate);
  }, [workspace]);

  useEffect(() => {
    if (!editingId) return;
    document.getElementById(`tracking-item-${editingId}`)?.scrollIntoView?.({ block: 'center' });
  }, [editingId]);

  async function saveMetricSelection(candidate: OpportunityCandidate, report: ImportedReport, observation: QuantitativeObservation) {
    if (!projectId || !candidate.decision || selectionSavingId) return;
    setError(''); setSelectionSavingId(candidate.candidate_id);
    try {
      const next = await researchApi.selectTrackedObservation(projectId, candidate.candidate_id, {
        expected_revision: candidate.decision.revision ?? 0,
        report_id: report.id,
        report_content_sha256: report.content_sha256,
        observation_key: metricSelectionKey(observation),
      });
      setWorkspace(next);
      setMetricChoices((current) => ({ ...current, [candidate.candidate_id]: metricSelectionKey(observation) }));
    } catch (cause) {
      setError(cause instanceof Error ? `${cause.message} Quyết định hiện có vẫn được giữ nguyên.` : 'Không lưu được lựa chọn số liệu. Quyết định hiện có vẫn được giữ nguyên.');
    } finally { setSelectionSavingId(''); }
  }

  async function updateWorkflowStatus(candidate: OpportunityCandidate, workflowStatus: TrackingWorkflowStatus) {
    if (!projectId || !candidate.decision || workflowSavingId) return;
    const decision = candidate.decision;
    setWorkflowSavingId(candidate.candidate_id);
    setError('');
    try {
      const saved = await researchApi.saveOpportunityDecision(projectId, {
        candidate_id: decision.candidate_id,
        expected_revision: decision.revision ?? decision.expected_revision ?? 0,
        dataset_id: decision.dataset_id,
        dataset_content_sha256: decision.dataset_content_sha256,
        source_entity_id: decision.source_entity_id,
        decision_target: decision.decision_target ?? candidate.decision_target ?? null,
        workflow_status: workflowStatus,
        decision_status: decision.decision_status,
        rationale: decision.rationale,
        supporting_evidence: decision.supporting_evidence,
        contradictory_evidence: decision.contradictory_evidence,
        open_questions: decision.open_questions,
        assessments: decision.assessments,
        priority: decision.priority,
        review_date: decision.review_date,
        next_action: decision.next_action,
      });
      setWorkspace(saved);
    } catch (cause) {
      setError(cause instanceof Error ? `${cause.message} Trạng thái và quyết định cũ vẫn được giữ.` : 'Không cập nhật được tiến độ. Dữ liệu cũ vẫn được giữ.');
    } finally {
      setWorkflowSavingId('');
    }
  }

  async function acknowledgeTrackedMetric(candidate: OpportunityCandidate, latest: ImportedReport, beforeKey: string, afterKey: string) {
    if (acknowledgingId) return;
    const reference = candidate.decision?.tracked_observation_reference;
    if (!reference) return;
    const current = latest.comparison_reviews ?? [];
    const existing = current.some((item) => item.review_type === 'tracked_observation' && item.candidate_id === candidate.candidate_id
      && item.before_report_id === reference.report_id && item.before_item_key === beforeKey
      && item.after_item_key === afterKey && item.observation_key === reference.observation_key);
    if (existing) return;
    setAcknowledgingId(candidate.candidate_id); setError('');
    try {
      const saved = await reportApi.updateComparisonReviews(latest.id, [...current, {
        review_type: 'tracked_observation', before_report_id: reference.report_id, before_item_key: beforeKey,
        after_item_key: afterKey, decision: 'reviewed', candidate_id: candidate.candidate_id,
        observation_key: reference.observation_key, saved_at: new Date().toISOString(),
      }]);
      setTrackingFollowUps((items) => ({ ...items, [candidate.candidate_id]: saved }));
    } catch (cause) {
      setError(cause instanceof Error ? `${cause.message} Lịch sử hiện có vẫn được giữ nguyên.` : 'Không lưu được xác nhận đã xem.');
    } finally { setAcknowledgingId(''); }
  }

  async function saveManualUpdate(event: FormEvent<HTMLFormElement>, candidate: OpportunityCandidate) {
    event.preventDefault();
    if (!projectId || !candidate.decision || !content.trim() || savingId) return;
    setError('');
    setSavingId(candidate.candidate_id);
    const previous = candidate.decision.manual_updates ?? [];
    const priorCorrection = [...previous].reverse().find((item) => item.id === editingCorrectionId);
    let update = pendingUpdateRef.current?.candidateId === candidate.candidate_id ? pendingUpdateRef.current.update : null;
    if (!update) {
      update = {
        id: newId(), observed_on: observedOn, content: content.trim(),
        source_title: sourceTitle.trim() || null, source_url: sourceUrl.trim() || null,
        source_note: sourceNote.trim() || null, supersedes_id: priorCorrection?.id ?? null,
        recorded_at: new Date().toISOString(),
      };
      pendingUpdateRef.current = { candidateId: candidate.candidate_id, update };
    }
    try {
      let latestCandidate = candidate;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const decision = latestCandidate.decision;
        if (!decision) throw new Error('Mục theo dõi không còn quyết định để cập nhật. Nội dung vẫn còn trong biểu mẫu.');
        const currentUpdates = decision.manual_updates ?? [];
        if (currentUpdates.some((item) => item.id === update!.id)) {
          setWorkspace(await researchApi.getOpportunities(projectId));
          pendingUpdateRef.current = null;
          setEditingId(''); setEditingCorrectionId(''); setContent('');
          return;
        }
        try {
          const {
            revision: _revision,
            expected_revision: _expectedRevision,
            candidate_name: _candidateName,
            dataset_filename: _datasetFilename,
            selection_reason: _selectionReason,
            updated_at: _updatedAt,
            revision_history: _revisionHistory,
            ...decisionFields
          } = decision;
          const saved = await researchApi.saveOpportunityDecision(projectId, {
            ...decisionFields,
            expected_revision: decision.revision ?? 0,
            manual_updates: [...currentUpdates, update],
          } satisfies OpportunityDecision);
          setWorkspace(saved);
          pendingUpdateRef.current = null;
          setEditingId(''); setEditingCorrectionId(''); setContent('');
          return;
        } catch (saveError) {
          const refreshed = await researchApi.getOpportunities(projectId);
          setWorkspace(refreshed);
          const refreshedCandidate = refreshed.candidates.find((item) => item.candidate_id === candidate.candidate_id);
          if (refreshedCandidate?.decision?.manual_updates?.some((item) => item.id === update!.id)) {
            pendingUpdateRef.current = null;
            setEditingId(''); setEditingCorrectionId(''); setContent('');
            return;
          }
          if (attempt === 1 || !refreshedCandidate?.decision) throw saveError;
          latestCandidate = refreshedCandidate;
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? `${cause.message} Nội dung vẫn còn trong biểu mẫu.` : 'Không lưu được cập nhật. Nội dung vẫn còn trong biểu mẫu.');
    } finally {
      setSavingId('');
    }
  }

  const [editingCorrectionId, setEditingCorrectionId] = useState('');

  if (projectId) {
    if (new URLSearchParams(window.location.search).get('view') === 'report-updates') return <ReportUpdateComparison projectId={projectId} />;
    const saved = (workspace?.candidates ?? []).filter((item) => item.decision !== null);
    const today = localDate();
    const isOpen = (item: OpportunityCandidate) => !['completed', 'paused'].includes(item.decision?.workflow_status ?? 'not_started');
    const isDue = (item: OpportunityCandidate) => Boolean(item.decision?.review_date && item.decision.review_date <= today && isOpen(item));
    const openCount = saved.filter(isOpen).length;
    const dueCount = saved.filter(isDue).length;
    const doneCount = saved.filter((item) => item.decision?.workflow_status === 'completed').length;
    const visibleSaved = saved.filter((item) => trackingFilter === 'all' || (trackingFilter === 'open' && isOpen(item))
      || (trackingFilter === 'due' && isDue(item)) || (trackingFilter === 'done' && item.decision?.workflow_status === 'completed'));
    return <div className="tracking-workspace">
      <ProjectJourneyNav projectId={projectId} active="tracking" />
      <TrackingSectionNav projectId={projectId} active="tasks" />
      <section className="research-panel">
        <div className="panel-heading"><div><span className="state-label">THEO DÕI CỦA DỰ ÁN</span><h2>Việc cần làm từ nghiên cứu</h2><p>{project?.name ?? 'Dự án nghiên cứu'}</p></div></div>
        <p>Các mục anh đã chủ động lưu từ báo cáo hoặc dữ liệu. PO Hub không tự theo dõi Internet hay gửi nhắc việc.</p>
        {error && <div className="research-alert" role="alert">{error}</div>}
        {loading && <p role="status">Đang tải hoạt động nghiên cứu…</p>}
        {!loading && workspace && saved.length === 0 && <p>Chưa có quyết định PO nào được lưu trong dự án này.</p>}
        {!loading && workspace && saved.length > 0 && <>
          <nav className="tracking-status-filters" aria-label="Lọc việc cần làm">
            {([{ id: 'open', label: `Đang mở · ${openCount}` }, { id: 'due', label: `Đến hạn · ${dueCount}` }, { id: 'done', label: `Đã xong · ${doneCount}` }, { id: 'all', label: `Tất cả · ${saved.length}` }] as { id: TrackingFilter; label: string }[]).map((filter) =>
              <button type="button" key={filter.id} className={trackingFilter === filter.id ? 'active' : ''} aria-pressed={trackingFilter === filter.id} onClick={() => setTrackingFilter(filter.id)}>{filter.label}</button>)}
          </nav>
          {visibleSaved.length === 0 ? <p className="tracking-filter-empty">Không có mục nào trong nhóm này.</p> : <div className="tracking-project-list">
          {visibleSaved.map((item) => {
            const decision = item.decision!;
            const workflow = (decision.workflow_status ?? 'not_started') as TrackingWorkflowStatus;
            const due = isDue(item);
            const status = decision.decision_status ? decisions[decision.decision_status] : 'Chưa chọn quyết định';
            const target = item.decision_target ?? decision.decision_target;
            const report = target?.report_id ? workspace?.reports.find((entry) => entry.report_id === target.report_id) : undefined;
            const finding = target?.kind === 'report_finding' ? report?.findings.find((entry) => entry.key === target.item_key) : undefined;
            const manualUpdates = decision.manual_updates ?? [];
            const detailedReport = target?.report_id ? decisionReports[target.report_id] : undefined;
            const selectedObservation = decision.tracked_observation_reference;
            const findingSources = new Set(finding?.evidence_references ?? []);
            const reportMetricRows = (detailedReport?.research_data?.quantitative_observations ?? []).filter((row) =>
              row.observation_type === 'reported' && row.value !== null && Boolean(row.metric_id && row.metric_definition && row.unit
                && row.period_start && row.period_end && (row.source_reference || row.evidence_reference)
                && [row.source_reference, row.evidence_reference].some((source) => source && findingSources.has(source))));
            const duplicateMetricKeys = new Set(reportMetricRows.map(metricSelectionKey).filter((key, index, all) => all.indexOf(key) !== index));
            const metricChoice = metricChoices[item.candidate_id] ?? (selectedObservation && selectedObservation.report_id === detailedReport?.id ? selectedObservation.observation_key : '');
            const followUpReport = trackingFollowUps[item.candidate_id];
            const followUpLoaded = Object.prototype.hasOwnProperty.call(trackingFollowUps, item.candidate_id);
            const selectedOldRows = (detailedReport?.research_data?.quantitative_observations ?? []).filter((row) =>
              row.observation_type === 'reported' && metricSelectionKey(row) === selectedObservation?.observation_key);
            const selectedOldRow = selectedOldRows.length === 1 && detailedReport?.content_sha256 === selectedObservation?.report_content_sha256
              ? selectedOldRows[0] : undefined;
            const pairReview = (followUpReport?.comparison_reviews ?? []).find((review) => review.review_type !== 'tracked_observation'
              && review.before_report_id === selectedObservation?.report_id && review.before_item_key === target?.item_key && review.decision === 'same');
            const nextFinding = pairReview && followUpReport?.research_data.findings.find((entry) => entry.key === pairReview.after_item_key);
            const nextRows = followUpReport ? (followUpReport.research_data.quantitative_observations ?? []).filter((row) =>
              row.observation_type === 'reported' && metricIdentityKey(row) === selectedObservation?.metric_identity_key) : [];
            const linkedNextRows = nextFinding ? nextRows.filter((row) => [row.source_reference, row.evidence_reference]
              .some((source) => source && nextFinding.evidence_references.includes(source))) : [];
            const nextMetric = linkedNextRows.length === 1 ? linkedNextRows[0] : undefined;
            const signalReady = Boolean(selectedOldRow && nextMetric && compatibleTrackedMetric(selectedOldRow, nextMetric));
            const seen = (followUpReport?.comparison_reviews ?? []).some((review) => review.review_type === 'tracked_observation'
              && review.candidate_id === item.candidate_id && review.before_report_id === selectedObservation?.report_id
              && review.before_item_key === target?.item_key && review.after_item_key === pairReview?.after_item_key
              && review.observation_key === selectedObservation?.observation_key);
            return <article id={`tracking-item-${item.candidate_id}`} key={item.candidate_id} className="tracking-item">
              <div className="tracking-item-copy">
                <strong>{finding?.title ?? item.name}</strong>
                <small>Hướng xử lý PO: {status}</small>
                <span className={`tracking-workflow-status is-${workflow}${due ? ' is-due' : ''}`}>{due ? `Đến hạn xem lại · ${decision.review_date}` : workflowLabels[workflow]}{!decision.review_date && workflow !== 'completed' && workflow !== 'paused' ? ' · Chưa đặt ngày xem lại' : ''}</span>
                {report && <small>Nguồn: <a href={`/reports/${encodeURIComponent(report.report_id)}?section=insights&finding=${encodeURIComponent(target?.item_key ?? '')}`}>{report.question}{finding ? ` · ${finding.title}` : ''}</a></small>}
                {!report && target?.kind === 'report_finding' && <small>Nguồn báo cáo cần xem lại · quyết định được giữ nguyên</small>}
                {decision.rationale && <p>{decision.rationale}</p>}
                {decision.next_action ? <p><strong>Bước tiếp theo:</strong> {decision.next_action}</p> : <p><small>Chưa ghi việc tiếp theo</small></p>}
                {decision.review_date ? <small>Ngày xem lại: {decision.review_date}</small> : <small>Chưa đặt ngày xem lại</small>}
                {target?.kind === 'report_finding' && finding && <section className="tracking-observation-selection" aria-label="Số liệu được chọn để theo dõi">
                  <strong>Số liệu trong quyết định</strong>
                  {!selectedObservation && <small>Chưa chọn số liệu để theo dõi.</small>}
                  {selectedObservation && <p>{selectedObservation.metric_definition}: {selectedObservation.value} {selectedObservation.unit} · {selectedObservation.period_start} – {selectedObservation.period_end}<br />Đã chọn từ báo cáo {selectedObservation.report_id}; số liệu do báo cáo cung cấp, chưa xác minh độc lập.</p>}
                  {(selectedObservation?.source_reference || selectedObservation?.evidence_reference) && <a href={(selectedObservation.source_reference || selectedObservation.evidence_reference)!} target="_blank" rel="noreferrer">Mở nguồn đã chọn</a>}
                  {selectedObservation && !followUpLoaded && <small role="status">Đang kiểm tra báo cáo mới cùng câu hỏi, thị trường và nền tảng…</small>}
                  {selectedObservation && followUpLoaded && !followUpReport && <small>Chưa có báo cáo mới cùng câu hỏi, thị trường và nền tảng để đối chiếu.</small>}
                  {selectedObservation && followUpReport && !pairReview && <small>Báo cáo mới chưa được PO xác nhận là cùng phát hiện; chưa ghép số liệu.</small>}
                  {selectedObservation && followUpReport && pairReview && !signalReady && <small>{linkedNextRows.length > 1 ? 'Báo cáo mới có nhiều phép đo cùng định danh; không tự chọn một phép đo.' : linkedNextRows.length === 0 ? 'Chưa có phép đo mới có nguồn gắn với phát hiện đã xác nhận.' : 'Kỳ đo hoặc định nghĩa chưa tương thích; không tính chênh lệch.'}</small>}
                  {signalReady && selectedOldRow && nextMetric && followUpReport && pairReview && <div className="tracking-observation-signal" role="status">
                    <strong>Tín hiệu từ báo cáo: {formatMetricValue(selectedOldRow.value, selectedOldRow.unit)} → {formatMetricValue(nextMetric.value, nextMetric.unit)}</strong>
                    <small>{formatMetricChange(selectedOldRow.value!, nextMetric.value!, nextMetric.unit)}. Kỳ {selectedOldRow.period_start}–{selectedOldRow.period_end} → {nextMetric.period_start}–{nextMetric.period_end}. Số liệu do báo cáo cung cấp, chưa xác minh độc lập; quyết định PO không thay đổi.</small>
                    <span>{(selectedOldRow.source_reference || selectedOldRow.evidence_reference) && <a href={(selectedOldRow.source_reference || selectedOldRow.evidence_reference)!} target="_blank" rel="noreferrer">Nguồn kỳ trước</a>}{(selectedOldRow.source_reference || selectedOldRow.evidence_reference) && (nextMetric.source_reference || nextMetric.evidence_reference) && ' · '}{(nextMetric.source_reference || nextMetric.evidence_reference) && <a href={(nextMetric.source_reference || nextMetric.evidence_reference)!} target="_blank" rel="noreferrer">Nguồn kỳ mới</a>}</span>
                    {seen ? <small>Đã xác nhận đã xem cặp số liệu này.</small>
                      : <button type="button" className="text-button" disabled={Boolean(acknowledgingId)} onClick={() => void acknowledgeTrackedMetric(item, followUpReport, target?.item_key ?? '', pairReview.after_item_key)}>{acknowledgingId === item.candidate_id ? 'Đang lưu…' : 'Xác nhận đã xem số liệu'}</button>}
                  </div>}
                  {!detailedReport ? <small role="status">Đang tải số liệu từ báo cáo đã lưu…</small>
                    : reportMetricRows.length === 0 ? <small>Báo cáo không có số liệu có kỳ đo và nguồn gắn với phát hiện này.</small>
                      : <div className="tracking-metric-picker">
                        <label>Chọn đúng một số liệu kỳ cũ
                          <select aria-label={`Chọn số liệu cho ${finding.title}`} value={metricChoice} onChange={(event) => setMetricChoices((current) => ({ ...current, [item.candidate_id]: event.target.value }))}>
                            <option value="">Chưa chọn số liệu</option>
                            {reportMetricRows.map((row, index) => {
                              const key = metricSelectionKey(row);
                              const duplicate = duplicateMetricKeys.has(key);
                              return <option key={`${key}:${index}`} value={duplicate ? `duplicate:${index}` : key} disabled={duplicate}>
                                {row.metric_definition} · {row.value} {row.unit} · {row.period_start}–{row.period_end}{duplicate ? ' · trùng nhận dạng, không thể chọn riêng' : ''}
                              </option>;
                            })}
                          </select>
                        </label>
                        <button type="button" className="text-button" disabled={!metricChoice || metricChoice.startsWith('duplicate:') || selectionSavingId === item.candidate_id || !decision.revision}
                          onClick={() => { const row = reportMetricRows.find((entry) => metricSelectionKey(entry) === metricChoice); if (row && detailedReport) void saveMetricSelection(item, detailedReport, row); }}>
                          {selectionSavingId === item.candidate_id ? 'Đang lưu…' : selectedObservation ? 'Lưu lựa chọn số liệu' : 'Lưu số liệu đã chọn'}
                        </button>
                      </div>}
                </section>}
                {manualUpdates.length > 0 && <details className="tracking-update-history"><summary>Cập nhật PO tự ghi ({manualUpdates.length})</summary>
                  {manualUpdates.map((update) => <section key={update.id}><strong>{update.observed_on} · PO tự ghi</strong><p>{update.content}</p>{update.source_title && <small>Nguồn được ghi: {update.source_title}</small>}{update.source_url && <a href={update.source_url} target="_blank" rel="noreferrer">Mở nguồn do PO cung cấp</a>}{update.source_note && <small>{update.source_note}</small>}{!update.source_url && <small>Chưa có liên kết nguồn · cần kiểm tra</small>}{update.supersedes_id && <small>Đính chính một bản ghi trước đó</small>}<button type="button" className="text-button" onClick={() => { setEditingCorrectionId(update.id); openUpdate(item, update); }}>Ghi nhận đính chính</button></section>)}
                </details>}
                {editingId === item.candidate_id && <form className="tracking-manual-update" onSubmit={(event) => void saveManualUpdate(event, item)}>
                  <h3>{editingCorrectionId ? 'Ghi nhận đính chính' : 'Ghi nhận cập nhật thủ công'}</h3>
                  <p>Bản ghi mới sẽ nằm trong lịch sử của mục theo dõi này. Quyết định PO không bị thay đổi.</p>
                  <label>Ngày quan sát<input type="date" required value={observedOn} onChange={(event) => { pendingUpdateRef.current = null; setObservedOn(event.target.value); }} /></label>
                  <label>Điều bạn nhận thấy<textarea required maxLength={20_000} value={content} onChange={(event) => { pendingUpdateRef.current = null; setContent(event.target.value); }} /></label>
                  <label>Tên nguồn (tùy chọn)<input value={sourceTitle} onChange={(event) => { pendingUpdateRef.current = null; setSourceTitle(event.target.value); }} /></label>
                  <label>Liên kết nguồn (tùy chọn)<input type="url" value={sourceUrl} onChange={(event) => { pendingUpdateRef.current = null; setSourceUrl(event.target.value); }} placeholder="https://…" /></label>
                  <label>Ghi chú nguồn (tùy chọn)<textarea value={sourceNote} onChange={(event) => { pendingUpdateRef.current = null; setSourceNote(event.target.value); }} /></label>
                  <div className="intake-actions"><button className="primary-action" type="submit" disabled={savingId === item.candidate_id || !content.trim()}>{savingId === item.candidate_id ? 'Đang lưu…' : error ? 'Thử lưu lại' : 'Lưu cập nhật'}</button><button className="secondary-action" type="button" disabled={savingId === item.candidate_id} onClick={() => { setEditingId(''); setEditingCorrectionId(''); }}>Hủy</button></div>
                </form>}
              </div>
              <div className="tracking-item-actions">
                <label className="tracking-workflow-select">Tiến độ
                  <select aria-label={`Tiến độ: ${finding?.title ?? item.name}`} value={workflow} disabled={workflowSavingId === item.candidate_id}
                    onChange={(event) => void updateWorkflowStatus(item, event.target.value as TrackingWorkflowStatus)}>
                    {(Object.entries(workflowLabels) as [TrackingWorkflowStatus, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {workflowSavingId === item.candidate_id && <small role="status">Đang lưu tiến độ…</small>}
                <a className="secondary-action" href={opportunityDecisionHref(projectId, item)}>Mở quyết định PO</a>
                <button className="text-button" type="button" onClick={() => { setEditingCorrectionId(''); openUpdate(item); }}>Ghi nhận thay đổi</button>
              </div>
            </article>;
          })}
        </div>}
        </>}
      </section>
    </div>;
  }

  return <div className="tracking-workspace"><section className="research-panel">
    <div className="panel-heading"><div><span className="state-label">THEO DÕI</span><h2>Chọn dự án cần theo dõi</h2></div></div>
    <p>Các quyết định đã lưu nằm trong dự án tương ứng.</p>
    {error && <div className="research-alert" role="alert">{error}</div>}
    {loading ? <p className="state-message" role="status">Đang tải dự án…</p> : projects.length === 0 ? <p>Chưa có dự án. <a href="/research/new">Tạo dự án mới</a></p> : <div className="tracking-project-list">
      {projects.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{item.category || 'Dự án nghiên cứu'}</small></div>
      <a className="secondary-action" href={`/tracking?projectId=${encodeURIComponent(item.id)}`}>Xem theo dõi →</a></article>)}
    </div>}
  </section></div>;
}
