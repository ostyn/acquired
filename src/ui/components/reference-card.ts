/**
 * Responsibility: Renders the rules/price quick-reference card.
 * It transforms stock-price brackets into table rows used by the in-game reference modal.
 */

import { html } from 'lit';
import { HOTELS, PRICE_BRACKETS } from '../../game/constants';
import { renderChainBadge } from './chain-display';

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
      <p><strong>Turn:</strong> Place 1 tile, then buy up to 3 shares (or pass).</p>
      <p><strong>Mergers:</strong> Sell, trade 2:1, hold, or combine.</p>
      <p><strong>Bonuses:</strong> Majority 10x price, minority 5x price.</p>
      <p><strong>Safety:</strong> Chain size 11+ is safe and cannot be removed.</p>
      <p><strong>End:</strong> Any chain 41+ or all active chains safe.</p>

      <h4>Stock Price By Chain Size</h4>
      <div class="table-wrap">
        <table class="reference-table">
          <thead>
            <tr>
              <th>Chain Size</th>
              <th>
                Cheap
                <span class="reference-chain-row">
                  ${renderChainBadge('tower', HOTELS, { compact: true })}
                  ${renderChainBadge('luxor', HOTELS, { compact: true })}
                  ${renderChainBadge('american', HOTELS, { compact: true })}
                </span>
              </th>
              <th>
                Medium
                <span class="reference-chain-row">
                  ${renderChainBadge('festival', HOTELS, { compact: true })}
                  ${renderChainBadge('worldwide', HOTELS, { compact: true })}
                </span>
              </th>
              <th>
                Expensive
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
