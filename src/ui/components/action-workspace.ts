/**
 * Responsibility: Renders the player's decision workspace during active gameplay.
 * It contains action-specific controls for tile placement, mergers, buying, and portfolio context.
 */

import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { PHASES } from '../../game/constants';
import { tileSortValue } from '../../game/utils';
import { renderChainBadge, renderStockHoldings } from './chain-display';
import { actorForPhase, totalStockCount } from './turn-utils';
import { formatTileLabel } from '../tile-label';

export function normalizeMergerTradeFrom(rawValue, maxTradeFrom, tradeUnit = 2) {
  const safeValue = Number.isFinite(rawValue) ? rawValue : 0;
  const normalizedUnit = Math.max(1, Number.isFinite(tradeUnit) ? tradeUnit : 1);
  const snapped = Math.floor(safeValue / normalizedUnit) * normalizedUnit;
  return Math.max(0, Math.min(maxTradeFrom, snapped));
}

export function normalizeMergerSell(rawValue, maxSell) {
  const safeValue = Number.isFinite(rawValue) ? rawValue : 0;
  return Math.max(0, Math.min(maxSell, Math.floor(safeValue)));
}

export function summarizeBuyQueue(buyQueue, chainsById, playerCash) {
  const selectedCost = buyQueue.reduce((sum, chainId) => sum + (chainsById[chainId]?.price || 0), 0);
  return {
    selectedCost,
    remainingCash: playerCash - selectedCost,
  };
}

function renderChainChoiceButtons(chainIds, actionType, chains, onSendAction) {
  return html`
    <div class="action-choice-grid">
      ${chainIds.map(
        (chainId) => html`
          <button class="secondary action-choice-btn" @click=${() => onSendAction({ type: actionType, chainId })}>
            ${renderChainBadge(chainId, chains, { compact: true })}
          </button>
        `,
      )}
    </div>
  `;
}

function renderActionPanel({
  state,
  legal,
  actingPlayerName,
  localPlayer,
  buyQueue,
  mergerSell,
  mergerTradeFrom,
  onSendAction,
  onAddBuy,
  onRemoveBuy,
  onCommitBuy,
  onSetMergerSell,
  onSetMergerTradeFrom,
  onSubmitMergerDecision,
}) {
  if (!legal?.allowed) {
    return html`<section class="action-content"><p>Waiting for game actions...</p></section>`;
  }

  const waitingName = actingPlayerName || 'another player';

  if (legal.phase === PHASES.AWAIT_TILE && !legal.isTurn) {
    return html`<section class="action-content"><p>Waiting for ${waitingName} to place a tile.</p></section>`;
  }

  if (legal.phase === PHASES.AWAIT_FOUND_CHAIN && (legal.foundingChoices || []).length === 0) {
    return html`<section class="action-content"><p>Waiting for ${waitingName} to choose a chain.</p></section>`;
  }

  if (legal.phase === PHASES.AWAIT_MERGER_SURVIVOR && (legal.survivorChoices || []).length === 0) {
    return html`
      <section class="action-content"><p>Waiting for ${waitingName} to choose the surviving chain.</p></section>
    `;
  }

  if (
    legal.phase === PHASES.AWAIT_MERGER_DEFUNCT_ORDER
    && (legal.defunctOrderChoices || []).length === 0
  ) {
    return html`<section class="action-content"><p>Waiting for ${waitingName} to choose merger order.</p></section>`;
  }

  if (legal.phase === PHASES.AWAIT_MERGER_DISPOSITION && !legal.mergerDisposition) {
    return html`<section class="action-content"><p>Waiting for ${waitingName} to resolve merger stock.</p></section>`;
  }

  if (legal.phase === PHASES.AWAIT_BUY && !legal.isTurn) {
    return html`<section class="action-content"><p>Waiting for ${waitingName} to buy stock.</p></section>`;
  }

  if (legal.phase === PHASES.AWAIT_TILE && legal.isTurn) {
    return html`
      <section class="action-content"><p>Place one tile from your tile panel, then buy up to 3 shares.</p></section>
    `;
  }

  if (legal.phase === PHASES.AWAIT_FOUND_CHAIN) {
    return html`
      <section class="action-content">
        <p class="action-heading"><strong>Choose New Chain</strong></p>
        ${renderChainChoiceButtons(legal.foundingChoices || [], 'CHOOSE_FOUNDING_CHAIN', state.chains, onSendAction)}
      </section>
    `;
  }

  if (legal.phase === PHASES.AWAIT_MERGER_SURVIVOR) {
    return html`
      <section class="action-content">
        <p class="action-heading"><strong>Choose Surviving Chain</strong></p>
        ${renderChainChoiceButtons(legal.survivorChoices || [], 'CHOOSE_MERGER_SURVIVOR', state.chains, onSendAction)}
      </section>
    `;
  }

  if (legal.phase === PHASES.AWAIT_MERGER_DEFUNCT_ORDER) {
    return html`
      <section class="action-content">
        <p class="action-heading"><strong>Choose Defunct Chain Order</strong></p>
        <p>Tied defunct chains must be handled in your selected order.</p>
        ${renderChainChoiceButtons(
          legal.defunctOrderChoices || [],
          'CHOOSE_MERGER_DEFUNCT_CHAIN',
          state.chains,
          onSendAction,
        )}
      </section>
    `;
  }

  if (legal.phase === PHASES.AWAIT_MERGER_DISPOSITION && legal.mergerDisposition) {
    const decision = legal.mergerDisposition;
    const maxTrade = decision.maxTradeFrom;
    const tradeUnit = Math.max(1, decision.tradeUnit || 2);

    const normalizedTrade = normalizeMergerTradeFrom(mergerTradeFrom, maxTrade, tradeUnit);
    if (mergerTradeFrom !== normalizedTrade) {
      onSetMergerTradeFrom(normalizedTrade);
    }

    const dynamicMaxSell = Math.max(0, decision.owned - normalizedTrade);
    const normalizedSell = normalizeMergerSell(mergerSell, dynamicMaxSell);
    if (mergerSell !== normalizedSell) {
      onSetMergerSell(normalizedSell);
    }

    const resultingHold = Math.max(0, decision.owned - normalizedTrade - normalizedSell);
    const gainedSurvivorShares = Math.floor(normalizedTrade / tradeUnit);
    const applyTradeValue = (nextTradeRaw) => {
      const nextTrade = normalizeMergerTradeFrom(nextTradeRaw, maxTrade, tradeUnit);
      onSetMergerTradeFrom(nextTrade);

      const nextSellCap = Math.max(0, decision.owned - nextTrade);
      const clampedSell = normalizeMergerSell(normalizedSell, nextSellCap);
      if (clampedSell !== normalizedSell) {
        onSetMergerSell(clampedSell);
      }
    };
    const applySellValue = (nextSellRaw) => {
      onSetMergerSell(normalizeMergerSell(nextSellRaw, dynamicMaxSell));
    };

    return html`
      <section class="action-content">
        <p class="action-heading"><strong>Merger Stock Decision</strong></p>
        <p>
          ${renderChainBadge(decision.defunctChainId, state.chains)} is being acquired by
          ${renderChainBadge(decision.survivingChainId, state.chains)}.
          <br />
          You hold ${decision.owned} share(s).
          ${renderChainBadge(decision.defunctChainId, state.chains, { compact: true })} sells for
          $${decision.defunctPrice} each.
        </p>
        <div class="merger-decision-grid">
          <div class="merger-control-card">
            <p class="action-heading"><strong>Trade Shares</strong></p>
            <p class="muted small">Trade in blocks of ${tradeUnit} to gain survivor shares.</p>
            <div class="merger-stepper">
              <button
                class="secondary merger-step-btn"
                ?disabled=${normalizedTrade <= 0}
                @click=${() => applyTradeValue(normalizedTrade - tradeUnit)}
                aria-label="Trade fewer shares"
              >
                -
              </button>
              <strong class="merger-step-value">${normalizedTrade}</strong>
              <button
                class="secondary merger-step-btn"
                ?disabled=${normalizedTrade >= maxTrade}
                @click=${() => applyTradeValue(normalizedTrade + tradeUnit)}
                aria-label="Trade more shares"
              >
                +
              </button>
            </div>
            <div class="merger-quick-actions">
              <button
                class="secondary outline merger-quick-btn"
                ?disabled=${normalizedTrade === 0}
                @click=${() => applyTradeValue(0)}
              >
                Clear
              </button>
              <button
                class="secondary outline merger-quick-btn"
                ?disabled=${normalizedTrade === maxTrade}
                @click=${() => applyTradeValue(maxTrade)}
              >
                Max Trade
              </button>
            </div>
          </div>
          <div class="merger-control-card">
            <p class="action-heading"><strong>Sell Shares</strong></p>
            <p class="muted small">Sell defunct shares for cash immediately.</p>
            <div class="merger-stepper">
              <button
                class="secondary merger-step-btn"
                ?disabled=${normalizedSell <= 0}
                @click=${() => applySellValue(normalizedSell - 1)}
                aria-label="Sell fewer shares"
              >
                -
              </button>
              <strong class="merger-step-value">${normalizedSell}</strong>
              <button
                class="secondary merger-step-btn"
                ?disabled=${normalizedSell >= dynamicMaxSell}
                @click=${() => applySellValue(normalizedSell + 1)}
                aria-label="Sell more shares"
              >
                +
              </button>
            </div>
            <div class="merger-quick-actions">
              <button
                class="secondary outline merger-quick-btn"
                ?disabled=${normalizedSell === 0}
                @click=${() => applySellValue(0)}
              >
                Clear
              </button>
              <button
                class="secondary outline merger-quick-btn"
                ?disabled=${normalizedSell === dynamicMaxSell}
                @click=${() => applySellValue(dynamicMaxSell)}
              >
                Sell All
              </button>
            </div>
          </div>
        </div>
        <p class="muted small">
          Result: gain ${gainedSurvivorShares} survivor share(s), hold ${resultingHold} defunct share(s), and sell
          ${normalizedSell} share(s).
        </p>
        <button @click=${() => onSubmitMergerDecision(normalizedSell, normalizedTrade)}>
          Submit Decision
        </button>
      </section>
    `;
  }

  if (legal.phase === PHASES.AWAIT_BUY && legal.isTurn) {
    const chainsById = Object.fromEntries(state.chains.map((chain) => [chain.id, chain]));
    const { remainingCash } = summarizeBuyQueue(buyQueue, chainsById, localPlayer?.cash || 0);

    return html`
      <section class="action-content action-buy">
        <p class="action-heading"><strong>Buy Stocks</strong></p>
        <p class="buy-summary">
          Select up to 3 shares. Cash after queued buys: <strong>$${remainingCash}</strong>.
        </p>
        <div class="grid-2 buy-confirm-grid">
          <button @click=${() => onCommitBuy(false)}>End Turn</button>
          ${legal.canEndGame
            ? html`<button class="secondary" @click=${() => onCommitBuy(true)}>Confirm Buy And End Game</button>`
            : html``}
        </div>
        ${state.pendingEndGameRequest
          ? html`
              <p class="muted small">
                <strong>End game is declared.</strong> Confirm this buy/pass to finish the game.
              </p>
            `
          : html``}
        <div class="buy-token-picker">
          ${state.chains
            .filter((chain) => chain.active)
            .map((chain) => {
              const selectedForChain = buyQueue.filter((chainId) => chainId === chain.id).length;
              const displayAvailableShares = Math.max(0, chain.availableShares - selectedForChain);
              const canAdd =
                buyQueue.length < 3
                && displayAvailableShares > 0
                && chain.price > 0
                && chain.price <= remainingCash;

              return html`
                <button
                  class="secondary action-choice-btn buy-chain-token"
                  ?disabled=${!canAdd}
                  @click=${() => onAddBuy(chain.id)}
                  title=${`${chain.name}: ${displayAvailableShares} share(s) available`}
                >
                  ${renderChainBadge(chain.id, state.chains, { compact: true })}
                  ${selectedForChain
                    ? html`<span class="buy-chain-count">${selectedForChain}</span>`
                    : html``}
                </button>
              `;
            })}
        </div>
        <p class="muted small buy-token-hint">Tap chain tokens to queue shares. Use rail cards for detailed pricing.</p>

        <div class="buy-queue">
          <p class="action-heading"><strong>Shares To Buy</strong></p>
          ${buyQueue.length
            ? html`
                <div class="action-choice-grid buy-queue-list">
                  ${buyQueue.map(
                    (chainId, index) => html`
                      <button class="secondary action-choice-btn buy-queue-chip" @click=${() => onRemoveBuy(index)}>
                        ${renderChainBadge(chainId, state.chains, { compact: true })}
                        <span aria-hidden="true">×</span>
                      </button>
                    `,
                  )}
                </div>
              `
            : html`<p class="muted">None</p>`}
        </div>
      </section>
    `;
  }

  return html`<section class="action-content"><p>Waiting for action...</p></section>`;
}

export function renderDecisionWorkspace({
  state,
  localPlayer,
  buyQueue,
  mergerSell,
  mergerTradeFrom,
  tilePreviewId = '',
  pendingPlaceTileId = '',
  excelStyleCoordinates = false,
  onSendAction,
  onSelectTile,
  onAddBuy,
  onRemoveBuy,
  onCommitBuy,
  onSetMergerSell,
  onSetMergerTradeFrom,
  onSubmitMergerDecision,
}) {
  const legal = state.legalActions;
  const actorId = actorForPhase(state);
  const actingPlayer = state.players.find((player) => player.id === actorId);
  const canPlaceTileNow = legal?.phase === PHASES.AWAIT_TILE && Boolean(legal?.isTurn);
  const playableTiles = new Set(legal?.playableTiles || []);
  const shareCount = totalStockCount(localPlayer?.stocks);
  const sortedTiles = localPlayer
    ? [...localPlayer.tiles].sort((left, right) => tileSortValue(left) - tileSortValue(right))
    : [];
  const tilesSection = html`
    <section class="tiles-box">
      <p class="action-heading">
        <strong>Your Tiles</strong>
        ${localPlayer
          ? html`<span class="muted small">(${playableTiles.size} playable / ${localPlayer.tiles.length} total)</span>`
          : html``}
      </p>
      ${localPlayer
        ? html`
            <div class="hand">
              ${repeat(sortedTiles, (tileId) => tileId, (tileId) => {
                const playable = playableTiles.has(tileId);
                const isPreviewed = tilePreviewId === tileId;
                const showPlayPrompt = canPlaceTileNow && playable && pendingPlaceTileId === tileId;
                const classes = ['tile-chip'];

                if (playable) {
                  classes.push('tile-playable');
                } else {
                  classes.push('secondary');
                  if (canPlaceTileNow) {
                    classes.push('tile-muted');
                  }
                }

                if (isPreviewed) {
                  classes.push('tile-previewed');
                }

                if (showPlayPrompt) {
                  classes.push('tile-awaiting-play-confirm');
                }

                return html`
                  <button
                    @click=${() => onSelectTile(tileId)}
                    class=${classes.join(' ')}
                  >
                    <span class="tile-chip-id">${formatTileLabel(tileId, excelStyleCoordinates)}</span>
                    ${showPlayPrompt ? html`<span class="tile-chip-play-prompt">play?</span>` : html``}
                  </button>
                `;
              })}
            </div>
            <p class="muted small">
              ${canPlaceTileNow
                ? 'Click a playable hand tile or board target to preview it, then click the same spot again to place it.'
                : 'Click any hand tile to preview its board location. Placement is enabled during your tile phase.'}
            </p>
            ${canPlaceTileNow && legal?.canSkipTile
              ? html`
                  <button class="secondary" @click=${() => onSendAction({ type: 'SKIP_TILE' })}>
                    Skip Tile Placement
                  </button>
                `
              : html``}
          `
        : html`<p>No local hand available.</p>`}
    </section>
  `;

  return html`
    <article class="decision-workspace">
      <h3>Player</h3>

      <section class="portfolio-box">
        <p class="portfolio-line">
          <span>Cash</span>
          <strong>$${localPlayer?.cash || 0}</strong>
        </p>
        <p class="portfolio-line">
          <span>Total Shares</span>
          <strong>${shareCount}</strong>
        </p>
        <p class="portfolio-line portfolio-line-stocks">
          <span>Stocks</span>
          <strong>
            ${localPlayer
              ? renderStockHoldings(localPlayer.stocks, state.chains)
              : 'No local player data available.'}
          </strong>
        </p>
      </section>

      ${tilesSection}

      ${renderActionPanel({
        state,
        legal,
        actingPlayerName: actingPlayer?.name || 'another player',
        localPlayer,
        buyQueue,
        mergerSell,
        mergerTradeFrom,
        onSendAction,
        onAddBuy,
        onRemoveBuy,
        onCommitBuy,
        onSetMergerSell,
        onSetMergerTradeFrom,
        onSubmitMergerDecision,
      })}

      ${legal?.canEndGame && !state.pendingEndGameRequest
        ? html`
            <section class="action-content">
              <p class="action-heading"><strong>End Game</strong></p>
              <p class="muted small">Declare that the game should end after this turn's buy/pass resolution.</p>
              <button class="secondary" @click=${() => onSendAction({ type: 'DECLARE_END_GAME' })}>
                Declare End Game
              </button>
            </section>
          `
        : html``}
    </article>
  `;
}
