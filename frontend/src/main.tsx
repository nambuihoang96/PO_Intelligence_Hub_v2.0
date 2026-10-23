import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExplorerWorkspace } from './explorer/ExplorerWorkspace';
import { ResearchWorkspace } from './research/ResearchWorkspace';
import { ResearchRunsWorkspace } from './research/ResearchRunsWorkspace';
import { SourcesWorkspace } from './sources/SourcesWorkspace';
import { ReportHistory, ReportViewer, ResearchIntake } from './reports/ResearchIntake';
import { QuantitativePeriodComparison } from './reports/QuantitativePeriodComparison';
import { ResultsIcon, type ResultsIconName } from './ui/ResultsIcon';
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
    path: '/',
    label: 'Home',
    icon: 'home',
    eyebrow: 'CHATGPT RESEARCH + LOCAL WORKSPACE',
    title: 'Turn research questions into reusable reports.',
    intro: 'Build a research prompt, use ChatGPT Plus, then bring the report back here.',
    emptyTitle: 'Your workspace is ready',
    emptyCopy: 'Start with a research question.',
  },
  {
    path: '/research',
    label: 'Research',
    icon: 'search',
    eyebrow: 'RESEARCH WORKSPACE',
    title: 'Research projects',
    intro: 'Plan and follow research work from a focused workspace.',
    emptyTitle: 'No research projects yet',
    emptyCopy: 'Projects and their research runs will appear here when project creation is available.',
  },
  {
    path: '/explorer',
    label: 'Explorer',
    icon: 'compass',
    eyebrow: 'APP EXPLORER',
    title: 'Explore app store listings',
    intro: 'Search store-specific listings by app name, platform, and country.',
    emptyTitle: 'Nothing to explore yet',
    emptyCopy: 'Evidence will appear here after it has been collected by a research run.',
  },
  {
    path: '/sources',
    label: 'Sources',
    icon: 'sources',
    eyebrow: 'DATA SOURCES',
    title: 'Research sources',
    intro: 'Keep track of the sources that support research findings.',
    emptyTitle: 'No sources have been added',
    emptyCopy: 'Sources will be listed here when they are connected to a research project.',
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
    path: '/compare-periods',
    label: 'Period comparison',
    icon: 'comparison',
    eyebrow: 'QUANTITATIVE WORKSPACE',
    title: 'Compare CSV periods',
    intro: 'Compare compatible source exports while preserving the complete app universe and evidence trail.',
    emptyTitle: 'No comparison data is available',
    emptyCopy: 'Create a research workspace, import CSV exports there, then compare compatible periods.',
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
  if (path.startsWith('/reports/')) return pages.find((page) => page.path === '/reports')!;
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
  const page = currentPage(pathname);
  const researchPage = page.path.startsWith('/research');
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('projectId');
  const runId = params.get('runId');
  const projectSelected = Boolean(projectId);
  const dataWorkspace = projectSelected && params.get('view') === 'data';
  const pageTitle = pathname.startsWith('/reports/') ? 'Research report' : page.path === '/research/new' ? 'Create a research project'
    : page.path === '/research/runs' ? runId ? 'Research run' : 'Research runs'
      : page.path === '/sources' && runId ? 'Run evidence' : dataWorkspace ? 'Research workspace' : projectSelected ? 'Research plan' : page.title;
  const pageIntro = page.path === '/research/new'
    ? 'Set up a project, then draft its first research plan.'
    : page.path === '/research/runs' ? runId ? 'Review the selected session and open its evidence.' : 'Browse saved research sessions and their selected plan versions.'
      : page.path === '/sources' && runId ? 'Add and review manual evidence linked to this research run.'
        : dataWorkspace ? 'Explore saved CSV data, compare periods, and bring ChatGPT findings into this same workspace.' : projectSelected ? 'Review the current plan or save an edit as a new version.' : page.intro;

  return (
    <div className={`app-shell${researchPage ? ' research-page' : ''}`}>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="PO Intelligence Hub home">
          <span className="brand-mark">PO</span>
          <span className="brand-copy"><strong>PO Intelligence</strong><small>HUB · V2</small></span>
        </a>

        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="primary-nav">
          {pages.map((item) => {
            const active = item.path === '/' ? page.path === '/' : page.path === item.path || (item.path === '/research' && researchPage);
            return (
              <a className={`nav-item${active ? ' active' : ''}`} href={item.path} key={item.path} aria-current={page.path === item.path ? 'page' : undefined}>
                <span className="nav-icon"><ResultsIcon name={item.icon} /></span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        {researchPage && (
          <div className="subnav-wrap">
            <div className="nav-label">RESEARCH</div>
            <nav aria-label="Research navigation" className="secondary-nav">
              {secondaryPages.map((item) => (
                <a className={`nav-item subnav-item${page.path === item.path ? ' active' : ''}`} href={item.path} key={item.path} aria-current={page.path === item.path ? 'page' : undefined}>
                  <span className="nav-icon"><ResultsIcon name={item.icon} /></span>
                  <span>{item.label}</span>
                </a>
              ))}
            </nav>
          </div>
        )}

        <div className="sidebar-footer"><span className="footer-dot" />LOCAL WORKSPACE</div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><a href="/">Workspace</a><span aria-hidden="true">/</span>{page.label}</div>
          <div className="local-badge"><span className="badge-dot" />Local mode</div>
        </header>

        <div className="content-wrap">
          <section className="page-heading" aria-labelledby="page-title">
            <div className="eyebrow">{page.eyebrow}</div>
            <h1 id="page-title">{pageTitle}</h1>
            <p className="intro">{pageIntro}</p>
            {page.path === '/research' && (
              <div className="home-actions">
                <a className="primary-action" href="/research/new">View project setup <span aria-hidden="true">→</span></a>
                <a className="secondary-action" href="/research/runs">View research runs</a>
              </div>
            )}
          </section>

          {pathname.startsWith('/reports/') ? <ReportViewer reportId={pathname.slice('/reports/'.length)} /> : pathname === '/reports' ? <ReportHistory /> : page.path === '/compare-periods' ? <QuantitativePeriodComparison /> : page.path === '/' ? <ResearchIntake /> : page.path === '/research/runs' ? <ResearchRunsWorkspace runId={runId} projectId={projectId} /> : researchPage ? <ResearchWorkspace mode={page.path === '/research/new' ? 'new' : params.get('view') === 'data' ? 'data' : 'list'} /> : page.path === '/sources' ? <SourcesWorkspace runId={runId} /> : page.path === '/explorer' ? <ExplorerWorkspace /> : <>
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
