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
import type { GameState, LobbySettings, PlayerState, Stocks } from './types';
import type { HotelBankEntry } from '../utils';

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
    excelStyleCoordinates: false,
    maxPlayers: MAX_PLAYER_COUNT,
    startingCash: STARTING_CASH,
  };
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
    excelStyleCoordinates: Boolean(current.excelStyleCoordinates),
    maxPlayers: normalizedMaxPlayers ?? defaults.maxPlayers,
    startingCash: normalizedStartingCash ?? defaults.startingCash,
  };

  if (
    !state.settings
    || state.settings.allowDeadTilePlacementAsUnincorporated !== next.allowDeadTilePlacementAsUnincorporated
    || state.settings.excelStyleCoordinates !== next.excelStyleCoordinates
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
