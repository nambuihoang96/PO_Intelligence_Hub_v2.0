// Evidence level of a finding, decided by the app from the source domains only (no model judgement).
// Store pages describe a game; they cannot prove an insight. The link content is NOT checked here,
// so no label means "verified". Existing reports get these labels without any rewrite of stored content.

export const STORE_DOMAINS = ['play.google.com', 'apps.apple.com', 'itunes.apple.com', 'apps.microsoft.com', 'appgallery.huawei.com'];

export type SourceKind = 'store' | 'independent' | 'invalid';
export type EvidenceLevel = 'independent' | 'store_only' | 'hypothesis';

export function sourceKind(url: string): SourceKind {
  let host: string;
  try {
    host = new URL(url).hostname.toLocaleLowerCase();
  } catch {
    return 'invalid';
  }
  if (!host) return 'invalid';
  return STORE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`)) ? 'store' : 'independent';
}

// Rule: no usable URL → hypothesis; any independent domain → independent; only store domains → store_only.
export function findingEvidenceLevel(urls: string[]): EvidenceLevel {
  const kinds = urls.map(sourceKind).filter((kind) => kind !== 'invalid');
  if (!kinds.length) return 'hypothesis';
  if (kinds.includes('independent')) return 'independent';
  return 'store_only';
}

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  independent: 'Có nguồn độc lập',
  store_only: 'Chỉ có nguồn store: mô tả game, chưa chứng minh insight',
  hypothesis: 'Giả thuyết: chưa có nguồn',
};

// Better-evidenced findings first; ties keep the report's own order.
export const EVIDENCE_RANK: Record<EvidenceLevel, number> = { independent: 0, store_only: 1, hypothesis: 2 };

export function sortByEvidence<T extends { evidence_references: string[] }>(findings: T[]): T[] {
  return findings
    .map((finding, index) => ({ finding, index, rank: EVIDENCE_RANK[findingEvidenceLevel(finding.evidence_references)] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.finding);
}
