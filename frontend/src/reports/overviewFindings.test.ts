import { describe, expect, it } from 'vitest';
import type { ResearchData } from './api';
import { prioritizeOverviewFindings } from './overviewFindings';

type Finding = ResearchData['findings'][number];
const finding = (key: string): Finding => ({
  key, title: key, finding_type: 'observation', description: `Description ${key}`,
  related_entities: [], evidence_references: [], source_locations: [], scope: {},
  evidence_status: 'unverified', confidence: null, uncertainty: null, po_implications: null,
});

describe('overview findings preview ordering', () => {
  it('prioritizes valid report-supplied highlights, then preserves stored order', () => {
    const ordered = prioritizeOverviewFindings(['a', 'b', 'c'].map(finding), ['c', 'missing', 'a', 'c']);
    expect(ordered.map((item) => item.key)).toEqual(['c', 'a', 'b']);
    expect(ordered.slice(0, 2).map((item) => item.key)).toEqual(['c', 'a']);
  });

  it('falls back to stored order when no highlight key resolves', () => {
    expect(prioritizeOverviewFindings(['a', 'b'].map(finding), ['missing']).map((item) => item.key)).toEqual(['a', 'b']);
  });
});
