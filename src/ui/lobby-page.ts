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
  private mode: 'host' | 'join' = 'host';

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
      appStore.hostCheckpointMeta;
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.disposeReaction) {
      this.disposeReaction();
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
      appStore.setError('Room code is required.');
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
      ? new Date(checkpoint.savedAt).toLocaleString()
      : 'Unknown';
    const toggleLabel = this.themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

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

      <article class="lobby-mode-panel">
        <h2>Start Playing</h2>
        <p class="lead">Choose whether you are hosting the room or joining an existing one.</p>

        <div class="mode-tabs" role="tablist" aria-label="Lobby mode">
          <button
            type="button"
            class=${`secondary ${this.mode === 'host' ? 'is-active' : ''}`}
            @click=${() => {
              this.mode = 'host';
            }}
          >
            Host
          </button>
          <button
            type="button"
            class=${`secondary ${this.mode === 'join' ? 'is-active' : ''}`}
            @click=${() => {
              this.mode = 'join';
            }}
          >
            Join
          </button>
        </div>

        ${this.mode === 'host'
          ? html`
              <form @submit=${this.handleCreateRoom}>
                <label>
                  Display Name
                  <input
                    .value=${this.name}
                    @input=${(event) => {
                      this.name = event.target.value;
                    }}
                    required
                  />
                </label>
                <label>
                  Signaling URL
                  <input
                    .value=${this.signalingUrl}
                    @input=${(event) => {
                      this.signalingUrl = event.target.value;
                    }}
                    required
                  />
                </label>
                <p class="hint">Hosting is authoritative. Other players connect to your room code.</p>
                <button type="submit">Create Room</button>
              </form>
            `
          : html`
              <form @submit=${this.handleJoinRoom}>
                <label>
                  Display Name
                  <input
                    .value=${this.name}
                    @input=${(event) => {
                      this.name = event.target.value;
                    }}
                    required
                  />
                </label>
                <label>
                  Room Code
                  <input
                    .value=${this.roomId}
                    @input=${(event) => {
                      this.roomId = event.target.value.toUpperCase();
                    }}
                    required
                  />
                </label>
                <label>
                  Signaling URL
                  <input
                    .value=${this.signalingUrl}
                    @input=${(event) => {
                      this.signalingUrl = event.target.value;
                    }}
                    required
                  />
                </label>
                <button type="submit" class="secondary">Join Room</button>
              </form>
            `}
      </article>

      <section class="grid-2">
        <article>
          <h3>Status</h3>
          <p><strong>${appStore.connectionStatus}</strong> - ${appStore.statusMessage}</p>
          ${appStore.errorMessage
            ? html`<p style="color: #b00020"><strong>Error:</strong> ${appStore.errorMessage}</p>`
            : html``}
          <p class="hint">Default signaling endpoint: <code>https://0.peerjs.com/</code></p>
        </article>

        ${checkpoint
          ? html`
              <article>
                <h3>Resume Host Session</h3>
                <p>
                  Saved room <strong>${checkpoint.roomId}</strong> (${checkpoint.playerCount} players, phase:
                  <code>${checkpoint.phase}</code>).
                </p>
                <p>Last checkpoint: ${checkpointDate}</p>
                <div class="checkpoint-actions">
                  <button @click=${this.handleResumeHost}>Resume Room ${checkpoint.roomId}</button>
                  <button class="secondary outline" @click=${this.handleClearCheckpoint}>
                    Delete Saved Checkpoint
                  </button>
                </div>
              </article>
            `
          : html``}
      </section>
    `;
  }
}
