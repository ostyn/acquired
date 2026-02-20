# Acquired

A browser implementation of **Acquire** with a peer-to-peer architecture:

- Browser peers communicate game actions/state over **WebRTC data channels** via `peerjs`.
- Public PeerJS signaling is used to connect peers (default: `https://0.peerjs.com/`).
- No server-side game logic. The host peer is authoritative for rules and state.
- Built with **Lit**, **PicoCSS**, **Vaadin Router**, and **MobX**.

## Features

- Multiplayer room host/join flow
- Installable PWA with offline app-shell support
- Full Acquire turn flow:
  - tile placement
  - chain founding
  - mergers (including safe-chain merge restrictions)
  - majority/minority bonus payouts
  - sell/trade/hold decisions for defunct chains
  - up to 3 stock purchases per turn
  - end-game detection and final scoring
- Bot players (host-controlled): random and Monte Carlo

## Install

```bash
yarn install
```

## Run

```bash
yarn dev
```

- App: `http://localhost:5173`

## Scripts

- `yarn dev` - run Vite dev server
- `yarn build` - production build
- `yarn preview` - preview build
- `yarn test` - run unit tests
- `yarn typecheck` - TypeScript type check
- `yarn bot:benchmark --matches=20 --rolloutBudget=64 --rootActionCap=24 --maxRolloutSteps=80` - run deterministic Monte Carlo-vs-random benchmark

## Bot Difficulty

Monte Carlo bot strength/speed is controlled by these defaults in `src/game/engine/bots.ts`:

- `DEFAULT_ROOT_ACTION_CAP` (default `24`): max number of candidate moves considered at the root decision.
  Higher = explores more possible moves before choosing, usually stronger but slower.
- `DEFAULT_ROLLOUT_BUDGET` (default `64`): total rollout simulations budget split across root candidates.
  Higher = more samples per move, less noisy decisions, slower turns.
- `DEFAULT_MAX_ROLLOUT_STEPS` (default `80`): max simulated action depth for each rollout.
  Higher = looks further ahead, potentially better strategic choices, slower evaluations.

In short: increasing any of these tends to make the bot stronger and slower; decreasing them makes it faster and weaker.
For one-off experiments, prefer CLI overrides via `yarn bot:benchmark` flags instead of editing source defaults.

## Architecture

- `src/game/engine.ts`: authoritative Acquire rules engine
- `src/state/app-store.ts`: MobX app state + P2P coordination
- `src/ui/`: Lit UI components

## Notes

- The host peer validates and applies all actions.
- Guests only send actions and render host snapshots.
- Bots support both random and Monte Carlo policies (host currently defaults to Monte Carlo).
- For offline use, open the app once while online so assets are cached by the service worker.
- PWA is built with `vite-plugin-pwa` (Workbox `generateSW`).
