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
import { describeBuy, ensureLobbySettings, errorResult, getChain, getPlayer, pushLogEvent } from './helpers';
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
      return errorResult('error.tile_merges_safe_chains_unplayable');
    }
    if (playability === 'temporarily_unplayable') {
      return errorResult('error.tile_creates_eighth_chain_unplayable');
    }
    return errorResult('error.tile_not_playable');
  }

  const handIndex = player.tiles.indexOf(tileId);
  if (handIndex === -1) {
    return errorResult('error.tile_not_in_hand');
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
      pushLogEvent(
        state,
        'player_must_found_chain',
        { playerId: player.id, playerName: player.name },
      );
      return { ok: true };
    }

    if (cluster.length >= 2 && !available.length) {
      if (settings.allowDeadTilePlacementAsUnincorporated) {
        state.phase = PHASES.AWAIT_BUY;
        pushLogEvent(
          state,
          'player_placed_unincorporated_all_active',
          { playerId: player.id, playerName: player.name, tileId },
        );
        return { ok: true };
      }
      delete state.board[tileId];
      player.tiles.push(tileId);
      return errorResult('error.tile_creates_eighth_chain_unplayable');
    }

    state.phase = PHASES.AWAIT_BUY;
    pushLogEvent(
      state,
      'player_placed_unincorporated',
      { playerId: player.id, playerName: player.name, tileId },
    );
    return { ok: true };
  }

  if (touchingChains.length === 1) {
    const chainId = touchingChains[0];
    absorbUnincorporatedInto(state, tileId, chainId);
    recalculateSizes(state);
    state.phase = PHASES.AWAIT_BUY;
    pushLogEvent(
      state,
      'player_grew_chain',
      {
        playerId: player.id,
        playerName: player.name,
        chainId,
        chainName: state.hotels[chainId].name,
        tileId,
      },
    );
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

  pushLogEvent(
    state,
    'player_triggered_merger',
    { playerId: player.id, playerName: player.name, tileId },
  );

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
    return errorResult('error.no_chain_founding_pending');
  }

  if (pending.founderId !== actorId) {
    return errorResult('error.only_active_founder_choose_chain');
  }

  if (!pending.choices.includes(chainId)) {
    return errorResult('error.selected_chain_not_available');
  }

  for (const tile of pending.tiles) {
    state.board[tile] = chainId;
  }

  const chain = getChain(state, chainId);
  if (!chain) {
    return errorResult('error.selected_chain_not_exist');
  }

  chain.active = true;
  recalculateSizes(state);

  const founder = getPlayer(state, actorId);
  if (!founder) {
    return errorResult('error.founder_not_found');
  }

  if (chain.availableShares > 0) {
    founder.stocks[chainId] += 1;
    chain.availableShares -= 1;
    pushLogEvent(
      state,
      'player_founded_chain_free_share',
      {
        playerId: founder.id,
        playerName: founder.name,
        chainId,
        chainName: chain.name,
      },
    );
  } else {
    pushLogEvent(
      state,
      'player_founded_chain',
      {
        playerId: founder.id,
        playerName: founder.name,
        chainId,
        chainName: chain.name,
      },
    );
  }

  state.pending = null;
  state.phase = PHASES.AWAIT_BUY;
  return { ok: true };
}

function resolveMergerSurvivor(state: GameState, actorId: string, chainId: string): ActionResult {
  const pending = state.pending;
  if (!pending || pending.type !== 'merger') {
    return errorResult('error.no_merger_survivor_pending');
  }

  if (state.currentPlayerId !== actorId) {
    return errorResult('error.only_active_player_choose_survivor');
  }

  if (!pending.survivorChoices.includes(chainId)) {
    return errorResult('error.selected_survivor_invalid');
  }

  setSurvivingChainAndAdvance(state, chainId);
  return { ok: true };
}

function resolveMergerDefunctChoice(state: GameState, actorId: string, chainId: string): ActionResult {
  const pending = state.pending;
  if (!pending || pending.type !== 'merger') {
    return errorResult('error.no_merger_defunct_choice_pending');
  }

  if (state.phase !== PHASES.AWAIT_MERGER_DEFUNCT_ORDER) {
    return errorResult('error.defunct_order_not_expected');
  }

  if (state.currentPlayerId !== actorId) {
    return errorResult('error.only_merging_player_choose_defunct_order');
  }

  if (!pending.defunctOrderChoices.includes(chainId)) {
    return errorResult('error.selected_defunct_invalid');
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
    return errorResult('error.no_merger_stock_pending');
  }

  if (state.phase !== PHASES.AWAIT_MERGER_DISPOSITION) {
    return errorResult('error.merger_stock_not_expected');
  }

  if (pending.currentDecisionPlayerId !== actorId) {
    return errorResult('error.not_your_merger_stock_decision');
  }

  const defunctChainId = pending.currentDefunctChainId;
  const survivorChainId = pending.survivingChainId;
  const player = getPlayer(state, actorId);
  const defunct = getChain(state, defunctChainId);
  const survivor = getChain(state, survivorChainId);

  if (!player || !defunct || !survivor) {
    return errorResult('error.merger_state_invalid');
  }

  const owned = player.stocks[defunctChainId] || 0;
  const requestedSell = Number(payload.sell || 0);
  const requestedTradeFrom = Number(payload.tradeFrom || 0);

  if (!Number.isInteger(requestedSell) || requestedSell < 0) {
    return errorResult('error.sell_quantity_non_negative_integer');
  }

  if (!Number.isInteger(requestedTradeFrom) || requestedTradeFrom < 0 || requestedTradeFrom % 2 !== 0) {
    return errorResult('error.trade_quantity_non_negative_even');
  }

  if (requestedSell + requestedTradeFrom > owned) {
    return errorResult('error.cannot_sell_trade_more_than_owned');
  }

  const tradeTo = requestedTradeFrom / 2;
  if (tradeTo > survivor.availableShares) {
    return errorResult('error.not_enough_surviving_shares_for_trade');
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
    return errorResult('error.stock_purchase_not_allowed_now');
  }

  if (state.currentPlayerId !== actorId) {
    return errorResult('error.not_your_turn_buy_stocks');
  }

  const player = getPlayer(state, actorId);
  if (!player) {
    return errorResult('error.player_not_found');
  }

  const purchases = Array.isArray(chains) ? chains : [];

  if (purchases.length > 3) {
    return errorResult('error.max_three_shares_per_turn');
  }

  for (const chainId of purchases) {
    const chain = getChain(state, chainId);
    if (!chain || !chain.active) {
      return errorResult('error.buy_stock_only_active_chains');
    }

    if (chain.availableShares < 1) {
      return errorResult('error.chain_has_no_shares_remaining', { chainName: chain.name });
    }

    const price = stockPrice(chain, chain.size);
    if (player.cash < price) {
      return errorResult('error.insufficient_cash_for_chain', { chainName: chain.name });
    }

    player.cash -= price;
    player.stocks[chainId] += 1;
    chain.availableShares -= 1;
  }

  player.lastBuy = [...purchases];
  if (purchases.length) {
    pushLogEvent(
      state,
      'player_bought_stocks',
      {
        playerId: player.id,
        playerName: player.name,
        chains: describeBuy(purchases),
        chainIds: purchases.join('|'),
      },
    );
  } else {
    pushLogEvent(
      state,
      'player_passed_stock_buying',
      {
        playerId: player.id,
        playerName: player.name,
      },
    );
  }

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
    return errorResult('error.game_is_over');
  }

  switch (payload.type) {
    case 'PLACE_TILE':
      if (state.phase !== PHASES.AWAIT_TILE) {
        return errorResult('error.tile_placement_not_expected');
      }
      if (state.currentPlayerId !== actorId) {
        return errorResult('error.not_your_turn');
      }
      return applyTilePlacement(state, getPlayer(state, actorId), payload.tileId);

    case 'SKIP_TILE': {
      if (state.currentPlayerId !== actorId) {
        return errorResult('error.not_your_turn');
      }
      if (!activePlayerCanSkipTile(state)) {
        return errorResult('error.skip_only_when_all_unplayable');
      }
      const player = getPlayer(state, actorId);
      if (!player) {
        return errorResult('error.player_not_found');
      }
      pushLogEvent(
        state,
        'player_skipped_tile_placement',
        { playerId: player.id, playerName: player.name },
      );
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
        return errorResult('error.only_current_player_declare_end_game');
      }
      if (!canDeclareGameEnd(state)) {
        return errorResult('error.end_game_condition_not_met');
      }
      state.requestGameEndAfterBuy = true;
      const player = getPlayer(state, actorId);
      if (!player) {
        return errorResult('error.player_not_found');
      }
      pushLogEvent(
        state,
        'player_declared_end_game',
        { playerId: player.id, playerName: player.name },
      );
      return { ok: true };
    }

    case 'END_GAME':
      if (state.phase !== PHASES.AWAIT_BUY) {
        return errorResult('error.end_game_only_during_buy_step');
      }
      if (state.currentPlayerId !== actorId) {
        return errorResult('error.only_current_player_end_game');
      }
      if (!canDeclareGameEnd(state)) {
        return errorResult('error.end_game_condition_not_met');
      }
      state.requestGameEndAfterBuy = true;
      return resolveStockPurchase(state, actorId, []);

    default:
      return errorResult('error.unknown_action_type');
  }
}
