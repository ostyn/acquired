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
import playersLogStyles from './components/players-log.css?inline';
import referenceCardStyles from './components/reference-card.css?inline';
import roomHubStyles from './components/room-hub.css?inline';
import { PHASES } from '../game/constants';
import { appStore } from '../state/app-store';
import { renderDecisionWorkspace } from './components/action-workspace';
import { renderBoard } from './components/board';
import { renderChainNamesInText } from './components/chain-display';
import { renderChainPanel } from './components/chain-market';
import { renderGameHud } from './components/game-hud';
import { renderLobbyPanel } from './components/lobby-panel';
import { renderModal } from './components/modal';
import { renderPlayersPanel } from './components/players-log';
import { renderReferenceCard } from './components/reference-card';
import { renderRoomHub } from './components/room-hub';
import { getActiveThemeMode, toggleThemeMode, type ThemeMode } from './theme';
import { appPath, extractRoomIdFromPath } from './routes';

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
    ${unsafeCSS(playersLogStyles)}
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
  private playersModalOpen = false;

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

  private disposeReaction: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.syncThemeAttribute();
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
    if (this.disposeReaction) {
      this.disposeReaction();
    }
  }

  protected updated(): void {
    const state = appStore.viewState;
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

  private openPlayersModal() {
    this.playersModalOpen = true;
  }

  private closeReferenceModal() {
    this.referenceModalOpen = false;
  }

  private closePlayersModal() {
    this.playersModalOpen = false;
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
      appStore.setError('Name cannot be empty.');
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
          <h2>Game Over</h2>
          <p>Winner${winners.length > 1 ? 's' : ''}: ${winners.map((player) => player.name).join(', ')}</p>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Cash</th>
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
          <h3>Final Board</h3>
          ${renderBoard(state, {
            excelStyleCoordinates: Boolean(state.settings?.excelStyleCoordinates),
          })}
        </article>

        ${renderChainPanel(state, 'Final Chains')}
      `;
    }

    const recent = [...state.log].slice(-4).reverse();
    return html`
      ${renderGameHud({
        state,
        buyQueue: this.buyQueue,
        onOpenPlayers: () => this.openPlayersModal(),
        onOpenReference: () => this.openReferenceModal(),
      })}

      <section class="game-stage-layout">
        <article class="board-stage">
          <div class="board-stage-head">
            <h3>Board</h3>
            <p class="muted small">Click a hand tile or playable board tile to preview and place.</p>
          </div>
          ${renderBoard(state, {
            highlightedTileId: this.tilePreviewId,
            pendingPlaceTileId: this.pendingPlaceTileId,
            excelStyleCoordinates: Boolean(state.settings?.excelStyleCoordinates),
            onSelectTile: (tileId) => this.handleHandTileClick(tileId),
          })}
          <div class="board-ticker" aria-live="polite">
            <p class="board-ticker-title">Recent Actions</p>
            ${recent.length
              ? html`
                  <ul class="board-ticker-list">
                    ${recent.map((entry) => html`<li>${renderChainNamesInText(entry, state.chains)}</li>`)}
                  </ul>
                `
              : html`<p class="muted small">No actions logged yet.</p>`}
          </div>
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

  private renderModals(state, orderedPlayers, inLobby) {
    if (inLobby) {
      return html``;
    }

    return html`
      ${this.referenceModalOpen
        ? renderModal('Quick Reference', renderReferenceCard(), () => this.closeReferenceModal(), 'modal-large')
        : html``}
      ${this.playersModalOpen
        ? renderModal(
            'Players',
            renderPlayersPanel(state, orderedPlayers, appStore.localPlayerId),
            () => this.closePlayersModal(),
            'modal-medium',
          )
        : html``}
    `;
  }

  render() {
    const state = appStore.viewState;
    const routeRoomId = this.getRouteRoomId();
    const toggleLabel = this.themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

    if (!state) {
      const waitingForHostState = appStore.isGuest && appStore.connectionStatus !== 'idle' && !appStore.errorMessage;
      return html`
        <div class="page-toolbar">
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

        <article>
          <h2>Room</h2>
          <p>
            ${waitingForHostState
              ? 'Waiting for room state from host...'
              : routeRoomId
                ? `No room state available yet for room ${routeRoomId}.`
                : 'No room state available. Join or create a room first.'}
          </p>
          <p><strong>Status:</strong> ${appStore.connectionStatus} - ${appStore.statusMessage}</p>
          ${appStore.errorMessage
            ? html`<p style="color: #b00020"><strong>Error:</strong> ${appStore.errorMessage}</p>`
            : html``}
          ${routeRoomId
            ? html`
                <button
                  class="secondary"
                  ?disabled=${this.autoJoinInFlight}
                  @click=${() => this.autoJoinRouteRoom(true)}
                >
                  ${this.autoJoinInFlight ? 'Joining...' : `Retry Join ${routeRoomId}`}
                </button>
              `
            : html``}
          <button @click=${() => Router.go(appPath())}>Go To Lobby</button>
        </article>
      `;
    }

    const orderedPlayers = state.playerOrder.length
      ? state.playerOrder
          .map((id) => state.players.find((player) => player.id === id))
          .filter(Boolean)
      : state.players;

    const inLobby = state.phase === PHASES.LOBBY;
    const lobbyMaxPlayers = Number.isFinite(Number(state.settings?.maxPlayers))
      ? Number(state.settings.maxPlayers)
      : 6;

    return html`
      <div class="page-toolbar">
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

      ${renderRoomHub({
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
      })}

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

      ${this.renderModals(state, orderedPlayers, inLobby)}
    `;
  }
}
