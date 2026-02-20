/**
 * Responsibility: Provides shared chain rendering helpers for badges, holdings, and log text decoration.
 * These helpers ensure chain references are consistently color-coded across the UI.
 */

import { html } from 'lit';
import { getChainDisplayName, t } from '../i18n';

type BadgeOptions = {
  compact?: boolean;
  quantity?: number;
};

type ChainListOptions = {
  emptyLabel?: string;
};

const LIGHT_INK = '#ffffff';
const DARK_INK = '#000000';
const CHAIN_COLOR_BY_ID = {
  tower: '#f2c43b',
  luxor: '#e4394f',
  american: '#1f3f97',
  festival: '#1da56f',
  worldwide: '#7b4a30',
  imperial: '#c03393',
  continental: '#27b7d9',
};
const CHAIN_BADGE_COLOR_BY_ID = {
  tower: '#d39d16',
  luxor: '#c3273e',
  american: '#1f3f97',
  festival: '#0f7d52',
  worldwide: '#6f412a',
  imperial: '#a92c7f',
  continental: '#1ea0c4',
};

function hexToRgb(hex) {
  const normalized = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function relativeLuminance(hexColor) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) {
    return 0;
  }

  const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function chainInkColor(chainId) {
  const chainColor = CHAIN_COLOR_BY_ID[chainId];
  if (!chainColor) {
    return LIGHT_INK;
  }

  const lightContrast = contrastRatio(chainColor, LIGHT_INK);
  const darkContrast = contrastRatio(chainColor, DARK_INK);
  return darkContrast >= lightContrast ? DARK_INK : LIGHT_INK;
}

export function chainBadgeColor(chainId) {
  return CHAIN_BADGE_COLOR_BY_ID[chainId] || null;
}

export function chainBadgeInkColor(chainId) {
  const badgeColor = chainBadgeColor(chainId);
  if (!badgeColor) {
    return chainInkColor(chainId);
  }

  const lightContrast = contrastRatio(badgeColor, LIGHT_INK);
  const darkContrast = contrastRatio(badgeColor, DARK_INK);
  return darkContrast >= lightContrast ? DARK_INK : LIGHT_INK;
}

function findChain(chains, chainId) {
  return chains.find((chain) => chain.id === chainId) || null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitTextByChainMentions(text, chains) {
  if (!text) {
    return [];
  }

  const sorted = [...chains]
    .map((chain) => ({
      ...chain,
      aliases: Array.from(new Set([chain.name, getChainDisplayName(chain.id)]))
        .filter(Boolean)
        .sort((left, right) => right.length - left.length),
    }))
    .sort((left, right) => {
      const leftLength = left.aliases[0]?.length || left.name.length;
      const rightLength = right.aliases[0]?.length || right.name.length;
      return rightLength - leftLength;
    });
  const parts = [];
  let cursor = 0;

  while (cursor < text.length) {
    let found = null;

    for (const chain of sorted) {
      const search = text.slice(cursor);
      for (const alias of chain.aliases) {
        const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`);
        const match = search.match(pattern);
        if (!match || match.index === undefined) {
          continue;
        }

        const absoluteIndex = cursor + match.index;
        if (!found || absoluteIndex < found.index) {
          found = { chain, index: absoluteIndex, aliasLength: alias.length };
        }
      }
    }

    if (!found) {
      parts.push({ type: 'text', value: text.slice(cursor) });
      break;
    }

    if (found.index > cursor) {
      parts.push({ type: 'text', value: text.slice(cursor, found.index) });
    }

    parts.push({ type: 'chain', chainId: found.chain.id });
    cursor = found.index + found.aliasLength;
  }

  return parts;
}

export function renderChainBadge(chainId, chains, options: BadgeOptions = {}) {
  const chain = findChain(chains, chainId);
  if (!chain) {
    return html`<span class="chain-badge fallback">${chainId}</span>`;
  }

  const classes = ['chain-badge'];
  if (options.compact) {
    classes.push('compact');
  }

  const quantity = options.quantity ? ` x${options.quantity}` : '';
  const badgeColor = chainBadgeColor(chain.id) || chain.color;
  const badgeInk = chainBadgeInkColor(chain.id);

  return html`
    <span
      class=${classes.join(' ')}
      style=${`--badge-chain:${badgeColor}; --badge-chain-ink:${badgeInk};`}
    >
      ${getChainDisplayName(chain.id)}${quantity}
    </span>
  `;
}

export function renderChainList(chainIds, chains, options: ChainListOptions = {}) {
  if (!chainIds.length) {
    return options.emptyLabel || '-';
  }

  return html`
    <span class="chain-badge-list">
      ${chainIds.map((chainId) => renderChainBadge(chainId, chains, { compact: true }))}
    </span>
  `;
}

export function renderStockHoldings(stocks, chains) {
  const holdings = (Object.entries(stocks || {}) as Array<[string, number]>).filter(([, value]) => value > 0);
  if (!holdings.length) {
    return t('common.none');
  }

  return html`
    <span class="chain-badge-list">
      ${holdings.map(([chainId, value]) => renderChainBadge(chainId, chains, { compact: true, quantity: value }))}
    </span>
  `;
}

export function renderLastBuy(lastBuy, chains) {
  if (lastBuy === null || lastBuy === undefined) {
    return '-';
  }

  if (!Array.isArray(lastBuy) || !lastBuy.length) {
    return t('common.pass');
  }

  return renderChainList(lastBuy, chains, { emptyLabel: '-' });
}

export function renderChainNamesInText(text, chains) {
  const parts = splitTextByChainMentions(text, chains);
  if (!parts.length) {
    return '';
  }

  return parts.map((part) => {
    if (part.type === 'text') {
      return part.value;
    }
    return renderChainBadge(part.chainId, chains, { compact: true });
  });
}
