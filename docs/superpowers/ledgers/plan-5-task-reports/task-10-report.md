# Plan 5 Task 10 report: motion-path display (read-only)

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1402 (102 files) | 1416 (103 files; +14 `motion-path-math`) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| new e2e | n/a | `keyframes-path` 10/10 |
| related e2e (one at a time, `--trace off`) | n/a | pip 7, pip-drag 5, keyframes-ui 4, keyframes-timeline 8, overlays-ui 7, transform-fields 11, rotation 3: all green |

Commit: `feat(ui): motion path display` (+ this report). Not pushed.

## Design (files)
- `src/ui/motionPathMath.ts` (94, DOM-free): `sampleMotionPath(clip, fps, format)` -> `{ runs: Point[][], keys: PathKey[] }` in FORMAT px
  (`clipCentre` + offset, exactly how the handles place the clip). The path spans the part of the clip's visible local range
  between the first and last position key (`[max(firstKey, lo), min(lastKey, hi)]`); points are `positionAt` (one eased
  fraction for x and y) on the clip's own frame grid anchored at `lo` (the frames the preview shows) plus every key in the
  span exactly. More than `MAX_PATH_SAMPLES` (2000) frames: a whole-number frame stride (budget = 2000 - keys - 2), so the
  count is bounded even with 500 keys over an hour. A hold segment ends the current run at the held position and starts a new
  run at the next key (a gap, not a line). One key: no run, only its dot. Dots only for keys inside the visible range
  (end exclusive, the same rule as the strip and previous/next). `cachedMotionPath` memoises on the position key array
  (WeakMap; an edit makes a new array) with a signature of (visible range, fps, format w x h), so playback frames, moves
  and selection reuse the result; `motionPathTarget(p, selection)`: exactly one live selected video/image/overlay clip with
  >= 1 position key on a non-hidden track (locked allowed; adjustment and audio never).
- `src/ui/MotionPath.tsx` (95): wraps the handles. DOM order inside the preview stage: `motion-path-layer` (svg, aria-hidden,
  `data-testid="motion-path"`, one `motion-path-run` polyline per run, memoised `Line`), the transform handles (children),
  `motion-keys-layer` (svg `role=group`, one `motion-key` circle per visible key: `role=button`, `tabIndex=0`,
  `aria-label` "Position keyframe at 0.80 s", `data-time`, Enter/Space and click call `seekToKeyCmd`: playhead only, pauses
  playback, no history). Path CSS lives in `animation.css`. Both layers are `pointer-events: none`; only the dots take
  the pointer; the dot under the playhead (`data-current`) is pointer-transparent so a press on the clip centre still drags.
- `src/ui/TransformOverlay.tsx` (115): computes `overlayTarget` (handles) and `motionPathTarget` (path) separately, returns
  null only when both are null, and renders `<MotionPath>{quad}</MotionPath>`. A locked layer therefore shows the path
  and dots without handles (`transform-overlay` absent). No render/UI line that the reader audit covers was changed (the
  allowlist is untouched; the path reads `clip.keys`, which the audit does not cover, and never `.transform`).
- `src/core/keyframes.ts`: `keyVisible` moved here (single rule); `keyframeCommands.ts` re-exports it, so every importer works.

## Rulings (proposed for the ledger)
- T10-1 - The path is shown for the selected clip whenever its track is not hidden, also when the playhead is off the clip
  (handles still need the clip under the playhead): clicking a dot then brings the playhead onto the clip.
- T10-2 - Hidden track: no path (like the handles). Locked track: path and dots shown, read-only, no handles.
- T10-3 - Plan text "no path for a clip without position keys": a SINGLE key shows its dot and no line.
- T10-4 - Path span = first to last key clipped to the visible range, not the whole clip (no constant tails; endpoints equal
  the first/last key positions whenever those keys are visible). Keys beyond a trimmed edge get no dot; the path is cut at the edge.
- T10-5 - Layer order: line under the handles, dots over them (so a click reaches a dot); the handle svg root takes every
  press on the stage, so a line above it would be unreachable and a line below it cannot steal anything.
- T10-6 - Hold segments render as separate runs (a gap).

## Tests and mutation checks
- Unit (`tests/motion-path-math.test.ts`, 14): endpoints and one-point-per-frame count, evaluated samples equal `positionAt`, hold jump,
  single key, no keys, keys outside the visible range (dots and cut), all keys outside, sourceless clip, bound with 500 keys / 1 h
  at 60 fps and plain long clip, first key mid-clip, determinism/no mutation, cache identity per signature part, target rules.
- E2E (`keyframes-path`, 10): three keys -> `motion-path` through three `motion-key` dots within 1 px (page coordinates from
  `canvasBox`), 49 points, aria-labels, layer order, no history written by showing it; click and keyboard seek, no history,
  dot at the playhead lets a drag through (one step, keyed); drag starting on the line; no path without position keys / not
  selected / two selected; single key; hold gap (2 runs); playhead off the clip; hidden / locked (read-only, no handles,
  layers do not capture the pointer away from dots); overlay yes, adjustment no; reframe to 9:16 and back (dots and path on the
  rescaled keys, round trip).
- Mutations, each caught: hold break removed (unit hold test), cap removed (bounded test), visible-key filter removed (2 unit
  tests), cache signature without fps (cache test), hidden check removed, adjustment exclusion removed, end clamp removed,
  start clamp removed (unit); `data-current` pointer-through rule removed (e2e "lets presses through" fails); dots layer made
  pointer-capturing (3 e2e fail: dot drag, line drag, locked layer capture). Surviving by construction: making the LINE
  pointer-capturing changes nothing while the handle svg sits above it (T10-5), documented rather than tested.

## Concerns
- A dot at a non-current key lying inside the clip body blocks a press on its ~10 px disc (it seeks instead of dragging the clip).
- Position keys of 500 over a long clip: the path draws <= 2000 points, a straight segment may be a few frames coarse there.
- `easeAfter` scans the key list per segment (O(keys^2) <= 250k ops once per edit; memoised, not per frame).
- The path polyline is not hover-interactive (no "add key on the path"): 5B.

## Contract for Tasks 11-12
- `cachedMotionPath(clip, fps, format)` is the single source for path samples; its memo key is the position array reference
  plus (visible range, fps, format). Any future key edit must produce a new array (all edits already do).
- E2E selectors: `motion-path` (svg, `data-runs`), `motion-path-run`, `motion-key` (`data-time`, `data-current`),
  layers `.motion-path-layer`, `.motion-keys-layer`. Task 11 can reuse `keyPip` from `keyframes-path.spec.ts` (inline there).
- Task 11 robustness: path under reload (keys restored) and undo/redo follows the keys; a perf spot check could count
  re-renders of `Line` (memo) during playback (not measured here).
- Task 12: README animation section may mention the read-only path; editing the path is 5B.
