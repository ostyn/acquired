import { describe, expect, it } from 'vitest';
import {
  getTurnRailChains,
  getTurnRailPlayers,
} from '../src/ui/components/game-hud';

const SAMPLE_STATE = {
  players: [
    { id: 'p1', name: 'Alex' },
    { id: 'p2', name: 'Blake' },
    { id: 'p3', name: 'Casey' },
  ],
  playerOrder: ['p2', 'p3', 'p1'],
  currentPlayerId: 'p3',
};

describe('game hud helpers', () => {
  it('orders turn-rail players by playerOrder when available', () => {
    expect(getTurnRailPlayers(SAMPLE_STATE).map((player) => player.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('falls back to players array when no explicit order is available', () => {
    expect(
      getTurnRailPlayers({
        players: SAMPLE_STATE.players,
        playerOrder: [],
      }).map((player) => player.id),
    ).toEqual(['p1', 'p2', 'p3']);
  });

  it('orders chains with active first (size desc), then inactive', () => {
    expect(
      getTurnRailChains({
        chains: [
          { id: 'tower', name: 'Tower', active: false, size: 0 },
          { id: 'luxor', name: 'Luxor', active: true, size: 3 },
          { id: 'american', name: 'American', active: true, size: 8 },
          { id: 'festival', name: 'Festival', active: false, size: 0 },
        ],
      }).map((chain) => chain.id),
    ).toEqual(['american', 'luxor', 'festival', 'tower']);
  });
});
