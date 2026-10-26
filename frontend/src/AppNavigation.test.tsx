// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppNavigation, type NavigationPage } from './AppNavigation';

const pages: NavigationPage[] = [
  { path: '/research', label: 'Research', icon: 'home' },
  { path: '/reports', label: 'Reports', icon: 'reports' },
  { path: '/tracking', label: 'Tracking', icon: 'runs' },
];
function renderNavigation(currentPath = '/reports', currentLabel = 'Reports') {
  return render(<AppNavigation pages={pages} currentPath={currentPath} currentLabel={currentLabel} />);
}

afterEach(() => cleanup());

describe('AppNavigation', () => {
  it('keeps exactly Research, Reports, and Tracking as primary areas', () => {
    renderNavigation();
    expect(screen.getByRole('navigation', { name: 'Main navigation' }).querySelectorAll('a')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Research' }).getAttribute('href')).toBe('/research');
    expect(screen.getByRole('link', { name: 'Reports' }).getAttribute('href')).toBe('/reports');
    expect(screen.getByRole('link', { name: 'Tracking' }).getAttribute('href')).toBe('/tracking');
  });
  it('shows the current location and exposes every destination from the expandable menu', () => {
    renderNavigation();

    const toggle = screen.getByRole('button', { name: 'Open navigation menu. Current page: Reports' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('link', { name: 'Reports' }).getAttribute('aria-current')).toBe('page');

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
    const toggle = screen.getByRole('button', { name: 'Open navigation menu. Current page: Research runs' });

    fireEvent.click(toggle);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('closes after a primary destination is selected', () => {
    renderNavigation('/research', 'Research');
    const toggle = screen.getByRole('button', { name: 'Open navigation menu. Current page: Research' });
    fireEvent.click(toggle);

    const researchLink = screen.getByRole('link', { name: 'Tracking' });
    researchLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(researchLink);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('app-navigation')?.classList.contains('is-open')).toBe(false);
  });

  it('marks nested research routes as the current Research section', () => {
    renderNavigation('/research/runs', 'Research runs');
    expect(screen.getByRole('link', { name: 'Research' }).getAttribute('aria-current')).toBe('page');
  });
});
