import { describe, expect, it } from 'vitest';
import { formatTileLabel } from '../src/ui/tile-label';

describe('tile label formatting', () => {
  it('keeps classic labels unchanged by default', () => {
    expect(formatTileLabel('A1')).toBe('A1');
    expect(formatTileLabel('C12', false)).toBe('C12');
  });

  it('maps internal row/column IDs to excel-style display labels', () => {
    expect(formatTileLabel('A1', true)).toBe('A1');
    expect(formatTileLabel('A2', true)).toBe('B1');
    expect(formatTileLabel('B1', true)).toBe('A2');
    expect(formatTileLabel('I12', true)).toBe('L9');
  });
});

