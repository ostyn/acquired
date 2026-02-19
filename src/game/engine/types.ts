/**
 * Responsibility: Defines shared engine data contracts.
 * These types are used across lobby setup, turn resolution, and public-state generation.
 */

import type { HotelBankEntry } from '../utils';

export type Stocks = Record<string, number>;

export type BoardState = Record<string, string | null>;

export type HotelsState = Record<string, HotelBankEntry>;

export type PlayerState = {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  tiles: string[];
  cash: number;
  stocks: Stocks;
  startTile: string | null;
  lastBuy: string[] | null;
};

export type LobbySettings = {
  allowDeadTilePlacementAsUnincorporated: boolean;
  excelStyleCoordinates: boolean;
  maxPlayers: number;
  startingCash: number;
};

export type GameState = {
  roomId: string;
  hostId: string;
  players: PlayerState[];
  playerOrder: string[];
  currentPlayerId: string | null;
  phase: string;
  board: BoardState;
  drawPile: string[];
  discardPile: string[];
  hotels: HotelsState;
  pending: any;
  requestGameEndAfterBuy: boolean;
  settings: LobbySettings;
  log: string[];
  winnerIds: string[];
  gameEnded: boolean;
};

export type ActionResult = {
  ok: boolean;
  error?: string;
};

export type LegalActions = {
  allowed: boolean;
  phase?: string;
  isTurn?: boolean;
  canEndGame?: boolean;
  playableTiles?: string[];
  foundingChoices?: string[];
  survivorChoices?: string[];
  defunctOrderChoices?: string[];
  mergerDisposition?: any;
  buyableChains?: any[];
  canSkipTile?: boolean;
};
