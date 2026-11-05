import { useEffect, useMemo, useState } from 'react';
import { reportApi, type ComparisonDataset, type ReportSummary } from '../reports/api';
import { researchApi, type OpportunityDecision, type OpportunityCandidate, type OpportunityWorkspace, type ProjectSavedInformation, type ProjectTrendUpdate, type ResearchBenchmarkCollection, type ResearchProject, type ResearchSubject } from './api';
import { opportunityDecisionHref } from './decisionNavigation';
import { brokenSourceCheck } from '../reports/sourceStatus';
import { assistantName } from '../reports/provenance';
import { ResultsIcon } from '../ui/ResultsIcon';
import { ProjectJourneyNav } from './ProjectJourneyNav';
import './ProjectHome.css';
import './projectThemePrototype.css';

type ProjectHomeData = {
  project: ResearchProject;
  reports: ReportSummary[];
  collections: ResearchBenchmarkCollection[];
  subjects: ResearchSubject[];
  updates: ProjectTrendUpdate[];
  savedInformation: ProjectSavedInformation[];
  datasets: ComparisonDataset[];
  opportunityWorkspace: OpportunityWorkspace | null;
};

function reportTitle(report: ReportSummary): string {
  return report.question || 'Báo cáo nghiên cứu';
}

function researchAgainHref(report: ReportSummary, projectId: string): string {
  return `/?projectId=${encodeURIComponent(projectId)}&question=${encodeURIComponent(report.question)}&geo=${encodeURIComponent(report.geo)}&environment=${encodeURIComponent(report.os)}&fromReportId=${encodeURIComponent(report.id)}&action=research-again`;
}

function reportScopeLabel(value: string | null | undefined, type: 'geo' | 'environment'): string {
  const normalized = value?.trim().toLocaleLowerCase();
  if (!normalized || normalized === 'unknown') return type === 'geo' ? 'Chưa xác định thị trường' : 'Chưa xác định môi trường';
  if (normalized === 'global / not specified') return 'Toàn cầu · chưa chỉ định';
  if (normalized === 'global' || normalized === 'worldwide') return 'Toàn cầu';
  if (normalized === 'both') return 'Nhiều nền tảng';
  return value!;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa có ngày' : date.toLocaleDateString('vi-VN');
}

function decisionStatusLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    investigate: 'Cần tìm hiểu thêm', benchmark: 'Cần so sánh', experiment: 'Cần thử nghiệm',
    implementation_candidate: 'Đề xuất triển khai', hold: 'Tạm hoãn', reject: 'Từ chối có lý do',
  };
  return status ? labels[status] ?? 'Đã lưu đánh giá' : 'Đã lưu · chưa chọn trạng thái';
}

function workflowStatusLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    not_started: 'Chưa bắt đầu', researching: 'Đang tìm hiểu', waiting_for_data: 'Chờ dữ liệu',
    evaluating: 'Đang đánh giá', completed: 'Đã xong việc', paused: 'Tạm dừng',
  };
  return status ? labels[status] ?? 'Chưa bắt đầu' : 'Chưa bắt đầu';
}

export function ProjectHome({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [latestFindings, setLatestFindings] = useState<{ key: string; title: string; text: string; evidence: string[] }[]>([]);
  const [savingFindingKey, setSavingFindingKey] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setConclusion('');
    setLatestFindings([]);
    Promise.all([
      researchApi.getProject(projectId),
      reportApi.listProjectReports(projectId),
      researchApi.listBenchmarkCollections(projectId),
      researchApi.listSubjects(projectId),
      researchApi.listTrendUpdates(projectId, { limit: 10 }),
      researchApi.listSavedInformation(projectId, { limit: 10 }).catch(() => ({ items: [], next_cursor: null, limit: 10 })),
      reportApi.listComparisonDatasets(undefined, projectId).catch(() => ({ items: [], next_cursor: null, limit: 100 })),
      researchApi.getOpportunities(projectId).catch(() => null),
    ]).then(([project, reports, collections, subjects, updates, savedInformation, datasets, opportunityWorkspace]) => {
      if (active) setData({ project, reports: reports.items, collections: collections.items, subjects: subjects.items, updates: updates.items, savedInformation: savedInformation.items, datasets: datasets.items, opportunityWorkspace });
      const latest = reports.items[0];
      if (latest) void reportApi.get(latest.id).then((detail) => {
        if (active && detail.id === latest.id && detail.content_sha256 === latest.content_sha256) {
          setConclusion(detail.research_data?.executive_summary?.trim() || '');
          // Each finding with a PO implication is a next action the PO can save as a decision.
          setLatestFindings((detail.research_data?.findings ?? []).filter((finding) => finding.po_implications?.trim())
            .map((finding) => ({ key: finding.key, title: finding.title, text: finding.po_implications!.trim(), evidence: finding.evidence_references ?? [] })));
        }
      }).catch(() => {});
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Không mở được dự án. Vui lòng thử lại.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const activity = useMemo(() => {
    if (!data) return [];
    return [
      ...data.updates.map((update) => ({ id: `update-${update.id}`, label: 'Đã thêm cập nhật xu hướng', detail: update.subject_name, date: update.created_at, href: `/research?projectId=${encodeURIComponent(projectId)}&view=notes#project-trend-updates` })),
      ...data.savedInformation.map((item) => ({ id: `saved-${item.id}`, label: 'Đã lưu thông tin', detail: item.subject_name || item.source_title || item.original_content.slice(0, 100), date: item.created_at, href: `/research?projectId=${encodeURIComponent(projectId)}&view=notes#project-saved-information` })),
    ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5);
  }, [data, projectId]);

  async function saveFindingAsDecision(finding: { key: string; title: string; text: string; evidence: string[] }, reportId: string, candidate: OpportunityCandidate) {
    if (!data) return;
    const target = candidate.decision_target ?? candidate.decision?.decision_target;
    if (!target) return;
    setSavingFindingKey(finding.key); setActionError(''); setActionNotice('');
    const payload: OpportunityDecision = {
      candidate_id: candidate.candidate_id,
      expected_revision: candidate.decision?.revision ?? 0,
      dataset_id: null, dataset_content_sha256: null, source_entity_id: null,
      decision_target: target,
      workflow_status: candidate.decision?.workflow_status ?? 'not_started',
      decision_status: candidate.decision?.decision_status ?? 'investigate',
      rationale: candidate.decision?.rationale ?? `Từ báo cáo nghiên cứu: ${finding.title}`,
      supporting_evidence: candidate.decision?.supporting_evidence ?? [],
      contradictory_evidence: candidate.decision?.contradictory_evidence ?? [],
      open_questions: candidate.decision?.open_questions ?? [],
      assessments: candidate.decision?.assessments ?? [],
      priority: candidate.decision?.priority ?? 'not_assessed',
      review_date: candidate.decision?.review_date ?? null,
      next_action: finding.text,
    };
    try {
      const saved = await researchApi.saveOpportunityDecision(projectId, payload);
      setData((current) => current ? { ...current, opportunityWorkspace: saved } : current);
      setActionNotice(`Đã lưu “${finding.title}” thành Quyết định PO.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Chưa lưu được quyết định. Hãy thử lại.');
    } finally { setSavingFindingKey(null); }
    void reportId;
  }

  if (loading) return <section className="project-home-state" role="status">Đang mở dự án…</section>;
  if (error || !data) return <section className="project-home-state" role="alert"><strong>Không mở được dự án này.</strong><p>{error || 'Dự án có thể đã được di chuyển hoặc xóa.'}</p><button className="secondary-action" type="button" onClick={() => window.location.reload()}>Thử lại</button><a className="text-button" href="/research">Về danh sách dự án</a></section>;

  const { project, reports, collections, subjects, datasets, opportunityWorkspace } = data;
  // A saved decision that came from a report finding inherits the broken-source label from that finding.
  const brokenSourceFor = (itemKey: string | undefined) => {
    const finding = latestFindings.find((item) => item.key === itemKey);
    return finding ? finding.evidence.filter((url) => brokenSourceCheck(url)).length : 0;
  };
  const home = `/research?projectId=${encodeURIComponent(projectId)}`;
  const deepResearch = `${home}&view=plan`;
  const saveInformation = `${home}&view=notes#project-saved-information`;
  const csvImport = `${home}&view=csv&action=import-csv#project-csv-data`;
  const allSavedDecisions = (opportunityWorkspace?.candidates ?? []).filter((candidate) => candidate.decision);
  const savedDecisions = allSavedDecisions.slice(0, 4);
  const openFollowUps = (opportunityWorkspace?.candidates ?? []).filter((candidate) => candidate.decision
    && !['completed', 'paused'].includes(candidate.decision.workflow_status ?? 'not_started'));
  const nextWork = [...openFollowUps].sort((left, right) => {
    const leftDate = left.decision?.review_date ?? '9999-12-31';
    const rightDate = right.decision?.review_date ?? '9999-12-31';
    return leftDate.localeCompare(rightDate);
  })[0];
  const nextWorkTarget = nextWork?.decision_target ?? nextWork?.decision?.decision_target;
  const nextWorkReport = nextWorkTarget?.report_id
    ? reports.find((report) => report.id === nextWorkTarget.report_id)
    : undefined;
  const researchAgain = reports[0] ? researchAgainHref(reports[0], projectId) : deepResearch;
  const primaryHref = nextWork?.decision ? opportunityDecisionHref(projectId, nextWork) : researchAgain;
  const primaryLabel = nextWork?.decision ? 'Tiếp tục việc cần làm' : reports[0] ? 'Nghiên cứu lại chủ đề' : 'Bắt đầu nghiên cứu';

  return <div className="project-home">
    <ProjectJourneyNav projectId={projectId} active="research" />
    <header className="project-home-header">
      <div><p className="project-home-eyebrow">DỰ ÁN NGHIÊN CỨU</p><h1>{project.name}</h1>
        <p className="project-home-description">{project.category || 'Không gian nghiên cứu'}{project.owner ? ` · ${project.owner}` : ''}</p>
        {project.topic?.trim() && <p className="project-home-topic"><span>Chủ đề:</span> {project.topic.trim()}</p>}</div>
      <nav className="project-home-header-actions" aria-label="Bắt đầu nghiên cứu">
        <a className="project-home-primary-link" href={csvImport}>Nhập CSV</a>
        <a className="project-home-primary-link" href={researchAgain}>Nghiên cứu tổng quan</a>
        {nextWork?.decision && <a className="project-home-secondary-link" href={primaryHref}>{primaryLabel}</a>}
      </nav>
    </header>

    <div className="project-home-content-grid">
      <section className="project-home-section project-home-latest" aria-labelledby="project-home-latest-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">NGHIÊN CỨU GẦN NHẤT</span><h2 id="project-home-latest-title">Kết quả mới nhất</h2></div></div>
        {reports[0] ? <article className="project-home-latest-card">
          <h3 className="project-home-latest-title">{reportTitle(reports[0])}</h3>
          {conclusion && <p className="project-home-report-conclusion">{conclusion.length > 600 ? `${conclusion.slice(0, 600)}…` : conclusion}</p>}
          <p>{[reportScopeLabel(reports[0].geo, 'geo'), reportScopeLabel(reports[0].os, 'environment'), reports[0].research_period, dateLabel(reports[0].imported_at)].filter(Boolean).join(' · ')}</p>
          <div className="project-home-latest-meta">{typeof reports[0].finding_count === 'number' && <span>{reports[0].finding_count} phát hiện</span>}{typeof reports[0].entity_count === 'number' && <span>{reports[0].entity_count} thực thể</span>}<span>Nhập từ {assistantName(reports[0])}</span><span>Chưa xác minh độc lập</span></div>
          <a className="project-home-next-detail-link" href={`/reports/${encodeURIComponent(reports[0].id)}`}>Đọc báo cáo và nguồn</a>
          {latestFindings.length > 0 && <section className="project-home-actions" aria-label="Hành động gợi ý từ báo cáo">
            <h3>Hành động gợi ý từ báo cáo · nhận định AI, chưa xác minh</h3>
            {actionNotice && <p role="status">{actionNotice}</p>}
            {actionError && <p role="alert">{actionError}</p>}
            <ul>{latestFindings.slice(0, 6).map((finding) => {
              const candidate = (opportunityWorkspace?.candidates ?? []).find((item) => {
                const target = item.decision_target ?? item.decision?.decision_target;
                return target?.kind === 'report_finding' && target.report_id === reports[0].id && target.item_key === finding.key;
              });
              const saved = Boolean(candidate?.decision);
              // An action without a source is shown as such and cannot be saved as a decision.
              const hasEvidence = finding.evidence.length > 0;
              const brokenUrls = finding.evidence.filter((url) => brokenSourceCheck(url));
              return <li key={finding.key}>
                <strong>{finding.title}</strong>
                <span>{finding.text}</span>
                {!hasEvidence && <small className="project-home-no-evidence">Chưa có bằng chứng · không lưu được thành quyết định</small>}
                {brokenUrls.length > 0 && <small className="project-home-broken-source">Có nguồn Link hỏng ({brokenUrls.length}) · xem báo cáo trước khi dùng</small>}
                {!hasEvidence ? null : candidate
                  ? <button className="secondary-action" type="button" disabled={saved || savingFindingKey !== null} onClick={() => void saveFindingAsDecision(finding, reports[0].id, candidate)}>{saved ? 'Đã là Quyết định PO' : savingFindingKey === finding.key ? 'Đang lưu…' : 'Lưu thành Quyết định PO'}</button>
                  : <small>Chưa có mục để lưu quyết định.</small>}
              </li>;
            })}</ul>
          </section>}
        </article> : <div className="project-home-next-empty"><strong>Chưa có kết quả nghiên cứu</strong><p>Báo cáo đã nhập hoặc nghiên cứu đã lưu sẽ xuất hiện tại đây.</p></div>}
        {reports.length > 1 && <a className="project-home-all-reports" href={`/reports?projectId=${encodeURIComponent(projectId)}`}>Xem {reports.length} báo cáo →</a>}
      </section>

      <section className="project-home-section project-home-continue" aria-labelledby="project-home-continue-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">TRẠNG THÁI VÀ VIỆC TIẾP THEO</span><h2 id="project-home-continue-title">Quyết định PO</h2></div></div>
        {nextWork?.decision ? <article className="project-home-next-item">
          <div className="project-home-next-item-meta"><span className="project-home-status">{decisionStatusLabel(nextWork.decision.decision_status)}</span><span>{workflowStatusLabel(nextWork.decision.workflow_status)}</span><span>{nextWork.decision.review_date ? `Xem lại ${dateLabel(nextWork.decision.review_date)}` : 'Chưa đặt ngày xem lại'}</span></div>
          <h3>{nextWork.name}</h3>
          {brokenSourceFor(nextWorkTarget?.item_key) > 0 && <small className="project-home-broken-source">Có nguồn Link hỏng ({brokenSourceFor(nextWorkTarget?.item_key)}) · quyết định này lấy từ phát hiện có nguồn hỏng</small>}
          <p>{nextWork.decision.next_action || 'Chưa ghi việc tiếp theo.'}</p>
          {nextWorkReport && <a className="project-home-source-link" href={`/reports/${encodeURIComponent(nextWorkReport.id)}`}>Nguồn nghiên cứu: {reportTitle(nextWorkReport)} <span aria-hidden="true">↗</span></a>}
          <a className="project-home-next-detail-link" href={opportunityDecisionHref(projectId, nextWork)}>Xem quyết định và cập nhật</a>
        </article> : <div className="project-home-next-empty"><strong>{allSavedDecisions.length ? `${allSavedDecisions.length} quyết định đã lưu` : 'Chưa có quyết định PO'}</strong><p>{openFollowUps.length ? `${openFollowUps.length} việc đang mở để theo dõi.` : 'Quyết định và việc cần theo dõi sẽ xuất hiện ở đây.'}</p></div>}
      </section>
    </div>

    {datasets[0] && <section className="project-home-review" aria-labelledby="project-home-review-title">
      <div><span className="project-home-kicker">CSV MỚI NHẤT · {dateLabel(datasets[0].created_at)}</span><h2 id="project-home-review-title">Dữ liệu CSV mới nhất</h2>
        <p>{datasets[0].filename} · {datasets[0].source_apps} sản phẩm · {datasets[0].metrics.length} chỉ số. Mở phân tích để xem điểm nổi bật; so sánh giữa các tệp chỉ hiện khi đủ điều kiện.</p>
        <small>Chỉ hiện chênh lệch khi có hai kỳ tương thích; số liệu CSV chưa được xác minh độc lập.</small></div>
      <a href={`${home}&view=csv&datasetId=${encodeURIComponent(datasets[0].id)}#project-csv-data`}>Mở phân tích CSV →</a>
    </section>}

    <details className="project-home-saved-details">
      <summary>Dữ liệu và nội dung đã lưu</summary>
      <div className="project-home-saved-details-content">
        <nav className="project-home-quick-links" aria-label="Công cụ bổ sung trong dự án"><span>Thêm dữ liệu</span><a href={`/?projectId=${encodeURIComponent(projectId)}&action=import`}>Nhập báo cáo</a><a href={csvImport}>Phân tích CSV</a><a href={saveInformation}>Lưu thông tin</a></nav>

        {activity.length > 0 && <section className="project-home-section project-home-activity-section" aria-labelledby="project-activity-title">
          <div className="project-home-section-heading"><div><span className="project-home-kicker">VIỆC ĐÃ LƯU</span><h2 id="project-activity-title">Cập nhật gần đây</h2></div></div>
          <div className="project-home-activity">{activity.map((item) => <a href={item.href} className="project-home-activity-row" key={item.id}><span className="project-home-activity-dot" aria-hidden="true" /><span className="project-home-row-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><time>{dateLabel(item.date)}</time></a>)}</div>
        </section>}

        {(collections.length > 0 || subjects.length > 0 || datasets.length > 0 || savedDecisions.length > 0) && <section className="project-home-support" aria-labelledby="project-support-title">
          <div className="project-home-section-heading"><div><span className="project-home-kicker">THEO NGỮ CẢNH DỰ ÁN</span><h2 id="project-support-title">Thông tin đã lưu</h2></div></div>
          <div className="project-home-support-grid">
        {collections.length > 0 && <section className="project-home-support-group" aria-labelledby="project-collections-title"><div className="project-home-support-heading"><ResultsIcon name="comparison" /><h3 id="project-collections-title">Bộ so sánh</h3><a href={`${home}&view=notes#project-benchmark-collections`}>Mở <span aria-hidden="true">→</span></a></div><div className="project-home-compact-list">{collections.slice(0, 4).map((collection) => <a className="project-home-compact-row project-home-dataset" href={`${home}&view=notes&collectionId=${encodeURIComponent(collection.id)}#project-benchmark-collections`} aria-label={`Mở bộ so sánh ${collection.name}`} key={collection.id}><span className="project-home-row-copy"><strong>{collection.name}</strong><small>{collection.members.length} hồ sơ</small></span><span className="project-home-arrow" aria-hidden="true">›</span></a>)}</div></section>}
        {subjects.length > 0 && <section className="project-home-support-group" aria-labelledby="project-subjects-title"><div className="project-home-support-heading"><ResultsIcon name="search" /><h3 id="project-subjects-title">Hồ sơ nghiên cứu</h3><a href={`${home}&view=notes#project-subject-profiles`}>Mở <span aria-hidden="true">→</span></a></div><div className="project-home-subject-list">{subjects.slice(0, 6).map((subject) => <a className="project-home-subject" href={`${home}&view=notes&subjectId=${encodeURIComponent(subject.id)}#project-subject-profiles`} aria-label={`Mở hồ sơ ${subject.name}`} key={subject.id}>{subject.name}<span aria-hidden="true"> →</span></a>)}</div></section>}
        {datasets.length > 0 && <section className="project-home-support-group project-home-csv-group" aria-labelledby="project-data-title"><div className="project-home-support-heading"><ResultsIcon name="metric" /><h3 id="project-data-title">Tệp CSV</h3><span className="project-home-file-count">{datasets.length} đã lưu</span><a href={`${home}&view=csv#project-csv-data`}>Phân tích <span aria-hidden="true">→</span></a></div>{datasets[0] && <a className="project-home-current-dataset" href={`${home}&view=csv&datasetId=${encodeURIComponent(datasets[0].id)}#project-csv-data`} aria-label={`Mở phân tích CSV ${datasets[0].filename}`}><span className="project-home-current-dataset-copy"><small>TỆP MỚI NHẤT</small><strong>{datasets[0].filename}</strong><span>{datasets[0].source_apps} sản phẩm · {datasets[0].metrics.length} chỉ số · nhập {dateLabel(datasets[0].created_at)}</span></span><span className="project-home-current-dataset-action">Mở bảng</span></a>}{datasets.length > 1 && <details className="project-home-older-datasets"><summary>Xem {datasets.length - 1} tệp CSV còn lại</summary><div className="project-home-compact-list">{datasets.slice(1, 5).map((dataset) => <a className="project-home-compact-row project-home-dataset" href={`${home}&view=csv&datasetId=${encodeURIComponent(dataset.id)}#project-csv-data`} aria-label={`Mở phân tích CSV ${dataset.filename}`} key={dataset.id}><span className="project-home-row-copy"><strong>{dataset.filename}</strong><small>{dataset.source_apps} sản phẩm · {dataset.metrics.length} chỉ số · nhập {dateLabel(dataset.created_at)}</small></span><span className="project-home-arrow" aria-hidden="true">›</span></a>)}</div></details>}{opportunityWorkspace?.shortlist_dataset_id && <p className="project-home-data-note">Danh sách sản phẩm đã lưu để xem lại.</p>}</section>}
        {savedDecisions.length > 0 && <section className="project-home-support-group" aria-labelledby="project-home-decisions-title"><div className="project-home-support-heading"><ResultsIcon name="decision" /><h3 id="project-home-decisions-title">Quyết định PO</h3><a href={`${home}&view=opportunities`}>Mở <span aria-hidden="true">→</span></a></div><div className="project-home-decision-list">{savedDecisions.map((candidate) => <a className="project-home-decision-row" href={opportunityDecisionHref(projectId, candidate)} key={candidate.candidate_id}><span className="project-home-row-copy"><strong>{candidate.name}</strong><small>{decisionStatusLabel(candidate.decision?.decision_status)}{candidate.decision?.next_action ? ` · ${candidate.decision.next_action}` : ''}{brokenSourceFor(candidate.decision_target?.item_key ?? candidate.decision?.decision_target?.item_key) > 0 ? ' · Có nguồn Link hỏng' : ''}</small></span><span className="project-home-arrow" aria-hidden="true">›</span></a>)}</div></section>}
          </div>
        </section>}
      </div>
    </details>

  </div>;
}
