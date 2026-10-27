import { useEffect, useMemo, useState } from 'react';
import { reportApi, type ComparisonDataset, type ReportSummary } from '../reports/api';
import { researchApi, type OpportunityWorkspace, type ProjectSavedInformation, type ProjectTrendUpdate, type ResearchBenchmarkCollection, type ResearchProject, type ResearchSubject } from './api';
import { ResultsIcon } from '../ui/ResultsIcon';
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

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa có ngày' : date.toLocaleDateString();
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
      ...data.updates.map((update) => ({ id: `update-${update.id}`, label: 'Đã thêm cập nhật xu hướng', detail: update.subject_name, date: update.created_at, href: `/research?projectId=${encodeURIComponent(projectId)}&view=data#project-trend-updates` })),
      ...data.savedInformation.map((item) => ({ id: `saved-${item.id}`, label: 'Đã lưu thông tin', detail: item.subject_name || item.source_title || item.original_content.slice(0, 100), date: item.created_at, href: `/research?projectId=${encodeURIComponent(projectId)}&view=data#project-saved-information` })),
    ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5);
  }, [data, projectId]);

  if (loading) return <section className="project-home-state" role="status">Đang mở dự án…</section>;
  if (error || !data) return <section className="project-home-state" role="alert"><strong>Không mở được dự án này.</strong><p>{error || 'Dự án có thể đã được di chuyển hoặc xóa.'}</p><button className="secondary-action" type="button" onClick={() => window.location.reload()}>Thử lại</button><a className="text-button" href="/research">Về danh sách dự án</a></section>;

  const { project, reports, collections, subjects, updates, savedInformation, datasets, opportunityWorkspace } = data;
  const hasWork = reports.length > 0 || collections.length > 0 || subjects.length > 0 || updates.length > 0 || savedInformation.length > 0;
  const home = `/research?projectId=${encodeURIComponent(projectId)}`;
  const deepResearch = `${home}&view=plan`;
  const saveInformation = `${home}&view=data#project-saved-information`;
  const csvImport = `${home}&view=data&action=import-csv#project-csv-data`;

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
        <a className="project-home-action" href={saveInformation}><span className="project-home-action-mark peach" aria-hidden="true"><ResultsIcon name="runs" /></span><span><strong>Lưu thông tin mới</strong><small>Dán bản tin, ghi chú, đường dẫn hoặc hình ảnh</small></span><span className="project-home-arrow" aria-hidden="true">→</span></a>
        <a className="project-home-action" href={csvImport}><span className="project-home-action-mark lilac" aria-hidden="true"><ResultsIcon name="metric" /></span><span><strong>Phân tích dữ liệu</strong><small>Nhập CSV, xem chỉ số và so sánh sản phẩm</small></span><span className="project-home-arrow" aria-hidden="true">→</span></a>
      </div>
    </section>

    <div className="project-home-content-grid">
      <section className="project-home-section project-home-reports" aria-labelledby="project-reports-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">ĐÃ NGHIÊN CỨU</span><h3 id="project-reports-title">Báo cáo nghiên cứu</h3></div><a href={`/reports?projectId=${encodeURIComponent(projectId)}`}>Xem tất cả <span aria-hidden="true">→</span></a></div>
        {reports.length === 0 ? <div className="project-home-empty"><strong>Chưa có báo cáo trong dự án</strong><p>Dán kết quả ChatGPT để lưu và đọc báo cáo tại đây.</p><a href={`/?projectId=${encodeURIComponent(projectId)}`}>Nhập báo cáo ChatGPT →</a></div> : <div className="project-home-report-list">{reports.slice(0, 5).map((report) => <a className="project-home-report" href={`/reports/${encodeURIComponent(report.id)}`} key={report.id}><span className="project-home-file-mark" aria-hidden="true"><ResultsIcon name="reports" /></span><span className="project-home-row-copy"><strong>{reportTitle(report)}</strong><small>{[report.geo, report.os, report.research_period].filter(Boolean).join(' · ') || 'Báo cáo nghiên cứu'}</small></span><span className="project-home-date">{dateLabel(report.imported_at)}</span><span className="project-home-arrow" aria-hidden="true">›</span></a>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-activity-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">HOẠT ĐỘNG</span><h3 id="project-activity-title">Cập nhật gần đây</h3></div></div>
        {activity.length === 0 ? <div className="project-home-empty"><p>Các báo cáo và cập nhật đã lưu sẽ xuất hiện ở đây.</p></div> : <div className="project-home-activity">{activity.map((item) => <a href={item.href} className="project-home-activity-row" key={item.id}><span className="project-home-activity-dot" aria-hidden="true" /><span className="project-home-row-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><time>{dateLabel(item.date)}</time></a>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-collections-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">SO SÁNH</span><h3 id="project-collections-title">Bộ so sánh</h3></div><a href={`${home}&view=data#workspace-reports`}>Mở không gian nghiên cứu <span aria-hidden="true">→</span></a></div>
        {collections.length === 0 ? <div className="project-home-empty"><p>Những nhóm sản phẩm dùng để so sánh sẽ xuất hiện ở đây.</p></div> : <div className="project-home-compact-list">{collections.slice(0, 4).map((collection) => <div className="project-home-compact-row" key={collection.id}><span className="project-home-collection-mark" aria-hidden="true"><ResultsIcon name="comparison" /></span><span className="project-home-row-copy"><strong>{collection.name}</strong><small>{collection.members.length} {collection.members.length === 1 ? 'sản phẩm hoặc chủ đề' : 'sản phẩm hoặc chủ đề'}</small></span><span className="project-home-arrow" aria-hidden="true">›</span></div>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-subjects-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">ĐỐI TƯỢNG NGHIÊN CỨU</span><h3 id="project-subjects-title">Sản phẩm và chủ đề</h3></div><a href={saveInformation}>Lưu thông tin mới <span aria-hidden="true">→</span></a></div>
        {subjects.length === 0 ? <div className="project-home-empty"><p>Sản phẩm và chủ đề appear when you choose to connect them to saved research.</p></div> : <div className="project-home-subject-list">{subjects.slice(0, 6).map((subject) => <span className="project-home-subject" key={subject.id}>{subject.name}</span>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-data-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">DỮ LIỆU ĐÃ CÓ</span><h3 id="project-data-title">Dữ liệu và phân tích</h3></div><a href={csvImport}>Phân tích dữ liệu <span aria-hidden="true">→</span></a></div>
        {datasets.length === 0 ? <div className="project-home-empty"><p>Các tệp dữ liệu CSV của dự án sẽ xuất hiện ở đây.</p></div> : <div className="project-home-compact-list">{datasets.slice(0, 4).map((dataset) => <div className="project-home-compact-row" key={dataset.id}><span className="project-home-collection-mark" aria-hidden="true"><ResultsIcon name="metric" /></span><span className="project-home-row-copy"><strong>{dataset.filename}</strong><small>{dataset.source_apps} sản phẩm · {dataset.metrics.length} chỉ số · {dataset.compatibility_status}</small></span></div>)}</div>}
        {opportunityWorkspace?.shortlist_dataset_id && <p className="project-home-data-note">Đã có phân tích sản phẩm được lưu để xem lại.</p>}
      </section>

      <section className="project-home-next-step project-home-decision-step"><div><span className="project-home-kicker">QUYẾT ĐỊNH PO</span><h3>Các quyết định đã lưu</h3><p>Xem và tiếp tục các quyết định từ báo cáo, sản phẩm hoặc bản tin.</p></div><a className="project-home-next-button" href={`${home}&view=opportunities`}>Xem quyết định PO <span aria-hidden="true">→</span></a></section>
    </div>

    {reports.length > 0 && <section className="project-home-next-step"><div><span className="project-home-kicker">GỢI Ý TIẾP THEO</span><h3>Tiếp tục báo cáo gần nhất</h3><p>Đọc báo cáo và xem lại phát hiện, bằng chứng và quyết định.</p></div><a className="project-home-next-button" href={`/reports/${encodeURIComponent(reports[0].id)}`}>Mở báo cáo mới nhất <span aria-hidden="true">→</span></a></section>}
  </div>;
}
