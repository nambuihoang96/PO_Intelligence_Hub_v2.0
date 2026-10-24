import { useEffect, useMemo, useRef, useState } from 'react';
import { researchApi, type OpportunityAssessment, type OpportunityCandidate, type OpportunityDecision, type OpportunityEvidenceReference, type OpportunityReport, type OpportunityWorkspace } from './api';

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
    source_entity_id: candidate.source_entity_id, decision_status: null, rationale: '', supporting_evidence: [],
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

  async function load() {
    setLoading(true); setError('');
    try {
      const result = await researchApi.getOpportunities(projectId);
      setWorkspace(result);
      setSelectedId((current) => result.candidates.some((candidate) => candidate.candidate_id === current) ? current : result.candidates[0]?.candidate_id ?? '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load opportunity review.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [projectId]);

  const candidate = workspace?.candidates.find((item) => item.candidate_id === selectedId) ?? null;
  useEffect(() => {
    revision.current += 1;
    setDecision(candidate ? decisionDraft(candidate) : null);
    setSaveState('saved'); setQuestionDraft(candidate?.decision?.open_questions.join('\n') ?? '');
  }, [candidate?.candidate_id]);

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
  async function save() {
    if (!candidate || !decision || saveState === 'saving') return;
    const savingRevision = revision.current;
    const { revision: savedRevision, ...draft } = decision;
    const payload = { ...draft, expected_revision: savedRevision ?? decision.expected_revision ?? 0,
      open_questions: questionDraft.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) };
    setSaveState('saving'); setError(''); setNotice('');
    try {
      const saved = await researchApi.saveOpportunityDecision(projectId, payload);
      setWorkspace(saved);
      if (revision.current === savingRevision) { setDecision(saved.candidates.find((item) => item.candidate_id === candidate.candidate_id)?.decision ?? { ...payload, revision: payload.expected_revision + 1 }); setSaveState('saved'); setNotice('Decision saved.'); }
      else setSaveState('unsaved');
    } catch (cause) { setSaveState('failed'); setError(cause instanceof Error ? cause.message : 'Save failed. Your edits remain on this screen.'); }
  }

  if (loading) return <div className="opportunity-page"><p role="status">Loading opportunity review…</p></div>;
  if (error && !workspace) return <div className="opportunity-page"><p className="research-alert" role="alert">{error}</p><button className="secondary-action" onClick={() => void load()}>Retry</button></div>;

  return <main className="opportunity-page">
    <header className="opportunity-header"><div><a className="text-button" href={`/research?projectId=${encodeURIComponent(projectId)}&view=data`}>← Back to workspace</a><span className="state-label">PRODUCT OWNER REVIEW</span><h1>Review opportunities</h1><p>Review source evidence, record your judgment, and preserve the next action for each selected product.</p></div><div className="opportunity-header-actions"><a className="secondary-action" href={`/compare-periods?projectId=${encodeURIComponent(projectId)}`}>Compare periods</a><button className="secondary-action" onClick={() => void load()}>Refresh</button></div></header>
    <div className="opportunity-summary" aria-label="Opportunity review summary"><span><strong>{workspace?.candidates.length ?? 0}</strong> candidates</span><span><strong>{investigateCount}</strong> investigate further</span><span><strong>{benchmarkCount}</strong> benchmark in detail</span><span><strong>{followupCount}</strong> actions ready</span><span><strong>{reviewCount}</strong> with evidence gaps</span><span><strong>{savedCount}</strong> saved decisions</span></div>
    {workspace?.shortlist_warning && <div className="research-alert" role="status">{workspace.shortlist_warning} This workspace will not guess the missing source. Existing saved decisions remain available below.</div>}
    {!workspace?.candidates.length && <section className="research-panel opportunity-empty"><h2>No candidates to review yet</h2><p>Save a shortlist from a CSV in this workspace. The opportunity list will use those exact source identities and keep the file’s measurement scope.</p><a className="primary-action" href={`/research?projectId=${encodeURIComponent(projectId)}&view=data`}>Open workspace data</a></section>}
    {!!workspace?.candidates.length && <div className="opportunity-layout">
      <aside className="opportunity-list"><div className="opportunity-filters"><label>Find a product<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search selected products" /></label><label>Decision<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All decisions</option>{Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Priority<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="not_assessed">Not assessed</option></select></label></div>
        <div className="opportunity-candidate-list" role="list" aria-label="Candidates">{filtered.map((item) => <button role="listitem" key={item.candidate_id} className={selectedId === item.candidate_id ? 'active' : ''} onClick={() => setSelectedId(item.candidate_id)}><strong>{item.name}</strong><span>{item.dataset_filename} · {item.quantitative_evidence.length} observations</span><small>{item.stale ? 'Source needs review' : item.decision?.decision_status ? decisionLabels[item.decision.decision_status] : 'Not assessed'} · {item.decision?.priority ?? 'Priority not assessed'}</small></button>)}{!filtered.length && <p>No candidates match these filters.</p>}</div>
      </aside>
      {candidate && decision && <section className="opportunity-detail" aria-label={`Review ${candidate.name}`}>
        <div className="opportunity-candidate-heading"><div><span className="state-label">SOURCE PRODUCT</span><h2>{candidate.name}</h2><p>{candidate.dataset_filename} · {candidate.selection_reason}</p><details><summary>Source identity and scope</summary><code>{candidate.source_entity_id}</code><p>Dataset hash: {candidate.dataset_content_sha256 || 'Unavailable'}</p></details></div>{candidate.stale && <span className="opportunity-stale">Source needs review</span>}</div>
        {candidate.stale_reasons.map((reason) => <p className="research-alert" role="status" key={reason}>{reason} Saved PO judgment is retained; unresolved evidence is not presented as current.</p>)}
        {!!candidate.evidence_gaps.length && <section className="opportunity-gap-panel"><h3>Evidence gaps and open questions</h3><ul>{candidate.evidence_gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul><p>These are gaps in the evidence linked here; they do not prove that a product feature or behavior is absent.</p></section>}
        <section className="opportunity-evidence"><div className="opportunity-section-heading"><div><span className="state-label">CSV SOURCE</span><h3>Observed measurements</h3></div><span>Imported values remain unverified unless independently confirmed.</span></div>{candidate.quantitative_evidence.length ? <div className="opportunity-observations">{candidate.quantitative_evidence.map((raw, index) => { const item = raw as Record<string, unknown>; const ref: OpportunityEvidenceReference = { kind: 'quantitative', dataset_id: String(item.dataset_id), source_entity_id: String(item.source_entity_id), source_row_number: typeof item.source_row_number === 'number' ? item.source_row_number : null, metric_id: typeof item.metric_id === 'string' ? item.metric_id : null }; const checked = (decision[evidenceRole] ?? []).some((saved) => sameRef(saved, ref)); const metricLabel = String(item.metric_definition || item.metric_id || 'Metric not identified'); return <label className="opportunity-observation" key={`${String(item.metric_id)}:${String(item.source_row_number)}:${index}`}><input type="checkbox" aria-label={`Attach ${metricLabel} source row ${String(item.source_row_number ?? 'unknown')}`} checked={checked} onChange={() => toggleEvidence(ref)} /><span><strong>{metricLabel}: {item.value === null || item.value === undefined ? 'Unknown' : String(item.value)} {String(item.unit ?? '')}</strong><small>{[item.geo, item.platform, item.snapshot_date || (item.period_start && item.period_end ? `${item.period_start}–${item.period_end}` : 'Period not provided'), item.methodology].filter(Boolean).join(' · ')}</small><small>{candidate.dataset_filename} · row {String(item.source_row_number ?? 'unknown')} · {String(item.verification_status ?? 'unverified')} · {item.analysis_ready === true ? 'complete source observation' : 'incomplete for analysis'}</small>{Array.isArray(item.validation_reasons) && item.validation_reasons.length > 0 && <small>{(item.validation_reasons as string[]).join(' ')}</small>}</span></label>; })}</div> : <p className="opportunity-muted">No current measurements resolve to this candidate. Missing values stay unknown.</p>}<label className="opportunity-evidence-role">Attach checked items as<select aria-label="Evidence role" value={evidenceRole} onChange={(event) => setEvidenceRole(event.target.value as typeof evidenceRole)}><option value="supporting_evidence">Supporting evidence</option><option value="contradictory_evidence">Contradictory evidence</option></select></label></section>
        <section className="opportunity-evidence"><div className="opportunity-section-heading"><div><span className="state-label">REPORT RESEARCH</span><h3>Qualitative evidence</h3></div><span>Reports are not matched by product name. Choose a report finding explicitly to attach it.</span></div><label className="opportunity-report-picker">Research report<select value={selectedReportId} onChange={(event) => setSelectedReportId(event.target.value)}><option value="">Choose a workspace report</option>{(workspace?.reports ?? []).map((item) => <option key={item.report_id} value={item.report_id}>{item.question} · {item.geo} / {item.os}</option>)}</select></label>{report ? report.findings.length ? <div className="opportunity-report-findings">{report.findings.map((finding) => { const ref = reportRef(report, 'report_finding', finding.key); const checked = (decision[evidenceRole] ?? []).some((saved) => sameRef(saved, ref)); return <label key={finding.key}><input type="checkbox" aria-label={`Attach report finding: ${finding.title}`} checked={checked} onChange={() => toggleEvidence(ref)} /><span><strong>{finding.title}</strong><small>{finding.finding_type} · {finding.evidence_status} · {finding.description}</small>{finding.uncertainty && <small>Uncertainty: {finding.uncertainty}</small>}{finding.po_implications && <small>Report recommendation: {finding.po_implications}</small>}{(finding.existing_po_workspace.po_assessment || finding.existing_po_workspace.notes || finding.existing_po_workspace.next_action) && <small>Existing PO assessment · {finding.existing_po_workspace.po_assessment || finding.existing_po_workspace.notes || "No assessment text"}{finding.existing_po_workspace.next_action ? ` · Next action: ${finding.existing_po_workspace.next_action}` : ""}</small>}{finding.evidence_references.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}>Open supplied source</a>)}</span></label>; })}</div> : <p className="opportunity-muted">This report has no structured findings to attach. Its original report remains available from Reports.</p> : <p className="opportunity-muted">No qualitative report is selected. Candidate identity will not be inferred from a similar display name.</p>}</section>
        <section className="opportunity-decision"><div className="opportunity-section-heading"><div><span className="state-label">YOUR DECISION</span><h3>Assessment and next action</h3></div><span className={`benchmark-save-state is-${saveState === 'failed' ? 'failed' : saveState}`} role="status">{saveState === 'saved' ? 'Saved' : saveState === 'unsaved' ? 'Unsaved changes' : saveState === 'saving' ? 'Saving…' : 'Save failed'}</span></div>
          <div className="opportunity-fields"><label>PO decision<select aria-label="PO decision" value={decision.decision_status ?? ''} onChange={(event) => changeDecision({ decision_status: (event.target.value || null) as OpportunityDecision['decision_status'] })}><option value="">Not decided</option>{Object.entries(decisionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>PO priority<select aria-label="Set PO priority" value={decision.priority} onChange={(event) => changeDecision({ priority: event.target.value as OpportunityDecision['priority'] })}><option value="not_assessed">Not assessed</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><small>Explicit PO judgment; this is not a market score.</small></label><label>Review date<input type="date" value={decision.review_date ?? ''} onChange={(event) => changeDecision({ review_date: event.target.value || null })} /></label></div>
          <label className="opportunity-block-field">PO rationale<textarea rows={3} value={decision.rationale} onChange={(event) => changeDecision({ rationale: event.target.value })} placeholder="What is your assessment, and why?" /></label>
          <div className="opportunity-assessments"><div className="opportunity-section-heading"><h4>Assessment dimensions</h4><span>Classify each entry as fact, finding, hypothesis, PO judgment, or unknown.</span></div><div className="opportunity-add-dimension"><select aria-label="Suggested assessment dimension" value={dimensionSuggestions.includes(assessmentDimension) ? assessmentDimension : ''} onChange={(event) => setAssessmentDimension(event.target.value)}><option value="">Choose a suggested dimension</option>{dimensionSuggestions.map((item) => <option value={item} key={item}>{item}</option>)}</select><input aria-label="Custom assessment dimension" value={dimensionSuggestions.includes(assessmentDimension) ? '' : assessmentDimension} onChange={(event) => setAssessmentDimension(event.target.value)} placeholder="Or add a custom criterion" /><button type="button" className="secondary-action" onClick={addAssessment} disabled={!assessmentDimension.trim()}>Add</button></div>{decision.assessments.map((item, index) => <div className="opportunity-assessment-row" key={`${item.dimension}:${index}`}><div><strong>{item.dimension}</strong><button type="button" className="text-button" onClick={() => changeDecision({ assessments: decision.assessments.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div><select aria-label={`${item.dimension} evidence type`} value={item.kind} onChange={(event) => changeDecision({ assessments: decision.assessments.map((value, itemIndex) => itemIndex === index ? { ...value, kind: event.target.value as OpportunityAssessment['kind'] } : value) })}>{Object.entries(assessmentKinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><textarea aria-label={`${item.dimension} assessment`} rows={2} value={item.statement} onChange={(event) => changeDecision({ assessments: decision.assessments.map((value, itemIndex) => itemIndex === index ? { ...value, statement: event.target.value } : value) })} placeholder={item.kind === 'unknown' ? 'What evidence is missing?' : 'Record the supporting assessment'} /></div>)}</div>
          <label className="opportunity-block-field">Open questions<textarea rows={2} value={questionDraft} onChange={(event) => { setQuestionDraft(event.target.value); revision.current += 1; setSaveState('unsaved'); }} placeholder="One question per line" /></label>
          <label className="opportunity-block-field">Next action<textarea rows={2} value={decision.next_action} onChange={(event) => changeDecision({ next_action: event.target.value })} placeholder="What should happen next?" /></label>
          <details className="opportunity-attached-evidence"><summary>Selected evidence ({decision.supporting_evidence.length} supporting · {decision.contradictory_evidence.length} contradictory)</summary><strong>Supporting evidence</strong>{decision.supporting_evidence.map((ref, index) => <div key={`support:${ref.kind}:${ref.report_id || ref.dataset_id}:${ref.item_key || ref.source_row_number}:${index}`}><span>{ref.kind === 'quantitative' ? `CSV row ${ref.source_row_number ?? 'unknown'} · ${ref.metric_id ?? 'metric'}` : `Report ${ref.report_id} · ${ref.item_key}`}</span><button className="text-button" onClick={() => toggleEvidence(ref, 'supporting_evidence')}>Remove</button></div>)}<strong>Contradictory evidence</strong>{decision.contradictory_evidence.map((ref, index) => <div key={`contradict:${ref.kind}:${ref.report_id || ref.dataset_id}:${ref.item_key || ref.source_row_number}:${index}`}><span>{ref.kind === 'quantitative' ? `CSV row ${ref.source_row_number ?? 'unknown'} · ${ref.metric_id ?? 'metric'}` : `Report ${ref.report_id} · ${ref.item_key}`}</span><button className="text-button" onClick={() => toggleEvidence(ref, 'contradictory_evidence')}>Remove</button></div>)}</details>
          {!!candidate.unresolved_decision_evidence.length && <p className="research-alert">Some previously attached evidence is stale. It is retained in the saved decision but excluded from current evidence.</p>}
          {error && <p className="research-alert" role="alert">{error}</p>}{notice && <p className="workspace-success" role="status">{notice}</p>}
          <div className="opportunity-save-row"><span>Research report evidence remains unverified; your judgment is stored separately.</span><button className="primary-action" disabled={saveState === 'saving' || saveState === 'saved'} onClick={() => void save()}>{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Retry save' : 'Save PO decision'}</button></div>
        </section>
      </section>}
    </div>}
  </main>;
}
