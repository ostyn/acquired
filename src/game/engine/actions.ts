/**
 * Responsibility: Applies player actions and phase transitions for active games.
 * Includes tile placement, mergers, stock buying, and end-game declaration handling.
 */

import { PHASES } from '../constants';
import { stockPrice } from '../utils';
import {
  adjacentChainIds,
  availableInactiveChains,
  canDeclareGameEnd,
  findUnincorporatedCluster,
  getTilePlayability,
  isTilePlayable,
  recalculateSizes,
} from './board';
import { describeBuy, ensureLobbySettings, getChain, getPlayer } from './helpers';
import {
  absorbUnincorporatedInto,
  advanceMergerStep,
  beginCurrentDefunctResolution,
  finishCurrentDefunctChain,
  setSurvivingChainAndAdvance,
} from './mergers';
import { advanceTurn, finalizeGame } from './turns';
import type { ActionResult, GameState } from './types';

function applyTilePlacement(state: GameState, player, tileId: string): ActionResult {
  const settings = ensureLobbySettings(state);
  const playability = getTilePlayability(state, tileId);
  if (playability !== 'playable') {
    if (playability === 'permanently_unplayable') {
      return { ok: false, error: 'This tile would merge two safe chains and is permanently unplayable.' };
    }
    if (playability === 'temporarily_unplayable') {
      return { ok: false, error: 'This tile would create an eighth chain and is temporarily unplayable.' };
    }
    return { ok: false, error: 'Tile is not playable.' };
  }

  const handIndex = player.tiles.indexOf(tileId);
  if (handIndex === -1) {
    return { ok: false, error: 'Tile is not in your hand.' };
  }

  player.tiles.splice(handIndex, 1);
  state.board[tileId] = null;

  const touchingChains = adjacentChainIds(state, tileId);

  if (touchingChains.length === 0) {
    const cluster = findUnincorporatedCluster(state, tileId);
    const available = availableInactiveChains(state);
    if (cluster.length >= 2 && available.length) {
      state.pending = {
        type: 'found_chain',
        founderId: player.id,
        tileId,
        tiles: cluster,
        choices: available,
      };
      state.phase = PHASES.AWAIT_FOUND_CHAIN;
      state.log.push(`${player.name} must found a new chain.`);
      return { ok: true };
    }

    if (cluster.length >= 2 && !available.length) {
      if (settings.allowDeadTilePlacementAsUnincorporated) {
        state.phase = PHASES.AWAIT_BUY;
        state.log.push(`${player.name} places ${tileId} as unincorporated (all chains already active).`);
        return { ok: true };
      }
      delete state.board[tileId];
      player.tiles.push(tileId);
      return { ok: false, error: 'This tile would create an eighth chain and is temporarily unplayable.' };
    }

    state.phase = PHASES.AWAIT_BUY;
    state.log.push(`${player.name} places ${tileId} as unincorporated.`);
    return { ok: true };
  }

  if (touchingChains.length === 1) {
    const chainId = touchingChains[0];
    absorbUnincorporatedInto(state, tileId, chainId);
    recalculateSizes(state);
    state.phase = PHASES.AWAIT_BUY;
    state.log.push(`${player.name} grows ${state.hotels[chainId].name} with ${tileId}.`);
    return { ok: true };
  }

  const largestSize = Math.max(...touchingChains.map((chainId) => state.hotels[chainId].size));
  const survivors = touchingChains.filter((chainId) => state.hotels[chainId].size === largestSize);

  state.pending = {
    type: 'merger',
    tileId,
    adjacentChains: touchingChains,
    survivorChoices: survivors,
    survivingChainId: null,
    absorbTiles: findUnincorporatedCluster(state, tileId),
    remainingDefunctChainIds: [],
    defunctOrderChoices: [],
    currentDefunctChainId: null,
    decisionOrder: [],
    decisionPlayerIndex: 0,
    currentDecisionPlayerId: null,
  };

  state.log.push(`${player.name} triggers a merger with ${tileId}.`);

  if (survivors.length === 1) {
    setSurvivingChainAndAdvance(state, survivors[0]);
  } else {
    state.phase = PHASES.AWAIT_MERGER_SURVIVOR;
  }

  return { ok: true };
}

function resolveFoundChain(state: GameState, actorId: string, chainId: string): ActionResult {
  const pending = state.pending;
  if (!pending || pending.type !== 'found_chain') {
    return { ok: false, error: 'No chain founding decision is pending.' };
  }

  if (pending.founderId !== actorId) {
    return { ok: false, error: 'Only the active founder can choose the chain.' };
  }

  if (!pending.choices.includes(chainId)) {
    return { ok: false, error: 'Selected chain is not available.' };
  }

  for (const tile of pending.tiles) {
    state.board[tile] = chainId;
  }

  const chain = getChain(state, chainId);
  if (!chain) {
    return { ok: false, error: 'Selected chain does not exist.' };
  }

  chain.active = true;
  recalculateSizes(state);

  const founder = getPlayer(state, actorId);
  if (!founder) {
    return { ok: false, error: 'Founder not found.' };
  }

  if (chain.availableShares > 0) {
    founder.stocks[chainId] += 1;
    chain.availableShares -= 1;
    state.log.push(`${founder.name} founds ${chain.name} and takes 1 free share.`);
  } else {
    state.log.push(`${founder.name} founds ${chain.name}.`);
  }

  state.pending = null;
  state.phase = PHASES.AWAIT_BUY;
  return { ok: true };
}

function resolveMergerSurvivor(state: GameState, actorId: string, chainId: string): ActionResult {
  const pending = state.pending;
  if (!pending || pending.type !== 'merger') {
    return { ok: false, error: 'No merger survivor decision is pending.' };
  }

  if (state.currentPlayerId !== actorId) {
    return { ok: false, error: 'Only the active player may choose the survivor.' };
  }

  if (!pending.survivorChoices.includes(chainId)) {
    return { ok: false, error: 'Selected survivor is not valid.' };
  }

  setSurvivingChainAndAdvance(state, chainId);
  return { ok: true };
}

function resolveMergerDefunctChoice(state: GameState, actorId: string, chainId: string): ActionResult {
  const pending = state.pending;
  if (!pending || pending.type !== 'merger') {
    return { ok: false, error: 'No merger defunct-chain choice is pending.' };
  }

  if (state.phase !== PHASES.AWAIT_MERGER_DEFUNCT_ORDER) {
    return { ok: false, error: 'Defunct-chain order is not expected right now.' };
  }

  if (state.currentPlayerId !== actorId) {
    return { ok: false, error: 'Only the merging player may choose defunct-chain order.' };
  }

  if (!pending.defunctOrderChoices.includes(chainId)) {
    return { ok: false, error: 'Selected defunct chain is not valid.' };
  }

  pending.currentDefunctChainId = chainId;
  pending.remainingDefunctChainIds = pending.remainingDefunctChainIds.filter((id) => id !== chainId);
  pending.defunctOrderChoices = [];
  beginCurrentDefunctResolution(state);
  return { ok: true };
}

function resolveMergerDisposition(state: GameState, actorId: string, payload: any): ActionResult {
  const pending = state.pending;
  if (!pending || pending.type !== 'merger') {
    return { ok: false, error: 'No merger stock decision is pending.' };
  }

  if (state.phase !== PHASES.AWAIT_MERGER_DISPOSITION) {
    return { ok: false, error: 'Merger stock decisions are not expected right now.' };
  }

  if (pending.currentDecisionPlayerId !== actorId) {
    return { ok: false, error: 'It is not your merger stock decision.' };
  }

  const defunctChainId = pending.currentDefunctChainId;
  const survivorChainId = pending.survivingChainId;
  const player = getPlayer(state, actorId);
  const defunct = getChain(state, defunctChainId);
  const survivor = getChain(state, survivorChainId);

  if (!player || !defunct || !survivor) {
    return { ok: false, error: 'Merger state is invalid.' };
  }

  const owned = player.stocks[defunctChainId] || 0;
  const requestedSell = Number(payload.sell || 0);
  const requestedTradeFrom = Number(payload.tradeFrom || 0);

  if (!Number.isInteger(requestedSell) || requestedSell < 0) {
    return { ok: false, error: 'Sell quantity must be a non-negative integer.' };
  }

  if (!Number.isInteger(requestedTradeFrom) || requestedTradeFrom < 0 || requestedTradeFrom % 2 !== 0) {
    return { ok: false, error: 'Trade quantity must be a non-negative even integer.' };
  }

  if (requestedSell + requestedTradeFrom > owned) {
    return { ok: false, error: 'You cannot sell/trade more shares than you own.' };
  }

  const tradeTo = requestedTradeFrom / 2;
  if (tradeTo > survivor.availableShares) {
    return { ok: false, error: 'Bank does not have enough surviving shares for this trade.' };
  }

  if (requestedSell > 0) {
    const price = stockPrice(defunct, defunct.size);
    player.cash += requestedSell * price;
    player.stocks[defunctChainId] -= requestedSell;
    defunct.availableShares += requestedSell;
  }

  if (requestedTradeFrom > 0) {
    player.stocks[defunctChainId] -= requestedTradeFrom;
    defunct.availableShares += requestedTradeFrom;
    player.stocks[survivorChainId] += tradeTo;
    survivor.availableShares -= tradeTo;
  }

  pending.decisionPlayerIndex += 1;

  while (pending.decisionPlayerIndex < pending.decisionOrder.length) {
    const nextPlayerId = pending.decisionOrder[pending.decisionPlayerIndex];
    const nextPlayer = getPlayer(state, nextPlayerId);
    if (nextPlayer && (nextPlayer.stocks[defunctChainId] || 0) > 0) {
      pending.currentDecisionPlayerId = nextPlayerId;
      return { ok: true };
    }
    pending.decisionPlayerIndex += 1;
  }

  finishCurrentDefunctChain(state);
  advanceMergerStep(state);
  return { ok: true };
}

function resolveStockPurchase(state: GameState, actorId: string, chains: string[]): ActionResult {
  if (state.phase !== PHASES.AWAIT_BUY) {
    return { ok: false, error: 'Stock purchases are not allowed right now.' };
  }

  if (state.currentPlayerId !== actorId) {
    return { ok: false, error: 'It is not your turn to buy stocks.' };
  }

  const player = getPlayer(state, actorId);
  if (!player) {
    return { ok: false, error: 'Player not found.' };
  }

  const purchases = Array.isArray(chains) ? chains : [];

  if (purchases.length > 3) {
    return { ok: false, error: 'You may buy at most 3 shares per turn.' };
  }

  for (const chainId of purchases) {
    const chain = getChain(state, chainId);
    if (!chain || !chain.active) {
      return { ok: false, error: 'You can only buy stock in active chains.' };
    }

    if (chain.availableShares < 1) {
      return { ok: false, error: `${chain.name} has no shares remaining.` };
    }

    const price = stockPrice(chain, chain.size);
    if (player.cash < price) {
      return { ok: false, error: `Insufficient cash to buy ${chain.name}.` };
    }

    player.cash -= price;
    player.stocks[chainId] += 1;
    chain.availableShares -= 1;
  }

  player.lastBuy = [...purchases];
  state.log.push(`${player.name} ${purchases.length ? `buys ${describeBuy(purchases)}.` : 'passes stock buying.'}`);

  if (canDeclareGameEnd(state) && state.requestGameEndAfterBuy) {
    finalizeGame(state);
    return { ok: true };
  }

  advanceTurn(state);
  return { ok: true };
}

function activePlayerCanSkipTile(state: GameState): boolean {
  if (state.phase !== PHASES.AWAIT_TILE) {
    return false;
  }

  const player = getPlayer(state, state.currentPlayerId);
  if (!player) {
    return false;
  }

  return player.tiles.every((tileId) => !isTilePlayable(state, tileId));
}

export function getExpectedActorId(state: GameState): string | null {
  if (state.phase === PHASES.AWAIT_MERGER_DISPOSITION) {
    return state.pending?.currentDecisionPlayerId || null;
  }

  if (state.phase === PHASES.AWAIT_FOUND_CHAIN) {
    return state.pending?.founderId || null;
  }

  if (state.phase === PHASES.AWAIT_MERGER_DEFUNCT_ORDER) {
    return state.currentPlayerId;
  }

  return state.currentPlayerId;
}

export function applyAction(state: GameState, actorId: string, action: any): ActionResult {
  const payload = action || {};

  if (state.phase === PHASES.GAME_OVER) {
    return { ok: false, error: 'Game is over.' };
  }

  switch (payload.type) {
    case 'PLACE_TILE':
      if (state.phase !== PHASES.AWAIT_TILE) {
        return { ok: false, error: 'Tile placement is not expected right now.' };
      }
      if (state.currentPlayerId !== actorId) {
        return { ok: false, error: 'It is not your turn.' };
      }
      return applyTilePlacement(state, getPlayer(state, actorId), payload.tileId);

    case 'SKIP_TILE': {
      if (state.currentPlayerId !== actorId) {
        return { ok: false, error: 'It is not your turn.' };
      }
      if (!activePlayerCanSkipTile(state)) {
        return { ok: false, error: 'You can only skip when all of your tiles are unplayable.' };
      }
      const player = getPlayer(state, actorId);
      if (!player) {
        return { ok: false, error: 'Player not found.' };
      }
      state.log.push(`${player.name} skips tile placement.`);
      state.phase = PHASES.AWAIT_BUY;
      return { ok: true };
    }

    case 'CHOOSE_FOUNDING_CHAIN':
      return resolveFoundChain(state, actorId, payload.chainId);

    case 'CHOOSE_MERGER_SURVIVOR':
      return resolveMergerSurvivor(state, actorId, payload.chainId);

    case 'CHOOSE_MERGER_DEFUNCT_CHAIN':
      return resolveMergerDefunctChoice(state, actorId, payload.chainId);

    case 'RESOLVE_MERGER_STOCK':
      return resolveMergerDisposition(state, actorId, payload);

    case 'BUY_STOCKS':
      state.requestGameEndAfterBuy = state.requestGameEndAfterBuy || Boolean(payload.endGame);
      return resolveStockPurchase(state, actorId, payload.chains);

    case 'DECLARE_END_GAME': {
      if (state.currentPlayerId !== actorId) {
        return { ok: false, error: 'Only the current player can declare end game.' };
      }
      if (!canDeclareGameEnd(state)) {
        return { ok: false, error: 'End-game condition is not currently met.' };
      }
      state.requestGameEndAfterBuy = true;
      const player = getPlayer(state, actorId);
      if (!player) {
        return { ok: false, error: 'Player not found.' };
      }
      state.log.push(`${player.name} declares end game after this turn.`);
      return { ok: true };
    }

    case 'END_GAME':
      if (state.phase !== PHASES.AWAIT_BUY) {
        return { ok: false, error: 'You may only end the game during your buy step.' };
      }
      if (state.currentPlayerId !== actorId) {
        return { ok: false, error: 'Only the current player can end the game.' };
      }
      if (!canDeclareGameEnd(state)) {
        return { ok: false, error: 'End-game condition is not currently met.' };
      }
      state.requestGameEndAfterBuy = true;
      return resolveStockPurchase(state, actorId, []);

    default:
      return { ok: false, error: 'Unknown action type.' };
  }
}
