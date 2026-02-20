/**
 * Responsibility: Owns lobby lifecycle and game startup transitions.
 * Manages player roster changes, lobby settings, and initial board/deck setup.
 */

import {
  MAX_PLAYER_COUNT,
  MIN_PLAYER_COUNT,
  PHASES,
} from '../constants';
import { buildAllTiles, createHotelBank, shuffle, tileSortValue } from '../utils';
import {
  ensureLobbySettings,
  getStartingCash,
  initialStocks,
  normalizeBotStrategy,
  normalizeMaxPlayers,
  normalizeStartingCash,
  pushLogEvent,
} from './helpers';
import { replaceDeadTilesIfNeeded } from './turns';
import type { ActionResult, BoardState, GameState } from './types';

export function createLobbyState({ roomId, hostPlayer }: { roomId: string; hostPlayer: { id: string; name: string } }): GameState {
  const settings = {
    allowDeadTilePlacementAsUnincorporated: false,
    allowSpectatorJoinAfterStart: false,
    excelStyleCoordinates: false,
    showPlayerCashOnTurnRail: false,
    showFullTurnRailLog: false,
    fastBotTurns: false,
    botStrategy: 'monte_carlo' as const,
    maxPlayers: MAX_PLAYER_COUNT,
    startingCash: 6000,
  };

  return {
    roomId,
    hostId: hostPlayer.id,
    players: [
      {
        id: hostPlayer.id,
        name: hostPlayer.name,
        isBot: false,
        connected: true,
        tiles: [],
        cash: settings.startingCash,
        stocks: initialStocks(),
        startTile: null,
        lastBuy: null,
      },
    ],
    playerOrder: [],
    currentPlayerId: null,
    phase: PHASES.LOBBY,
    board: {} as BoardState,
    drawPile: [],
    discardPile: [],
    hotels: createHotelBank(),
    pending: null,
    requestGameEndAfterBuy: false,
    settings,
    log: ['Lobby created.'],
    logEvents: [{ key: 'lobby_created', params: {} }],
    winnerIds: [],
    gameEnded: false,
  };
}

export function addPlayerToLobby(
  state: GameState,
  player: { id: string; name: string; isBot?: boolean; connected?: boolean },
): ActionResult {
  if (state.phase !== PHASES.LOBBY) {
    return { ok: false, error: 'Cannot add players after the game has started.' };
  }

  if (state.players.some((entry) => entry.id === player.id)) {
    return { ok: false, error: 'Player already exists.' };
  }

  const settings = ensureLobbySettings(state);
  if (state.players.length >= settings.maxPlayers) {
    return { ok: false, error: `Lobby is full (max ${settings.maxPlayers} players).` };
  }

  state.players.push({
    id: player.id,
    name: player.name,
    isBot: Boolean(player.isBot),
    connected: player.isBot ? true : Boolean(player.connected),
    tiles: [],
    cash: getStartingCash(state),
    stocks: initialStocks(),
    startTile: null,
    lastBuy: null,
  });
  pushLogEvent(
    state,
    'player_joined_lobby',
    { playerId: player.id, playerName: player.name },
    `${player.name} joined the lobby.`,
  );
  return { ok: true };
}

export function setLobbySettings(state: GameState, actorId: string, settingsPatch: any): ActionResult {
  if (state.phase !== PHASES.LOBBY) {
    return { ok: false, error: 'Lobby settings can only be changed before the game starts.' };
  }

  if (state.hostId !== actorId) {
    return { ok: false, error: 'Only the host may change lobby settings.' };
  }

  const current = ensureLobbySettings(state);
  const next = {
    ...current,
  };

  if (Object.prototype.hasOwnProperty.call(settingsPatch || {}, 'allowDeadTilePlacementAsUnincorporated')) {
    next.allowDeadTilePlacementAsUnincorporated = Boolean(settingsPatch.allowDeadTilePlacementAsUnincorporated);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPatch || {}, 'allowSpectatorJoinAfterStart')) {
    next.allowSpectatorJoinAfterStart = Boolean(settingsPatch.allowSpectatorJoinAfterStart);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPatch || {}, 'excelStyleCoordinates')) {
    next.excelStyleCoordinates = Boolean(settingsPatch.excelStyleCoordinates);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPatch || {}, 'showPlayerCashOnTurnRail')) {
    next.showPlayerCashOnTurnRail = Boolean(settingsPatch.showPlayerCashOnTurnRail);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPatch || {}, 'showFullTurnRailLog')) {
    next.showFullTurnRailLog = Boolean(settingsPatch.showFullTurnRailLog);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPatch || {}, 'fastBotTurns')) {
    next.fastBotTurns = Boolean(settingsPatch.fastBotTurns);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPatch || {}, 'botStrategy')) {
    const strategy = normalizeBotStrategy(settingsPatch.botStrategy);
    if (strategy) {
      next.botStrategy = strategy;
    }
  }

  if (Object.prototype.hasOwnProperty.call(settingsPatch || {}, 'maxPlayers')) {
    const maxPlayers = normalizeMaxPlayers(settingsPatch.maxPlayers);
    if (maxPlayers === null) {
      return {
        ok: false,
        error: `Max players must be an integer from ${MIN_PLAYER_COUNT} to ${MAX_PLAYER_COUNT}.`,
      };
    }
    if (maxPlayers < state.players.length) {
      return {
        ok: false,
        error: `Cannot set max players below current player count (${state.players.length}).`,
      };
    }
    next.maxPlayers = maxPlayers;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPatch || {}, 'startingCash')) {
    const startingCash = normalizeStartingCash(settingsPatch.startingCash);
    if (startingCash === null) {
      return {
        ok: false,
        error: 'Starting money must be an integer from $1000 to $50000 in $100 increments.',
      };
    }
    next.startingCash = startingCash;
  }

  state.settings = next;
  for (const player of state.players) {
    player.cash = next.startingCash;
  }
  pushLogEvent(state, 'host_updated_lobby_settings', {}, 'Host updated lobby settings.');
  return { ok: true };
}

export function removePlayerFromLobby(state: GameState, playerId: string): ActionResult {
  if (state.phase !== PHASES.LOBBY) {
    return { ok: false, error: 'Cannot remove players after the game has started.' };
  }

  if (state.hostId === playerId) {
    return { ok: false, error: 'Host cannot be removed from lobby.' };
  }

  const index = state.players.findIndex((player) => player.id === playerId);
  if (index === -1) {
    return { ok: false, error: 'Player not found.' };
  }

  const [removed] = state.players.splice(index, 1);
  pushLogEvent(
    state,
    'player_left_lobby',
    { playerId: removed.id, playerName: removed.name },
    `${removed.name} left the lobby.`,
  );
  return { ok: true };
}

export function markPlayerConnection(state: GameState, playerId: string, connected: boolean): void {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  if (player.connected === connected) {
    return;
  }

  player.connected = connected;
  pushLogEvent(
    state,
    connected ? 'player_connected' : 'player_disconnected',
    { playerId: player.id, playerName: player.name },
    `${player.name} ${connected ? 'connected' : 'disconnected'}.`,
  );
}

export function startGame(state: GameState, rng: () => number = Math.random): ActionResult {
  if (state.phase !== PHASES.LOBBY) {
    return { ok: false, error: 'Game has already started.' };
  }

  if (state.players.length < MIN_PLAYER_COUNT || state.players.length > MAX_PLAYER_COUNT) {
    return { ok: false, error: 'Acquire requires 2 to 6 players.' };
  }

  const settings = ensureLobbySettings(state);
  if (state.players.length > settings.maxPlayers) {
    return { ok: false, error: `Lobby allows at most ${settings.maxPlayers} players.` };
  }

  state.board = {};
  state.drawPile = shuffle(buildAllTiles(), rng);
  state.discardPile = [];
  state.hotels = createHotelBank();
  state.pending = null;
  state.winnerIds = [];
  state.gameEnded = false;
  state.requestGameEndAfterBuy = false;
  ensureLobbySettings(state);

  for (const player of state.players) {
    player.tiles = [];
    player.cash = getStartingCash(state);
    player.stocks = initialStocks();
    player.lastBuy = null;
  }

  for (const player of state.players) {
    const tile = state.drawPile.pop();
    if (!tile) {
      return { ok: false, error: 'Not enough tiles to start game.' };
    }
    player.startTile = tile;
    state.board[tile] = null;
  }

  state.players.sort((left, right) => tileSortValue(left.startTile || 'A1') - tileSortValue(right.startTile || 'A1'));
  state.playerOrder = state.players.map((player) => player.id);

  for (const player of state.players) {
    while (player.tiles.length < 6 && state.drawPile.length) {
      const tile = state.drawPile.pop();
      if (!tile) {
        break;
      }
      player.tiles.push(tile);
    }
  }

  state.currentPlayerId = state.playerOrder[0];
  state.phase = PHASES.AWAIT_TILE;
  pushLogEvent(state, 'game_started', {}, 'Game started.');

  const firstPlayer = state.players.find((player) => player.id === state.currentPlayerId) || null;
  replaceDeadTilesIfNeeded(state, firstPlayer);
  return { ok: true };
}
