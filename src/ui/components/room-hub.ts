/**
 * Responsibility: Renders room-level identity and connection status details.
 * It also exposes lobby/global actions such as start game and leave room.
 */

import { html } from 'lit';
import { MIN_PLAYER_COUNT } from '../../game/constants';

type LobbyStartControlState = {
  showButton: boolean;
  disabled: boolean;
  helper: string;
};

type LobbyStartControlInput = {
  isHost: boolean;
  playerCount: number;
  maxPlayers: number;
};

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

type ConnectionStatusMeta = {
  icon: string;
  label: string;
  detail: string;
};

function normalizeStatusMessage(statusMessage: unknown): string {
  return typeof statusMessage === 'string' ? statusMessage.trim() : '';
}

function copyRoomUrl(roomId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const roomUrl = `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
  const clipboard = globalThis?.navigator?.clipboard;
  if (clipboard?.writeText) {
    void clipboard.writeText(roomUrl);
    return;
  }

  if (typeof window.prompt === 'function') {
    window.prompt('Copy room link:', roomUrl);
  }
}

export function getConnectionStatusMeta(
  connectionStatus: ConnectionStatus | string,
  statusMessage: unknown,
): ConnectionStatusMeta {
  const detail = normalizeStatusMessage(statusMessage);

  switch (connectionStatus) {
    case 'connected':
      return {
        icon: '🟢',
        label: 'Connected',
        detail: '',
      };
    case 'connecting':
      return {
        icon: '🟡',
        label: 'Connecting',
        detail,
      };
    case 'disconnected':
      return {
        icon: '🔴',
        label: 'Disconnected',
        detail,
      };
    case 'idle':
    default:
      return {
        icon: '⚪',
        label: 'Idle',
        detail,
      };
  }
}

export function getLobbyStartControlState({
  isHost,
  playerCount,
  maxPlayers,
}: LobbyStartControlInput): LobbyStartControlState {
  if (!isHost) {
    return {
      showButton: false,
      disabled: true,
      helper: 'Waiting for host to start the game.',
    };
  }

  if (playerCount < MIN_PLAYER_COUNT) {
    return {
      showButton: true,
      disabled: true,
      helper: `Need at least ${MIN_PLAYER_COUNT} players to start.`,
    };
  }

  if (playerCount > maxPlayers) {
    return {
      showButton: true,
      disabled: true,
      helper: `Lobby exceeds max players (${maxPlayers}).`,
    };
  }

  return {
    showButton: true,
    disabled: false,
    helper: '',
  };
}

export function renderRoomHub({
  state,
  isHost,
  inLobby = false,
  lobbyPlayerCount = 0,
  lobbyMaxPlayers = 6,
  connectionStatus,
  statusMessage,
  errorMessage,
  onStartGame,
  onLeave,
}) {
  const statusMeta = getConnectionStatusMeta(connectionStatus, statusMessage);
  const startControl = inLobby
    ? getLobbyStartControlState({
        isHost,
        playerCount: lobbyPlayerCount,
        maxPlayers: lobbyMaxPlayers,
      })
    : null;

  return html`
    <article class="room-hub">
      <div class="room-hub-main">
        <h2>
          Room
          <span class="room-code">
            ${state.roomId}
            <button
              class="secondary room-copy-link"
              title="Copy room URL"
              aria-label="Copy room URL"
              @click=${() => copyRoomUrl(state.roomId)}
            >
              🔗
            </button>
          </span>
        </h2>
        <p><strong>Role:</strong> ${isHost ? 'Host' : 'Player'}</p>
        <p><strong>Status:</strong> <span class="room-status-badge">${statusMeta.icon} ${statusMeta.label}</span></p>
        ${statusMeta.detail ? html`<p class="muted small room-status-detail">${statusMeta.detail}</p>` : html``}
        ${inLobby ? html`<p><strong>Players:</strong> ${lobbyPlayerCount} / ${lobbyMaxPlayers}</p>` : html``}
        ${errorMessage ? html`<p style="color:#b00020;"><strong>Error:</strong> ${errorMessage}</p>` : html``}
      </div>

      <div class="room-hub-actions">
        <div class="room-actions">
          ${inLobby && startControl?.showButton
            ? html`
                <button ?disabled=${startControl.disabled} @click=${() => onStartGame?.()}>
                  Start Game
                </button>
              `
            : html``}
          <button class="secondary" @click=${() => onLeave()}>Leave Room</button>
        </div>
        ${inLobby && startControl?.helper
          ? html`<p class="muted small room-hub-helper">${startControl.helper}</p>`
          : html``}
      </div>
    </article>
  `;
}
