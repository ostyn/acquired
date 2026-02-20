import { describe, expect, it } from 'vitest';
import { formatLogEvent, parseChainIds } from '../src/ui/log-format';

describe('log formatting', () => {
  it('parses chain id lists from multiple formats', () => {
    expect(parseChainIds('tower|luxor')).toEqual(['tower', 'luxor']);
    expect(parseChainIds('tower, luxor')).toEqual(['tower', 'luxor']);
    expect(parseChainIds(['tower', 'luxor'])).toEqual(['tower', 'luxor']);
  });

  it('formats structured log events in English', () => {
    expect(
      formatLogEvent(
        {
          key: 'player_grew_chain',
          params: {
            playerName: 'Alex',
            chainId: 'tower',
            tileId: 'B3',
          },
        },
        'en',
      ),
    ).toBe('Alex grows Tower with B3.');
  });

  it('formats structured log events in Spanish', () => {
    expect(
      formatLogEvent(
        {
          key: 'player_grew_chain',
          params: {
            playerName: 'Alex',
            chainId: 'tower',
            tileId: 'B3',
          },
        },
        'es',
      ),
    ).toBe('Alex expande Torre con B3.');
  });

  it('formats stock purchase chains with localized chain nouns', () => {
    const text = formatLogEvent(
      {
        key: 'player_bought_stocks',
        params: {
          playerName: 'Alex',
          chainIds: 'tower|worldwide',
        },
      },
      'es',
    );

    expect(text).toContain('Alex compra');
    expect(text).toContain('Torre');
    expect(text).toContain('Mundial');
  });
});
