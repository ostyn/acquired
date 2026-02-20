/**
 * Responsibility: Renders room-level identity and connection status details.
 * It also exposes lobby/global actions such as start game and leave room.
 */

import { html } from 'lit';
import { MIN_PLAYER_COUNT } from '../../game/constants';
import { roomPath } from '../routes';
import { connectionStatusLabel, t } from '../i18n';
import './connection-status';

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

  const roomUrl = `${window.location.origin}${roomPath(roomId)}`;
  const clipboard = globalThis?.navigator?.clipboard;
  if (clipboard?.writeText) {
    void clipboard.writeText(roomUrl);
    return;
  }

  if (typeof window.prompt === 'function') {
    window.prompt(t('roomhub.copy_prompt'), roomUrl);
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
        label: connectionStatusLabel(connectionStatus),
        detail: '',
      };
    case 'connecting':
      return {
        icon: '🟡',
        label: connectionStatusLabel(connectionStatus),
        detail,
      };
    case 'disconnected':
      return {
        icon: '🔴',
        label: connectionStatusLabel(connectionStatus),
        detail,
      };
    case 'idle':
    default:
      return {
        icon: '⚪',
        label: connectionStatusLabel(connectionStatus),
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
      helper: t('roomhub.waiting_host_start'),
    };
  }

  if (playerCount < MIN_PLAYER_COUNT) {
    return {
      showButton: true,
      disabled: true,
      helper: t('roomhub.need_players_start', { count: MIN_PLAYER_COUNT }),
    };
  }

  if (playerCount > maxPlayers) {
    return {
      showButton: true,
      disabled: true,
      helper: t('roomhub.exceeds_max_players', { count: maxPlayers }),
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
        <p class="room-app-title">${t('app.acquire')}</p>
        <h2>
          ${t('common.room')}
          <span class="room-code">
            ${state.roomId}
            <button
              class="secondary room-copy-link"
              title=${t('roomhub.copy_url')}
              aria-label=${t('roomhub.copy_url')}
              @click=${() => copyRoomUrl(state.roomId)}
            >
              🔗
            </button>
          </span>
        </h2>
        <p><strong>${t('common.role')}:</strong> ${isHost ? t('common.host') : t('common.player')}</p>
        <p>
          <strong>${t('common.status')}:</strong>
          <connection-status class="room-status-badge" status=${connectionStatus} variant="inline"></connection-status>
        </p>
        ${statusMeta.detail ? html`<p class="muted small room-status-detail">${statusMeta.detail}</p>` : html``}
        ${inLobby ? html`<p><strong>${t('common.players')}:</strong> ${lobbyPlayerCount} / ${lobbyMaxPlayers}</p>` : html``}
        ${errorMessage ? html`<p style="color:#b00020;"><strong>${t('common.error')}:</strong> ${errorMessage}</p>` : html``}
      </div>

      <div class="room-hub-actions">
        <div class="room-actions">
          ${inLobby && startControl?.showButton
            ? html`
                <button ?disabled=${startControl.disabled} @click=${() => onStartGame?.()}>
                  ${t('common.start_game')}
                </button>
              `
            : html``}
          <button class="secondary" @click=${() => onLeave()}>${t('common.leave_room')}</button>
        </div>
        ${inLobby && startControl?.helper
          ? html`<p class="muted small room-hub-helper">${startControl.helper}</p>`
          : html``}
      </div>
    </article>
  `;
}
