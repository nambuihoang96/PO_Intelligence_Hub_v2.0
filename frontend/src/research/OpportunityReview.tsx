import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { researchApi, type OpportunityAssessment, type OpportunityCandidate, type OpportunityDecision, type OpportunityEvidenceReference, type OpportunityReport, type OpportunityWorkspace } from './api';
import { ProjectJourneyNav } from './ProjectJourneyNav';

const dimensionSuggestions = ['Market signal', 'Product differentiation', 'User motivation', 'Retention evidence', 'Monetization evidence', 'Product feasibility', 'Competitive risk', 'Research gaps'];
const dimensionLabels: Record<string, string> = { 'Market signal': 'Tín hiệu thị trường', 'Product differentiation': 'Khác biệt sản phẩm', 'User motivation': 'Động lực người dùng', 'Retention evidence': 'Bằng chứng duy trì', 'Monetization evidence': 'Bằng chứng kiếm tiền', 'Product feasibility': 'Tính khả thi sản phẩm', 'Competitive risk': 'Rủi ro cạnh tranh', 'Research gaps': 'Khoảng trống nghiên cứu' };
const showDimension = (value: string) => dimensionLabels[value] ?? value;
const decisionLabels: Record<NonNullable<OpportunityDecision['decision_status']>, string> = {
  investigate: 'Tìm hiểu thêm', benchmark: 'So sánh chuyên sâu', experiment: 'Kiểm chứng bằng thử nghiệm',
  implementation_candidate: 'Đề xuất triển khai', hold: 'Tạm hoãn', reject: 'Từ chối có lý do',
};
const assessmentKinds: Record<OpportunityAssessment['kind'], string> = {
  observed_fact: 'Sự kiện đã quan sát', research_finding: 'Phát hiện nghiên cứu', hypothesis: 'Giả thuyết', po_judgment: 'Đánh giá của PO', unknown: 'Chưa rõ',
};
const priorityLabels: Record<OpportunityDecision['priority'], string> = { high: 'Cao', medium: 'Trung bình', low: 'Thấp', not_assessed: 'Chưa đánh giá' };
function verificationLabel(value: unknown): string {
  if (value === 'verified') return 'Đã xác minh';
  if (value === 'partially_verified') return 'Xác minh một phần';
  return 'Chưa xác minh';
}
function targetKindLabel(value: string): string {
  const labels: Record<string, string> = {
    report_finding: 'Phát hiện trong báo cáo', report_entity: 'Đối tượng trong báo cáo',
    csv_entity: 'Sản phẩm trong dữ liệu', research_subject: 'Chủ đề nghiên cứu', collection: 'Bộ sưu tập', trend_update: 'Cập nhật xu hướng',
  };
  return labels[value] ?? 'Nội dung nghiên cứu';
}
function selectionReasonLabel(value: string): string {
  const labels: Record<string, string> = {
    'PO decision for this research project': 'Quyết định cho dự án nghiên cứu',
    'PO decision for this research subject': 'Quyết định cho chủ đề nghiên cứu',
  };
  return labels[value] ?? value;
}
function datasetNameLabel(value: string): string {
  if (value === 'Project workspace') return 'Dự án nghiên cứu';
  if (value === 'Project subject') return 'Chủ đề trong dự án';
  return value;
}
function evidenceGapLabel(value: string): string {
  const labels: Record<string, string> = {
    'No current quantitative observations resolve to this candidate.': 'Chưa có số liệu định lượng hiện hành được liên kết với nội dung này.',
    'No qualitative report finding has been explicitly linked to this candidate.': 'Chưa liên kết phát hiện định tính nào từ báo cáo với nội dung này.',
    'No PO assessment or qualitative finding has been saved for this candidate.': 'Chưa lưu đánh giá của PO hoặc phát hiện định tính cho nội dung này.',
  };
  return labels[value] ?? value;
}
function environmentLabel(value: string): string {
  if (value === 'Global / not specified') return 'Toàn cầu / chưa chỉ định';
  if (value === 'Unknown') return 'Chưa rõ';
  return value;
}

function decisionDraft(candidate: OpportunityCandidate): OpportunityDecision {
  return candidate.decision ?? {
    candidate_id: candidate.candidate_id, expected_revision: 0, dataset_id: candidate.dataset_id, dataset_content_sha256: candidate.dataset_content_sha256,
    source_entity_id: candidate.source_entity_id, decision_target: candidate.decision_target ?? null, decision_status: null, rationale: '', supporting_evidence: [],
    contradictory_evidence: [], open_questions: [], assessments: [], priority: 'not_assessed', review_date: null, next_action: '',
  };
}

function reportRef(report: OpportunityReport, kind: 'report_finding' | 'report_entity', itemKey: string): OpportunityEvidenceReference {
  return { kind, report_id: report.report_id, report_content_sha256: report.content_sha256, item_key: itemKey };
}

function sameRef(left: OpportunityEvidenceReference, right: OpportunityEvidenceReference): boolean {
  const sameOptionalValue = <Key extends keyof OpportunityEvidenceReference>(key: Key) => (left[key] ?? null) === (right[key] ?? null);
  return left.kind === right.kind && sameOptionalValue('dataset_id') && sameOptionalValue('source_entity_id')
    && sameOptionalValue('source_row_number') && sameOptionalValue('metric_id') && sameOptionalValue('report_id')
    && sameOptionalValue('report_content_sha256') && sameOptionalValue('item_key');
}

function normalizedQuestions(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function decisionSnapshot(value: OpportunityDecision, questions: string): string {
  const { revision: _revision, expected_revision: _expectedRevision, ...content } = value;
  return JSON.stringify({ ...content, open_questions: normalizedQuestions(questions) });
}

function quantitativeRef(item: Record<string, unknown>): OpportunityEvidenceReference {
  return { kind: 'quantitative', dataset_id: String(item.dataset_id), source_entity_id: String(item.source_entity_id),
    source_row_number: typeof item.source_row_number === 'number' ? item.source_row_number : null,
    metric_id: typeof item.metric_id === 'string' ? item.metric_id : null };
}

export function OpportunityReview({ projectId }: { projectId: string }) {
  const [workspace, setWorkspace] = useState<OpportunityWorkspace | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [decision, setDecision] = useState<OpportunityDecision | null>(null);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [evidenceRole, setEvidenceRole] = useState<'supporting_evidence' | 'contradictory_evidence'>('supporting_evidence');
  const [assessmentDimension, setAssessmentDimension] = useState('');
  const [questionDraft, setQuestionDraft] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'saving' | 'failed'>('saved');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const revision = useRef(0);
  const loadRevision = useRef(0);
  const baseline = useRef<{ candidateId: string; snapshot: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<null | { type: 'candidate'; candidateId: string } | { type: 'refresh' } | { type: 'navigate'; href: string }>(null);

  async function load() {
    const requestRevision = ++loadRevision.current;
    setLoading(true); setError('');
    try {
      const result = await researchApi.getOpportunities(projectId);
      if (requestRevision !== loadRevision.current) return;
      setWorkspace(result);
      const params = new URLSearchParams(window.location.search);
      const requestedKind = params.get('decisionKind');
      const requestedTarget = result.candidates.find((candidate) => {
        const target = candidate.decision_target;
        if (!target || target.kind !== requestedKind) return false;
        if (target.kind === 'report_finding' || target.kind === 'report_entity') {
          return target.report_id === params.get('decisionReportId') && target.report_content_sha256 === params.get('decisionReportHash') && target.item_key === params.get('decisionItemKey');
        }
        return target.target_id === params.get('decisionTargetId');
      });
      setSelectedId((current) => result.candidates.some((candidate) => candidate.candidate_id === current)
        ? current : requestedTarget?.candidate_id ?? result.candidates[0]?.candidate_id ?? '');
    } catch (cause) { if (requestRevision === loadRevision.current) setError(cause instanceof Error ? cause.message : 'Không tải được phần đánh giá quyết định.'); }
    finally { if (requestRevision === loadRevision.current) setLoading(false); }
  }
  useEffect(() => { void load(); }, [projectId]);

  const candidate = workspace?.candidates.find((item) => item.candidate_id === selectedId) ?? null;
  useEffect(() => {
    revision.current += 1;
    const nextDecision = candidate ? decisionDraft(candidate) : null;
    const nextQuestions = candidate?.decision?.open_questions.join('\n') ?? '';
    setDecision(nextDecision); setQuestionDraft(nextQuestions); setSaveState('saved'); setError(''); setNotice('');
    baseline.current = nextDecision ? { candidateId: nextDecision.candidate_id, snapshot: decisionSnapshot(nextDecision, nextQuestions) } : null;
    const linkedReport = candidate?.decision?.assessments.flatMap((assessment) => assessment.evidence_refs)
      .find((reference) => reference.kind.startsWith('report_'));
    const target = candidate?.decision_target;
    const contextualReport = target && (target.kind === 'report_finding' || target.kind === 'report_entity')
      ? workspace?.reports.find((item) => item.report_id === target.report_id
        && item.content_sha256 === target.report_content_sha256
        && (target.kind === 'report_finding' ? item.findings.some((finding) => finding.key === target.item_key) : item.entities.some((entity) => entity.key === target.item_key)))
      : undefined;
    setSelectedReportId(contextualReport?.report_id ?? linkedReport?.report_id ?? '');
  }, [candidate?.candidate_id]);

  const hasUnsavedChanges = Boolean(candidate && decision?.candidate_id === candidate.candidate_id && baseline.current?.candidateId === candidate.candidate_id
    && decisionSnapshot(decision, questionDraft) !== baseline.current.snapshot);

  useEffect(() => {
    if (!hasUnsavedChanges && saveState !== 'saving') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges, saveState]);

  const filtered = useMemo(() => (workspace?.candidates ?? []).filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) &&
    (statusFilter === 'all' || item.decision?.decision_status === statusFilter) &&
    (priorityFilter === 'all' || (item.decision?.priority ?? 'not_assessed') === priorityFilter)),
  [workspace, search, statusFilter, priorityFilter]);
  const investigateCount = workspace?.candidates.filter((item) => item.decision?.decision_status === 'investigate').length ?? 0;
  const benchmarkCount = workspace?.candidates.filter((item) => item.decision?.decision_status === 'benchmark').length ?? 0;
  const followupCount = workspace?.candidates.filter((item) => Boolean(item.decision?.next_action.trim()) && !['hold', 'reject'].includes(item.decision?.decision_status ?? '')).length ?? 0;
  const reviewCount = workspace?.candidates.filter((item) => item.stale || item.evidence_gaps.length > 0).length ?? 0;
  const savedCount = workspace?.candidates.filter((item) => item.decision !== null).length ?? 0;
  const report = workspace?.reports.find((item) => item.report_id === selectedReportId);
  const assessmentEvidenceOptions = [
    ...(candidate?.quantitative_evidence ?? []).map((raw) => {
      const item = raw as Record<string, unknown>;
      return { reference: quantitativeRef(item), label: `${String(item.metric_definition || item.metric_id || 'Chỉ số')} · dòng dữ liệu ${String(item.source_row_number ?? 'chưa rõ')}` };
    }),
    ...(report?.findings ?? []).map((finding) => ({ reference: reportRef(report!, 'report_finding', finding.key), label: `Phát hiện trong báo cáo · ${finding.title}` })),
    ...(report?.entities ?? []).map((entity) => ({ reference: reportRef(report!, 'report_entity', entity.key), label: `Đối tượng trong báo cáo · ${entity.name}` })),
  ];
  const visibleSaveState = saveState === 'saving' ? 'saving' : saveState === 'failed' && hasUnsavedChanges ? 'failed' : hasUnsavedChanges ? 'unsaved' : 'saved';

  function requestCandidate(candidateId: string) {
    if (candidateId === selectedId) return;
    if (saveState === 'saving') return;
    if (hasUnsavedChanges) setPendingAction({ type: 'candidate', candidateId });
    else setSelectedId(candidateId);
  }

  function requestRefresh() {
    if (saveState === 'saving') return;
    if (hasUnsavedChanges) setPendingAction({ type: 'refresh' });
    else void load();
  }

  function requestNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (saveState === 'saving') { event.preventDefault(); return; }
    if (hasUnsavedChanges) {
      event.preventDefault(); setPendingAction({ type: 'navigate', href: event.currentTarget.href });
    }
  }

  function completePendingAction() {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action.type === 'candidate') setSelectedId(action.candidateId);
    else if (action.type === 'refresh') void load();
    else window.location.assign(action.href);
  }

  function discardAndContinue() {
    completePendingAction();
  }

  function changeDecision(patch: Partial<OpportunityDecision>) {
    revision.current += 1; setSaveState('unsaved'); setNotice('');
    setDecision((current) => current ? { ...current, ...patch } : current);
  }
  function toggleEvidence(reference: OpportunityEvidenceReference, targetRole = evidenceRole) {
    const field = targetRole;
    const current = decision?.[field] ?? [];
    const exists = current.some((item) => sameRef(item, reference));
    changeDecision({ [field]: exists ? current.filter((item) => !sameRef(item, reference)) : [...current, reference] });
  }
  function addAssessment() {
    const dimension = assessmentDimension.trim();
    if (!dimension || (decision?.assessments ?? []).some((item) => item.dimension.toLowerCase() === dimension.toLowerCase())) return;
    changeDecision({ assessments: [...(decision?.assessments ?? []), { dimension, kind: 'unknown', statement: '', evidence_refs: [] }] });
    setAssessmentDimension('');
  }
  function toggleAssessmentEvidence(index: number, reference: OpportunityEvidenceReference) {
    if (!decision) return;
    const assessment = decision.assessments[index];
    const exists = assessment.evidence_refs.some((item) => sameRef(item, reference));
    changeDecision({ assessments: decision.assessments.map((item, itemIndex) => itemIndex === index
      ? { ...item, evidence_refs: exists ? item.evidence_refs.filter((ref) => !sameRef(ref, reference)) : [...item.evidence_refs, reference] }
      : item) });
  }
  async function save(): Promise<boolean> {
    if (!candidate || !decision || saveState === 'saving') return false;
    const savingRevision = revision.current;
    const savingCandidateId = candidate.candidate_id;
    const payload = {
      expected_revision: decision.revision ?? decision.expected_revision ?? 0,
      candidate_id: decision.candidate_id,
      dataset_id: decision.dataset_id,
      dataset_content_sha256: decision.dataset_content_sha256,
      source_entity_id: decision.source_entity_id,
      decision_target: decision.decision_target ?? null,
      decision_status: decision.decision_status,
      rationale: decision.rationale,
      supporting_evidence: decision.supporting_evidence,
      contradictory_evidence: decision.contradictory_evidence,
      open_questions: normalizedQuestions(questionDraft),
      assessments: decision.assessments,
      priority: decision.priority,
      review_date: decision.review_date,
      next_action: decision.next_action,
    };
    setSaveState('saving'); setError(''); setNotice('');
    try {
      const saved = await researchApi.saveOpportunityDecision(projectId, payload);
      const savedCandidate = saved.candidates.find((item) => item.candidate_id === savingCandidateId);
      setWorkspace((current) => current ? { ...current, candidates: current.candidates.map((item) =>
        item.candidate_id === savingCandidateId && savedCandidate ? { ...item, decision: savedCandidate.decision } : item) } : saved);
      const persisted = savedCandidate?.decision ?? { ...payload, revision: payload.expected_revision + 1 };
      baseline.current = { candidateId: savingCandidateId, snapshot: decisionSnapshot(persisted, persisted.open_questions.join('\n')) };
      if (revision.current === savingRevision && selectedId === savingCandidateId) {
        setDecision(persisted); setQuestionDraft(persisted.open_questions.join('\n')); setSaveState('saved'); setNotice('Đã lưu quyết định.');
        return true;
      }
      if (selectedId === savingCandidateId) {
        setDecision((current) => current?.candidate_id === savingCandidateId
          ? { ...current, revision: persisted.revision, expected_revision: persisted.revision } : current);
        setSaveState('unsaved');
      }
      return false;
    } catch (cause) { setSaveState('failed'); setError(cause instanceof Error ? cause.message : 'Lưu không thành công. Các chỉnh sửa vẫn còn trên màn hình.'); return false; }
  }

  if (loading) return <div className="opportunity-page"><p role="status">Đang tải quyết định sản phẩm…</p></div>;
  if (error && !workspace) return <div className="opportunity-page"><p className="research-alert" role="alert">{error}</p><button className="secondary-action" onClick={() => void load()}>Thử lại</button></div>;

  return <main className="opportunity-page">
    <ProjectJourneyNav projectId={projectId} active="research" />
    <header className="opportunity-header"><div><a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}&view=data`} onClick={requestNavigation}>← Quay lại không gian dự án</a><span className="state-label">ĐÁNH GIÁ CỦA PO</span><h1>Theo dõi quyết định sản phẩm</h1><p>Xem lại nghiên cứu và nguồn tham khảo, ghi nhận đánh giá của bạn và lưu bước tiếp theo cùng nội dung nghiên cứu.</p></div><div className="opportunity-header-actions"><a className="secondary-action" href={`/compare-periods?projectId=${encodeURIComponent(projectId)}`} onClick={requestNavigation}>So sánh các kỳ</a><button className="secondary-action" onClick={requestRefresh} disabled={saveState === 'saving'}>Tải lại</button></div></header>
    <div className="opportunity-summary" aria-label="Tóm tắt quyết định PO"><span><strong>{workspace?.candidates.length ?? 0}</strong> mục cần quyết định</span><span><strong>{investigateCount}</strong> cần tìm hiểu thêm</span><span><strong>{benchmarkCount}</strong> cần so sánh chuyên sâu</span><span><strong>{followupCount}</strong> hành động tiếp theo</span><span><strong>{reviewCount}</strong> còn thiếu bằng chứng</span><span><strong>{savedCount}</strong> quyết định đã lưu</span></div>
    {workspace?.shortlist_warning && <div className="research-alert" role="status">{workspace.shortlist_warning} Không tự suy đoán nguồn dữ liệu còn thiếu. Các quyết định đã lưu vẫn được giữ bên dưới.</div>}
    {!workspace?.candidates.length && <section className="research-panel opportunity-empty"><h2>Chưa có nội dung nghiên cứu cần xem xét</h2><p>Thêm báo cáo, chủ đề nghiên cứu, bộ sưu tập hoặc cập nhật xu hướng để bắt đầu ghi nhận quyết định. Sản phẩm từ CSV sẽ xuất hiện sau khi lưu danh sách rút gọn.</p><a className="primary-action" href={`/research?projectId=${encodeURIComponent(projectId)}&view=data`}>Mở không gian nghiên cứu</a></section>}
    {!!workspace?.candidates.length && <div className="opportunity-layout">
      <aside className="opportunity-list"><div className="opportunity-filters"><label>Tìm nội dung cần quyết định<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm sản phẩm, phát hiện hoặc chủ đề" /></label><label>Quyết định<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tất cả quyết định</option>{Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Mức ưu tiên<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">Tất cả mức ưu tiên</option><option value="high">Cao</option><option value="medium">Trung bình</option><option value="low">Thấp</option><option value="not_assessed">Chưa đánh giá</option></select></label></div>
        <div className="opportunity-candidate-list" role="list" aria-label="PO mục cần quyết định">{filtered.map((item) => <button role="listitem" key={item.candidate_id} className={selectedId === item.candidate_id ? 'active' : ''} onClick={() => requestCandidate(item.candidate_id)} disabled={saveState === 'saving'}><strong>{item.name}</strong><span>{item.target_kind ? `${targetKindLabel(item.target_kind)} · ${datasetNameLabel(item.dataset_filename)}` : `${datasetNameLabel(item.dataset_filename)} · ${item.quantitative_evidence.length} quan sát`}</span><small>{item.historical && !item.stale ? 'Quyết định trước đây · còn nguồn gốc' : item.stale ? 'Cần xem lại nguồn' : item.decision?.decision_status ? decisionLabels[item.decision.decision_status] : 'Chưa đánh giá'} · {item.decision ? priorityLabels[item.decision.priority] : 'Chưa đánh giá mức ưu tiên'}</small></button>)}{!filtered.length && <p>Không có kết quả phù hợp với bộ lọc.</p>}</div>
      </aside>
      {candidate && decision?.candidate_id === candidate.candidate_id && <section className="opportunity-detail" aria-label={`Xem xét ${candidate.name}`}>
        <div className="opportunity-candidate-heading"><div><span className="state-label">{candidate.target_kind ? targetKindLabel(candidate.target_kind).toUpperCase() : 'ĐỐI TƯỢNG TỪ NGUỒN DỮ LIỆU'}</span><h2>{candidate.name}</h2><p>{datasetNameLabel(candidate.dataset_filename)} · {selectionReasonLabel(candidate.selection_reason)}</p><details><summary>Thông tin định danh và phạm vi nguồn</summary><code>{candidate.source_entity_id || candidate.decision_target?.target_id || candidate.candidate_id}</code>{candidate.decision_target?.report_id && <p>Báo cáo {candidate.decision_target.report_id} · nội dung nguồn chưa được xác minh</p>}<p>Mã kiểm tra bộ dữ liệu: {candidate.dataset_content_sha256 || 'Chưa có'}</p></details></div>{candidate.stale && <span className="opportunity-stale">Cần xem lại nguồn</span>}</div>
        {candidate.stale_reasons.map((reason) => <p className="research-alert" role="status" key={reason}>{reason} Đánh giá đã lưu của PO được giữ nguyên; bằng chứng chưa xử lý không được xem là dữ liệu hiện hành.</p>)}
        {!!candidate.evidence_gaps.length && <section className="opportunity-gap-panel"><h3>Bằng chứng còn thiếu và câu hỏi cần trả lời</h3><ul>{candidate.evidence_gaps.map((gap) => <li key={gap}>{evidenceGapLabel(gap)}</li>)}</ul><p>Đây là phần còn thiếu trong bằng chứng đã liên kết, không có nghĩa tính năng hay hành vi đó không tồn tại.</p></section>}
        <section className="opportunity-evidence"><div className="opportunity-section-heading"><div><span className="state-label">{candidate.dataset_id ? 'NGUỒN CSV' : 'DỮ LIỆU ĐỊNH LƯỢNG'}</span><h3>Số liệu được ghi nhận</h3></div><span>Số liệu đã nhập chưa được xác minh độc lập.</span></div>{candidate.historical && !candidate.stale && <p className="opportunity-muted">Quyết định trước đây · nguồn gốc vẫn còn. Sản phẩm không nằm trong danh sách đang theo dõi.</p>}{candidate.quantitative_evidence.length ? <div className="opportunity-observations">{candidate.quantitative_evidence.map((raw, index) => { const item = raw as Record<string, unknown>; const ref = quantitativeRef(item); const checked = (decision[evidenceRole] ?? []).some((saved) => sameRef(saved, ref)); const metricLabel = String(item.metric_definition || item.metric_id || 'Chưa xác định chỉ số'); const provenance = item.metadata_provenance && typeof item.metadata_provenance === 'object' ? Object.entries(item.metadata_provenance as Record<string, Record<string, unknown>>) : []; const validationReasons = [...new Set([...(Array.isArray(item.source_validation_reasons) ? item.source_validation_reasons as string[] : []), ...(Array.isArray(item.metadata_validation_reasons) ? item.metadata_validation_reasons as string[] : []), ...(Array.isArray(item.validation_reasons) ? item.validation_reasons as string[] : [])])]; return <label className="opportunity-observation" key={`${String(item.metric_id)}:${String(item.source_row_number)}:${index}`}><input type="checkbox" aria-label={`Gắn ${metricLabel} ở dòng dữ liệu ${String(item.source_row_number ?? 'chưa rõ')}`} checked={checked} onChange={() => toggleEvidence(ref)} /><span><strong>{metricLabel}: {item.value === null || item.value === undefined ? 'Chưa rõ' : String(item.value)} {String(item.unit ?? '')}</strong>{item.value_precision === 'approximate' && <small className="opportunity-approximate-value">Giá trị ước tính{item.reported_value_text ? ` · theo nguồn: ${String(item.reported_value_text)}` : ''}</small>}<small>{[item.geo, item.platform, item.snapshot_date || (item.period_start && item.period_end ? `${item.period_start}–${item.period_end}` : 'Chưa có kỳ dữ liệu'), item.period_semantics, item.granularity, item.methodology].filter(Boolean).join(' · ')}</small><small>{candidate.dataset_filename} · dòng dữ liệu {String(item.source_row_number ?? 'chưa rõ')} · {verificationLabel(item.verification_status)} · {item.complete_observation === true ? 'quan sát đầy đủ' : 'quan sát chưa đầy đủ'} · {item.m2_observation_usable === true ? 'đủ điều kiện theo quy tắc M2' : 'chưa đủ điều kiện theo quy tắc M2'}</small>{typeof item.comparison_note === 'string' && <small>{item.comparison_note}</small>}{validationReasons.length > 0 && <details className="opportunity-observation-validation"><summary>Vì sao cần xem lại số liệu này ({validationReasons.length})</summary><ul>{validationReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}{provenance.some(([, entry]) => entry.basis || entry.confirmed_at) && <details className="opportunity-observation-validation"><summary>Nguồn gốc siêu dữ liệu</summary><ul>{provenance.map(([field, entry]) => <li key={field}>{field}: {String(entry.value ?? 'Chưa rõ')} · {String(entry.basis ?? 'chưa rõ căn cứ')}{entry.original_value !== entry.value ? ` · giá trị ban đầu ${String(entry.original_value ?? 'Chưa rõ')}` : ''}{entry.source_url ? <> · <a href={String(entry.source_url)} target="_blank" rel="noreferrer">tài liệu</a></> : ''}</li>)}</ul></details>}</span></label>; })}</div> : <p className="opportunity-muted">Chưa có số liệu hiện hành được liên kết với nội dung nghiên cứu này. Giá trị còn thiếu được giữ là chưa rõ.</p>}{candidate.dataset_id && <label className="opportunity-evidence-role">Gắn các mục đã chọn làm<select aria-label="Vai trò bằng chứng" value={evidenceRole} onChange={(event) => setEvidenceRole(event.target.value as typeof evidenceRole)}><option value="supporting_evidence">Bằng chứng ủng hộ</option><option value="contradictory_evidence">Bằng chứng trái chiều</option></select></label>}</section>
        <section className="opportunity-evidence"><div className="opportunity-section-heading"><div><span className="state-label">NGHIÊN CỨU TRONG BÁO CÁO</span><h3>Bằng chứng định tính</h3></div><span>Không tự ghép báo cáo theo tên sản phẩm. Hãy chọn rõ phát hiện trong báo cáo để liên kết.</span></div><label className="opportunity-report-picker">Báo cáo nghiên cứu<select value={selectedReportId} onChange={(event) => setSelectedReportId(event.target.value)}><option value="">Chọn báo cáo trong dự án</option>{(workspace?.reports ?? []).map((item) => <option key={item.report_id} value={item.report_id}>{item.question} · {environmentLabel(item.geo)} / {environmentLabel(item.os)}</option>)}</select></label>{report ? report.findings.length ? <div className="opportunity-report-findings">{report.findings.map((finding) => { const ref = reportRef(report, 'report_finding', finding.key); const checked = (decision[evidenceRole] ?? []).some((saved) => sameRef(saved, ref)); return <label key={finding.key}><input type="checkbox" aria-label={`Gắn phát hiện báo cáo: ${finding.title}`} checked={checked} onChange={() => toggleEvidence(ref)} /><span><strong>{finding.title}</strong><small>{finding.finding_type} · {finding.evidence_status} · {finding.description}</small>{finding.uncertainty && <small>Mức độ chưa chắc chắn: {finding.uncertainty}</small>}{finding.po_implications && <small>Gợi ý từ báo cáo: {finding.po_implications}</small>}{(finding.existing_po_workspace.po_assessment || finding.existing_po_workspace.notes || finding.existing_po_workspace.next_action) && <small>Đánh giá PO đã có · {finding.existing_po_workspace.po_assessment || finding.existing_po_workspace.notes || "Chưa có nội dung đánh giá"}{finding.existing_po_workspace.next_action ? ` · Việc tiếp theo: ${finding.existing_po_workspace.next_action}` : ""}</small>}{finding.evidence_references.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}>Mở nguồn được cung cấp</a>)}</span></label>; })}</div> : <p className="opportunity-muted">Báo cáo này chưa có phát hiện được cấu trúc để liên kết. Có thể xem bản gốc trong mục Báo cáo.</p> : <p className="opportunity-muted">Chưa chọn báo cáo định tính. Không tự suy đoán đối tượng dựa trên tên hiển thị tương tự.</p>}</section>
        <section className="opportunity-decision"><div className="opportunity-section-heading"><div><span className="state-label">QUYẾT ĐỊNH CỦA BẠN</span><h3>Đánh giá và việc tiếp theo</h3></div><span className={`benchmark-save-state is-${visibleSaveState}`} role="status">{visibleSaveState === 'saved' ? 'Đã lưu' : visibleSaveState === 'unsaved' ? 'Chưa lưu thay đổi' : visibleSaveState === 'saving' ? 'Đang lưu…' : 'Lưu không thành công'}</span></div>
          <div className="opportunity-fields"><label>Quyết định của PO<select aria-label="Quyết định của PO" value={decision.decision_status ?? ''} onChange={(event) => changeDecision({ decision_status: (event.target.value || null) as OpportunityDecision['decision_status'] })}><option value="">Chưa quyết định</option>{Object.entries(decisionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Mức ưu tiên<select aria-label="Chọn mức ưu tiên" value={decision.priority} onChange={(event) => changeDecision({ priority: event.target.value as OpportunityDecision['priority'] })}><option value="not_assessed">Chưa đánh giá</option><option value="high">Cao</option><option value="medium">Trung bình</option><option value="low">Thấp</option></select><small>Đây là đánh giá trực tiếp của PO, không phải điểm số thị trường.</small></label><label>Ngày đánh giá<input type="date" value={decision.review_date ?? ''} onChange={(event) => changeDecision({ review_date: event.target.value || null })} /></label></div>
          <label className="opportunity-block-field">Lý do / đánh giá của PO<textarea rows={3} value={decision.rationale} onChange={(event) => changeDecision({ rationale: event.target.value })} placeholder="Bạn đánh giá thế nào và vì sao?" /></label>
          <div className="opportunity-assessments"><div className="opportunity-section-heading"><h4>Các khía cạnh đánh giá</h4><span>Phân loại từng mục là sự kiện, phát hiện, giả thuyết, đánh giá của PO hoặc chưa rõ.</span></div><div className="opportunity-add-dimension"><select aria-label="Khía cạnh đánh giá gợi ý" value={dimensionSuggestions.includes(assessmentDimension) ? assessmentDimension : ''} onChange={(event) => setAssessmentDimension(event.target.value)}><option value="">Chọn khía cạnh gợi ý</option>{dimensionSuggestions.map((item) => <option value={item} key={item}>{showDimension(item)}</option>)}</select><input aria-label="Khía cạnh đánh giá tùy chỉnh" value={dimensionSuggestions.includes(assessmentDimension) ? '' : assessmentDimension} onChange={(event) => setAssessmentDimension(event.target.value)} placeholder="Hoặc nhập khía cạnh khác" /><button type="button" className="secondary-action" onClick={addAssessment} disabled={!assessmentDimension.trim()}>Thêm</button></div>{decision.assessments.map((item, index) => <div className="opportunity-assessment-row" key={`${item.dimension}:${index}`}><div><strong>{showDimension(item.dimension)}</strong><button type="button" className="text-button" onClick={() => changeDecision({ assessments: decision.assessments.filter((_, itemIndex) => itemIndex !== index) })}>Gỡ</button></div><select aria-label={`${showDimension(item.dimension)} loại bằng chứng`} value={item.kind} onChange={(event) => changeDecision({ assessments: decision.assessments.map((value, itemIndex) => itemIndex === index ? { ...value, kind: event.target.value as OpportunityAssessment['kind'] } : value) })}>{Object.entries(assessmentKinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><textarea aria-label={`${showDimension(item.dimension)} đánh giá`} rows={2} value={item.statement} onChange={(event) => changeDecision({ assessments: decision.assessments.map((value, itemIndex) => itemIndex === index ? { ...value, statement: event.target.value } : value) })} placeholder={item.kind === 'unknown' ? 'Cần bổ sung bằng chứng nào?' : 'Ghi nhận đánh giá có căn cứ'} />{item.kind === 'observed_fact' && item.evidence_refs.length === 0 && <p className="opportunity-assessment-warning" role="status">Sự kiện đã quan sát cần có bằng chứng hỗ trợ được gắn với đánh giá này.</p>}<details className="opportunity-assessment-evidence"><summary>Gắn bằng chứng vào đánh giá này ({item.evidence_refs.length})</summary>{assessmentEvidenceOptions.length ? assessmentEvidenceOptions.map((option, optionIndex) => <label key={`${option.reference.kind}:${option.reference.item_key ?? option.reference.source_row_number}:${optionIndex}`}><input type="checkbox" aria-label={`${showDimension(item.dimension)}: ${option.label}`} checked={item.evidence_refs.some((reference) => sameRef(reference, option.reference))} onChange={() => toggleAssessmentEvidence(index, option.reference)} /><span>{option.label}</span></label>) : <p>Chưa có số liệu nguồn hoặc phát hiện báo cáo để gắn vào đánh giá này.</p>}</details></div>)}</div>
          <label className="opportunity-block-field">Câu hỏi còn mở<textarea rows={2} value={questionDraft} onChange={(event) => { setQuestionDraft(event.target.value); revision.current += 1; setSaveState('unsaved'); }} placeholder="Mỗi dòng một câu hỏi" /></label>
          <label className="opportunity-block-field">Việc tiếp theo<textarea rows={2} value={decision.next_action} onChange={(event) => changeDecision({ next_action: event.target.value })} placeholder="Bước tiếp theo nên là gì?" /></label>
          <details className="opportunity-attached-evidence"><summary>Bằng chứng đã chọn ({decision.supporting_evidence.length} ủng hộ · {decision.contradictory_evidence.length} trái chiều)</summary><strong>Bằng chứng ủng hộ</strong>{decision.supporting_evidence.map((ref, index) => <div key={`support:${ref.kind}:${ref.report_id || ref.dataset_id}:${ref.item_key || ref.source_row_number}:${index}`}><span>{ref.kind === 'quantitative' ? `Dòng CSV ${ref.source_row_number ?? 'chưa rõ'} · ${ref.metric_id ?? 'metric'}` : `Báo cáo ${ref.report_id} · ${ref.item_key}`}</span><button className="text-button" onClick={() => toggleEvidence(ref, 'supporting_evidence')}>Gỡ</button></div>)}<strong>Bằng chứng trái chiều</strong>{decision.contradictory_evidence.map((ref, index) => <div key={`contradict:${ref.kind}:${ref.report_id || ref.dataset_id}:${ref.item_key || ref.source_row_number}:${index}`}><span>{ref.kind === 'quantitative' ? `Dòng CSV ${ref.source_row_number ?? 'chưa rõ'} · ${ref.metric_id ?? 'metric'}` : `Báo cáo ${ref.report_id} · ${ref.item_key}`}</span><button className="text-button" onClick={() => toggleEvidence(ref, 'contradictory_evidence')}>Gỡ</button></div>)}</details>
          {!!decision.revision_history?.length && <details className="opportunity-decision-history"><summary>Các phiên bản quyết định trước ({decision.revision_history.length})</summary>{decision.revision_history.map((entry) => { const snapshot = entry.snapshot; return <article key={entry.revision}><strong>Phiên bản {entry.revision}{entry.saved_at ? ` · ${new Date(entry.saved_at).toLocaleString()}` : ''}</strong><p>{typeof snapshot.rationale === 'string' && snapshot.rationale ? snapshot.rationale : 'Chưa lưu lý do đánh giá.'}</p><small>Quyết định: {typeof snapshot.decision_status === 'string' ? decisionLabels[snapshot.decision_status as keyof typeof decisionLabels] ?? snapshot.decision_status : 'Chưa quyết định'} · Việc tiếp theo: {typeof snapshot.next_action === 'string' && snapshot.next_action ? snapshot.next_action : 'Chưa ghi nhận'}</small></article>; })}</details>}
          {!!candidate.unresolved_decision_evidence.length && <p className="research-alert">Một số bằng chứng đã gắn trước đây không còn mới. Chúng vẫn được giữ trong quyết định đã lưu nhưng không hiển thị như bằng chứng hiện hành.</p>}
          {error && <p className="research-alert" role="alert">{error}</p>}{notice && <p className="workspace-success" role="status">{notice}</p>}
          <div className="opportunity-save-row"><span>Bằng chứng từ báo cáo chưa được xác minh độc lập; đánh giá của bạn được lưu riêng.</span><button className="primary-action" disabled={saveState === 'saving' || !hasUnsavedChanges} onClick={() => void save()}>{saveState === 'saving' ? 'Đang lưu…' : saveState === 'failed' ? 'Thử lưu lại' : 'Lưu quyết định'}</button></div>
        </section>
      </section>}
    </div>}
    {pendingAction && <div className="opportunity-draft-backdrop"><section className="opportunity-draft-dialog" role="alertdialog" aria-modal="true" aria-labelledby="opportunity-draft-title" aria-describedby="opportunity-draft-description"><h2 id="opportunity-draft-title">Thay đổi chưa lưu</h2><p id="opportunity-draft-description">Hãy lưu đánh giá trước khi rời đi, bỏ các chỉnh sửa hoặc tiếp tục chỉnh sửa.</p>{error && saveState === 'failed' && <p className="research-alert" role="alert">{error}</p>}<div className="opportunity-draft-actions"><button type="button" className="primary-action" disabled={saveState === 'saving' || !hasUnsavedChanges} onClick={() => { void save().then((saved) => { if (saved) completePendingAction(); }); }}>{saveState === 'saving' ? 'Đang lưu…' : saveState === 'failed' ? 'Thử lưu lại and continue' : 'Lưu và tiếp tục'}</button><button type="button" className="secondary-action" disabled={saveState === 'saving'} onClick={discardAndContinue}>Bỏ thay đổi</button><button type="button" className="text-button" onClick={() => setPendingAction(null)}>Tiếp tục chỉnh sửa</button></div></section></div>}
  </main>;
}
