import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { researchApi, type ProjectImageEvidence, type ProjectTrendUpdate, type ResearchSubject } from './api';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PAGE_SIZE = 30;

export function ImageEvidencePanel({ projectId }: { projectId: string }) {
  const [subjects, setSubjects] = useState<ResearchSubject[]>([]);
  const [updates, setUpdates] = useState<ProjectTrendUpdate[]>([]);
  const [images, setImages] = useState<ProjectImageEvidence[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [trendUpdateId, setTrendUpdateId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sourceNote, setSourceNote] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [publishedOn, setPublishedOn] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);
  const linkedUpdate = updates.find((update) => update.id === trendUpdateId && update.subject_id === subjectId) ?? null;
  const subjectUpdates = updates.filter((update) => update.subject_id === subjectId);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function load(append = false) {
    setLoading(true); setError('');
    try {
      const [subjectPage, updatePage, imagePage] = await Promise.all([
        researchApi.listSubjects(projectId),
        researchApi.listTrendUpdates(projectId, { limit: 100 }),
        researchApi.listImageEvidence(projectId, { limit: PAGE_SIZE, ...(append && nextCursor ? { cursor: nextCursor } : {}) }),
      ]);
      setSubjects(subjectPage.items);
      setUpdates(updatePage.items);
      setImages((current) => append ? [...current, ...imagePage.items] : imagePage.items);
      setNextCursor(imagePage.next_cursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load saved image evidence.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [projectId]);

  function chooseFile(next: File | null) {
    setError(''); setNotice('');
    if (next && !SUPPORTED_TYPES.includes(next.type)) { setFile(null); setError('Choose a PNG, JPEG, or WebP image.'); return; }
    if (next && next.size > MAX_IMAGE_BYTES) { setFile(null); setError('Choose an image smaller than 10 MB.'); return; }
    setFile(next);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (!file || !subjectId) { setError('Choose a saved subject and an image file.'); return; }
    if (!linkedUpdate && !sourceNote.trim()) { setError('Add a note describing where this image came from.'); return; }
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    try {
      await researchApi.uploadImageEvidence(projectId, subjectId, file, linkedUpdate ? { trend_update_id: linkedUpdate.id } : {
        source_note: sourceNote.trim(), ...(sourceTitle.trim() ? { source_title: sourceTitle.trim() } : {}),
        ...(sourceUrl.trim() ? { source_url: sourceUrl.trim() } : {}), ...(publishedOn ? { published_on: publishedOn } : {}),
      });
      setFile(null); setSourceNote(''); setSourceTitle(''); setSourceUrl(''); setPublishedOn(''); setTrendUpdateId('');
      setNotice('Image saved with its source context. It remains marked as source-reported and unverified.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this image. Your selection is still here.');
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <section id="project-image-evidence" className="research-panel image-evidence-panel" aria-label="Project image evidence">
    <header className="trend-updates-heading"><div><span className="state-label">PROJECT EVIDENCE</span><h3>Image evidence</h3>
      <p>Attach a local screenshot or image to a confirmed subject. Files are stored with the project database; nothing is uploaded to an external service or interpreted automatically.</p></div></header>
    {error && <div role="alert" className="research-alert">{error}</div>}
    {notice && <div role="status" className="research-success">{notice}</div>}
    <form className="trend-update-form image-evidence-form" onSubmit={(event) => void save(event)}>
      <div className="trend-update-form-grid">
        <label>Confirmed subject<select required value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setTrendUpdateId(''); }}>
          <option value="">Choose a saved subject…</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select></label>
        <label>Related saved update <span className="optional-label">Optional</span><select value={trendUpdateId} disabled={!subjectId || !subjectUpdates.length} onChange={(event) => setTrendUpdateId(event.target.value)}>
          <option value="">Add image source context separately</option>{subjectUpdates.map((update) => <option key={update.id} value={update.id}>{update.published_on} · {update.exact_claim.slice(0, 90)}</option>)}
        </select></label>
        <label>Image file (PNG, JPEG, WebP; up to 10 MB)<input type="file" accept="image/png,image/jpeg,image/webp" required onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /></label>
      </div>
      {linkedUpdate ? <div className="image-evidence-linked-context"><strong>Using saved update source context</strong><p>{linkedUpdate.source_note}</p><span>{linkedUpdate.source_title || 'Untitled source'} · {linkedUpdate.published_on} · source-reported, unverified</span></div> : <>
        <div className="trend-update-form-grid">
          <label>Source title <span className="optional-label">Optional</span><input maxLength={500} value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /></label>
          <label>Source link <span className="optional-label">Optional</span><input type="url" maxLength={2048} placeholder="https://…" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
          <label>Publication date <span className="optional-label">Optional</span><input type="date" value={publishedOn} onChange={(event) => setPublishedOn(event.target.value)} /></label>
        </div>
        <label>Where did this image come from?<textarea required maxLength={10_000} rows={2} value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="Describe the supplied source context. This note is not an independent verification." /></label>
      </>}
      {previewUrl && <div className="image-evidence-preview"><img src={previewUrl} alt={`Preview of ${file?.name ?? 'selected image'}`} /><span>{file?.name} · {((file?.size ?? 0) / 1024).toFixed(0)} KB</span></div>}
      <div className="trend-update-form-actions"><small>Saved images are append-only and remain unverified. The original file hash and source context are retained.</small>
        <button type="submit" className="primary-action" disabled={saving || !subjects.length}>{saving ? 'Saving image…' : 'Save image evidence'}</button>
      </div>
    </form>
    <div className="image-evidence-history"><h4>Saved images</h4>
      {loading && <p role="status">Loading saved images…</p>}
      {!loading && images.length === 0 && <p>No image evidence saved for this project yet.</p>}
      <div className="image-evidence-grid">{images.map((image) => <article className="image-evidence-item" key={image.id}>
        <a className="image-evidence-thumb" href={image.content_url} target="_blank" rel="noopener noreferrer" aria-label={`Open original image ${image.filename}`}><img src={image.content_url} alt={image.filename} loading="lazy" /></a>
        <div className="image-evidence-copy"><strong>{image.subject_name}</strong><span>{image.filename} · {(image.content_size / 1024).toFixed(0)} KB</span>
          <span>Source-reported · unverified{image.published_on ? ` · ${image.published_on}` : ''}</span>
          <p>{image.source_note}</p>{image.source_url && <a href={image.source_url} target="_blank" rel="noopener noreferrer">Open supplied source link</a>}
          <details><summary>File details</summary><code>{image.content_sha256}</code></details>
        </div>
      </article>)}</div>
      {nextCursor && <button type="button" className="secondary-action" disabled={loading} onClick={() => void load(true)}>Load more images</button>}
    </div>
  </section>;
}
