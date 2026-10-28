// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectHome } from './ProjectHome';
import { researchApi } from './api';
import { reportApi } from '../reports/api';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, researchApi: {
    ...original.researchApi,
    getProject: vi.fn(), listBenchmarkCollections: vi.fn(), listSubjects: vi.fn(),
    listTrendUpdates: vi.fn(), listSavedInformation: vi.fn(), getOpportunities: vi.fn(),
  } };
});

vi.mock('../reports/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../reports/api')>();
  return { ...original, reportApi: { ...original.reportApi, listProjectReports: vi.fn(), listComparisonDatasets: vi.fn() } };
});

describe('ProjectHome data entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(researchApi.getProject).mockResolvedValue({ id: 'project-a', name: 'Dự án A', created_at: '2026-10-28', updated_at: '2026-10-28', owner: null, category: null, workspace_state_json: null } as never);
    vi.mocked(researchApi.listBenchmarkCollections).mockResolvedValue({ items: [], next_cursor: null, limit: 100 } as never);
    vi.mocked(researchApi.listSubjects).mockResolvedValue({ items: [], next_cursor: null, limit: 100 } as never);
    vi.mocked(researchApi.listTrendUpdates).mockResolvedValue({ items: [], next_cursor: null, limit: 10 } as never);
    vi.mocked(researchApi.listSavedInformation).mockResolvedValue({ items: [], next_cursor: null, limit: 10 } as never);
    vi.mocked(researchApi.getOpportunities).mockResolvedValue(null as never);
    vi.mocked(reportApi.listProjectReports).mockResolvedValue({ items: [], next_cursor: null, limit: 100 } as never);
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [{
      id: 'dataset-a', project_id: 'project-a', report_id: null, report_question: null,
      filename: 'export.csv', content_sha256: 'hash', created_at: '2026-10-28', compatibility_status: 'partial',
      metrics: [], periods: [], geo_values: [], platform_values: [], source_apps: 12, warnings: [],
    }], next_cursor: null, limit: 100 } as never);
  });

  afterEach(() => cleanup());

  it('opens the chosen CSV directly in its project data review', async () => {
    render(<ProjectHome projectId="project-a" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Dự án A' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Lưu thông tin mới/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Phân tích dữ liệu/ })).toBeNull();
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/research?projectId=project-a&view=data#project-saved-information')).toHaveLength(1);
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/research?projectId=project-a&view=data&action=import-csv#project-csv-data')).toHaveLength(1);
    const dataLink = await screen.findByRole('link', { name: 'Mở số liệu từ export.csv' });
    expect(dataLink.getAttribute('href')).toBe('/research?projectId=project-a&view=data&datasetId=dataset-a#project-csv-data');
    expect(dataLink.textContent).toContain('12 sản phẩm · 0 chỉ số · Dữ liệu nguồn · cần kiểm tra điều kiện so sánh');
    expect(screen.queryByRole('link', { name: /Đã thêm tệp dữ liệu.*export\.csv/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Thông tin đã lưu' })).toBeTruthy();
  });

  it('opens a selected product or topic profile in the project workspace', async () => {
    vi.mocked(researchApi.listSubjects).mockResolvedValue({ items: [{ id: 'subject-7', name: 'Puzzle Sample' }], next_cursor: null, limit: 100 } as never);
    render(<ProjectHome projectId="project-a" />);
    const subjectLink = await screen.findByRole('link', { name: 'Mở hồ sơ Puzzle Sample' });
    expect(subjectLink.getAttribute('href')).toBe('/research?projectId=project-a&view=data&subjectId=subject-7#project-subject-profiles');
  });

  it('opens a saved comparison collection in the project workspace', async () => {
    vi.mocked(researchApi.listBenchmarkCollections).mockResolvedValue({ items: [{ id: 'collection-2', name: 'Shortlist', members: [] }], next_cursor: null, limit: 100 } as never);
    render(<ProjectHome projectId="project-a" />);
    const collectionLink = await screen.findByRole('link', { name: 'Mở bộ so sánh Shortlist' });
    expect(collectionLink.getAttribute('href')).toBe('/research?projectId=project-a&view=data&collectionId=collection-2#project-benchmark-collections');
  });

  it('shows a saved PO decision and deep-links back to the exact report finding', async () => {
    vi.mocked(researchApi.getOpportunities).mockResolvedValue({ candidates: [{
      candidate_id: 'finding-candidate', name: 'Surprise Dumpling', stale: false,
      decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-7', report_content_sha256: 'report-hash', item_key: 'market-signal' },
      decision: { decision_status: 'hold', next_action: 'Xác minh nguồn trước khi quyết định' },
    }], reports: [], shortlist_dataset_id: null, shortlist_valid: true, shortlist_warning: null } as never);
    render(<ProjectHome projectId="project-a" />);
    const decision = await screen.findByRole('link', { name: /Surprise Dumpling.*Tạm hoãn.*Xác minh nguồn trước khi quyết định/ });
    const expectedHref = '/research?projectId=project-a&view=opportunities&decisionKind=report_finding&decisionReportId=report-7&decisionReportHash=report-hash&decisionItemKey=market-signal';
    expect(decision.getAttribute('href')).toBe(expectedHref);
    expect(screen.getByRole('heading', { name: 'Quyết định PO' })).toBeTruthy();
  });
});
