import { useEffect, useMemo, useState } from 'react';
import { reportApi, type ComparisonDataset, type ReportSummary } from '../reports/api';
import { researchApi, type OpportunityWorkspace, type ProjectSavedInformation, type ProjectTrendUpdate, type ResearchBenchmarkCollection, type ResearchProject, type ResearchSubject } from './api';
import { opportunityDecisionHref } from './decisionNavigation';
import { ResultsIcon } from '../ui/ResultsIcon';
import { csvCompatibilityLabel } from '../reports/csvPresentation';
import './ProjectHome.css';

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

function datasetReadinessLabel(status: ComparisonDataset['compatibility_status']): string {
  return csvCompatibilityLabel(status);
}

function decisionStatusLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    investigate: 'Cần tìm hiểu thêm', benchmark: 'Cần so sánh', experiment: 'Cần thử nghiệm',
    implementation_candidate: 'Đề xuất triển khai', hold: 'Tạm hoãn', reject: 'Từ chối có lý do',
  };
  return status ? labels[status] ?? 'Đã lưu đánh giá' : 'Đã lưu · chưa chọn trạng thái';
}

export function ProjectHome({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
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
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Không mở được dự án. Vui lòng thử lại.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const activity = useMemo(() => {
    if (!data) return [];
    return [
      ...data.reports.map((report) => ({ id: `report-${report.id}`, label: 'Đã lưu báo cáo', detail: reportTitle(report), date: report.imported_at, href: `/reports/${encodeURIComponent(report.id)}` })),
      ...data.datasets.map((dataset) => ({ id: `dataset-${dataset.id}`, label: 'Đã thêm tệp dữ liệu', detail: dataset.filename, date: dataset.created_at, href: `/research?projectId=${encodeURIComponent(projectId)}&view=data&datasetId=${encodeURIComponent(dataset.id)}#project-csv-data` })),
      ...data.updates.map((update) => ({ id: `update-${update.id}`, label: 'Đã thêm cập nhật xu hướng', detail: update.subject_name, date: update.created_at, href: `/research?projectId=${encodeURIComponent(projectId)}&view=data#project-trend-updates` })),
      ...data.savedInformation.map((item) => ({ id: `saved-${item.id}`, label: 'Đã lưu thông tin', detail: item.subject_name || item.source_title || item.original_content.slice(0, 100), date: item.created_at, href: `/research?projectId=${encodeURIComponent(projectId)}&view=data#project-saved-information` })),
      ...(data.opportunityWorkspace?.candidates ?? []).filter((candidate) => candidate.decision).map((candidate) => ({ id: `decision-${candidate.candidate_id}`, label: 'Đã lưu quyết định PO', detail: `${candidate.name} · ${decisionStatusLabel(candidate.decision?.decision_status)}`, date: candidate.decision?.updated_at ?? '', href: opportunityDecisionHref(projectId, candidate) })),
    ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5);
  }, [data, projectId]);

  if (loading) return <section className="project-home-state" role="status">Đang mở dự án…</section>;
  if (error || !data) return <section className="project-home-state" role="alert"><strong>Không mở được dự án này.</strong><p>{error || 'Dự án có thể đã được di chuyển hoặc xóa.'}</p><button className="secondary-action" type="button" onClick={() => window.location.reload()}>Thử lại</button><a className="text-button" href="/research">Về danh sách dự án</a></section>;

  const { project, reports, collections, subjects, updates, savedInformation, datasets, opportunityWorkspace } = data;
  const hasWork = reports.length > 0 || datasets.length > 0 || collections.length > 0 || subjects.length > 0 || updates.length > 0 || savedInformation.length > 0 || Boolean(opportunityWorkspace?.candidates.length);
  const home = `/research?projectId=${encodeURIComponent(projectId)}`;
  const deepResearch = `${home}&view=plan`;
  const saveInformation = `${home}&view=data#project-saved-information`;
  const csvImport = `${home}&view=data&action=import-csv#project-csv-data`;
  const savedDecisions = (opportunityWorkspace?.candidates ?? []).filter((candidate) => candidate.decision).slice(0, 4);

  return <div className="project-home">
    <header className="project-home-header">
      <div><a className="project-home-back" href="/research">← Tất cả dự án</a><p className="project-home-eyebrow">DỰ ÁN NGHIÊN CỨU</p><h2>{project.name}</h2>
        <p className="project-home-description">{project.category || 'Không gian nghiên cứu'}{project.owner ? ` · ${project.owner}` : ''}</p></div>
      <a className="project-home-secondary" href={`/reports?projectId=${encodeURIComponent(projectId)}`}>Xem báo cáo dự án <span aria-hidden="true">→</span></a>
    </header>

    {!hasWork && <section className="project-home-welcome"><div><span className="project-home-kicker">BẮT ĐẦU TẠI ĐÂY</span><h3>Bắt đầu nghiên cứu</h3><p>Hãy chọn một việc cần làm. Mọi báo cáo và cập nhật sẽ được lưu chung trong dự án.</p></div></section>}

    <section className="project-home-actions" aria-labelledby="project-home-actions-title">
      <div className="project-home-section-heading"><div><span className="project-home-kicker">HÀNH ĐỘNG</span><h3 id="project-home-actions-title">Bạn muốn thực hiện gì?</h3></div></div>
      <div className="project-home-action-grid">
        <a className="project-home-action project-home-action-primary" href={deepResearch}><span className="project-home-action-mark" aria-hidden="true"><ResultsIcon name="search" /></span><span><strong>Nghiên cứu chuyên sâu</strong><small>Đặt câu hỏi, tạo yêu cầu ChatGPT và lưu kết quả</small></span><span className="project-home-arrow" aria-hidden="true">→</span></a>
        <a className="project-home-action" href={saveInformation}><span className="project-home-action-mark peach" aria-hidden="true"><ResultsIcon name="runs" /></span><span><strong>Lưu thông tin</strong><small>Lưu quan sát, bản tin, đường dẫn hoặc ảnh vào dự án</small></span><span className="project-home-arrow" aria-hidden="true">→</span></a>
        <a className="project-home-action" href={csvImport}><span className="project-home-action-mark lilac" aria-hidden="true"><ResultsIcon name="metric" /></span><span><strong>Phân tích CSV</strong><small>Xem dữ liệu sản phẩm và chọn mục cần nghiên cứu tiếp</small></span><span className="project-home-arrow" aria-hidden="true">→</span></a>
      </div>
    </section>

    <div className="project-home-content-grid">
      <section className="project-home-section project-home-reports" aria-labelledby="project-reports-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">ĐÃ NGHIÊN CỨU</span><h3 id="project-reports-title">Báo cáo nghiên cứu</h3></div><a href={`/reports?projectId=${encodeURIComponent(projectId)}`}>Xem tất cả <span aria-hidden="true">→</span></a></div>
        {reports.length === 0 ? <div className="project-home-empty"><strong>Chưa có báo cáo trong dự án</strong><p>Dán kết quả ChatGPT để lưu và đọc báo cáo tại đây.</p><a href={`/?projectId=${encodeURIComponent(projectId)}`}>Nhập báo cáo ChatGPT →</a></div> : <div className="project-home-report-list">{reports.slice(0, 5).map((report) => <a className="project-home-report" href={`/reports/${encodeURIComponent(report.id)}`} key={report.id}><span className="project-home-file-mark" aria-hidden="true"><ResultsIcon name="reports" /></span><span className="project-home-row-copy"><strong>{reportTitle(report)}</strong><small>{[reportScopeLabel(report.geo, 'geo'), reportScopeLabel(report.os, 'environment'), report.research_period].filter(Boolean).join(' · ')}</small></span><span className="project-home-date">{dateLabel(report.imported_at)}</span><span className="project-home-arrow" aria-hidden="true">›</span></a>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-activity-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">HOẠT ĐỘNG</span><h3 id="project-activity-title">Cập nhật gần đây</h3></div></div>
        {activity.length === 0 ? <div className="project-home-empty"><p>Các báo cáo và cập nhật đã lưu sẽ xuất hiện ở đây.</p></div> : <div className="project-home-activity">{activity.map((item) => <a href={item.href} className="project-home-activity-row" key={item.id}><span className="project-home-activity-dot" aria-hidden="true" /><span className="project-home-row-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><time>{dateLabel(item.date)}</time></a>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-collections-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">SO SÁNH</span><h3 id="project-collections-title">Bộ so sánh</h3></div><a href={`${home}&view=data#project-benchmark-collections`}>Mở không gian so sánh <span aria-hidden="true">→</span></a></div>
        {collections.length === 0 ? <div className="project-home-empty"><p>Những nhóm sản phẩm dùng để so sánh sẽ xuất hiện ở đây.</p></div> : <div className="project-home-compact-list">{collections.slice(0, 4).map((collection) => <a className="project-home-compact-row project-home-dataset" href={`${home}&view=data&collectionId=${encodeURIComponent(collection.id)}#project-benchmark-collections`} aria-label={`Mở bộ so sánh ${collection.name}`} key={collection.id}><span className="project-home-collection-mark" aria-hidden="true"><ResultsIcon name="comparison" /></span><span className="project-home-row-copy"><strong>{collection.name}</strong><small>{collection.members.length} hồ sơ trong bộ so sánh</small></span><span className="project-home-arrow" aria-hidden="true">›</span></a>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-subjects-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">ĐỐI TƯỢNG NGHIÊN CỨU</span><h3 id="project-subjects-title">Sản phẩm và chủ đề</h3></div><a href={saveInformation}>Lưu thông tin mới <span aria-hidden="true">→</span></a></div>
        {subjects.length === 0 ? <div className="project-home-empty"><p>Sản phẩm và chủ đề sẽ xuất hiện khi bạn chủ động liên kết chúng với nghiên cứu đã lưu.</p></div> : <div className="project-home-subject-list">{subjects.slice(0, 6).map((subject) => <a className="project-home-subject" href={`${home}&view=data&subjectId=${encodeURIComponent(subject.id)}#project-subject-profiles`} aria-label={`Mở hồ sơ ${subject.name}`} key={subject.id}>{subject.name}<span aria-hidden="true"> →</span></a>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-data-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">DỮ LIỆU ĐÃ CÓ</span><h3 id="project-data-title">Dữ liệu và phân tích</h3></div><a href={csvImport}>Phân tích dữ liệu <span aria-hidden="true">→</span></a></div>
        {datasets.length === 0 ? <div className="project-home-empty"><p>Các tệp dữ liệu CSV của dự án sẽ xuất hiện ở đây.</p></div> : <div className="project-home-compact-list">{datasets.slice(0, 4).map((dataset) => <a className="project-home-compact-row project-home-dataset" href={`${home}&view=data&datasetId=${encodeURIComponent(dataset.id)}#project-csv-data`} aria-label={`Mở số liệu từ ${dataset.filename}`} key={dataset.id}><span className="project-home-collection-mark" aria-hidden="true"><ResultsIcon name="metric" /></span><span className="project-home-row-copy"><strong>{dataset.filename}</strong><small>{dataset.source_apps} sản phẩm · {dataset.metrics.length} chỉ số · {datasetReadinessLabel(dataset.compatibility_status)}</small></span><span className="project-home-arrow" aria-hidden="true">›</span></a>)}</div>}
        {opportunityWorkspace?.shortlist_dataset_id && <p className="project-home-data-note">Đã có phân tích sản phẩm được lưu để xem lại.</p>}
      </section>

      <section className="project-home-next-step project-home-decision-step" aria-labelledby="project-home-decisions-title">
        <div><span className="project-home-kicker">QUYẾT ĐỊNH PO</span><h3 id="project-home-decisions-title">Các quyết định đã lưu</h3><p>Xem và tiếp tục đánh giá từ báo cáo, sản phẩm hoặc cập nhật đã chọn.</p></div>
        {savedDecisions.length ? <div className="project-home-decision-list">{savedDecisions.map((candidate) => <a className="project-home-decision-row" href={opportunityDecisionHref(projectId, candidate)} key={candidate.candidate_id}><span className="project-home-row-copy"><strong>{candidate.name}</strong><small>{decisionStatusLabel(candidate.decision?.decision_status)}{candidate.decision?.next_action ? ` · ${candidate.decision.next_action}` : ''}</small></span><span className="project-home-arrow" aria-hidden="true">›</span></a>)}</div> : <p className="project-home-decision-empty">Chưa có đánh giá nào được lưu.</p>}
        <a className="project-home-next-button" href={`${home}&view=opportunities`}>Mở danh sách quyết định <span aria-hidden="true">→</span></a>
      </section>
    </div>

    {reports.length > 0 && <section className="project-home-next-step"><div><span className="project-home-kicker">GỢI Ý TIẾP THEO</span><h3>Tiếp tục báo cáo gần nhất</h3><p>Đọc báo cáo và xem lại phát hiện, bằng chứng và quyết định.</p></div><a className="project-home-next-button" href={`/reports/${encodeURIComponent(reports[0].id)}`}>Mở báo cáo mới nhất <span aria-hidden="true">→</span></a></section>}
  </div>;
}
