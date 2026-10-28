import { useEffect, useState, type ChangeEvent } from 'react';
import { researchApi, type ProjectSavedInformation, type ProjectTrendUpdate, type ResearchBenchmarkCollection, type ResearchSubject, type ResearchSubjectAnalysisSection, type ResearchSubjectSource } from './api';

function displayEvidenceStatus(value: string | null | undefined): string {
  const key = value?.trim().toLocaleLowerCase();
  if (key === 'source-reported · unverified' || key === 'source-reported - unverified') return 'Theo nguồn cung cấp · chưa xác minh';
  if (key === 'unverified') return 'Chưa xác minh độc lập';
  if (key === 'verified') return 'Đã xác minh độc lập';
  if (key === 'reported') return 'Do nguồn cung cấp';
  return value || 'Chưa có trạng thái xác minh';
}

function sourceKey(source: ResearchSubjectSource): string {
  return [source.source_kind, source.source_id, source.source_key].join('|');
}

export function ResearchSubjectsPanel({ projectId }: { projectId: string }) {
  const [subjects, setSubjects] = useState<ResearchSubject[]>([]);
  const [sources, setSources] = useState<ResearchSubjectSource[]>([]);
  const [collections, setCollections] = useState<ResearchBenchmarkCollection[]>([]);
  const [savedInformation, setSavedInformation] = useState<ProjectSavedInformation[]>([]);
  const [profileTrendUpdates, setProfileTrendUpdates] = useState<ProjectTrendUpdate[]>([]);
  const [profileTrendError, setProfileTrendError] = useState('');
  const [sourceCursor, setSourceCursor] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const requestedSubjectId = new URLSearchParams(window.location.search).get('subjectId');
  const requestedCollectionId = new URLSearchParams(window.location.search).get('collectionId');
  const [subjectsOpen, setSubjectsOpen] = useState(Boolean(requestedSubjectId || requestedCollectionId));
  const [profileId, setProfileId] = useState<string | null>(requestedSubjectId);
  const [analysisDrafts, setAnalysisDrafts] = useState<Record<string, ResearchSubjectAnalysisSection[]>>({});
  const [customSectionLabels, setCustomSectionLabels] = useState<Record<string, string>>({});
  const [collectionName, setCollectionName] = useState('');
  const [collectionSubjectDrafts, setCollectionSubjectDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(append = false) {
    setLoading(true); setError('');
    try {
      const [subjectPage, sourcePage, collectionPage, savedInformationPage] = await Promise.all([
        researchApi.listSubjects(projectId),
        researchApi.listSubjectSources(projectId, append ? sourceCursor ?? undefined : undefined),
        researchApi.listBenchmarkCollections(projectId),
        researchApi.listSavedInformation(projectId, { limit: 100 }).catch(() => ({ items: [], next_cursor: null, limit: 100 })),
      ]);
      setSubjects(subjectPage.items);
      setCollections(collectionPage.items);
      setSavedInformation(savedInformationPage.items);
      setSources((current) => append ? [...current, ...sourcePage.items] : sourcePage.items);
      setSourceCursor(sourcePage.next_cursor);
      setDrafts((current) => {
        const next = append ? { ...current } : {};
        for (const item of sourcePage.items) if (current[sourceKey(item)] === undefined) next[sourceKey(item)] = item.mapped_subject_id ?? '';
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được hồ sơ sản phẩm và chủ đề.');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void load();
    const refreshForProject = (event: Event) => {
      const changedProjectId = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (changedProjectId === projectId) void load();
    };
    window.addEventListener('project-saved-information-changed', refreshForProject);
    return () => window.removeEventListener('project-saved-information-changed', refreshForProject);
  }, [projectId]);

  useEffect(() => {
    const syncDeepLink = () => {
      const params = new URLSearchParams(window.location.search);
      const nextSubjectId = params.get('subjectId');
      const nextCollectionId = params.get('collectionId');
      if (nextSubjectId || nextCollectionId) {
        setSubjectsOpen(true);
        if (nextSubjectId) setProfileId(nextSubjectId);
        // A deep link can be pushed immediately after another panel creates a
        // subject. Refresh the list before rendering the selected profile so
        // the new identity does not appear as a stale empty state.
        void load();
      }
    };
    window.addEventListener('popstate', syncDeepLink);
    return () => window.removeEventListener('popstate', syncDeepLink);
  }, []);

  useEffect(() => {
    if (!profileId) { setProfileTrendUpdates([]); setProfileTrendError(''); return; }
    let current = true;
    setProfileTrendUpdates([]); setProfileTrendError('');
    void researchApi.listTrendUpdates(projectId, { subject_id: profileId, limit: 100 })
      .then((page) => { if (current) setProfileTrendUpdates(page.items); })
      .catch((reason) => { if (current) setProfileTrendError(reason instanceof Error ? reason.message : 'Không tải được cập nhật xu hướng của hồ sơ.'); });
    return () => { current = false; };
  }, [projectId, profileId]);

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
      setNotice(createFromSource ? 'Đã tạo hồ sơ từ tên trong nguồn và liên kết.' : 'Đã liên kết nguồn với hồ sơ đã chọn.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không lưu được liên kết hồ sơ.');
      await load();
    } finally { setBusy(null); }
  }

  async function saveName(subject: ResearchSubject) {
    setBusy(subject.id); setError(''); setNotice('');
    try {
      await researchApi.updateSubject(projectId, subject.id, { name: editName });
      setEditingId(null); setNotice('Đã lưu tên hồ sơ.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không cập nhật được hồ sơ.'); }
    finally { setBusy(null); }
  }

  function toggleProfile(subject: ResearchSubject) {
    if (profileId === subject.id) { setProfileId(null); return; }
    setProfileId(subject.id);
    setAnalysisDrafts((current) => current[subject.id] !== undefined ? current : ({ ...current, [subject.id]: (subject.analysis_sections ?? []).map((item) => ({ ...item })) }));
    setError(''); setNotice('');
  }

  function editAnalysisSection(subjectId: string, key: string, field: 'label' | 'content', value: string) {
    setAnalysisDrafts((current) => ({ ...current, [subjectId]: (current[subjectId] ?? []).map((item) => item.key === key ? { ...item, [field]: value } : item) }));
  }

  function addAnalysisSection(subject: ResearchSubject, label: string) {
    const cleanLabel = label.trim();
    if (!cleanLabel) return;
    const sections = analysisDrafts[subject.id] ?? subject.analysis_sections ?? [];
    if (sections.some((item) => item.label.trim().toLocaleLowerCase() === cleanLabel.toLocaleLowerCase())) {
      setError('Hồ sơ này đã có phần phân tích cùng tên.'); return;
    }
    const key = `${cleanLabel.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-') || 'section'}-${Date.now()}`;
    setAnalysisDrafts((current) => ({ ...current, [subject.id]: [...(current[subject.id] ?? subject.analysis_sections ?? []), { key, label: cleanLabel, content: '' }] }));
    setCustomSectionLabels((current) => ({ ...current, [subject.id]: '' })); setError(''); setNotice('');
  }

  function changeCustomSectionLabel(subjectId: string, event: ChangeEvent<HTMLInputElement>) {
    setCustomSectionLabels((current) => ({ ...current, [subjectId]: event.target.value }));
  }

  async function saveAnalysis(subject: ResearchSubject) {
    const sections = analysisDrafts[subject.id] ?? [];
    if (sections.some((item) => !item.label.trim() || !item.content.trim())) {
      setError('Hãy thêm nội dung cho mỗi phần hoặc bỏ phần trống trước khi lưu.'); return;
    }
    setBusy(`analysis:${subject.id}`); setError(''); setNotice('');
    try {
      await researchApi.updateSubject(projectId, subject.id, { analysis_sections: sections.map((item) => ({ ...item, label: item.label.trim(), content: item.content.trim() })) });
      setNotice('Đã lưu phần phân tích. Đây là ghi chú của bạn, chưa được xác minh độc lập.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được phân tích. Bản nháp vẫn còn trên trang.'); }
    finally { setBusy(null); }
  }

  async function createCollection() {
    if (!collectionName.trim()) return;
    setBusy('new-collection'); setError(''); setNotice('');
    try {
      await researchApi.createBenchmarkCollection(projectId, { name: collectionName.trim() });
      setCollectionName(''); setNotice('Đã tạo bộ so sánh. Chỉ thêm những hồ sơ bạn muốn đối chiếu.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tạo bộ so sánh này.'); }
    finally { setBusy(null); }
  }

  async function updateCollectionMember(collection: ResearchBenchmarkCollection, subjectId: string, add: boolean) {
    const key = `${collection.id}:${subjectId}`;
    setBusy(key); setError(''); setNotice('');
    try {
      if (add) await researchApi.addBenchmarkCollectionSubject(projectId, collection.id, subjectId);
      else await researchApi.removeBenchmarkCollectionSubject(projectId, collection.id, subjectId);
      setNotice(add ? `Đã thêm hồ sơ vào ${collection.name}.` : `Đã gỡ hồ sơ khỏi ${collection.name}. Danh tính và liên kết nguồn đã lưu vẫn được giữ.`);
      setCollectionSubjectDrafts((current) => ({ ...current, [collection.id]: '' }));
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể cập nhật bộ so sánh này.'); }
    finally { setBusy(null); }
  }

  function renderSubjectProfile(subject: ResearchSubject) {
    const savedSections = subject.analysis_sections ?? [];
    const sections = analysisDrafts[subject.id] ?? savedSections;
    const hasChanges = JSON.stringify(savedSections) !== JSON.stringify(sections);
    const linkedSources = sources.filter((source) => source.mapped_subject_id === subject.id);
    const savedItems = savedInformation.filter((item) => item.subject_id === subject.id);
    const trendItems = profileTrendUpdates.filter((item) => item.subject_id === subject.id);
    const subjectCollections = collections.filter((collection) => collection.members.some((member) => member.subject_id === subject.id));
    return <article className="research-subject-item research-subject-profile-item" key={subject.id}>
      <div className="research-subject-profile-heading">
        {editingId === subject.id ? <><label>Tên hồ sơ<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
          <button type="button" className="secondary-action" disabled={busy === subject.id || !editName.trim()} onClick={() => void saveName(subject)}>Lưu tên</button>
          <button type="button" className="text-button" onClick={() => setEditingId(null)}>Hủy</button></>
          : <><div><strong>{subject.name}</strong><small>{subject.subject_type || 'Chưa phân loại'}{subject.aliases.length ? ` · ${subject.aliases.join(', ')}` : ''}</small></div>
            <button type="button" className="text-button" onClick={() => { setEditingId(subject.id); setEditName(subject.name); }}>Sửa tên</button>
            <button type="button" className="secondary-action" aria-expanded={profileId === subject.id} onClick={() => toggleProfile(subject)}>{profileId === subject.id ? 'Đóng hồ sơ' : 'Mở hồ sơ'}</button></>}
      </div>
      {profileId === subject.id && <section className="research-subject-profile" aria-label={`Hồ sơ ${subject.name}`}>
        <div className="research-subject-profile-summary"><div><h4>{subject.name}</h4><p>{subject.subject_type || 'Chưa phân loại'} · {linkedSources.length} nguồn liên kết · {trendItems.length} cập nhật xu hướng · {savedItems.length} mục đã lưu · {subjectCollections.length} bộ so sánh · {savedSections.length} phần phân tích đã lưu</p></div>
          <nav aria-label={`Các khu vực liên quan đến ${subject.name}`}><a href={`/research?projectId=${encodeURIComponent(projectId)}&view=opportunities&decisionKind=subject&decisionTargetId=${encodeURIComponent(subject.id)}`}>Xem quyết định PO</a><a href={`/research?projectId=${encodeURIComponent(projectId)}&view=data#project-saved-information`}>Thông tin đã lưu</a><a href="#project-trend-updates">Cập nhật xu hướng</a><a href="#project-image-evidence">Ảnh chứng cứ</a><a href="#project-benchmark-collections">Bộ so sánh</a></nav></div>
        <div className="research-subject-profile-details"><p><strong>Tên gọi khác:</strong> {subject.aliases.length ? subject.aliases.join(', ') : 'Chưa có thông tin'}</p>
          <p><strong>Mã định danh ngoài:</strong> {subject.external_ids.length ? 'Có trong chi tiết nguồn' : 'Chưa có thông tin'}</p>
          <details><summary>Chi tiết định danh từ nguồn</summary><ul>
            {subject.external_ids.map((item, index) => <li key={`${item.provider}:${item.value}:${index}`}>{item.provider}: {item.value}</li>)}
            {Object.entries(subject.provenance).map(([key, value]) => <li key={key}>{key}: {typeof value === 'string' ? value : JSON.stringify(value)}</li>)}
          </ul></details>
        </div>
        <section className="research-subject-history" aria-label={`Thông tin đã lưu về ${subject.name}`}>
          <div><h5>Thông tin đã lưu về sản phẩm hoặc chủ đề</h5><p>Nội dung gốc và tệp đính kèm được giữ nguyên như khi cung cấp; chưa được xác minh độc lập.</p></div>
          {!savedItems.length ? <p>Hồ sơ này chưa có thông tin liên kết. Bạn có thể liên kết từ mục thông tin đã lưu của dự án.</p> : <div className="research-subject-history-list">{savedItems.slice(0, 10).map((item) => <article key={item.id}>
            <div><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('vi-VN')}</time><span>Do nguồn cung cấp · chưa xác minh</span></div>
            {item.source_title && <strong>{item.source_title}</strong>}
            <p>{item.original_content}</p>
            {item.source_context && <small>{item.source_context}</small>}
            {item.source_url && <a href={item.source_url} target="_blank" rel="noopener noreferrer">Mở nguồn đã cung cấp</a>}
            {item.image_url && <figure><img src={item.image_url} alt={`Tệp đính kèm của ${subject.name}: ${item.image_filename || 'thông tin đã lưu'}`} /><figcaption>{item.image_filename} · Tệp lưu trên thiết bị · chưa xác minh</figcaption></figure>}
          </article>)}</div>}
        </section>
        <section className="research-subject-history" aria-label={`Cập nhật xu hướng về ${subject.name}`}>
          <div><h5>Cập nhật xu hướng</h5><p>Những cập nhật được gắn rõ với hồ sơ này; nội dung vẫn được giữ nguyên và chưa xác minh độc lập.</p></div>
          {profileTrendError ? <p role="alert">{profileTrendError}</p> : trendItems.length === 0 ? <p>Chưa có cập nhật xu hướng được liên kết với hồ sơ này.</p> : <div className="research-subject-history-list">{trendItems.map((item) => <article key={item.id}>
            <div><time dateTime={item.published_on}>{new Date(`${item.published_on}T00:00:00`).toLocaleDateString('vi-VN')}</time><span>Theo nguồn cung cấp · chưa xác minh</span></div>
            {item.source_title && <strong>{item.source_title}</strong>}
            <p>{item.exact_claim}</p>
            <small>{item.source_note}</small>
            {item.source_url && <a href={item.source_url} target="_blank" rel="noopener noreferrer">Mở nguồn đã cung cấp</a>}
            <a href={`/research?projectId=${encodeURIComponent(projectId)}&view=opportunities&decisionKind=trend_update&decisionTargetId=${encodeURIComponent(item.id)}`}>Xem quyết định PO cho cập nhật này</a>
          </article>)}</div>}
        </section>
        <section className="research-subject-analysis" aria-label={`Phân tích thêm về ${subject.name}`}>
          <div><h5>Phân tích của PO (không bắt buộc)</h5><p>Đây là ghi chú làm việc của bạn, được lưu riêng với nội dung do nguồn cung cấp. Bạn có thể tự đặt tên cho từng phần.</p></div>
          <div className="research-subject-analysis-starters" aria-label="Gợi ý các phần phân tích">
            {['Vòng lặp cốt lõi', 'Thiết kế màn chơi', 'Vị trí quảng cáo'].map((label) => <button type="button" className="text-button" key={label} disabled={sections.some((item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase())} onClick={() => addAnalysisSection(subject, label)}>Thêm {label}</button>)}
          </div>
          <form className="research-subject-analysis-custom" onSubmit={(event) => { event.preventDefault(); addAnalysisSection(subject, customSectionLabels[subject.id] ?? ''); }}>
            <label htmlFor={`custom-analysis-${subject.id}`}>Tên phần tự đặt</label><input id={`custom-analysis-${subject.id}`} maxLength={120} value={customSectionLabels[subject.id] ?? ''} onChange={(event) => changeCustomSectionLabel(subject.id, event)} placeholder="Nhập chủ đề phù hợp với hồ sơ này" />
            <button className="secondary-action" type="submit" disabled={!(customSectionLabels[subject.id] ?? '').trim()}>Thêm phần</button>
          </form>
          {!sections.length && <p>Chưa có phần phân tích nào.</p>}
          <div className="research-subject-analysis-list">{sections.map((section) => <article key={section.key}>
            <label>Tên phần<input maxLength={120} value={section.label} onChange={(event) => editAnalysisSection(subject.id, section.key, 'label', event.target.value)} /></label>
            <label>Phân tích của PO<textarea rows={3} maxLength={20_000} value={section.content} onChange={(event) => editAnalysisSection(subject.id, section.key, 'content', event.target.value)} placeholder={`Ghi chú cho phần ${section.label}.`} /></label>
            <button type="button" className="text-button" onClick={() => setAnalysisDrafts((current) => ({ ...current, [subject.id]: (current[subject.id] ?? []).filter((item) => item.key !== section.key) }))}>Bỏ khỏi bản nháp</button>
          </article>)}</div>
          <div className="research-subject-analysis-actions">{hasChanges && <span>Chưa lưu thay đổi</span>}
            <button type="button" className="primary-action" disabled={!hasChanges || busy === `analysis:${subject.id}`} onClick={() => void saveAnalysis(subject)}>{busy === `analysis:${subject.id}` ? 'Đang lưu phân tích…' : 'Lưu phân tích PO'}</button>
            {hasChanges && <button type="button" className="text-button" onClick={() => setAnalysisDrafts((current) => ({ ...current, [subject.id]: savedSections.map((item) => ({ ...item })) }))}>Bỏ thay đổi</button>}
          </div>
        </section>
      </section>}
    </article>;
  }

  return <details className="research-subjects-panel" open={subjectsOpen} onToggle={(event) => setSubjectsOpen(event.currentTarget.open)}>
    <summary><span>Hồ sơ sản phẩm và chủ đề</span><small>{subjects.length} hồ sơ · dùng lại trong dự án</small></summary>
    <div className="research-subjects-content">
      <p>Tên trong báo cáo và tệp CSV được giữ theo từng nguồn cho đến khi bạn liên kết. Tên tương tự không bao giờ tự động bị gộp.</p>
      {error && <div className="research-alert" role="alert">{error}</div>}
      {notice && <div className="research-success" role="status">{notice}</div>}
      {loading && !subjects.length && !sources.length ? <p role="status">Đang tải hồ sơ và định danh nguồn…</p> : <>
        <section id="project-subject-profiles" aria-label="Hồ sơ đã lưu" className="research-subject-list">
          <h3>Hồ sơ trong dự án</h3>
          {subjects.length ? subjects.map(renderSubjectProfile) : <p>Chưa có hồ sơ nào được lưu để dùng lại.</p>}
        </section>
        <section id="project-benchmark-collections" aria-label="Bộ so sánh của dự án" className="research-benchmark-collections">
          <div className="research-collections-heading"><div><h3>Bộ so sánh</h3><p>Nhóm các hồ sơ đã xác nhận để dùng lại. Báo cáo nguồn và dữ liệu CSV không bị thay đổi.</p></div></div>
          <form className="research-collection-create" onSubmit={(event) => { event.preventDefault(); void createCollection(); }}>
            <label htmlFor="new-benchmark-collection">Tên bộ so sánh</label>
            <input id="new-benchmark-collection" value={collectionName} onChange={(event) => setCollectionName(event.target.value)} placeholder="Ví dụ: Sản phẩm cần đối chiếu" maxLength={200} />
            <button type="submit" className="secondary-action" disabled={!collectionName.trim() || busy === 'new-collection'}>{busy === 'new-collection' ? 'Đang tạo…' : 'Tạo bộ so sánh'}</button>
          </form>
          {!collections.length ? <p>Chưa có bộ so sánh. Tạo bộ mới rồi thêm các hồ sơ của dự án khi bạn sẵn sàng.</p> : collections.map((collection) => {
            const memberIds = new Set(collection.members.map((member) => member.subject_id));
            const availableSubjects = subjects.filter((subject) => !memberIds.has(subject.id));
            const selectedSubject = collectionSubjectDrafts[collection.id] ?? '';
            return <article className={`research-benchmark-collection${requestedCollectionId === collection.id ? ' is-requested' : ''}`} key={collection.id}>
              <header><div><strong>{collection.name}</strong><small>{collection.members.length} hồ sơ · thuộc dự án</small>{collection.description && <p>{collection.description}</p>}<a href={`/research?projectId=${encodeURIComponent(projectId)}&view=opportunities&decisionKind=collection&decisionTargetId=${encodeURIComponent(collection.id)}`}>Xem quyết định PO cho bộ này</a></div></header>
              {collection.members.length ? <ul>{collection.members.map((member) => <li key={member.subject_id}>
                <div><strong>{member.name}</strong><small>{member.subject_type || 'Chưa phân loại'} · {member.source_count} nguồn đã liên kết ({member.report_source_count} báo cáo, {member.csv_source_count} tệp CSV, {member.trend_update_count} cập nhật xu hướng)</small></div>
                <button type="button" className="text-button" disabled={busy === `${collection.id}:${member.subject_id}`} onClick={() => void updateCollectionMember(collection, member.subject_id, false)}>Gỡ khỏi bộ so sánh</button>
              </li>)}</ul> : <p>Bộ so sánh này chưa có hồ sơ. Hãy thêm các hồ sơ đã xác nhận để bắt đầu đối chiếu.</p>}
              {collection.members.length > 0 && <details className="research-collection-matrix">
                <summary>Xem đối chiếu theo nguồn{collection.dimensions.length ? ` · ${collection.dimensions.length} khía cạnh được cung cấp` : ''}</summary>
                {collection.dimensions.length ? <div className="research-collection-matrix-scroll"><table><thead><tr><th scope="col">Hồ sơ</th>{collection.dimensions.map((dimension) => <th scope="col" key={dimension.key}>{dimension.name}<small>{dimension.source_kind === 'report_entity' ? 'Từ báo cáo' : dimension.source_kind === 'trend_update' ? 'Cập nhật do nguồn cung cấp' : 'Nhập từ CSV'}</small></th>)}</tr></thead>
                  <tbody>{collection.members.map((member) => <tr key={member.subject_id}><th scope="row">{member.name}</th>{collection.dimensions.map((dimension) => {
                    const values = member.observations.filter((observation) => observation.dimension_key === dimension.key);
                    return <td key={dimension.key}>{values.length ? values.map((observation, index) => <div className="research-collection-observation" key={`${observation.source_name}:${index}`}>
                      <strong>{observation.value === null || observation.value === undefined || observation.value === '' ? 'Chưa có dữ liệu' : String(observation.value)}{observation.unit ? ` ${observation.unit}` : ''}</strong>
                      <small>{observation.source_name} · {observation.source_kind === 'trend_update' ? 'Do nguồn cung cấp · chưa xác minh' : displayEvidenceStatus(observation.verification_status)}</small>
                      {observation.source_note && <small>Ghi chú nguồn: {observation.source_note}</small>}
                      {Object.entries(observation.scope).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => <small key={label}>{label}: {String(value)}</small>)}
                      {observation.evidence_status && <small>Trạng thái chứng cứ: {displayEvidenceStatus(observation.evidence_status)}</small>}
                      {observation.uncertainty && <small>Điểm chưa chắc chắn: {observation.uncertainty}</small>}
                      {observation.validation_reasons.length > 0 && <details className="research-collection-validation"><summary>Lý do cần kiểm tra · {observation.validation_reasons.length}</summary><ul>{observation.validation_reasons.map((reason, reasonIndex) => <li key={`${reasonIndex}:${reason}`}>{reason}</li>)}</ul></details>}
                      {observation.evidence_references.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Mở nguồn tham khảo</a>)}
                      {observation.source_locations.map((location, locationIndex) => <small key={`${locationIndex}:${location}`}>{location}</small>)}
                    </div>) : <span className="research-collection-unknown">Chưa có dữ liệu</span>}</td>;
                  })}</tr>)}</tbody></table></div> : <p>Chưa có khía cạnh từ báo cáo hoặc số liệu CSV đã liên kết. Thông tin còn thiếu sẽ được để trống, không tự suy đoán.</p>}
              </details>}
              <div className="research-collection-add">
                <label className="sr-only" htmlFor={`collection-subject-${collection.id}`}>Chọn hồ sơ của dự án để thêm vào {collection.name}</label>
                <select id={`collection-subject-${collection.id}`} value={selectedSubject} onChange={(event) => setCollectionSubjectDrafts((current) => ({ ...current, [collection.id]: event.target.value }))} disabled={!availableSubjects.length}>
                  <option value="">{availableSubjects.length ? 'Chọn hồ sơ đã xác nhận…' : 'Tất cả hồ sơ đã lưu đều nằm trong bộ này'}</option>
                  {availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
                <button type="button" className="secondary-action" disabled={!selectedSubject || busy === `${collection.id}:${selectedSubject}`} onClick={() => void updateCollectionMember(collection, selectedSubject, true)}>Thêm hồ sơ</button>
              </div>
            </article>;
          })}
        </section>
        <section aria-label="Tên sản phẩm trong báo cáo và CSV" className="research-subject-sources">
          <h3>Tên sản phẩm xuất hiện trong nguồn của dự án</h3>
          {!sources.length ? <p>Chưa có tên sản phẩm có cấu trúc từ báo cáo hoặc CSV để liên kết.</p> : sources.map((source) => {
            const key = sourceKey(source);
            const selected = drafts[key] ?? source.mapped_subject_id ?? '';
            return <article className="research-subject-source" key={key}>
              <div><strong>{source.source_name}</strong><small>{source.source_kind === 'report_entity' ? 'Báo cáo' : 'CSV'} · {source.context_name}</small>
                {source.source_state === 'stale' && <small role="status">Liên kết lịch sử · nguồn hiện không còn tên định danh này</small>}
                {source.mapped_subject_name && <small>Đã liên kết với {source.mapped_subject_name}</small>}</div>
              {source.source_state === 'available' && <div className="research-subject-source-actions">
                <label className="sr-only" htmlFor={`subject-target-${encodeURIComponent(key)}`}>Liên kết {source.source_name} với hồ sơ đã lưu</label>
                <select id={`subject-target-${encodeURIComponent(key)}`} value={selected} disabled={busy === key || subjects.length === 0}
                  onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}>
                  <option value="">Chọn hồ sơ đã lưu…</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
                {subjects.length > 0 && <button type="button" className="secondary-action" disabled={busy === key || !selected || selected === source.mapped_subject_id}
                  onClick={() => void mapSource(source)}>{busy === key ? 'Đang lưu…' : source.mapped_subject_id ? 'Đổi liên kết' : 'Liên kết hồ sơ'}</button>}
                {!source.mapped_subject_id && <button type="button" className="text-button" disabled={busy === key}
                  onClick={() => void mapSource(source, true)}>{busy === key ? 'Đang tạo…' : 'Tạo hồ sơ từ tên này'}</button>}
              </div>}
            </article>;
          })}
          {sourceCursor && <button type="button" className="secondary-action" disabled={loading} onClick={() => void load(true)}>{loading ? 'Đang tải…' : 'Tải thêm tên sản phẩm'}</button>}
        </section>
      </>}
    </div>
  </details>;
}
