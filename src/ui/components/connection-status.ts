/**
 * Responsibility: Provides consistent connection-state UI across room/game screens.
 * It supports inline/pill variants with optional text hiding and shared tones.
 */

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { connectionStatusLabel, subscribeToLocaleChanges } from '../i18n';

const STATUS_META = {
  connected: { tone: 'positive' },
  online: { tone: 'positive' },
  connecting: { tone: 'warning' },
  disconnected: { tone: 'negative' },
  offline: { tone: 'negative' },
  idle: { tone: 'neutral' },
} as const;

const SUPPORTED_STATUSES = new Set(Object.keys(STATUS_META));
const SUPPORTED_VARIANTS = new Set(['inline', 'pill', 'dot']);

type StatusKey = keyof typeof STATUS_META;

function normalizeStatus(value: unknown): StatusKey {
  const raw = String(value || '').trim().toLowerCase();
  return (SUPPORTED_STATUSES.has(raw) ? raw : 'idle') as StatusKey;
}

function normalizeVariant(value: unknown): 'inline' | 'pill' | 'dot' {
  const raw = String(value || '').trim().toLowerCase();
  return (SUPPORTED_VARIANTS.has(raw) ? raw : 'inline') as 'inline' | 'pill' | 'dot';
}

@customElement('connection-status')
export class ConnectionStatus extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      color: var(--pico-color);
      vertical-align: middle;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 0.34rem;
      line-height: 1;
    }

    .status-no-text {
      gap: 0;
    }

    .status-pill {
      padding: 0.12rem 0.46rem;
      border-radius: 999px;
      border: 1px solid var(--status-border);
      background: var(--status-bg);
    }

    .status-dot {
      inline-size: var(--connection-status-dot-size, 0.52rem);
      block-size: var(--connection-status-dot-size, 0.52rem);
      border-radius: 999px;
      background: var(--status-dot);
      border: 1px solid var(--status-dot-border);
      flex: none;
    }

    .status-label {
      font-size: var(--connection-status-font-size, 0.74rem);
      font-weight: 600;
      color: inherit;
    }

    .tone-positive {
      --status-dot: #16a34a;
      --status-dot-border: #15803d;
      --status-bg: rgba(22, 163, 74, 0.15);
      --status-border: rgba(22, 163, 74, 0.4);
    }

    .tone-warning {
      --status-dot: #eab308;
      --status-dot-border: #ca8a04;
      --status-bg: rgba(234, 179, 8, 0.16);
      --status-border: rgba(234, 179, 8, 0.42);
    }

    .tone-negative {
      --status-dot: #ef4444;
      --status-dot-border: #dc2626;
      --status-bg: rgba(239, 68, 68, 0.16);
      --status-border: rgba(239, 68, 68, 0.38);
    }

    .tone-neutral {
      --status-dot: #94a3b8;
      --status-dot-border: #64748b;
      --status-bg: rgba(148, 163, 184, 0.18);
      --status-border: rgba(148, 163, 184, 0.4);
    }
  `;

  @property({ type: String })
  status = 'idle';

  @property({ type: String })
  variant = 'inline';

  @property({ type: String, attribute: 'label' })
  customLabel = '';

  @property({ type: Boolean, attribute: 'hide-text' })
  hideText = false;

  private localeUnsubscribe: (() => void) | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.localeUnsubscribe = subscribeToLocaleChanges(() => {
      this.requestUpdate();
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.localeUnsubscribe) {
      this.localeUnsubscribe();
      this.localeUnsubscribe = null;
    }
  }

  private getStatusMeta() {
    const statusKey = normalizeStatus(this.status);
    const meta = STATUS_META[statusKey];
    return {
      tone: meta.tone,
      label: this.customLabel?.trim() || connectionStatusLabel(statusKey),
    };
  }

  render() {
    const normalizedVariant = normalizeVariant(this.variant);
    const meta = this.getStatusMeta();
    const toneClass = `tone-${meta.tone}`;
    const shouldHideText = this.hideText || normalizedVariant === 'dot';
    const classes = ['status', toneClass];
    if (normalizedVariant === 'pill') {
      classes.push('status-pill');
    }
    if (shouldHideText) {
      classes.push('status-no-text');
    }

    if (shouldHideText) {
      return html`
        <span
          class=${classes.join(' ')}
          role="img"
          aria-label=${meta.label}
          title=${meta.label}
        >
          <span class="status-dot" aria-hidden="true"></span>
        </span>
      `;
    }

    return html`
      <span class=${classes.join(' ')}>
        <span class="status-dot" aria-hidden="true"></span>
        <span class="status-label">${meta.label}</span>
      </span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'connection-status': ConnectionStatus;
  }
}
