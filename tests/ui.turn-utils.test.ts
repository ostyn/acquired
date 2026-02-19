import { describe, expect, it } from 'vitest';
import { PHASES } from '../src/game/constants';
import {
  actorForPhase,
  phaseLabel,
  totalStockCount,
  turnInstruction,
} from '../src/ui/components/turn-utils';

describe('turn utils', () => {
  it('picks the correct actor by phase', () => {
    expect(actorForPhase(null)).toBeNull();

    expect(
      actorForPhase({
        phase: PHASES.AWAIT_FOUND_CHAIN,
        currentPlayerId: 'p1',
        pending: { founderId: 'p2' },
      }),
    ).toBe('p2');

    expect(
      actorForPhase({
        phase: PHASES.AWAIT_MERGER_DISPOSITION,
        currentPlayerId: 'p1',
        pending: { currentDecisionPlayerId: 'p3' },
      }),
    ).toBe('p3');

    expect(
      actorForPhase({
        phase: PHASES.AWAIT_TILE,
        currentPlayerId: 'p4',
      }),
    ).toBe('p4');
  });

  it('formats phase labels', () => {
    expect(phaseLabel(PHASES.AWAIT_TILE)).toBe('Place Tile');
    expect(phaseLabel(PHASES.AWAIT_MERGER_DEFUNCT_ORDER)).toBe('Choose Defunct Chain Order');
    expect(phaseLabel('custom_phase')).toBe('custom_phase');
  });

  it('counts stock totals safely', () => {
    expect(totalStockCount({ tower: 2, luxor: 3 })).toBe(5);
    expect(totalStockCount({ tower: '2', luxor: 1 })).toBe(3);
    expect(totalStockCount(null)).toBe(0);
  });

  it('returns role-aware instructions for phases', () => {
    expect(turnInstruction({ allowed: false }, 'Host')).toBe('Waiting for game actions.');

    expect(
      turnInstruction(
        {
          allowed: true,
          phase: PHASES.AWAIT_TILE,
          isTurn: true,
        },
        'Host',
      ),
    ).toContain('Play one tile');

    expect(
      turnInstruction(
        {
          allowed: true,
          phase: PHASES.AWAIT_MERGER_DISPOSITION,
          mergerDisposition: null,
        },
        'Guest',
      ),
    ).toBe('Waiting for Guest to resolve merger stock.');
  });
});
