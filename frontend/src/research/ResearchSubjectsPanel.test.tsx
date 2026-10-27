// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { researchApi, type ResearchSubject, type ResearchSubjectSource } from './api';
import { ResearchSubjectsPanel } from './ResearchSubjectsPanel';

const subject = (id = 'subject-1', name = 'Example Product'): ResearchSubject => ({
  id, project_id: 'project-1', name, subject_type: 'product', aliases: [], external_ids: [], provenance: {},
  created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
});
const source = (overrides: Partial<ResearchSubjectSource> = {}): ResearchSubjectSource => ({
  project_id: 'project-1', source_kind: 'report_entity', source_id: 'report-1', source_key: 'provider:one',
  source_name: 'Example Product', source_type: 'product', context_name: 'Report one', mapped_subject_id: null,
  mapped_subject_name: null, source_state: 'available', ...overrides,
});
const page = <T,>(items: T[]) => ({ items, next_cursor: null, limit: 50 });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ResearchSubjectsPanel', () => {
  it('does not merge same-named source identities automatically and supports explicit link', async () => {
    const rows = [source(), source({ source_id: 'report-2', source_key: 'provider:two', context_name: 'Report two' })];
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject()]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page(rows));
    const map = vi.spyOn(researchApi, 'mapSubjectSource').mockResolvedValue({ ...rows[0], mapped_subject_id: 'subject-1', mapped_subject_name: 'Example Product' });
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getByText('Research subjects'));
    await screen.findByText('Names found in this project’s sources');
    expect(map).not.toHaveBeenCalled();
    expect(screen.getAllByText('Example Product').length).toBeGreaterThan(1);
    fireEvent.change(screen.getAllByLabelText('Link Example Product to a saved subject')[0], { target: { value: 'subject-1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Link subject' })[0]);
    await waitFor(() => expect(map).toHaveBeenCalledWith('project-1', expect.objectContaining({
      source_kind: 'report_entity', source_id: 'report-1', source_key: 'provider:one', subject_id: 'subject-1',
    })));
  });

  it('creates a persistent subject from the exact supplied name and links it only after the PO action', async () => {
    const candidate = source();
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([candidate]));
    const map = vi.spyOn(researchApi, 'mapSubjectSource').mockResolvedValue({ ...candidate, mapped_subject_id: 'new-subject', mapped_subject_name: candidate.source_name });
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getAllByText('Research subjects')[0]);
    await screen.findByText('Names found in this project’s sources');
    fireEvent.click(screen.getByRole('button', { name: 'Create subject from this name' }));
    await waitFor(() => expect(map).toHaveBeenCalledWith('project-1', expect.objectContaining({
      source_kind: 'report_entity', source_id: 'report-1', source_key: 'provider:one', create_subject_from_source: true,
    })));
  });

  it('keeps historical source links visible but prevents remapping a stale source', async () => {
    const historical = source({ source_state: 'stale', mapped_subject_id: 'subject-1', mapped_subject_name: 'Example Product' });
    vi.spyOn(researchApi, 'listSubjects').mockResolvedValue(page([subject()]));
    vi.spyOn(researchApi, 'listSubjectSources').mockResolvedValue(page([historical]));
    render(<ResearchSubjectsPanel projectId="project-1" />);
    fireEvent.click(screen.getAllByText('Research subjects')[0]);
    expect(await screen.findByText('Historical link · source no longer exposes this identity')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change link' })).toBeNull();
  });
});
