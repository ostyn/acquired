import { describe, expect, it } from 'vitest';
import {
  connectionStatusLabel,
  getChainDisplayName,
  getSupportedLocales,
  getStoredLocale,
  initializeLocale,
  localizeKnownError,
  resolveToken,
  t,
} from '../src/ui/i18n';

describe('i18n helpers', () => {
  it('returns localized chain display names by locale', () => {
    expect(getChainDisplayName('tower', 'en')).toBe('Tower');
    expect(getChainDisplayName('tower', 'es')).toBe('Torre');
  });

  it('returns localized connection status labels', () => {
    expect(connectionStatusLabel('connected', 'en')).toBe('Connected');
    expect(connectionStatusLabel('connected', 'es')).toBe('Conectado');
    expect(connectionStatusLabel('connected', 'fr')).toBe('Connecté');
    expect(connectionStatusLabel('connected', 'bg')).toBe('Свързан');
  });

  it('exposes supported locales including french and bulgarian', () => {
    expect(getSupportedLocales()).toEqual(['en', 'es', 'fr', 'bg']);
  });

  it('maps known raw errors to tokens for runtime localization', () => {
    const token = localizeKnownError('Room code is required.');
    expect(token).toEqual({ key: 'error.room_code_required', params: {} });
    expect(resolveToken(token, '', 'es')).toBe('El código de sala es obligatorio.');
  });

  it('falls back to English keys when locale entry is missing', () => {
    expect(t('not.a.real.key', {}, 'es')).toBe('not.a.real.key');
  });

  it('normalizes stored locale variants from localStorage', () => {
    const originalWindow = globalThis.window;
    const storage = new Map<string, string>();

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    storage.set('acquire-locale', 'es-MX');
    expect(getStoredLocale()).toBe('es');
    storage.set('acquire-locale', 'fr-CA');
    expect(getStoredLocale()).toBe('fr');
    storage.set('acquire-locale', 'bg-BG');
    expect(getStoredLocale()).toBe('bg');

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });

  it('initializes locale from browser languages when no stored preference exists', async () => {
    const originalWindow = globalThis.window;
    const originalNavigator = globalThis.navigator;
    const originalDocument = globalThis.document;
    const storage = new Map<string, string>();

    const listeners = new Map<string, Set<(event: Event) => void>>();
    const fakeWindow = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
      addEventListener: (name: string, handler: (event: Event) => void) => {
        const set = listeners.get(name) ?? new Set();
        set.add(handler);
        listeners.set(name, set);
      },
      removeEventListener: (name: string, handler: (event: Event) => void) => {
        listeners.get(name)?.delete(handler);
      },
      dispatchEvent: (event: Event) => {
        listeners.get(event.type)?.forEach((handler) => handler(event));
        return true;
      },
    };

    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { languages: ['es-MX'], language: 'en-US' },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement: { lang: '' } },
    });

    const resolved = await initializeLocale();
    expect(resolved).toBe('es');
    expect(storage.get('acquire-locale')).toBe('es');
    expect((globalThis.document as { documentElement: { lang: string } }).documentElement.lang).toBe('es');
    expect(t('common.connected')).toBe('Conectado');

    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  });
});
