/**
 * Responsibility: Computes legal action envelopes for a specific player.
 * It provides phase-specific choices for tile placement, mergers, and buying.
 */

import { PHASES } from '../constants';
import { stockPrice } from '../utils';
import { activeChains, canDeclareGameEnd, isTilePlayable } from './board';
import { getChain, getPlayer } from './helpers';
import type { GameState, LegalActions } from './types';

export function getLegalActions(state: GameState, playerId: string): LegalActions {
  const player = getPlayer(state, playerId);
  if (!player) {
    return { allowed: false };
  }

  if (state.phase === PHASES.LOBBY || state.phase === PHASES.GAME_OVER) {
    return {
      allowed: false,
      phase: state.phase,
      canEndGame: false,
    };
  }

  const legal: LegalActions = {
    allowed: true,
    phase: state.phase,
    isTurn: state.currentPlayerId === playerId,
    canEndGame: canDeclareGameEnd(state) && state.currentPlayerId === playerId,
    playableTiles: [],
    foundingChoices: [],
    survivorChoices: [],
    defunctOrderChoices: [],
    mergerDisposition: null,
    buyableChains: [],
    canSkipTile: false,
  };

  if (state.phase === PHASES.AWAIT_TILE && state.currentPlayerId === playerId) {
    legal.playableTiles = player.tiles.filter((tileId) => isTilePlayable(state, tileId));
    legal.canSkipTile = legal.playableTiles.length === 0;
  }

  if (state.phase === PHASES.AWAIT_FOUND_CHAIN && state.pending?.founderId === playerId) {
    legal.foundingChoices = [...state.pending.choices];
  }

  if (state.phase === PHASES.AWAIT_MERGER_SURVIVOR && state.currentPlayerId === playerId) {
    legal.survivorChoices = [...state.pending.survivorChoices];
  }

  if (state.phase === PHASES.AWAIT_MERGER_DEFUNCT_ORDER && state.currentPlayerId === playerId) {
    legal.defunctOrderChoices = [...state.pending.defunctOrderChoices];
  }

  if (state.phase === PHASES.AWAIT_MERGER_DISPOSITION && state.pending?.currentDecisionPlayerId === playerId) {
    const defunct = getChain(state, state.pending.currentDefunctChainId);
    const survivor = getChain(state, state.pending.survivingChainId);

    if (defunct && survivor) {
      const owned = player.stocks[state.pending.currentDefunctChainId] || 0;
      const maxTradeFromRaw = Math.min(owned, survivor.availableShares * 2);
      const maxTradeFrom = maxTradeFromRaw - (maxTradeFromRaw % 2);

      legal.mergerDisposition = {
        defunctChainId: defunct.id,
        defunctName: defunct.name,
        survivingChainId: survivor.id,
        survivingName: survivor.name,
        owned,
        maxSell: owned,
        maxTradeFrom,
        tradeUnit: 2,
        defunctPrice: stockPrice(defunct, defunct.size),
      };
    }
  }

  if (state.phase === PHASES.AWAIT_BUY && state.currentPlayerId === playerId) {
    legal.buyableChains = activeChains(state)
      .map((chain) => {
        const price = stockPrice(chain, chain.size);
        const affordable = price > 0 ? Math.floor(player.cash / price) : 0;
        return {
          chainId: chain.id,
          name: chain.name,
          availableShares: chain.availableShares,
          price,
          maxBuy: Math.max(0, Math.min(3, chain.availableShares, affordable)),
        };
      })
      .filter((entry) => entry.maxBuy > 0);
  }

  return legal;
}
