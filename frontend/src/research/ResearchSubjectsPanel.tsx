import { useEffect, useState } from 'react';
import { researchApi, type ResearchSubject, type ResearchSubjectSource } from './api';

function sourceKey(source: ResearchSubjectSource): string {
  return [source.source_kind, source.source_id, source.source_key].join('|');
}

export function ResearchSubjectsPanel({ projectId }: { projectId: string }) {
  const [subjects, setSubjects] = useState<ResearchSubject[]>([]);
  const [sources, setSources] = useState<ResearchSubjectSource[]>([]);
  const [sourceCursor, setSourceCursor] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(append = false) {
    setLoading(true); setError('');
    try {
      const [subjectPage, sourcePage] = await Promise.all([
        researchApi.listSubjects(projectId),
        researchApi.listSubjectSources(projectId, append ? sourceCursor ?? undefined : undefined),
      ]);
      setSubjects(subjectPage.items);
      setSources((current) => append ? [...current, ...sourcePage.items] : sourcePage.items);
      setSourceCursor(sourcePage.next_cursor);
      setDrafts((current) => {
        const next = append ? { ...current } : {};
        for (const item of sourcePage.items) if (current[sourceKey(item)] === undefined) next[sourceKey(item)] = item.mapped_subject_id ?? '';
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load research subjects.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [projectId]);

  async function mapSource(source: ResearchSubjectSource, createFromSource = false) {
    const key = sourceKey(source);
    const selected = drafts[key] || '';
    if (!selected && !createFromSource) return;
    setBusy(key); setError(''); setNotice('');
    try {
      await researchApi.mapSubjectSource(projectId, {
        source_kind: source.source_kind, source_id: source.source_id, source_key: source.source_key,
        ...(createFromSource ? { create_subject_from_source: true } : { subject_id: selected }),
        ...(source.mapped_subject_id && source.mapped_subject_id !== selected ? { expected_subject_id: source.mapped_subject_id } : {}),
      });
      setNotice(createFromSource ? 'Subject created from the supplied source identity and linked.' : 'Source linked to the selected subject.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this subject link.');
      await load();
    } finally { setBusy(null); }
  }

  async function saveName(subject: ResearchSubject) {
    setBusy(subject.id); setError(''); setNotice('');
    try {
      await researchApi.updateSubject(projectId, subject.id, { name: editName });
      setEditingId(null); setNotice('Subject name saved.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update subject.'); }
    finally { setBusy(null); }
  }

  return <details className="research-subjects-panel">
    <summary><span>Research subjects</span><small>{subjects.length} saved · reusable identities across this project</small></summary>
    <div className="research-subjects-content">
      <p>Names from reports and CSVs stay source-specific until you link them. Similar names are never merged automatically.</p>
      {error && <div className="research-alert" role="alert">{error}</div>}
      {notice && <div className="research-success" role="status">{notice}</div>}
      {loading && !subjects.length && !sources.length ? <p role="status">Loading subjects and source identities…</p> : <>
        <section aria-label="Saved research subjects" className="research-subject-list">
          <h3>Saved in this project</h3>
          {subjects.length ? subjects.map((subject) => <div className="research-subject-item" key={subject.id}>
            {editingId === subject.id ? <><label>Subject name<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
              <button type="button" className="secondary-action" disabled={busy === subject.id || !editName.trim()} onClick={() => void saveName(subject)}>Save name</button>
              <button type="button" className="text-button" onClick={() => setEditingId(null)}>Cancel</button></>
              : <><div><strong>{subject.name}</strong><small>{subject.subject_type || 'Type not specified'}{subject.aliases.length ? ` · ${subject.aliases.join(', ')}` : ''}</small></div>
                <button type="button" className="text-button" onClick={() => { setEditingId(subject.id); setEditName(subject.name); }}>Edit name</button></>}
          </div>) : <p>No reusable subjects saved yet.</p>}
        </section>
        <section aria-label="Report and CSV identities" className="research-subject-sources">
          <h3>Names found in this project’s sources</h3>
          {!sources.length ? <p>No structured report entities or stable CSV identities are available to link.</p> : sources.map((source) => {
            const key = sourceKey(source);
            const selected = drafts[key] ?? source.mapped_subject_id ?? '';
            return <article className="research-subject-source" key={key}>
              <div><strong>{source.source_name}</strong><small>{source.source_kind === 'report_entity' ? 'Report' : 'CSV'} · {source.context_name}</small>
                {source.source_state === 'stale' && <small role="status">Historical link · source no longer exposes this identity</small>}
                {source.mapped_subject_name && <small>Linked to {source.mapped_subject_name}</small>}</div>
              {source.source_state === 'available' && <div className="research-subject-source-actions">
                <label className="sr-only" htmlFor={`subject-target-${encodeURIComponent(key)}`}>Link {source.source_name} to a saved subject</label>
                <select id={`subject-target-${encodeURIComponent(key)}`} value={selected} disabled={busy === key || subjects.length === 0}
                  onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}>
                  <option value="">Choose a saved subject…</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
                {subjects.length > 0 && <button type="button" className="secondary-action" disabled={busy === key || !selected || selected === source.mapped_subject_id}
                  onClick={() => void mapSource(source)}>{busy === key ? 'Saving…' : source.mapped_subject_id ? 'Change link' : 'Link subject'}</button>}
                {!source.mapped_subject_id && <button type="button" className="text-button" disabled={busy === key}
                  onClick={() => void mapSource(source, true)}>{busy === key ? 'Creating…' : 'Create subject from this name'}</button>}
              </div>}
            </article>;
          })}
          {sourceCursor && <button type="button" className="secondary-action" disabled={loading} onClick={() => void load(true)}>{loading ? 'Loading…' : 'Load more source identities'}</button>}
        </section>
      </>}
    </div>
  </details>;
}
