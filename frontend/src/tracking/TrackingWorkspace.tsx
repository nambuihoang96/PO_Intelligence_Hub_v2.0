import { useEffect, useState } from 'react';
import { researchApi, type ResearchProject, type OpportunityWorkspace } from '../research/api';
import { ProjectJourneyNav } from '../research/ProjectJourneyNav';
import { opportunityDecisionHref } from '../research/decisionNavigation';
import './TrackingWorkspace.css';

const decisions: Record<string,string> = {
  investigate: 'Cần nghiên cứu thêm',
  benchmark: 'Đưa vào so sánh',
  experiment: 'Cần thử nghiệm',
  implementation_candidate: 'Đề xuất triển khai',
  hold: 'Tạm hoãn',
  reject: 'Không tiếp tục',
};

function todayLocalDateKey(): string {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
}

function reviewState(reviewDate: string | null | undefined, today: string): string {
  if (!reviewDate) return 'Chưa đặt ngày xem lại';
  if (reviewDate < today) return 'Quá ngày dự kiến xem lại';
  if (reviewDate === today) return 'Đến ngày xem lại';
  return 'Đã lên lịch xem lại';
}

export function TrackingWorkspace({ projectId }: { projectId: string | null }) {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [workspace, setWorkspace] = useState<OpportunityWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setWorkspace(null);
    const load = async () => {
      if (projectId) {
        const value = await researchApi.getProject(projectId);
        if (!current) return;
        setProject(value);
        try {
          const saved = await researchApi.getOpportunities(projectId);
          if (current) setWorkspace(saved);
        } catch (cause) {
          if (current) setError(cause instanceof Error ? cause.message : 'Chưa tải được các quyết định đã lưu.');
        }
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

  if (projectId) {
    const saved = (workspace?.candidates ?? []).filter((item) => item.decision !== null);
    const today = todayLocalDateKey();
    const due = saved.filter((item) => item.decision?.review_date && item.decision.review_date <= today);
    const withNextAction = saved.filter((item) => Boolean(item.decision?.next_action.trim()));
    const ordered = [...saved].sort((left, right) => {
      const leftDate = left.decision?.review_date ?? '9999-12-31';
      const rightDate = right.decision?.review_date ?? '9999-12-31';
      return leftDate.localeCompare(rightDate);
    });
    return <div className="tracking-workspace">
      <ProjectJourneyNav projectId={projectId} active="tracking" />
      <section className="research-panel">
        <div className="panel-heading"><div><span className="state-label">THEO DÕI QUYẾT ĐỊNH ĐÃ LƯU</span><h2>{project?.name ?? 'Dự án nghiên cứu'}</h2></div>
          <a className="primary-action" href={`/research?projectId=${encodeURIComponent(projectId)}&view=opportunities`}>Xem và cập nhật quyết định →</a></div>
        <p>Đây là các quyết định do PO lưu, không phải mọi ứng viên tự sinh từ báo cáo. Bước tiếp theo, mức ưu tiên và ngày dự kiến xem lại hiện do PO cập nhật. So sánh thay đổi và cảnh báo tự động chưa được triển khai.</p>
        {!loading && !error && <div className="tracking-stats" aria-label="Tóm tắt theo dõi">
          <div><strong>{saved.length}</strong><span>Quyết định đã lưu</span></div>
          <div><strong>{due.length}</strong><span>Đến hạn hoặc quá hạn xem lại</span></div>
          <div><strong>{withNextAction.length}</strong><span>Có việc tiếp theo</span></div>
        </div>}
        {error && <div className="research-alert" role="alert">{error}</div>}
        {loading && <p role="status">Đang tải hoạt động nghiên cứu…</p>}
        {!loading && !error && saved.length === 0 && <div className="tracking-empty">
          <h3>Chưa có quyết định PO nào được lưu trong dự án này.</h3>
          <p>Vào phần Đánh giá &amp; quyết định, chọn một ứng viên nghiên cứu và lưu quyết định. Mục đã lưu sẽ xuất hiện tại đây.</p>
          <a className="secondary-action" href={`/research?projectId=${encodeURIComponent(projectId)}&view=opportunities`}>Mở danh sách ứng viên →</a>
        </div>}
        {!loading && !error && saved.length > 0 && <div className="tracking-project-list tracking-decision-list">
          {ordered.map((item) => {
            const decision = item.decision!;
            const status = decision.decision_status ? decisions[decision.decision_status] ?? decision.decision_status : 'Đã lưu · chưa chọn trạng thái';
            const state = reviewState(decision.review_date, today);
            const needsReview = Boolean(decision.review_date && decision.review_date <= today);
            return <article key={item.candidate_id} className={needsReview ? 'tracking-decision-due' : ''}>
              <div>
                <div className="tracking-decision-heading"><strong>{item.name}</strong><span className={needsReview ? 'tracking-due-pill' : 'tracking-scheduled-pill'}>{state}</span></div>
                <small>Quyết định PO: {status}{decision.updated_at ? ` · Cập nhật ${new Date(decision.updated_at).toLocaleDateString('vi-VN')}` : ''}</small>
                {decision.rationale && <p>{decision.rationale}</p>}
                {decision.next_action ? <p><strong>Bước tiếp theo:</strong> {decision.next_action}</p> : <p className="tracking-muted">Chưa ghi việc tiếp theo.</p>}
                {decision.review_date && <small>Ngày dự kiến xem lại: {decision.review_date}</small>}
                {item.decision_target?.report_id && <p><a href={`/reports/${encodeURIComponent(item.decision_target.report_id)}`}>Mở báo cáo nguồn →</a></p>}
                {item.stale && <small className="tracking-stale">Nguồn liên kết đã thay đổi hoặc không còn khả dụng — cần rà soát thủ công.</small>}
              </div>
              <a className="secondary-action" href={opportunityDecisionHref(projectId, item)}>Mở quyết định →</a>
            </article>;
          })}
        </div>}
      </section>
    </div>;
  }

  return <div className="tracking-workspace"><section className="research-panel">
    <div className="panel-heading"><div><span className="state-label">THEO DÕI</span><h2>Chọn dự án cần theo dõi</h2></div></div>
    <p>Các quyết định đã lưu nằm trong dự án tương ứng. Hiện chưa có cảnh báo tự động.</p>
    {error && <div className="research-alert" role="alert">{error}</div>}
    {loading ? <p className="state-message" role="status">Đang tải dự án…</p> : projects.length === 0 ? <p>Chưa có dự án. <a href="/research/new">Tạo dự án mới</a></p> : <div className="tracking-project-list">
      {projects.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{item.category || 'Dự án nghiên cứu'}</small></div>
      <a className="secondary-action" href={`/tracking?projectId=${encodeURIComponent(item.id)}`}>Xem theo dõi →</a></article>)}
    </div>}
  </section></div>;
}
