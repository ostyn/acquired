/**
 * Responsibility: Provides a reusable modal container used across room overlays.
 * It handles backdrop behavior and consistent dialog chrome.
 */

import { html } from 'lit';

export function renderModal(title, body, onClose, modalClass = '') {
  return html`
    <div class="modal-backdrop" @click=${() => onClose()}>
      <section
        class=${`modal-card ${modalClass}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label=${title}
        @click=${(event) => event.stopPropagation()}
      >
        <header class="modal-header">
          <h3>${title}</h3>
          <button class="secondary" @click=${() => onClose()}>Close</button>
        </header>
        <div class="modal-body">${body}</div>
      </section>
    </div>
  `;
}
