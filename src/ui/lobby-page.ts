/**
 * Responsibility: Renders and manages the pre-game lobby shell.
 * It handles host room creation, guest room joining, and host checkpoint resume actions.
 */

import { LitElement, css, html, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { autorun } from 'mobx';
import { Router } from '@vaadin/router';
import picoStyles from '@picocss/pico/css/pico.min.css?inline';
import componentStyles from './lobby-page.css?inline';
import typographyStyles from './typography.css?inline';
import { appStore } from '../state/app-store';
import { getActiveThemeMode, toggleThemeMode, type ThemeMode } from './theme';
import { roomPath } from './routes';
import { connectionStatusLabel, formatLocalizedDateTime, subscribeToLocaleChanges, t } from './i18n';
import './components/locale-switcher';

@customElement('lobby-page')
export class LobbyPage extends LitElement {
  static styles = css`
    ${unsafeCSS(picoStyles)}
    ${unsafeCSS(typographyStyles)}
    ${unsafeCSS(componentStyles)}
  `;

  @property({ type: String })
  name = 'Player';

  @property({ type: String })
  roomId = '';

  @property({ type: String })
  signalingUrl = appStore.hostCheckpointMeta?.signalingUrl || appStore.signalingUrl;

  @state()
  private mode: 'host' | 'join' | 'spectate' = 'host';

  @state()
  private themeMode: ThemeMode = getActiveThemeMode();

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
      appStore.hostCheckpointMeta;
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.disposeReaction) {
      this.disposeReaction();
    }
    if (this.localeUnsubscribe) {
      this.localeUnsubscribe();
      this.localeUnsubscribe = null;
    }
  }

  async handleCreateRoom(event) {
    event.preventDefault();
    const ok = await appStore.createRoom({
      name: this.name,
      signalingUrl: this.signalingUrl,
    });
    if (ok) {
      Router.go(roomPath(appStore.roomId));
    }
  }

  async handleJoinRoom(event) {
    event.preventDefault();
    if (!this.roomId.trim()) {
      appStore.setErrorToken('error.room_code_required');
      return;
    }

    const ok = await appStore.joinRoom({
      roomId: this.roomId,
      name: this.name,
      signalingUrl: this.signalingUrl,
    });

    if (ok) {
      Router.go(roomPath(this.roomId.trim().toUpperCase()));
    }
  }

  async handleSpectateRoom(event) {
    event.preventDefault();
    if (!this.roomId.trim()) {
      appStore.setErrorToken('error.room_code_required');
      return;
    }

    const ok = await appStore.joinRoom({
      roomId: this.roomId,
      name: this.name,
      signalingUrl: this.signalingUrl,
      asSpectator: true,
    });

    if (ok) {
      Router.go(roomPath(this.roomId.trim().toUpperCase()));
    }
  }

  async handleResumeHost(event) {
    event.preventDefault();
    const ok = await appStore.resumeHostFromCheckpoint({
      signalingUrl: this.signalingUrl,
    });
    if (ok) {
      Router.go(roomPath(appStore.roomId));
    }
  }

  handleClearCheckpoint(event) {
    event.preventDefault();
    appStore.clearHostCheckpoint();
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

  render() {
    const checkpoint = appStore.hostCheckpointMeta;
    const checkpointDate = checkpoint?.savedAt
      ? formatLocalizedDateTime(checkpoint.savedAt)
      : t('common.unknown');
    const toggleLabel = this.themeMode === 'dark'
      ? t('theme.switch_to_light')
      : t('theme.switch_to_dark');
    const appTitle = t('app.acquire');

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

      <article class="lobby-mode-panel">
        <p class="lobby-app-title">${appTitle}</p>
        <h2>${t('lobby.start_playing')}</h2>
        <p class="lead">${t('lobby.mode_help')}</p>

        <div class="mode-tabs" role="tablist" aria-label=${t('lobby.start_playing')}>
          <button
            type="button"
            class=${`secondary ${this.mode === 'host' ? 'is-active' : ''}`}
            @click=${() => {
              this.mode = 'host';
            }}
          >
            ${t('lobby.mode_host')}
          </button>
          <button
            type="button"
            class=${`secondary ${this.mode === 'join' ? 'is-active' : ''}`}
            @click=${() => {
              this.mode = 'join';
            }}
          >
            ${t('lobby.mode_join')}
          </button>
          <button
            type="button"
            class=${`secondary ${this.mode === 'spectate' ? 'is-active' : ''}`}
            @click=${() => {
              this.mode = 'spectate';
            }}
          >
            ${t('lobby.mode_spectate')}
          </button>
        </div>

        ${this.mode === 'host'
          ? html`
              <form @submit=${this.handleCreateRoom}>
                <label>
                  ${t('lobby.display_name')}
                  <input
                    .value=${this.name}
                    @input=${(event) => {
                      this.name = event.target.value;
                    }}
                    required
                  />
                </label>
                <label>
                  ${t('lobby.signaling_url')}
                  <input
                    .value=${this.signalingUrl}
                    @input=${(event) => {
                      this.signalingUrl = event.target.value;
                    }}
                    required
                  />
                </label>
                <p class="hint">${t('lobby.hosting_hint')}</p>
                <button type="submit">${t('lobby.create_room')}</button>
              </form>
            `
          : html`
              <form @submit=${this.mode === 'spectate' ? this.handleSpectateRoom : this.handleJoinRoom}>
                <label>
                  ${t('lobby.display_name')}
                  <input
                    .value=${this.name}
                    @input=${(event) => {
                      this.name = event.target.value;
                    }}
                    required
                  />
                </label>
                <label>
                  ${t('lobby.room_code')}
                  <input
                    .value=${this.roomId}
                    @input=${(event) => {
                      this.roomId = event.target.value.toUpperCase();
                    }}
                    required
                  />
                </label>
                <label>
                  ${t('lobby.signaling_url')}
                  <input
                    .value=${this.signalingUrl}
                    @input=${(event) => {
                      this.signalingUrl = event.target.value;
                    }}
                    required
                  />
                </label>
                ${this.mode === 'spectate'
                  ? html`<p class="hint">${t('lobby.spectate_hint')}</p>`
                  : html``}
                <button type="submit" class="secondary">
                  ${this.mode === 'spectate' ? t('lobby.spectate_room') : t('lobby.join_room')}
                </button>
              </form>
            `}
      </article>

      <section class="grid-2">
        <article>
          <h3>${t('lobby.status_title')}</h3>
          <p><strong>${connectionStatusLabel(appStore.connectionStatus)}</strong> - ${appStore.statusMessage}</p>
          ${appStore.errorMessage
            ? html`<p style="color: #b00020"><strong>${t('common.error')}:</strong> ${appStore.errorMessage}</p>`
            : html``}
          <p class="hint">${t('lobby.default_signaling')} <code>https://0.peerjs.com/</code></p>
        </article>

        ${checkpoint
          ? html`
              <article>
                <h3>${t('lobby.resume_session')}</h3>
                <p>
                  ${t('lobby.saved_room', {
                    roomId: checkpoint.roomId,
                    playerCount: checkpoint.playerCount,
                    phase: checkpoint.phase,
                  })}
                </p>
                <p>${t('lobby.last_checkpoint', { timestamp: checkpointDate })}</p>
                <div class="checkpoint-actions">
                  <button @click=${this.handleResumeHost}>
                    ${t('lobby.resume_room', { roomId: checkpoint.roomId })}
                  </button>
                  <button class="secondary outline" @click=${this.handleClearCheckpoint}>
                    ${t('lobby.delete_checkpoint')}
                  </button>
                </div>
              </article>
            `
          : html``}
      </section>
    `;
  }
}
