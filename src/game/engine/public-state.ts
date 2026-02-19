/**
 * Responsibility: Projects host-authoritative game state into a viewer-safe public model.
 * It redacts private player data and attaches legal actions for the requesting player.
 */

import { SAFE_CHAIN_SIZE } from '../constants';
import { stockPrice } from '../utils';
import { canDeclareGameEnd } from './board';
import { ensureLobbySettings } from './helpers';
import { getLegalActions } from './legal-actions';
import type { GameState } from './types';

function getViewerPlayers(state: GameState, viewerId: string): any[] {
  return state.players.map((player) => {
    const isViewer = player.id === viewerId;
    return {
      id: player.id,
      name: player.name,
      isBot: player.isBot,
      connected: player.connected,
      cash: player.cash,
      stocks: isViewer ? { ...player.stocks } : {},
      tileCount: player.tiles.length,
      tiles: isViewer ? [...player.tiles] : [],
      startTile: player.startTile,
      lastBuy: Array.isArray(player.lastBuy) ? [...player.lastBuy] : null,
    };
  });
}

export function toPublicState(state: GameState, viewerId: string): any {
  const settings = ensureLobbySettings(state);
  const legalActions = getLegalActions(state, viewerId);

  const chains = Object.values(state.hotels).map((hotel) => ({
    id: hotel.id,
    name: hotel.name,
    color: hotel.color,
    tier: hotel.tier,
    active: hotel.active,
    size: hotel.size,
    availableShares: hotel.availableShares,
    price: stockPrice(hotel, hotel.size),
    safe: hotel.size >= SAFE_CHAIN_SIZE,
  }));

  const pending = state.pending
    ? {
        ...state.pending,
      }
    : null;

  return {
    roomId: state.roomId,
    hostId: state.hostId,
    currentPlayerId: state.currentPlayerId,
    phase: state.phase,
    gameEnded: state.gameEnded,
    winnerIds: [...state.winnerIds],
    players: getViewerPlayers(state, viewerId),
    playerOrder: [...state.playerOrder],
    chains,
    board: { ...state.board },
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    pendingEndGameRequest: Boolean(state.requestGameEndAfterBuy),
    settings: {
      ...settings,
    },
    legalActions,
    pending,
    canDeclareGameEnd: canDeclareGameEnd(state),
    log: state.log.slice(-120),
  };
}
