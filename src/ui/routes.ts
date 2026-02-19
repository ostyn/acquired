/**
 * Responsibility: Centralizes base-path aware route construction/parsing for SPA navigation.
 * Ensures GitHub Pages project subpaths work consistently (e.g. /repo-name/room/ABC123).
 */

const BASE_URL = import.meta.env.BASE_URL || '/';

function normalizeBase(base: string): string {
  if (!base || base === '/') {
    return '/';
  }
  const withLeading = base.startsWith('/') ? base : `/${base}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

export function appBasePath(): string {
  return normalizeBase(BASE_URL);
}

export function appPath(path = ''): string {
  const base = appBasePath();
  const trimmed = trimSlashes(path);
  if (!trimmed) {
    return base;
  }
  return `${base}${trimmed}`;
}

export function roomPath(roomId: string): string {
  return appPath(`room/${encodeURIComponent(roomId)}`);
}

export function extractRoomIdFromPath(pathname: string): string {
  const base = appBasePath();
  const withLeading = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const withoutBase = withLeading.startsWith(base) ? withLeading.slice(base.length) : withLeading.slice(1);
  const segments = withoutBase.split('/').filter(Boolean);

  if (segments.length < 2 || segments[0].toLowerCase() !== 'room') {
    return '';
  }

  return decodeURIComponent(segments[1]).toUpperCase();
}

