import { useEffect, useState } from 'react';
import { researchApi, type ResearchPlan, type ResearchProject } from './api';
import { ProjectThemeToggle } from './ProjectThemeToggle';

export type ProjectJourneyStage = 'research' | 'report' | 'tracking';
export type TrackingWorkspaceView = 'tasks' | 'updates';

export function TrackingSectionNav({ projectId, active }: { projectId: string; active: TrackingWorkspaceView }) {
  const query = encodeURIComponent(projectId);
  const views: { id: TrackingWorkspaceView; label: string; href: string }[] = [
    { id: 'tasks', label: 'Việc cần làm', href: `/tracking?projectId=${query}` },
    { id: 'updates', label: 'Cập nhật từ báo cáo', href: `/report-updates?projectId=${query}` },
  ];
  return <nav className="tracking-section-nav" aria-label="Các phần theo dõi">{views.map((view) =>
    <a key={view.id} href={view.href} className={active === view.id ? 'active' : ''} aria-current={active === view.id ? 'page' : undefined}>{view.label}</a>)}
  </nav>;
}

export function ProjectJourneyNav({ projectId, active }: { projectId: string; active: ProjectJourneyStage | null }) {
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [plan, setPlan] = useState<ResearchPlan | null>(null);
  useEffect(() => {
    let current = true;
    const projectRequest = researchApi.getProject?.(projectId);
    projectRequest?.then((value) => { if (current) setProject(value); }).catch(() => undefined);
    const plansRequest = researchApi.getPlans?.(projectId);
    plansRequest?.then((plans) => { if (current) setPlan(plans.at(-1) ?? null); }).catch(() => undefined);
    return () => { current = false; };
  }, [projectId]);
  const query = encodeURIComponent(projectId);
  const steps: { id: ProjectJourneyStage; label: string; href: string }[] = [
    { id: 'research', label: 'Nghiên cứu', href: `/research?projectId=${query}` },
    { id: 'report', label: 'Báo cáo', href: `/reports?projectId=${query}` },
    { id: 'tracking', label: 'Theo dõi', href: `/tracking?projectId=${query}` },
  ];
  return <section className="project-journey" aria-label="Quy trình dự án">
    <a className="project-journey-brand" href="/research" aria-label="PO Hub — tất cả dự án"><span>PO</span><strong>PO Hub</strong></a>
    <div className="project-journey-heading"><div><span className="state-label">DỰ ÁN NGHIÊN CỨU</span><strong>{project?.name ?? 'Đang tải dự án…'}</strong>{plan?.question && <small className="project-objective">{plan.question}</small>}{plan && <small className="project-scope">{[(plan.geos ?? []).length ? plan.geos.join(', ') : null, (plan.platforms ?? []).length ? plan.platforms.join(', ') : null, plan.period_start && plan.period_end ? `${plan.period_start} – ${plan.period_end}` : null].filter(Boolean).join(' · ')}</small>}{project?.updated_at && <small>Cập nhật {new Date(project.updated_at).toLocaleDateString('vi-VN')}</small>}</div><a className="text-button" href="/research" >Tất cả dự án</a></div>
    <nav className="project-journey-steps" aria-label="Các phần của dự án">{steps.map((step, index) => <a key={step.id} href={step.href} className={active === step.id ? 'active' : ''} aria-current={active === step.id ? 'page' : undefined}><span>{index + 1}</span>{step.label}</a>)}</nav>
    <ProjectThemeToggle />
  </section>;
}
