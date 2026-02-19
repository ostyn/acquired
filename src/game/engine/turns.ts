/**
 * Responsibility: Handles turn progression and end-of-game settlement.
 * Includes tile replacement for dead hands and final liquidation scoring.
 */

import { HAND_SIZE, HOTELS, PHASES } from '../constants';
import { stockPrice } from '../utils';
import { activeChains, getTilePlayability } from './board';
import { drawTiles, getPlayer } from './helpers';
import { payoutBonuses } from './mergers';
import type { GameState, PlayerState } from './types';

export function replaceDeadTilesIfNeeded(state: GameState, player: PlayerState | null): void {
  if (!player) {
    return;
  }

  let guard = 0;
  while (guard < 5) {
    guard += 1;

    const playable = player.tiles.filter((tileId) => getTilePlayability(state, tileId) === 'playable');
    if (playable.length) {
      return;
    }

    const deadTiles = player.tiles.filter((tileId) => getTilePlayability(state, tileId) === 'permanently_unplayable');
    if (!deadTiles.length || !state.drawPile.length) {
      return;
    }

    player.tiles = player.tiles.filter((tileId) => !deadTiles.includes(tileId));
    state.discardPile.push(...deadTiles);
    drawTiles(state, player, deadTiles.length);
    state.log.push(`${player.name} replaces ${deadTiles.length} unplayable tile(s).`);
  }
}

export function advanceTurn(state: GameState): void {
  const current = getPlayer(state, state.currentPlayerId);
  if (current) {
    drawTiles(state, current, HAND_SIZE - current.tiles.length);
  }

  const currentIndex = state.playerOrder.indexOf(state.currentPlayerId || '');
  const nextIndex = (currentIndex + 1) % state.playerOrder.length;
  state.currentPlayerId = state.playerOrder[nextIndex];
  state.phase = PHASES.AWAIT_TILE;
  state.pending = null;
  state.requestGameEndAfterBuy = false;

  const nextPlayer = getPlayer(state, state.currentPlayerId);
  replaceDeadTilesIfNeeded(state, nextPlayer);
}

export function finalizeGame(state: GameState): void {
  for (const chain of activeChains(state)) {
    payoutBonuses(state, chain.id);
  }

  for (const player of state.players) {
    for (const chain of HOTELS) {
      const shares = player.stocks[chain.id] || 0;
      if (!shares) {
        continue;
      }

      const hotel = state.hotels[chain.id];
      const price = stockPrice(hotel, hotel.size);
      player.cash += shares * price;
      player.stocks[chain.id] = 0;
      hotel.availableShares += shares;
    }
  }

  const highest = Math.max(...state.players.map((player) => player.cash));
  state.winnerIds = state.players.filter((player) => player.cash === highest).map((player) => player.id);
  state.phase = PHASES.GAME_OVER;
  state.gameEnded = true;
  state.log.push('Game ended and final scoring complete.');
}
