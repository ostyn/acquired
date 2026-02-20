import { describe, expect, it } from 'vitest';
import { PRICE_BRACKETS } from '../src/game/constants';
import { getSupportedLocales } from '../src/ui/i18n';
import { getManualTranscript } from '../src/ui/components/manual-transcripts';
import {
  buildManualGlossaryEntries,
  buildManualTurnSteps,
  buildReferenceRows,
  rangeLabel,
} from '../src/ui/components/reference-card';

describe('reference card helpers', () => {
  it('formats chain-size ranges', () => {
    expect(rangeLabel(2, 2)).toBe('2');
    expect(rangeLabel(6, 10)).toBe('6-10');
    expect(rangeLabel(41, Number.POSITIVE_INFINITY)).toBe('41+');
  });

  it('maps price brackets to table rows', () => {
    const rows = buildReferenceRows();
    expect(rows).toHaveLength(PRICE_BRACKETS.length);

    expect(rows[0]).toEqual({
      sizeRange: '2',
      cheapPrice: 200,
      mediumPrice: 300,
      expensivePrice: 400,
    });

    expect(rows[rows.length - 1]).toEqual({
      sizeRange: '41+',
      cheapPrice: 1000,
      mediumPrice: 1100,
      expensivePrice: 1200,
    });
  });

  it('defines a consistent chain/share glossary for the manual', () => {
    const entries = buildManualGlossaryEntries();
    expect(entries[0]).toEqual({
      term: 'Chain (Hotel Chain)',
      definition: 'A branded group of connected tiles on the board.',
    });
    expect(entries.find((entry) => entry.term === 'Share')).toEqual({
      term: 'Share',
      definition: 'One stock certificate in a chain. Players buy and hold shares.',
    });
  });

  it('defines the canonical four-step turn flow for the manual', () => {
    expect(buildManualTurnSteps()).toEqual([
      'Place one tile from your hand.',
      'If needed, found a chain or resolve a merger.',
      'Buy up to 3 shares (or pass).',
      'Draw back up to your normal hand size.',
    ]);
  });

  it('provides a full manual transcript for every supported locale', () => {
    for (const locale of getSupportedLocales()) {
      const transcript = getManualTranscript(locale);
      expect(transcript.length).toBeGreaterThan(2000);
      expect(transcript).toContain('CBAQR-72');
    }
  });

  it('uses localized headings for translated manuals', () => {
    expect(getManualTranscript('en').startsWith('HOW TO PLAY ACQUIRE')).toBe(true);
    expect(getManualTranscript('es').startsWith('COMO JUGAR ACQUIRE')).toBe(true);
    expect(getManualTranscript('fr').startsWith('COMMENT JOUER A ACQUIRE')).toBe(true);
    expect(getManualTranscript('bg').startsWith('КАК СЕ ИГРАЕ ACQUIRE')).toBe(true);
  });
});
