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
    label: 'Research',
    icon: 'search',
    eyebrow: 'RESEARCH WORKSPACE',
    title: 'Research projects',
    intro: 'Plan and follow research work from a focused workspace.',
    emptyTitle: 'No research projects yet',
    emptyCopy: 'Create a project to start from a research question or CSV market data.',
  },
  {
    path: '/reports',
    label: 'Reports',
    icon: 'reports',
    eyebrow: 'REPORTS & DECISIONS',
    title: 'Reports and decisions',
    intro: 'Find completed research outputs and the decisions they inform.',
    emptyTitle: 'No reports are available',
    emptyCopy: 'Completed research reports will appear here. No example or placeholder findings are shown.',
  },
  {
    path: '/tracking',
    label: 'Tracking',
    icon: 'runs',
    eyebrow: 'PRODUCT TRACKING',
    title: 'Tracking',
    intro: 'Follow up on decisions and future research updates by project.',
    emptyTitle: 'Tracking setup is pending',
    emptyCopy: 'No automatic monitoring or report-to-report change tracking is configured yet.',
  },
];

const secondaryPages: Page[] = [
  {
    path: '/research/new',
    label: 'New research',
    icon: 'findings',
    eyebrow: 'RESEARCH WORKSPACE',
    title: 'Start a research project',
    intro: 'A research project will keep its plan, runs, sources, and outputs together.',
    emptyTitle: 'Project setup is not available yet',
    emptyCopy: 'This workspace shell is ready. Project creation and plan editing are scheduled for a later task.',
  },
  {
    path: '/research/runs',
    label: 'Research runs',
    icon: 'runs',
    eyebrow: 'RESEARCH WORKSPACE',
    title: 'Research runs',
    intro: 'Track each research session and return to its results when available.',
    emptyTitle: 'No research runs yet',
    emptyCopy: 'Research sessions will appear here after a project has been set up.',
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
        <span className="state-label">EMPTY WORKSPACE</span>
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
  const pageTitle = pathname.startsWith('/reports/') ? 'Research report' : pathname === '/' && projectId ? 'Import research report' : pathname === '/reports' ? 'Saved research reports' : pathname === '/tracking' ? 'Tracking' : pathname === '/explorer' ? 'App Store listings explorer' : pathname === '/compare-periods' ? 'Compare periods' : pathname === '/sources' ? runId ? 'Run evidence' : 'Research sources' : page.path === '/research/new' ? 'Create a project'
    : page.path === '/research/runs' ? runId ? 'Research run' : 'Research runs'
      : page.path === '/sources' && runId ? 'Run evidence' : projectSelected && projectView === 'plan' ? 'Start Deep Research' : dataWorkspace ? 'Project workspace' : projectSelected ? 'Project Home' : page.title;
  const pageIntro = pathname === '/' && projectId ? 'Add a ChatGPT research report to this project workspace.' : pathname === '/reports' ? 'Search and reopen saved research outputs, or follow them back to their project decisions.' : pathname === '/tracking' ? 'Project follow-up and tracking setup status.' : pathname === '/explorer' ? 'Search listings by app name, platform, and country.' : pathname === '/compare-periods' ? 'Compare only CSV measurements with compatible metric and scope.' : pathname === '/sources' ? runId ? 'Review evidence connected to the selected research run.' : 'Review source records used by research projects.' : page.path === '/research/new'
    ? 'Create a project; you can choose what to do next from its home.'
    : page.path === '/research/runs' ? runId ? 'Review the selected session and open its evidence.' : 'Browse saved research sessions and their selected plan versions.'
      : page.path === '/sources' && runId ? 'Add and review manual evidence linked to this research run.'
        : projectSelected && projectView === 'plan' ? 'Shape the research question and scope for this project.' : dataWorkspace ? 'Bring reports, updates, and data together for this project.' : projectSelected ? 'Reports, research, and next steps in one place.' : page.intro;

  return (
    <div className={`app-shell${researchPage ? ' research-page' : ''}`}>
      <AppNavigation pages={pages} currentPath={page.path} currentLabel={page.label} />

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><a href="/">Workspace</a><span aria-hidden="true">/</span>{page.label}</div>
          <div className="local-badge"><span className="badge-dot" />Local mode</div>
        </header>

        <div className="content-wrap">
          {!opportunityReviewView && !pathname.startsWith('/reports/') && !(pathname === '/' && projectId) && !(pathname === '/reports' && projectId) && <section className="page-heading" aria-labelledby="page-title">
            <div className="eyebrow">{page.eyebrow}</div>
            <h1 id="page-title">{pageTitle}</h1>
            <p className="intro">{pageIntro}</p>
            {page.path === '/research' && !projectId && (
              <div className="home-actions">
                <a className="secondary-action" href="/explorer">App Store listings explorer</a>
              </div>
            )}
          </section>}

          {pathname.startsWith('/reports/') ? <ReportViewer reportId={pathname.slice('/reports/'.length)} /> : pathname === '/reports' ? <ReportHistory /> : pathname === '/tracking' ? <TrackingWorkspace projectId={projectId} /> : pathname === '/compare-periods' ? <QuantitativePeriodComparison /> : pathname === '/' ? projectId ? <ResearchIntake /> : <ResearchWorkspace mode="list" /> : page.path === '/research/runs' ? <ResearchRunsWorkspace runId={runId} projectId={projectId} /> : page.path.startsWith('/research') ? <ResearchWorkspace mode={page.path === '/research/new' ? 'new' : ['data', 'opportunities'].includes(params.get('view') ?? '') ? 'data' : 'list'} /> : pathname === '/sources' ? <SourcesWorkspace runId={runId} /> : pathname === '/explorer' ? <ExplorerWorkspace /> : <>
            <div className="section-divider"><span>WORKSPACE CONTENT</span><span className="divider-line" /></div>
            <EmptyState page={page} />
            <aside className="connection-note" aria-label="Data connection status">
              <span className="connection-icon" aria-hidden="true">i</span>
              <div><strong>No workspace data connected</strong><span>This screen does not contain sample or generated research data.</span></div>
              <span className="note-tag">LOCAL ONLY</span>
            </aside>
          </>}
        </div>

        <footer className="page-footer"><span>PO INTELLIGENCE HUB</span><span>VERSION 2.0 · LOCAL FIRST</span></footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
