import { describe, expect, it } from 'vitest';
import { EVIDENCE_LABEL, findingEvidenceLevel, sortByEvidence, sourceKind } from './evidenceLevel';

describe('sourceKind', () => {
  it('classifies store pages by domain and everything else as independent', () => {
    expect(sourceKind('https://play.google.com/store/apps/details?id=com.oakever.meowdoku')).toBe('store');
    expect(sourceKind('https://apps.apple.com/app/id123')).toBe('store');
    expect(sourceKind('https://www.gamesindustry.biz/articles/some-deconstruction')).toBe('independent');
    expect(sourceKind('https://play.google.com.evil.example/x')).toBe('independent');
    expect(sourceKind('not a url')).toBe('invalid');
  });
});

describe('findingEvidenceLevel', () => {
  it('marks a finding without usable sources as a hypothesis', () => {
    expect(findingEvidenceLevel([])).toBe('hypothesis');
    expect(findingEvidenceLevel(['not a url'])).toBe('hypothesis');
    expect(EVIDENCE_LABEL.hypothesis).toBe('Giả thuyết: chưa có nguồn');
  });

  it('marks store-only sources with the plain Vietnamese limit', () => {
    expect(findingEvidenceLevel(['https://play.google.com/store/apps/details?id=a', 'https://apps.apple.com/app/b'])).toBe('store_only');
    expect(EVIDENCE_LABEL.store_only).toBe('Chỉ có nguồn store: mô tả game, chưa chứng minh insight');
  });

  it('marks any independent source as independent evidence', () => {
    expect(findingEvidenceLevel(['https://play.google.com/store/apps/details?id=a', 'https://example-press.com/analysis'])).toBe('independent');
  });

  it('sorts better-evidenced findings first and keeps the original order otherwise', () => {
    const sorted = sortByEvidence([
      { key: 'hyp', evidence_references: [] },
      { key: 'store', evidence_references: ['https://play.google.com/store/apps/details?id=a'] },
      { key: 'indep', evidence_references: ['https://example-press.com/analysis'] },
      { key: 'store2', evidence_references: ['https://apps.apple.com/app/b'] },
    ]).map((item) => item.key);
    expect(sorted).toEqual(['indep', 'store', 'store2', 'hyp']);
  });
});
