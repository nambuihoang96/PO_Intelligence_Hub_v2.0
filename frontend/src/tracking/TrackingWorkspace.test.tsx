// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TrackingWorkspace } from './TrackingWorkspace';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mockFetch(handler: (url: string) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(handler(String(input))), { status: 200, headers: { 'Content-Type': 'application/json' } })));
}

const project = { id: 'project-1', name: 'Utility research', owner: null, category: 'Utilities', created_at: '2026-01-01', updated_at: '2026-01-02' };

describe('Tracking workspace', () => {
  it('shows tracking as pending without fabricated updates and links to the project journey', async () => {
    mockFetch((url) => url.endsWith('/opportunities') ? { project_id: project.id, shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null, candidates: [], reports: [] } : project);
    render(<TrackingWorkspace projectId="project-1" />);
    expect(await screen.findByText('Chưa có quyết định PO nào được lưu trong dự án này.')).toBeTruthy();
    expect(screen.getByText(/So sánh thay đổi và cảnh báo tự động chưa được triển khai/)).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Các phần của dự án' }).querySelector('a[href^="/research?"]')?.getAttribute('href')).toContain('projectId=project-1');
    expect(screen.getByRole('navigation', { name: 'Các phần của dự án' }).querySelector('a[href^="/reports?"]')?.getAttribute('href')).toContain('/reports?projectId=project-1');
    expect(screen.getByRole('link', { name: /Xem và cập nhật quyết định/ }).getAttribute('href')).toContain('view=opportunities');
  });

  it('lists existing projects as follow-up destinations without implying monitoring is active', async () => {
    mockFetch((url) => url.includes('/projects?') ? { items: [project], next_cursor: null, limit: 20 } : project);
    render(<TrackingWorkspace projectId={null} />);
    expect(await screen.findByText('Utility research')).toBeTruthy();
    expect(screen.getByText(/Hiện chưa có cảnh báo tự động/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Xem theo dõi/ }).getAttribute('href')).toContain('projectId=project-1');
  });

  it('reopens a saved report finding decision in its original context', async () => {
    mockFetch((url) => url.endsWith('/opportunities') ? { project_id: project.id, shortlist_dataset_id: null, shortlist_valid: false, shortlist_warning: null, reports: [], candidates: [{
      candidate_id: 'candidate-1', name: 'Finding: save progress', stale: false,
      decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-9', report_content_sha256: 'sha-9', item_key: 'progression' },
      decision: { decision_status: 'hold', rationale: 'Need stronger evidence', next_action: 'Review another source', review_date: null, updated_at: '2026-10-28' },
    }] } : project);
    render(<TrackingWorkspace projectId="project-1" />);
    expect(await screen.findByText('Finding: save progress')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở quyết định →' }).getAttribute('href')).toBe('/research?projectId=project-1&view=opportunities&decisionKind=report_finding&decisionReportId=report-9&decisionReportHash=sha-9&decisionItemKey=progression');
  });
});
