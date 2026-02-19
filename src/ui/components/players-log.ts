/**
 * Responsibility: Renders player and game-log modal contents.
 * It provides table/log views while enforcing hidden-opponent-stock visibility rules.
 */

import { html } from 'lit';
import { renderChainNamesInText, renderLastBuy, renderStockHoldings } from './chain-display';

export function renderPlayersPanel(state, orderedPlayers, localPlayerId) {
  return html`
    <section>
      <div class="table-wrap">
        <table class="players-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Cash</th>
              <th>Tiles</th>
              <th>Stocks</th>
              <th>Last Buy</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${orderedPlayers.map(
              (player) => html`
                <tr>
                  <td>${player.name}${player.id === state.currentPlayerId ? ' *' : ''}</td>
                  <td>$${player.cash}</td>
                  <td>${player.tileCount}</td>
                  <td>${player.id === localPlayerId ? renderStockHoldings(player.stocks, state.chains) : 'Hidden'}</td>
                  <td>${renderLastBuy(player.lastBuy, state.chains)}</td>
                  <td>${player.connected ? 'Connected' : 'Offline'}</td>
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
