import { describe, expect, it } from 'vitest';
import { PHASES } from '../src/game/constants';
import {
  addPlayerToLobby,
  applyAction,
  chooseRandomBotAction,
  createLobbyState,
  getLegalActions,
  isTilePlayable,
  markPlayerConnection,
  removePlayerFromLobby,
  setLobbySettings,
  startGame,
  toPublicState,
} from '../src/game/engine';

function createLobby(playerCount = 2, botIds = []) {
  const state = createLobbyState({
    roomId: 'COVER01',
    hostPlayer: { id: 'p1', name: 'Host' },
  });

  for (let index = 2; index <= playerCount; index += 1) {
    const id = `p${index}`;
    addPlayerToLobby(state, {
      id,
      name: `Player ${index}`,
      connected: true,
      isBot: botIds.includes(id),
    });
  }

  return state;
}

function getPlayer(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  expect(player).toBeTruthy();
  return player;
}

function setupMergerDispositionState({ survivorShares = 10 } = {}) {
  const state = createLobby(3);
  startGame(state, () => 0.5);

  const host = getPlayer(state, 'p1');
  const guest = getPlayer(state, 'p2');

  host.stocks.luxor = 5;
  guest.stocks.luxor = 1;
  host.cash = 6000;

  state.hotels.tower.active = true;
  state.hotels.tower.size = 6;
  state.hotels.tower.availableShares = survivorShares;
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

  return { state, host, guest };
}

describe('acquire engine extra coverage', () => {
  it('rejects duplicate players in lobby', () => {
    const state = createLobby();
    const result = addPlayerToLobby(state, {
      id: 'p2',
      name: 'Guest',
      connected: true,
      isBot: false,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('enforces lobby-only add/remove and host removal guard', () => {
    const state = createLobby();

    const hostRemove = removePlayerFromLobby(state, 'p1');
    expect(hostRemove.ok).toBe(false);
    expect(hostRemove.error).toContain('Host cannot be removed');

    const unknownRemove = removePlayerFromLobby(state, 'missing');
    expect(unknownRemove.ok).toBe(false);
    expect(unknownRemove.error).toContain('not found');

    startGame(state, () => 0.5);

    const addAfterStart = addPlayerToLobby(state, {
      id: 'p3',
      name: 'Late',
      connected: true,
      isBot: false,
    });
    expect(addAfterStart.ok).toBe(false);
    expect(addAfterStart.error).toContain('after the game has started');

    const removeAfterStart = removePlayerFromLobby(state, 'p2');
    expect(removeAfterStart.ok).toBe(false);
    expect(removeAfterStart.error).toContain('after the game has started');
  });

  it('marks player connection state and logs transitions', () => {
    const state = createLobby();
    const guest = getPlayer(state, 'p2');
    const initialLogLength = state.log.length;
    expect(guest.connected).toBe(true);

    markPlayerConnection(state, 'p2', false);
    expect(guest.connected).toBe(false);
    expect(state.log[state.log.length - 1]).toBe('Player 2 disconnected.');

    markPlayerConnection(state, 'p2', true);
    expect(guest.connected).toBe(true);
    expect(state.log[state.log.length - 1]).toBe('Player 2 connected.');

    // No additional log entry when the state does not actually change.
    markPlayerConnection(state, 'p2', true);
    expect(state.log.length).toBe(initialLogLength + 2);
  });

  it('requires 2 to 6 players to start', () => {
    const onePlayer = createLobby(1);
    const oneResult = startGame(onePlayer, () => 0.5);
    expect(oneResult.ok).toBe(false);
    expect(oneResult.error).toContain('2 to 6 players');

    const sevenPlayers = createLobby(6);
    sevenPlayers.players.push({
      id: 'p7',
      name: 'Player 7',
      isBot: false,
      connected: true,
      tiles: [],
      cash: 6000,
      stocks: {},
      startTile: null,
      lastBuy: null,
    });
    const sevenResult = startGame(sevenPlayers, () => 0.5);
    expect(sevenResult.ok).toBe(false);
    expect(sevenResult.error).toContain('2 to 6 players');
  });

  it('cannot start a game twice', () => {
    const state = createLobby();
    const first = startGame(state, () => 0.5);
    const second = startGame(state, () => 0.5);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error).toContain('already started');
  });

  it('lets only host update lobby settings', () => {
    const state = createLobby(3);

    const guestAttempt = setLobbySettings(state, 'p2', {
      startingCash: 12000,
    });
    expect(guestAttempt.ok).toBe(false);
    expect(guestAttempt.error).toContain('Only the host');

    const hostAttempt = setLobbySettings(state, 'p1', {
      startingCash: 12000,
      maxPlayers: 4,
      allowDeadTilePlacementAsUnincorporated: true,
    });
    expect(hostAttempt.ok).toBe(true);
    expect(state.settings.startingCash).toBe(12000);
    expect(state.settings.maxPlayers).toBe(4);
    expect(state.settings.allowDeadTilePlacementAsUnincorporated).toBe(true);
  });

  it('rejects invalid starting money values', () => {
    const state = createLobby();

    const result = setLobbySettings(state, 'p1', {
      startingCash: 6050,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Starting money must be an integer');
    expect(state.settings.startingCash).toBe(6000);
  });

  it('applies starting money setting to lobby players and game start', () => {
    const state = createLobby();

    const update = setLobbySettings(state, 'p1', {
      startingCash: 12300,
    });
    expect(update.ok).toBe(true);
    expect(state.players.map((player) => player.cash)).toEqual([12300, 12300]);

    const addThird = addPlayerToLobby(state, {
      id: 'p3',
      name: 'Third',
      connected: true,
      isBot: false,
    });
    expect(addThird.ok).toBe(true);
    expect(getPlayer(state, 'p3').cash).toBe(12300);

    const start = startGame(state, () => 0.5);
    expect(start.ok).toBe(true);
    expect(state.players.map((player) => player.cash)).toEqual([12300, 12300, 12300]);
  });

  it('rejects invalid max players values', () => {
    const state = createLobby();

    const tooHigh = setLobbySettings(state, 'p1', { maxPlayers: 7 });
    expect(tooHigh.ok).toBe(false);
    expect(tooHigh.error).toContain('Max players must be an integer from 2 to 6');

    const tooLow = setLobbySettings(state, 'p1', { maxPlayers: 1 });
    expect(tooLow.ok).toBe(false);
    expect(tooLow.error).toContain('Max players must be an integer from 2 to 6');
  });

  it('rejects max players below current player count', () => {
    const state = createLobby(4);
    const result = setLobbySettings(state, 'p1', { maxPlayers: 3 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('below current player count');
  });

  it('prevents adding players beyond configured max players', () => {
    const state = createLobby(3);
    const update = setLobbySettings(state, 'p1', { maxPlayers: 3 });
    expect(update.ok).toBe(true);

    const addHuman = addPlayerToLobby(state, {
      id: 'p4',
      name: 'Fourth',
      connected: true,
      isBot: false,
    });

    expect(addHuman.ok).toBe(false);
    expect(addHuman.error).toContain('Lobby is full');
  });

  it('blocks start game when state exceeds configured max players', () => {
    const state = createLobby(3);
    const update = setLobbySettings(state, 'p1', { maxPlayers: 3 });
    expect(update.ok).toBe(true);

    state.players.push({
      id: 'p4',
      name: 'Injected',
      isBot: false,
      connected: true,
      tiles: [],
      cash: 6000,
      stocks: {},
      startTile: null,
      lastBuy: null,
    });

    const result = startGame(state, () => 0.5);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('at most 3 players');
  });

  it('does not allow changing lobby settings after game starts', () => {
    const state = createLobby();
    startGame(state, () => 0.5);

    const result = setLobbySettings(state, 'p1', {
      startingCash: 12000,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('only be changed before the game starts');
  });

  it('exposes lobby settings in public state', () => {
    const state = createLobby();
    setLobbySettings(state, 'p1', {
      startingCash: 9000,
      maxPlayers: 4,
      allowDeadTilePlacementAsUnincorporated: true,
    });

    const publicState = toPublicState(state, 'p2');
    expect(publicState.settings).toMatchObject({
      startingCash: 9000,
      maxPlayers: 4,
      allowDeadTilePlacementAsUnincorporated: true,
    });
  });

  it('allows eighth-chain tiles to be played as unincorporated when configured', () => {
    const state = createLobby();
    const settingsResult = setLobbySettings(state, 'p1', {
      allowDeadTilePlacementAsUnincorporated: true,
    });
    expect(settingsResult.ok).toBe(true);
    startGame(state, () => 0.5);

    for (const chain of Object.values(state.hotels)) {
      chain.active = true;
      chain.size = 2;
    }

    const host = getPlayer(state, 'p1');
    host.tiles = ['A2'];
    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_TILE;
    state.board = { A1: null };

    expect(isTilePlayable(state, 'A2')).toBe(true);

    const place = applyAction(state, host.id, {
      type: 'PLACE_TILE',
      tileId: 'A2',
    });

    expect(place.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_BUY);
    expect(state.board.A2).toBe(null);
    expect(host.tiles).toEqual([]);
  });

  it('allows skipping tile only when all tiles are unplayable', () => {
    const state = createLobby();
    startGame(state, () => 0.5);

    const host = getPlayer(state, 'p1');
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
    state.hotels.luxor.size = 11;

    const legal = getLegalActions(state, host.id);
    expect(legal.canSkipTile).toBe(true);
    expect(legal.playableTiles).toEqual([]);

    const result = applyAction(state, host.id, { type: 'SKIP_TILE' });
    expect(result.ok).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_BUY);
  });

  it('rejects skipping tile when a playable tile exists', () => {
    const state = createLobby();
    startGame(state, () => 0.5);

    const host = getPlayer(state, 'p1');
    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_TILE;
    host.tiles = ['A2'];
    state.board = {};

    const legal = getLegalActions(state, host.id);
    expect(legal.canSkipTile).toBe(false);
    expect(legal.playableTiles).toEqual(['A2']);

    const result = applyAction(state, host.id, { type: 'SKIP_TILE' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('only skip when all');
  });

  it('replaces permanently unplayable tiles when the turn advances', () => {
    const state = createLobby();
    startGame(state, () => 0.5);

    const host = getPlayer(state, 'p1');
    const guest = getPlayer(state, 'p2');

    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_BUY;
    state.board = {
      A1: 'tower',
      A3: 'luxor',
    };
    state.hotels.tower.active = true;
    state.hotels.tower.size = 11;
    state.hotels.luxor.active = true;
    state.hotels.luxor.size = 11;

    guest.tiles = ['A2'];
    state.drawPile = ['I12'];
    state.discardPile = [];

    const buy = applyAction(state, host.id, {
      type: 'BUY_STOCKS',
      chains: [],
    });

    expect(buy.ok).toBe(true);
    expect(state.currentPlayerId).toBe(guest.id);
    expect(state.phase).toBe(PHASES.AWAIT_TILE);
    expect(guest.tiles).toEqual(['I12']);
    expect(state.discardPile).toContain('A2');
    expect(state.log.some((line) => line.includes('replaces 1 unplayable tile'))).toBe(true);
  });

  it('rejects merger disposition with negative sell', () => {
    const { state, host } = setupMergerDispositionState();
    const result = applyAction(state, host.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: -1,
      tradeFrom: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('non-negative integer');
  });

  it('rejects merger disposition with odd trade quantity', () => {
    const { state, host } = setupMergerDispositionState();
    const result = applyAction(state, host.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: 0,
      tradeFrom: 3,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('even integer');
  });

  it('rejects merger disposition when selling and trading more than owned', () => {
    const { state, host } = setupMergerDispositionState();
    const result = applyAction(state, host.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: 2,
      tradeFrom: 4,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('more shares than you own');
  });

  it('rejects merger disposition when survivor shares are insufficient', () => {
    const { state, host } = setupMergerDispositionState({ survivorShares: 1 });
    const result = applyAction(state, host.id, {
      type: 'RESOLVE_MERGER_STOCK',
      sell: 0,
      tradeFrom: 4,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('enough surviving shares');
  });

  it('rejects END_GAME when conditions are not met', () => {
    const state = createLobby();
    startGame(state, () => 0.5);

    const host = getPlayer(state, 'p1');
    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_BUY;

    const result = applyAction(state, host.id, { type: 'END_GAME' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('condition is not currently met');
  });

  it('allows declaring end game before buy, then finalizing on normal buy action', () => {
    const state = createLobby();
    startGame(state, () => 0.5);

    const host = getPlayer(state, 'p1');
    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_TILE;

    state.hotels.tower.active = true;
    state.hotels.tower.size = 11;
    state.hotels.tower.availableShares = 25;
    state.hotels.luxor.active = true;
    state.hotels.luxor.size = 11;
    state.hotels.luxor.availableShares = 25;

    const declare = applyAction(state, host.id, { type: 'DECLARE_END_GAME' });
    expect(declare.ok).toBe(true);
    expect(state.requestGameEndAfterBuy).toBe(true);
    expect(state.phase).toBe(PHASES.AWAIT_TILE);
    expect(toPublicState(state, host.id).pendingEndGameRequest).toBe(true);

    state.phase = PHASES.AWAIT_BUY;
    const buy = applyAction(state, host.id, {
      type: 'BUY_STOCKS',
      chains: [],
      endGame: false,
    });

    expect(buy.ok).toBe(true);
    expect(state.phase).toBe(PHASES.GAME_OVER);
    expect(state.gameEnded).toBe(true);
  });

  it('rejects declaring end game when condition is not met', () => {
    const state = createLobby();
    startGame(state, () => 0.5);

    const host = getPlayer(state, 'p1');
    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_TILE;

    const declare = applyAction(state, host.id, { type: 'DECLARE_END_GAME' });
    expect(declare.ok).toBe(false);
    expect(declare.error).toContain('condition is not currently met');
  });

  it('ends game and applies tied-majority bonus split before liquidation', () => {
    const state = createLobby(3);
    startGame(state, () => 0.5);

    const p1 = getPlayer(state, 'p1');
    const p2 = getPlayer(state, 'p2');
    const p3 = getPlayer(state, 'p3');

    state.currentPlayerId = p1.id;
    state.phase = PHASES.AWAIT_BUY;
    state.hotels.tower.active = true;
    state.hotels.tower.size = 11;
    state.hotels.tower.availableShares = 21;
    p1.stocks.tower = 2;
    p2.stocks.tower = 2;
    p3.stocks.tower = 0;

    const result = applyAction(state, p1.id, { type: 'END_GAME' });
    expect(result.ok).toBe(true);
    expect(state.phase).toBe(PHASES.GAME_OVER);
    expect(state.gameEnded).toBe(true);
    expect(state.winnerIds.sort()).toEqual(['p1', 'p2']);
    expect(p1.cash).toBe(12600);
    expect(p2.cash).toBe(12600);
    expect(p3.cash).toBe(6000);
    expect(p1.stocks.tower).toBe(0);
    expect(p2.stocks.tower).toBe(0);
  });

  it('ends game and splits tied minority bonus correctly', () => {
    const state = createLobby(3);
    startGame(state, () => 0.5);

    const p1 = getPlayer(state, 'p1');
    const p2 = getPlayer(state, 'p2');
    const p3 = getPlayer(state, 'p3');

    state.currentPlayerId = p1.id;
    state.phase = PHASES.AWAIT_BUY;
    state.hotels.tower.active = true;
    state.hotels.tower.size = 11;
    state.hotels.tower.availableShares = 18;
    p1.stocks.tower = 3;
    p2.stocks.tower = 2;
    p3.stocks.tower = 2;

    const result = applyAction(state, p1.id, { type: 'END_GAME' });
    expect(result.ok).toBe(true);
    expect(state.phase).toBe(PHASES.GAME_OVER);
    expect(state.winnerIds).toEqual(['p1']);
    expect(p1.cash).toBe(15100);
    expect(p2.cash).toBe(9100);
    expect(p3.cash).toBe(9100);
  });

  it('awards both majority and minority bonuses to a sole holder', () => {
    const state = createLobby();
    startGame(state, () => 0.5);

    const p1 = getPlayer(state, 'p1');
    const p2 = getPlayer(state, 'p2');

    state.currentPlayerId = p1.id;
    state.phase = PHASES.AWAIT_BUY;
    state.hotels.tower.active = true;
    state.hotels.tower.size = 11;
    state.hotels.tower.availableShares = 21;
    p1.stocks.tower = 4;
    p2.stocks.tower = 0;

    const result = applyAction(state, p1.id, { type: 'END_GAME' });
    expect(result.ok).toBe(true);
    expect(state.phase).toBe(PHASES.GAME_OVER);
    expect(state.winnerIds).toEqual(['p1']);
    expect(p1.cash).toBe(19300);
    expect(p2.cash).toBe(6000);
  });

  it('returns disallowed legal actions in lobby and for unknown player', () => {
    const state = createLobby(1);

    const unknown = getLegalActions(state, 'missing');
    expect(unknown).toEqual({ allowed: false });

    const host = getLegalActions(state, 'p1');
    expect(host.allowed).toBe(false);
    expect(host.phase).toBe(PHASES.LOBBY);
    expect(host.canEndGame).toBe(false);
  });

  it('returns merger disposition limits in legal actions', () => {
    const { state, host } = setupMergerDispositionState({ survivorShares: 1 });
    const legal = getLegalActions(state, host.id);

    expect(legal.allowed).toBe(true);
    expect(legal.phase).toBe(PHASES.AWAIT_MERGER_DISPOSITION);
    expect(legal.mergerDisposition).toMatchObject({
      defunctChainId: 'luxor',
      survivingChainId: 'tower',
      owned: 5,
      maxSell: 5,
      maxTradeFrom: 2,
      tradeUnit: 2,
      defunctPrice: 500,
    });
  });

  it('returns buy legal actions with maxBuy constrained by cash and shares', () => {
    const state = createLobby();
    startGame(state, () => 0.5);
    const host = getPlayer(state, 'p1');

    state.currentPlayerId = host.id;
    state.phase = PHASES.AWAIT_BUY;
    host.cash = 450;

    state.hotels.tower.active = true;
    state.hotels.tower.size = 2;
    state.hotels.tower.availableShares = 2;
    state.hotels.american.active = true;
    state.hotels.american.size = 2;
    state.hotels.american.availableShares = 25;

    const legal = getLegalActions(state, host.id);
    const tower = legal.buyableChains.find((entry) => entry.chainId === 'tower');
    const american = legal.buyableChains.find((entry) => entry.chainId === 'american');

    expect(tower).toMatchObject({
      chainId: 'tower',
      price: 200,
      availableShares: 2,
      maxBuy: 2,
    });
    expect(american).toMatchObject({
      chainId: 'american',
      price: 200,
      maxBuy: 2,
    });
  });

  it('bot skips tile when it has no playable tile options', () => {
    const state = createLobby(2, ['p2']);
    startGame(state, () => 0.5);

    const bot = getPlayer(state, 'p2');
    state.currentPlayerId = bot.id;
    state.phase = PHASES.AWAIT_TILE;
    bot.tiles = ['A2'];
    state.board = {
      A1: 'tower',
      A3: 'luxor',
    };
    state.hotels.tower.active = true;
    state.hotels.tower.size = 11;
    state.hotels.luxor.active = true;
    state.hotels.luxor.size = 11;

    const action = chooseRandomBotAction(state, bot.id, () => 0.5);
    expect(action).toEqual({ type: 'SKIP_TILE' });
  });

  it('bot buy actions stay within legal limits', () => {
    const state = createLobby(2, ['p2']);
    startGame(state, () => 0.5);

    const bot = getPlayer(state, 'p2');
    state.currentPlayerId = bot.id;
    state.phase = PHASES.AWAIT_BUY;
    bot.cash = 450;

    state.hotels.tower.active = true;
    state.hotels.tower.size = 2;
    state.hotels.tower.availableShares = 25;

    const action = chooseRandomBotAction(state, bot.id, () => 0);
    expect(action.type).toBe('BUY_STOCKS');
    expect(action.chains.length).toBeLessThanOrEqual(3);
    for (const chainId of action.chains) {
      expect(chainId).toBe('tower');
    }
  });
});
