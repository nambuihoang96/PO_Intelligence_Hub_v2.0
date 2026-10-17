import { createRoot } from 'react-dom/client';
import { ResearchWorkspace } from './research/ResearchWorkspace';
import './style.css';

type Page = {
  path: string;
  label: string;
  icon: string;
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
    icon: '⌂',
    eyebrow: 'PRODUCT RESEARCH WORKSPACE',
    title: 'A clear place to start product research.',
    intro: 'Organize research work, evidence, and decisions in one workspace.',
    emptyTitle: 'Your workspace is ready',
    emptyCopy: 'There are no research projects here yet. Start by exploring the research workspace.',
  },
  {
    path: '/research',
    label: 'Research',
    icon: '⌕',
    eyebrow: 'RESEARCH WORKSPACE',
    title: 'Research projects',
    intro: 'Plan and follow research work from a focused workspace.',
    emptyTitle: 'No research projects yet',
    emptyCopy: 'Projects and their research runs will appear here when project creation is available.',
  },
  {
    path: '/explorer',
    label: 'Explorer',
    icon: '▦',
    eyebrow: 'APP EXPLORER',
    title: 'Explore product evidence',
    intro: 'Review collected product and market evidence in one place.',
    emptyTitle: 'Nothing to explore yet',
    emptyCopy: 'Evidence will appear here after it has been collected by a research run.',
  },
  {
    path: '/sources',
    label: 'Sources',
    icon: '↗',
    eyebrow: 'DATA SOURCES',
    title: 'Research sources',
    intro: 'Keep track of the sources that support research findings.',
    emptyTitle: 'No sources have been added',
    emptyCopy: 'Sources will be listed here when they are connected to a research project.',
  },
  {
    path: '/reports',
    label: 'Reports',
    icon: '▤',
    eyebrow: 'REPORTS & DECISIONS',
    title: 'Reports and decisions',
    intro: 'Find completed research outputs and the decisions they inform.',
    emptyTitle: 'No reports are available',
    emptyCopy: 'Completed research reports will appear here. No example or placeholder findings are shown.',
  },
];

const secondaryPages: Page[] = [
  {
    path: '/research/new',
    label: 'New research',
    icon: '＋',
    eyebrow: 'RESEARCH WORKSPACE',
    title: 'Start a research project',
    intro: 'A research project will keep its plan, runs, sources, and outputs together.',
    emptyTitle: 'Project setup is not available yet',
    emptyCopy: 'This workspace shell is ready. Project creation and plan editing are scheduled for a later task.',
  },
  {
    path: '/research/runs',
    label: 'Research runs',
    icon: '◷',
    eyebrow: 'RESEARCH WORKSPACE',
    title: 'Research runs',
    intro: 'Track each research session and return to its results when available.',
    emptyTitle: 'No research runs yet',
    emptyCopy: 'Research sessions will appear here after a project has been set up.',
  },
];

const allPages = [...pages, ...secondaryPages];

function currentPage(): Page {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return allPages.find((page) => page.path === path) ?? pages[0];
}

function EmptyState({ page }: { page: Page }) {
  return (
    <section className="empty-card" aria-labelledby="empty-title">
      <div className="empty-icon" aria-hidden="true">{page.icon}</div>
      <div className="empty-copy">
        <span className="state-label">EMPTY WORKSPACE</span>
        <h2 id="empty-title">{page.emptyTitle}</h2>
        <p>{page.emptyCopy}</p>
      </div>
    </section>
  );
}

function App() {
  const page = currentPage();
  const researchPage = page.path.startsWith('/research');
  const projectSelected = Boolean(new URLSearchParams(window.location.search).get('projectId'));
  const pageTitle = page.path === '/research/new' ? 'Create a research project' : projectSelected ? 'Research plan' : page.title;
  const pageIntro = page.path === '/research/new'
    ? 'Set up a project, then draft its first research plan.'
    : projectSelected ? 'Review the current plan or save an edit as a new version.' : page.intro;

  return (
    <div className="app-shell">
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
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
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
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
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
            {page.path === '/' && (
              <div className="home-actions">
                <a className="primary-action" href="/research">Open research workspace <span aria-hidden="true">→</span></a>
                <a className="secondary-action" href="/explorer">Explore evidence</a>
              </div>
            )}
            {page.path === '/research' && (
              <div className="home-actions">
                <a className="primary-action" href="/research/new">View project setup <span aria-hidden="true">→</span></a>
                <a className="secondary-action" href="/research/runs">View research runs</a>
              </div>
            )}
          </section>

          {researchPage ? <ResearchWorkspace mode={page.path === '/research/new' ? 'new' : 'list'} /> : <>
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
