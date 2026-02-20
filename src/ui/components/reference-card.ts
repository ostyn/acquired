/**
 * Responsibility: Renders the rules/price quick-reference card.
 * It transforms stock-price brackets into table rows used by the in-game reference modal.
 */

import { html } from 'lit';
import { HOTELS, PRICE_BRACKETS } from '../../game/constants';
import { renderChainBadge } from './chain-display';
import { t } from '../i18n';

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

export function renderReferenceCard() {
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
    </section>
  `;
}
