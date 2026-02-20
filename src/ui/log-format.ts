import type { GameLogEvent } from '../game/engine/types';
import { formatLocalizedList, getChainDisplayName, t, type LocaleCode } from './i18n';

function toNumber(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function toString(raw: unknown, fallback = ''): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (raw === null || raw === undefined) {
    return fallback;
  }
  return String(raw);
}

export function parseChainIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value)).filter(Boolean);
  }

  const text = toString(raw, '');
  if (!text) {
    return [];
  }

  if (text.includes('|')) {
    return text.split('|').filter(Boolean);
  }

  if (text.includes(',')) {
    return text.split(',').map((value) => value.trim()).filter(Boolean);
  }

  return [text];
}

function chainNameFromParams(params: Record<string, unknown>, locale?: LocaleCode): string {
  const chainId = toString(params.chainId, '');
  if (chainId) {
    return getChainDisplayName(chainId, locale);
  }
  return toString(params.chainName, '');
}

export function formatLogEvent(event: GameLogEvent | null | undefined, locale?: LocaleCode): string {
  if (!event || typeof event !== 'object') {
    return '';
  }

  const params = event.params || {};
  const playerName = toString(params.playerName);
  const tileId = toString(params.tileId);
  const amount = toNumber(params.amount);

  switch (event.key) {
    case 'lobby_created':
      return t('log.lobby_created', {}, locale);
    case 'player_joined_lobby':
      return t('log.player_joined_lobby', { playerName }, locale);
    case 'host_updated_lobby_settings':
      return t('log.host_updated_lobby_settings', {}, locale);
    case 'player_left_lobby':
      return t('log.player_left_lobby', { playerName }, locale);
    case 'player_connected':
      return t('log.player_connected', { playerName }, locale);
    case 'player_disconnected':
      return t('log.player_disconnected', { playerName }, locale);
    case 'game_started':
      return t('log.game_started', {}, locale);
    case 'player_must_found_chain':
      return t('log.player_must_found_chain', { playerName }, locale);
    case 'player_placed_unincorporated_all_active':
      return t('log.player_placed_unincorporated_all_active', { playerName, tileId }, locale);
    case 'player_placed_unincorporated':
      return t('log.player_placed_unincorporated', { playerName, tileId }, locale);
    case 'player_grew_chain':
      return t('log.player_grew_chain', {
        playerName,
        tileId,
        chainName: chainNameFromParams(params, locale),
      }, locale);
    case 'player_triggered_merger':
      return t('log.player_triggered_merger', { playerName, tileId }, locale);
    case 'player_founded_chain_free_share':
      return t('log.player_founded_chain_free_share', {
        playerName,
        chainName: chainNameFromParams(params, locale),
      }, locale);
    case 'player_founded_chain':
      return t('log.player_founded_chain', {
        playerName,
        chainName: chainNameFromParams(params, locale),
      }, locale);
    case 'player_bought_stocks': {
      const chainIds = parseChainIds(params.chainIds);
      const chainNames = chainIds.map((chainId) => getChainDisplayName(chainId, locale));
      return t('log.player_bought_stocks', {
        playerName,
        chains: formatLocalizedList(chainNames, locale),
      }, locale);
    }
    case 'player_passed_stock_buying':
      return t('log.player_passed_stock_buying', { playerName }, locale);
    case 'player_skipped_tile_placement':
      return t('log.player_skipped_tile_placement', { playerName }, locale);
    case 'player_declared_end_game':
      return t('log.player_declared_end_game', { playerName }, locale);
    case 'player_received_tied_bonus':
      return t('log.player_received_tied_bonus', {
        playerName,
        amount,
        chainName: chainNameFromParams(params, locale),
      }, locale);
    case 'player_received_majority_bonus':
      return t('log.player_received_majority_bonus', {
        playerName,
        amount,
        chainName: chainNameFromParams(params, locale),
      }, locale);
    case 'player_received_additional_minority_bonus':
      return t('log.player_received_additional_minority_bonus', {
        playerName,
        amount,
        chainName: chainNameFromParams(params, locale),
      }, locale);
    case 'player_received_minority_bonus':
      return t('log.player_received_minority_bonus', {
        playerName,
        amount,
        chainName: chainNameFromParams(params, locale),
      }, locale);
    case 'game_tallying_final_chains':
      return t('log.game_tallying_final_chains', {}, locale);
    case 'player_replaced_unplayable_tiles':
      return t('log.player_replaced_unplayable_tiles', {
        playerName,
        count: toNumber(params.count),
      }, locale);
    case 'game_ended_final_scoring':
      return t('log.game_ended_final_scoring', {}, locale);
    case 'player_renamed':
      return t('log.player_renamed', {
        previousName: toString(params.previousName),
        nextName: toString(params.nextName),
      }, locale);
    case 'bot_action_failed':
      return t('log.bot_action_failed', {
        playerName,
        error: toString(params.error),
      }, locale);
    case 'legacy':
    default:
      return toString(params.message, '');
  }
}
