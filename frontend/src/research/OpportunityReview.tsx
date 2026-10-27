import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { researchApi, type OpportunityAssessment, type OpportunityCandidate, type OpportunityDecision, type OpportunityEvidenceReference, type OpportunityReport, type OpportunityWorkspace } from './api';
import { ProjectJourneyNav } from './ProjectJourneyNav';

const dimensionSuggestions = ['Market signal', 'Product differentiation', 'User motivation', 'Retention evidence', 'Monetization evidence', 'Product feasibility', 'Competitive risk', 'Research gaps'];
const decisionLabels: Record<NonNullable<OpportunityDecision['decision_status']>, string> = {
  investigate: 'Investigate further', benchmark: 'Benchmark in detail', experiment: 'Validate with an experiment',
  implementation_candidate: 'Candidate for implementation', hold: 'Hold', reject: 'Reject with reason',
};
const assessmentKinds: Record<OpportunityAssessment['kind'], string> = {
  observed_fact: 'Observed fact', research_finding: 'Research finding', hypothesis: 'Hypothesis', po_judgment: 'PO judgment', unknown: 'Unknown',
};

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
    } catch (cause) { if (requestRevision === loadRevision.current) setError(cause instanceof Error ? cause.message : 'Could not load opportunity review.'); }
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
    setSelectedReportId(linkedReport?.report_id ?? '');
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
      return { reference: quantitativeRef(item), label: `${String(item.metric_definition || item.metric_id || 'Metric')} · source row ${String(item.source_row_number ?? 'unknown')}` };
    }),
    ...(report?.findings ?? []).map((finding) => ({ reference: reportRef(report!, 'report_finding', finding.key), label: `Report finding · ${finding.title}` })),
    ...(report?.entities ?? []).map((entity) => ({ reference: reportRef(report!, 'report_entity', entity.key), label: `Report entity · ${entity.name}` })),
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
        setDecision(persisted); setQuestionDraft(persisted.open_questions.join('\n')); setSaveState('saved'); setNotice('Decision saved.');
        return true;
      }
      if (selectedId === savingCandidateId) {
        setDecision((current) => current?.candidate_id === savingCandidateId
          ? { ...current, revision: persisted.revision, expected_revision: persisted.revision } : current);
        setSaveState('unsaved');
      }
      return false;
    } catch (cause) { setSaveState('failed'); setError(cause instanceof Error ? cause.message : 'Save failed. Your edits remain on this screen.'); return false; }
  }

  if (loading) return <div className="opportunity-page"><p role="status">Loading opportunity review…</p></div>;
  if (error && !workspace) return <div className="opportunity-page"><p className="research-alert" role="alert">{error}</p><button className="secondary-action" onClick={() => void load()}>Retry</button></div>;

  return <main className="opportunity-page">
    <ProjectJourneyNav projectId={projectId} active="research" />
    <header className="opportunity-header"><div><a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}&view=data`} onClick={requestNavigation}>← Back to workspace</a><span className="state-label">PRODUCT OWNER REVIEW</span><h1>Review PO decisions</h1><p>Review research and source evidence, record your judgment, and keep the next action with its research subject.</p></div><div className="opportunity-header-actions"><a className="secondary-action" href={`/compare-periods?projectId=${encodeURIComponent(projectId)}`} onClick={requestNavigation}>Compare periods</a><button className="secondary-action" onClick={requestRefresh} disabled={saveState === 'saving'}>Refresh</button></div></header>
    <div className="opportunity-summary" aria-label="PO decision summary"><span><strong>{workspace?.candidates.length ?? 0}</strong> decision targets</span><span><strong>{investigateCount}</strong> investigate further</span><span><strong>{benchmarkCount}</strong> benchmark in detail</span><span><strong>{followupCount}</strong> actions ready</span><span><strong>{reviewCount}</strong> with evidence gaps</span><span><strong>{savedCount}</strong> saved decisions</span></div>
    {workspace?.shortlist_warning && <div className="research-alert" role="status">{workspace.shortlist_warning} This workspace will not guess the missing source. Existing saved decisions remain available below.</div>}
    {!workspace?.candidates.length && <section className="research-panel opportunity-empty"><h2>No research subjects to review yet</h2><p>Add a report, research subject, collection or trend update to this workspace to start a decision. CSV products become available when a shortlist is saved.</p><a className="primary-action" href={`/research?projectId=${encodeURIComponent(projectId)}&view=data`}>Open research workspace</a></section>}
    {!!workspace?.candidates.length && <div className="opportunity-layout">
      <aside className="opportunity-list"><div className="opportunity-filters"><label>Find a decision target<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products, findings, subjects" /></label><label>Decision<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All decisions</option>{Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Priority<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="not_assessed">Not assessed</option></select></label></div>
        <div className="opportunity-candidate-list" role="list" aria-label="PO decision targets">{filtered.map((item) => <button role="listitem" key={item.candidate_id} className={selectedId === item.candidate_id ? 'active' : ''} onClick={() => requestCandidate(item.candidate_id)} disabled={saveState === 'saving'}><strong>{item.name}</strong><span>{item.target_kind ? `${item.target_kind.replaceAll('_', ' ')} · ${item.dataset_filename}` : `${item.dataset_filename} · ${item.quantitative_evidence.length} observations`}</span><small>{item.historical && !item.stale ? 'Historical decision · source available' : item.stale ? 'Source needs review' : item.decision?.decision_status ? decisionLabels[item.decision.decision_status] : 'Not assessed'} · {item.decision?.priority ?? 'Priority not assessed'}</small></button>)}{!filtered.length && <p>No candidates match these filters.</p>}</div>
      </aside>
      {candidate && decision?.candidate_id === candidate.candidate_id && <section className="opportunity-detail" aria-label={`Review ${candidate.name}`}>
        <div className="opportunity-candidate-heading"><div><span className="state-label">{candidate.target_kind ? candidate.target_kind.replaceAll('_', ' ').toUpperCase() : 'SOURCE PRODUCT'}</span><h2>{candidate.name}</h2><p>{candidate.dataset_filename} · {candidate.selection_reason}</p><details><summary>Source identity and scope</summary><code>{candidate.source_entity_id || candidate.decision_target?.target_id || candidate.candidate_id}</code>{candidate.decision_target?.report_id && <p>Report {candidate.decision_target.report_id} · source content is retained unverified</p>}<p>Dataset hash: {candidate.dataset_content_sha256 || 'Unavailable'}</p></details></div>{candidate.stale && <span className="opportunity-stale">Source needs review</span>}</div>
        {candidate.stale_reasons.map((reason) => <p className="research-alert" role="status" key={reason}>{reason} Saved PO judgment is retained; unresolved evidence is not presented as current.</p>)}
        {!!candidate.evidence_gaps.length && <section className="opportunity-gap-panel"><h3>Evidence gaps and open questions</h3><ul>{candidate.evidence_gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul><p>These are gaps in the evidence linked here; they do not prove that a product feature or behavior is absent.</p></section>}
        <section className="opportunity-evidence"><div className="opportunity-section-heading"><div><span className="state-label">{candidate.dataset_id ? 'CSV SOURCE' : 'QUANTITATIVE DATA'}</span><h3>Observed measurements</h3></div><span>Imported values remain unverified unless independently confirmed.</span></div>{candidate.historical && !candidate.stale && <p className="opportunity-muted">Historical decision · original source still available. This product is not on the active shortlist.</p>}{candidate.quantitative_evidence.length ? <div className="opportunity-observations">{candidate.quantitative_evidence.map((raw, index) => { const item = raw as Record<string, unknown>; const ref = quantitativeRef(item); const checked = (decision[evidenceRole] ?? []).some((saved) => sameRef(saved, ref)); const metricLabel = String(item.metric_definition || item.metric_id || 'Metric not identified'); const provenance = item.metadata_provenance && typeof item.metadata_provenance === 'object' ? Object.entries(item.metadata_provenance as Record<string, Record<string, unknown>>) : []; const validationReasons = [...new Set([...(Array.isArray(item.source_validation_reasons) ? item.source_validation_reasons as string[] : []), ...(Array.isArray(item.metadata_validation_reasons) ? item.metadata_validation_reasons as string[] : []), ...(Array.isArray(item.validation_reasons) ? item.validation_reasons as string[] : [])])]; return <label className="opportunity-observation" key={`${String(item.metric_id)}:${String(item.source_row_number)}:${index}`}><input type="checkbox" aria-label={`Attach ${metricLabel} source row ${String(item.source_row_number ?? 'unknown')}`} checked={checked} onChange={() => toggleEvidence(ref)} /><span><strong>{metricLabel}: {item.value === null || item.value === undefined ? 'Unknown' : String(item.value)} {String(item.unit ?? '')}</strong>{item.value_precision === 'approximate' && <small className="opportunity-approximate-value">Approximate value{item.reported_value_text ? ` · as reported: ${String(item.reported_value_text)}` : ''}</small>}<small>{[item.geo, item.platform, item.snapshot_date || (item.period_start && item.period_end ? `${item.period_start}–${item.period_end}` : 'Period not provided'), item.period_semantics, item.granularity, item.methodology].filter(Boolean).join(' · ')}</small><small>{candidate.dataset_filename} · row {String(item.source_row_number ?? 'unknown')} · {String(item.verification_status ?? 'unverified')} · {item.complete_observation === true ? 'complete observation' : 'incomplete observation'} · {item.m2_observation_usable === true ? 'eligible observation under M2 rules' : 'not eligible under M2 rules'}</small>{typeof item.comparison_note === 'string' && <small>{item.comparison_note}</small>}{validationReasons.length > 0 && <details className="opportunity-observation-validation"><summary>Why this measurement needs review ({validationReasons.length})</summary><ul>{validationReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}{provenance.some(([, entry]) => entry.basis || entry.confirmed_at) && <details className="opportunity-observation-validation"><summary>Metadata provenance</summary><ul>{provenance.map(([field, entry]) => <li key={field}>{field}: {String(entry.value ?? 'Unknown')} · {String(entry.basis ?? 'unknown basis')}{entry.original_value !== entry.value ? ` · originally ${String(entry.original_value ?? 'Unknown')}` : ''}{entry.source_url ? <> · <a href={String(entry.source_url)} target="_blank" rel="noreferrer">documentation</a></> : ''}</li>)}</ul></details>}</span></label>; })}</div> : <p className="opportunity-muted">No current measurements are linked to this research target. Missing values remain unknown.</p>}{candidate.dataset_id && <label className="opportunity-evidence-role">Attach checked items as<select aria-label="Evidence role" value={evidenceRole} onChange={(event) => setEvidenceRole(event.target.value as typeof evidenceRole)}><option value="supporting_evidence">Supporting evidence</option><option value="contradictory_evidence">Contradictory evidence</option></select></label>}</section>
        <section className="opportunity-evidence"><div className="opportunity-section-heading"><div><span className="state-label">REPORT RESEARCH</span><h3>Qualitative evidence</h3></div><span>Reports are not matched by product name. Choose a report finding explicitly to attach it.</span></div><label className="opportunity-report-picker">Research report<select value={selectedReportId} onChange={(event) => setSelectedReportId(event.target.value)}><option value="">Choose a workspace report</option>{(workspace?.reports ?? []).map((item) => <option key={item.report_id} value={item.report_id}>{item.question} · {item.geo} / {item.os}</option>)}</select></label>{report ? report.findings.length ? <div className="opportunity-report-findings">{report.findings.map((finding) => { const ref = reportRef(report, 'report_finding', finding.key); const checked = (decision[evidenceRole] ?? []).some((saved) => sameRef(saved, ref)); return <label key={finding.key}><input type="checkbox" aria-label={`Attach report finding: ${finding.title}`} checked={checked} onChange={() => toggleEvidence(ref)} /><span><strong>{finding.title}</strong><small>{finding.finding_type} · {finding.evidence_status} · {finding.description}</small>{finding.uncertainty && <small>Uncertainty: {finding.uncertainty}</small>}{finding.po_implications && <small>Report recommendation: {finding.po_implications}</small>}{(finding.existing_po_workspace.po_assessment || finding.existing_po_workspace.notes || finding.existing_po_workspace.next_action) && <small>Existing PO assessment · {finding.existing_po_workspace.po_assessment || finding.existing_po_workspace.notes || "No assessment text"}{finding.existing_po_workspace.next_action ? ` · Next action: ${finding.existing_po_workspace.next_action}` : ""}</small>}{finding.evidence_references.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}>Open supplied source</a>)}</span></label>; })}</div> : <p className="opportunity-muted">This report has no structured findings to attach. Its original report remains available from Reports.</p> : <p className="opportunity-muted">No qualitative report is selected. Candidate identity will not be inferred from a similar display name.</p>}</section>
        <section className="opportunity-decision"><div className="opportunity-section-heading"><div><span className="state-label">YOUR DECISION</span><h3>Assessment and next action</h3></div><span className={`benchmark-save-state is-${visibleSaveState}`} role="status">{visibleSaveState === 'saved' ? 'Saved' : visibleSaveState === 'unsaved' ? 'Unsaved changes' : visibleSaveState === 'saving' ? 'Saving…' : 'Save failed'}</span></div>
          <div className="opportunity-fields"><label>PO decision<select aria-label="PO decision" value={decision.decision_status ?? ''} onChange={(event) => changeDecision({ decision_status: (event.target.value || null) as OpportunityDecision['decision_status'] })}><option value="">Not decided</option>{Object.entries(decisionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>PO priority<select aria-label="Set PO priority" value={decision.priority} onChange={(event) => changeDecision({ priority: event.target.value as OpportunityDecision['priority'] })}><option value="not_assessed">Not assessed</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><small>Explicit PO judgment; this is not a market score.</small></label><label>Review date<input type="date" value={decision.review_date ?? ''} onChange={(event) => changeDecision({ review_date: event.target.value || null })} /></label></div>
          <label className="opportunity-block-field">PO rationale<textarea rows={3} value={decision.rationale} onChange={(event) => changeDecision({ rationale: event.target.value })} placeholder="What is your assessment, and why?" /></label>
          <div className="opportunity-assessments"><div className="opportunity-section-heading"><h4>Assessment dimensions</h4><span>Classify each entry as fact, finding, hypothesis, PO judgment, or unknown.</span></div><div className="opportunity-add-dimension"><select aria-label="Suggested assessment dimension" value={dimensionSuggestions.includes(assessmentDimension) ? assessmentDimension : ''} onChange={(event) => setAssessmentDimension(event.target.value)}><option value="">Choose a suggested dimension</option>{dimensionSuggestions.map((item) => <option value={item} key={item}>{item}</option>)}</select><input aria-label="Custom assessment dimension" value={dimensionSuggestions.includes(assessmentDimension) ? '' : assessmentDimension} onChange={(event) => setAssessmentDimension(event.target.value)} placeholder="Or add a custom criterion" /><button type="button" className="secondary-action" onClick={addAssessment} disabled={!assessmentDimension.trim()}>Add</button></div>{decision.assessments.map((item, index) => <div className="opportunity-assessment-row" key={`${item.dimension}:${index}`}><div><strong>{item.dimension}</strong><button type="button" className="text-button" onClick={() => changeDecision({ assessments: decision.assessments.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div><select aria-label={`${item.dimension} evidence type`} value={item.kind} onChange={(event) => changeDecision({ assessments: decision.assessments.map((value, itemIndex) => itemIndex === index ? { ...value, kind: event.target.value as OpportunityAssessment['kind'] } : value) })}>{Object.entries(assessmentKinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><textarea aria-label={`${item.dimension} assessment`} rows={2} value={item.statement} onChange={(event) => changeDecision({ assessments: decision.assessments.map((value, itemIndex) => itemIndex === index ? { ...value, statement: event.target.value } : value) })} placeholder={item.kind === 'unknown' ? 'What evidence is missing?' : 'Record the supporting assessment'} />{item.kind === 'observed_fact' && item.evidence_refs.length === 0 && <p className="opportunity-assessment-warning" role="status">Observed facts need supporting evidence attached to this assessment.</p>}<details className="opportunity-assessment-evidence"><summary>Attach evidence to this assessment ({item.evidence_refs.length})</summary>{assessmentEvidenceOptions.length ? assessmentEvidenceOptions.map((option, optionIndex) => <label key={`${option.reference.kind}:${option.reference.item_key ?? option.reference.source_row_number}:${optionIndex}`}><input type="checkbox" aria-label={`${item.dimension}: ${option.label}`} checked={item.evidence_refs.some((reference) => sameRef(reference, option.reference))} onChange={() => toggleAssessmentEvidence(index, option.reference)} /><span>{option.label}</span></label>) : <p>No source observations or report findings are available for this assessment yet.</p>}</details></div>)}</div>
          <label className="opportunity-block-field">Open questions<textarea rows={2} value={questionDraft} onChange={(event) => { setQuestionDraft(event.target.value); revision.current += 1; setSaveState('unsaved'); }} placeholder="One question per line" /></label>
          <label className="opportunity-block-field">Next action<textarea rows={2} value={decision.next_action} onChange={(event) => changeDecision({ next_action: event.target.value })} placeholder="What should happen next?" /></label>
          <details className="opportunity-attached-evidence"><summary>Selected evidence ({decision.supporting_evidence.length} supporting · {decision.contradictory_evidence.length} contradictory)</summary><strong>Supporting evidence</strong>{decision.supporting_evidence.map((ref, index) => <div key={`support:${ref.kind}:${ref.report_id || ref.dataset_id}:${ref.item_key || ref.source_row_number}:${index}`}><span>{ref.kind === 'quantitative' ? `CSV row ${ref.source_row_number ?? 'unknown'} · ${ref.metric_id ?? 'metric'}` : `Report ${ref.report_id} · ${ref.item_key}`}</span><button className="text-button" onClick={() => toggleEvidence(ref, 'supporting_evidence')}>Remove</button></div>)}<strong>Contradictory evidence</strong>{decision.contradictory_evidence.map((ref, index) => <div key={`contradict:${ref.kind}:${ref.report_id || ref.dataset_id}:${ref.item_key || ref.source_row_number}:${index}`}><span>{ref.kind === 'quantitative' ? `CSV row ${ref.source_row_number ?? 'unknown'} · ${ref.metric_id ?? 'metric'}` : `Report ${ref.report_id} · ${ref.item_key}`}</span><button className="text-button" onClick={() => toggleEvidence(ref, 'contradictory_evidence')}>Remove</button></div>)}</details>
          {!!decision.revision_history?.length && <details className="opportunity-decision-history"><summary>Previous decision versions ({decision.revision_history.length})</summary>{decision.revision_history.map((entry) => { const snapshot = entry.snapshot; return <article key={entry.revision}><strong>Version {entry.revision}{entry.saved_at ? ` · ${new Date(entry.saved_at).toLocaleString()}` : ''}</strong><p>{typeof snapshot.rationale === 'string' && snapshot.rationale ? snapshot.rationale : 'No rationale saved.'}</p><small>Decision: {typeof snapshot.decision_status === 'string' ? decisionLabels[snapshot.decision_status as keyof typeof decisionLabels] ?? snapshot.decision_status : 'Not decided'} · Next action: {typeof snapshot.next_action === 'string' && snapshot.next_action ? snapshot.next_action : 'None recorded'}</small></article>; })}</details>}
          {!!candidate.unresolved_decision_evidence.length && <p className="research-alert">Some previously attached evidence is stale. It is retained in the saved decision but excluded from current evidence.</p>}
          {error && <p className="research-alert" role="alert">{error}</p>}{notice && <p className="workspace-success" role="status">{notice}</p>}
          <div className="opportunity-save-row"><span>Research report evidence remains unverified; your judgment is stored separately.</span><button className="primary-action" disabled={saveState === 'saving' || !hasUnsavedChanges} onClick={() => void save()}>{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Retry save' : 'Save PO decision'}</button></div>
        </section>
      </section>}
    </div>}
    {pendingAction && <div className="opportunity-draft-backdrop"><section className="opportunity-draft-dialog" role="alertdialog" aria-modal="true" aria-labelledby="opportunity-draft-title" aria-describedby="opportunity-draft-description"><h2 id="opportunity-draft-title">Unsaved PO changes</h2><p id="opportunity-draft-description">Save this candidate's assessment before you leave, discard the edits, or continue editing.</p>{error && saveState === 'failed' && <p className="research-alert" role="alert">{error}</p>}<div className="opportunity-draft-actions"><button type="button" className="primary-action" disabled={saveState === 'saving' || !hasUnsavedChanges} onClick={() => { void save().then((saved) => { if (saved) completePendingAction(); }); }}>{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Retry save and continue' : 'Save and continue'}</button><button type="button" className="secondary-action" disabled={saveState === 'saving'} onClick={discardAndContinue}>Discard changes</button><button type="button" className="text-button" onClick={() => setPendingAction(null)}>Continue editing</button></div></section></div>}
  </main>;
}
