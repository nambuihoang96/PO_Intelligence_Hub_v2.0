import { useEffect, useRef, useState } from 'react';
import { ResultsIcon, type ResultsIconName } from './ui/ResultsIcon';

export type NavigationPage = { path: string; label: string; icon: ResultsIconName };

type AppNavigationProps = {
  pages: NavigationPage[];
  currentPath: string;
  currentLabel: string;
};

export function AppNavigation({ pages, currentPath, currentLabel }: AppNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobileOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  const active = (path: string) => path === '/'
    ? currentPath === '/'
    : currentPath === path || (path === '/research' && currentPath.startsWith('/research/'));

  const closeAfterNavigation = () => setMobileOpen(false);

  return <aside className="sidebar">
    <a className="brand" href="/" aria-label="PO Intelligence Hub home">
      <span className="brand-mark">PO</span>
      <span className="brand-copy"><strong>PO Intelligence</strong><small>HUB · V2</small></span>
    </a>

    <button
      ref={toggleRef}
      className="mobile-nav-toggle"
      type="button"
      aria-expanded={mobileOpen}
      aria-controls="app-navigation"
      aria-label={`${mobileOpen ? 'Đóng' : 'Mở'} menu điều hướng. Trang hiện tại: ${currentLabel}`}
      onClick={() => setMobileOpen((open) => !open)}
    >
      <span className="mobile-nav-current"><span className="mobile-nav-caption">Trang hiện tại</span><strong>{currentLabel}</strong></span>
      <span className="mobile-nav-action">{mobileOpen ? 'Đóng menu' : 'Xem các trang'}<span className="mobile-nav-chevron" aria-hidden="true">{mobileOpen ? '−' : '+'}</span></span>
    </button>

    <div id="app-navigation" className={`sidebar-menu${mobileOpen ? ' is-open' : ''}`}>
      <div className="nav-label">KHU VỰC LÀM VIỆC</div>
      <nav aria-label="Điều hướng chính" className="primary-nav">
        {pages.map((item) => {
          const isActive = active(item.path);
          return <a className={`nav-item${isActive ? ' active' : ''}`} href={item.path} key={item.path}
            aria-current={isActive ? 'page' : undefined} onClick={closeAfterNavigation}>
            <span className="nav-icon"><ResultsIcon name={item.icon} /></span>
            <span>{item.label}</span>
          </a>;
        })}
      </nav>

      <div className="sidebar-footer"><span className="footer-dot" />LƯU TRÊN MÁY</div>
    </div>
  </aside>;
}
