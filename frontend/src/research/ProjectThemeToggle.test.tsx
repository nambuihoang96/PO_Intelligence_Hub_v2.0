// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectThemeToggle } from './ProjectThemeToggle';

describe('project theme prototype', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div class="app-shell"></div>';
  });
  afterEach(() => { cleanup(); localStorage.clear(); document.body.innerHTML = ''; });

  it('toggles the scoped app theme and remembers the preference for the next screen', () => {
    const shell = document.querySelector<HTMLElement>('.app-shell')!;
    const firstView = render(<ProjectThemeToggle />, { container: shell });
    const toggle = screen.getByRole('button', { name: 'Chuyển sang giao diện tối' });
    expect(shell.dataset.themePreview).toBe('light');
    fireEvent.click(toggle);
    expect(shell.dataset.themePreview).toBe('dark');
    expect(localStorage.getItem('po-hub-theme-preference-v1')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).getAttribute('aria-pressed')).toBe('true');

    firstView.unmount();
    document.body.innerHTML = '<div class="app-shell"></div>';
    const nextScreenShell = document.querySelector<HTMLElement>('.app-shell')!;
    render(<ProjectThemeToggle />, { container: nextScreenShell });
    expect(nextScreenShell.dataset.themePreview).toBe('dark');
    expect(screen.getByRole('button', { name: 'Chuyển sang giao diện sáng' })).toBeTruthy();
  });
});
