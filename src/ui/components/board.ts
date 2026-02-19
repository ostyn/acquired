/**
 * Responsibility: Renders the Acquire board grid and tile visual state.
 * It derives tile markers/classes from current game state and legal tile targets.
 */

import { html } from 'lit';
import { COLS, PHASES, ROWS } from '../../game/constants';
import { chainInkColor } from './chain-display';
import { formatTileLabel } from '../tile-label';

export function getBoardTileView({
  state,
  tileId,
  chainById,
  playableTiles,
  canPlace,
  highlightedTileId = '',
  pendingPlaceTileId = '',
  excelStyleCoordinates = false,
}) {
  const chainId = state.board[tileId];
  const occupied = tileId in state.board;
  const playableTarget = !occupied && canPlace && playableTiles.has(tileId);
  const playConfirmTarget = playableTarget && pendingPlaceTileId === tileId;
  const displayTileId = formatTileLabel(tileId, excelStyleCoordinates);

  const classes = ['board-tile'];
  let style = '';
  let marker = '';

  if (highlightedTileId === tileId) {
    classes.push('hand-highlighted');
  }

  if (!occupied) {
    classes.push('empty');
    if (playableTarget) {
      classes.push('playable-target');
    }
  }

  if (playConfirmTarget) {
    classes.push('play-target-confirm');
  }

  if (occupied && chainId === null) {
    classes.push('unincorporated');
  }

  if (chainId) {
    const chain = chainById[chainId];
    classes.push('chain');
    style = `--tile-chain-color:${chain?.color || '#ddd'}; --tile-chain-ink:${chainInkColor(chain?.id)};`;
    marker = chain?.name?.slice(0, 2).toUpperCase() || 'H';
  }

  return {
    classes,
    style,
    marker,
    displayTileId,
    playableTarget,
    playConfirmTarget,
  };
}

export function renderBoard(
  state,
  { highlightedTileId = '', pendingPlaceTileId = '', onSelectTile = null, excelStyleCoordinates = false } = {},
) {
  const chainById = Object.fromEntries(state.chains.map((chain) => [chain.id, chain]));
  const legal = state.legalActions;
  const canPlace = legal?.phase === PHASES.AWAIT_TILE && Boolean(legal?.isTurn);
  const playableTiles = new Set(legal?.playableTiles || []);

  return html`
    <div class="board-wrap">
      <div class="board">
        ${ROWS.flatMap((row) =>
          COLS.map((col) => {
            const tileId = `${row}${col}`;
            const view = getBoardTileView({
              state,
              tileId,
              chainById,
              playableTiles,
              canPlace,
              highlightedTileId,
              pendingPlaceTileId,
              excelStyleCoordinates,
            });
            const canSelectTile = Boolean(onSelectTile && view.playableTarget);
            const buttonClasses = canSelectTile ? [...view.classes, 'board-interactive'] : view.classes;
            const actionHint = view.playConfirmTarget
              ? `Play tile ${view.displayTileId}`
              : `Preview tile ${view.displayTileId}`;

            return html`
              <button
                type="button"
                class=${buttonClasses.join(' ')}
                style=${view.style}
                ?disabled=${!canSelectTile}
                aria-label=${canSelectTile ? actionHint : `Board tile ${view.displayTileId}`}
                @click=${() => {
                  if (canSelectTile) {
                    onSelectTile(tileId);
                  }
                }}
              >
                <span class="tile-id">${view.displayTileId}</span>
                ${view.marker ? html`<span class="tile-marker">${view.marker}</span>` : html``}
                ${view.playConfirmTarget ? html`<span class="board-play-prompt">play?</span>` : html``}
              </button>
            `;
          }),
        )}
      </div>
    </div>
  `;
}
