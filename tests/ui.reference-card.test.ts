import { describe, expect, it } from 'vitest';
import { PRICE_BRACKETS } from '../src/game/constants';
import { buildReferenceRows, rangeLabel } from '../src/ui/components/reference-card';

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
});
