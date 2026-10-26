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
    mockFetch(() => project);
    render(<TrackingWorkspace projectId="project-1" />);
    expect(await screen.findByText('Tracking setup pending')).toBeTruthy();
    expect(screen.getByText(/does not yet monitor new reports/)).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Project sections' }).querySelector('a[href^="/research?"]')?.getAttribute('href')).toContain('projectId=project-1');
    expect(screen.getByRole('navigation', { name: 'Project sections' }).querySelector('a[href^="/reports?"]')?.getAttribute('href')).toContain('/reports?projectId=project-1');
    expect(screen.getByRole('link', { name: 'Review PO decisions' }).getAttribute('href')).toContain('view=opportunities');
  });

  it('lists existing projects as follow-up destinations without implying monitoring is active', async () => {
    mockFetch((url) => url.includes('/projects?') ? { items: [project], next_cursor: null, limit: 20 } : project);
    render(<TrackingWorkspace projectId={null} />);
    expect(await screen.findByText('Utility research')).toBeTruthy();
    expect(screen.getByText(/There are no automatic updates, trend comparisons, or change alerts/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open tracking status' }).getAttribute('href')).toContain('projectId=project-1');
  });
});
