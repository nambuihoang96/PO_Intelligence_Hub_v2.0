// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppNavigation, type NavigationPage } from './AppNavigation';

const pages: NavigationPage[] = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/research', label: 'Research', icon: 'search' },
  { path: '/explorer', label: 'Explorer', icon: 'compass' },
  { path: '/sources', label: 'Sources', icon: 'sources' },
  { path: '/reports', label: 'Reports', icon: 'reports' },
  { path: '/compare-periods', label: 'Compare periods', icon: 'comparison' },
];
const secondaryPages: NavigationPage[] = [
  { path: '/research/new', label: 'New research', icon: 'findings' },
  { path: '/research/runs', label: 'Research runs', icon: 'runs' },
];

function renderNavigation(currentPath = '/reports', currentLabel = 'Reports', researchPage = false) {
  return render(<AppNavigation pages={pages} secondaryPages={secondaryPages} currentPath={currentPath} currentLabel={currentLabel} researchPage={researchPage} />);
}

afterEach(() => cleanup());

describe('AppNavigation', () => {
  it('shows the current location and exposes every destination from the expandable menu', () => {
    renderNavigation();

    const toggle = screen.getByRole('button', { name: 'Open navigation menu. Current page: Reports' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('link', { name: 'Reports' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('app-navigation')?.classList.contains('is-open')).toBe(true);
    for (const item of [...pages, ...secondaryPages]) {
      expect(screen.getByRole('link', { name: item.label }).getAttribute('href')).toBe(item.path);
    }
  });

  it('closes on Escape and returns keyboard focus to the menu button', () => {
    renderNavigation('/research/runs', 'Research runs', true);
    const toggle = screen.getByRole('button', { name: 'Open navigation menu. Current page: Research runs' });

    fireEvent.click(toggle);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('closes after a destination is selected and keeps research links available on other sections', () => {
    renderNavigation('/explorer', 'Explorer');
    const toggle = screen.getByRole('button', { name: 'Open navigation menu. Current page: Explorer' });
    fireEvent.click(toggle);

    const researchLink = screen.getByRole('link', { name: 'Research runs' });
    expect(researchLink.getAttribute('href')).toBe('/research/runs');
    researchLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(researchLink);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('app-navigation')?.classList.contains('is-open')).toBe(false);
  });

  it('marks nested research destinations as the current Research section', () => {
    renderNavigation('/research/new', 'New research', true);
    expect(screen.getByRole('link', { name: 'Research' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'New research' }).getAttribute('aria-current')).toBe('page');
  });
});
