/**
 * Responsibility: Encapsulates board topology and tile playability rules.
 * Includes chain activation/size recalculation and end-game condition checks.
 */

import { GAME_END_SIZE, SAFE_CHAIN_SIZE } from '../constants';
import { getNeighborTiles } from '../utils';
import { ensureLobbySettings, getChain } from './helpers';
import type { GameState } from './types';

export function recalculateSizes(state: GameState): void {
  const counts: Record<string, number> = {};
  for (const chainId of Object.keys(state.hotels)) {
    counts[chainId] = 0;
  }

  for (const chainId of Object.values(state.board)) {
    if (chainId) {
      counts[chainId] += 1;
    }
  }

  for (const chainId of Object.keys(state.hotels)) {
    state.hotels[chainId].size = counts[chainId];
    if (counts[chainId] > 0) {
      state.hotels[chainId].active = true;
    }
  }
}

export function availableInactiveChains(state: GameState): string[] {
  return Object.values(state.hotels)
    .filter((hotel) => !hotel.active)
    .map((hotel) => hotel.id);
}

export function activeChains(state: GameState) {
  return Object.values(state.hotels).filter((hotel) => hotel.active);
}

export function findUnincorporatedCluster(state: GameState, startTile: string): string[] {
  const queue = [startTile];
  const seen = new Set<string>();

  while (queue.length) {
    const tile = queue.pop();
    if (!tile || seen.has(tile)) {
      continue;
    }

    if (!(tile in state.board)) {
      continue;
    }

    if (state.board[tile] !== null) {
      continue;
    }

    seen.add(tile);
    const neighbors = getNeighborTiles(tile);
    for (const neighbor of neighbors) {
      if (!seen.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return [...seen];
}

export function adjacentChainIds(state: GameState, tileId: string): string[] {
  const neighbors = getNeighborTiles(tileId);
  const ids = new Set<string>();

  for (const neighbor of neighbors) {
    const chainId = state.board[neighbor];
    if (chainId) {
      ids.add(chainId);
    }
  }

  return [...ids];
}

export function isSafeChain(state: GameState, chainId: string): boolean {
  const chain = getChain(state, chainId);
  return Boolean(chain && chain.size >= SAFE_CHAIN_SIZE);
}

export function unincorporatedClusterIfPlaced(state: GameState, tileId: string): string[] {
  const alreadyPlaced = tileId in state.board;
  if (!alreadyPlaced) {
    state.board[tileId] = null;
  }

  const cluster = findUnincorporatedCluster(state, tileId);

  if (!alreadyPlaced) {
    delete state.board[tileId];
  }

  return cluster;
}

export function getTilePlayability(state: GameState, tileId: string): string {
  if (tileId in state.board) {
    return 'occupied';
  }

  const touching = adjacentChainIds(state, tileId);
  if (touching.length >= 2) {
    const safeCount = touching.filter((chainId) => isSafeChain(state, chainId)).length;
    if (safeCount >= 2) {
      return 'permanently_unplayable';
    }
    return 'playable';
  }

  if (touching.length === 0) {
    const cluster = unincorporatedClusterIfPlaced(state, tileId);
    const available = availableInactiveChains(state);
    if (cluster.length >= 2 && !available.length) {
      if (ensureLobbySettings(state).allowDeadTilePlacementAsUnincorporated) {
        return 'playable';
      }
      return 'temporarily_unplayable';
    }
  }

  return 'playable';
}

export function isTilePlayable(state: GameState, tileId: string): boolean {
  return getTilePlayability(state, tileId) === 'playable';
}

export function canDeclareGameEnd(state: GameState): boolean {
  const chains = activeChains(state);
  if (!chains.length) {
    return false;
  }

  if (chains.some((chain) => chain.size >= GAME_END_SIZE)) {
    return true;
  }

  return chains.every((chain) => chain.size >= SAFE_CHAIN_SIZE);
}
