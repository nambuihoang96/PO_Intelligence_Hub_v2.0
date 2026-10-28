import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExplorerWorkspace } from './explorer/ExplorerWorkspace';
import { ResearchWorkspace } from './research/ResearchWorkspace';
import { ResearchRunsWorkspace } from './research/ResearchRunsWorkspace';
import { SourcesWorkspace } from './sources/SourcesWorkspace';
import { ReportHistory, ReportViewer, ResearchIntake } from './reports/ResearchIntake';
import { QuantitativePeriodComparison } from './reports/QuantitativePeriodComparison';
import { ResultsIcon, type ResultsIconName } from './ui/ResultsIcon';
import { AppNavigation } from './AppNavigation';
import { TrackingWorkspace } from './tracking/TrackingWorkspace';
import './style.css';

type Page = {
  path: string;
  label: string;
  icon: ResultsIconName;
  eyebrow: string;
  title: string;
  intro: string;
  emptyTitle: string;
  emptyCopy: string;
};

const pages: Page[] = [
  {
    path: '/research',
    label: 'Nghiên cứu',
    icon: 'search',
    eyebrow: 'NGHIÊN CỨU',
    title: 'Dự án nghiên cứu',
    intro: 'Quản lý nghiên cứu, phân tích dữ liệu và theo dõi quyết định trong một nơi.',
    emptyTitle: 'Chưa có dự án nghiên cứu',
    emptyCopy: 'Tạo dự án để nghiên cứu hoặc phân tích dữ liệu CSV.',
  },
  {
    path: '/reports',
    label: 'Báo cáo',
    icon: 'reports',
    eyebrow: 'BÁO CÁO VÀ QUYẾT ĐỊNH',
    title: 'Báo cáo và quyết định',
    intro: 'Tìm lại báo cáo đã lưu và các quyết định liên quan.',
    emptyTitle: 'Chưa có báo cáo',
    emptyCopy: 'Các báo cáo nghiên cứu đã lưu sẽ xuất hiện tại đây.',
  },
  {
    path: '/tracking',
    label: 'Theo dõi',
    icon: 'runs',
    eyebrow: 'THEO DÕI',
    title: 'Theo dõi',
    intro: 'Theo dõi quyết định và cập nhật nghiên cứu theo dự án.',
    emptyTitle: 'Chưa có dữ liệu theo dõi',
    emptyCopy: 'Chưa có tính năng tự động giám sát hoặc so sánh các lần báo cáo.',
  },
];

const secondaryPages: Page[] = [
  {
    path: '/research/new',
    label: 'Tạo dự án',
    icon: 'findings',
    eyebrow: 'NGHIÊN CỨU',
    title: 'Tạo dự án nghiên cứu',
    intro: 'Tất cả câu hỏi, báo cáo và dữ liệu được lưu chung trong dự án.',
    emptyTitle: 'Chưa thể thiết lập dự án',
    emptyCopy: 'Không gian này đã sẵn sàng. Việc tạo dự án và chỉnh sửa kế hoạch sẽ được bổ sung sau.',
  },
  {
    path: '/research/runs',
    label: 'Lịch sử nghiên cứu',
    icon: 'runs',
    eyebrow: 'NGHIÊN CỨU',
    title: 'Lịch sử nghiên cứu',
    intro: 'Xem lại các lượt nghiên cứu và mở kết quả khi đã có.',
    emptyTitle: 'Chưa có lượt nghiên cứu',
    emptyCopy: 'Lịch sử nghiên cứu sẽ xuất hiện sau khi bạn tạo dự án.',
  },
];

const allPages = [...pages, ...secondaryPages];

function currentPage(pathname: string): Page {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/') return pages.find((page) => page.path === '/research')!;
  if (path.startsWith('/reports/')) return pages.find((page) => page.path === '/reports')!;
  if (path.startsWith('/compare-periods')) return pages.find((page) => page.path === '/research')!;
  if (path.startsWith('/sources') || path.startsWith('/explorer')) return pages.find((page) => page.path === '/research')!;
  return allPages.find((page) => page.path === path) ?? pages[0];
}

function EmptyState({ page }: { page: Page }) {
  return (
    <section className="empty-card" aria-labelledby="empty-title">
      <div className="empty-icon"><ResultsIcon name={page.icon} /></div>
      <div className="empty-copy">
        <span className="state-label">CHƯA CÓ DỮ LIỆU</span>
        <h2 id="empty-title">{page.emptyTitle}</h2>
        <p>{page.emptyCopy}</p>
      </div>
    </section>
  );
}

function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const syncPath = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('projectId');
  const page = pathname === '/' && projectId ? pages.find((item) => item.path === '/reports')! : currentPage(pathname);
  const researchPage = page.path.startsWith('/research');
  const runId = params.get('runId');
  const projectSelected = Boolean(projectId);
  const opportunityReviewView = params.get('view') === 'opportunities';
  const dataWorkspace = projectSelected && ['data', 'opportunities'].includes(params.get('view') ?? '');
  const projectView = params.get('view');
  const pageTitle = pathname.startsWith('/reports/') ? 'Báo cáo nghiên cứu' : pathname === '/' && projectId ? 'Nhập báo cáo nghiên cứu' : pathname === '/reports' ? 'Báo cáo đã lưu' : pathname === '/tracking' ? 'Theo dõi' : pathname === '/explorer' ? 'Danh sách ứng dụng App Store' : pathname === '/compare-periods' ? 'So sánh các kỳ' : pathname === '/sources' ? runId ? 'Bằng chứng nghiên cứu' : 'Nguồn nghiên cứu' : page.path === '/research/new' ? 'Tạo dự án'
    : page.path === '/research/runs' ? 'Lịch sử nghiên cứu'
      : page.path === '/sources' && runId ? 'Bằng chứng nghiên cứu' : projectSelected && projectView === 'plan' ? 'Nghiên cứu chuyên sâu' : dataWorkspace ? 'Không gian nghiên cứu' : projectSelected ? 'Tổng quan dự án' : page.title;
  const pageIntro = pathname === '/' && projectId ? 'Lưu báo cáo ChatGPT vào dự án.' : pathname === '/reports' ? 'Tìm và mở báo cáo đã lưu, tiếp tục đánh giá từ dự án liên quan.' : pathname === '/tracking' ? 'Xem các quyết định đã lưu và những công việc cần tiếp tục.' : pathname === '/explorer' ? 'Tìm ứng dụng theo tên, nền tảng và quốc gia.' : pathname === '/compare-periods' ? 'Chỉ so sánh dữ liệu CSV có cùng định nghĩa và phạm vi phù hợp.' : pathname === '/sources' ? runId ? 'Xem bằng chứng của lượt nghiên cứu đã chọn.' : 'Xem nguồn tham khảo trong nghiên cứu.' : page.path === '/research/new'
    ? 'Tạo dự án để bắt đầu nghiên cứu từ trang tổng quan.'
    : page.path === '/research/runs' ? runId ? 'Xem lại lượt nghiên cứu đã chọn và mở bằng chứng.' : 'Xem lại các lượt nghiên cứu và yêu cầu đã lưu.'
      : page.path === '/sources' && runId ? 'Thêm và xem bằng chứng liên kết với lượt nghiên cứu này.'
        : projectSelected && projectView === 'plan' ? 'Nhập câu hỏi và phạm vi nghiên cứu cho dự án.' : dataWorkspace ? 'Lưu thông tin, đọc báo cáo và phân tích dữ liệu trong cùng dự án.' : projectSelected ? 'Báo cáo, dữ liệu và các bước tiếp theo nằm trong cùng dự án.' : page.intro;

  return (
    <div className={`app-shell${researchPage ? ' research-page' : ''}`}>
      <AppNavigation pages={pages} currentPath={page.path} currentLabel={page.label} />

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><a href="/">Không gian làm việc</a><span aria-hidden="true">/</span>{page.label}</div>
          <div className="local-badge"><span className="badge-dot" />Chế độ cục bộ</div>
        </header>

        <div className="content-wrap">
          {!opportunityReviewView && !pathname.startsWith('/reports/') && !(pathname === '/' && projectId) && !(pathname === '/reports' && projectId) && <section className="page-heading" aria-labelledby="page-title">
            <div className="eyebrow">{page.eyebrow}</div>
            <h1 id="page-title">{pageTitle}</h1>
            <p className="intro">{pageIntro}</p>
            {page.path === '/research' && !projectId && (
              <div className="home-actions">
                <a className="secondary-action" href="/explorer">Khám phá danh sách ứng dụng</a>
              </div>
            )}
          </section>}

          {pathname.startsWith('/reports/') ? <ReportViewer reportId={pathname.slice('/reports/'.length)} /> : pathname === '/reports' ? <ReportHistory /> : pathname === '/tracking' ? <TrackingWorkspace projectId={projectId} /> : pathname === '/compare-periods' ? <QuantitativePeriodComparison /> : pathname === '/' ? projectId ? <ResearchIntake /> : <ResearchWorkspace mode="list" /> : page.path === '/research/runs' ? <ResearchRunsWorkspace runId={runId} projectId={projectId} /> : page.path.startsWith('/research') ? <ResearchWorkspace mode={page.path === '/research/new' ? 'new' : ['data', 'opportunities'].includes(params.get('view') ?? '') ? 'data' : 'list'} /> : pathname === '/sources' ? <SourcesWorkspace runId={runId} /> : pathname === '/explorer' ? <ExplorerWorkspace /> : <>
            <div className="section-divider"><span>NỘI DUNG</span><span className="divider-line" /></div>
            <EmptyState page={page} />
            <aside className="connection-note" aria-label="Data connection status">
              <span className="connection-icon" aria-hidden="true">i</span>
              <div><strong>Chưa kết nối dữ liệu</strong><span>Màn hình này không chứa dữ liệu giả lập.</span></div>
              <span className="note-tag">CHỈ LƯU CỤC BỘ</span>
            </aside>
          </>}
        </div>

        <footer className="page-footer"><span>PO INTELLIGENCE HUB</span><span>PHIÊN BẢN 2.0 · ƯU TIÊN LƯU CỤC BỘ</span></footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
