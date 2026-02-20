/**
 * Responsibility: Renders the chain market summary used for buying and merger decisions.
 * It groups chains by active/inactive status and exposes key market metadata.
 */

import { html } from 'lit';
import { renderChainBadge } from './chain-display';
import { t } from '../i18n';

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
              ${chain.safe ? html`<span class="chain-market-tag">${t('common.safe')}</span>` : html``}
            </div>
            <div class="chain-market-meta">
              <span>${chain.active ? `${t('common.size')} ${chain.size}` : t('common.inactive')}</span>
              ${chain.active ? html`<span>${t('common.price')} $${chain.price}</span>` : html``}
              <span>${t('common.shares')} ${chain.availableShares}</span>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

export function renderChainPanel(state, title = t('common.actions')) {
  const { activeChains, inactiveChains } = splitChainsByActivity(state.chains);

  return html`
    <article class="chain-market-panel">
      <h3>${title}</h3>
      <p class="muted small">${t('chain.market_hint')}</p>
      ${activeChains.length
        ? renderChainMarketRows(activeChains, state.chains)
        : html`<p class="muted small">${t('common.none')}</p>`}

      <details class="chain-market-inactive" ?open=${activeChains.length === 0}>
        <summary>${t('common.inactive')} (${inactiveChains.length})</summary>
        ${renderChainMarketRows(inactiveChains, state.chains)}
      </details>
    </article>
  `;
}
