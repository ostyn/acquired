import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {
  getActiveLocale,
  getSupportedLocales,
  setActiveLocale,
  subscribeToLocaleChanges,
  t,
  type LocaleCode,
} from '../i18n';

@customElement('locale-switcher')
export class LocaleSwitcher extends LitElement {
  static styles = css`
    :host {
      position: relative;
      display: inline-flex;
      align-items: center;
      z-index: 8;
    }

    .locale-btn {
      inline-size: 2.35rem;
      block-size: 2.35rem;
      border-radius: 999px;
      border: 1px solid var(--theme-toggle-border);
      background: var(--theme-toggle-bg);
      box-shadow: var(--theme-toggle-shadow);
      color: var(--pico-color);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
    }

    .locale-btn:hover,
    .locale-btn:focus-visible {
      border-color: var(--pico-primary);
      outline: none;
    }

    .locale-icon {
      inline-size: 1.2rem;
      block-size: 1.2rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
      display: block;
    }

    .locale-menu {
      position: absolute;
      top: calc(100% + 0.35rem);
      right: 0;
      min-width: 8.6rem;
      border: 1px solid var(--panel-border);
      border-radius: 0.65rem;
      background: var(--pico-card-background-color);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
      padding: 0.25rem;
      display: grid;
      gap: 0.2rem;
    }

    .locale-option {
      width: 100%;
      text-align: left;
      border: 1px solid transparent;
      background: transparent;
      color: var(--pico-color);
      padding: 0.4rem 0.5rem;
      border-radius: 0.45rem;
      font-size: 0.84rem;
      cursor: pointer;
    }

    .locale-option:hover,
    .locale-option:focus-visible {
      border-color: var(--pico-primary);
      background: color-mix(in srgb, var(--pico-primary) 14%, transparent);
      outline: none;
    }

    .locale-option.active {
      background: color-mix(in srgb, var(--pico-primary) 20%, transparent);
      border-color: color-mix(in srgb, var(--pico-primary) 55%, transparent);
      font-weight: 650;
    }

    @media (max-width: 768px) {
      .locale-menu {
        right: 0;
        left: auto;
      }
    }
  `;

  @state()
  private open = false;

  private localeUnsubscribe: (() => void) | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.localeUnsubscribe = subscribeToLocaleChanges(() => {
      this.requestUpdate();
    });
    window.addEventListener('click', this.handleWindowClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.localeUnsubscribe) {
      this.localeUnsubscribe();
      this.localeUnsubscribe = null;
    }
    window.removeEventListener('click', this.handleWindowClick);
  }

  private handleWindowClick = (event: MouseEvent) => {
    if (!this.open) {
      return;
    }

    const path = event.composedPath();
    if (!path.includes(this)) {
      this.open = false;
    }
  };

  private toggleMenu(event: Event) {
    event.stopPropagation();
    this.open = !this.open;
  }

  private async selectLocale(locale: LocaleCode) {
    await setActiveLocale(locale);
    this.open = false;
  }

  private getLocaleLabel(locale: LocaleCode): string {
    switch (locale) {
      case 'es':
        return t('locale.spanish');
      case 'fr':
        return t('locale.french');
      case 'bg':
        return t('locale.bulgarian');
      case 'en':
      default:
        return t('locale.english');
    }
  }

  render() {
    const activeLocale = getActiveLocale();
    const toggleLabel = t('locale.switch');

    return html`
      <button
        class="locale-btn"
        type="button"
        @click=${(event: Event) => this.toggleMenu(event)}
        aria-label=${toggleLabel}
        title=${toggleLabel}
        aria-haspopup="menu"
        aria-expanded=${String(this.open)}
      >
        <svg class="locale-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 5h12"></path>
          <path d="M8 5v1a10 10 0 0 1-4 8"></path>
          <path d="M5 10c1.5 0 3 .6 4 1.7"></path>
          <path d="M12 19l4-10 4 10"></path>
          <path d="M13.5 15h5"></path>
        </svg>
      </button>

      ${this.open
        ? html`
            <div class="locale-menu" role="menu" @click=${(event: Event) => event.stopPropagation()}>
              ${getSupportedLocales().map((locale) => {
                const selected = locale === activeLocale;
                return html`
                  <button
                    class=${`locale-option ${selected ? 'active' : ''}`}
                    type="button"
                    role="menuitemradio"
                    aria-checked=${String(selected)}
                    @click=${() => this.selectLocale(locale)}
                  >
                    ${this.getLocaleLabel(locale)}
                  </button>
                `;
              })}
            </div>
          `
        : html``}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'locale-switcher': LocaleSwitcher;
  }
}
