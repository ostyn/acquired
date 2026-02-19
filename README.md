# Acquire P2P (Lit + Vaadin Router + MobX)

A browser implementation of **Acquire** with a peer-to-peer architecture:

- Browser peers communicate game actions/state over **WebRTC data channels** via `peerjs`.
- Public PeerJS signaling is used to connect peers (default: `https://0.peerjs.com/`).
- No server-side game logic. The host peer is authoritative for rules and state.
- Built with **Lit**, **PicoCSS**, **Vaadin Router**, and **MobX**.

## Features

- Multiplayer room host/join flow
- Full Acquire turn flow:
  - tile placement
  - chain founding
  - mergers (including safe-chain merge restrictions)
  - majority/minority bonus payouts
  - sell/trade/hold decisions for defunct chains
  - up to 3 stock purchases per turn
  - end-game detection and final scoring
- Random bot players (host-controlled)

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

## Architecture

- `src/game/engine.ts`: authoritative Acquire rules engine
- `src/state/app-store.ts`: MobX app state + P2P coordination
- `src/ui/`: Lit UI components

## Notes

- The host peer validates and applies all actions.
- Guests only send actions and render host snapshots.
- Bots are intentionally random for now and use legal-action sampling.
