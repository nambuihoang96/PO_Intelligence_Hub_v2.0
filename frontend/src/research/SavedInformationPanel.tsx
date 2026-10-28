import { useEffect, useRef, useState, type FormEvent } from 'react';
import { researchApi, type ProjectSavedInformation, type ResearchBenchmarkCollection, type ResearchSubject } from './api';
import './SavedInformationPanel.css';

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      if (comma < 0) reject(new Error('Không thể đọc tệp ảnh.'));
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
      setError(cause instanceof Error ? cause.message : 'Không tải được thông tin đã lưu.');
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
      setNotice('Đã lưu nguyên văn nội dung. Thông tin được ghi nhận theo nguồn cung cấp và chưa xác minh độc lập.');
    } catch (cause) {
      if (createdSubject) {
        setSubjects((current) => [createdSubject!, ...current.filter((item) => item.id !== createdSubject!.id)]);
        setSubjectId(createdSubject.id);
        setCreateSubject(false);
      }
      setError(`${createdSubject ? `Đã tạo và chọn hồ sơ “${createdSubject.name}”; thao tác lưu lại sẽ không tạo hồ sơ trùng. ` : ''}${cause instanceof Error ? cause.message : 'Không thể lưu thông tin. Nội dung bạn nhập vẫn được giữ lại.'}`);
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
      setNotice('Đã liên kết thông tin với sản phẩm hoặc chủ đề đã chọn.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không cập nhật được liên kết này.'); }
  }

  return <section className="research-panel saved-information-panel" id="project-saved-information" aria-labelledby="saved-information-title">
    <header className="trend-updates-heading"><div><span className="state-label">GHI NHẬN ĐIỀU BẠN PHÁT HIỆN</span><h3 id="saved-information-title">Ghi nhận xu hướng hoặc bằng chứng</h3>
      <p>Lưu nguyên văn bản tin, ghi chú hoặc quan sát. Bạn có thể gắn với hồ sơ sản phẩm ngay hoặc bổ sung sau.</p></div></header>
    {error && <div role="alert" className="research-alert">{error}</div>}
    {notice && <div role="status" className="research-success">{notice}</div>}
    <form className="saved-information-form" onSubmit={(event) => void save(event)}>
      <label htmlFor="saved-information-content">Nội dung cần lưu <span className="optional-label">Bắt buộc</span></label>
      <textarea id="saved-information-content" required maxLength={200000} rows={7} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Dán nguyên văn nội dung bạn nhận được. Nội dung sẽ được lưu đúng như đã nhập." />
      <details className="saved-information-context"><summary>Thêm ảnh hoặc thông tin nguồn (không bắt buộc)</summary>
        <div className="saved-information-fields">
          <label>Tệp ảnh <span className="optional-label">Không bắt buộc · JPG, PNG hoặc WebP · tối đa 10 MB</span><input id="saved-information-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} /></label>
          {image && <p className="saved-information-file">{image.name} · {(image.size / 1024).toFixed(0)} KB <button className="text-button" type="button" onClick={() => { setImage(null); const picker = document.getElementById('saved-information-image') as HTMLInputElement | null; if (picker) picker.value = ''; }}>Gỡ ảnh</button></p>}
          <label>Bạn tìm thấy thông tin này ở đâu? <span className="optional-label">Không bắt buộc</span><textarea rows={2} maxLength={10000} value={sourceContext} onChange={(event) => setSourceContext(event.target.value)} placeholder="Ví dụ: trang cửa hàng, bài viết hoặc quan sát của bạn." /></label>
          <div className="saved-information-grid"><label>Tên nguồn <span className="optional-label">Không bắt buộc</span><input maxLength={500} value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /></label><label>Đường dẫn nguồn <span className="optional-label">Không bắt buộc</span><input type="url" maxLength={2048} placeholder="https://…" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label><label>Ngày ghi nhận, nếu biết <span className="optional-label">Không bắt buộc</span><input type="date" value={capturedOn} onChange={(event) => setCapturedOn(event.target.value)} /></label></div>
          <div className="saved-information-grid"><label>Gắn với sản phẩm hoặc chủ đề <span className="optional-label">Không bắt buộc</span><select value={subjectId} disabled={createSubject} onChange={(event) => setSubjectId(event.target.value)}><option value="">Chưa liên kết</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>Gắn với bộ so sánh <span className="optional-label">Không bắt buộc</span><select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">Chưa liên kết</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label></div>
          <label className="saved-information-create-subject"><input type="checkbox" checked={createSubject} onChange={(event) => setCreateSubject(event.target.checked)} /> Tạo hồ sơ sản phẩm hoặc chủ đề cho nội dung này</label>
          {createSubject && <label>Tên sản phẩm hoặc chủ đề <input required maxLength={500} value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} placeholder="Nhập tên bạn muốn dùng" /></label>}
        </div>
      </details>
      <div className="saved-information-actions"><small>Nội dung gốc được giữ nguyên. Ứng dụng không tự mở hoặc xác minh nguồn.</small><button type="submit" className="primary-action" disabled={saving || !content.trim()}>{saving ? 'Đang lưu…' : 'Lưu thông tin'}</button></div>
    </form>
    <div className="saved-information-history"><div className="panel-heading"><h4>Thông tin đã lưu trong dự án</h4><button className="text-button" type="button" onClick={() => void load()} disabled={loading}>Tải lại</button></div>
      {loading && <p role="status">Đang tải thông tin đã lưu…</p>}
      {!loading && items.length === 0 && <p className="project-home-empty">Chưa có nội dung nào. Ghi chú gốc của bạn sẽ xuất hiện tại đây.</p>}
      {items.map((item) => <article className="saved-information-item" key={item.id}>
        <div className="saved-information-item-meta"><span>{new Date(item.created_at).toLocaleString('vi-VN')}</span><span>Theo nguồn cung cấp · chưa xác minh</span>{item.subject_name && <span>{item.subject_name}</span>}{item.collection_name && <span>{item.collection_name}</span>}</div>
        <p className="saved-information-original">{item.original_content}</p>
        {item.source_title && <p><strong>{item.source_title}</strong></p>}{item.source_context && <p className="saved-information-source-context">{item.source_context}</p>}
        {item.source_url && <a href={item.source_url} target="_blank" rel="noopener noreferrer">Mở liên kết nguồn đã cung cấp</a>}
        {item.image_url && <figure className="saved-information-image"><img src={item.image_url} alt={`Ảnh đính kèm${item.subject_name ? ` về ${item.subject_name}` : ''}`} /><figcaption>{item.image_filename} · Tệp lưu cục bộ · Chưa xác minh</figcaption></figure>}
        {!item.subject_id && <div className="saved-information-link-row"><label>Gắn với sản phẩm hoặc chủ đề<select aria-label={`Gắn thông tin từ ${item.created_at} với sản phẩm hoặc chủ đề`} value={linkDrafts[item.id] || ''} onChange={(event) => setLinkDrafts((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Chưa liên kết</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><button type="button" className="secondary-action" disabled={!linkDrafts[item.id]} onClick={() => void linkSubject(item)}>Lưu liên kết</button></div>}
      </article>)}
    </div>
  </section>;
}
