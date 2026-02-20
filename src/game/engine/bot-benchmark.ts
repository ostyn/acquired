/**
 * Responsibility: Runs deterministic Monte Carlo vs random bot benchmarks.
 * Shared by tests and CLI tooling so benchmarking logic lives in one place.
 */

import { PHASES } from '../constants';
import { applyAction, getExpectedActorId } from './actions';
import {
  chooseMonteCarloBotAction,
  chooseRandomBotAction,
  DEFAULT_MONTE_CARLO_BOT_CONFIG,
} from './bots';
import { addPlayerToLobby, createLobbyState, startGame } from './lobby';
import type { MonteCarloBotConfig } from './bots';
import type { GameState } from './types';

export type BotBenchmarkOptions = {
  matchCount?: number;
  seedBase?: number;
  seedStep?: number;
  maxActionsPerMatch?: number;
  alternateSeats?: boolean;
  monteCarloConfig?: Partial<MonteCarloBotConfig>;
};

export type BotMatchResult = {
  seed: number;
  monteCarloPlayerId: 'p1' | 'p2';
  winnerIds: string[];
  monteCarloScore: number;
  actionCount: number;
};

export type BotBenchmarkResult = {
  matchCount: number;
  monteCarloWins: number;
  monteCarloTies: number;
  monteCarloLosses: number;
  monteCarloScore: number;
  winRate: number;
  scoreRate: number;
  seeds: number[];
  monteCarloConfig: MonteCarloBotConfig;
  maxActionsPerMatch: number;
};

const DEFAULT_MATCH_COUNT = 20;
const DEFAULT_SEED_BASE = 1000;
const DEFAULT_SEED_STEP = 97;
const DEFAULT_MAX_ACTIONS_PER_MATCH = 5000;

export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function playMonteCarloVsRandomMatch({
  seed,
  monteCarloPlayerId,
  maxActionsPerMatch = DEFAULT_MAX_ACTIONS_PER_MATCH,
  monteCarloConfig = {},
}: {
  seed: number;
  monteCarloPlayerId: 'p1' | 'p2';
  maxActionsPerMatch?: number;
  monteCarloConfig?: Partial<MonteCarloBotConfig>;
}): BotMatchResult {
  const state = createTwoPlayerBotLobby(`BM${seed.toString(36).toUpperCase()}`);
  const startResult = startGame(state, createSeededRng(seed + 1));
  if (!startResult.ok) {
    throw new Error(`Failed to start benchmark match for seed ${seed}: ${startResult.error || 'unknown error'}`);
  }

  const rngByPlayer = {
    p1: createSeededRng(seed + 101),
    p2: createSeededRng(seed + 202),
  };

  let actionCount = 0;
  while (state.phase !== PHASES.GAME_OVER && actionCount < maxActionsPerMatch) {
    const actorId = getExpectedActorId(state);
    if (!actorId) {
      throw new Error(`Match stalled without expected actor at seed ${seed}.`);
    }

    const actorRng = rngByPlayer[actorId];
    const action =
      actorId === monteCarloPlayerId
        ? chooseMonteCarloBotAction(state, actorId, actorRng, monteCarloConfig)
        : chooseRandomBotAction(state, actorId, actorRng);

    if (!action) {
      throw new Error(`No action returned for ${actorId} at seed ${seed}.`);
    }

    const actionResult = applyAction(state, actorId, action);
    if (!actionResult.ok) {
      throw new Error(
        `Invalid action for ${actorId} at seed ${seed}: ${actionResult.error || actionResult.errorKey || 'unknown error'}`,
      );
    }

    actionCount += 1;
  }

  if (state.phase !== PHASES.GAME_OVER) {
    throw new Error(`Match exceeded max actions (${maxActionsPerMatch}) at seed ${seed}.`);
  }

  const winners = Array.isArray(state.winnerIds) ? [...state.winnerIds] : [];
  const monteCarloScore = winners.includes(monteCarloPlayerId) ? 1 / winners.length : 0;

  return {
    seed,
    monteCarloPlayerId,
    winnerIds: winners,
    monteCarloScore,
    actionCount,
  };
}

export function runMonteCarloVsRandomBenchmark(options: BotBenchmarkOptions = {}): BotBenchmarkResult {
  const matchCount = normalizePositiveInteger(options.matchCount, DEFAULT_MATCH_COUNT);
  const seedBase = Number.isInteger(options.seedBase) ? Number(options.seedBase) : DEFAULT_SEED_BASE;
  const seedStep = normalizeNonZeroInteger(options.seedStep, DEFAULT_SEED_STEP);
  const maxActionsPerMatch = normalizePositiveInteger(options.maxActionsPerMatch, DEFAULT_MAX_ACTIONS_PER_MATCH);
  const alternateSeats = options.alternateSeats !== false;
  const monteCarloConfig = resolveMonteCarloConfig(options.monteCarloConfig);

  const seeds: number[] = [];
  let monteCarloScore = 0;
  let monteCarloWins = 0;
  let monteCarloTies = 0;
  let monteCarloLosses = 0;

  for (let index = 0; index < matchCount; index += 1) {
    const seed = seedBase + index * seedStep;
    const monteCarloPlayerId = alternateSeats && index % 2 === 1 ? 'p2' : 'p1';
    seeds.push(seed);

    const match = playMonteCarloVsRandomMatch({
      seed,
      monteCarloPlayerId,
      maxActionsPerMatch,
      monteCarloConfig,
    });

    monteCarloScore += match.monteCarloScore;
    if (match.monteCarloScore === 1) {
      monteCarloWins += 1;
    } else if (match.monteCarloScore > 0) {
      monteCarloTies += 1;
    } else {
      monteCarloLosses += 1;
    }
  }

  return {
    matchCount,
    monteCarloWins,
    monteCarloTies,
    monteCarloLosses,
    monteCarloScore,
    winRate: monteCarloWins / matchCount,
    scoreRate: monteCarloScore / matchCount,
    seeds,
    monteCarloConfig,
    maxActionsPerMatch,
  };
}

function createTwoPlayerBotLobby(roomId: string): GameState {
  const state = createLobbyState({
    roomId,
    hostPlayer: { id: 'p1', name: 'Bot 1' },
  });

  const addResult = addPlayerToLobby(state, {
    id: 'p2',
    name: 'Bot 2',
    isBot: true,
    connected: true,
  });
  if (!addResult.ok) {
    throw new Error(`Failed to add benchmark player: ${addResult.error || 'unknown error'}`);
  }

  const host = state.players.find((player) => player.id === 'p1');
  if (host) {
    host.isBot = true;
  }

  return state;
}

function resolveMonteCarloConfig(rawConfig: Partial<MonteCarloBotConfig> | undefined): MonteCarloBotConfig {
  const config = rawConfig || {};
  return {
    rootActionCap: normalizePositiveInteger(config.rootActionCap, DEFAULT_MONTE_CARLO_BOT_CONFIG.rootActionCap),
    rolloutBudget: normalizePositiveInteger(config.rolloutBudget, DEFAULT_MONTE_CARLO_BOT_CONFIG.rolloutBudget),
    maxRolloutSteps: normalizePositiveInteger(config.maxRolloutSteps, DEFAULT_MONTE_CARLO_BOT_CONFIG.maxRolloutSteps),
  };
}

function normalizePositiveInteger(rawValue: unknown, fallback: number): number {
  const number = Number(rawValue);
  if (!Number.isInteger(number) || number <= 0) {
    return fallback;
  }
  return number;
}

function normalizeNonZeroInteger(rawValue: unknown, fallback: number): number {
  const number = Number(rawValue);
  if (!Number.isInteger(number) || number === 0) {
    return fallback;
  }
  return number;
}
