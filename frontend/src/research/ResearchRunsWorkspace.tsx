import { useEffect, useState } from 'react';
import { ApiError, researchApi } from './api';
import type { ResearchPlan, ResearchProject, ResearchRun, ResearchRunWithProject } from './api';

function RunError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return <div className="research-alert" role="alert"><strong>{error.message}</strong><button type="button" className="text-button" onClick={onRetry}>Retry</button></div>;
}

function RunList({ projectId }: { projectId: string | null }) {
  const [runs, setRuns] = useState<ResearchRunWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      if (projectId) {
        const [project, projectRuns] = await Promise.all([researchApi.getProject(projectId), researchApi.getRuns(projectId)]);
        setRuns(projectRuns.map((run) => ({ ...run, project_name: project.name })));
      } else {
        setRuns(await researchApi.listAllRuns());
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('Research runs could not be loaded.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [projectId]);

  return <div className="research-layout research-run-page">
    <section className="research-panel" aria-labelledby="runs-title">
      <div className="panel-heading"><div><span className="state-label">RESEARCH SESSIONS</span><h2 id="runs-title">{projectId ? 'Runs for this project' : 'All research runs'}</h2></div><a className="text-button" href="/research">All projects</a></div>
      {error && <RunError error={error} onRetry={() => void reload()} />}
      {loading ? <p className="state-message" role="status">Loading research runs…</p> : runs.length === 0 && !error ? <div className="research-empty"><span aria-hidden="true">◷</span><strong>No research runs yet</strong><p>Save a research plan, then create a run from its project page.</p><a className="secondary-action" href="/research">Browse research projects</a></div> : <div className="research-run-list">
        {runs.map((run) => <article className="research-run-row" key={run.id}>
          <div><strong>{run.project_name}</strong><span>{run.state.replaceAll('_', ' ')} · Plan version {run.plan_version} · {new Date(run.created_at).toLocaleString()}</span></div>
          <a className="text-button" href={`/research/runs?runId=${encodeURIComponent(run.id)}&projectId=${encodeURIComponent(run.project_id)}`}>View run →</a>
        </article>)}
      </div>}
    </section>
    <aside className="research-side-note"><strong>Runs preserve their plan version</strong><p>Each session points to the exact saved plan version selected when it was created.</p><span>Run state is shown as stored by the API. This screen does not advance the state machine.</span></aside>
  </div>;
}

function RunDetail({ runId, requestedProjectId }: { runId: string; requestedProjectId: string | null }) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [plan, setPlan] = useState<ResearchPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const loadedRun = await researchApi.getRun(runId);
      if (requestedProjectId && loadedRun.project_id !== requestedProjectId) {
        throw new ApiError('This run does not belong to the requested project.', 404, 'RUN_NOT_FOUND', {});
      }
      const [loadedProject, plans] = await Promise.all([
        researchApi.getProject(loadedRun.project_id), researchApi.getPlans(loadedRun.project_id),
      ]);
      setRun(loadedRun);
      setProject(loadedProject);
      setPlan(plans.find((item) => item.id === loadedRun.plan_id && item.version === loadedRun.plan_version) ?? null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('The research run could not be loaded.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [runId, requestedProjectId]);

  if (loading) return <section className="research-panel"><p className="state-message" role="status">Loading research run…</p></section>;
  if (error) return <section className="research-panel"><RunError error={error} onRetry={() => void reload()} /></section>;
  if (!run || !project) return <section className="research-panel"><p className="state-message">Research run not found.</p><a href="/research/runs">Back to runs</a></section>;

  return <div className="research-layout research-run-page">
    <section className="research-panel run-detail-card">
      <div className="panel-heading"><div><span className="state-label">RESEARCH RUN</span><h2>{project.name}</h2></div><span className="run-state-chip">{run.state.replaceAll('_', ' ')}</span></div>
      <dl className="run-detail-fields">
        <div><dt>Plan version</dt><dd>{run.plan_version}</dd></div>
        <div><dt>Created</dt><dd>{new Date(run.created_at).toLocaleString()}</dd></div>
        <div><dt>Started</dt><dd>{run.started_at ? new Date(run.started_at).toLocaleString() : 'Not started'}</dd></div>
        <div><dt>Finished</dt><dd>{run.finished_at ? new Date(run.finished_at).toLocaleString() : 'Not finished'}</dd></div>
      </dl>
      <div className="run-plan-snapshot"><span className="state-label">LINKED PLAN VERSION {run.plan_version}</span><p>{plan?.question ?? 'The linked plan version is unavailable.'}</p></div>
      <div className="form-actions"><a className="secondary-action" href={`/research?projectId=${encodeURIComponent(project.id)}`}>Back to project</a><a className="primary-action" href={`/sources?runId=${encodeURIComponent(run.id)}`}>View or add evidence →</a></div>
    </section>
    <aside className="research-side-note"><strong>Manual research only</strong><p>Opening a run does not advance its state or perform research. Evidence remains attached to this run and its selected plan version.</p><span>Run ID: {run.id}</span></aside>
  </div>;
}

export function ResearchRunsWorkspace({ runId, projectId }: { runId: string | null; projectId: string | null }) {
  return runId ? <RunDetail runId={runId} requestedProjectId={projectId} /> : <RunList projectId={projectId} />;
}
