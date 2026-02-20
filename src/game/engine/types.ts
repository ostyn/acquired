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
  showPlayerCashOnTurnRail: boolean;
  maxPlayers: number;
  startingCash: number;
};

export type GameLogParam = string | number | boolean;

export type GameLogParams = Record<string, GameLogParam>;

export type GameLogKey =
  | 'lobby_created'
  | 'player_joined_lobby'
  | 'host_updated_lobby_settings'
  | 'player_left_lobby'
  | 'player_connected'
  | 'player_disconnected'
  | 'game_started'
  | 'player_must_found_chain'
  | 'player_placed_unincorporated_all_active'
  | 'player_placed_unincorporated'
  | 'player_grew_chain'
  | 'player_triggered_merger'
  | 'player_founded_chain_free_share'
  | 'player_founded_chain'
  | 'player_bought_stocks'
  | 'player_passed_stock_buying'
  | 'player_skipped_tile_placement'
  | 'player_declared_end_game'
  | 'player_received_tied_bonus'
  | 'player_received_majority_bonus'
  | 'player_received_additional_minority_bonus'
  | 'player_received_minority_bonus'
  | 'game_tallying_final_chains'
  | 'player_replaced_unplayable_tiles'
  | 'game_ended_final_scoring'
  | 'player_renamed'
  | 'bot_action_failed'
  | 'legacy';

export type GameLogEvent = {
  key: GameLogKey;
  params: GameLogParams;
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
  logEvents: GameLogEvent[];
  winnerIds: string[];
  gameEnded: boolean;
};

export type ActionResult = {
  ok: boolean;
  error?: string;
  errorKey?: string;
  errorParams?: GameLogParams;
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
