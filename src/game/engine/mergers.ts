/**
 * Responsibility: Handles merger resolution flow and stock-bonus payout mechanics.
 * This module progresses defunct-chain handling and survivor absorption sequencing.
 */

import { PHASES } from '../constants';
import { minorityBonus, stockPrice } from '../utils';
import { getChain, getPlayer, orderedFrom } from './helpers';
import { findUnincorporatedCluster, recalculateSizes } from './board';
import type { GameState } from './types';

function majorityBonus(chain, size) {
  return stockPrice(chain, size) * 10;
}

export function payoutBonuses(state: GameState, chainId: string): void {
  const chain = getChain(state, chainId);
  if (!chain || !chain.active || chain.size < 2) {
    return;
  }

  const holdings = state.players
    .map((player) => ({
      player,
      shares: player.stocks[chainId] || 0,
    }))
    .filter(({ shares }) => shares > 0)
    .sort((left, right) => right.shares - left.shares);

  if (!holdings.length) {
    return;
  }

  const major = majorityBonus(chain, chain.size);
  const minor = minorityBonus(chain, chain.size);

  const highest = holdings[0].shares;
  const majority = holdings.filter((entry) => entry.shares === highest);

  if (majority.length > 1) {
    const split = Math.floor((major + minor) / majority.length / 100) * 100;
    for (const entry of majority) {
      entry.player.cash += split;
      state.log.push(`${entry.player.name} receives $${split} tied majority/minority for ${chain.name}.`);
    }
    return;
  }

  majority[0].player.cash += major;
  state.log.push(`${majority[0].player.name} receives $${major} majority bonus for ${chain.name}.`);

  const secondHighest = holdings.find((entry) => entry.shares < highest);
  if (!secondHighest) {
    majority[0].player.cash += minor;
    state.log.push(`${majority[0].player.name} also receives $${minor} minority bonus for ${chain.name}.`);
    return;
  }

  const minority = holdings.filter((entry) => entry.shares === secondHighest.shares);
  const split = Math.floor(minor / minority.length / 100) * 100;
  for (const entry of minority) {
    entry.player.cash += split;
    state.log.push(`${entry.player.name} receives $${split} minority bonus for ${chain.name}.`);
  }
}

function deactivateChain(state: GameState, chainId: string): void {
  state.hotels[chainId].active = false;
  state.hotels[chainId].size = 0;
}

export function absorbUnincorporatedInto(state: GameState, originTile: string, chainId: string): void {
  const cluster = findUnincorporatedCluster(state, originTile);
  for (const tile of cluster) {
    state.board[tile] = chainId;
  }
}

export function finishCurrentDefunctChain(state: GameState): void {
  const pending = state.pending;
  const defunctChainId = pending.currentDefunctChainId;
  const survivorId = pending.survivingChainId;

  for (const tile of Object.keys(state.board)) {
    if (state.board[tile] === defunctChainId) {
      state.board[tile] = survivorId;
    }
  }

  deactivateChain(state, defunctChainId);
  pending.currentDefunctChainId = null;
  pending.currentDecisionPlayerId = null;
  pending.decisionPlayerIndex = 0;
  pending.decisionOrder = [];
  pending.defunctOrderChoices = [];
}

export function beginCurrentDefunctResolution(state: GameState): void {
  const pending = state.pending;
  const defunctChainId = pending.currentDefunctChainId;
  pending.decisionOrder = orderedFrom(state, state.currentPlayerId);
  pending.decisionPlayerIndex = 0;

  const chain = getChain(state, defunctChainId);
  const survivor = getChain(state, pending.survivingChainId);

  if (!chain || !survivor) {
    finishCurrentDefunctChain(state);
    advanceMergerStep(state);
    return;
  }

  payoutBonuses(state, defunctChainId);

  while (pending.decisionPlayerIndex < pending.decisionOrder.length) {
    const playerId = pending.decisionOrder[pending.decisionPlayerIndex];
    const player = getPlayer(state, playerId);
    const shares = player ? player.stocks[defunctChainId] : 0;
    if (shares > 0) {
      pending.currentDecisionPlayerId = playerId;
      state.phase = PHASES.AWAIT_MERGER_DISPOSITION;
      return;
    }
    pending.decisionPlayerIndex += 1;
  }

  finishCurrentDefunctChain(state);
  advanceMergerStep(state);
}

export function advanceMergerStep(state: GameState): void {
  const pending = state.pending;

  if (!pending.remainingDefunctChainIds.length && !pending.currentDefunctChainId) {
    for (const tile of pending.absorbTiles) {
      state.board[tile] = pending.survivingChainId;
    }
    recalculateSizes(state);
    state.pending = null;
    state.phase = PHASES.AWAIT_BUY;
    return;
  }

  if (!pending.currentDefunctChainId) {
    const remaining = pending.remainingDefunctChainIds;
    const largestDefunctSize = Math.max(...remaining.map((chainId) => state.hotels[chainId].size));
    const choices = remaining.filter((chainId) => state.hotels[chainId].size === largestDefunctSize);

    if (choices.length > 1) {
      pending.defunctOrderChoices = [...choices];
      state.phase = PHASES.AWAIT_MERGER_DEFUNCT_ORDER;
      return;
    }

    const chosenChainId = choices[0];
    pending.currentDefunctChainId = chosenChainId;
    pending.remainingDefunctChainIds = remaining.filter((chainId) => chainId !== chosenChainId);
    pending.defunctOrderChoices = [];
  }

  beginCurrentDefunctResolution(state);
}

export function setSurvivingChainAndAdvance(state: GameState, chainId: string): void {
  const pending = state.pending;
  pending.survivingChainId = chainId;

  pending.remainingDefunctChainIds = pending.adjacentChains.filter((id) => id !== chainId);
  pending.defunctOrderChoices = [];
  pending.currentDefunctChainId = null;
  pending.currentDecisionPlayerId = null;
  pending.decisionOrder = [];
  pending.decisionPlayerIndex = 0;
  advanceMergerStep(state);
}
