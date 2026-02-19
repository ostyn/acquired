import { describe, expect, it } from 'vitest';
import { PHASES } from '../src/game/constants';
import {
  addPlayerToLobby,
  applyAction,
  createLobbyState,
  isTilePlayable,
  startGame,
  toPublicState,
} from '../src/game/engine';

function createTwoPlayerLobby() {
  const state = createLobbyState({
    roomId: 'TEST01',
    hostPlayer: { id: 'p1', name: 'Host' },
  });
  addPlayerToLobby(state, {
    id: 'p2',
    name: 'Guest',
    connected: true,
    isBot: false,
  });
  return state;
}

function createThreePlayerLobby() {
  const state = createTwoPlayerLobby();
  addPlayerToLobby(state, {
    id: 'p3',
    name: 'Third',
    connected: true,
    isBot: false,
  });
  return state;
}

describe('acquire engine', () => {
  it('starts game with initial board and six tiles per player', () => {
    const state = createTwoPlayerLobby();
    const result = startGame(state, () => 0.5);

    expect(result.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_TILE);
    expect(state.players).toHaveLength(2);

    for (const player of state.players) {
      expect(player.startTile).toBeTruthy();
      expect(player.tiles).toHaveLength(6);
      expect(player.cash).toBe(6000);
    }

    expect(Object.keys(state.board)).toHaveLength(2);
  });

  it('rejects tiles that would merge two safe chains', () => {
    const state = createTwoPlayerLobby();
    startGame(state, () => 0.5);

    state.board = {
      A1: 'tower',
      A3: 'luxor',
    };

    state.hotels.tower.active = true;
    state.hotels.tower.size = 11;
    state.hotels.luxor.active = true;
    state.hotels.luxor.size = 11;

    expect(isTilePlayable(state, 'A2')).toBe(false);
  });

  it('treats a tile that would create an eighth chain as temporarily unplayable', () => {
    const state = createTwoPlayerLobby();
    startGame(state, () => 0.5);

    for (const chain of Object.values(state.hotels)) {
      chain.active = true;
      chain.size = 2;
    }

    const host = state.players.find((player) => player.id === 'p1');
    expect(host).toBeTruthy();
    host.tiles = ['A2'];
    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_TILE;
    state.board = { A1: null };

    expect(isTilePlayable(state, 'A2')).toBe(false);

    const place = applyAction(state, host.id, {
      type: 'PLACE_TILE',
      tileId: 'A2',
    });
    expect(place.ok).toBe(false);
    expect(place.error).toContain('eighth chain');
    expect('A2' in state.board).toBe(false);
  });

  it('lets the merging player choose the survivor when equal chains merge', () => {
    const state = createTwoPlayerLobby();
    startGame(state, () => 0.5);

    const host = state.players.find((player) => player.id === 'p1');
    const guest = state.players.find((player) => player.id === 'p2');
    expect(host).toBeTruthy();
    expect(guest).toBeTruthy();

    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_TILE;
    host.tiles = ['A2'];
    guest.tiles = [];

    state.board = {
      A1: 'tower',
      A3: 'luxor',
    };
    state.hotels.tower.active = true;
    state.hotels.tower.size = 4;
    state.hotels.luxor.active = true;
    state.hotels.luxor.size = 4;

    const place = applyAction(state, host.id, {
      type: 'PLACE_TILE',
      tileId: 'A2',
    });
    expect(place.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_MERGER_SURVIVOR);
    expect(state.pending.survivorChoices).toEqual(expect.arrayContaining(['tower', 'luxor']));

    const wrongChooser = applyAction(state, guest.id, {
      type: 'CHOOSE_MERGER_SURVIVOR',
      chainId: 'tower',
    });
    expect(wrongChooser.ok).toBe(false);

    const choose = applyAction(state, host.id, {
      type: 'CHOOSE_MERGER_SURVIVOR',
      chainId: 'tower',
    });
    expect(choose.ok).toBe(true);
    expect(state.board.A1).toBe('tower');
    expect(state.board.A2).toBe('tower');
    expect(state.board.A3).toBe('tower');
  });

  it('does not remove a safe chain when it merges with a smaller chain', () => {
    const state = createTwoPlayerLobby();
    startGame(state, () => 0.5);

    const host = state.players.find((player) => player.id === 'p1');
    expect(host).toBeTruthy();

    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_TILE;
    host.tiles = ['A2'];

    state.board = {
      A1: 'tower',
      A3: 'luxor',
    };
    state.hotels.tower.active = true;
    state.hotels.tower.size = 11;
    state.hotels.luxor.active = true;
    state.hotels.luxor.size = 5;

    const result = applyAction(state, host.id, {
      type: 'PLACE_TILE',
      tileId: 'A2',
    });

    expect(result.ok).toBe(true);
    expect(state.hotels.tower.active).toBe(true);
    expect(state.hotels.luxor.active).toBe(false);
    expect(state.board.A1).toBe('tower');
    expect(state.board.A2).toBe('tower');
    expect(state.board.A3).toBe('tower');
  });

  it('requires merger maker to choose first defunct chain when defunct sizes are tied', () => {
    const state = createTwoPlayerLobby();
    startGame(state, () => 0.5);

    const host = state.players.find((player) => player.id === 'p1');
    const guest = state.players.find((player) => player.id === 'p2');
    expect(host).toBeTruthy();
    expect(guest).toBeTruthy();

    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_TILE;
    host.tiles = ['A2'];

    state.board = {
      A1: 'tower',
      A3: 'luxor',
      B2: 'american',
    };
    state.hotels.tower.active = true;
    state.hotels.tower.size = 6;
    state.hotels.luxor.active = true;
    state.hotels.luxor.size = 4;
    state.hotels.american.active = true;
    state.hotels.american.size = 4;
    guest.stocks.luxor = 1;
    guest.stocks.american = 1;

    const place = applyAction(state, host.id, {
      type: 'PLACE_TILE',
      tileId: 'A2',
    });
    expect(place.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_MERGER_DEFUNCT_ORDER);
    expect(state.pending.defunctOrderChoices).toEqual(expect.arrayContaining(['luxor', 'american']));

    const wrongChooser = applyAction(state, guest.id, {
      type: 'CHOOSE_MERGER_DEFUNCT_CHAIN',
      chainId: 'luxor',
    });
    expect(wrongChooser.ok).toBe(false);

    const choose = applyAction(state, host.id, {
      type: 'CHOOSE_MERGER_DEFUNCT_CHAIN',
      chainId: 'american',
    });
    expect(choose.ok).toBe(true);
    expect(state.pending.currentDefunctChainId).toBe('american');
    expect(state.phase).toBe(PHASES.AWAIT_MERGER_DISPOSITION);
  });

  it('prompts stock disposition for each defunct chain during multi-mergers', () => {
    const state = createTwoPlayerLobby();
    startGame(state, () => 0.5);

    const host = state.players.find((player) => player.id === 'p1');
    const guest = state.players.find((player) => player.id === 'p2');
    expect(host).toBeTruthy();
    expect(guest).toBeTruthy();

    host.cash = 6000;
    guest.cash = 6000;
    host.stocks.luxor = 3;
    guest.stocks.luxor = 1;
    host.stocks.american = 2;
    guest.stocks.american = 1;

    state.hotels.tower.active = true;
    state.hotels.tower.size = 7;
    state.hotels.luxor.active = true;
    state.hotels.luxor.size = 4;
    state.hotels.american.active = true;
    state.hotels.american.size = 4;

    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_MERGER_DEFUNCT_ORDER;
    state.pending = {
      type: 'merger',
      tileId: 'D6',
      adjacentChains: ['tower', 'luxor', 'american'],
      survivorChoices: ['tower'],
      survivingChainId: 'tower',
      absorbTiles: [],
      remainingDefunctChainIds: ['luxor', 'american'],
      defunctOrderChoices: ['luxor', 'american'],
      currentDefunctChainId: null,
      decisionOrder: [],
      decisionPlayerIndex: 0,
      currentDecisionPlayerId: null,
    };

    const chooseLuxorFirst = applyAction(state, host.id, {
      type: 'CHOOSE_MERGER_DEFUNCT_CHAIN',
      chainId: 'luxor',
    });
    expect(chooseLuxorFirst.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_MERGER_DISPOSITION);
    expect(state.pending.currentDefunctChainId).toBe('luxor');
    expect(state.pending.currentDecisionPlayerId).toBe(host.id);

    const hostLuxorDecision = applyAction(state, host.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: 0,
      tradeFrom: 0,
    });
    expect(hostLuxorDecision.ok).toBe(true);
    expect(state.pending.currentDecisionPlayerId).toBe(guest.id);

    const guestLuxorDecision = applyAction(state, guest.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: 0,
      tradeFrom: 0,
    });
    expect(guestLuxorDecision.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_MERGER_DISPOSITION);
    expect(state.pending.currentDefunctChainId).toBe('american');
    expect(state.pending.currentDecisionPlayerId).toBe(host.id);

    const hostAmericanDecision = applyAction(state, host.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: 0,
      tradeFrom: 0,
    });
    expect(hostAmericanDecision.ok).toBe(true);
    expect(state.pending.currentDecisionPlayerId).toBe(guest.id);

    const guestAmericanDecision = applyAction(state, guest.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: 0,
      tradeFrom: 0,
    });
    expect(guestAmericanDecision.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_BUY);
    expect(state.hotels.luxor.active).toBe(false);
    expect(state.hotels.american.active).toBe(false);
  });

  it('enforces max three stock purchases per turn', () => {
    const state = createTwoPlayerLobby();
    startGame(state, () => 0.5);

    const currentPlayerId = state.currentPlayerId;
    state.phase = PHASES.AWAIT_BUY;

    state.hotels.tower.active = true;
    state.hotels.tower.size = 2;
    state.hotels.tower.availableShares = 25;

    const result = applyAction(state, currentPlayerId, {
      type: 'BUY_STOCKS',
      chains: ['tower', 'tower', 'tower', 'tower'],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('at most 3 shares');
  });

  it('hides opponent tiles and stocks but shows each players last buy', () => {
    const state = createTwoPlayerLobby();
    startGame(state, () => 0.5);

    const host = state.players.find((player) => player.id === 'p1');
    const guest = state.players.find((player) => player.id === 'p2');
    expect(host).toBeTruthy();
    expect(guest).toBeTruthy();

    const hostViewBeforeBuy = toPublicState(state, 'p1');
    const hostViewOfHost = hostViewBeforeBuy.players.find((player) => player.id === 'p1');
    const hostViewOfGuest = hostViewBeforeBuy.players.find((player) => player.id === 'p2');
    expect(hostViewOfHost).toBeTruthy();
    expect(hostViewOfGuest).toBeTruthy();
    expect(hostViewOfHost.tiles).toEqual(host.tiles);
    expect(hostViewOfHost.stocks).toEqual(host.stocks);
    expect(hostViewOfGuest.tiles).toEqual([]);
    expect(hostViewOfGuest.stocks).toEqual({});
    expect(hostViewOfGuest.tileCount).toBe(guest.tiles.length);

    state.phase = PHASES.AWAIT_BUY;
    state.currentPlayerId = host.id;
    state.hotels.tower.active = true;
    state.hotels.tower.size = 2;
    state.hotels.tower.availableShares = 25;

    const buyResult = applyAction(state, host.id, {
      type: 'BUY_STOCKS',
      chains: ['tower'],
    });
    expect(buyResult.ok).toBe(true);

    const guestViewAfterBuy = toPublicState(state, 'p2');
    const hostPublic = guestViewAfterBuy.players.find((player) => player.id === 'p1');
    const guestPublic = guestViewAfterBuy.players.find((player) => player.id === 'p2');
    expect(hostPublic).toBeTruthy();
    expect(guestPublic).toBeTruthy();
    expect(hostPublic.tiles).toEqual([]);
    expect(hostPublic.stocks).toEqual({});
    expect(guestPublic.stocks).toEqual(guest.stocks);
    expect(hostPublic.lastBuy).toEqual(['tower']);
  });

  it('allows merger stock sell/trade combination in one decision', () => {
    const state = createThreePlayerLobby();
    startGame(state, () => 0.5);

    const host = state.players.find((player) => player.id === 'p1');
    const guest = state.players.find((player) => player.id === 'p2');
    expect(host).toBeTruthy();
    expect(guest).toBeTruthy();

    host.stocks.luxor = 5;
    guest.stocks.luxor = 1;
    host.cash = 6000;

    state.hotels.tower.active = true;
    state.hotels.tower.size = 6;
    state.hotels.tower.availableShares = 10;
    state.hotels.luxor.active = true;
    state.hotels.luxor.size = 5;
    state.hotels.luxor.availableShares = 19;

    state.phase = PHASES.AWAIT_MERGER_DISPOSITION;
    state.pending = {
      type: 'merger',
      tileId: 'B2',
      adjacentChains: ['tower', 'luxor'],
      survivorChoices: ['tower'],
      survivingChainId: 'tower',
      absorbTiles: [],
      remainingDefunctChainIds: [],
      defunctOrderChoices: [],
      currentDefunctChainId: 'luxor',
      decisionOrder: ['p1', 'p2'],
      decisionPlayerIndex: 0,
      currentDecisionPlayerId: 'p1',
    };

    const result = applyAction(state, host.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: 1,
      tradeFrom: 4,
    });

    expect(result.ok).toBe(true);
    expect(host.stocks.luxor).toBe(0);
    expect(host.stocks.tower).toBe(2);
    expect(host.cash).toBe(6500);
    expect(state.hotels.tower.availableShares).toBe(8);
    expect(state.hotels.luxor.availableShares).toBe(24);
    expect(state.pending.currentDecisionPlayerId).toBe('p2');
  });

  it('in 2-player games, merger stock disposition is still player-driven', () => {
    const state = createTwoPlayerLobby();
    startGame(state, () => 0.5);

    const host = state.players.find((player) => player.id === 'p1');
    const guest = state.players.find((player) => player.id === 'p2');
    expect(host).toBeTruthy();
    expect(guest).toBeTruthy();

    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_TILE;
    host.tiles = ['A2'];

    host.stocks.luxor = 11;
    guest.stocks.luxor = 5;
    host.cash = 6000;
    guest.cash = 6000;

    state.board = {
      A1: 'tower',
      A3: 'luxor',
    };
    state.hotels.tower.active = true;
    state.hotels.tower.size = 6;
    state.hotels.luxor.active = true;
    state.hotels.luxor.size = 5;
    state.hotels.luxor.availableShares = 9;

    const place = applyAction(state, host.id, {
      type: 'PLACE_TILE',
      tileId: 'A2',
    });

    expect(place.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_MERGER_DISPOSITION);
    expect(state.pending.currentDecisionPlayerId).toBe(host.id);
    expect(host.stocks.luxor).toBe(11);
    expect(guest.stocks.luxor).toBe(5);
    expect(host.cash).toBe(11000);
    expect(guest.cash).toBe(8500);

    const hostHold = applyAction(state, host.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: 0,
      tradeFrom: 0,
    });
    expect(hostHold.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_MERGER_DISPOSITION);
    expect(state.pending.currentDecisionPlayerId).toBe(guest.id);

    const guestHold = applyAction(state, guest.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: 0,
      tradeFrom: 0,
    });
    expect(guestHold.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_BUY);
    expect(host.stocks.luxor).toBe(11);
    expect(guest.stocks.luxor).toBe(5);
    expect(state.hotels.luxor.active).toBe(false);
    expect(state.hotels.luxor.availableShares).toBe(9);
  });
});
