/**
 * Responsibility: Encapsulates turn/phase derived presentation helpers.
 * These helpers convert engine phase data into display-friendly labels and totals.
 */

import { PHASES } from '../../game/constants';
import { phaseLabelText, t } from '../i18n';

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
  return phaseLabelText(phase);
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
    return t('turn.waiting_actions');
  }

  switch (legal.phase) {
    case PHASES.AWAIT_TILE:
      return legal.isTurn
        ? t('turn.play_tile')
        : t('turn.waiting_place_tile', { name: actingPlayerName });
    case PHASES.AWAIT_FOUND_CHAIN:
      return legal.foundingChoices?.length
        ? t('turn.select_chain')
        : t('turn.waiting_chain', { name: actingPlayerName });
    case PHASES.AWAIT_MERGER_SURVIVOR:
      return legal.survivorChoices?.length
        ? t('turn.choose_survivor')
        : t('turn.waiting_survivor', { name: actingPlayerName });
    case PHASES.AWAIT_MERGER_DEFUNCT_ORDER:
      return legal.defunctOrderChoices?.length
        ? t('turn.choose_defunct')
        : t('turn.waiting_defunct', { name: actingPlayerName });
    case PHASES.AWAIT_MERGER_DISPOSITION:
      return legal.mergerDisposition
        ? t('turn.resolve_merger')
        : t('turn.waiting_merger', { name: actingPlayerName });
    case PHASES.AWAIT_BUY:
      return legal.isTurn
        ? t('turn.buy_or_pass')
        : t('turn.waiting_buy', { name: actingPlayerName });
    default:
      return t('turn.waiting_actions');
  }
}
