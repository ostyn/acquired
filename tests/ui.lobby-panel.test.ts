import { describe, expect, it } from 'vitest';
import { normalizeLobbySettings, shouldShowTwoPlayerRulesNote } from '../src/ui/components/lobby-panel';

describe('lobby panel helpers', () => {
  it('returns defaults for missing settings', () => {
    expect(normalizeLobbySettings()).toEqual({
      startingCash: 6000,
      maxPlayers: 6,
      deadTilesAsUnincorporated: false,
      excelStyleCoordinates: false,
      showPlayerCashOnTurnRail: false,
    });
  });

  it('normalizes populated settings', () => {
    expect(
      normalizeLobbySettings({
        startingCash: '12000',
        maxPlayers: '4',
        allowDeadTilePlacementAsUnincorporated: true,
        excelStyleCoordinates: true,
        showPlayerCashOnTurnRail: true,
      }),
    ).toEqual({
      startingCash: 12000,
      maxPlayers: 4,
      deadTilesAsUnincorporated: true,
      excelStyleCoordinates: true,
      showPlayerCashOnTurnRail: true,
    });
  });

  it('shows two-player rules note only when exactly two players are present', () => {
    expect(shouldShowTwoPlayerRulesNote([{ id: 'p1' }, { id: 'p2' }])).toBe(true);
    expect(shouldShowTwoPlayerRulesNote([{ id: 'p1' }])).toBe(false);
    expect(shouldShowTwoPlayerRulesNote([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }])).toBe(false);
    expect(shouldShowTwoPlayerRulesNote(null)).toBe(false);
  });
});
