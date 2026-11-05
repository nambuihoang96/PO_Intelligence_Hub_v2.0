// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('heading', { name: 'Dữ liệu CSV mới nhất' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Thay đổi cần xem' })).toBeNull();
    const savedDisclosure = await screen.findByText('Dữ liệu và nội dung đã lưu');
    expect((savedDisclosure.closest('details') as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(savedDisclosure);
    expect(screen.queryByRole('link', { name: /Lưu thông tin mới/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Phân tích dữ liệu/ })).toBeNull();
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/research?projectId=project-a&view=notes#project-saved-information')).toHaveLength(1);
    // The header offers CSV import as an equal entry point, and the saved-data links keep their own copy.
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/research?projectId=project-a&view=csv&action=import-csv#project-csv-data')).toHaveLength(2);
    const dataLink = await screen.findByRole('link', { name: 'Mở phân tích CSV export.csv' });
    expect(dataLink.getAttribute('href')).toBe('/research?projectId=project-a&view=csv&datasetId=dataset-a#project-csv-data');
    expect(dataLink.textContent).toContain('12 sản phẩm · 0 chỉ số');
    expect(screen.queryByRole('link', { name: /Đã thêm tệp dữ liệu.*export\.csv/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Thông tin đã lưu' })).toBeTruthy();
  });

  it('uses a neutral CSV heading and opens the newest file when saved files are incompatible', async () => {
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [
      { id: 'dataset-new', project_id: 'project-a', report_id: null, report_question: null, filename: 'new.csv', content_sha256: 'new-hash', created_at: '2026-10-29', compatibility_status: 'incompatible', metrics: [], periods: [], geo_values: [], platform_values: [], source_apps: 5, warnings: [] },
      { id: 'dataset-old', project_id: 'project-a', report_id: null, report_question: null, filename: 'old.csv', content_sha256: 'old-hash', created_at: '2026-10-28', compatibility_status: 'incompatible', metrics: [], periods: [], geo_values: [], platform_values: [], source_apps: 4, warnings: [] },
    ], next_cursor: null, limit: 100 } as never);
    render(<ProjectHome projectId="project-a" />);
    expect(await screen.findByRole('heading', { name: 'Dữ liệu CSV mới nhất' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Thay đổi cần xem' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Mở phân tích CSV new.csv' }).getAttribute('href'))
      .toBe('/research?projectId=project-a&view=csv&datasetId=dataset-new#project-csv-data');
  });

  it('shows project results and the PO decision before secondary links', async () => {
    const { container } = render(<ProjectHome projectId="project-a" />);
    expect(await screen.findByRole('heading', { name: 'Dự án A' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Các phần của dự án' }).querySelector('a[aria-current="page"]')?.textContent).toContain('Nghiên cứu');
    expect(screen.getByRole('heading', { name: 'Kết quả mới nhất' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Quyết định PO' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nhập CSV' }).getAttribute('href')).toBe('/research?projectId=project-a&view=csv&action=import-csv#project-csv-data');
    expect(screen.getByRole('link', { name: 'Nghiên cứu tổng quan' }).getAttribute('href')).toBe('/research?projectId=project-a&view=plan');
    expect(document.querySelectorAll('.project-home-primary-link')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Quy trình trong dự án' })).toBeNull();
    expect(container.querySelector('.project-home-header-actions a[href="/?projectId=project-a&action=import"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Chuyển sang giao diện tối' })).toBeTruthy();
    fireEvent.click(await screen.findByText('Dữ liệu và nội dung đã lưu'));
    expect(screen.getByRole('link', { name: 'Nhập báo cáo' }).getAttribute('href')).toBe('/?projectId=project-a&action=import');
    expect(screen.getByRole('link', { name: 'Phân tích CSV' }).getAttribute('href')).toBe('/research?projectId=project-a&view=csv&action=import-csv#project-csv-data');
    expect(screen.queryByRole('heading', { name: 'Bạn muốn thực hiện gì?' })).toBeNull();
    expect(document.querySelector('.project-home-action-grid')).toBeNull();
  });

  it('makes the latest saved report readable and shows its source scope', async () => {
    vi.mocked(reportApi.listProjectReports).mockResolvedValue({ items: [{
      id: 'report-current', project_id: 'project-a', question: 'How does onboarding change?', geo: 'US', os: 'iOS',
      research_period: '2026 H1', content_sha256: 'report-hash', origin: 'chatgpt_user_import', imported_at: '2026-10-28',
      verification_status: 'unverified', finding_count: 4, entity_count: 3,
    }], next_cursor: null, limit: 100 } as never);
    render(<ProjectHome projectId="project-a" />);
    expect(await screen.findByRole('heading', { name: 'How does onboarding change?' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đọc báo cáo và nguồn' }).getAttribute('href')).toBe('/reports/report-current');
    expect(screen.getByText('US · iOS · 2026 H1 · 28/10/2026')).toBeTruthy();
    expect(screen.getByText('4 phát hiện')).toBeTruthy();
    expect(screen.getByText('3 thực thể')).toBeTruthy();
  });

  it('keeps older CSV files tucked away behind one short disclosure', async () => {
    vi.mocked(reportApi.listComparisonDatasets).mockResolvedValue({ items: [
      { id: 'dataset-new', project_id: 'project-a', report_id: null, report_question: null, filename: 'new.csv', content_sha256: 'new-hash', created_at: '2026-10-29', compatibility_status: 'partial', metrics: [], periods: [], geo_values: [], platform_values: [], source_apps: 5, warnings: [] },
      { id: 'dataset-old-a', project_id: 'project-a', report_id: null, report_question: null, filename: 'old-a.csv', content_sha256: 'old-a-hash', created_at: '2026-10-28', compatibility_status: 'partial', metrics: [], periods: [], geo_values: [], platform_values: [], source_apps: 4, warnings: [] },
      { id: 'dataset-old-b', project_id: 'project-a', report_id: null, report_question: null, filename: 'old-b.csv', content_sha256: 'old-b-hash', created_at: '2026-10-27', compatibility_status: 'partial', metrics: [], periods: [], geo_values: [], platform_values: [], source_apps: 3, warnings: [] },
    ], next_cursor: null, limit: 100 } as never);
    const { container } = render(<ProjectHome projectId="project-a" />);
    fireEvent.click(await screen.findByText('Dữ liệu và nội dung đã lưu'));
    const olderFiles = await screen.findByText('Xem 2 tệp CSV còn lại');
    expect((olderFiles.closest('details') as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(olderFiles);
    expect(await screen.findByRole('link', { name: 'Mở phân tích CSV old-a.csv' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở phân tích CSV old-b.csv' })).toBeTruthy();
    expect(container.querySelector('.project-home-current-dataset')).toBeTruthy();
  });

  it('opens a selected product or topic profile in the project workspace', async () => {
    vi.mocked(researchApi.listSubjects).mockResolvedValue({ items: [{ id: 'subject-7', name: 'Puzzle Sample' }], next_cursor: null, limit: 100 } as never);
    render(<ProjectHome projectId="project-a" />);
    fireEvent.click(await screen.findByText('Dữ liệu và nội dung đã lưu'));
    const subjectLink = await screen.findByRole('link', { name: 'Mở hồ sơ Puzzle Sample' });
    expect(subjectLink.getAttribute('href')).toBe('/research?projectId=project-a&view=notes&subjectId=subject-7#project-subject-profiles');
  });

  it('starts a research-again intake from the most recent project report', async () => {
    vi.mocked(reportApi.listProjectReports).mockResolvedValue({ items: [{
      id: 'report-current', project_id: 'project-a', question: 'How does onboarding change?', geo: 'Worldwide', os: 'iOS',
      research_period: '2026 H1', content_sha256: 'report-hash', origin: 'chatgpt_user_import', imported_at: '2026-10-28',
      verification_status: 'unverified', finding_count: 2, entity_count: 1,
    }], next_cursor: null, limit: 100 } as never);
    render(<ProjectHome projectId="project-a" />);
    const link = await screen.findByRole('link', { name: 'Nghiên cứu tổng quan' });
    expect(link.getAttribute('href')).toBe('/?projectId=project-a&question=How%20does%20onboarding%20change%3F&geo=Worldwide&environment=iOS&fromReportId=report-current&action=research-again');
  });

  it('opens a saved comparison collection in the project workspace', async () => {
    vi.mocked(researchApi.listBenchmarkCollections).mockResolvedValue({ items: [{ id: 'collection-2', name: 'Shortlist', members: [] }], next_cursor: null, limit: 100 } as never);
    render(<ProjectHome projectId="project-a" />);
    fireEvent.click(await screen.findByText('Dữ liệu và nội dung đã lưu'));
    const collectionLink = await screen.findByRole('link', { name: 'Mở bộ so sánh Shortlist' });
    expect(collectionLink.getAttribute('href')).toBe('/research?projectId=project-a&view=notes&collectionId=collection-2#project-benchmark-collections');
  });

  it('shows a saved PO decision and deep-links back to the exact report finding', async () => {
    vi.mocked(researchApi.getOpportunities).mockResolvedValue({ candidates: [{
      candidate_id: 'finding-candidate', name: 'Surprise Dumpling', stale: false,
      decision_target: { kind: 'report_finding', target_id: 'finding-1', report_id: 'report-7', report_content_sha256: 'report-hash', item_key: 'market-signal' },
      decision: { decision_status: 'hold', workflow_status: 'not_started', next_action: 'Xác minh nguồn trước khi quyết định' },
    }], reports: [], shortlist_dataset_id: null, shortlist_valid: true, shortlist_warning: null } as never);
    vi.mocked(reportApi.listProjectReports).mockResolvedValue({ items: [{
      id: 'report-7', project_id: 'project-a', question: 'Game market findings', geo: 'Worldwide', os: 'iOS',
      research_period: '2026 H1', content_sha256: 'report-hash', origin: 'chatgpt_user_import', imported_at: '2026-10-28',
      verification_status: 'unverified', finding_count: 1, entity_count: 0,
    }], next_cursor: null, limit: 100 } as never);
    render(<ProjectHome projectId="project-a" />);
    fireEvent.click(await screen.findByText('Dữ liệu và nội dung đã lưu'));
    const decision = await screen.findByRole('link', { name: /Surprise Dumpling.*Tạm hoãn.*Xác minh nguồn trước khi quyết định/ });
    const expectedHref = '/research?projectId=project-a&view=opportunities&decisionKind=report_finding&decisionReportId=report-7&decisionReportHash=report-hash&decisionItemKey=market-signal';
    expect(decision.getAttribute('href')).toBe(expectedHref);
    expect(document.querySelector('.project-home-continue h2')?.textContent).toBe('Quyết định PO');
    expect(screen.getByText('Chưa bắt đầu')).toBeTruthy();
    expect(screen.getByText('Tạm hoãn')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Nguồn nghiên cứu: Game market findings/ }).getAttribute('href')).toBe('/reports/report-7');
    expect(screen.getByRole('link', { name: 'Xem quyết định và cập nhật' }).getAttribute('href')).toBe(expectedHref);
  });
});
