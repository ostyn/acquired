/**
 * Responsibility: Renders the in-room multiplayer game experience.
 * This component orchestrates game/lobby views, local UI-only state, and host/guest actions.
 */

import { LitElement, css, html, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { autorun } from 'mobx';
import { Router } from '@vaadin/router';
import picoStyles from '@picocss/pico/css/pico.min.css?inline';
import pageStyles from './room-page.css?inline';
import typographyStyles from './typography.css?inline';
import actionWorkspaceStyles from './components/action-workspace.css?inline';
import boardStyles from './components/board.css?inline';
import chainDisplayStyles from './components/chain-display.css?inline';
import chainMarketStyles from './components/chain-market.css?inline';
import gameHudStyles from './components/game-hud.css?inline';
import lobbyPanelStyles from './components/lobby-panel.css?inline';
import modalStyles from './components/modal.css?inline';
import referenceCardStyles from './components/reference-card.css?inline';
import roomHubStyles from './components/room-hub.css?inline';
import { PHASES } from '../game/constants';
import { appStore } from '../state/app-store';
import { renderDecisionWorkspace } from './components/action-workspace';
import { renderBoard } from './components/board';
import { renderChainPanel } from './components/chain-market';
import { renderGameHud } from './components/game-hud';
import { renderLobbyPanel } from './components/lobby-panel';
import { renderModal } from './components/modal';
import { renderReferenceCard } from './components/reference-card';
import { renderRoomHub } from './components/room-hub';
import { getActiveThemeMode, toggleThemeMode, type ThemeMode } from './theme';
import { appPath, extractRoomIdFromPath } from './routes';
import { connectionStatusLabel, subscribeToLocaleChanges, t } from './i18n';
import './components/locale-switcher';

@customElement('room-page')
export class RoomPage extends LitElement {
  static styles = css`
    ${unsafeCSS(picoStyles)}
    ${unsafeCSS(typographyStyles)}
    ${unsafeCSS(pageStyles)}
    ${unsafeCSS(actionWorkspaceStyles)}
    ${unsafeCSS(boardStyles)}
    ${unsafeCSS(chainDisplayStyles)}
    ${unsafeCSS(chainMarketStyles)}
    ${unsafeCSS(gameHudStyles)}
    ${unsafeCSS(lobbyPanelStyles)}
    ${unsafeCSS(modalStyles)}
    ${unsafeCSS(referenceCardStyles)}
    ${unsafeCSS(roomHubStyles)}

    .grid-2 {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    }

    .muted {
      color: var(--text-subtle);
      opacity: 1;
    }

    .small {
      font-size: 0.8rem;
    }
  `;

  @state()
  private buyQueue: string[] = [];

  @state()
  private mergerSell = 0;

  @state()
  private mergerTradeFrom = 0;

  @state()
  private referenceModalOpen = false;

  @state()
  private autoJoinAttemptedRoomId = '';

  @state()
  private autoJoinInFlight = false;

  @state()
  private lobbyEditingPlayerIds: Record<string, boolean> = {};

  @state()
  private lobbyNameDrafts: Record<string, string> = {};

  @state()
  private tilePreviewId = '';

  @state()
  private pendingPlaceTileId = '';

  @state()
  private themeMode: ThemeMode = getActiveThemeMode();

  @state()
  private roomHubPanelOpen = false;

  private disposeReaction: (() => void) | null = null;
  private localeUnsubscribe: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.syncThemeAttribute();
    this.localeUnsubscribe = subscribeToLocaleChanges(() => {
      this.requestUpdate();
    });
    this.disposeReaction = autorun(() => {
      appStore.viewState;
      appStore.connectionStatus;
      appStore.errorMessage;
      this.requestUpdate();
    });
    void this.autoJoinRouteRoom();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.localeUnsubscribe) {
      this.localeUnsubscribe();
      this.localeUnsubscribe = null;
    }
    if (this.disposeReaction) {
      this.disposeReaction();
    }
  }

  protected updated(): void {
    const state = appStore.viewState;
    if (state?.phase === PHASES.LOBBY && this.roomHubPanelOpen) {
      this.roomHubPanelOpen = false;
    }

    const localPlayer = appStore.localPlayer;
    if (!state || !localPlayer || state.phase === PHASES.LOBBY || state.phase === PHASES.GAME_OVER) {
      this.clearTileSelection();
      return;
    }

    const localTiles = new Set(localPlayer.tiles || []);
    const legal = state.legalActions;
    const canPlaceTileNow = legal?.phase === PHASES.AWAIT_TILE && Boolean(legal?.isTurn);
    const playableTiles = new Set(legal?.playableTiles || []);

    let nextPreviewTileId = this.tilePreviewId;
    let nextPendingPlaceTileId = this.pendingPlaceTileId;

    if (nextPreviewTileId && !localTiles.has(nextPreviewTileId)) {
      nextPreviewTileId = '';
    }

    if (
      nextPendingPlaceTileId
      && (!localTiles.has(nextPendingPlaceTileId)
        || !canPlaceTileNow
        || !playableTiles.has(nextPendingPlaceTileId))
    ) {
      nextPendingPlaceTileId = '';
    }

    if (!nextPreviewTileId && nextPendingPlaceTileId) {
      nextPreviewTileId = nextPendingPlaceTileId;
    }

    if (
      nextPreviewTileId !== this.tilePreviewId
      || nextPendingPlaceTileId !== this.pendingPlaceTileId
    ) {
      this.tilePreviewId = nextPreviewTileId;
      this.pendingPlaceTileId = nextPendingPlaceTileId;
    }
  }

  private leaveRoom() {
    appStore.leaveRoom();
    Router.go(appPath());
  }

  private getRouteRoomId(): string {
    if (typeof window === 'undefined') {
      return '';
    }
    return extractRoomIdFromPath(window.location.pathname);
  }

  private async autoJoinRouteRoom(force = false) {
    const routeRoomId = this.getRouteRoomId();
    if (!routeRoomId) {
      return;
    }

    if (!force && this.autoJoinAttemptedRoomId === routeRoomId) {
      return;
    }

    if (this.autoJoinInFlight) {
      return;
    }

    const alreadyInThisRoom = appStore.roomId === routeRoomId && appStore.role !== 'idle';
    if (!force && (alreadyInThisRoom || appStore.viewState?.roomId === routeRoomId)) {
      this.autoJoinAttemptedRoomId = routeRoomId;
      return;
    }

    const shouldResumeHost = appStore.hasHostCheckpointForRoom(routeRoomId);
    if (shouldResumeHost) {
      this.autoJoinInFlight = true;
      this.autoJoinAttemptedRoomId = routeRoomId;

      const resumed = await appStore.resumeHostFromCheckpoint();
      if (!resumed) {
        this.autoJoinAttemptedRoomId = '';
      }

      this.autoJoinInFlight = false;
      return;
    }

    const remembered = appStore.getSavedRoomIdentity(routeRoomId);
    const name = remembered?.lastName || appStore.localName || 'Guest';

    this.autoJoinInFlight = true;
    this.autoJoinAttemptedRoomId = routeRoomId;
    const ok = await appStore.joinRoom({
      roomId: routeRoomId,
      name,
      signalingUrl: appStore.signalingUrl,
    });

    if (!ok) {
      this.autoJoinAttemptedRoomId = '';
    }

    this.autoJoinInFlight = false;
  }

  private openReferenceModal() {
    this.referenceModalOpen = true;
  }

  private closeReferenceModal() {
    this.referenceModalOpen = false;
  }

  private startLobbyNameEdit(playerId: string, currentName: string) {
    this.lobbyEditingPlayerIds = {
      ...this.lobbyEditingPlayerIds,
      [playerId]: true,
    };
    this.lobbyNameDrafts = {
      ...this.lobbyNameDrafts,
      [playerId]: currentName,
    };
  }

  private changeLobbyNameDraft(playerId: string, value: string) {
    this.lobbyNameDrafts = {
      ...this.lobbyNameDrafts,
      [playerId]: value,
    };
  }

  private cancelLobbyNameEdit(playerId: string) {
    const { [playerId]: _dropEdit, ...remainingEditIds } = this.lobbyEditingPlayerIds;
    const { [playerId]: _dropDraft, ...remainingDrafts } = this.lobbyNameDrafts;
    this.lobbyEditingPlayerIds = remainingEditIds;
    this.lobbyNameDrafts = remainingDrafts;
  }

  private saveLobbyNameEdit(playerId: string, currentName: string) {
    const nextName = (this.lobbyNameDrafts[playerId] ?? currentName).trim();
    if (!nextName) {
      appStore.setErrorToken('error.name_empty');
      return;
    }

    if (nextName !== currentName) {
      appStore.renameLobbyParticipant(playerId, nextName);
    }

    this.cancelLobbyNameEdit(playerId);
  }

  private addBuy(chainId) {
    const state = appStore.viewState;
    const legal = state?.legalActions;
    if (!state || !legal || legal.phase !== PHASES.AWAIT_BUY) {
      return;
    }

    const player = appStore.localPlayer;
    if (!player) {
      return;
    }

    const chain = state.chains.find((entry) => entry.id === chainId);
    if (!chain) {
      return;
    }

    const selectedCost = this.buyQueue.reduce((sum, id) => {
      const selectedChain = state.chains.find((entry) => entry.id === id);
      return sum + (selectedChain?.price || 0);
    }, 0);

    const remainingCash = player.cash - selectedCost;
    const selectedForChain = this.buyQueue.filter((id) => id === chainId).length;

    if (this.buyQueue.length >= 3) {
      return;
    }

    if (selectedForChain >= chain.availableShares) {
      return;
    }

    if (chain.price > remainingCash) {
      return;
    }

    this.buyQueue = [...this.buyQueue, chainId];
  }

  private removeBuy(index) {
    this.buyQueue = this.buyQueue.filter((_, queueIndex) => queueIndex !== index);
  }

  private commitBuy(endGame = false) {
    appStore.sendAction({
      type: 'BUY_STOCKS',
      chains: this.buyQueue,
      endGame,
    });
    this.buyQueue = [];
  }

  private submitMergerDecision(sell, tradeFrom) {
    appStore.sendAction({
      type: 'RESOLVE_MERGER_STOCK',
      sell,
      tradeFrom,
    });
    this.mergerSell = 0;
    this.mergerTradeFrom = 0;
  }

  private toggleTheme() {
    this.themeMode = toggleThemeMode(this.themeMode);
    this.syncThemeAttribute();
  }

  private toggleRoomHubPanel() {
    this.roomHubPanelOpen = !this.roomHubPanelOpen;
  }

  private closeRoomHubPanel() {
    this.roomHubPanelOpen = false;
  }

  private syncThemeAttribute() {
    this.setAttribute('data-theme', this.themeMode);
  }

  private renderThemeToggleIcon() {
    if (this.themeMode === 'dark') {
      return html`
        <svg class="theme-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2"></path>
          <path d="M12 20v2"></path>
          <path d="M4.93 4.93l1.41 1.41"></path>
          <path d="M17.66 17.66l1.41 1.41"></path>
          <path d="M2 12h2"></path>
          <path d="M20 12h2"></path>
          <path d="M4.93 19.07l1.41-1.41"></path>
          <path d="M17.66 6.34l1.41-1.41"></path>
        </svg>
      `;
    }

    return html`
      <svg class="theme-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7.2 7.2 0 0 0 9.79 9.79z"></path>
      </svg>
    `;
  }

  private renderRoomPanelToggleIcon() {
    return html`
      <svg class="theme-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect>
        <path d="M7.5 9h9"></path>
        <path d="M7.5 12.5h9"></path>
        <path d="M7.5 16h6"></path>
      </svg>
    `;
  }

  private renderReferenceToggleIcon() {
    return html`
      <svg class="theme-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 4.5h10a2 2 0 0 1 2 2v13l-4-2-4 2-4-2-4 2v-13a2 2 0 0 1 2-2z"></path>
        <path d="M8.5 9.25h7"></path>
        <path d="M8.5 12h7"></path>
      </svg>
    `;
  }

  private clearTileSelection() {
    if (!this.tilePreviewId && !this.pendingPlaceTileId) {
      return;
    }

    this.tilePreviewId = '';
    this.pendingPlaceTileId = '';
  }

  private handleHandTileClick(tileId: string) {
    this.tilePreviewId = tileId;

    const state = appStore.viewState;
    const legal = state?.legalActions;
    const canPlaceTileNow = legal?.phase === PHASES.AWAIT_TILE && Boolean(legal?.isTurn);
    const playableTiles = new Set(legal?.playableTiles || []);
    const canPlaceThisTile = canPlaceTileNow && playableTiles.has(tileId);

    if (!canPlaceThisTile) {
      this.pendingPlaceTileId = '';
      return;
    }

    if (this.pendingPlaceTileId === tileId) {
      appStore.sendAction({ type: 'PLACE_TILE', tileId });
      this.clearTileSelection();
      return;
    }

    this.pendingPlaceTileId = tileId;
  }

  private renderGameMain(state) {
    if (state.phase === PHASES.GAME_OVER) {
      const winners = state.players.filter((player) => state.winnerIds.includes(player.id));
      const ranked = [...state.players].sort((left, right) => right.cash - left.cash);

      return html`
        <article>
          <h2>${t('game.game_over')}</h2>
          <p>
            ${winners.length > 1 ? t('game.winners') : t('game.winner')}:
            ${winners.map((player) => player.name).join(', ')}
          </p>
          <table>
            <thead>
              <tr>
                <th>${t('common.player')}</th>
                <th>${t('common.cash')}</th>
              </tr>
            </thead>
            <tbody>
              ${ranked.map(
                (player) => html`
                  <tr>
                    <td>${player.name}</td>
                    <td>$${player.cash}</td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </article>

        <article>
          <h3>${t('game.final_board')}</h3>
          ${renderBoard(state, {
            excelStyleCoordinates: Boolean(state.settings?.excelStyleCoordinates),
          })}
        </article>

        ${renderChainPanel(state, t('game.final_chains'))}
      `;
    }

    return html`
      ${renderGameHud({
        state,
        buyQueue: this.buyQueue,
        localPlayerId: appStore.localPlayerId,
      })}

      <section class="game-stage-layout">
        <article class="board-stage">
          <div class="board-stage-head">
            <h3>${t('common.board')}</h3>
            <p class="muted small">${t('game.board_hint')}</p>
          </div>
          ${renderBoard(state, {
            highlightedTileId: this.tilePreviewId,
            pendingPlaceTileId: this.pendingPlaceTileId,
            excelStyleCoordinates: Boolean(state.settings?.excelStyleCoordinates),
            onSelectTile: (tileId) => this.handleHandTileClick(tileId),
          })}
        </article>

        <aside class="game-context-shell">
          <div class="game-context-panel">
            ${renderDecisionWorkspace({
              state,
              localPlayer: appStore.localPlayer,
              buyQueue: this.buyQueue,
              mergerSell: this.mergerSell,
              mergerTradeFrom: this.mergerTradeFrom,
              tilePreviewId: this.tilePreviewId,
              pendingPlaceTileId: this.pendingPlaceTileId,
              excelStyleCoordinates: Boolean(state.settings?.excelStyleCoordinates),
              onSendAction: (action) => appStore.sendAction(action),
              onSelectTile: (tileId) => this.handleHandTileClick(tileId),
              onAddBuy: (chainId) => this.addBuy(chainId),
              onRemoveBuy: (index) => this.removeBuy(index),
              onCommitBuy: (endGame) => this.commitBuy(endGame),
              onSetMergerSell: (value) => {
                this.mergerSell = value;
              },
              onSetMergerTradeFrom: (value) => {
                this.mergerTradeFrom = value;
              },
              onSubmitMergerDecision: (sell, tradeFrom) => this.submitMergerDecision(sell, tradeFrom),
            })}
          </div>
        </aside>
      </section>
    `;
  }

  private renderModals(inLobby) {
    if (inLobby) {
      return html``;
    }

    return html`
      ${this.referenceModalOpen
        ? renderModal(t('room.quick_reference'), renderReferenceCard(), () => this.closeReferenceModal(), 'modal-large')
        : html``}
    `;
  }

  private renderRoomHubCard(state, inLobby, lobbyMaxPlayers) {
    return renderRoomHub({
      state,
      isHost: appStore.isHost,
      inLobby,
      lobbyPlayerCount: state.players.length,
      lobbyMaxPlayers,
      connectionStatus: appStore.connectionStatus,
      statusMessage: appStore.statusMessage,
      errorMessage: appStore.errorMessage,
      onStartGame: () => appStore.startGame(),
      onLeave: () => this.leaveRoom(),
    });
  }

  private renderRoomHubPanel(state, inLobby, lobbyMaxPlayers) {
    return html`
      <div
        class="room-hub-panel-backdrop ${this.roomHubPanelOpen ? 'open' : ''}"
        aria-hidden=${String(!this.roomHubPanelOpen)}
        @click=${() => this.closeRoomHubPanel()}
      ></div>
      <aside
        id="room-hub-panel"
        class="room-hub-panel-shell ${this.roomHubPanelOpen ? 'open' : ''}"
        role="dialog"
        aria-modal="false"
        aria-label=${t('room.details_dialog')}
        aria-hidden=${String(!this.roomHubPanelOpen)}
      >
        ${this.renderRoomHubCard(state, inLobby, lobbyMaxPlayers)}
      </aside>
    `;
  }

  render() {
    const state = appStore.viewState;
    const routeRoomId = this.getRouteRoomId();
    const toggleLabel = this.themeMode === 'dark'
      ? t('theme.switch_to_light')
      : t('theme.switch_to_dark');

    if (!state) {
      const waitingForHostState = appStore.isGuest && appStore.connectionStatus !== 'idle' && !appStore.errorMessage;
      return html`
        <div class="page-toolbar">
          <div class="page-toolbar-controls">
            <locale-switcher></locale-switcher>
            <button
              class="secondary outline theme-toggle-btn"
              type="button"
              @click=${() => this.toggleTheme()}
              aria-label=${toggleLabel}
              aria-pressed=${String(this.themeMode === 'dark')}
              title=${toggleLabel}
            >
              ${this.renderThemeToggleIcon()}
            </button>
          </div>
        </div>

        <article>
          <h2>${t('common.room')}</h2>
          <p>
            ${waitingForHostState
              ? t('room.waiting_state')
              : routeRoomId
                ? t('room.no_state_for_room', { roomId: routeRoomId })
                : t('room.no_state')}
          </p>
          <p><strong>${t('common.status')}:</strong> ${connectionStatusLabel(appStore.connectionStatus)} - ${appStore.statusMessage}</p>
          ${appStore.errorMessage
            ? html`<p style="color: #b00020"><strong>${t('common.error')}:</strong> ${appStore.errorMessage}</p>`
            : html``}
          ${routeRoomId
            ? html`
                <button
                  class="secondary"
                  ?disabled=${this.autoJoinInFlight}
                  @click=${() => this.autoJoinRouteRoom(true)}
                >
                  ${this.autoJoinInFlight ? t('room.joining') : t('room.retry_join', { roomId: routeRoomId })}
                </button>
              `
            : html``}
          <button @click=${() => Router.go(appPath())}>${t('room.go_lobby')}</button>
        </article>
      `;
    }

    const inLobby = state.phase === PHASES.LOBBY;
    const lobbyMaxPlayers = Number.isFinite(Number(state.settings?.maxPlayers))
      ? Number(state.settings.maxPlayers)
      : 6;
    const roomPanelLabel = this.roomHubPanelOpen ? t('room.hide_panel') : t('room.show_panel');
    const showReferenceToggle = !inLobby && state.phase !== PHASES.GAME_OVER;
    const showRoomPanelToggle = !inLobby;
    const referenceToggleLabel = this.referenceModalOpen
      ? t('room.hide_reference')
      : t('room.show_reference');

    return html`
      <div class="page-toolbar">
        <div class="page-toolbar-controls">
          <locale-switcher></locale-switcher>
          ${showReferenceToggle
            ? html`
                <button
                  class="secondary outline theme-toggle-btn"
                  type="button"
                  @click=${() => {
                    if (this.referenceModalOpen) {
                      this.closeReferenceModal();
                    } else {
                      this.openReferenceModal();
                    }
                  }}
                  aria-label=${referenceToggleLabel}
                  aria-pressed=${String(this.referenceModalOpen)}
                  title=${referenceToggleLabel}
                >
                  ${this.renderReferenceToggleIcon()}
                </button>
              `
            : html``}
          ${showRoomPanelToggle
            ? html`
                <button
                  class="secondary outline theme-toggle-btn"
                  type="button"
                  @click=${() => this.toggleRoomHubPanel()}
                  aria-label=${roomPanelLabel}
                  aria-controls="room-hub-panel"
                  aria-expanded=${String(this.roomHubPanelOpen)}
                  title=${roomPanelLabel}
                >
                  ${this.renderRoomPanelToggleIcon()}
                </button>
              `
            : html``}
          <button
            class="secondary outline theme-toggle-btn"
            type="button"
            @click=${() => this.toggleTheme()}
            aria-label=${toggleLabel}
            aria-pressed=${String(this.themeMode === 'dark')}
            title=${toggleLabel}
          >
            ${this.renderThemeToggleIcon()}
          </button>
        </div>
      </div>

      ${inLobby ? this.renderRoomHubCard(state, inLobby, lobbyMaxPlayers) : html``}
      ${!inLobby ? this.renderRoomHubPanel(state, inLobby, lobbyMaxPlayers) : html``}

      <section class=${inLobby ? 'room-shell room-shell-lobby' : 'room-shell room-shell-game'}>
        <div class="room-main">
          ${inLobby
            ? renderLobbyPanel({
                state,
                isHost: appStore.isHost,
                localPlayerId: appStore.localPlayerId,
                editingPlayerIds: this.lobbyEditingPlayerIds,
                nameDrafts: this.lobbyNameDrafts,
                onRemoveBot: (playerId) => appStore.removeBot(playerId),
                onAddBot: () => appStore.addBot(),
                onUpdateSettings: (updates) => appStore.updateLobbySettings(updates),
                onStartRename: (playerId, currentName) => this.startLobbyNameEdit(playerId, currentName),
                onChangeRenameDraft: (playerId, value) => this.changeLobbyNameDraft(playerId, value),
                onCancelRename: (playerId) => this.cancelLobbyNameEdit(playerId),
                onSaveRename: (playerId, currentName) => this.saveLobbyNameEdit(playerId, currentName),
              })
            : this.renderGameMain(state)}
        </div>
      </section>

      ${this.renderModals(inLobby)}
    `;
  }
}
