import { useLayoutEffect, useState } from 'react';

const THEME_STORAGE_KEY = 'po-hub-theme-preference-v1';
type ThemePreference = 'light' | 'dark';

function readSavedTheme(): ThemePreference {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ProjectThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>(readSavedTheme);

  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell');
    if (!shell) return;
    shell.dataset.themePreview = theme;
    return () => { delete shell.dataset.themePreview; };
  }, [theme]);

  function toggleTheme() {
    const nextTheme: ThemePreference = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch { /* Keep this toggle usable when storage is unavailable. */ }
  }

  return <button
    className="project-theme-toggle"
    type="button"
    aria-label={`Chuyển sang giao diện ${theme === 'dark' ? 'sáng' : 'tối'}`}
    aria-pressed={theme === 'dark'}
    onClick={toggleTheme}
  >
    <span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span>
    {theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
  </button>;
}
