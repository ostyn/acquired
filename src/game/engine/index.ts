/**
 * Responsibility: Public API surface for game engine behavior.
 * Re-exports lobby lifecycle, turn resolution, visibility shaping, and bot helpers.
 */

export { applyAction, getExpectedActorId } from './actions';
export {
  BOT_STRATEGIES,
  DEFAULT_MONTE_CARLO_BOT_CONFIG,
  chooseBotAction,
  chooseMonteCarloBotAction,
  chooseRandomBotAction,
} from './bots';
export { playMonteCarloVsRandomMatch, runMonteCarloVsRandomBenchmark } from './bot-benchmark';
export { isTilePlayable } from './board';
export { getLegalActions } from './legal-actions';
export { pushLegacyLog, pushLogEvent } from './helpers';
export {
  addPlayerToLobby,
  createLobbyState,
  markPlayerConnection,
  removePlayerFromLobby,
  setLobbySettings,
  startGame,
} from './lobby';
export { toPublicState } from './public-state';

export type {
  ActionResult,
  BoardState,
  GameLogEvent,
  GameLogKey,
  GameLogParams,
  GameState,
  HotelsState,
  LegalActions,
  LobbySettings,
  PlayerState,
  Stocks,
} from './types';

export type { BotStrategy, MonteCarloBotConfig } from './bots';
export type { BotBenchmarkOptions, BotBenchmarkResult, BotMatchResult } from './bot-benchmark';
