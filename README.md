# Lightweight Slot Framework

A small desktop Web slot-machine starter built with Vite, TypeScript, PixiJS v6, and the Pixi Spine 3.8 runtime.

## Commands

```bash
npm install
npm run dev
npm run build
```

The demo starts with a 6x5 cascading slot board, DOM HUD, local mock spin adapter, configurable anywhere-pay payouts, generated sequence symbols, a prototype 3POT feature, and a Spine 3.8 loader entry point.

## Runtime Shape

- `GameApp` owns Pixi initialization, resize, ticker, and scene mounting.
- `CascadeSlotMachine` owns the tumble flow: `idle -> spinning -> result -> clearing -> dropping -> payout`.
- `CascadeSpinAdapter` precomputes each cascade step so the animation never swaps random spin symbols into different stop symbols, then creates final-board Pokeball feature events.
- `SymbolView` displays configured sequence animations.
- `SpineAnimation` loads Spine 3.8 JSON/atlas resources through `@pixi-spine/all-3.8`.

## Public Config

- `public/assets/config/assets.manifest.json`
- `public/assets/config/symbols.json`
- `public/assets/config/paytable.json`
- `public/assets/sequences/demo-symbols.json`

The demo sequence JSON is intentionally generic. Replace it with your own sequence schema or add a TexturePacker parser without changing the slot state flow.

The current gameplay model follows a Storm-of-Seth-style tumble loop: fill a 6x5 board, pay 8+ matching pay symbols anywhere on the board, clear winners, drop/refill, and repeat until no win remains. Final-board Pokeballs act as non-paying special symbols that fly to one of three character pots, where they can charge, evolve the family, or trigger a prototype JP count-up.

## Spine 3.8 Assets

Put exported Spine 3.8 resources under `public/assets/spine/`, then add them to `assets.manifest.json`.

Expected export files:

- `name.json`
- `name.atlas`
- one or more atlas `.png` pages referenced by the atlas

Keep the runtime and exported editor version aligned with Spine 3.8.x.
