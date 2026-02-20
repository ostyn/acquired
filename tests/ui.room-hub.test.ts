import { describe, expect, it } from 'vitest';
import {
  getConnectionStatusMeta,
  getLobbyStartControlState,
  getRoomRoleLabel,
  getSpectatorCount,
} from '../src/ui/components/room-hub';

describe('room hub lobby start control', () => {
  it('hides start button for guests and shows waiting copy', () => {
    expect(
      getLobbyStartControlState({
        isHost: false,
        playerCount: 4,
        maxPlayers: 6,
      }),
    ).toEqual({
      showButton: false,
      disabled: true,
      helper: 'Waiting for host to start the game.',
    });
  });

  it('requires at least two players for host start', () => {
    expect(
      getLobbyStartControlState({
        isHost: true,
        playerCount: 1,
        maxPlayers: 6,
      }),
    ).toEqual({
      showButton: true,
      disabled: true,
      helper: 'Need at least 2 players to start.',
    });
  });

  it('blocks start when current players exceed configured max', () => {
    expect(
      getLobbyStartControlState({
        isHost: true,
        playerCount: 5,
        maxPlayers: 4,
      }),
    ).toEqual({
      showButton: true,
      disabled: true,
      helper: 'Lobby exceeds max players (4).',
    });
  });

  it('enables start when host has a valid lobby setup', () => {
    expect(
      getLobbyStartControlState({
        isHost: true,
        playerCount: 4,
        maxPlayers: 6,
      }),
    ).toEqual({
      showButton: true,
      disabled: false,
      helper: '',
    });
  });
});

describe('room hub connection status copy', () => {
  it('shows compact connected status without redundant detail', () => {
    expect(getConnectionStatusMeta('connected', 'Room CE6XV7 is open')).toEqual({
      icon: '🟢',
      label: 'Connected',
      detail: '',
    });
  });

  it('keeps detail for non-connected statuses', () => {
    expect(getConnectionStatusMeta('connecting', 'Joining CE6XV7...')).toEqual({
      icon: '🟡',
      label: 'Connecting',
      detail: 'Joining CE6XV7...',
    });
  });
});

describe('room hub role label', () => {
  it('shows host role when hosting', () => {
    expect(getRoomRoleLabel(true, false)).toBe('Host');
  });

  it('shows spectator role when connected as spectator', () => {
    expect(getRoomRoleLabel(false, true)).toBe('Spectator');
  });

  it('shows player role for normal guests', () => {
    expect(getRoomRoleLabel(false, false)).toBe('Player');
  });
});

describe('room hub spectator count', () => {
  it('normalizes spectator counts to non-negative integers', () => {
    expect(getSpectatorCount(3)).toBe(3);
    expect(getSpectatorCount('2')).toBe(2);
    expect(getSpectatorCount(1.8)).toBe(1);
    expect(getSpectatorCount(-1)).toBe(0);
    expect(getSpectatorCount(undefined)).toBe(0);
  });
});
