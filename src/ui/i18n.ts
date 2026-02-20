import { EN_MESSAGES } from '../locales/en';
import { ES_MESSAGES } from '../locales/es';
import { FR_MESSAGES } from '../locales/fr';
import { BG_MESSAGES } from '../locales/bg';

export type LocaleCode = 'en' | 'es' | 'fr' | 'bg';

type MessageValues = Record<string, string | number | boolean | null | undefined>;

export type MessageCatalog = Record<string, string>;

type LocalizedToken = {
  key: string;
  params?: MessageValues;
};

const LOCALE_STORAGE_KEY = 'acquire-locale';
const LOCALE_CHANGE_EVENT = 'acquire-locale-change';
const SUPPORTED_LOCALES: LocaleCode[] = ['en', 'es', 'fr', 'bg'];
const LOCALE_TAGS: Record<LocaleCode, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  bg: 'bg-BG',
};

const CATALOGS: Record<LocaleCode, MessageCatalog> = {
  en: EN_MESSAGES,
  es: ES_MESSAGES,
  fr: FR_MESSAGES,
  bg: BG_MESSAGES,
};

let activeLocale: LocaleCode = 'en';

function normalizeLocale(rawLocale: unknown): LocaleCode | null {
  const raw = String(rawLocale || '').trim().toLowerCase();
  if (!raw) {
    return null;
  }
  const base = raw.split('-')[0];
  return SUPPORTED_LOCALES.includes(base as LocaleCode) ? (base as LocaleCode) : null;
}

function interpolate(template: string, params: MessageValues = {}): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = params[key];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  });
}

function detectBrowserLocale(): LocaleCode | null {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function persistLocale(locale: LocaleCode): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures.
  }
}

function applyDocumentLocale(locale: LocaleCode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

function notifyLocaleChanged(locale: LocaleCode): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<{ locale: LocaleCode }>(LOCALE_CHANGE_EVENT, {
      detail: { locale },
    }),
  );
}

export function getSupportedLocales(): LocaleCode[] {
  return [...SUPPORTED_LOCALES];
}

export function getStoredLocale(): LocaleCode | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return normalizeLocale(raw);
}

export function getActiveLocale(): LocaleCode {
  return activeLocale;
}

export async function setActiveLocale(locale: LocaleCode): Promise<void> {
  const normalized = normalizeLocale(locale) || 'en';
  activeLocale = normalized;
  persistLocale(normalized);
  applyDocumentLocale(normalized);
  notifyLocaleChanged(normalized);
}

export async function initializeLocale(): Promise<LocaleCode> {
  const preferred = getStoredLocale() || detectBrowserLocale() || 'en';
  await setActiveLocale(preferred);
  return preferred;
}

export function t(key: string, params: MessageValues = {}, locale: LocaleCode = getActiveLocale()): string {
  const normalizedLocale = normalizeLocale(locale) || 'en';
  const catalog = CATALOGS[normalizedLocale] || CATALOGS.en;
  const template = catalog[key] || CATALOGS.en[key] || key;
  return interpolate(template, params);
}

export function getChainDisplayName(chainId: string, locale: LocaleCode = getActiveLocale()): string {
  return t(`chain.${chainId}`, {}, locale);
}

export function formatLocalizedList(items: string[], locale: LocaleCode = getActiveLocale()): string {
  if (!items.length) {
    return '';
  }
  if (typeof Intl !== 'undefined' && Intl.ListFormat) {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
  }
  return items.join(', ');
}

export function formatLocalizedDateTime(value: number | Date, locale: LocaleCode = getActiveLocale()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return t('common.unknown', {}, locale);
  }
  const normalizedLocale = normalizeLocale(locale) || 'en';
  return date.toLocaleString(LOCALE_TAGS[normalizedLocale]);
}

export function formatCurrency(value: number, locale: LocaleCode = getActiveLocale()): string {
  if (!Number.isFinite(Number(value))) {
    return '$0';
  }

  if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
    const normalizedLocale = normalizeLocale(locale) || 'en';
    return new Intl.NumberFormat(LOCALE_TAGS[normalizedLocale], {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Number(value));
  }

  return `$${Math.floor(Number(value))}`;
}

export function playerCountLabel(count: number, locale: LocaleCode = getActiveLocale()): string {
  const normalized = Number.isFinite(Number(count)) ? Number(count) : 0;
  const label = normalized === 1 ? t('common.player', {}, locale).toLowerCase() : t('common.players', {}, locale).toLowerCase();
  return t('lobby.player_count', { count: normalized, label }, locale);
}

export function connectionStatusLabel(status: string, locale: LocaleCode = getActiveLocale()): string {
  switch (String(status || '').toLowerCase()) {
    case 'connected':
      return t('common.connected', {}, locale);
    case 'online':
      return t('common.online', {}, locale);
    case 'connecting':
      return t('common.connecting', {}, locale);
    case 'disconnected':
      return t('common.disconnected', {}, locale);
    case 'offline':
      return t('common.offline', {}, locale);
    case 'idle':
    default:
      return t('common.idle', {}, locale);
  }
}

export function phaseLabelText(phase: string, locale: LocaleCode = getActiveLocale()): string {
  const known = t(`phase.${phase}`, {}, locale);
  return known.startsWith('phase.') ? phase : known;
}

export function createToken(key: string, params: MessageValues = {}): LocalizedToken {
  return { key, params };
}

export function resolveToken(token: LocalizedToken | null, fallback = '', locale: LocaleCode = getActiveLocale()): string {
  if (!token) {
    return fallback;
  }
  return t(token.key, token.params, locale);
}

export function subscribeToLocaleChanges(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = () => {
    callback();
  };

  window.addEventListener(LOCALE_CHANGE_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, handler as EventListener);
  };
}

export function localizeKnownError(message: unknown): LocalizedToken | null {
  const raw = String(message || '').trim();
  if (!raw) {
    return null;
  }

  const exactMap: Record<string, string> = {
    'Room code is required.': 'error.room_code_required',
    'Name cannot be empty.': 'error.name_empty',
    'No saved host checkpoint found.': 'error.no_checkpoint',
    'Checkpoint is invalid.': 'error.invalid_checkpoint',
    'Not connected to host.': 'error.not_connected_host',
    'You can only rename yourself in the lobby.': 'error.rename_lobby_only',
    'Connected to signaling but no room state arrived from host. This usually means the peer data channel failed (often due missing TURN relay).': 'error.connected_no_state',
    'Could not establish a peer data channel to host. Signaling can succeed while P2P fails; a TURN relay is often required.': 'error.channel_failed',
    'ICE/TURN config is not valid JSON. Provide an array or an object with iceServers.': 'error.invalid_json_ice',
    'ICE/TURN config must be an array of servers or an object with an iceServers array.': 'error.invalid_ice_shape',
    'Each ICE server entry must be an object with urls.': 'error.invalid_ice_entry',
    'Each ICE server entry must include urls as a string or string array.': 'error.invalid_ice_urls',
    'Host rejected request': 'error.host_rejected_request',
    'Missing player id.': 'error.missing_player_id',
    'Game already started. New players cannot join.': 'error.game_started_no_join',
    'Not registered in room.': 'error.not_registered_room',
    'You can only rename while the room is in lobby.': 'error.rename_lobby_room_only',
    'Player not found.': 'error.player_not_found',
    'Cannot add players after the game has started.': 'error.cannot_add_players_started',
    'Player already exists.': 'error.player_already_exists',
    'Lobby settings can only be changed before the game starts.': 'error.lobby_settings_pre_game_only',
    'Only the host may change lobby settings.': 'error.only_host_change_lobby_settings',
    'Cannot remove players after the game has started.': 'error.cannot_remove_players_started',
    'Host cannot be removed from lobby.': 'error.host_cannot_be_removed',
    'Game has already started.': 'error.game_already_started',
    'Not enough tiles to start game.': 'error.not_enough_tiles_start_game',
    'Starting money must be an integer from $1000 to $50000 in $100 increments.': 'error.starting_money_integer_range',
    'This tile would merge two safe chains and is permanently unplayable.': 'error.tile_merges_safe_chains_unplayable',
    'This tile would create an eighth chain and is temporarily unplayable.': 'error.tile_creates_eighth_chain_unplayable',
    'Tile is not playable.': 'error.tile_not_playable',
    'Tile is not in your hand.': 'error.tile_not_in_hand',
    'No chain founding decision is pending.': 'error.no_chain_founding_pending',
    'Only the active founder can choose the chain.': 'error.only_active_founder_choose_chain',
    'Selected chain is not available.': 'error.selected_chain_not_available',
    'Selected chain does not exist.': 'error.selected_chain_not_exist',
    'Founder not found.': 'error.founder_not_found',
    'No merger survivor decision is pending.': 'error.no_merger_survivor_pending',
    'Only the active player may choose the survivor.': 'error.only_active_player_choose_survivor',
    'Selected survivor is not valid.': 'error.selected_survivor_invalid',
    'No merger defunct-chain choice is pending.': 'error.no_merger_defunct_choice_pending',
    'Defunct-chain order is not expected right now.': 'error.defunct_order_not_expected',
    'Only the merging player may choose defunct-chain order.': 'error.only_merging_player_choose_defunct_order',
    'Selected defunct chain is not valid.': 'error.selected_defunct_invalid',
    'No merger stock decision is pending.': 'error.no_merger_stock_pending',
    'Merger stock decisions are not expected right now.': 'error.merger_stock_not_expected',
    'It is not your merger stock decision.': 'error.not_your_merger_stock_decision',
    'Merger state is invalid.': 'error.merger_state_invalid',
    'Sell quantity must be a non-negative integer.': 'error.sell_quantity_non_negative_integer',
    'Trade quantity must be a non-negative even integer.': 'error.trade_quantity_non_negative_even',
    'You cannot sell/trade more shares than you own.': 'error.cannot_sell_trade_more_than_owned',
    'Bank does not have enough surviving shares for this trade.': 'error.not_enough_surviving_shares_for_trade',
    'Stock purchases are not allowed right now.': 'error.stock_purchase_not_allowed_now',
    'It is not your turn to buy stocks.': 'error.not_your_turn_buy_stocks',
    'You may buy at most 3 shares per turn.': 'error.max_three_shares_per_turn',
    'You can only buy stock in active chains.': 'error.buy_stock_only_active_chains',
    'Game is over.': 'error.game_is_over',
    'Tile placement is not expected right now.': 'error.tile_placement_not_expected',
    'It is not your turn.': 'error.not_your_turn',
    'You can only skip when all of your tiles are unplayable.': 'error.skip_only_when_all_unplayable',
    'Only the current player can declare end game.': 'error.only_current_player_declare_end_game',
    'End-game condition is not currently met.': 'error.end_game_condition_not_met',
    'You may only end the game during your buy step.': 'error.end_game_only_during_buy_step',
    'Only the current player can end the game.': 'error.only_current_player_end_game',
    'Unknown action type.': 'error.unknown_action_type',
  };

  if (exactMap[raw]) {
    return createToken(exactMap[raw]);
  }

  const lobbyFullMatch = raw.match(/^Lobby is full \(max (\d+) players\)\.$/i);
  if (lobbyFullMatch) {
    return createToken('error.lobby_full', {
      maxPlayers: Number(lobbyFullMatch[1]),
    });
  }

  const lobbyAllowsAtMostMatch = raw.match(/^Lobby allows at most (\d+) players\.$/i);
  if (lobbyAllowsAtMostMatch) {
    return createToken('error.lobby_allows_at_most', {
      maxPlayers: Number(lobbyAllowsAtMostMatch[1]),
    });
  }

  const acquireRequiresPlayerRangeMatch = raw.match(/^Acquire requires (\d+) to (\d+) players\.$/i);
  if (acquireRequiresPlayerRangeMatch) {
    return createToken('error.acquire_requires_player_range', {
      minPlayers: Number(acquireRequiresPlayerRangeMatch[1]),
      maxPlayers: Number(acquireRequiresPlayerRangeMatch[2]),
    });
  }

  const maxPlayersIntegerRangeMatch = raw.match(/^Max players must be an integer from (\d+) to (\d+)\.$/i);
  if (maxPlayersIntegerRangeMatch) {
    return createToken('error.max_players_integer_range', {
      minPlayers: Number(maxPlayersIntegerRangeMatch[1]),
      maxPlayers: Number(maxPlayersIntegerRangeMatch[2]),
    });
  }

  const maxPlayersBelowCurrentCountMatch = raw.match(/^Cannot set max players below current player count \((\d+)\)\.$/i);
  if (maxPlayersBelowCurrentCountMatch) {
    return createToken('error.cannot_set_max_players_below_current', {
      currentCount: Number(maxPlayersBelowCurrentCountMatch[1]),
    });
  }

  const chainHasNoSharesRemainingMatch = raw.match(/^(.+) has no shares remaining\.$/i);
  if (chainHasNoSharesRemainingMatch) {
    return createToken('error.chain_has_no_shares_remaining', {
      chainName: chainHasNoSharesRemainingMatch[1],
    });
  }

  const insufficientCashForChainMatch = raw.match(/^Insufficient cash to buy (.+)\.$/i);
  if (insufficientCashForChainMatch) {
    return createToken('error.insufficient_cash_for_chain', {
      chainName: insufficientCashForChainMatch[1],
    });
  }

  const dynamicPatterns: Array<{ regex: RegExp; key: string; group: string }> = [
    { regex: /^Host peer error: (.+)$/i, key: 'error.host_peer', group: 'message' },
    { regex: /^Guest peer error: (.+)$/i, key: 'error.guest_peer', group: 'message' },
    { regex: /^Host connection error: (.+)$/i, key: 'error.host_connection', group: 'message' },
    { regex: /^Guest connection error: (.+)$/i, key: 'error.guest_connection', group: 'message' },
    { regex: /^Could not initialize host peer: (.+)$/i, key: 'error.could_not_init_host', group: 'message' },
    {
      regex: /^Could not initialize resumed host peer: (.+)$/i,
      key: 'error.could_not_init_resumed_host',
      group: 'message',
    },
    { regex: /^Could not initialize guest peer: (.+)$/i, key: 'error.could_not_init_guest', group: 'message' },
    {
      regex: /^Could not send state to ([^:]+): (.+)$/i,
      key: 'error.could_not_send_state',
      group: 'compound',
    },
  ];

  for (const pattern of dynamicPatterns) {
    const match = raw.match(pattern.regex);
    if (!match) {
      continue;
    }

    if (pattern.group === 'compound') {
      return createToken(pattern.key, {
        playerId: match[1],
        message: match[2],
      });
    }

    return createToken(pattern.key, {
      message: match[1],
    });
  }

  return null;
}
