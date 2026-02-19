/**
 * Responsibility: Defines immutable game constants used by engine and UI layers.
 * Includes board dimensions, hotel metadata, phase identifiers, and rules thresholds.
 */

export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
export const COLS = Array.from({ length: 12 }, (_, index) => index + 1);

export const HOTELS = [
  { id: 'tower', name: 'Tower', tier: 'cheap', color: 'var(--chain-tower)' },
  { id: 'luxor', name: 'Luxor', tier: 'cheap', color: 'var(--chain-luxor)' },
  { id: 'american', name: 'American', tier: 'cheap', color: 'var(--chain-american)' },
  { id: 'festival', name: 'Festival', tier: 'medium', color: 'var(--chain-festival)' },
  { id: 'worldwide', name: 'Worldwide', tier: 'medium', color: 'var(--chain-worldwide)' },
  { id: 'imperial', name: 'Imperial', tier: 'expensive', color: 'var(--chain-imperial)' },
  { id: 'continental', name: 'Continental', tier: 'expensive', color: 'var(--chain-continental)' },
];

export const STARTING_CASH = 6000;
export const MIN_STARTING_CASH = 1000;
export const MAX_STARTING_CASH = 50000;
export const STARTING_CASH_STEP = 100;
export const MIN_PLAYER_COUNT = 2;
export const MAX_PLAYER_COUNT = 6;
export const HAND_SIZE = 6;
export const HOTEL_SHARE_COUNT = 25;
export const SAFE_CHAIN_SIZE = 11;
export const GAME_END_SIZE = 41;

export const PHASES = {
  LOBBY: 'lobby',
  AWAIT_TILE: 'await_tile',
  AWAIT_FOUND_CHAIN: 'await_found_chain',
  AWAIT_MERGER_SURVIVOR: 'await_merger_survivor',
  AWAIT_MERGER_DEFUNCT_ORDER: 'await_merger_defunct_order',
  AWAIT_MERGER_DISPOSITION: 'await_merger_disposition',
  AWAIT_BUY: 'await_buy',
  GAME_OVER: 'game_over',
};

export const PRICE_BRACKETS = [
  {
    min: 2,
    max: 2,
    cheap: 200,
    medium: 300,
    expensive: 400,
  },
  {
    min: 3,
    max: 3,
    cheap: 300,
    medium: 400,
    expensive: 500,
  },
  {
    min: 4,
    max: 4,
    cheap: 400,
    medium: 500,
    expensive: 600,
  },
  {
    min: 5,
    max: 5,
    cheap: 500,
    medium: 600,
    expensive: 700,
  },
  {
    min: 6,
    max: 10,
    cheap: 600,
    medium: 700,
    expensive: 800,
  },
  {
    min: 11,
    max: 20,
    cheap: 700,
    medium: 800,
    expensive: 900,
  },
  {
    min: 21,
    max: 30,
    cheap: 800,
    medium: 900,
    expensive: 1000,
  },
  {
    min: 31,
    max: 40,
    cheap: 900,
    medium: 1000,
    expensive: 1100,
  },
  {
    min: 41,
    max: Number.POSITIVE_INFINITY,
    cheap: 1000,
    medium: 1100,
    expensive: 1200,
  },
];
