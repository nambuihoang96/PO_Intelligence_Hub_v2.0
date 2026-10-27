import { useEffect, useRef, useState, type FormEvent } from 'react';
import { researchApi, type ProjectSavedInformation, type ResearchBenchmarkCollection, type ResearchSubject } from './api';
import './SavedInformationPanel.css';

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      if (comma < 0) reject(new Error('The image could not be read.'));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

function supportedImageType(file: File): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp') return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return null;
}

function notifySavedInformationChanged(projectId: string) {
  window.dispatchEvent(new CustomEvent('project-saved-information-changed', { detail: { projectId } }));
}

export function SavedInformationPanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ProjectSavedInformation[]>([]);
  const [subjects, setSubjects] = useState<ResearchSubject[]>([]);
  const [collections, setCollections] = useState<ResearchBenchmarkCollection[]>([]);
  const [content, setContent] = useState('');
  const [sourceContext, setSourceContext] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [capturedOn, setCapturedOn] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [createSubject, setCreateSubject] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [page, subjectPage, collectionPage] = await Promise.all([
        researchApi.listSavedInformation(projectId, { limit: 50 }),
        researchApi.listSubjects(projectId),
        researchApi.listBenchmarkCollections(projectId),
      ]);
      setItems(page.items);
      setSubjects(subjectPage.items);
      setCollections(collectionPage.items);
      setLinkDrafts(Object.fromEntries(page.items.map((item) => [item.id, item.subject_id || ''])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load saved information.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [projectId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError(''); setNotice('');
    let createdSubject: ResearchSubject | null = null;
    try {
      if (createSubject && newSubjectName.trim()) {
        createdSubject = await researchApi.createSubject(projectId, {
          name: newSubjectName.trim(), subject_type: null, aliases: [], external_ids: [],
          provenance: { created_via: 'saved_information_context' },
        });
      }
      const filePayload = image ? {
        image_filename: image.name,
        image_content_type: supportedImageType(image),
        image_base64: await readFileAsBase64(image),
      } : {};
      const saved = await researchApi.createSavedInformation(projectId, {
        original_content: content,
        subject_id: createdSubject?.id || subjectId || null,
        collection_id: collectionId || null,
        source_context: sourceContext.trim() || null,
        source_title: sourceTitle.trim() || null,
        source_url: sourceUrl.trim() || null,
        captured_on: capturedOn || null,
        ...filePayload,
      });
      setItems((current) => [saved, ...current]);
      setLinkDrafts((current) => ({ ...current, [saved.id]: saved.subject_id || '' }));
      if (createdSubject) setSubjects((current) => [createdSubject!, ...current]);
      notifySavedInformationChanged(projectId);
      setContent(''); setSourceContext(''); setSourceTitle(''); setSourceUrl(''); setCapturedOn(''); setSubjectId(''); setCollectionId(''); setNewSubjectName(''); setCreateSubject(false); setImage(null);
      const picker = document.getElementById('saved-information-image') as HTMLInputElement | null;
      if (picker) picker.value = '';
      setNotice('Information saved with its original wording. It is marked source-reported and unverified.');
    } catch (cause) {
      if (createdSubject) {
        setSubjects((current) => [createdSubject!, ...current.filter((item) => item.id !== createdSubject!.id)]);
        setSubjectId(createdSubject.id);
        setCreateSubject(false);
      }
      setError(`${createdSubject ? `“${createdSubject.name}” was created and selected, so retrying will not create it again. ` : ''}${cause instanceof Error ? cause.message : 'Could not save this information. Your text is still here.'}`);
    } finally { savingRef.current = false; setSaving(false); }
  }

  async function linkSubject(item: ProjectSavedInformation) {
    setError(''); setNotice('');
    try {
      const updated = await researchApi.updateSavedInformationContext(projectId, item.id, {
        subject_id: linkDrafts[item.id] || null,
        collection_id: item.collection_id,
      });
      setItems((current) => current.map((row) => row.id === item.id ? updated : row));
      notifySavedInformationChanged(projectId);
      setNotice('The saved information is now linked to the selected product or topic.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this link.'); }
  }

  return <section className="research-panel saved-information-panel" id="project-saved-information" aria-labelledby="saved-information-title">
    <header className="trend-updates-heading"><div><span className="state-label">SAVE SOMETHING YOU FOUND</span><h3 id="saved-information-title">Save new information</h3>
      <p>Paste the original note, announcement, or observation. You can save it now and connect a product or topic later.</p></div></header>
    {error && <div role="alert" className="research-alert">{error}</div>}
    {notice && <div role="status" className="research-success">{notice}</div>}
    <form className="saved-information-form" onSubmit={(event) => void save(event)}>
      <label htmlFor="saved-information-content">Paste content <span className="optional-label">Required</span></label>
      <textarea id="saved-information-content" required maxLength={200000} rows={7} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste the full information as you received it. It will be saved as written." />
      <details className="saved-information-context"><summary>Add an optional image or source context</summary>
        <div className="saved-information-fields">
          <label>Image attachment <span className="optional-label">Optional · JPG, PNG, or WebP · up to 10 MB</span><input id="saved-information-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} /></label>
          {image && <p className="saved-information-file">{image.name} · {(image.size / 1024).toFixed(0)} KB <button className="text-button" type="button" onClick={() => { setImage(null); const picker = document.getElementById('saved-information-image') as HTMLInputElement | null; if (picker) picker.value = ''; }}>Remove</button></p>}
          <label>Where did you find it? <span className="optional-label">Optional</span><textarea rows={2} maxLength={10000} value={sourceContext} onChange={(event) => setSourceContext(event.target.value)} placeholder="For example, a store listing, article, or your own observation." /></label>
          <div className="saved-information-grid"><label>Source title <span className="optional-label">Optional</span><input maxLength={500} value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /></label><label>Source link <span className="optional-label">Optional</span><input type="url" maxLength={2048} placeholder="https://…" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label><label>Date, if known <span className="optional-label">Optional</span><input type="date" value={capturedOn} onChange={(event) => setCapturedOn(event.target.value)} /></label></div>
          <div className="saved-information-grid"><label>Connect to a product or topic <span className="optional-label">Optional</span><select value={subjectId} disabled={createSubject} onChange={(event) => setSubjectId(event.target.value)}><option value="">Not linked yet</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>Connect to a comparison group <span className="optional-label">Optional</span><select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">Not linked</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label></div>
          <label className="saved-information-create-subject"><input type="checkbox" checked={createSubject} onChange={(event) => setCreateSubject(event.target.checked)} /> Create a product or topic profile for this item</label>
          {createSubject && <label>Product or topic name <input required maxLength={500} value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} placeholder="Enter the name you want to use" /></label>}
        </div>
      </details>
      <div className="saved-information-actions"><small>Original wording is preserved. No source is opened or marked verified.</small><button type="submit" className="primary-action" disabled={saving || !content.trim()}>{saving ? 'Saving…' : 'Save information'}</button></div>
    </form>
    <div className="saved-information-history"><div className="panel-heading"><h4>Saved in this project</h4><button className="text-button" type="button" onClick={() => void load()} disabled={loading}>Refresh</button></div>
      {loading && <p role="status">Loading saved information…</p>}
      {!loading && items.length === 0 && <p className="project-home-empty">Nothing saved yet. Your original notes will appear here.</p>}
      {items.map((item) => <article className="saved-information-item" key={item.id}>
        <div className="saved-information-item-meta"><span>{new Date(item.created_at).toLocaleString()}</span><span>Source-reported · unverified</span>{item.subject_name && <span>{item.subject_name}</span>}{item.collection_name && <span>{item.collection_name}</span>}</div>
        <p className="saved-information-original">{item.original_content}</p>
        {item.source_title && <p><strong>{item.source_title}</strong></p>}{item.source_context && <p className="saved-information-source-context">{item.source_context}</p>}
        {item.source_url && <a href={item.source_url} target="_blank" rel="noopener noreferrer">Open supplied source link</a>}
        {item.image_url && <figure className="saved-information-image"><img src={item.image_url} alt={`Image attached to saved information${item.subject_name ? ` about ${item.subject_name}` : ''}`} /><figcaption>{item.image_filename} · Local attachment · Not verified</figcaption></figure>}
        {!item.subject_id && <div className="saved-information-link-row"><label>Link this to a product or topic<select aria-label={`Link saved information from ${item.created_at} to a product or topic`} value={linkDrafts[item.id] || ''} onChange={(event) => setLinkDrafts((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Leave unlinked</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><button type="button" className="secondary-action" disabled={!linkDrafts[item.id]} onClick={() => void linkSubject(item)}>Save link</button></div>}
      </article>)}
    </div>
  </section>;
}
