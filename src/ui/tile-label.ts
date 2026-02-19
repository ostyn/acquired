/**
 * Responsibility: Provides display-only tile label formatting for alternate board coordinate styles.
 * Keeps engine tile IDs stable while allowing UI labels to be transformed.
 */

import { ROWS } from '../game/constants';

function toColumnLetter(col: number): string {
  if (!Number.isInteger(col) || col < 1) {
    return '';
  }
  return String.fromCharCode(64 + col);
}

export function formatTileLabel(tileId: string, excelStyleCoordinates = false): string {
  if (!excelStyleCoordinates || typeof tileId !== 'string' || tileId.length < 2) {
    return tileId;
  }

  const row = tileId.slice(0, 1);
  const col = Number(tileId.slice(1));
  const rowIndex = ROWS.indexOf(row);
  const colLetter = toColumnLetter(col);

  if (rowIndex === -1 || !colLetter) {
    return tileId;
  }

  return `${colLetter}${rowIndex + 1}`;
}

