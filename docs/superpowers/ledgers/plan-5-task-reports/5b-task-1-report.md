# Plan 5B Task 1 report: preparation (behaviour-preserving)

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1475 passed (106 files) | 1475 passed (106 files) |
| full `npm run e2e -- --trace off` | 470 / 470 (24.2 min) | 470 / 470 (23.9 min) |
| typecheck, build | n/a | green; `grep -rl __clipforge dist` empty |

No flake occurred in either run.

## What moved (code only, no logic change)
- `src/ui/EaseEditor.tsx` (200 -> 14 lines): host only; `EasePanel` and its helpers (`LABELS`, `FIELDS`, `locate`, `easesOf`) now in `src/ui/EasePanel.tsx` (189 lines).
- `src/core/audioEdits.ts` (200 -> 138): `detachAudio`, `attachAudio`, `sameMix`, `sameDuck` now in `src/core/detachAudio.ts` (68); `audioEdits.ts` re-exports both functions, so importers are unchanged. The private `mapClip` use in `detachAudio` became `replaceClip(q, id, next)` from `timeline.ts` (identical result: copies every track, swaps the clip).
- `src/core/keyframeEdits.ts` (188 -> 145): `locate`, `commitClip`, `assertInside`, `isPosition`, `keyToValue`, `selection`, `sameFrame`, `OUTSIDE_REFUSAL` now in `src/core/keyEditHelpers.ts` (52); `keyframeEdits.ts` re-exports `OUTSIDE_REFUSAL` and `commitClip`.
- `src/ui/useTransformDrag.ts` (171 -> 168): the store-change check is now `isStaleDrag(g, present, prevPresent)` in new `src/ui/dragStale.ts` (21). The plan said "extract the stale-drag check"; it is small, so the file shrank only 3 lines. Task 8 will extend the check (`storeMotion`) there instead of in the hook.
- `src/ui/Inspector.tsx` (162 -> 85): `VolumeControl`, `FitControl`, `FIT_MODES`, the local `apply` now in `src/ui/ClipBasics.tsx` (81).
- `resolveClip(clip, t, format)` takes `{ width, height, fps }` (exported type `ResolveFormat` in `animate.ts`); caller `drawCollect.ts` passes `p.format`; tests (`animate`, `keyframe-clip-ops`, `keyframe-scale-zero`, `keyframe-perf`, `migrate-keys`, `draw-collect` mock) and `tests/e2e/robust-harness-helpers.ts` updated. Results identical (fps is the only field read). `resolvedTransform(clip, t, fps)` is unchanged.
- `easeAt(e, u, seconds = 1)`: the argument is accepted and unused (`void seconds`). `keyframes.ts` `fraction()` (shared by `valueAt` and `positionAt`) passes the segment seconds `keys[i+1].t - a.t`.
- `tests/transform-readers.test.ts`: the entry `now.transform !== g.storeTransform` moved from `useTransformDrag.ts` to `dragStale.ts` (same reason, count still exactly 1). The `storeTransform: clip.transform` entry stays on `useTransformDrag.ts`. No other reader moved.

All touched files are <= 200 lines.

## Concerns
- None blocking. `easeAt`'s unused `seconds` is silenced with `void seconds;`; Task 3 removes that line when the spring branch reads it.
- `audioEdits.ts` and `detachAudio.ts` do not import each other in a cycle (`detachAudio` imports only `timeline`, `tracks`, `model`, `clipAudio`).
- Process note: the baseline e2e must finish before editing `src/` (the dev server serves live source), so edits to existing files waited for the baseline; new files were prepared meanwhile.
