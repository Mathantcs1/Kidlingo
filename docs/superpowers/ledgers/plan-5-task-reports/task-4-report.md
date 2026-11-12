# Plan 5 Task 4 report: pure keyframe edits and clip-operation rules

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1278 (92 files) | 1280 after Step 0 (+1 `tooClose`, +1 bounded keys); 1323 after Task 4 (94 files; +26 `keyframe-edits`, +17 `keyframe-clip-ops`) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| e2e (touched, run sequentially) | n/a | `keyframes-migration` 1/1 + `layers-migration` 4/4 (Step 0); then keyframes-migration, layers-migration, restore, pip, layers-ui, overlays-ui, audio-ui, inspector, transform-fields, rotation, pip-drag: 65/65; layers-robust, effects-ui, layers-journey, audio-journey, layers-ui-keys: 20/20 |

Commits: `a70ac89 fix: shared tooClose rule, bounded position keys, split migration e2e` (Step 0, ledger P5-4),
`9224c65 feat: keyframe edits and clip-operation rules` (+ this report).

## Step 0 (ledger P5-4)
- (a) `tooClose(a, b)` (`|a − b| < KEY_EPS`) exported from `keyframes.ts`; used by `migrateKeys.normalise`, `nearestKey`
  (upsert, remove, ease, move selection), `moveKeys`' overlap check and `keyTimes`. Property test: 400 random keyed writes
  (incl. times within 2e-4 of each other) survive `migrateProject` unchanged.
- (b) `KEYED_POSITION_LIMIT = 1e7` (format px), `KEYED_SCALE_LIMIT = 1e6`; migration clamps position keys to ±1e7 and keyed
  scale to 0..1e6. Test: x/y = ∓1e308 and scale 1e308 resolve finite at 5 times (mutation: no position clamp ⇒ fails).
- (c) The v5 → v6 pixel test moved verbatim to `tests/e2e/keyframes-migration.spec.ts` (uses `overlay-helpers`' `savedProject`/
  `writeSaved`); `layers-migration.spec.ts` back to 207 lines.
- (d) No edit evaluates an empty list: every evaluation goes through `targetKeys` (non-empty or undefined) → `valueAtLocal`,
  which falls back to the static value.

## Design (files)
- `src/core/animTargets.ts` (145): `AnimTarget`, `KeyRef` (t = LOCAL seconds), `AnimValue` (`number | {x, y}`),
  `TransformProp`, `TRANSFORM_PROPS`, `ANIMATED_REFUSAL`, `sameTarget`, `assertTarget` (per-kind refusals), `targetKeys`
  (non-empty list or undefined), `staticValue`, `valueAtLocal` (resolver-identical clamps), `targetValueAt(clip, target, t, fps)`
  (timeline time), `withTargetKeys` (removes emptied lists and an emptied `keys` object, clip or effect), `withStaticValue`
  (rotation normalised, −0 → 0), `animatedTargets`, `keyTimes`, `keyRefsAt`. (`animatedTargets` lives here, not in
  `animate.ts`, next to `AnimTarget`.)
- `src/core/keyLists.ts` (88): `AnyKey`, `copyKey`, `nearestKey`, `splitKeys`, `shiftKeys`, `mapTransformKeys`, `mapEffectKeys`,
  `KeyValue`, `upsertKey` (returns null when full; callers throw). The plan listed upsert/split/shift for `keyframes.ts`;
  they live here to keep `keyframes.ts` (evaluation) small. `keyframes.ts` gained `tooClose`, the two limits and `localRange`.
- `src/core/keyframeEdits.ts` (179): `setAnimated`, `setValueAt`, `removeKeys`, `moveKeys`, `setKeyEase`, `commitClip`,
  `OUTSIDE_REFUSAL`; re-exports the types and queries of `animTargets.ts` (import everything from here).
- `src/core/transformKeyEdits.ts` (66): `setTransformAt`, `withLiveValue`.
- `src/core/transformEdits.ts` (100): `setClipTransform`, `resetClipTransform`, `withClipTransform`, `withoutTransformKeys`, moved
  from `src/ui/transformEdits.ts` (now a 4-line re-export incl. `setTransformAt`/`withLiveValue`) because core `setValueAt`
  delegates to the static edit. `normaliseDegrees` moved to `src/core/transformLimits.ts` (with `REACH`, `clamp`);
  `src/render/overlayGeometry.ts` re-exports it (all imports unchanged).
- `src/core/reframeKeys.ts` (23): `hasFramingKeys`, `scaleFramingKeys` (shared by `merge.ts` and `overlays.ts` without a cycle).
- Modified: `clipEdits.ts` (split/trim key rules), `clipEffects.ts` (`cloneVideoEffects(effects, mapKeys = deep copy)`),
  `merge.ts` (reframe), `overlays.ts` (reframeOverlay), `audioEdits.ts` (detach twin without keys; file 200 lines),
  `videoEffectEdits.ts` (refusal; `applyLook` treats a keyed stack as never "already the look"), `ui/edits.ts` (`setClipFit`).
- No module-level state added; the `timeline.ts` ↔ `clipEdits.ts` cycle is unchanged (`keyLists.ts` deliberately does not
  import `timeline.ts`).

## Rulings (proposed for the ledger)
- T4-1 - `setAnimated` (on AND off) refuses with the playhead off the clip (`OUTSIDE_REFUSAL`, same text as D8), so the
  stopwatch always writes/keeps the value the user sees. "Inside" = `start − 1e-9 ≤ t < end − 1e-9`. Same-state no-op is
  checked first (returns `p` even off the clip). Non-finite `t` ⇒ 'Invalid playhead time'.
- T4-2 - `removeKeys` that empties a property makes it static at its EARLIEST key's value (the key itself when it was alone),
  rotation normalised.
- T4-3 - Static edits refuse strictly: a `setClipTransform` patch that NAMES an animated property (x or y for position) or an
  `updateVideoEffect` patch that names an animated param throws `ANIMATED_REFUSAL`, even with an equal value. `enabled` and
  unanimated fields still work. (Task 6's drag must commit through `setTransformAt`, not `setClipTransform` with a full transform.)
- T4-4 - Key value clamps: `setValueAt` uses the static edit's clamps (position ±4 × format per axis, scale
  `scaleBounds(value shown at the playhead)` per P5-3, opacity 0..1, effect schema range) plus the hard key limits (±1e7,
  0..1e6, keyed rotation ±36 000, NOT normalised). `setAnimated(on)` uses only the hard limits (the first key equals the static
  value: no jump). −0 is stored as 0. `withLiveValue` clamps nothing (live preview only).
- T4-5 - `splitKeys(list, lo, hi)` keeps in-range keys plus the nearest key before `lo` / after `hi`, except when a key sits
  EXACTLY at `lo` / `hi` (that neighbour is not needed). Count test pins it (mutation "always keep the previous" fails).
- T4-6 - Reset on an adjustment clip stays a no-op (its opacity keys kept, `p` returned). `setClipFit` on media without known
  dimensions only changes the mode (transform and keys kept); with dimensions it removes position and scale keys.
- T4-7 - Reframe: position/scale keys scale exactly like the static fields (Ruling J/K: no clamp; a non-finite or negative
  scaled key keeps its value). A clip with position or scale keys is always customised (also overlays: position keys scale,
  scale keys stay). An unusable old canvas refits the static transform and leaves keys unchanged. Rotation/opacity/effect keys
  never change.
- T4-8 - `insertion ease`: a new key between two keys takes a COPY of the segment's ease (so both halves of the old segment keep
  its kind); at either end `linear`. Replacing a key keeps its time and ease.
- T4-9 - `moveKeys` local range is inclusive `[lo − 1e-9, hi + 1e-9]` (`localRange`: `[in, out]` sourced, `[0, duration]`
  sourceless); delta 0 / no matching ref ⇒ `p`; selected keys may pass unselected ones as long as none lands within KEY_EPS.
- T4-10 - `keyTimes` merges times within KEY_EPS into the earliest; `keyRefsAt(clip, u)` returns at most one ref per target
  (its nearest key within KEY_EPS), in `animatedTargets` order (transform props, then effects in stack order, params in schema
  order).
- T4-11 - Split/trim exactness at timeline frames holds for cut offsets that are whole frames from the clip start; see concern 1.

## Tests and mutation checks
- `tests/keyframe-edits.test.ts` (26): setAnimated on/off per kind (sourced/sourceless, position, effect, adjustment opacity),
  write-back normalisation, every refusal (locked, audio, adjustment scale, overlay effect, mirror.mode, unknown param/effect,
  outside, NaN); setValueAt static path ≡ static edit, replace within KEY_EPS, segment ease on insert, clamps, refusals
  (outside, non-finite, wrong shape, locked, MAX_KEYS incl. replace at the limit), migration-stable property test; static edit
  refusals; removeKeys/moveKeys/setKeyEase exact results and same-reference no-ops; setTransformAt routing (one project),
  withLiveValue (no clamp, no lock guard); queries. Input-not-mutated and untouched-track sharing are asserted.
- `tests/keyframe-clip-ops.test.ts` (17): split property tests (300 random clips of all four kinds, random keys incl. hold/back/
  elastic/bezier, every timeline frame of both halves equals the original within 1e-9 for frame-aligned cuts; and at ANY cut the
  halves' curves equal the original on their own local range), needed-key counts, sourceless shift, no shared key arrays/objects,
  static split unchanged; trim property test (200 clips, start/end, sourced/sourceless) and key handling; reframe scaling, "keyed
  never refits", A→B→A round trip for all 12 format pairs (1e-9), overlay keys; setClipFit/Reset with store undo; detach twin;
  cloneVideoEffects independence (arrays, key objects and bezier arrays); applyLook; move/ripple/join keep the same key objects.
- Mutation checks (25, each restored from a scratch copy, all CAUGHT): split sourceless shift removed; nearest key beyond end
  dropped; nearest before start dropped; always keep previous (count test); sourceless trim shift removed; setClipTransform
  refusal; updateVideoEffect refusal; insert ease → linear; upsert same-reference no-op; MAX_KEYS; moveKeys overlap; moveKeys
  range; setValueAt outside refusal; keyed scale bounds; rotation normalisation on write-back; detach twin spread `...clip`;
  clone shallow keys; reframe "keyed never refits"; reframe key scaling; overlay keyed customised; applyLook keyed shape;
  setClipFit key removal; Reset key removal; assertTarget in edits; adjustment opacity-only. Step 0: position clamp removed and
  dedup via tooClose disabled both caught.

## Contract for Tasks 5-8
- Import edits, types and queries from `src/core/keyframeEdits.ts`; `setTransformAt`/`withLiveValue` from
  `src/core/transformKeyEdits.ts` (or `src/ui/transformEdits.ts`, which re-exports them with the static edits).
- Times: `setAnimated`, `setValueAt`, `setTransformAt`, `withLiveValue`, `targetValueAt` take TIMELINE time (the playhead);
  `KeyRef.t`, `keyTimes`, `keyRefsAt`, `localRange` are LOCAL (`localTime(clip, t, fps)`; for sourced clips `in`-based). To
  place a diamond on the timeline: `clip.start + (u − localRange(clip)[0])`; only keys inside `localRange` are visible.
- Task 6: inspector value = `targetValueAt(clip, target, playhead, fps)` (or `resolvedTransform`); field commit =
  `setValueAt` (static or keyed automatically); stopwatch = `setAnimated(on/off)`; key diamond toggle = `keyRefsAt(clip, u)` for
  that target → `removeKeys`, else `setValueAt` with the shown value; prev/next = the target's key times. The drag must commit
  ONE `setTransformAt` (a full-transform `setClipTransform` is refused when any property is animated, T4-3) and preview with
  `withLiveValue`. Note: `dragTransform` normalises rotation to (−180, 180]; for keyed rotation the commit should pass the
  start rotation plus the drag delta (unnormalised) or keys at 400° become 40° (same frame, different interpolation).
- Task 7: slider release ⇒ `setValueAt` with the effect target; `animatableParam` decides whether a stopwatch exists; the
  chroma key colour picker as keys = three `setValueAt` in one `apply`.
- Task 8: summary diamonds = `keyTimes(clip)` within `localRange`; selection = `keyRefsAt(clip, u)` per diamond; drag commit =
  ONE `moveKeys(p, clipId, refs, delta)` (refusals: 'Keyframes would overlap', 'Keyframes must stay on the clip'); Delete =
  `removeKeys`; ease editor = `setKeyEase(p, clipId, refs, ease)`.
- Task 5: unchanged contract from Task 3 (`resolveClip`, `maxScale` on the RAW clip). Keyed scale can be 0 (evaluation floor) but
  key VALUES written by edits are ≥ 0.02 unless the static/resolved scale was already below it.

## Concerns
1. **Split/trim at a non-frame-aligned offset.** D3 evaluates at `in + snap(t − start)`: the frame grid is anchored on the clip
   start, and the playhead (and so split/trim points) is not frame-snapped. After a split at `start + d` with `d` not a whole
   number of frames, the right half samples its keys on a grid shifted by `d mod 1/fps` (sub-frame), so a timeline frame of the
   right half can show the value of a neighbouring footage instant (< 1 frame of local time). Keys themselves follow the
   footage exactly (local-level property test), and for whole-frame offsets every frame is identical (timeline-level property
   test). This is the same behaviour as Plan 4's time-based effects. If exact frame equality on any split is wanted, the fix is
   outside Task 4 (snap split/trim points to the clip's frame grid, or anchor `snapToFrame` on absolute timeline time); the
   controller should rule. Task 11's "frame pixels before/after equal" e2e should split at frame-aligned points or accept it.
2. No `duplicateClip` exists today; "duplicate" is covered by `cloneVideoEffects` deep-copying keys and by split producing
   independent key copies. A future duplicate/copy-paste must copy `keys` (use `copyKey`/`mapTransformKeys`).
3. Hand-edited keys near the hard limits can exceed them after a reframe (Ruling K: reframe never clamps, ratio ≤ 1.78) and
   would then be clamped by migration on the next load. Edits keep |x| ≤ 7 680, so this needs hand-edited data.
4. `withLiveValue` always returns a new project when keyed fields are present (even if the value is unchanged); harmless for
   a never-committed preview.
5. `src/core/audioEdits.ts` is at 200 lines (+1); it should be split before it grows again.
