// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppNavigation, type NavigationPage } from './AppNavigation';

const pages: NavigationPage[] = [
  { path: '/research', label: 'Nghiên cứu', icon: 'home' },
  { path: '/reports', label: 'Báo cáo', icon: 'reports' },
  { path: '/tracking', label: 'Theo dõi', icon: 'runs' },
];
function renderNavigation(currentPath = '/reports', currentLabel = 'Báo cáo') {
  return render(<AppNavigation pages={pages} currentPath={currentPath} currentLabel={currentLabel} />);
}

afterEach(() => cleanup());

describe('AppNavigation', () => {
  it('keeps exactly Research, Reports, and Tracking as primary areas', () => {
    renderNavigation();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' }).querySelectorAll('a')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Nghiên cứu' }).getAttribute('href')).toBe('/research');
    expect(screen.getByRole('link', { name: 'Báo cáo' }).getAttribute('href')).toBe('/reports');
    expect(screen.getByRole('link', { name: 'Theo dõi' }).getAttribute('href')).toBe('/tracking');
  });
  it('shows the current location and exposes every destination from the expandable menu', () => {
    renderNavigation();

    const toggle = screen.getByRole('button', { name: 'Mở menu điều hướng. Trang hiện tại: Báo cáo' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('link', { name: 'Báo cáo' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('app-navigation')?.classList.contains('is-open')).toBe(true);
    for (const item of pages) {
      expect(screen.getByRole('link', { name: item.label }).getAttribute('href')).toBe(item.path);
    }
    expect(screen.queryByRole('navigation', { name: 'Research navigation' })).toBeNull();
  });

  it('closes on Escape and returns keyboard focus to the menu button', () => {
    renderNavigation('/research/runs', 'Research runs');
    const toggle = screen.getByRole('button', { name: 'Mở menu điều hướng. Trang hiện tại: Research runs' });

    fireEvent.click(toggle);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('closes after a primary destination is selected', () => {
    renderNavigation('/research', 'Nghiên cứu');
    const toggle = screen.getByRole('button', { name: 'Mở menu điều hướng. Trang hiện tại: Nghiên cứu' });
    fireEvent.click(toggle);

    const researchLink = screen.getByRole('link', { name: 'Theo dõi' });
    researchLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(researchLink);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('app-navigation')?.classList.contains('is-open')).toBe(false);
  });

  it('marks nested research routes as the current Research section', () => {
    renderNavigation('/research/runs', 'Research runs');
    expect(screen.getByRole('link', { name: 'Nghiên cứu' }).getAttribute('aria-current')).toBe('page');
  });
});
