/**
 * Responsibility: Renders the chain market summary used for buying and merger decisions.
 * It groups chains by active/inactive status and exposes key market metadata.
 */

import { html } from 'lit';
import { renderChainBadge } from './chain-display';

export function splitChainsByActivity(chains) {
  return {
    activeChains: chains.filter((chain) => chain.active).sort((left, right) => right.size - left.size),
    inactiveChains: chains.filter((chain) => !chain.active),
  };
}

function renderChainMarketRows(chains, allChains) {
  return html`
    <div class="chain-market-list">
      ${chains.map(
        (chain) => html`
          <div class="chain-market-row" style=${`border-left-color:${chain.color};`}>
            <div class="chain-market-row-top">
              ${renderChainBadge(chain.id, allChains)}
              ${chain.safe ? html`<span class="chain-market-tag">Safe</span>` : html``}
            </div>
            <div class="chain-market-meta">
              <span>${chain.active ? `Size ${chain.size}` : 'Inactive'}</span>
              ${chain.active ? html`<span>Price $${chain.price}</span>` : html``}
              <span>Shares ${chain.availableShares}</span>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

export function renderChainPanel(state, title = 'Chains') {
  const { activeChains, inactiveChains } = splitChainsByActivity(state.chains);

  return html`
    <article class="chain-market-panel">
      <h3>${title}</h3>
      <p class="muted small">Prioritize active chains for buying and merger decisions.</p>
      ${activeChains.length
        ? renderChainMarketRows(activeChains, state.chains)
        : html`<p class="muted small">No active chains on the board yet.</p>`}

      <details class="chain-market-inactive" ?open=${activeChains.length === 0}>
        <summary>Inactive Chains (${inactiveChains.length})</summary>
        ${renderChainMarketRows(inactiveChains, state.chains)}
      </details>
    </article>
  `;
}
