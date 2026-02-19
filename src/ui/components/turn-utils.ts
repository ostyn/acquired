/**
 * Responsibility: Encapsulates turn/phase derived presentation helpers.
 * These helpers convert engine phase data into display-friendly labels and totals.
 */

import { PHASES } from '../../game/constants';

export function actorForPhase(state) {
  if (!state) {
    return null;
  }

  if (state.phase === PHASES.AWAIT_FOUND_CHAIN) {
    return state.pending?.founderId || null;
  }

  if (state.phase === PHASES.AWAIT_MERGER_DISPOSITION) {
    return state.pending?.currentDecisionPlayerId || null;
  }

  return state.currentPlayerId;
}

export function phaseLabel(phase) {
  switch (phase) {
    case PHASES.AWAIT_TILE:
      return 'Place Tile';
    case PHASES.AWAIT_FOUND_CHAIN:
      return 'Choose New Chain';
    case PHASES.AWAIT_MERGER_SURVIVOR:
      return 'Choose Surviving Chain';
    case PHASES.AWAIT_MERGER_DEFUNCT_ORDER:
      return 'Choose Defunct Chain Order';
    case PHASES.AWAIT_MERGER_DISPOSITION:
      return 'Resolve Merger Stock';
    case PHASES.AWAIT_BUY:
      return 'Buy Stock';
    case PHASES.GAME_OVER:
      return 'Game Over';
    case PHASES.LOBBY:
      return 'Lobby';
    default:
      return phase;
  }
}

export function totalStockCount(stocks) {
  if (!stocks || typeof stocks !== 'object') {
    return 0;
  }

  const values = Object.values(stocks) as Array<number | string | null | undefined>;
  let total = 0;
  for (const value of values) {
    total += Number(value) || 0;
  }
  return total;
}

export function turnInstruction(legal, actingPlayerName) {
  if (!legal?.allowed) {
    return 'Waiting for game actions.';
  }

  switch (legal.phase) {
    case PHASES.AWAIT_TILE:
      return legal.isTurn
        ? 'Play one tile. Then proceed to stock buying.'
        : `Waiting for ${actingPlayerName} to place a tile.`;
    case PHASES.AWAIT_FOUND_CHAIN:
      return legal.foundingChoices?.length
        ? 'Select which chain to found.'
        : `Waiting for ${actingPlayerName} to choose a new chain.`;
    case PHASES.AWAIT_MERGER_SURVIVOR:
      return legal.survivorChoices?.length
        ? 'Choose which chain survives this merger.'
        : `Waiting for ${actingPlayerName} to choose the surviving chain.`;
    case PHASES.AWAIT_MERGER_DEFUNCT_ORDER:
      return legal.defunctOrderChoices?.length
        ? 'Choose which tied defunct chain resolves first.'
        : `Waiting for ${actingPlayerName} to choose defunct order.`;
    case PHASES.AWAIT_MERGER_DISPOSITION:
      return legal.mergerDisposition
        ? 'Resolve merger stock: trade, sell, hold, or combine.'
        : `Waiting for ${actingPlayerName} to resolve merger stock.`;
    case PHASES.AWAIT_BUY:
      return legal.isTurn
        ? 'Buy up to 3 shares or pass.'
        : `Waiting for ${actingPlayerName} to buy stock.`;
    default:
      return 'Waiting for game actions.';
  }
}
