import type { ResearchData } from './api';

type Finding = ResearchData['findings'][number];

/** Honor only finding keys that exist in this report, then retain source order. */
export function prioritizeOverviewFindings(findings: Finding[], highlightedKeys: string[]): Finding[] {
  const byKey = new Map(findings.map((finding) => [finding.key, finding]));
  const highlighted = [...new Set(highlightedKeys)]
    .map((key) => byKey.get(key))
    .filter((finding): finding is Finding => Boolean(finding));
  const highlightedSet = new Set(highlighted.map((finding) => finding.key));
  return [...highlighted, ...findings.filter((finding) => !highlightedSet.has(finding.key))];
}
