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
import { formatCurrency, getChainDisplayName, t } from '../i18n';

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
    return html`<section class="action-content"><p>${t('workspace.waiting_actions')}</p></section>`;
  }

  const waitingName = actingPlayerName || t('common.player').toLowerCase();

  if (legal.phase === PHASES.AWAIT_TILE && !legal.isTurn) {
    return html`<section class="action-content"><p>${t('workspace.waiting_tile', { name: waitingName })}</p></section>`;
  }

  if (legal.phase === PHASES.AWAIT_FOUND_CHAIN && (legal.foundingChoices || []).length === 0) {
    return html`<section class="action-content"><p>${t('workspace.waiting_chain_choice', { name: waitingName })}</p></section>`;
  }

  if (legal.phase === PHASES.AWAIT_MERGER_SURVIVOR && (legal.survivorChoices || []).length === 0) {
    return html`
      <section class="action-content"><p>${t('workspace.waiting_survivor', { name: waitingName })}</p></section>
    `;
  }

  if (
    legal.phase === PHASES.AWAIT_MERGER_DEFUNCT_ORDER
    && (legal.defunctOrderChoices || []).length === 0
  ) {
    return html`<section class="action-content"><p>${t('workspace.waiting_defunct_order', { name: waitingName })}</p></section>`;
  }

  if (legal.phase === PHASES.AWAIT_MERGER_DISPOSITION && !legal.mergerDisposition) {
    return html`<section class="action-content"><p>${t('workspace.waiting_merger_disposition', { name: waitingName })}</p></section>`;
  }

  if (legal.phase === PHASES.AWAIT_BUY && !legal.isTurn) {
    return html`<section class="action-content"><p>${t('workspace.waiting_buy', { name: waitingName })}</p></section>`;
  }

  if (legal.phase === PHASES.AWAIT_FOUND_CHAIN) {
    return html`
      <section class="action-content">
        <p class="action-heading"><strong>${t('workspace.choose_new_chain')}</strong></p>
        ${renderChainChoiceButtons(legal.foundingChoices || [], 'CHOOSE_FOUNDING_CHAIN', state.chains, onSendAction)}
      </section>
    `;
  }

  if (legal.phase === PHASES.AWAIT_MERGER_SURVIVOR) {
    return html`
      <section class="action-content">
        <p class="action-heading"><strong>${t('workspace.choose_surviving_chain')}</strong></p>
        ${renderChainChoiceButtons(legal.survivorChoices || [], 'CHOOSE_MERGER_SURVIVOR', state.chains, onSendAction)}
      </section>
    `;
  }

  if (legal.phase === PHASES.AWAIT_MERGER_DEFUNCT_ORDER) {
    return html`
      <section class="action-content">
        <p class="action-heading"><strong>${t('workspace.choose_defunct_order')}</strong></p>
        <p>${t('workspace.defunct_order_help')}</p>
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
        <p class="action-heading"><strong>${t('workspace.merger_decision')}</strong></p>
        <p>
          ${t('workspace.merger_acquire', {
            defunct: getChainDisplayName(decision.defunctChainId),
            survivor: getChainDisplayName(decision.survivingChainId),
          })}
          <br />
          ${t('workspace.you_hold_shares', { count: decision.owned })}
          ${t('workspace.sell_value', {
            defunct: getChainDisplayName(decision.defunctChainId),
            price: decision.defunctPrice,
          })}
        </p>
        <div class="merger-decision-grid">
          <div class="merger-control-card">
            <p class="action-heading"><strong>${t('workspace.trade_shares')}</strong></p>
            <p class="muted small">${t('workspace.trade_help', { unit: tradeUnit })}</p>
            <div class="merger-stepper">
              <button
                class="secondary merger-step-btn"
                ?disabled=${normalizedTrade <= 0}
                @click=${() => applyTradeValue(normalizedTrade - tradeUnit)}
                aria-label=${t('workspace.trade_fewer')}
              >
                -
              </button>
              <strong class="merger-step-value">${normalizedTrade}</strong>
              <button
                class="secondary merger-step-btn"
                ?disabled=${normalizedTrade >= maxTrade}
                @click=${() => applyTradeValue(normalizedTrade + tradeUnit)}
                aria-label=${t('workspace.trade_more')}
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
                ${t('workspace.clear')}
              </button>
              <button
                class="secondary outline merger-quick-btn"
                ?disabled=${normalizedTrade === maxTrade}
                @click=${() => applyTradeValue(maxTrade)}
              >
                ${t('workspace.max_trade')}
              </button>
            </div>
          </div>
          <div class="merger-control-card">
            <p class="action-heading"><strong>${t('workspace.sell_shares')}</strong></p>
            <p class="muted small">${t('workspace.sell_help')}</p>
            <div class="merger-stepper">
              <button
                class="secondary merger-step-btn"
                ?disabled=${normalizedSell <= 0}
                @click=${() => applySellValue(normalizedSell - 1)}
                aria-label=${t('workspace.sell_fewer')}
              >
                -
              </button>
              <strong class="merger-step-value">${normalizedSell}</strong>
              <button
                class="secondary merger-step-btn"
                ?disabled=${normalizedSell >= dynamicMaxSell}
                @click=${() => applySellValue(normalizedSell + 1)}
                aria-label=${t('workspace.sell_more')}
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
                ${t('workspace.clear')}
              </button>
              <button
                class="secondary outline merger-quick-btn"
                ?disabled=${normalizedSell === dynamicMaxSell}
                @click=${() => applySellValue(dynamicMaxSell)}
              >
                ${t('workspace.sell_all')}
              </button>
            </div>
          </div>
        </div>
        <p class="muted small">
          ${t('workspace.merger_result', {
            gained: gainedSurvivorShares,
            hold: resultingHold,
            sell: normalizedSell,
          })}
        </p>
        <button @click=${() => onSubmitMergerDecision(normalizedSell, normalizedTrade)}>
          ${t('workspace.submit_decision')}
        </button>
      </section>
    `;
  }

  if (legal.phase === PHASES.AWAIT_BUY && legal.isTurn) {
    const chainsById = Object.fromEntries(state.chains.map((chain) => [chain.id, chain]));
    const { remainingCash } = summarizeBuyQueue(buyQueue, chainsById, localPlayer?.cash || 0);
    const activeChains = state.chains.filter((chain) => chain.active);
    const queueSelectionCounts = new Map<string, number>();
    for (const chainId of buyQueue) {
      const current = queueSelectionCounts.get(chainId) || 0;
      queueSelectionCounts.set(chainId, current + 1);
    }

    const chainBuyOptions = activeChains.map((chain) => {
      const selectedForChain = queueSelectionCounts.get(chain.id) || 0;
      const displayAvailableShares = Math.max(0, chain.availableShares - selectedForChain);
      const canAdd =
        buyQueue.length < 3
        && displayAvailableShares > 0
        && chain.price > 0
        && chain.price <= remainingCash;

      return {
        chain,
        selectedForChain,
        displayAvailableShares,
        canAdd,
      };
    });

    const canQueueAnyShare = chainBuyOptions.some((option) => option.canAdd);
    const canBuyAnything = canQueueAnyShare || buyQueue.length > 0;

    return html`
      <section class="action-content action-buy">
        <p class="action-heading"><strong>${t('workspace.buy_stocks')}</strong></p>
        <p class="buy-summary">
          ${t('workspace.buy_summary', { cash: formatCurrency(remainingCash) })}
        </p>
        <div class="grid-2 buy-confirm-grid">
          <button @click=${() => onCommitBuy(false)}>${t('workspace.end_turn')}</button>
          ${legal.canEndGame
            ? html`<button class="secondary" @click=${() => onCommitBuy(true)}>${t('workspace.confirm_buy_end_game')}</button>`
            : html``}
        </div>
        ${state.pendingEndGameRequest
          ? html`
              <p class="muted small">
                <strong>${t('workspace.end_game_declared')}</strong> ${t('workspace.end_game_finish_hint')}
              </p>
            `
          : html``}
        ${canQueueAnyShare
          ? html`
              <div class="buy-token-picker">
                ${chainBuyOptions.map((option) => html`
                  <button
                    class="secondary action-choice-btn buy-chain-token"
                    ?disabled=${!option.canAdd}
                    @click=${() => onAddBuy(option.chain.id)}
                    title=${t('workspace.buy_chain_title', {
                      name: getChainDisplayName(option.chain.id),
                      shares: option.displayAvailableShares,
                    })}
                  >
                    ${renderChainBadge(option.chain.id, state.chains, { compact: true })}
                    ${option.selectedForChain
                      ? html`<span class="buy-chain-count">${option.selectedForChain}</span>`
                      : html``}
                  </button>
                `)}
              </div>
              <p class="muted small buy-token-hint">${t('workspace.buy_token_hint')}</p>
            `
          : html`<p class="muted small buy-token-hint">${t('workspace.buy_unavailable')}</p>`}

        ${canBuyAnything
          ? html`
              <div class="buy-queue">
                <p class="action-heading"><strong>${t('workspace.shares_to_buy')}</strong></p>
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
                  : html`<p class="muted">${t('common.none')}</p>`}
              </div>
            `
          : html``}
      </section>
    `;
  }

  return html`<section class="action-content"><p>${t('workspace.waiting_action')}</p></section>`;
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
        <strong>${t('workspace.your_tiles')}</strong>
        ${localPlayer
          ? html`
              <span class="muted small">
                ${t('workspace.tiles_playable_total', {
                  playable: playableTiles.size,
                  total: localPlayer.tiles.length,
                })}
              </span>
            `
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
                    ${showPlayPrompt ? html`<span class="tile-chip-play-prompt">${t('board.play_prompt')}</span>` : html``}
                  </button>
                `;
              })}
            </div>
            <p class="muted small">
              ${canPlaceTileNow
                ? t('workspace.place_tile_hint')
                : t('workspace.preview_hint')}
            </p>
            ${canPlaceTileNow && legal?.canSkipTile
              ? html`
                  <button class="secondary" @click=${() => onSendAction({ type: 'SKIP_TILE' })}>
                    ${t('workspace.skip_tile')}
                  </button>
                `
              : html``}
          `
        : html`<p>${t('workspace.no_local_hand')}</p>`}
    </section>
  `;

  return html`
    <article class="decision-workspace">
      <h3>${t('common.player')}</h3>

      <section class="portfolio-box">
        <p class="portfolio-line">
          <span>${t('common.cash')}</span>
          <strong>${formatCurrency(localPlayer?.cash || 0)}</strong>
        </p>
        <p class="portfolio-line">
          <span>${t('common.shares')}</span>
          <strong>${shareCount}</strong>
        </p>
        <p class="portfolio-line portfolio-line-stocks">
          <span>${t('common.stocks')}</span>
          <strong>
            ${localPlayer
              ? renderStockHoldings(localPlayer.stocks, state.chains)
              : t('common.none')}
          </strong>
        </p>
      </section>

      ${tilesSection}

      ${renderActionPanel({
        state,
        legal,
        actingPlayerName: actingPlayer?.name || t('common.player').toLowerCase(),
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
              <p class="action-heading"><strong>${t('workspace.end_game')}</strong></p>
              <p class="muted small">${t('workspace.end_game_finish_hint')}</p>
              <button class="secondary" @click=${() => onSendAction({ type: 'DECLARE_END_GAME' })}>
                ${t('workspace.declare_end_game')}
              </button>
            </section>
          `
        : html``}
    </article>
  `;
}
