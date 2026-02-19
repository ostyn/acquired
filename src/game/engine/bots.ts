/**
 * Responsibility: Selects bot actions from legal moves.
 * Current bot behavior is intentionally simple and random within valid options.
 */

import { PHASES } from '../constants';
import { randomChoice } from '../utils';
import { getPlayer } from './helpers';
import { getLegalActions } from './legal-actions';
import type { GameState } from './types';

export function chooseRandomBotAction(state: GameState, botId: string, rng: () => number = Math.random): any {
  const legal = getLegalActions(state, botId);
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
      let cash = getPlayer(state, botId)?.cash ?? 0;

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
