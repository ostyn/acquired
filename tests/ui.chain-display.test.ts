import { describe, expect, it } from 'vitest';
import { HOTELS } from '../src/game/constants';
import {
  chainBadgeColor,
  chainBadgeInkColor,
  chainInkColor,
  splitTextByChainMentions,
} from '../src/ui/components/chain-display';

describe('chain display helpers', () => {
  it('returns high-contrast ink colors for chain badges', () => {
    expect(chainInkColor('tower')).toBe('#000000');
    expect(chainInkColor('continental')).toBe('#000000');
    expect(chainInkColor('luxor')).toBe('#000000');
    expect(chainInkColor('american')).toBe('#ffffff');
  });

  it('uses a badge palette with high-contrast label ink', () => {
    expect(chainBadgeColor('luxor')).toBe('#c3273e');
    expect(chainBadgeInkColor('luxor')).toBe('#ffffff');
    expect(chainBadgeColor('tower')).toBe('#d39d16');
    expect(chainBadgeInkColor('tower')).toBe('#000000');
  });

  it('splits log text into text and chain tokens', () => {
    const parts = splitTextByChainMentions('Tower merged into Luxor.', HOTELS);

    expect(parts).toEqual([
      { type: 'chain', chainId: 'tower' },
      { type: 'text', value: ' merged into ' },
      { type: 'chain', chainId: 'luxor' },
      { type: 'text', value: '.' },
    ]);
  });

  it('does not match chain names inside larger words', () => {
    const parts = splitTextByChainMentions('Towership arrived before Worldwide.', HOTELS);

    expect(parts).toEqual([
      { type: 'text', value: 'Towership arrived before ' },
      { type: 'chain', chainId: 'worldwide' },
      { type: 'text', value: '.' },
    ]);
  });
});
