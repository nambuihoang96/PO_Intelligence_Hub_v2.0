import { useEffect, useState } from 'react';
import { researchApi, type ResearchProject } from '../research/api';
import { ProjectJourneyNav } from '../research/ProjectJourneyNav';

export function TrackingWorkspace({ projectId }: { projectId: string | null }) {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setLoading(true);
    const load = projectId ? researchApi.getProject(projectId).then((value) => { if (current) setProject(value); }) : (async () => {
      const all: ResearchProject[] = [];
      let cursor: string | undefined;
      do {
        const page = await researchApi.listProjects(cursor);
        all.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      if (current) setProjects(all);
    })();
    load.catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'Could not load tracking workspace.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [projectId]);

  if (projectId && project) return <div className="tracking-workspace">
    <ProjectJourneyNav projectId={project.id} active="tracking" />
    <section className="research-panel tracking-pending"><span className="tracking-status">Tracking setup pending</span><h2>{project.name}</h2>
      <p>This workspace does not yet monitor new reports or calculate changes automatically. Saved research and PO decisions remain available in their project sections.</p>
      <div className="tracking-actions"><a className="secondary-action" href={`/reports?projectId=${encodeURIComponent(project.id)}`}>Review this project’s reports</a><a className="primary-action" href={`/research?projectId=${encodeURIComponent(project.id)}&view=opportunities`}>Review PO decisions</a></div>
    </section>
  </div>;

  return <div className="tracking-workspace">
    <section className="research-panel tracking-pending"><span className="tracking-status">Tracking setup pending</span><h2>Project follow-up</h2><p>Tracking is not configured yet. There are no automatic updates, trend comparisons, or change alerts on this page.</p></section>
    {error && <div className="research-alert" role="alert">{error}</div>}
    {loading ? <p className="state-message" role="status">Loading projects…</p> : projects.length === 0 ? <section className="research-panel"><h3>No projects to follow up yet</h3><a className="primary-action" href="/research/new">Start a research project</a></section> : <section className="research-panel"><div className="panel-heading"><div><span className="state-label">SAVED WORKSPACES</span><h2>Choose a project</h2></div></div><div className="tracking-project-list">{projects.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{item.category || 'Research project'}{item.updated_at ? ` · Updated ${new Date(item.updated_at).toLocaleDateString()}` : ''}</small></div><a className="secondary-action" href={`/tracking?projectId=${encodeURIComponent(item.id)}`}>Open tracking status</a></article>)}</div></section>}
  </div>;
}
