import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, researchApi } from './api';
import type { ResearchPlan, ResearchPlanPayload, ResearchProject, ResearchRun } from './api';

type PlanForm = {
  question: string;
  geos: string;
  platforms: string;
  periodStart: string;
  periodEnd: string;
  comparisonStart: string;
  comparisonEnd: string;
  goals: string;
  keywords: string;
  sources: string;
};

const emptyPlan: PlanForm = {
  question: '', geos: '', platforms: '', periodStart: '', periodEnd: '',
  comparisonStart: '', comparisonEnd: '', goals: '', keywords: '', sources: '',
};

function listValue(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function planToForm(plan: ResearchPlan | null): PlanForm {
  if (!plan) return emptyPlan;
  return {
    question: plan.question,
    geos: plan.geos.join(', '),
    platforms: plan.platforms.join(', '),
    periodStart: plan.period_start ?? '',
    periodEnd: plan.period_end ?? '',
    comparisonStart: plan.comparison_period_start ?? '',
    comparisonEnd: plan.comparison_period_end ?? '',
    goals: plan.goals.join(', '),
    keywords: plan.keywords.join(', '),
    sources: Array.isArray(plan.source_policy.requested_sources)
      ? plan.source_policy.requested_sources.filter((item): item is string => typeof item === 'string').join(', ')
      : '',
  };
}

function toPayload(form: PlanForm, sourcePolicy: Record<string, unknown> = {}): ResearchPlanPayload {
  return {
    question: form.question.trim(),
    geos: listValue(form.geos),
    platforms: listValue(form.platforms),
    period_start: form.periodStart || null,
    period_end: form.periodEnd || null,
    comparison_period_start: form.comparisonStart || null,
    comparison_period_end: form.comparisonEnd || null,
    goals: listValue(form.goals),
    keywords: listValue(form.keywords),
    source_policy: { ...sourcePolicy, requested_sources: listValue(form.sources) },
  };
}

function validationMessages(error: ApiError): string[] {
  const errors = error.details.errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((item) => {
    if (!item || typeof item !== 'object') return 'Review the research plan values.';
    const detail = item as { location?: unknown[]; message?: string };
    const field = detail.location?.slice(-1)[0];
    return `${typeof field === 'string' ? `${field}: ` : ''}${detail.message ?? 'Invalid value.'}`;
  });
}

function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const messages = validationMessages(error);
  return (
    <div className="research-alert" role="alert">
      <div><strong>{error.code === 'STALE_PLAN_VERSION' ? 'This plan changed in another view.' : error.message}</strong>
        {messages.length > 0 && <ul>{messages.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul>}
      </div>
      {onRetry && <button className="text-button" type="button" onClick={onRetry}>Reload project</button>}
    </div>
  );
}

function ProjectList({
  projects, nextCursor, onLoadMore, loading, error, onRetry,
}: {
  projects: ResearchProject[];
  nextCursor: string | null;
  onLoadMore: () => void;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
}) {
  return (
    <div className="research-layout">
      <section className="research-panel" aria-labelledby="projects-title">
        <div className="panel-heading"><div><span className="state-label">PROJECTS</span><h2 id="projects-title">Your research projects</h2></div>
          <a className="primary-action" href="/research/new">New project <span aria-hidden="true">＋</span></a>
        </div>
        {error && <ErrorNotice error={error} onRetry={onRetry} />}
        {loading ? <p className="state-message" role="status">Loading projects…</p> : projects.length === 0 && !error ? (
          <div className="research-empty"><span aria-hidden="true">⌕</span><strong>No projects yet</strong><p>Create a project to begin drafting a research plan.</p><a className="secondary-action" href="/research/new">Set up a project</a></div>
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <a className="project-row" href={`/research?projectId=${encodeURIComponent(project.id)}`} key={project.id}>
                <span className="project-mark" aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>
                <span className="project-row-copy"><strong>{project.name}</strong><small>{project.category || 'Uncategorized'}{project.owner ? ` · ${project.owner}` : ''}</small></span>
                <span className="row-arrow" aria-hidden="true">→</span>
              </a>
            ))}
            {nextCursor && <button className="secondary-action load-more" type="button" onClick={onLoadMore}>Load more projects</button>}
          </div>
        )}
      </section>
      <aside className="research-side-note"><strong>Plans stay versioned</strong><p>Saving an edit creates a new plan version. Existing runs keep their original plan reference.</p><span>Comparison periods are optional.</span></aside>
    </div>
  );
}

function NewProjectForm() {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const project = await researchApi.createProject({
        name: name.trim(), owner: owner.trim() || null, category: category.trim() || null,
      });
      window.location.assign(`/research?projectId=${encodeURIComponent(project.id)}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('The project could not be created.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="research-layout">
      <form className="research-panel research-form" onSubmit={submit}>
        <div className="panel-heading"><div><span className="state-label">STEP 1 OF 2</span><h2>Create a research project</h2></div></div>
        <p className="form-intro">First name the project. You can draft its research plan on the next screen.</p>
        {error && <ErrorNotice error={error} />}
        <label className="field-label" htmlFor="project-name">Project name <span>Required</span></label>
        <input id="project-name" autoComplete="off" maxLength={200} required value={name} onChange={(event) => setName(event.target.value)} placeholder="For example, Cozy puzzle market scan" />
        <div className="field-grid">
          <div><label className="field-label" htmlFor="project-owner">Owner <span>Optional</span></label><input id="project-owner" maxLength={200} value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Person or team" /></div>
          <div><label className="field-label" htmlFor="project-category">Category <span>Optional</span></label><input id="project-category" maxLength={120} value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Games, productivity…" /></div>
        </div>
        <div className="form-actions"><a className="secondary-action" href="/research">Cancel</a><button className="primary-action" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create project and continue'}</button></div>
      </form>
      <aside className="research-side-note"><strong>No research starts automatically</strong><p>Creating a project does not start a research run or connect a source.</p><span>Project and plan setup only.</span></aside>
    </div>
  );
}

function PlanEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [plans, setPlans] = useState<ResearchPlan[]>([]);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [runPlanVersion, setRunPlanVersion] = useState('');
  const [creatingRun, setCreatingRun] = useState(false);
  const [runNotice, setRunNotice] = useState('');
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyPlan);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState('');

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [loadedProject, loadedPlans, loadedRuns] = await Promise.all([
        researchApi.getProject(projectId), researchApi.getPlans(projectId), researchApi.getRuns(projectId),
      ]);
      setProject(loadedProject);
      setPlans(loadedPlans);
      setRuns(loadedRuns);
      setRunPlanVersion((current) => current || String(loadedPlans.at(-1)?.version ?? ''));
      setViewVersion(loadedPlans.at(-1)?.version ?? null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('The project could not be loaded.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [projectId]);

  const latestPlan = plans.at(-1) ?? null;
  const activePlan = useMemo(() => plans.find((plan) => plan.version === viewVersion) ?? latestPlan, [plans, viewVersion, latestPlan]);
  const readOnly = activePlan !== null && latestPlan !== null && activePlan.version < latestPlan.version;

  useEffect(() => { setForm(planToForm(activePlan)); }, [activePlan]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const payload = toPayload(form, latestPlan?.source_policy ?? {});
      const saved = latestPlan
        ? await researchApi.revisePlan(projectId, latestPlan.version, payload)
        : await researchApi.createPlan(projectId, payload);
      await reload();
      setViewVersion(saved.version);
      setNotice(`Plan version ${saved.version} saved.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('The research plan could not be saved.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setBusy(false);
    }
  }

  async function createRun() {
    const selectedVersion = Number(runPlanVersion);
    if (!Number.isInteger(selectedVersion) || selectedVersion < 1) return;
    setCreatingRun(true);
    setError(null);
    setRunNotice('');
    try {
      const run = await researchApi.createRun(projectId, selectedVersion);
      setRuns((current) => [run, ...current]);
      setRunNotice(`Run created with plan version ${run.plan_version}. Research does not run automatically.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('The research run could not be created.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setCreatingRun(false);
    }
  }

  function update(field: keyof PlanForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  if (loading) return <div className="research-panel"><p className="state-message" role="status">Loading project and plan…</p></div>;
  if (error && !project) return <div className="research-panel"><ErrorNotice error={error} onRetry={() => void reload()} /></div>;
  if (!project) return <div className="research-panel"><p className="state-message">Project not found.</p><a href="/research">Back to projects</a></div>;

  return (
    <div className="research-layout">
      <div className="research-main-column">
        <form className="research-panel research-form" onSubmit={save}>
          <div className="panel-heading"><div><span className="state-label">{latestPlan ? `PLAN VERSION ${activePlan?.version ?? latestPlan.version}` : 'INITIAL PLAN'}</span><h2>{project.name}</h2></div>
            <a className="text-button" href="/research">All projects</a>
          </div>
          {readOnly && <div className="read-only-note" role="status">This saved plan version is read-only. Editing the latest version will create a new version.</div>}
          {error && <ErrorNotice error={error} onRetry={() => void reload()} />}
          {notice && <div className="research-success" role="status">{notice}</div>}
          <label className="field-label" htmlFor="research-question">Research question <span>Required</span></label>
          <textarea id="research-question" rows={3} maxLength={5000} required disabled={readOnly} value={form.question} onChange={(event) => update('question', event.target.value)} placeholder="What do you need to understand about this market or product?" />
          <div className="field-grid">
            <div><label className="field-label" htmlFor="plan-geos">Geographies <span>Optional</span></label><input id="plan-geos" disabled={readOnly} value={form.geos} onChange={(event) => update('geos', event.target.value)} placeholder="US, GB, JP" /><small className="field-help">Comma-separated country codes or names.</small></div>
            <div><label className="field-label" htmlFor="plan-platforms">Platforms <span>Optional</span></label><input id="plan-platforms" disabled={readOnly} value={form.platforms} onChange={(event) => update('platforms', event.target.value)} placeholder="ios, android" /><small className="field-help">Comma-separated platform identifiers.</small></div>
          </div>
          <fieldset className="period-fieldset">
            <legend>Primary period <span>Optional</span></legend>
            <div className="field-grid">
              <div><label className="field-label" htmlFor="period-start">Start date</label><input id="period-start" type="date" disabled={readOnly} value={form.periodStart} onChange={(event) => update('periodStart', event.target.value)} /></div>
              <div><label className="field-label" htmlFor="period-end">End date</label><input id="period-end" type="date" disabled={readOnly} value={form.periodEnd} onChange={(event) => update('periodEnd', event.target.value)} /></div>
            </div>
          </fieldset>
          <fieldset className="period-fieldset comparison-fieldset">
            <legend>Comparison period <span>Optional</span></legend>
            <p className="field-help">Leave both dates blank if you do not need a comparison.</p>
            <div className="field-grid">
              <div><label className="field-label" htmlFor="comparison-start">Start date</label><input id="comparison-start" type="date" disabled={readOnly} value={form.comparisonStart} onChange={(event) => update('comparisonStart', event.target.value)} /></div>
              <div><label className="field-label" htmlFor="comparison-end">End date</label><input id="comparison-end" type="date" disabled={readOnly} value={form.comparisonEnd} onChange={(event) => update('comparisonEnd', event.target.value)} /></div>
            </div>
          </fieldset>
          <div className="field-grid">
            <div><label className="field-label" htmlFor="plan-goals">Goals <span>Optional</span></label><textarea id="plan-goals" rows={2} disabled={readOnly} value={form.goals} onChange={(event) => update('goals', event.target.value)} placeholder="Understand positioning, identify unmet needs" /><small className="field-help">Separate entries with commas.</small></div>
            <div><label className="field-label" htmlFor="plan-keywords">Keywords <span>Optional</span></label><textarea id="plan-keywords" rows={2} disabled={readOnly} value={form.keywords} onChange={(event) => update('keywords', event.target.value)} placeholder="cozy puzzle, merge game" /><small className="field-help">Separate entries with commas.</small></div>
          </div>
          <div><label className="field-label" htmlFor="plan-sources">Sources to consider <span>Optional</span></label><textarea id="plan-sources" rows={2} disabled={readOnly} value={form.sources} onChange={(event) => update('sources', event.target.value)} placeholder="Apple App Store, Google Play" /><small className="field-help">Preferences only. No sources are connected or collected from this screen.</small></div>
          <div className="form-actions"><a className="secondary-action" href="/research">Back</a>{readOnly ? <button className="primary-action" type="button" onClick={() => setViewVersion(latestPlan?.version ?? null)}>Edit latest version</button> : <button className="primary-action" type="submit" disabled={busy}>{busy ? 'Saving…' : latestPlan ? 'Save as new version' : 'Save research plan'}</button>}</div>
        </form>
      </div>
      <aside className="research-side-note"><strong>Version history</strong>
        {plans.length === 0 ? <p>No plan has been saved yet.</p> : <div className="version-list">{[...plans].reverse().map((plan) => <button className={`version-item${plan.version === activePlan?.version ? ' selected' : ''}`} type="button" key={plan.id} onClick={() => setViewVersion(plan.version)}><span>Version {plan.version}</span><small>{new Date(plan.created_at).toLocaleDateString()}</small></button>)}</div>}
        <span>Saved versions remain available to research runs.</span>
      </aside>
      <section className="research-panel research-run-section" aria-labelledby="project-runs-title">
        <div className="panel-heading"><div><span className="state-label">RESEARCH SESSIONS</span><h2 id="project-runs-title">Runs for this project</h2></div><span className="manual-chip">MANUAL WORKFLOW</span></div>
        {error && <ErrorNotice error={error} onRetry={() => void reload()} />}
        {runNotice && <div className="research-success" role="status">{runNotice}</div>}
        <div className="run-create-controls">
          <label className="field-label" htmlFor="run-plan-version">Plan version for new run</label>
          <select id="run-plan-version" value={runPlanVersion} onChange={(event) => setRunPlanVersion(event.target.value)} disabled={!plans.length || creatingRun}>
            {plans.length === 0 && <option value="">Save a plan before creating a run</option>}
            {[...plans].reverse().map((plan) => <option value={plan.version} key={plan.id}>Version {plan.version} · {new Date(plan.created_at).toLocaleDateString()}</option>)}
          </select>
          <button type="button" className="primary-action" disabled={!plans.length || creatingRun || !runPlanVersion} onClick={() => void createRun()}>{creatingRun ? 'Creating…' : 'Create run'}</button>
        </div>
        {runs.length === 0 ? <p className="state-message">No runs yet. Creating a run records the selected plan version; no research is started automatically.</p> : <div className="research-run-list">
          {[...runs].sort((left, right) => right.created_at.localeCompare(left.created_at)).map((run) => <article className="research-run-row" key={run.id}>
            <div><strong>{run.state.replaceAll('_', ' ')}</strong><span>Plan version {run.plan_version} · {new Date(run.created_at).toLocaleString()}</span></div>
            <a className="text-button" href={`/research/runs?runId=${encodeURIComponent(run.id)}&projectId=${encodeURIComponent(projectId)}`}>View run →</a>
          </article>)}
        </div>}
      </section>
    </div>
  );
}

export function ResearchWorkspace({ mode }: { mode: 'list' | 'new' }) {
  const projectId = new URLSearchParams(window.location.search).get('projectId');
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function loadProjects(cursor?: string) {
    setLoading(true);
    setError(null);
    try {
      const page = await researchApi.listProjects(cursor);
      setProjects((current) => cursor ? [...current, ...page.items] : page.items);
      setNextCursor(page.next_cursor);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('Projects could not be loaded.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!projectId && mode === 'list') void loadProjects(); }, [projectId, mode]);

  if (projectId) return <PlanEditor projectId={projectId} />;
  if (mode === 'new') return <NewProjectForm />;
  return <ProjectList projects={projects} nextCursor={nextCursor} onLoadMore={() => void loadProjects(nextCursor ?? undefined)} loading={loading} error={error} onRetry={() => void loadProjects()} />;
}
