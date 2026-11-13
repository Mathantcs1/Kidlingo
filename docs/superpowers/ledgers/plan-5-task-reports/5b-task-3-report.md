# Plan 5B Task 3 report: spring easing and keyframe loops (pure + resolver)

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1508 (109 files) | 1550 (113 files; +13 `spring`, +15 `key-loops`, +10 `loop-edits`, +4 `key-loops-split`; `ease-spring-data`'s TEMPORARY linear pin rewritten, count unchanged) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| e2e (one at a time) | n/a | `keyframes-ease` 4/4 (easing.ts changed; test 1 now also asserts `ease-preset-spring` is absent), `keyframes-render` 4/4 (static/keyed rendering unchanged) |

Commit: `713dd05 feat: spring easing and keyframe loops` (+ this report). Not pushed.

## Design (files)
- `src/core/spring.ts` (59, new): `springAt(s, tau)` closed form of a damped oscillator released at rest from 0 towards 1:
  ω0 = √(k/m), ζ = c/(2√(km)), a = ζω0. Under-damped `1 − e^(−aτ)(cos wτ + a·sin(wτ)/w)`, critically damped (ζ² − 1 === 0)
  `1 − e^(−aτ)(1 + aτ)`, over-damped the same with cosh/sinh (`w·τ < 20`) or, for long segments, the two-exponential form
  (no overflow; both exponents ≤ 0). sin(wτ)/w and sinh(wτ)/w → τ as w → 0, so the branches meet continuously (measured
  max |x(ζ = 1 ± 1e-9) − x(1)| = 4.5e-10). Damping 0 = `1 − cos ω0τ` ∈ [0, 2]. `springEase(s, u, seconds)` =
  `x(u·S) − u·x(S) + u` (the linear endpoint correction written so u = 0 gives exactly 0 and u = 1 exactly 1, no guards
  needed); non-positive/non-finite seconds read as 1. `springResidual(s, S) = |1 − x(S)|` (for Task 8's "does not settle"
  note, threshold 0.02 per D5). `SPRING_PRESETS`: `[{key, label, spring}]` Gentle 120/14/1, Snappy 170/26/1 (= SPRING_DEFAULT),
  Bouncy 180/12/1, Wobbly 180/8/1 (keys match the Task 8 chips `ease-spring-<key>`).
- `src/core/easing.ts`: `void seconds` and the TEMPORARY comment deleted; `case 'spring': return springEase(e.spring ??
  SPRING_DEFAULT, u, seconds)`. easing.ts imports spring.ts; spring.ts imports only the TYPE from easing.ts (no runtime cycle).
  `keyframes.ts` already passes the segment seconds (`keys[i+1].t − keys[i].t`, 5B Task 1) to both `valueAt` and `positionAt`.
- `src/core/keyLoops.ts` (72, new): `loopedTime(list, loop, u) → {u, cycle, reverse}`, `evalKeys(list, loop|undefined, u, min,
  max)` (the ONE numeric evaluator; without a loop it IS `valueAt(list, u, min, max)`), `evalPositionKeys(list, loop|undefined,
  u)` (offset per axis; Task 4's `evalPosition` in spatialPath.ts should replace/absorb it and keep calling `loopedTime`).
- `src/core/targetLoops.ts` (53, new): `targetLoop(clip, target)`, `withTargetLoop`, `withPropLoop(keys, prop, loop|undefined)`,
  `withParamLoop(effect, param, loop|undefined)` (fresh loop copies; an emptied `loops` record is removed). Separate module so
  animTargets/transformEdits/loopEdits share it without an import cycle (it imports only types).
- `src/core/loopEdits.ts` (39, new): `setKeyLoop(p, clipId, target, loop | null)`, `LOOP_NEEDS_KEYS`.
- `src/core/animate.ts`: `resolvedTransform` and `resolveEffect` go through `evalKeys`/`evalPositionKeys` with the stored loops;
  the resolved effect drops `loops` as well as `keys`. Fast path and `isAnimated` unchanged (loops alone never animate).
- `src/core/animTargets.ts` (159): `valueAtLocal` reads the target's loop (so `targetValueAt`, the stopwatch-off write-back,
  `setValueAt`'s clamp reference and the drag's position routing all see the looped value); `withTargetKeys` removes the
  target's loop when its list is removed/emptied, `orient` when position goes, and the whole `keys` object when no LIST remains
  (was: when no field remained); for effects, `loops` go with the last key list.
- `src/core/transformEdits.ts`: `withoutTransformKeys(keys, props: KeyedTransformProp[])` also drops those props' loops and,
  with position, `orient`; undefined when no list remains (so `setClipFit` clears stale loops/orient).
- `src/core/keyLists.ts`: `mapTransformKeys`/`mapEffectKeys` callbacks receive `looped: boolean`; loops are deep-copied (effect
  loops too, previously shared by reference). `src/core/clipEdits.ts`: split's `part()` keeps a looped list WHOLE (fresh copies,
  shifted for a sourceless right half), unlooped lists partitioned as in 5A D9. `src/core/clipEffects.ts`: `cloneVideoEffects`
  passes `looped` through. Trim needed no change (sourceless start trim shifts whole lists, which shifts the loop with them).
- `keyframeEdits.ts` needed no edit: `setAnimated(off)` and `removeKeys` (last key) both go through `withTargetKeys(…, undefined)`.

## Rulings (proposed for the ledger)
- R3-1 - Loop cycles are END-inclusive: cycle c ≥ 1 covers (first + cP, first + (c+1)P], c = ⌈e/P⌉ − 1, e = u − first. So
  every cycle end shows the last key's value exactly like cycle 0 does at the last key (repeat jumps to the first value just
  AFTER a boundary, not on it); ping-pong and offset are continuous at boundaries anyway. Up to and including the last key
  (and before the first) the plain keys are read (cycle 0).
- R3-2 - `count` N = cycles after the first: looping runs through cycle N; after first + (N+1)P the END of cycle N holds
  (repeat: last value; ping-pong: first value when N is odd, last when even; offset: last + N·(last − first)).
- R3-3 - No per-fps "period < 1 frame" floor (the Task 3 interfaces take no fps): a loop is inert only with < 2 keys or a
  non-positive period; keys are always ≥ KEY_EPS apart, so a sub-frame period merely aliases (deterministic, preview == export).
  Cost if wrong: a guard needs fps threaded to `evalKeys`'s callers (valueAtLocal has none today).
- R3-4 - Offset clamps once, AFTER adding the offset (a `back` overshoot over the range can be brought back by a negative
  offset); without a loop / in cycle 0 the result is bit-identical to 5A `valueAt`.
- R3-5 - A loop survives while its target keeps ≥ 1 key (R2-5; inert with 1 key) and is removed with the LAST key, with the
  stopwatch off, with `withoutTransformKeys`/`setClipFit` (position/scale) and Reset (all keys). Adding keys again never revives
  an old loop. `orient` is removed with the last position key.
- R3-6 - `setKeyLoop` order: lock → assertTarget → `null` (remove; no-op when absent) → mode check ('Unknown loop mode') →
  count (null kept; finite rounded and clamped 1..1000 like R2-1; non-finite/non-number ⇒ 'Invalid loop count') → < 2 keys ⇒
  'A loop needs two keyframes' → identical loop ⇒ same project. Setting a loop on a 1-key target is refused even if an inert
  one is stored.
- R3-7 - Ping-pong plays odd cycles backwards in time (eases traversed in reverse), the standard "ping-pong" behaviour.
- R3-8 - Writing a value past the last key of a looped target inserts a key there (the period grows); no special rule.

## Tests and mutation checks
- `tests/spring.test.ts` (13): RK4 (h = 1e-5) at 201 points over 1 s for 12 sets (4 presets, ζ = 0 twice, ζ = 1 exactly twice,
  over-damped twice, mixed masses) within 1e-6; x(0) = 0 exactly and → 1; ζ = 1 ± 1e-9 within 1e-9 (6 k/m pairs, 301 τ);
  over-damped monotone ≤ 1 and finite at τ = 1e6 (ease monotone too); damping 0 in [0, 2] over 100 s, ease in [−1, 3];
  `springEase` exactly 0/1 for 12 sets × 6 segment lengths; continuity into both ends for unsettled springs; physical-time
  invariance (0.5 s vs 2 s, < 1e-12 after removing each correction, and within the two corrections); easeAt wiring/defaults/
  clamping; bouncy overshoots, snappy settles < 2 % in 0.5 s; presets; `valueAt` on a 0.5 s and a 2 s segment, overshoot clamped
  to opacity 0..1.
- `tests/key-loops.test.ts` (15): repeat / pingPong / offset at 20 times across 3 cycles vs a hand-computed table; `loopedTime`
  results; count 1/2/3 boundaries per mode; < 2 keys inert; before-first holds; no loop = `valueAt` bit-for-bit (incl. spring);
  eased lists; rotation 0→360 offset at 2.5 periods = 900°; clamp after offset; position loops; resolver (`resolvedTransform`
  per property with clamps, count hold), effect param loops clamped to the schema (hue 200 ⇒ 180), resolved clip has no
  keys/loops, inspector value (`targetValueAt`) == resolver for every looped target.
- `tests/loop-edits.test.ts` (10): setKeyLoop set/remove/fresh copy/count clamp/no-ops/refusals (1 key, static, locked, audio,
  adjustment, overlay effect, unknown param, mode, NaN count, unknown clip); lifecycle: last key removed (1 key keeps the inert
  loop), not revived by re-adding, stopwatch off writes the LOOPED value and drops loop/orient, withTargetKeys (incl. one effect
  param of two), withoutTransformKeys/setClipFit, value past the last key.
- `tests/key-loops-split.test.ts` (4): property test, 200 random clips (all four kinds; 85 % of targets looped with random mode
  and count; eases incl. two springs; keys only in the first half so the right half is mostly loop), whole-frame cuts (P5-5):
  every frame of both halves within 1e-9 (relative) of the original; looped lists whole with fresh keys/loops; unlooped list still
  partitioned beside a looped one; sourceless right half shifted (offset rotation = 1080° at the same timeline time); trim
  property test (100 clips, start/end, whole frames).
- `tests/ease-spring-data.test.ts`: the TEMPORARY linear pin replaced by "spring evaluates, exact ends, segment-aware".
- `tests/e2e/keyframes-ease.spec.ts` test 1: `ease-preset-spring` has count 0 in the open editor (Task 8 removes the assertion
  together with the `OFFERED` filter).
- Mutation checks (each on the file, restored afterwards; all CAUGHT): no endpoint correction (`springEase = springAt(uS)`) ⇒ 4
  spring tests fail; split partitions looped lists ⇒ 3 split tests fail incl. the property test on frame values (`#0 L … scale
  1.42 vs 0.73`); count off by one (`> count + 1`) ⇒ count test fails; `>= count` ⇒ count test fails; ping-pong never reverses
  (4); clamp before the offset (1, after adding the overshoot case); withTargetKeys keeps the transform loop (2) / the effect
  param loop (1, after adding the two-param case) / orient (1); withoutTransformKeys keeps orient (1) / loops (2); resolveEffect
  ignores loops (2); valueAtLocal ignores loops (2); setKeyLoop accepts 1 key (1); setKeyLoop without the no-op check (1);
  mapEffectKeys shares effect loops (1); critical branch wrong (2); always cosh/sinh (overflow at long τ, 4); `seconds` ignored
  (2). e2e: removing the `OFFERED` filter ⇒ keyframes-ease test 1 fails on `toHaveCount(0)`.
- Determinism: no `Math.random`/`Date` in the new code (closed form only).

## Contract for Tasks 4-9
- Evaluate through `evalKeys(list, loop, u, min, max)` (numeric) and `loopedTime` (any list); read a target's loop with
  `targetLoop(clip, target)`; write loops only through `setKeyLoop` (UI) or `withTargetLoop`/`withPropLoop`/`withParamLoop`.
- Task 4: `evalPosition(list, loop, u)` in spatialPath.ts must call `loopedTime` and add the per-axis offset like
  `evalPositionKeys` (then replace it in `resolvedTransform`/`valueAtLocal`); `copyKey` deep-copies tangents; split keeps looped
  position lists whole already (the `looped` flag reaches `pos`); orient heading on a looped path should use the mapped time
  (reverse ⇒ heading + 180°).
- Task 5/6: `maxScale` (overlay texture sizing) ignores loops; an OFFSET loop on scale can exceed every key (bounded by
  last + count·Δ, or by the clip end when count is null) - Task 6 should include it. `src/ui/motionPathMath.ts` samples
  `positionAt` (no loops): the drawn path shows the keyed span only (Task 8 decides whether to draw looped cycles).
- Task 8: remove the `OFFERED` filter in EasePanel and the `toHaveCount(0)` assertion in keyframes-ease test 1 together;
  `choose('spring')` must commit `{kind: 'spring', spring: <preset or current params>}` (today `setKeyEase` → `repairEase`
  would fill SPRING_DEFAULT, so a bare `{kind}` is still safe); the curve should be drawn with the segment's seconds
  (`easeAt(e, u, seconds)`); the "does not settle" note = `springResidual(s, S) > 0.02`; loop control hidden for < 2 keys
  (setKeyLoop refuses), "∞" = `count: null`.
- Task 9: animation transfer must copy `loops` (fresh records, see `withPropLoop`) only for targets that receive keys.

## Concerns
1. A 1-key target keeps an inert loop (R2-5/R3-5) that becomes active again when a second key is added, while the Task 8 loop
   control is hidden for < 2 keys. Rule as specified; if manual QA finds it surprising, drop the loop when a list falls to 1 key
   (one line in `withTargetKeys`).
2. Repeat mode is discontinuous at every cycle start by design; frames landing within floating noise of an exact boundary may
   show either side (no test depends on it; random property tests avoid exact boundaries).
3. `maxScale` with an offset scale loop (see contract) - soft overlay textures only, no correctness issue.
