/**
 * Responsibility: Renders the rules/price quick-reference card.
 * It transforms share-price brackets and manual sections for in-game reference/manual modals.
 */

import { html } from 'lit';
import { HOTELS, PRICE_BRACKETS } from '../../game/constants';
import { renderChainBadge } from './chain-display';
import { getActiveLocale, t } from '../i18n';
import { getManualTranscript } from './manual-transcripts';

type ReferenceCardOptions = {
  onOpenManual?: () => void;
};

type UserManualCardOptions = {
  onBackToReference?: () => void;
};

export function buildManualGlossaryEntries() {
  return [
    {
      term: 'Chain (Hotel Chain)',
      definition: 'A branded group of connected tiles on the board.',
    },
    {
      term: 'Share',
      definition: 'One stock certificate in a chain. Players buy and hold shares.',
    },
    {
      term: 'Active Chain',
      definition: 'A chain currently on the board and available for share purchases.',
    },
    {
      term: 'Safe Chain',
      definition: 'A chain of size 11+; it cannot be removed by merger.',
    },
    {
      term: 'Defunct Chain',
      definition: 'A chain removed during a merger after bonuses and share disposition.',
    },
    {
      term: 'Unincorporated Tile',
      definition: 'A tile on the board that is not currently part of any chain.',
    },
  ];
}

export function buildManualTurnSteps() {
  return [
    'Place one tile from your hand.',
    'If needed, found a chain or resolve a merger.',
    'Buy up to 3 shares (or pass).',
    'Draw back up to your normal hand size.',
  ];
}

export function rangeLabel(min, max) {
  if (max === Number.POSITIVE_INFINITY) {
    return `${min}+`;
  }

  if (min === max) {
    return `${min}`;
  }

  return `${min}-${max}`;
}

export function buildReferenceRows() {
  return PRICE_BRACKETS.map((bracket) => ({
    sizeRange: rangeLabel(bracket.min, bracket.max),
    cheapPrice: bracket.cheap,
    mediumPrice: bracket.medium,
    expensivePrice: bracket.expensive,
  }));
}

const REFERENCE_ROWS = buildReferenceRows();

export function renderReferenceCard({ onOpenManual }: ReferenceCardOptions = {}) {
  return html`
    <section class="reference-card">
      <p><strong>${t('reference.turn')}:</strong> ${t('reference.turn_rule')}</p>
      <p><strong>${t('reference.mergers')}:</strong> ${t('reference.mergers_rule')}</p>
      <p><strong>${t('reference.bonuses')}:</strong> ${t('reference.bonuses_rule')}</p>
      <p><strong>${t('reference.safety')}:</strong> ${t('reference.safety_rule')}</p>
      <p><strong>${t('reference.end')}:</strong> ${t('reference.end_rule')}</p>

      <h4>${t('reference.stock_price')}</h4>
      <div class="table-wrap">
        <table class="reference-table">
          <thead>
            <tr>
              <th>${t('reference.chain_size')}</th>
              <th>
                ${t('reference.cheap')}
                <span class="reference-chain-row">
                  ${renderChainBadge('tower', HOTELS, { compact: true })}
                  ${renderChainBadge('luxor', HOTELS, { compact: true })}
                  ${renderChainBadge('american', HOTELS, { compact: true })}
                </span>
              </th>
              <th>
                ${t('reference.medium')}
                <span class="reference-chain-row">
                  ${renderChainBadge('festival', HOTELS, { compact: true })}
                  ${renderChainBadge('worldwide', HOTELS, { compact: true })}
                </span>
              </th>
              <th>
                ${t('reference.expensive')}
                <span class="reference-chain-row">
                  ${renderChainBadge('imperial', HOTELS, { compact: true })}
                  ${renderChainBadge('continental', HOTELS, { compact: true })}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            ${REFERENCE_ROWS.map(
              (row) => html`
                <tr>
                  <td>${row.sizeRange}</td>
                  <td>$${row.cheapPrice}</td>
                  <td>$${row.mediumPrice}</td>
                  <td>$${row.expensivePrice}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>

      ${typeof onOpenManual === 'function'
        ? html`
            <div class="reference-actions">
              <button class="secondary" type="button" @click=${() => onOpenManual()}>
                ${t('room.open_manual')}
              </button>
            </div>
          `
        : html``}
    </section>
  `;
}

export function renderUserManualCard({ onBackToReference }: UserManualCardOptions = {}) {
  const manualTranscript = getManualTranscript(getActiveLocale());

  return html`
    <section class="reference-card manual-card">
      <pre class="manual-transcript">${manualTranscript}</pre>

      ${typeof onBackToReference === 'function'
        ? html`
            <div class="reference-actions">
              <button class="secondary" type="button" @click=${() => onBackToReference()}>
                ${t('room.back_to_reference')}
              </button>
            </div>
          `
        : html``}
    </section>
  `;
}
