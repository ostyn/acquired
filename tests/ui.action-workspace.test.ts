import { describe, expect, it } from 'vitest';
import {
  normalizeMergerSell,
  normalizeMergerTradeFrom,
  summarizeBuyQueue,
} from '../src/ui/components/action-workspace';

describe('action workspace helpers', () => {
  it('normalizes merger trade to legal step and bounds', () => {
    expect(normalizeMergerTradeFrom(3, 8, 2)).toBe(2);
    expect(normalizeMergerTradeFrom(9, 8, 2)).toBe(8);
    expect(normalizeMergerTradeFrom(-1, 8, 2)).toBe(0);
  });

  it('normalizes merger sell to legal integer bounds', () => {
    expect(normalizeMergerSell(2.9, 5)).toBe(2);
    expect(normalizeMergerSell(7, 5)).toBe(5);
    expect(normalizeMergerSell(-2, 5)).toBe(0);
  });

  it('summarizes buy queue cost and remaining cash', () => {
    const chainsById = {
      tower: { price: 200 },
      american: { price: 300 },
    };

    expect(summarizeBuyQueue(['tower', 'american', 'tower'], chainsById, 1200)).toEqual({
      selectedCost: 700,
      remainingCash: 500,
    });
  });
});
