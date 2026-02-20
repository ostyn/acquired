/**
 * Responsibility: Renders the compact top turn rail for in-game flow awareness.
 * It highlights phase, acting player, turn order progression, and chain state.
 */

import { html } from 'lit';
import { renderChainBadge, renderChainNamesInText } from './chain-display';
import { actorForPhase, phaseLabel, turnInstruction } from './turn-utils';
import { formatLogEvent } from '../log-format';
import { formatCurrency, getChainDisplayName, t } from '../i18n';
import './connection-status';

const TURN_RAIL_LOG_LIMIT = 18;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getTurnRailPlayers(state) {
  if (!state || !Array.isArray(state.players)) {
    return [];
  }

  if (!Array.isArray(state.playerOrder) || state.playerOrder.length === 0) {
    return state.players;
  }

  return state.playerOrder
    .map((playerId) => state.players.find((player) => player.id === playerId))
    .filter(Boolean);
}

export function getTurnRailChains(state) {
  if (!state || !Array.isArray(state.chains)) {
    return [];
  }

  const active = state.chains
    .filter((chain) => chain.active)
    .sort((left, right) => right.size - left.size || getChainDisplayName(left.id).localeCompare(getChainDisplayName(right.id)));
  const inactive = state.chains
    .filter((chain) => !chain.active)
    .sort((left, right) => getChainDisplayName(left.id).localeCompare(getChainDisplayName(right.id)));

  return [...active, ...inactive];
}

export function getTurnRailLogEntries(state, localPlayerId, limit = TURN_RAIL_LOG_LIMIT) {
  if (!state) {
    return [];
  }

  const cappedLimit = Math.max(1, Number(limit) || TURN_RAIL_LOG_LIMIT);
  const events = Array.isArray(state.logEvents) ? state.logEvents : [];
  if (events.length) {
    const fallback = events.slice(-cappedLimit).map((event) => formatLogEvent(event)).reverse();

    if (!localPlayerId) {
      return fallback;
    }

    const endTurnKeys = new Set(['player_bought_stocks', 'player_passed_stock_buying']);
    let startIndex = 0;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      const playerId = String(event?.params?.playerId || '');
      if (playerId === localPlayerId && endTurnKeys.has(event.key)) {
        startIndex = index + 1;
        break;
      }
    }

    return events
      .slice(startIndex)
      .slice(-cappedLimit)
      .map((event) => formatLogEvent(event))
      .reverse();
  }

  if (!Array.isArray(state.log) || state.log.length === 0) {
    return [];
  }

  const entries = state.log;
  const fallback = entries.slice(-cappedLimit).reverse();

  if (!localPlayerId || !Array.isArray(state.players)) {
    return fallback;
  }

  const localPlayer = state.players.find((player) => player.id === localPlayerId);
  const localName = localPlayer?.name?.trim();
  if (!localName) {
    return fallback;
  }

  // A turn ends on buy/pass. Showing entries after this marker yields a compact
  // "what happened while you were waiting" timeline.
  const endTurnPattern = new RegExp(`^${escapeRegex(localName)} (buys .+\\.|passes stock buying\\.)$`);
  let startIndex = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (endTurnPattern.test(entries[index])) {
      startIndex = index + 1;
      break;
    }
  }

  return entries.slice(startIndex).slice(-cappedLimit).reverse();
}

export function renderGameHud({
  state,
  buyQueue = [],
  localPlayerId = '',
}) {
  const legal = state.legalActions;
  const actorId = actorForPhase(state);
  const actor = state.players.find((player) => player.id === actorId);
  const actorName = actor?.name || t('common.player').toLowerCase();
  const actorIsBot = Boolean(actor?.isBot);
  const instruction = turnInstruction(legal, actorName);
  const orderedPlayers = getTurnRailPlayers(state);
  const orderedChains = getTurnRailChains(state);
  const recent = getTurnRailLogEntries(state, localPlayerId);
  const showPlayerCash = Boolean(state?.settings?.showPlayerCashOnTurnRail);

  return html`
    <article class="turn-rail">
      <div class="turn-rail-top">
        <div class="turn-rail-summary">
          <p class="turn-rail-phase">${t('common.phase')}: <strong>${phaseLabel(state.phase)}</strong></p>
          <p class="turn-rail-command">${instruction}</p>
          <p class="turn-rail-draw-discard">
            ${t('hud.draw_discard')} <strong>${state.drawPileCount} / ${state.discardPileCount}</strong>
          </p>
          ${actorIsBot && !legal?.isTurn
            ? html`
                <p class="turn-thinking" aria-live="polite">
                  ${t('hud.bot_thinking')}
                  <span></span>
                  <span></span>
                  <span></span>
                </p>
              `
            : html``}
        </div>
        <div class="turn-rail-log">
          <p class="turn-rail-log-title">${t('hud.recent_actions')}</p>
          <ul class="turn-rail-log-list">
            ${recent.length
              ? recent.map((entry) => html`<li>${renderChainNamesInText(entry, state.chains)}</li>`)
              : html`<li class="turn-rail-log-empty">${t('hud.no_recent_actions')}</li>`}
          </ul>
        </div>
      </div>

      <div class="turn-order-track" role="list" aria-label=${t('hud.turn_order')}>
        ${orderedPlayers.map((player) => {
          const isCurrent = player.id === state.currentPlayerId;
          const isActor = player.id === actorId;
          const isOnline = Boolean(player.connected);
          const roleLabel = isActor ? t('hud.role_acting') : isCurrent ? t('hud.role_current') : t('hud.role_waiting');
          const classes = ['turn-chip'];
          if (isCurrent) {
            classes.push('turn-chip-current');
          }
          if (isActor) {
            classes.push('turn-chip-actor');
          }
          if (!player.connected) {
            classes.push('turn-chip-offline');
          }

          return html`
            <div class=${classes.join(' ')} role="listitem">
              <span class="turn-chip-status">
                <connection-status
                  status=${isOnline ? 'online' : 'offline'}
                  variant="inline"
                  hide-text
                ></connection-status>
              </span>
              <span class="turn-chip-name">${player.name}</span>
              <span class="turn-chip-meta">${roleLabel}</span>
              ${showPlayerCash ? html`<span class="turn-chip-cash">${formatCurrency(player.cash ?? 0)}</span>` : html``}
            </div>
          `;
        })}
      </div>

      <div class="turn-chain-track" role="list" aria-label=${t('hud.chain_state')}>
        ${orderedChains.map((chain) => {
          const classes = ['turn-chain-card'];
          const selectedForChain = buyQueue.filter((id) => id === chain.id).length;
          const displayAvailableShares = Math.max(0, chain.availableShares - selectedForChain);
          if (chain.active) {
            classes.push('turn-chain-card-active');
          } else {
            classes.push('turn-chain-card-inactive');
          }

          return html`
            <div class=${classes.join(' ')} style=${`--turn-chain-color:${chain.color};`} role="listitem">
              <div class="turn-chain-head">
                ${renderChainBadge(chain.id, state.chains, { compact: true })}
                ${chain.safe ? html`<span class="turn-chain-safe">${t('common.safe')}</span>` : html``}
              </div>
              <div class="turn-chain-meta">
                <span>${chain.active ? `${t('common.size')} ${chain.size}` : t('common.inactive')}</span>
                ${chain.active ? html`<span>${t('common.price')} $${chain.price}</span>` : html``}
                <span>${t('common.shares')} ${displayAvailableShares}</span>
              </div>
            </div>
          `;
        })}
      </div>
    </article>
  `;
}
