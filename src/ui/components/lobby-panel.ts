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
import { playerCountLabel, t } from '../i18n';
import './connection-status';

export function normalizeLobbySettings(
  settings: {
    startingCash?: number | string;
    maxPlayers?: number | string;
    allowDeadTilePlacementAsUnincorporated?: boolean;
    excelStyleCoordinates?: boolean;
    showPlayerCashOnTurnRail?: boolean;
    showFullTurnRailLog?: boolean;
    fastBotTurns?: boolean;
    botStrategy?: string;
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
    showPlayerCashOnTurnRail: Boolean(settings.showPlayerCashOnTurnRail),
    showFullTurnRailLog: Boolean(settings.showFullTurnRailLog),
    fastBotTurns: Boolean(settings.fastBotTurns),
    botStrategy: settings.botStrategy === 'random' ? 'random' : 'monte_carlo',
  };
}

function renderTwoPlayerRulesNote() {
  return html`
    <p class="muted small lobby-rules-note">
      <strong>${t('lobby.two_player_rule_title')}</strong> ${t('lobby.two_player_rule')}
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
          <div class="lobby-card-title-group">
            <h3>${t('lobby.players')}</h3>
            <p class="lobby-player-count">${playerCountLabel(state.players.length)}</p>
          </div>
          ${isHost
            ? html`
                <div class="lobby-card-actions">
                  <button class="secondary lobby-add-bot-btn" @click=${() => onAddBot()}>${t('lobby.add_bot')}</button>
                </div>
              `
            : html``}
        </div>

        <div class="lobby-roster-table-wrap">
          <table class="lobby-roster-table">
            <thead>
              <tr>
                <th>${t('lobby.table_name')}</th>
                <th>${t('lobby.table_type')}</th>
                <th>${t('lobby.table_status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${state.players.map((player) => {
                const canRename = player.id === localPlayerId || (isHost && player.isBot);
                const isEditing = Boolean(editingPlayerIds?.[player.id]);
                const isHostBot = Boolean(isHost && player.isBot);
                const editLabel = isHostBot ? t('lobby.rename') : t('lobby.edit');
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
                    <td>${player.isBot ? t('lobby.type_bot') : t('lobby.type_human')}</td>
                    <td>
                      <connection-status
                        status=${player.connected ? 'connected' : 'disconnected'}
                        variant="pill"
                      ></connection-status>
                    </td>
                    <td>
                      <div class="player-row-actions">
                        ${canRename && !isEditing
                          ? html`<button class="secondary outline" @click=${() => onStartRename(player.id, player.name)}>
                              ${editLabel}
                            </button>`
                          : html``}
                        ${isEditing
                          ? html`
                              <button class="secondary" @click=${() => onSaveRename(player.id, player.name)}>${t('lobby.save')}</button>
                              <button class="secondary outline" @click=${() => onCancelRename(player.id)}>${t('lobby.cancel')}</button>
                            `
                          : html``}
                        ${isHostBot
                          ? html`
                              <button class="secondary outline lobby-remove-bot-btn" @click=${() => onRemoveBot(player.id)}>
                                ${t('lobby.remove')}
                              </button>
                            `
                          : html``}
                      </div>
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
        <p class="muted small">${t('lobby.rename_help')}</p>
      </article>

      <article class="lobby-settings-panel">
        <h4>${t('lobby.settings')}</h4>
        ${isHost
          ? html`
              <div class="lobby-settings-grid">
                <label>
                  ${t('lobby.max_players')}
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
                  ${t('lobby.starting_money')}
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
                  ${t('lobby.allow_dead_tiles')}
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
                  ${t('lobby.excel_coords')}
                </label>
                <label class="lobby-toggle-label">
                  <input
                    type="checkbox"
                    .checked=${settings.showPlayerCashOnTurnRail}
                    @change=${(event) =>
                      onUpdateSettings({
                        showPlayerCashOnTurnRail: event.target.checked,
                      })}
                  />
                  ${t('lobby.show_cash')}
                </label>
                <label class="lobby-toggle-label">
                  <input
                    type="checkbox"
                    .checked=${settings.showFullTurnRailLog}
                    @change=${(event) =>
                      onUpdateSettings({
                        showFullTurnRailLog: event.target.checked,
                      })}
                  />
                  ${t('lobby.full_recent_actions')}
                </label>
                <label class="lobby-toggle-label">
                  <input
                    type="checkbox"
                    .checked=${settings.fastBotTurns}
                    @change=${(event) =>
                      onUpdateSettings({
                        fastBotTurns: event.target.checked,
                      })}
                  />
                  ${t('lobby.fast_bots')}
                </label>
                <label>
                  ${t('lobby.bot_strategy_label')}
                  <select
                    .value=${settings.botStrategy}
                    @change=${(event) =>
                      onUpdateSettings({
                        botStrategy: event.target.value,
                      })}
                  >
                    <option value="monte_carlo">${t('lobby.bot_strategy_monte_carlo')}</option>
                    <option value="random">${t('lobby.bot_strategy_random')}</option>
                  </select>
                </label>
              </div>
              <p class="muted small">
                ${t('lobby.dead_tiles_help')}
              </p>
              ${showTwoPlayerRulesNote ? renderTwoPlayerRulesNote() : html``}
            `
          : html`
              <p><strong>${t('lobby.max_players')}:</strong> ${settings.maxPlayers}</p>
              <p><strong>${t('lobby.starting_money')}:</strong> $${settings.startingCash}</p>
              <p>
                <strong>${t('lobby.dead_tiles_label')}:</strong>
                ${settings.deadTilesAsUnincorporated ? t('lobby.dead_tiles_played') : t('lobby.dead_tiles_temp')}
              </p>
              <p>
                <strong>${t('lobby.coords_label')}:</strong>
                ${settings.excelStyleCoordinates ? t('lobby.coords_excel') : t('lobby.coords_classic')}
              </p>
              <p>
                <strong>${t('lobby.turn_rail_cash_label')}:</strong>
                ${settings.showPlayerCashOnTurnRail ? t('lobby.shown') : t('lobby.hidden')}
              </p>
              <p>
                <strong>${t('lobby.full_recent_actions')}:</strong>
                ${settings.showFullTurnRailLog ? t('lobby.shown') : t('lobby.hidden')}
              </p>
              <p>
                <strong>${t('lobby.fast_bots')}:</strong>
                ${settings.fastBotTurns ? t('lobby.shown') : t('lobby.hidden')}
              </p>
              <p>
                <strong>${t('lobby.bot_strategy_label')}:</strong>
                ${settings.botStrategy === 'random'
                  ? t('lobby.bot_strategy_random')
                  : t('lobby.bot_strategy_monte_carlo')}
              </p>
              ${showTwoPlayerRulesNote ? renderTwoPlayerRulesNote() : html``}
            `}
      </article>
    </section>
  `;
}
