import { useEffect, useRef, useState, type FormEvent } from 'react';
import { researchApi, type ProjectTrendUpdate, type ResearchBenchmarkCollection, type ResearchSubject } from './api';

const PAGE_SIZE = 25;

export function TrendUpdatesPanel({ projectId }: { projectId: string }) {
  const [subjects, setSubjects] = useState<ResearchSubject[]>([]);
  const [collections, setCollections] = useState<ResearchBenchmarkCollection[]>([]);
  const [updates, setUpdates] = useState<ProjectTrendUpdate[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState('');
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
    try {
      await researchApi.createTrendUpdate(projectId, {
        subject_id: subjectId,
        ...(collectionId ? { collection_id: collectionId } : {}),
        exact_claim: exactClaim.trim(), source_note: sourceNote.trim(),
        ...(sourceTitle.trim() ? { source_title: sourceTitle.trim() } : {}),
        ...(sourceUrl.trim() ? { source_url: sourceUrl.trim() } : {}),
        published_on: publishedOn,
      });
      setExactClaim(''); setSourceNote(''); setSourceTitle(''); setSourceUrl(''); setPublishedOn('');
      setNotice('Update saved as source-reported and unverified. A later correction can be added as a new update.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this update. Your draft is still here.');
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <section className="research-panel trend-updates-panel" aria-label="Project trend updates">
    <header className="trend-updates-heading"><div><span className="state-label">PROJECT INPUT</span><h3>Trend updates</h3>
      <p>Save an exact claim with its source context. The app does not fetch or verify links, infer measurements, or overwrite earlier updates.</p></div></header>
    {error && <div role="alert" className="research-alert">{error}</div>}
    {notice && <div role="status" className="research-success">{notice}</div>}
    <form className="trend-update-form" onSubmit={(event) => void saveUpdate(event)}>
      <div className="trend-update-form-grid">
        <label>Confirmed subject <select required value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          <option value="">Choose a saved subject…</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select></label>
        <label>Benchmark collection <span className="optional-label">Optional</span><select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
          <option value="">Not linked to a collection</option>{collections.filter((collection) => collection.members.some((member) => member.subject_id === subjectId)).map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
        </select></label>
        <label>Source publication date <input type="date" required value={publishedOn} onChange={(event) => setPublishedOn(event.target.value)} /></label>
        <label>Source title <span className="optional-label">Optional</span><input maxLength={500} value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /></label>
        <label>Source link <span className="optional-label">Optional</span><input type="url" maxLength={2048} placeholder="https://…" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
      </div>
      <label>Exact research claim <textarea required maxLength={20000} rows={3} value={exactClaim} onChange={(event) => setExactClaim(event.target.value)} placeholder="Copy the claim as supplied. Do not add an interpretation." /></label>
      <label>Source note <textarea required maxLength={10000} rows={2} value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="Where did this claim come from? Add the context supplied by the source or owner." /></label>
      <div className="trend-update-form-actions"><small>Saved updates are append-only and remain unverified until independently checked.</small>
        <button type="submit" className="primary-action" disabled={saving || !subjects.length}>{saving ? 'Saving update…' : 'Save trend update'}</button>
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
      </article>)}
      {nextCursor && <button type="button" className="secondary-action" disabled={loading} onClick={() => void load(true)}>Load more updates</button>}
    </div>
  </section>;
}
