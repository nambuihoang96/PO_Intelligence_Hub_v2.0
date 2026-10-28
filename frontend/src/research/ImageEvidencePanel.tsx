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
      setError(cause instanceof Error ? cause.message : 'Không thể tải ảnh chứng cứ đã lưu.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [projectId]);

  function chooseFile(next: File | null) {
    setError(''); setNotice('');
    if (next && !SUPPORTED_TYPES.includes(next.type)) { setFile(null); setError('Hãy chọn ảnh PNG, JPEG hoặc WebP.'); return; }
    if (next && next.size > MAX_IMAGE_BYTES) { setFile(null); setError('Hãy chọn ảnh nhỏ hơn 10 MB.'); return; }
    setFile(next);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (!file || !subjectId) { setError('Hãy chọn hồ sơ đã lưu và một tệp ảnh.'); return; }
    if (!linkedUpdate && !sourceNote.trim()) { setError('Hãy ghi rõ ảnh này được lấy từ đâu.'); return; }
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    try {
      await researchApi.uploadImageEvidence(projectId, subjectId, file, linkedUpdate ? { trend_update_id: linkedUpdate.id } : {
        source_note: sourceNote.trim(), ...(sourceTitle.trim() ? { source_title: sourceTitle.trim() } : {}),
        ...(sourceUrl.trim() ? { source_url: sourceUrl.trim() } : {}), ...(publishedOn ? { published_on: publishedOn } : {}),
      });
      setFile(null); setSourceNote(''); setSourceTitle(''); setSourceUrl(''); setPublishedOn(''); setTrendUpdateId('');
      setNotice('Đã lưu ảnh kèm bối cảnh nguồn. Ảnh vẫn được đánh dấu là do nguồn cung cấp và chưa xác minh.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu ảnh. Tệp bạn đã chọn vẫn được giữ lại.');
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <section id="project-image-evidence" className="research-panel image-evidence-panel" aria-label="Ảnh chứng cứ của dự án">
    <header className="trend-updates-heading"><div><span className="state-label">CHỨNG CỨ CỦA DỰ ÁN</span><h3>Ảnh chứng cứ</h3>
      <p>Đính kèm ảnh chụp hoặc hình ảnh trên máy với một hồ sơ đã xác nhận. Tệp được lưu cùng dữ liệu dự án, không tải lên dịch vụ ngoài và không tự động diễn giải.</p></div></header>
    {error && <div role="alert" className="research-alert">{error}</div>}
    {notice && <div role="status" className="research-success">{notice}</div>}
    <form className="trend-update-form image-evidence-form" onSubmit={(event) => void save(event)}>
      <div className="trend-update-form-grid">
        <label>Hồ sơ đã xác nhận<select required value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setTrendUpdateId(''); }}>
          <option value="">Chọn hồ sơ đã lưu…</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select></label>
        <label>Cập nhật liên quan <span className="optional-label">Không bắt buộc</span><select value={trendUpdateId} disabled={!subjectId || !subjectUpdates.length} onChange={(event) => setTrendUpdateId(event.target.value)}>
          <option value="">Thêm riêng bối cảnh nguồn cho ảnh</option>{subjectUpdates.map((update) => <option key={update.id} value={update.id}>{update.published_on} · {update.exact_claim.slice(0, 90)}</option>)}
        </select></label>
        <label>Tệp ảnh (PNG, JPEG, WebP; tối đa 10 MB)<input type="file" accept="image/png,image/jpeg,image/webp" required onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /></label>
      </div>
      {linkedUpdate ? <div className="image-evidence-linked-context"><strong>Đang dùng bối cảnh nguồn từ cập nhật đã lưu</strong><p>{linkedUpdate.source_note}</p><span>{linkedUpdate.source_title || 'Nguồn chưa có tiêu đề'} · {linkedUpdate.published_on} · do nguồn cung cấp, chưa xác minh</span></div> : <>
        <div className="trend-update-form-grid">
          <label>Tên nguồn <span className="optional-label">Không bắt buộc</span><input maxLength={500} value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /></label>
          <label>Liên kết nguồn <span className="optional-label">Không bắt buộc</span><input type="url" maxLength={2048} placeholder="https://…" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
          <label>Ngày đăng <span className="optional-label">Không bắt buộc</span><input type="date" value={publishedOn} onChange={(event) => setPublishedOn(event.target.value)} /></label>
        </div>
        <label>Ảnh này được lấy từ đâu?<textarea required maxLength={10_000} rows={2} value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="Mô tả bối cảnh nguồn được cung cấp. Ghi chú này không phải xác minh độc lập." /></label>
      </>}
      {previewUrl && <div className="image-evidence-preview"><img src={previewUrl} alt={`Xem trước ${file?.name ?? 'ảnh đã chọn'}`} /><span>{file?.name} · {((file?.size ?? 0) / 1024).toFixed(0)} KB</span></div>}
      <div className="trend-update-form-actions"><small>Ảnh đã lưu không bị ghi đè và vẫn chưa xác minh. Ứng dụng giữ mã kiểm tra tệp gốc và bối cảnh nguồn.</small>
        <button type="submit" className="primary-action" disabled={saving || !subjects.length}>{saving ? 'Đang lưu ảnh…' : 'Lưu ảnh chứng cứ'}</button>
      </div>
    </form>
    <div className="image-evidence-history"><h4>Ảnh đã lưu</h4>
      {loading && <p role="status">Đang tải ảnh đã lưu…</p>}
      {!loading && images.length === 0 && <p>Dự án chưa có ảnh chứng cứ nào.</p>}
      <div className="image-evidence-grid">{images.map((image) => <article className="image-evidence-item" key={image.id}>
        <a className="image-evidence-thumb" href={image.content_url} target="_blank" rel="noopener noreferrer" aria-label={`Mở ảnh gốc ${image.filename}`}><img src={image.content_url} alt={image.filename} loading="lazy" /></a>
        <div className="image-evidence-copy"><strong>{image.subject_name}</strong><span>{image.filename} · {(image.content_size / 1024).toFixed(0)} KB</span>
          <span>Do nguồn cung cấp · chưa xác minh{image.published_on ? ` · ${image.published_on}` : ''}</span>
          <p>{image.source_note}</p>{image.source_url && <a href={image.source_url} target="_blank" rel="noopener noreferrer">Mở liên kết nguồn đã cung cấp</a>}
          <details><summary>Chi tiết tệp</summary><code>{image.content_sha256}</code></details>
        </div>
      </article>)}</div>
      {nextCursor && <button type="button" className="secondary-action" disabled={loading} onClick={() => void load(true)}>Tải thêm ảnh</button>}
    </div>
  </section>;
}
