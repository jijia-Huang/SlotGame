# Repository Guidelines

## Project Structure & Module Organization

This is a Vite + TypeScript PixiJS slot prototype. Source code lives in `src/`.
Core app bootstrapping is in `src/main.ts`, shared app/asset helpers are in
`src/core/`, animation helpers are in `src/animation/`, and slot logic/rendering
is in `src/slot/`.

Static game data and runtime assets live under `public/assets/`:

- `public/assets/config/` for symbol, paytable, and asset manifests.
- `public/assets/sequences/` for simple sequence animation definitions.
- `public/assets/sprites/` for generated creature sprite bundles.

Asset generation and repair scripts are in `tools/`. Production build output is
written to `dist/` and should not be edited directly.

## Build, Test, and Development Commands

- `npm run dev` starts the Vite dev server on `0.0.0.0`.
- `npm run build` runs `tsc` and then creates a Vite production build.
- `npm run preview` serves the production build locally.

There is currently no `npm test` script. Use `npm run build` as the baseline
verification before committing.

## Coding Style & Naming Conventions

Use TypeScript with ES modules. Follow the existing style: two-space
indentation, explicit types for public interfaces, `const` by default, and
small focused classes/functions. Keep Pixi display code in `src/slot/` or
`src/animation/`; keep math/config types in `src/slot/types.ts`.

Use `PascalCase` for classes and types, `camelCase` for functions and fields,
and lowercase kebab-style or underscore-style asset folders matching existing
patterns, e.g. `water-family-v3/stage1_hit/stage1_hit-1.png`.

## Testing Guidelines

No automated test framework is configured yet. For gameplay changes, verify:

- `npm run build` passes.
- The local Vite page loads without console errors.
- Cascades, symbol clearing, 3POT hits, hit animations, evolution animations,
  JP overlay, balance, and win display still behave correctly.

When adding tests later, prefer colocated TypeScript tests under `src/` or a
top-level `tests/` directory, and add a matching `npm test` script.

## Commit & Pull Request Guidelines

Recent history uses short imperative commit messages, for example
`Implement 3POT creature feature`. Keep commits focused and describe the user
visible change.

Pull requests should include a concise summary, verification steps, screenshots
or GIFs for visual changes, and notes about any generated assets or scripts.
Call out changes to slot math/prototype probabilities separately.

## Asset Generation Notes

Generated sprite bundles should include `raw-sheet.png`, `raw-sheet-clean.png`,
`sheet-transparent.png`, frame PNGs, `animation.gif`, and `pipeline-meta.json`.
Do not edit generated output manually when a `tools/` script can reproduce it.

When a task requires new or modified artwork, delegate the art production to a
dedicated SubAgent instead of mixing asset generation into the main coding flow.
Give that SubAgent a clear brief covering the requested subject, style,
dimensions, output location, and any reference assets that must be matched.

For animated artwork or sprite sheets, explicitly instruct the SubAgent to use
the `generate2dsprite` skill at
`C:\Users\jijiahuang\.codex\skills\generate2dsprite\SKILL.md`. The brief must
call out character consistency requirements across frames, stages, and related
assets so the generated animation still reads as the same character.

After the SubAgent delivers images or animation assets, the main Agent is
responsible for validating the result before final handoff. Inspect the produced
files, confirm they match the requested subject and style, check character
consistency, and verify animation outputs such as frame PNGs and GIFs render
correctly.
