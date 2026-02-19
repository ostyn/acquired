/**
 * Responsibility: Renders the compact top turn rail for in-game flow awareness.
 * It highlights phase, acting player, turn order progression, and utility actions.
 */

import { html } from 'lit';
import { renderChainBadge } from './chain-display';
import { actorForPhase, phaseLabel, turnInstruction } from './turn-utils';

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
    .sort((left, right) => right.size - left.size || left.name.localeCompare(right.name));
  const inactive = state.chains
    .filter((chain) => !chain.active)
    .sort((left, right) => left.name.localeCompare(right.name));

  return [...active, ...inactive];
}

export function renderGameHud({
  state,
  buyQueue = [],
  onOpenPlayers,
  onOpenReference,
}) {
  const legal = state.legalActions;
  const actorId = actorForPhase(state);
  const actor = state.players.find((player) => player.id === actorId);
  const actorName = actor?.name || 'another player';
  const actorIsBot = Boolean(actor?.isBot);
  const instruction = turnInstruction(legal, actorName);
  const orderedPlayers = getTurnRailPlayers(state);
  const orderedChains = getTurnRailChains(state);

  return html`
    <article class="turn-rail">
      <div class="turn-rail-top">
        <div class="turn-rail-summary">
          <p class="turn-rail-phase">Phase: <strong>${phaseLabel(state.phase)}</strong></p>
          <p class="turn-rail-command">${instruction}</p>
          <p class="turn-rail-draw-discard">
            Draw / Discard <strong>${state.drawPileCount} / ${state.discardPileCount}</strong>
          </p>
          ${actorIsBot && !legal?.isTurn
            ? html`
                <p class="turn-thinking" aria-live="polite">
                  Bot is thinking
                  <span></span>
                  <span></span>
                  <span></span>
                </p>
              `
            : html``}
        </div>
        <div class="turn-rail-actions">
          <button class="secondary turn-rail-action" @click=${() => onOpenPlayers()}>
            Players: ${state.players.length}
          </button>
          <button class="secondary turn-rail-action" @click=${() => onOpenReference()}>
            Reference
          </button>
        </div>
      </div>

      <div class="turn-order-track" role="list" aria-label="Turn order">
        ${orderedPlayers.map((player) => {
          const isCurrent = player.id === state.currentPlayerId;
          const isActor = player.id === actorId;
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
              <span class="turn-chip-name">${player.name}</span>
              <span class="turn-chip-meta">
                ${!player.connected
                  ? 'Offline'
                  : isActor
                    ? 'Acting'
                    : isCurrent
                      ? 'Current'
                      : 'Waiting'}
              </span>
            </div>
          `;
        })}
      </div>

      <div class="turn-chain-track" role="list" aria-label="Chain state">
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
                ${chain.safe ? html`<span class="turn-chain-safe">Safe</span>` : html``}
              </div>
              <div class="turn-chain-meta">
                <span>${chain.active ? `Size ${chain.size}` : 'Inactive'}</span>
                ${chain.active ? html`<span>Price $${chain.price}</span>` : html``}
                <span>Shares ${displayAvailableShares}</span>
              </div>
            </div>
          `;
        })}
      </div>
    </article>
  `;
}
