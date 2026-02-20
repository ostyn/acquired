/**
 * Responsibility: Public API surface for game engine behavior.
 * Re-exports lobby lifecycle, turn resolution, visibility shaping, and bot helpers.
 */

export { applyAction, getExpectedActorId } from './actions';
export { chooseRandomBotAction } from './bots';
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
