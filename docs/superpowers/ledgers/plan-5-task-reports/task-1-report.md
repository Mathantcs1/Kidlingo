# Plan 5 Task 1 report: preparation (behaviour-preserving)

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1182 passed (87 files) | 1185 passed (88 files; +3 in `tests/frame-snap.test.ts`) |
| full `npm run e2e -- --trace off` | 391 / 391 (15.8 min) | 391 / 391 (15.1 min) |
| typecheck, build | n/a | green; `grep -rl __clipforge dist` empty |

The audio-denoise flake did not occur in either run.

## What moved
- `src/core/model.ts`: `export const CURRENT_VERSION = 5`; `Project.version: typeof CURRENT_VERSION`; `emptyProject` uses it. (`migrate.ts` still has its own `CURRENT = 5`; Task 3 bumps both.)
- `tests/helpers/project.ts` re-exports `CURRENT_VERSION`; 16 fixture files (11 e2e specs/helpers + `adjustment.test.ts`, `overlay-math.test.ts`, and others) use it instead of `version: 5`.
  `tests/migrate-overlays.test.ts` keeps its literal `version: 5` (the literal is the point: a v5 save migrates). The plan said 18 files; the grep finds 17 (16 changed + this one).
- `frameIndex`, `snapToFrame`: bodies unchanged, now in `src/core/fps.ts`; `src/render/effects/pipeline.ts` re-exports them (`export { ... } from '../../core/fps'`).
- `splitClip`, `trimClip`: moved verbatim to new `src/core/clipEdits.ts` (51 lines); `timeline.ts` (176 -> 131 lines) re-exports them and now exports the helpers they need (`EPS`, `mapClips`, `replaceClip`, `assertFinite`, `assertFree`). Done because Task 4 edits both functions.
- `store.ts` `reconcileUi` NOT extracted: `store.ts` is 193 lines and the plan says only if Task 8 needs room; left for Task 8.
- New `tests/frame-snap.test.ts`: frameIndex/snapToFrame behaviour and that the pipeline re-export is the same function.

## Concerns
- `timeline.ts` and `clipEdits.ts` import each other (function-level use only, so no load-order problem; typecheck, tests and e2e green). Task 4 could move the shared helpers into a third file if the cycle is unwanted.
