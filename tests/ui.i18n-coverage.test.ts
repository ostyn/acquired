import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { localizeKnownError } from '../src/ui/i18n';
import { EN_MESSAGES } from '../src/locales/en';
import { ES_MESSAGES } from '../src/locales/es';

const ROOT_DIR = process.cwd();

const ENGINE_ERROR_FILES = [
  'src/game/engine/actions.ts',
  'src/game/engine/lobby.ts',
];

const LOG_EVENT_FILES = [
  'src/game/engine/actions.ts',
  'src/game/engine/lobby.ts',
  'src/game/engine/mergers.ts',
  'src/game/engine/turns.ts',
  'src/state/app-store.ts',
];

const DYNAMIC_ENGINE_ERROR_EXAMPLES = [
  'Lobby is full (max 6 players).',
  'Lobby allows at most 6 players.',
  'Acquire requires 2 to 6 players.',
  'Max players must be an integer from 2 to 6.',
  'Cannot set max players below current player count (4).',
  'Imperial has no shares remaining.',
  'Insufficient cash to buy Imperial.',
];

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function extractMatches(text: string, regex: RegExp, groupIndex = 1): string[] {
  const results: string[] = [];
  for (const match of text.matchAll(regex)) {
    results.push(String(match[groupIndex]));
  }
  return results;
}

const STATIC_ENGINE_ERRORS = unique(
  ENGINE_ERROR_FILES.flatMap((file) => extractMatches(readFile(file), /error:\s*'([^']+)'/g)),
);

const ALL_ENGINE_ERROR_EXAMPLES = unique([
  ...STATIC_ENGINE_ERRORS,
  ...DYNAMIC_ENGINE_ERROR_EXAMPLES,
]);

const LOG_EVENT_KEYS = unique(
  LOG_EVENT_FILES.flatMap((file) => extractMatches(readFile(file), /pushLogEvent\(\s*[A-Za-z0-9_.]+\s*,\s*'([^']+)'/g)),
).filter((key) => key !== 'legacy');

describe('i18n coverage', () => {
  it('maps all engine error surfaces to localization tokens', () => {
    expect(ALL_ENGINE_ERROR_EXAMPLES.length).toBeGreaterThan(0);

    for (const message of ALL_ENGINE_ERROR_EXAMPLES) {
      const token = localizeKnownError(message);
      expect(token, `Missing localization token for: ${message}`).not.toBeNull();
    }
  });

  it('ensures mapped engine errors have en/es catalog keys', () => {
    for (const message of ALL_ENGINE_ERROR_EXAMPLES) {
      const token = localizeKnownError(message);
      expect(token, `Missing localization token for: ${message}`).not.toBeNull();
      if (!token) {
        continue;
      }

      expect(EN_MESSAGES[token.key], `Missing en key ${token.key} for: ${message}`).toBeTruthy();
      expect(ES_MESSAGES[token.key], `Missing es key ${token.key} for: ${message}`).toBeTruthy();
    }
  });

  it('ensures all structured log event keys have en/es translations', () => {
    expect(LOG_EVENT_KEYS.length).toBeGreaterThan(0);

    for (const logKey of LOG_EVENT_KEYS) {
      const messageKey = `log.${logKey}`;
      expect(EN_MESSAGES[messageKey], `Missing en key ${messageKey}`).toBeTruthy();
      expect(ES_MESSAGES[messageKey], `Missing es key ${messageKey}`).toBeTruthy();
    }
  });
});
