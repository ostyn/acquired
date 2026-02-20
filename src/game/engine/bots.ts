/**
 * Responsibility: Selects bot actions from legal moves.
 * Provides both random and Monte Carlo bot policies with a shared selector.
 */

import { PHASES } from '../constants';
import { randomChoice, shuffle, stockPrice } from '../utils';
import { applyAction, getExpectedActorId } from './actions';
import { getPlayer } from './helpers';
import { getLegalActions } from './legal-actions';
import type { GameState } from './types';

const ROOT_ACTION_CAP = 24;
const ROLLOUT_BUDGET = 64;
const MAX_ROLLOUT_STEPS = 80;

export const BOT_STRATEGIES = {
  RANDOM: 'random',
  MONTE_CARLO: 'monte_carlo',
} as const;

export type BotStrategy = (typeof BOT_STRATEGIES)[keyof typeof BOT_STRATEGIES];

export function chooseRandomBotAction(state: GameState, botId: string, rng: () => number = Math.random): any {
  return chooseRandomActionForActor(state, botId, rng);
}

export function chooseMonteCarloBotAction(state: GameState, botId: string, rng: () => number = Math.random): any {
  const legal = getLegalActions(state, botId);
  if (!legal.allowed) {
    return null;
  }

  const candidateActions = capRootActions(buildCandidateActions(state, botId), rng);
  if (!candidateActions.length) {
    return chooseRandomActionForActor(state, botId, rng);
  }

  if (candidateActions.length === 1) {
    return candidateActions[0];
  }

  const simulationsPerAction = Math.max(1, Math.floor(ROLLOUT_BUDGET / candidateActions.length));
  let bestAction = candidateActions[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestTieBreaker = tieBreakerScore(bestAction);

  for (const action of candidateActions) {
    let totalScore = 0;
    for (let index = 0; index < simulationsPerAction; index += 1) {
      totalScore += evaluateAction(state, botId, action, rng);
    }
    const averageScore = totalScore / simulationsPerAction;
    const tieBreaker = tieBreakerScore(action);

    if (averageScore > bestScore || (averageScore === bestScore && tieBreaker > bestTieBreaker)) {
      bestScore = averageScore;
      bestTieBreaker = tieBreaker;
      bestAction = action;
    }
  }

  return bestAction;
}

export function chooseBotAction(
  state: GameState,
  botId: string,
  strategy: BotStrategy = BOT_STRATEGIES.MONTE_CARLO,
  rng: () => number = Math.random,
): any {
  if (strategy === BOT_STRATEGIES.RANDOM) {
    return chooseRandomBotAction(state, botId, rng);
  }
  return chooseMonteCarloBotAction(state, botId, rng);
}

function chooseRandomActionForActor(state: GameState, actorId: string, rng: () => number = Math.random): any {
  const legal = getLegalActions(state, actorId);
  if (!legal.allowed) {
    return null;
  }

  switch (legal.phase) {
    case PHASES.AWAIT_TILE:
      if (legal.playableTiles.length) {
        return {
          type: 'PLACE_TILE',
          tileId: randomChoice(legal.playableTiles, rng),
        };
      }
      if (legal.canSkipTile) {
        return { type: 'SKIP_TILE' };
      }
      return null;

    case PHASES.AWAIT_FOUND_CHAIN:
      if (legal.foundingChoices.length) {
        return {
          type: 'CHOOSE_FOUNDING_CHAIN',
          chainId: randomChoice(legal.foundingChoices, rng),
        };
      }
      return null;

    case PHASES.AWAIT_MERGER_SURVIVOR:
      if (legal.survivorChoices.length) {
        return {
          type: 'CHOOSE_MERGER_SURVIVOR',
          chainId: randomChoice(legal.survivorChoices, rng),
        };
      }
      return null;

    case PHASES.AWAIT_MERGER_DEFUNCT_ORDER:
      if (legal.defunctOrderChoices.length) {
        return {
          type: 'CHOOSE_MERGER_DEFUNCT_CHAIN',
          chainId: randomChoice(legal.defunctOrderChoices, rng),
        };
      }
      return null;

    case PHASES.AWAIT_MERGER_DISPOSITION: {
      if (!legal.mergerDisposition) {
        return null;
      }
      const maxTradeFrom = legal.mergerDisposition.maxTradeFrom;
      const evenChoices: number[] = [];
      for (let value = 0; value <= maxTradeFrom; value += 2) {
        evenChoices.push(value);
      }
      const tradeFrom = randomChoice(evenChoices, rng) || 0;
      const remaining = legal.mergerDisposition.owned - tradeFrom;
      const sell = remaining > 0 ? Math.floor(rng() * (remaining + 1)) : 0;
      return {
        type: 'RESOLVE_MERGER_STOCK',
        tradeFrom,
        sell,
      };
    }

    case PHASES.AWAIT_BUY: {
      const shouldEndAfterBuy = legal.canEndGame && rng() < 0.15;
      const purchases: string[] = [];
      const temporaryAvailability = Object.fromEntries(legal.buyableChains.map((entry) => [entry.chainId, entry.availableShares]));
      let cash = getPlayer(state, actorId)?.cash ?? 0;

      for (let index = 0; index < 3; index += 1) {
        const affordable = legal.buyableChains.filter((entry) => temporaryAvailability[entry.chainId] > 0 && entry.price <= cash);
        if (!affordable.length) {
          break;
        }
        if (purchases.length > 0 && rng() < 0.35) {
          break;
        }

        const choice = randomChoice(affordable, rng);
        purchases.push(choice.chainId);
        temporaryAvailability[choice.chainId] -= 1;
        cash -= choice.price;
      }

      return {
        type: 'BUY_STOCKS',
        chains: purchases,
        endGame: shouldEndAfterBuy,
      };
    }

    default:
      return null;
  }
}

function buildCandidateActions(state: GameState, actorId: string): any[] {
  const legal = getLegalActions(state, actorId);
  if (!legal.allowed) {
    return [];
  }

  switch (legal.phase) {
    case PHASES.AWAIT_TILE: {
      const actions: any[] = legal.playableTiles.map((tileId) => ({
        type: 'PLACE_TILE',
        tileId,
      }));
      if (legal.canSkipTile) {
        actions.push({ type: 'SKIP_TILE' });
      }
      return actions;
    }

    case PHASES.AWAIT_FOUND_CHAIN:
      return legal.foundingChoices.map((chainId) => ({
        type: 'CHOOSE_FOUNDING_CHAIN',
        chainId,
      }));

    case PHASES.AWAIT_MERGER_SURVIVOR:
      return legal.survivorChoices.map((chainId) => ({
        type: 'CHOOSE_MERGER_SURVIVOR',
        chainId,
      }));

    case PHASES.AWAIT_MERGER_DEFUNCT_ORDER:
      return legal.defunctOrderChoices.map((chainId) => ({
        type: 'CHOOSE_MERGER_DEFUNCT_CHAIN',
        chainId,
      }));

    case PHASES.AWAIT_MERGER_DISPOSITION:
      return buildMergerDispositionCandidates(legal.mergerDisposition);

    case PHASES.AWAIT_BUY:
      return buildBuyCandidates(state, actorId, legal);

    default:
      return [];
  }
}

function buildMergerDispositionCandidates(disposition): any[] {
  if (!disposition) {
    return [];
  }

  const actions: any[] = [];
  const unit = Math.max(2, Number(disposition.tradeUnit || 2));
  const maxTradeFrom = Math.max(0, Number(disposition.maxTradeFrom || 0));
  const owned = Math.max(0, Number(disposition.owned || 0));

  for (let tradeFrom = 0; tradeFrom <= maxTradeFrom; tradeFrom += unit) {
    const remaining = Math.max(0, owned - tradeFrom);
    actions.push({
      type: 'RESOLVE_MERGER_STOCK',
      tradeFrom,
      sell: 0,
    });

    if (remaining > 0) {
      actions.push({
        type: 'RESOLVE_MERGER_STOCK',
        tradeFrom,
        sell: remaining,
      });
    }
  }

  if (!actions.length) {
    actions.push({
      type: 'RESOLVE_MERGER_STOCK',
      tradeFrom: 0,
      sell: 0,
    });
  }

  return dedupeActions(actions);
}

function buildBuyCandidates(state: GameState, actorId: string, legal): any[] {
  const player = getPlayer(state, actorId);
  if (!player) {
    return [];
  }

  const buyable = [...(legal.buyableChains || [])]
    .filter((entry) => entry.maxBuy > 0 && entry.availableShares > 0 && entry.price > 0)
    .sort((left, right) => left.chainId.localeCompare(right.chainId));

  const combos: string[][] = [];
  const current: string[] = [];
  const counts: Record<string, number> = {};

  function visit(startIndex: number, remainingBuys: number, cashLeft: number) {
    combos.push([...current]);
    if (remainingBuys === 0) {
      return;
    }

    for (let index = startIndex; index < buyable.length; index += 1) {
      const option = buyable[index];
      const currentCount = counts[option.chainId] || 0;
      if (currentCount >= option.maxBuy || currentCount >= option.availableShares) {
        continue;
      }
      if (option.price > cashLeft) {
        continue;
      }

      counts[option.chainId] = currentCount + 1;
      current.push(option.chainId);
      visit(index, remainingBuys - 1, cashLeft - option.price);
      current.pop();

      if (currentCount === 0) {
        delete counts[option.chainId];
      } else {
        counts[option.chainId] = currentCount;
      }
    }
  }

  visit(0, 3, player.cash);

  const actions: any[] = [];
  for (const chains of combos) {
    actions.push({
      type: 'BUY_STOCKS',
      chains,
      endGame: false,
    });
    if (legal.canEndGame) {
      actions.push({
        type: 'BUY_STOCKS',
        chains,
        endGame: true,
      });
    }
  }

  return dedupeActions(actions);
}

function dedupeActions(actions: any[]): any[] {
  const seen = new Set<string>();
  const deduped: any[] = [];

  for (const action of actions) {
    const key = actionSignature(action);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(action);
  }

  return deduped;
}

function actionSignature(action: any): string {
  const payload = action || {};
  switch (payload.type) {
    case 'PLACE_TILE':
      return `PLACE_TILE|${payload.tileId || ''}`;
    case 'CHOOSE_FOUNDING_CHAIN':
    case 'CHOOSE_MERGER_SURVIVOR':
    case 'CHOOSE_MERGER_DEFUNCT_CHAIN':
      return `${payload.type}|${payload.chainId || ''}`;
    case 'RESOLVE_MERGER_STOCK':
      return `RESOLVE_MERGER_STOCK|${Number(payload.tradeFrom || 0)}|${Number(payload.sell || 0)}`;
    case 'BUY_STOCKS': {
      const chains = Array.isArray(payload.chains) ? [...payload.chains].sort().join(',') : '';
      return `BUY_STOCKS|${chains}|${Boolean(payload.endGame)}`;
    }
    case 'SKIP_TILE':
      return 'SKIP_TILE';
    default:
      return JSON.stringify(payload);
  }
}

function capRootActions(actions: any[], rng: () => number): any[] {
  const deduped = dedupeActions(actions);
  if (deduped.length <= ROOT_ACTION_CAP) {
    return deduped;
  }

  const selected: any[] = [];
  const selectedKeys = new Set<string>();

  const addIfNeeded = (action: any) => {
    if (!action || selected.length >= ROOT_ACTION_CAP) {
      return;
    }
    const key = actionSignature(action);
    if (selectedKeys.has(key)) {
      return;
    }
    selectedKeys.add(key);
    selected.push(action);
  };

  // Keep pass choices available when buy action count is large.
  for (const action of deduped) {
    if (action.type === 'BUY_STOCKS' && Array.isArray(action.chains) && action.chains.length === 0) {
      addIfNeeded(action);
    }
  }

  // Preserve at least one immediate end-game option for tie-breaking and strategy.
  for (const action of deduped) {
    if (action.type === 'BUY_STOCKS' && action.endGame) {
      addIfNeeded(action);
      break;
    }
  }

  for (const action of shuffle(deduped, rng)) {
    addIfNeeded(action);
    if (selected.length >= ROOT_ACTION_CAP) {
      break;
    }
  }

  return selected;
}

function evaluateAction(state: GameState, botId: string, action: any, rng: () => number): number {
  const simulation = cloneGameState(state);
  const applied = applyAction(simulation, botId, action);
  if (!applied.ok) {
    return 0;
  }
  return runRandomRollout(simulation, botId, rng);
}

function runRandomRollout(state: GameState, botId: string, rng: () => number): number {
  for (let step = 0; step < MAX_ROLLOUT_STEPS; step += 1) {
    if (state.phase === PHASES.GAME_OVER || state.gameEnded) {
      return terminalScore(state, botId);
    }

    const actorId = getExpectedActorId(state);
    if (!actorId) {
      return heuristicScore(state, botId);
    }

    const action = chooseRandomActionForActor(state, actorId, rng);
    if (!action) {
      return heuristicScore(state, botId);
    }

    const result = applyAction(state, actorId, action);
    if (!result.ok) {
      return heuristicScore(state, botId);
    }
  }

  return heuristicScore(state, botId);
}

function terminalScore(state: GameState, botId: string): number {
  if (!Array.isArray(state.winnerIds) || !state.winnerIds.length) {
    return 0;
  }
  if (!state.winnerIds.includes(botId)) {
    return 0;
  }
  return 1 / state.winnerIds.length;
}

function heuristicScore(state: GameState, botId: string): number {
  const bot = getPlayer(state, botId);
  if (!bot) {
    return 0;
  }

  const botWealth = estimateWealth(state, bot);
  const opponents = state.players.filter((player) => player.id !== botId);
  if (!opponents.length) {
    return 1;
  }

  const opponentAverage = opponents.reduce((sum, player) => sum + estimateWealth(state, player), 0) / opponents.length;
  const delta = botWealth - opponentAverage;
  return 0.5 + 0.5 * Math.tanh(delta / 12000);
}

function estimateWealth(state: GameState, player): number {
  let total = player.cash;
  for (const [chainId, shares] of Object.entries(player.stocks || {})) {
    if (!shares) {
      continue;
    }
    const chain = state.hotels[chainId];
    total += Number(shares) * stockPrice(chain, chain?.size || 0);
  }
  return total;
}

function tieBreakerScore(action: any): number {
  if (action?.type === 'BUY_STOCKS' && action.endGame) {
    return 2;
  }
  if (action?.type === 'BUY_STOCKS') {
    return 1 + (Array.isArray(action.chains) ? action.chains.length : 0) * 0.01;
  }
  return 0;
}

function cloneGameState(state: GameState): GameState {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state));
}
