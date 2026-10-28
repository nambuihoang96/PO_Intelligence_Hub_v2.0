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
      setNotice('Đã lưu cập nhật theo nội dung nguồn cung cấp và đánh dấu chưa xác minh. Nếu cần đính chính, hãy thêm một cập nhật mới.');
      await load();
    } catch (cause) {
      setError(`${createdSubjectName ? `Đã lưu hồ sơ “${createdSubjectName}”. ` : ''}${cause instanceof Error ? cause.message : 'Không thể lưu cập nhật này. Bản nháp vẫn còn.'}`);
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <section id="project-trend-updates" className="research-panel trend-updates-panel" aria-label="Cập nhật xu hướng của dự án">
    <header className="trend-updates-heading"><div><span className="state-label">GHI NHẬN THÔNG TIN</span><h3>Cập nhật xu hướng</h3>
      <p>Lưu nguyên văn quan sát kèm bối cảnh nguồn. Ứng dụng không tự mở hoặc xác minh liên kết, suy ra số liệu hay ghi đè cập nhật trước đó.</p></div></header>
    {error && <div role="alert" className="research-alert">{error}</div>}
    {notice && <div role="status" className="research-success">{notice}</div>}
    <form className="trend-update-form" onSubmit={(event) => void saveUpdate(event)}>
      <div className="trend-update-subject-choice" role="group" aria-label="Sản phẩm hoặc chủ đề của cập nhật này">
        <label className={`trend-update-subject-option${subjectMode === 'new' ? ' selected' : ''}`}><input type="radio" name="trend-subject-mode" checked={subjectMode === 'new'} onChange={() => setSubjectMode('new')} /><span><strong>Tạo hồ sơ sản phẩm hoặc chủ đề</strong><small>Dùng khi hồ sơ này chưa có trong danh sách.</small></span></label>
        <label className={`trend-update-subject-option${subjectMode === 'existing' ? ' selected' : ''}`}><input type="radio" name="trend-subject-mode" checked={subjectMode === 'existing'} disabled={subjects.length === 0} onChange={() => setSubjectMode('existing')} /><span><strong>Dùng hồ sơ đã lưu</strong><small>{subjects.length ? 'Lưu cập nhật cùng hồ sơ hiện có.' : 'Có thể dùng sau khi tạo hồ sơ.'}</small></span></label>
      </div>
      {subjectMode === 'new' ? <div className="trend-update-form-grid trend-update-new-subject">
        <label>Tên sản phẩm hoặc chủ đề <input required maxLength={500} value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} placeholder="Ví dụ: trò chơi, ứng dụng hoặc chủ đề thị trường" /></label>
        <label>Loại hồ sơ <span className="optional-label">Không bắt buộc</span><input maxLength={120} value={newSubjectType} onChange={(event) => setNewSubjectType(event.target.value)} placeholder="Mô tả theo cách của bạn" /></label>
      </div> : <div className="trend-update-form-grid">
        <label>Sản phẩm hoặc chủ đề <select required value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          <option value="">Chọn hồ sơ đã lưu…</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select></label>
      </div>}
      <div className="trend-update-form-grid">
        <label>Bộ so sánh <span className="optional-label">Không bắt buộc</span><select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
          <option value="">Chưa liên kết bộ so sánh</option>{collections.filter((collection) => collection.members.some((member) => member.subject_id === (subjectMode === 'existing' ? subjectId : ''))).map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
        </select></label>
        <label>Ngày nguồn được đăng <input type="date" required value={publishedOn} onChange={(event) => setPublishedOn(event.target.value)} /></label>
      </div>
      <label>Bạn đã quan sát thấy gì? <textarea required maxLength={20000} rows={3} value={exactClaim} onChange={(event) => setExactClaim(event.target.value)} placeholder="Ghi lại nguyên văn thông tin được cung cấp, không thêm diễn giải." /></label>
      <label>Bạn thấy thông tin ở đâu? <textarea required maxLength={10000} rows={2} value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="Mô tả bối cảnh và nơi bạn tìm thấy thông tin." /></label>
      <details className="trend-update-source-details"><summary>Thêm chi tiết nguồn</summary><div className="trend-update-source-detail-grid">
        <label>Tên nguồn <span className="optional-label">Không bắt buộc</span><input maxLength={500} value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /></label>
        <label>Liên kết nguồn <span className="optional-label">Không bắt buộc</span><input type="url" maxLength={2048} placeholder="https://…" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
      </div></details>
      <div className="trend-update-form-actions"><small>Cập nhật đã lưu không bị ghi đè và vẫn ở trạng thái chưa xác minh cho đến khi được kiểm tra độc lập.</small>
        <button type="submit" className="primary-action" disabled={saving || (subjectMode === 'existing' && !subjects.length)}>{saving ? 'Đang lưu cập nhật…' : 'Lưu cập nhật xu hướng'}</button>
      </div>
    </form>
    <div className="trend-update-history"><h4>Cập nhật đã lưu</h4>
      {loading && <p role="status">Đang tải cập nhật…</p>}
      {!loading && updates.length === 0 && <p>Dự án chưa có cập nhật nào.</p>}
      {updates.map((update) => <article className="trend-update-item" key={update.id}>
        <div className="trend-update-meta"><strong>{update.subject_name}</strong><span>{update.published_on}</span><span>Theo nguồn cung cấp · chưa xác minh</span>{update.collection_name && <span>{update.collection_name}</span>}</div>
        <p className="trend-update-claim">{update.exact_claim}</p>
        {update.source_title && <p className="trend-update-source-title">{update.source_title}</p>}
        <p className="trend-update-source-note">{update.source_note}</p>
        {update.source_url && <a href={update.source_url} target="_blank" rel="noopener noreferrer">Mở liên kết nguồn đã cung cấp</a>}
        <a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}&view=opportunities&decisionKind=trend_update&decisionTargetId=${encodeURIComponent(update.id)}`}>Xem quyết định PO</a>
      </article>)}
      {nextCursor && <button type="button" className="secondary-action" disabled={loading} onClick={() => void load(true)}>Tải thêm cập nhật</button>}
    </div>
  </section>;
}
