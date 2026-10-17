import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const sections = ['Overview', 'Research', 'Explorer', 'Sources', 'Reports'];

function App() {
  const [active, setActive] = React.useState('Overview');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">PO</div>
        <div className="brand-copy">
          <strong>PO Intelligence</strong>
          <span>HUB · V2</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {sections.map((section, index) => (
            <button
              className={`nav-item ${active === section ? 'active' : ''}`}
              key={section}
              onClick={() => setActive(section)}
              type="button"
            >
              <span className="nav-icon">{['⌂', '⌕', '▦', '↗', '▤'][index]}</span>
              <span>{section}</span>
              {section !== 'Overview' && <small>Coming later</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">LOCAL WORKSPACE</div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> {active}</div>
          <div className="local-badge"><i /> Local mode</div>
        </header>
        <section className="content">
          <div className="eyebrow">PRODUCT RESEARCH WORKSPACE</div>
          <h1>{active === 'Overview' ? 'Good research starts with a clear question.' : active}</h1>
          <p className="intro">
            A focused workspace for product research, evidence, and decisions.
          </p>

          {active === 'Overview' ? (
            <div className="welcome-card">
              <div className="card-symbol">✳</div>
              <div>
                <h2>Your workspace is ready</h2>
                <p>The application shell is in place. Research tools will appear here as they are built.</p>
              </div>
              <span className="status-pill">Coming later</span>
            </div>
          ) : (
            <div className="welcome-card placeholder-card">
              <div className="card-symbol">◷</div>
              <div>
                <h2>{active} is coming later</h2>
                <p>This section is a navigation placeholder for a future task.</p>
              </div>
              <span className="status-pill">Coming later</span>
            </div>
          )}

          <div className="connection-note">
            <span className="connection-dot" />
            <div><strong>Data chưa kết nối</strong><span>Chưa có dữ liệu nào được thêm vào workspace.</span></div>
            <span className="note-tag">LOCAL ONLY</span>
          </div>
        </section>
        <footer className="page-footer"><span>PO INTELLIGENCE HUB</span><span>VERSION 2.0 · LOCAL FIRST</span></footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
