import { useEffect, useRef, useState, type FormEvent } from 'react';
import { researchApi, type ProjectTrendUpdate, type ResearchBenchmarkCollection, type ResearchSubject } from './api';

const PAGE_SIZE = 25;

export function TrendUpdatesPanel({ projectId }: { projectId: string }) {
  const [subjects, setSubjects] = useState<ResearchSubject[]>([]);
  const [collections, setCollections] = useState<ResearchBenchmarkCollection[]>([]);
  const [updates, setUpdates] = useState<ProjectTrendUpdate[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [subjectMode, setSubjectMode] = useState<'new' | 'existing'>('new');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectType, setNewSubjectType] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [exactClaim, setExactClaim] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [publishedOn, setPublishedOn] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load(append = false) {
    setLoading(true); setError('');
    try {
      const [subjectPage, collectionPage, updatePage] = await Promise.all([
        researchApi.listSubjects(projectId),
        researchApi.listBenchmarkCollections(projectId),
        researchApi.listTrendUpdates(projectId, { limit: PAGE_SIZE, ...(append && nextCursor ? { cursor: nextCursor } : {}) }),
      ]);
      setSubjects(subjectPage.items);
      setCollections(collectionPage.items);
      setUpdates((current) => append ? [...current, ...updatePage.items] : updatePage.items);
      setNextCursor(updatePage.next_cursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load project trend updates.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [projectId]);

  async function saveUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError(''); setNotice('');
    let targetSubjectId = subjectId;
    let createdSubjectName = '';
    try {
      if (subjectMode === 'new') {
        const createdSubject = await researchApi.createSubject(projectId, {
          name: newSubjectName.trim(), subject_type: newSubjectType.trim() || null,
          aliases: [], external_ids: [], provenance: { created_via: 'trend_update' },
        });
        targetSubjectId = createdSubject.id;
        createdSubjectName = createdSubject.name;
        setSubjects((current) => [createdSubject, ...current.filter((item) => item.id !== createdSubject.id)]);
        setSubjectId(createdSubject.id);
        setSubjectMode('existing');
      }
      await researchApi.createTrendUpdate(projectId, {
        subject_id: targetSubjectId,
        ...(collectionId ? { collection_id: collectionId } : {}),
        exact_claim: exactClaim.trim(), source_note: sourceNote.trim(),
        ...(sourceTitle.trim() ? { source_title: sourceTitle.trim() } : {}),
        ...(sourceUrl.trim() ? { source_url: sourceUrl.trim() } : {}),
        published_on: publishedOn,
      });
      setExactClaim(''); setSourceNote(''); setSourceTitle(''); setSourceUrl(''); setPublishedOn(''); setNewSubjectName(''); setNewSubjectType('');
      setNotice('Update saved as source-reported and unverified. A later correction can be added as a new update.');
      await load();
    } catch (cause) {
      setError(`${createdSubjectName ? `“${createdSubjectName}” is saved as a subject. ` : ''}${cause instanceof Error ? cause.message : 'Could not save this update. Your draft is still here.'}`);
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <section id="project-trend-updates" className="research-panel trend-updates-panel" aria-label="Project trend updates">
    <header className="trend-updates-heading"><div><span className="state-label">PROJECT INPUT</span><h3>Trend updates</h3>
      <p>Save an exact claim with its source context. The app does not fetch or verify links, infer measurements, or overwrite earlier updates.</p></div></header>
    {error && <div role="alert" className="research-alert">{error}</div>}
    {notice && <div role="status" className="research-success">{notice}</div>}
    <form className="trend-update-form" onSubmit={(event) => void saveUpdate(event)}>
      <div className="trend-update-subject-choice" role="group" aria-label="Product or topic for this update">
        <label className={`trend-update-subject-option${subjectMode === 'new' ? ' selected' : ''}`}><input type="radio" name="trend-subject-mode" checked={subjectMode === 'new'} onChange={() => setSubjectMode('new')} /><span><strong>Create a new product or topic</strong><small>Use this when the subject is not in the list yet.</small></span></label>
        <label className={`trend-update-subject-option${subjectMode === 'existing' ? ' selected' : ''}`}><input type="radio" name="trend-subject-mode" checked={subjectMode === 'existing'} disabled={subjects.length === 0} onChange={() => setSubjectMode('existing')} /><span><strong>Use a saved product or topic</strong><small>{subjects.length ? 'Keep this update with an existing subject.' : 'Available after a subject has been created.'}</small></span></label>
      </div>
      {subjectMode === 'new' ? <div className="trend-update-form-grid trend-update-new-subject">
        <label>Product or topic name <input required maxLength={500} value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} placeholder="For example, a game, app, or market topic" /></label>
        <label>Type <span className="optional-label">Optional</span><input maxLength={120} value={newSubjectType} onChange={(event) => setNewSubjectType(event.target.value)} placeholder="Use your own words" /></label>
      </div> : <div className="trend-update-form-grid">
        <label>Product or topic <select required value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          <option value="">Choose a saved product or topic…</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select></label>
      </div>}
      <div className="trend-update-form-grid">
        <label>Benchmark collection <span className="optional-label">Optional</span><select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
          <option value="">Not linked to a collection</option>{collections.filter((collection) => collection.members.some((member) => member.subject_id === (subjectMode === 'existing' ? subjectId : ''))).map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
        </select></label>
        <label>Source publication date <input type="date" required value={publishedOn} onChange={(event) => setPublishedOn(event.target.value)} /></label>
      </div>
      <label>What did you observe? <textarea required maxLength={20000} rows={3} value={exactClaim} onChange={(event) => setExactClaim(event.target.value)} placeholder="Record the observation as supplied. Do not add an interpretation." /></label>
      <label>Where did you see it? <textarea required maxLength={10000} rows={2} value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="Add context about where this information came from." /></label>
      <details className="trend-update-source-details"><summary>More source details</summary><div className="trend-update-source-detail-grid">
        <label>Source title <span className="optional-label">Optional</span><input maxLength={500} value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /></label>
        <label>Source link <span className="optional-label">Optional</span><input type="url" maxLength={2048} placeholder="https://…" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
      </div></details>
      <div className="trend-update-form-actions"><small>Saved updates are append-only and remain unverified until independently checked.</small>
        <button type="submit" className="primary-action" disabled={saving || (subjectMode === 'existing' && !subjects.length)}>{saving ? 'Saving update…' : 'Save trend update'}</button>
      </div>
    </form>
    <div className="trend-update-history"><h4>Saved updates</h4>
      {loading && <p role="status">Loading updates…</p>}
      {!loading && updates.length === 0 && <p>No updates saved for this project yet.</p>}
      {updates.map((update) => <article className="trend-update-item" key={update.id}>
        <div className="trend-update-meta"><strong>{update.subject_name}</strong><span>{update.published_on}</span><span>Source-reported · unverified</span>{update.collection_name && <span>{update.collection_name}</span>}</div>
        <p className="trend-update-claim">{update.exact_claim}</p>
        {update.source_title && <p className="trend-update-source-title">{update.source_title}</p>}
        <p className="trend-update-source-note">{update.source_note}</p>
        {update.source_url && <a href={update.source_url} target="_blank" rel="noopener noreferrer">Open supplied source link</a>}
        <a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}&view=opportunities&decisionKind=trend_update&decisionTargetId=${encodeURIComponent(update.id)}`}>Review PO decision</a>
      </article>)}
      {nextCursor && <button type="button" className="secondary-action" disabled={loading} onClick={() => void load(true)}>Load more updates</button>}
    </div>
  </section>;
}
