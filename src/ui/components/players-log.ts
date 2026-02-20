/**
 * Responsibility: Renders player and game-log modal contents.
 * It provides table/log views while enforcing hidden-opponent-stock visibility rules.
 */

import { html } from 'lit';
import { renderChainNamesInText, renderLastBuy, renderStockHoldings } from './chain-display';
import { formatCurrency, t } from '../i18n';

export function renderPlayersPanel(state, orderedPlayers, localPlayerId) {
  return html`
    <section>
      <div class="table-wrap">
        <table class="players-table">
          <thead>
            <tr>
              <th>${t('lobby.table_name')}</th>
              <th>${t('common.cash')}</th>
              <th>${t('common.tiles')}</th>
              <th>${t('common.stocks')}</th>
              <th>${t('players.last_buy')}</th>
              <th>${t('lobby.table_status')}</th>
            </tr>
          </thead>
          <tbody>
            ${orderedPlayers.map(
              (player) => html`
                <tr>
                  <td>${player.name}${player.id === state.currentPlayerId ? ' *' : ''}</td>
                  <td>${formatCurrency(player.cash)}</td>
                  <td>${player.tileCount}</td>
                  <td>${player.id === localPlayerId ? renderStockHoldings(player.stocks, state.chains) : t('lobby.hidden')}</td>
                  <td>${renderLastBuy(player.lastBuy, state.chains)}</td>
                  <td>${player.connected ? t('common.connected') : t('common.offline')}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function renderLogPanel(state) {
  const entries = [...state.log].reverse();

  return html`
    <section>
      <div class="log">
        <ol>
          ${entries.map((entry) => html`<li>${renderChainNamesInText(entry, state.chains)}</li>`)}
        </ol>
      </div>
    </section>
  `;
}
