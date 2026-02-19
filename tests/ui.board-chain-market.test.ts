import { describe, expect, it } from 'vitest';
import { getBoardTileView } from '../src/ui/components/board';
import { splitChainsByActivity } from '../src/ui/components/chain-market';

describe('board and chain-market helpers', () => {
  it('builds tile view state for playable empty, unincorporated, and chain tiles', () => {
    const state = {
      board: {
        A2: null,
        A3: 'tower',
      },
    };

    const chainById = {
      tower: { id: 'tower', name: 'Tower', color: '#f2c43b' },
    };

    const playableTiles = new Set(['A1']);

    const empty = getBoardTileView({
      state,
      tileId: 'A1',
      chainById,
      playableTiles,
      canPlace: true,
      highlightedTileId: 'A1',
      pendingPlaceTileId: 'A1',
    });
    expect(empty.classes).toEqual(
      expect.arrayContaining([
        'board-tile',
        'empty',
        'playable-target',
        'hand-highlighted',
        'play-target-confirm',
      ]),
    );
    expect(empty.marker).toBe('');
    expect(empty.playableTarget).toBe(true);
    expect(empty.playConfirmTarget).toBe(true);

    const uninc = getBoardTileView({
      state,
      tileId: 'A2',
      chainById,
      playableTiles,
      canPlace: true,
    });
    expect(uninc.classes).toEqual(expect.arrayContaining(['board-tile', 'unincorporated']));
    expect(uninc.marker).toBe('');
    expect(uninc.playableTarget).toBe(false);
    expect(uninc.playConfirmTarget).toBe(false);

    const chain = getBoardTileView({
      state,
      tileId: 'A3',
      chainById,
      playableTiles,
      canPlace: true,
    });
    expect(chain.classes).toEqual(expect.arrayContaining(['board-tile', 'chain']));
    expect(chain.marker).toBe('TO');
    expect(chain.style).toContain('--tile-chain-color:#f2c43b');
  });

  it('splits and sorts chain lists by activity', () => {
    const { activeChains, inactiveChains } = splitChainsByActivity([
      { id: 'tower', active: true, size: 4 },
      { id: 'luxor', active: false, size: 0 },
      { id: 'american', active: true, size: 8 },
    ]);

    expect(activeChains.map((chain) => chain.id)).toEqual(['american', 'tower']);
    expect(inactiveChains.map((chain) => chain.id)).toEqual(['luxor']);
  });
});
