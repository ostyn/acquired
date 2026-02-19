/**
 * Responsibility: Handles persisted light/dark theme selection.
 * Applies the active theme to the document root and stores preference in localStorage.
 */

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'acquire-theme-mode';
const DEFAULT_THEME_MODE: ThemeMode = 'dark';

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function getStoredThemeMode(): ThemeMode | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(raw) ? raw : null;
}

export function getDocumentThemeMode(): ThemeMode | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const current = document.documentElement.getAttribute('data-theme');
  return isThemeMode(current) ? current : null;
}

export function getActiveThemeMode(): ThemeMode {
  return getStoredThemeMode() || getDocumentThemeMode() || DEFAULT_THEME_MODE;
}

export function applyThemeMode(mode: ThemeMode): ThemeMode {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', mode);
    if (document.body) {
      document.body.setAttribute('data-theme', mode);
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  }

  return mode;
}

export function initializeThemeMode(): ThemeMode {
  return applyThemeMode(getActiveThemeMode());
}

export function toggleThemeMode(current?: ThemeMode): ThemeMode {
  const source = current || getActiveThemeMode();
  return applyThemeMode(source === 'dark' ? 'light' : 'dark');
}
