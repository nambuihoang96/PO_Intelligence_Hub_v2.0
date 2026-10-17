import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { researchApi } from '../research/api';
import type { ResearchRunWithProject } from '../research/api';
import { sourcesApi, type LicenseStatus, type ManualEvidence, type SourceRegistry } from './api';

const licenseOptions: { value: LicenseStatus; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'manual_only', label: 'Manual only' },
  { value: 'review_required', label: 'Review required' },
  { value: 'approved', label: 'Reviewed · approved' },
  { value: 'blocked', label: 'Blocked' },
];

function ErrorMessage({ children }: { children: string }) {
  return <div className="research-alert" role="alert"><strong>{children}</strong></div>;
}

export function SourcesWorkspace({ runId: routeRunId = null }: { runId?: string | null }) {
  const [sources, setSources] = useState<SourceRegistry[]>([]);
  const [sourcesCursor, setSourcesCursor] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingMoreSources, setLoadingMoreSources] = useState(false);
  const [runs, setRuns] = useState<ResearchRunWithProject[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState(routeRunId ?? '');
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [loadingMoreEvidence, setLoadingMoreEvidence] = useState(false);
  const [evidenceCursor, setEvidenceCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [savingSource, setSavingSource] = useState(false);
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [sourceSaved, setSourceSaved] = useState(false);
  const [evidenceSaved, setEvidenceSaved] = useState(false);
  const [evidence, setEvidence] = useState<ManualEvidence[]>([]);
  const [sourceId, setSourceId] = useState('');

  const loadSources = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMoreSources(true); else setLoadingSources(true);
    setError('');
    try {
      const page = await sourcesApi.listSources(cursor);
      setSources((current) => cursor ? [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))] : page.items);
      setSourcesCursor(page.next_cursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load source registry.');
    } finally {
      setLoadingSources(false);
      setLoadingMoreSources(false);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    setError('');
    try { setRuns(await researchApi.listAllRuns()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load research runs.'); }
    finally { setLoadingRuns(false); }
  }, []);

  const loadEvidence = useCallback(async (runId: string, cursor?: string) => {
    if (cursor) setLoadingMoreEvidence(true); else setLoadingEvidence(true);
    setError('');
    try {
      const page = await sourcesApi.listEvidence(runId, cursor);
      setEvidence((current) => cursor
        ? [...current, ...page.items.filter((item) => !current.some((existing) => existing.evidence.id === item.evidence.id))]
        : page.items);
      setEvidenceCursor(page.next_cursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load evidence for this run.');
    } finally {
      setLoadingEvidence(false);
      setLoadingMoreEvidence(false);
    }
  }, []);

  useEffect(() => { void loadSources(); void loadRuns(); }, [loadSources, loadRuns]);
  useEffect(() => {
    setEvidence([]);
    setEvidenceCursor(null);
    setEvidenceSaved(false);
    if (selectedRunId) void loadEvidence(selectedRunId);
  }, [selectedRunId, loadEvidence]);

  async function submitSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSavingSource(true); setError(''); setSourceSaved(false);
    try {
      await sourcesApi.createSource({
        name: String(form.get('name')),
        source_type: String(form.get('source_type')),
        url_domain: String(form.get('url_domain') || '') || undefined,
        license_status: String(form.get('license_status')) as LicenseStatus,
      });
      formElement.reset(); setSourceSaved(true); await loadSources();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add source.'); }
    finally { setSavingSource(false); }
  }

  async function updateLicense(source: SourceRegistry, license_status: LicenseStatus) {
    try {
      const updated = await sourcesApi.updateSource(source.id, { license_status });
      setSources((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update license status.'); }
  }

  async function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRunId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, unknown> = {
      source_url: String(form.get('source_url')),
      title: String(form.get('title') || '') || null,
      excerpt_or_ref: String(form.get('excerpt_or_ref')),
      scope: {},
    };
    const selected = String(form.get('source_registry_id') || '');
    if (selected) payload.source_registry_id = selected;
    else {
      payload.source_name = String(form.get('source_name'));
      payload.source_type = String(form.get('source_type'));
    }
    setSavingEvidence(true); setError(''); setEvidenceSaved(false);
    try {
      const saved = await sourcesApi.addEvidence(selectedRunId, payload);
      formElement.reset(); setSourceId(''); setEvidenceSaved(true);
      setEvidence((current) => [saved, ...current.filter((item) => item.evidence.id !== saved.evidence.id)]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save manual evidence.'); }
    finally { setSavingEvidence(false); }
  }

  return <div className="source-workspace">
    <div className="source-safety-note"><strong>Manual intake only</strong><span>URLs are saved as references. The app does not open or fetch them, and entries remain unverified until reviewed.</span></div>
    {error && <ErrorMessage>{error}</ErrorMessage>}
    <div className="source-columns">
      <section className="research-panel" aria-labelledby="registry-title">
        <div className="panel-heading"><div><span className="eyebrow">SOURCE CATALOG</span><h2 id="registry-title">Source registry</h2></div><span className="manual-chip">ADAPTERS OFF</span></div>
        <form className="research-form source-form" onSubmit={submitSource}>
          <div className="field-grid">
            <label><span className="field-label">Source name</span><input name="name" maxLength={200} required placeholder="App Store" /></label>
            <label><span className="field-label">Source type</span><input name="source_type" maxLength={80} required placeholder="app_store, news, community…" /></label>
          </div>
          <div className="field-grid">
            <label><span className="field-label">Allowed URL domain <span>optional</span></span><input name="url_domain" placeholder="example.com" /></label>
            <label><span className="field-label">Terms status</span><select name="license_status" defaultValue="unknown">{licenseOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          </div>
          <div className="form-actions"><button className="primary-action" disabled={savingSource}>{savingSource ? 'Saving…' : 'Add source'}</button></div>
          {sourceSaved && <div className="research-success" role="status">Source metadata saved. Automatic collection remains disabled.</div>}
        </form>
        <div className="source-list" aria-live="polite">
          {loadingSources ? <p className="state-message" role="status">Loading sources…</p> : sources.length === 0 && !error ? <p className="state-message">No sources in the registry yet.</p> : sources.map((source) => <article className="source-row" key={source.id}>
            <div className="source-row-copy"><strong>{source.name}</strong><span>{source.source_type}{source.url_domain ? ` · ${source.url_domain}` : ''}</span></div>
            <label className="license-control"><span className="sr-only">Terms status for {source.name}</span><select value={source.license_status} onChange={(event) => void updateLicense(source, event.target.value as LicenseStatus)}>{licenseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <span className="manual-chip">MANUAL</span>
          </article>)}
          {sourcesCursor && <button className="secondary-action load-more" type="button" disabled={loadingMoreSources} onClick={() => void loadSources(sourcesCursor)}>{loadingMoreSources ? 'Loading…' : 'Load more sources'}</button>}
        </div>
      </section>

      <section className="research-panel" aria-labelledby="evidence-title">
        <div className="panel-heading"><div><span className="eyebrow">RESEARCH RUN</span><h2 id="evidence-title">Add a source reference</h2></div><span className="manual-chip">UNVERIFIED</span></div>
        <p className="form-intro">Paste a link and add the relevant notes yourself. The source page is never retrieved automatically.</p>
        <label className="run-selector-label"><span className="field-label">Research run</span>
          <select aria-label="Research run" value={selectedRunId} onChange={(event) => setSelectedRunId(event.target.value)} disabled={loadingRuns}>
            <option value="">{loadingRuns ? 'Loading runs…' : 'Choose a research run'}</option>
            {runs.map((run) => <option value={run.id} key={run.id}>{run.project_name} · Plan v{run.plan_version} · {run.state} · {new Date(run.created_at).toLocaleDateString()}</option>)}
          </select>
        </label>
        {!loadingRuns && runs.length === 0 && <p className="state-message">No runs found. Save a plan and create a run from its project page first.</p>}
        {selectedRunId ? <>
          <form className="research-form source-form" onSubmit={submitEvidence}>
            <label><span className="field-label">Registry source <span>optional</span></span><select name="source_registry_id" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Use an unregistered source</option>{sources.filter((source) => source.license_status !== 'blocked').map((source) => <option value={source.id} key={source.id}>{source.name} · {source.license_status}</option>)}</select></label>
            {!sourceId && <div className="field-grid">
              <label><span className="field-label">Source name</span><input name="source_name" required maxLength={200} placeholder="Publisher or site name" /></label>
              <label><span className="field-label">Source type</span><input name="source_type" required maxLength={80} placeholder="news, store, community…" /></label>
            </div>}
            <label><span className="field-label">URL</span><input name="source_url" type="url" required maxLength={2048} placeholder="https://…" /></label>
            <label><span className="field-label">Page title <span>optional</span></span><input name="title" maxLength={1000} placeholder="Title of the page or document" /></label>
            <label><span className="field-label">Notes or excerpt</span><textarea name="excerpt_or_ref" rows={4} required maxLength={10000} placeholder="Enter a short excerpt or explain what to review…" /></label>
            <div className="form-actions"><button className="primary-action" disabled={savingEvidence}>{savingEvidence ? 'Saving…' : 'Save manual reference'}</button></div>
            {evidenceSaved && <div className="research-success" role="status">Saved as needs review with insufficient quality until reviewed.</div>}
          </form>
          <div className="evidence-heading"><span className="field-label">Evidence for selected run</span><a className="text-button" href={`/research/runs?runId=${encodeURIComponent(selectedRunId)}`}>View run details</a></div>
          {loadingEvidence ? <p className="state-message" role="status">Loading evidence…</p> : evidence.length === 0 ? <p className="state-message">No evidence recorded for this run yet.</p> : <div className="evidence-list">{evidence.map(({ source, evidence: item }) => <article className="evidence-item" key={item.id}><div><strong>{source.title || source.source_name}</strong><span>{source.source_type} · {item.status.replaceAll('_', ' ')} · {item.quality}</span></div><button type="button" className="text-button" onClick={() => void navigator.clipboard?.writeText(source.source_url || '')}>Copy URL</button><p>{item.excerpt_or_ref}</p></article>)}</div>}
          {evidenceCursor && <button className="secondary-action load-more" type="button" disabled={loadingMoreEvidence} onClick={() => void loadEvidence(selectedRunId, evidenceCursor)}>{loadingMoreEvidence ? 'Loading…' : 'Load more evidence'}</button>}
        </> : <div className="research-empty"><span aria-hidden="true">◷</span><strong>Select a run to view its evidence</strong><p>Choose a saved research run above, or open one from the Research Runs page.</p><a className="secondary-action" href="/research/runs">Browse research runs</a></div>}
      </section>
    </div>
  </div>;
}
