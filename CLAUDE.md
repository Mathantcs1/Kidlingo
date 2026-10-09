# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fairshare** (in the Kidlingo repo) is a local-first, Splitwise-style expense splitting PWA. React 19 + TypeScript + Vite, no backend — all data lives in `localStorage`. See README.md for the feature list.

## Commands

- `npm install` — install dependencies
- `npm run dev` — dev server
- `npm run build` — typecheck (`tsc -b`) + production build to `dist/`
- `npm test` — run all unit tests (Vitest); single file: `npx vitest run src/core/core.test.ts`
- `npm run typecheck` — TypeScript only
- No linter/formatter is configured; match existing style (2 spaces, single quotes, semicolons).

## Architecture

- `src/core/` is pure, framework-free logic and the only place money math happens. Keep it that way and add tests in `core.test.ts` for any change.
- `src/state/store.tsx` — single `useReducer` store; every mutation is an `Action`. Persisted on each change; syncs across tabs via the `storage` event.
- `src/components/` — UI. `GroupView.tsx` holds the four group tabs.

## Key conventions

- **All amounts are integers in the currency's minor unit** (`Minor`). Never use floats for money; use `parseMoney`, `formatMoney`, `allocate`, `convert` from `core/money.ts`.
- Any split must sum exactly to the total — use `allocate()` (largest remainder, seeded by expense id so the leftover cent rotates).
- Expenses store `fxRate` to the group's base currency at creation time; never recompute old expenses with new rates.
- Settle-up payments are ledger entries with `kind: 'payment'` (payer → `split.mode: 'exact'` recipient).
- Deletes are soft (`deletedAt`) so they can be undone and so they propagate through share-link merges; merges are last-write-wins on `updatedAt`.
- `Group.meId` is per-device and must never be taken from an imported share link.
- Bump `AppState.version` and add a migration in `core/io.ts#parseState` for breaking data changes.
