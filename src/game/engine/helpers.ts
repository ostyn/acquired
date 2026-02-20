/**
 * Responsibility: Provides shared low-level state helpers used across engine modules.
 * Includes stock initialization, lobby-setting normalization, and common entity lookups.
 */

import {
  HOTELS,
  MAX_PLAYER_COUNT,
  MAX_STARTING_CASH,
  MIN_PLAYER_COUNT,
  MIN_STARTING_CASH,
  STARTING_CASH,
  STARTING_CASH_STEP,
} from '../constants';
import { EN_MESSAGES } from '../../locales/en';
import type { ActionResult, GameLogEvent, GameLogKey, GameLogParams, GameState, LobbySettings, PlayerState, Stocks } from './types';
import type { HotelBankEntry } from '../utils';

const BOT_STRATEGIES = new Set(['random', 'monte_carlo']);

export function initialStocks(): Stocks {
  const stocks: Stocks = {};
  for (const hotel of HOTELS) {
    stocks[hotel.id] = 0;
  }
  return stocks;
}

export function defaultLobbySettings(): LobbySettings {
  return {
    allowDeadTilePlacementAsUnincorporated: false,
    allowSpectatorJoinAfterStart: false,
    excelStyleCoordinates: false,
    showPlayerCashOnTurnRail: false,
    showFullTurnRailLog: false,
    fastBotTurns: false,
    botStrategy: 'monte_carlo',
    maxPlayers: MAX_PLAYER_COUNT,
    startingCash: STARTING_CASH,
  };
}

export function normalizeBotStrategy(value: unknown): LobbySettings['botStrategy'] | null {
  if (typeof value !== 'string') {
    return null;
  }
  return BOT_STRATEGIES.has(value) ? (value as LobbySettings['botStrategy']) : null;
}

export function normalizeStartingCash(value: number): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return null;
  }
  if (numeric < MIN_STARTING_CASH || numeric > MAX_STARTING_CASH) {
    return null;
  }
  if (numeric % STARTING_CASH_STEP !== 0) {
    return null;
  }
  return numeric;
}

export function normalizeMaxPlayers(value: number): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return null;
  }
  if (numeric < MIN_PLAYER_COUNT || numeric > MAX_PLAYER_COUNT) {
    return null;
  }
  return numeric;
}

export function ensureLobbySettings(state: GameState): LobbySettings {
  const defaults = defaultLobbySettings();
  const current: Partial<LobbySettings> = state.settings && typeof state.settings === 'object' ? state.settings : {};
  const normalizedStartingCash = normalizeStartingCash(current.startingCash);
  const normalizedMaxPlayers = normalizeMaxPlayers(current.maxPlayers);

  const next = {
    allowDeadTilePlacementAsUnincorporated: Boolean(current.allowDeadTilePlacementAsUnincorporated),
    allowSpectatorJoinAfterStart: Boolean(current.allowSpectatorJoinAfterStart),
    excelStyleCoordinates: Boolean(current.excelStyleCoordinates),
    showPlayerCashOnTurnRail: Boolean(current.showPlayerCashOnTurnRail),
    showFullTurnRailLog: Boolean(current.showFullTurnRailLog),
    fastBotTurns: Boolean(current.fastBotTurns),
    botStrategy: normalizeBotStrategy(current.botStrategy) ?? defaults.botStrategy,
    maxPlayers: normalizedMaxPlayers ?? defaults.maxPlayers,
    startingCash: normalizedStartingCash ?? defaults.startingCash,
  };

  if (
    !state.settings
    || state.settings.allowDeadTilePlacementAsUnincorporated !== next.allowDeadTilePlacementAsUnincorporated
    || state.settings.allowSpectatorJoinAfterStart !== next.allowSpectatorJoinAfterStart
    || state.settings.excelStyleCoordinates !== next.excelStyleCoordinates
    || state.settings.showPlayerCashOnTurnRail !== next.showPlayerCashOnTurnRail
    || state.settings.showFullTurnRailLog !== next.showFullTurnRailLog
    || state.settings.fastBotTurns !== next.fastBotTurns
    || state.settings.botStrategy !== next.botStrategy
    || state.settings.maxPlayers !== next.maxPlayers
    || state.settings.startingCash !== next.startingCash
  ) {
    state.settings = next;
  }

  return state.settings;
}

export function getStartingCash(state: GameState): number {
  return ensureLobbySettings(state).startingCash;
}

export function describeBuy(chains: string[]): string {
  if (!chains.length) {
    return 'pass';
  }

  return chains
    .map((chainId) => {
      const chain = HOTELS.find((entry) => entry.id === chainId);
      return chain ? chain.name : chainId;
    })
    .join(', ');
}

export function getPlayer(state: GameState, playerId: string | null | undefined): PlayerState | null {
  if (!playerId) {
    return null;
  }
  return state.players.find((player) => player.id === playerId) || null;
}

export function getChain(state: GameState, chainId: string | null | undefined): HotelBankEntry | null {
  if (!chainId) {
    return null;
  }
  return state.hotels[chainId] || null;
}

export function orderedFrom(state: GameState, startPlayerId: string | null | undefined): string[] {
  if (!startPlayerId) {
    return [...state.playerOrder];
  }

  const ids = [...state.playerOrder];
  const startIndex = ids.indexOf(startPlayerId);
  if (startIndex === -1) {
    return ids;
  }

  return [...ids.slice(startIndex), ...ids.slice(0, startIndex)];
}

export function drawTiles(state: GameState, player: PlayerState, amount: number): void {
  for (let index = 0; index < amount; index += 1) {
    if (!state.drawPile.length) {
      return;
    }

    const tile = state.drawPile.pop();
    if (!tile) {
      return;
    }

    player.tiles.push(tile);
  }
}

export function ensureLogCollections(state: GameState): { log: string[]; logEvents: GameLogEvent[] } {
  if (!Array.isArray(state.log)) {
    state.log = [];
  }

  if (!Array.isArray((state as GameState).logEvents)) {
    (state as GameState).logEvents = [];
  }

  return {
    log: state.log,
    logEvents: (state as GameState).logEvents,
  };
}

export function pushLogEvent(
  state: GameState,
  key: GameLogKey,
  params: GameLogParams,
  legacyText?: string,
): void {
  const collections = ensureLogCollections(state);
  const defaultLegacyText = interpolateMessage(
    EN_MESSAGES[`log.${key}`] || String(params.message || key),
    params,
  );
  collections.logEvents.push({
    key,
    params: { ...params },
  });
  collections.log.push(legacyText || defaultLegacyText);
}

export function pushLegacyLog(state: GameState, message: string): void {
  pushLogEvent(state, 'legacy', { message }, message);
}

function interpolateMessage(template: string, params: GameLogParams = {}): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = params[key];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  });
}

export function errorResult(errorKey: string, params: GameLogParams = {}, fallback = errorKey): ActionResult {
  const template = EN_MESSAGES[errorKey] || fallback;
  return {
    ok: false,
    error: interpolateMessage(template, params),
    errorKey,
    errorParams: { ...params },
  };
}
