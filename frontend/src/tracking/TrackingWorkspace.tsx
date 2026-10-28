import { useEffect, useState } from 'react';
import { researchApi, type ResearchProject, type OpportunityWorkspace } from '../research/api';
import { ProjectJourneyNav } from '../research/ProjectJourneyNav';
import { opportunityDecisionHref } from '../research/decisionNavigation';

const decisions: Record<string,string> = {
  investigate: 'Cần nghiên cứu thêm',
  benchmark: 'Đưa vào so sánh',
  experiment: 'Cần thử nghiệm',
  implementation_candidate: 'Đề xuất triển khai',
  hold: 'Tạm hoãn',
  reject: 'Không tiếp tục',
};

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
    const saved = (workspace?.candidates ?? []).filter(item => item.decision !== null);
    return <div className="tracking-workspace">
      <ProjectJourneyNav projectId={projectId} active="tracking" />
      <section className="research-panel">
        <div className="panel-heading"><div><span className="state-label">THEO DÕI NGHIÊN CỨU</span><h2>{project?.name ?? 'Dự án nghiên cứu'}</h2></div>
          <a className="primary-action" href={`/research?projectId=${encodeURIComponent(projectId)}&view=opportunities`}>Xem và cập nhật quyết định →</a></div>
        <p>Các quyết định PO đã lưu được hiển thị ngay tại đây. So sánh thay đổi và cảnh báo tự động chưa được triển khai.</p>
        {error && <div className="research-alert" role="alert">{error}</div>}
        {loading && <p role="status">Đang tải hoạt động nghiên cứu…</p>}
        {!loading && !error && saved.length === 0 && <p>Chưa có quyết định PO nào được lưu trong dự án này.</p>}
        {!loading && !error && saved.length > 0 && <div className="tracking-project-list">
          {saved.map(item => {
            const decision = item.decision!;
            const status = decision.decision_status ? decisions[decision.decision_status] : 'Chưa chọn trạng thái';
            return <article key={item.candidate_id}>
              <div>
                <strong>{item.name}</strong>
                <small>Quyết định: {status}{decision.updated_at ? ` · Cập nhật ${new Date(decision.updated_at).toLocaleDateString('vi-VN')}` : ''}</small>
                {decision.rationale && <p>{decision.rationale}</p>}
                {decision.next_action && <p><strong>Bước tiếp theo:</strong> {decision.next_action}</p>}
                {decision.review_date && <small>Ngày dự kiến xem lại: {decision.review_date}</small>}
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
      {projects.map(item => <article key={item.id}><div><strong>{item.name}</strong><small>{item.category || 'Dự án nghiên cứu'}</small></div>
      <a className="secondary-action" href={`/tracking?projectId=${encodeURIComponent(item.id)}`}>Xem theo dõi →</a></article>)}
    </div>}
  </section></div>;
}
