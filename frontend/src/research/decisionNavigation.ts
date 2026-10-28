import type { OpportunityCandidate } from './api';

export function opportunityDecisionHref(projectId: string, candidate: Pick<OpportunityCandidate, 'decision_target' | 'decision'>): string {
  const target = candidate.decision_target ?? candidate.decision?.decision_target;
  if (!target) return `/research?projectId=${encodeURIComponent(projectId)}&view=opportunities`;
  const params = new URLSearchParams({ projectId, view: 'opportunities', decisionKind: target.kind });
  if (target.kind === 'report_finding' || target.kind === 'report_entity') {
    if (target.report_id) params.set('decisionReportId', target.report_id);
    if (target.report_content_sha256) params.set('decisionReportHash', target.report_content_sha256);
    if (target.item_key) params.set('decisionItemKey', target.item_key);
  } else {
    params.set('decisionTargetId', target.target_id);
  }
  return `/research?${params.toString()}`;
}
