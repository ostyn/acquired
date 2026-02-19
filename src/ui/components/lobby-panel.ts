/**
 * Responsibility: Renders lobby roster and host-configurable game settings.
 * It presents controls for player management and pre-game configuration updates.
 */

import { html } from 'lit';
import {
  MAX_PLAYER_COUNT,
  MAX_STARTING_CASH,
  MIN_PLAYER_COUNT,
  MIN_STARTING_CASH,
  STARTING_CASH_STEP,
} from '../../game/constants';

export function normalizeLobbySettings(
  settings: {
    startingCash?: number | string;
    maxPlayers?: number | string;
    allowDeadTilePlacementAsUnincorporated?: boolean;
    excelStyleCoordinates?: boolean;
  } = {},
) {
  return {
    startingCash: Number.isFinite(Number(settings.startingCash))
      ? Number(settings.startingCash)
      : 6000,
    maxPlayers: Number.isFinite(Number(settings.maxPlayers))
      ? Number(settings.maxPlayers)
      : MAX_PLAYER_COUNT,
    deadTilesAsUnincorporated: Boolean(settings.allowDeadTilePlacementAsUnincorporated),
    excelStyleCoordinates: Boolean(settings.excelStyleCoordinates),
  };
}

function renderTwoPlayerRulesNote() {
  return html`
    <p class="muted small lobby-rules-note">
      <strong>2-player special rule:</strong> During mergers, the Stock Market is treated as an extra shareholder
      for majority/minority bonus calculation only. Disposal choices do not change: players may still hold, sell,
      or trade defunct shares (2-for-1) as usual.
    </p>
  `;
}

export function shouldShowTwoPlayerRulesNote(players: unknown): boolean {
  return Array.isArray(players) && players.length === 2;
}

export function renderLobbyPanel({
  state,
  isHost,
  localPlayerId,
  editingPlayerIds,
  nameDrafts,
  onRemoveBot,
  onAddBot,
  onUpdateSettings,
  onStartRename,
  onChangeRenameDraft,
  onCancelRename,
  onSaveRename,
}) {
  const settings = normalizeLobbySettings(state.settings);
  const showTwoPlayerRulesNote = shouldShowTwoPlayerRulesNote(state.players);

  return html`
    <section class="lobby-layout">
      <article class="lobby-roster-panel">
        <div class="lobby-card-header">
          <h3>Players</h3>
        </div>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.players.map((player) => {
              const canRename = player.id === localPlayerId || (isHost && player.isBot);
              const isEditing = Boolean(editingPlayerIds?.[player.id]);
              const draftName = nameDrafts?.[player.id] ?? player.name;
              return html`
                <tr>
                  <td>
                    ${isEditing
                      ? html`
                          <input
                            class="player-name-input"
                            .value=${draftName}
                            maxlength="24"
                            @input=${(event) => onChangeRenameDraft(player.id, event.target.value)}
                            @keydown=${(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                onSaveRename(player.id, player.name);
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                onCancelRename(player.id);
                              }
                            }}
                          />
                        `
                      : player.name}
                  </td>
                  <td>${player.isBot ? 'Bot' : 'Human'}</td>
                  <td>${player.connected ? 'Connected' : 'Offline'}</td>
                  <td>
                    <div class="player-row-actions">
                      ${canRename && !isEditing
                        ? html`<button class="secondary outline" @click=${() => onStartRename(player.id, player.name)}>
                            Edit
                          </button>`
                        : html``}
                      ${isEditing
                        ? html`
                            <button class="secondary" @click=${() => onSaveRename(player.id, player.name)}>Done</button>
                            <button class="secondary outline" @click=${() => onCancelRename(player.id)}>Cancel</button>
                          `
                        : html``}
                      ${isEditing && isHost && player.isBot
                        ? html`<button class="secondary" @click=${() => onRemoveBot(player.id)}>Remove</button>`
                        : html``}
                    </div>
                  </td>
                </tr>
              `;
            })}
          </tbody>
        </table>
        <p class="muted small">Use Edit to rename yourself. Host can also rename bots.</p>

        ${isHost
          ? html`<button class="secondary add-bot-button" @click=${() => onAddBot()}>Add Bot</button>`
          : html``}
      </article>

      <article class="lobby-settings-panel">
        <h4>Game Settings</h4>
        ${isHost
          ? html`
              <div class="lobby-settings-grid">
                <label>
                  Max Players
                  <input
                    type="number"
                    min=${String(MIN_PLAYER_COUNT)}
                    max=${String(MAX_PLAYER_COUNT)}
                    step="1"
                    .value=${String(settings.maxPlayers)}
                    @change=${(event) =>
                      onUpdateSettings({
                        maxPlayers: Number(event.target.value || 0),
                      })}
                  />
                </label>
                <label>
                  Starting Money
                  <input
                    type="number"
                    min=${String(MIN_STARTING_CASH)}
                    max=${String(MAX_STARTING_CASH)}
                    step=${String(STARTING_CASH_STEP)}
                    .value=${String(settings.startingCash)}
                    @change=${(event) =>
                      onUpdateSettings({
                        startingCash: Number(event.target.value || 0),
                      })}
                  />
                </label>
                <label class="lobby-toggle-label">
                  <input
                    type="checkbox"
                    .checked=${settings.deadTilesAsUnincorporated}
                    @change=${(event) =>
                      onUpdateSettings({
                        allowDeadTilePlacementAsUnincorporated: event.target.checked,
                      })}
                  />
                  Allow dead tiles to be played as unincorporated
                </label>
                <label class="lobby-toggle-label">
                  <input
                    type="checkbox"
                    .checked=${settings.excelStyleCoordinates}
                    @change=${(event) =>
                      onUpdateSettings({
                        excelStyleCoordinates: event.target.checked,
                      })}
                  />
                  Use Excel-style coordinates (A1 across, numbers down)
                </label>
              </div>
              <p class="muted small">
                When enabled, tiles that would create an eighth chain are still played but do not found a new
                chain.
              </p>
              ${showTwoPlayerRulesNote ? renderTwoPlayerRulesNote() : html``}
            `
          : html`
              <p><strong>Max Players:</strong> ${settings.maxPlayers}</p>
              <p><strong>Starting Money:</strong> $${settings.startingCash}</p>
              <p>
                <strong>Dead Tiles:</strong>
                ${settings.deadTilesAsUnincorporated ? 'Played as unincorporated' : 'Temporarily unplayable'}
              </p>
              <p>
                <strong>Coordinates:</strong>
                ${settings.excelStyleCoordinates ? 'Excel style (A1 across)' : 'Classic style'}
              </p>
              ${showTwoPlayerRulesNote ? renderTwoPlayerRulesNote() : html``}
            `}
      </article>
    </section>
  `;
}
