/**
 * Responsibility: Provides shared pure utilities for Acquire rules and data modeling.
 * Includes pricing math, tile math, randomization helpers, and hotel-bank construction.
 */

import { COLS, HOTEL_SHARE_COUNT, HOTELS, PRICE_BRACKETS, ROWS } from './constants';

export type HotelBankEntry = {
  id: string;
  name: string;
  tier: string;
  color: string;
  active: boolean;
  size: number;
  availableShares: number;
};

export type HotelBank = Record<string, HotelBankEntry>;

export function buildAllTiles(): string[] {
  const tiles: string[] = [];
  for (const row of ROWS) {
    for (const col of COLS) {
      tiles.push(`${row}${col}`);
    }
  }
  return tiles;
}

export function shuffle<T>(array: T[], rng: () => number = Math.random): T[] {
  const clone = [...array];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const temp = clone[index];
    clone[index] = clone[swapIndex];
    clone[swapIndex] = temp;
  }
  return clone;
}

export function parseTileId(tileId: string): { row: string; col: number } {
  const row = tileId.slice(0, 1);
  const col = Number(tileId.slice(1));
  return { row, col };
}

export function tileSortValue(tileId: string): number {
  const { row, col } = parseTileId(tileId);
  return ROWS.indexOf(row) * 100 + col;
}

export function getNeighborTiles(tileId: string): string[] {
  const { row, col } = parseTileId(tileId);
  const rowIndex = ROWS.indexOf(row);
  const neighbors: string[] = [];

  if (rowIndex > 0) {
    neighbors.push(`${ROWS[rowIndex - 1]}${col}`);
  }
  if (rowIndex < ROWS.length - 1) {
    neighbors.push(`${ROWS[rowIndex + 1]}${col}`);
  }
  if (col > 1) {
    neighbors.push(`${row}${col - 1}`);
  }
  if (col < COLS.length) {
    neighbors.push(`${row}${col + 1}`);
  }

  return neighbors;
}

export function createHotelBank(): HotelBank {
  const hotels: HotelBank = {};
  for (const hotel of HOTELS) {
    hotels[hotel.id] = {
      ...hotel,
      active: false,
      size: 0,
      availableShares: HOTEL_SHARE_COUNT,
    };
  }
  return hotels;
}

export function stockPrice(hotel: { tier: string } | null | undefined, size: number): number {
  if (!hotel || size < 2) {
    return 0;
  }
  const bracket = PRICE_BRACKETS.find((entry) => size >= entry.min && size <= entry.max);
  return bracket ? bracket[hotel.tier] : 0;
}

export function majorityBonus(hotel, size) {
  return stockPrice(hotel, size) * 10;
}

export function minorityBonus(hotel, size) {
  return stockPrice(hotel, size) * 5;
}

export function nextInOrder(playerIds: string[], currentId: string | null): string | null {
  if (!playerIds.length) {
    return null;
  }
  const currentIndex = playerIds.indexOf(currentId);
  const nextIndex = (currentIndex + 1) % playerIds.length;
  return playerIds[nextIndex];
}

export function randomChoice<T>(values: T[], rng: () => number = Math.random): T | null {
  if (!values.length) {
    return null;
  }
  const index = Math.floor(rng() * values.length);
  return values[index];
}

export function clamp(number: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, number));
}
