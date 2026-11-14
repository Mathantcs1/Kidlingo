# Plan 5B Task 5 report: preset library, stack timing, blending and clip-operation rules (pure)

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1594 (119 files) | 1647 (123 files; +17 `presets`, +16 `motion`, +13 `motion-edits`, +7 `motion-clip-ops`; `migrate-v7-keys` split test rewritten for D12) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty (also breakVideoEffect, breakBlendProgram, failNoiseProbes, renderBlend) |
| e2e (one at a time) | n/a | `keyframes-render` 4/4, `keyframes-robust-edits` 4/4 (resolveClip changed; 5A pictures unchanged) |

Commit: `6670f72 feat: animation presets, stack timing and blending` (+ this report). Nothing pushed.

## Design (files, all pure `src/core`, ≤ 162 lines each)
- `presets.ts` (150): `PRESET_SCHEMA` stays the ONE source (migration repairs against it). New: `PresetDef` / `PRESETS`
  (schema + `key`, `label`, `outLabel`, `synonyms`, `defaultDuration`, `defaultEase`, `outEase`, `outParams`), `PRESET_KEYS`,
  `presetLabel(key, slot)`, `presetsForSlot(slot)`, `presetEase(key, slot)` (fresh object), `presetParams(key, slot)`.
- `presetShapes.ts` (78): `sinPi`/`cosPi` (exact at integers, so every shape is EXACTLY at rest at its window ends),
  `hash01`, `shakeWave` (3 incommensurate sines, seeded phases), `jitterWave` (integer harmonics 3/5/7 ⇒ seamless cycle,
  exactly 0 at f = 0 and f = 1), `hopShape`, `wrapTurn`.
- `presetMath.ts` (162): `presetOffsets(key, slot, p, params, format, timing?)` (p = LINEAR progress, clamped, NaN ⇒ 0;
  `timing.ease` shapes it, the eased value is clamped to `easeRange(ease)`; `timing.seconds` = window length, read by Shake
  and spring); `presetMaxScale(key, slot, params, ease?)`; `easeRange`; `WHIP_TILT`. In/out presets share one "away"
  shape `a` (0 rest, 1 fully away): entrance `a = 1 − q`, exit `a = q`.
- `motion.ts` (138): `motionAt(clip, t, format)` (null when no slot is active; no allocation then), `blendOffsets`,
  `composeMotion(base, o)`, `maxMotionScale(clip)`, `motionWindows(clip)` (scaled in/out windows, for Task 7 bands).
- `motionEdits.ts` (147): `setPreset(p, clipId, slot, key | PresetUse | null, t, seed?)`, `setPresetParams(p, clipId, slot,
  patch)`, `defaultSeed`, messages `ADJUSTMENT_ONLY_FADE` ('Adjustment layers only fade'), `AUDIO_NO_PRESETS`, `NO_PRESET`.
- `motionClipOps.ts` (50): `shiftMotion(m, d)`, `splitMotion(m, mid, shift)`.
- `motionTypes.ts`: `MotionOffsets` type, `MOTION_LIMITS.time` (±1e6 s), `boundMotionTime`.
- `animate.ts`: `resolveClip` composes motion (see contract). `clipEdits.ts`: D12 trim/split. `detachAudio.ts`: twin
  without `motion`. `migrateMotion.ts`: emphasis delay stored as 0; `at`/`phase` bounded (M6). `keyframes.ts`: unchanged
  (`maxScale` stays; callers multiply by `maxMotionScale`).

## Preset table (final numbers; W, H = format size; q = eased progress)
| Preset | Slots | Duration (s) | Default ease (in / out) | Params (min..max, default) | Shape |
|---|---|---|---|---|---|
| fade | in/out | 0.5 | easeOut / easeIn | – | kOpacity = 1 − a (opacity-only) |
| slide | in/out | 0.6 | easeOut / easeIn | direction int 0..3 (0 left, 1 right, 2 up, 3 down), distance 0..2 (1) | dx, dy = u·a·distance·(W, H): Slide In from left starts at −distance·W |
| zoom | in/out | 0.5 | easeOut / easeIn | from 0..3 (in 0.5, OUT 1.5) | kScale = 1 + a(from − 1), kOpacity = 1 − a |
| pop | in/out | 0.5 | spring 170/26/1 / same | intensity 0..0.5 (0.15) | kScale = 1 − (1 − q′)(1 − B q′), q′ = 1 − a, B = 1 + 2i + 2√(i + i²): 0 → peak exactly 1 + i → 1 |
| spin | in/out | 0.7 | easeOut / easeIn | turns −3..3 (0.5) | drot = ∓a·turns·360 (in from −, out on to +: keeps turning), kScale = 1 − a/2 |
| drop | in/out | 0.8 | bounce / easeIn | distance 0..2 (0.6) | in from above dy = −a·d·H; OUT falls: dy = +a·d·H |
| whip | in/out | 0.4 | back / back-in bezier [0.36, 0, 0.66, −0.56] | as slide | slide + drot = −(ux + uy)·a·12° |
| rise (Sink) | in/out | 0.6 | easeOut / easeIn | distance 0..0.5 (0.1) | dy = +a·d·H, kOpacity = 1 − a |
| pulse | emphasis | 0.6 | easeInOut | intensity 0..1 (0.15) | kScale = 1 + i·sinπ(q) |
| shake | emphasis | 0.6 | linear | intensity 0..0.2 (0.02), frequency 1..30 Hz (8), seed int | dx, dy = i·(W, H)·sinπ(q)·wave(seed, frequency·seconds since window start) |
| wobble | emphasis | 0.8 | linear | intensity 0..90° (10) | drot = A·sinπ(6q)·(1 − q) |
| flash | emphasis | 0.6 | linear | flashes int 1..10 (2) | kOpacity = 1 − abs(sinπ(n q)) (opacity-only) |
| hop | emphasis | 0.5 | **linear** (was easeOut) | distance 0..1 (0.1) | dy = −d·H·(full arc to 0.65, quarter arc to 1) |
| spin360 | emphasis | 0.8 | easeInOut | turns **int** −3..3 (1) (was step 0.25) | drot = 360·T·wrapTurn(q) |
| breathe | loop | 3 | easeInOut | intensity 0..0.5 (0.05) | kScale = 1 + i(1 − cosπ(2q))/2 |
| float | loop | 3 | easeInOut | distance 0..0.5 (0.03) | dy = −d·H·sinπ(2q) |
| spinLoop | loop | 4 | linear | turns **int** −10..10 (1) (was step 0.25) | drot = 360·T·wrapTurn(q) |
| jitter | loop | 0.5 | linear | intensity 0..0.1 (0.01), seed int | seamless seeded harmonics per cycle |
| blink | loop | 1 | **linear** (was hold: hold made it always on) | duty 0.05..0.95 (0.5) | kOpacity = q < duty ? 1 : 0 (opacity-only) |
| kenBurns | loop (span) | 5 (unused) | linear | from 0.5..3 (1), to 0.5..3 (1.2), direction int 0..7 (+ diagonals), distance 0..0.5 (0.05) | kScale = z0·(z1/z0)^q (D11 log space), pan linear q·distance·(W, H) |

Schema changes vs Task 2 (allowed before the 5B deploy, P5B-2; migration tests reference the schema, all green): spin360 and
spinLoop turns integral (a fractional turn would jump at the window end / at `count`), hop and blink default ease linear.
Durations and the other ranges are kept (sane). Q1 labels: 28 entries from 20 definitions (8 entrance + 8 exit + 6 + 6),
Rise is "Sink" in the exit list, "Spin 360", "Spin loop", "Ken Burns".

## Rulings (proposed for the ledger)
- R5-1 Timing (D2): s = snapToFrame(t − start); in active while s < delay + duration (start state before the delay);
  out active from s > D − delay − duration, end state from s ≥ D − delay; short-clip scaling ONLY when both in and out
  exist and din + delayIn + dout + delayOut > D (factor D / total; D = 0 ⇒ 0); emphasis window [at, at + duration) in
  LOCAL time; loop τ = (local + phase)/period, cycle index floor(τ + 1e-9) (tolerance like frameIndex: a frame on an exact
  cycle start reads cycle start whatever the rounding), count null ⇒ every τ (also before 0), count n ⇒ 0 ≤ index < n;
  Ken Burns ignores period/phase/count and spans the visible clip p = s/D.
- R5-2 Emphasis and loop slots ignore `delay` (stored 0 by setPreset AND by migration now).
- R5-3 Blending: the stack folds `blendOffsets` (each field only with itself: dx/dy/drot add, kScale/kOpacity multiply);
  presets clamp their own factors at ≥ 0; `composeMotion` clamps once (opacity 0..1, scale ≥ 0 and finite, non-finite
  position/rotation keeps the base, NaN factor hides).
- R5-4 Eased progress is clamped to `easeRange(ease)` (back 0..1.1001, elastic 0..1.375, spring −1..3, bezier hull of y,
  else 0..1), measured to contain every ease value; `presetMaxScale` is the analytic maximum over that range, so
  `maxMotionScale` = product of slot bounds is a TRUE upper bound (zoom with a spring ease can bound at 1 + 2·(from − 1)).
- R5-5 Exit mirrors: exits move to the SAME away state as the entrance, except Drop (falls down) and Spin (keeps turning
  the same way); exit eases mirror the entrance (easeOut/bounce ⇒ easeIn, back ⇒ CSS back-in bezier, spring/linear same).
- R5-6 setPreset: a key gets slot defaults (Zoom Out from 1.5); choosing the key the slot holds is a no-op (keeps tuned
  params); a full PresetUse is stored repaired; emphasis `at` = playhead local time clamped onto [lo, hi − 1/fps]; a new
  loop gets phase = −(visible local start) (cycles and `count` start at the visible start), count null; seed (shake,
  jitter) = injected or `defaultSeed(clipId, slot)` (hash, t-independent). Every stored slot goes through
  `repairMotion`, so an edited stack re-migrates to itself (tested).
- R5-7 setPresetParams: patch {duration, delay, ease, at, phase, count, params}; non-finite ⇒ TimelineError
  ('Invalid animation setting'); unknown params and fields that do not apply to the slot are ignored; values clamped by
  the repair; empty slot ⇒ 'There is no preset in that slot'.
- R5-8 Bounds (M6): `at` and `phase` are BOUNDED to ±1e6 s (not reduced modulo: modulo would change the alignment after a
  later period change); evaluation is finite for any finite value (1e300 phase ⇒ a finite, if meaningless, frac).
- R5-9 Split (D12): left = in, loop, emphasis with at < mid (local of the original); right = out, loop, emphasis with at ≥
  mid; sourceless right half shifts (at − d, phase + d). Start trim of a sourceless clip by Δ: at − Δ, phase + Δ. Slots are
  deep-copied per half. Accepted discontinuities (documented, tested): a cut inside the entrance (right half at rest), the
  exit (left half loses it), an emphasis window (the other half loses its part), a short clip whose in/out were scaled
  (each half rescales on its own), and Ken Burns (each half spans itself).
- R5-10 resolveClip: no keys and no motion ⇒ the same object; with motion the result is always a fresh object WITHOUT
  `motion` (and without `keys`); no active slot ⇒ the base (static: the stored transform object itself).

## Tests and mutation checks
- `tests/presets.test.ts`: library shape (20/28, slots, labels, synonyms lower-case, defaults from the schema, exit
  defaults, fresh ease objects, opacity-only set); EXACT identity at rest for every preset × slot × 13 eases × random
  params (toEqual, so −0 fails); exact entrance start / exit end tables; Pop peak 1 + i; emphasis/loop ends at rest;
  params at min/max/NaN/±Infinity finite with factors ≥ 0; opacity-only touch only kOpacity (others move); Ken Burns
  √(z0·z1) at p = 0.5 (1e-12), endpoints, linear pan; Shake determinism, seed sensitivity, 25 vs 30 fps grid equality,
  wave follows seconds not eased progress; Jitter seamless/seeded; easeRange contains 300 random eases; presetMaxScale
  bounds 500 random draws × 101 samples (random spring/bezier eases).
- `tests/motion.test.ts`: in with delay, out at the end, emphasis window, loop phase/count, Ken Burns span, short-clip
  scaling (windows and values; stored values kept), frame snapping, fps-independent shake, zero/tiny durations and huge
  phase/at finite; blending: 24 permutations of the slot fold (1e-9) and 24 key orders of the stored stack (exact),
  keyed base + presets, clamps (opacity, scale < 0, NaN, Pop overshoot keeps opacity 1, back-in undershoot), scale-0 Pop
  frame ⇒ finite clipMatrix; maxMotionScale product and bound over frames; resolveClip fast path / fresh object / no
  motion / keys-only result / input not mutated.
- `tests/motion-edits.test.ts`: defaults, playhead `at` (incl. off-clip clamps, overlay), loop phase, seeds, PresetUse
  repair, no-ops, removal, input not mutated, refusals (lock, audio, wrong slot, unknown, adjustment), params clamp /
  round / ease repair / at / phase / count bounds, re-migration identity, migration bounds.
- `tests/motion-clip-ops.test.ts`: split property test (200 random clips of every picture kind, random stacks, frame-
  aligned cuts outside the windows, both halves frame-exact; ≥ 30 sourceless loops; rotation compared modulo 360);
  emphasis assignment and sourceless shifts; in-window discontinuity; sourced/sourceless trims; move, ripple, join,
  reframe (video + overlay), reset transform, detach twin.
- Mutation checks (23, each on the real file, restored after): CAUGHT — order-dependent blend (dx × kScale) ⇒
  permutation test; no short-clip scaling ⇒ overlap test; phase not shifted on sourceless split ⇒ split property test +
  2; at not shifted; emphasis to the wrong half; sourceless trim not shifting; detach twin keeps motion; fast path always
  copies; resolved clip keeps motion; no opacity clamp; no cycle tolerance (property test); count off by one; in delay
  ignored; Math.sin instead of sinPi (exact-rest test); linear Ken Burns zoom; zoom bound ignoring overshoot; shake on eased
  progress (after adding the dx:dy ratio test); adjustment filter; no same-reference no-op; `at` not the playhead; Zoom
  Out default; lock guard. SURVIVED (equivalent, accepted): removing the clamp of the eased progress to easeRange (the
  ranges contain every ease value, so the clamp is a defensive no-op).

## Contract for Tasks 6-9
- Task 6 (render): drawCollect already calls `resolveClip(raw, t, p.format)`; texture scale must become
  `maxScale(raw) × maxMotionScale(raw)` (plus the P5B-3 cap for key loops). The resolved clip has no `motion`, so a render
  reader of `.motion` must take the RAW clip (add `.motion` to the reader audit). Lower thirds (D13): `raw.motion?.in` /
  `.out` switch the built-in slide off at that edge. Scale 0 (Pop frame 0) is finite through clipMatrix (tested).
- Task 7 (UI): commands `setPreset(p, id, slot, key, playhead)` / `setPreset(..., null, ...)` / `setPresetParams(p, id,
  slot, patch)` each in ONE `guard(() => apply(...))`; labels `presetLabel`, lists `presetsForSlot`, disabled tiles:
  `!PRESETS[key].opacityOnly` on adjustment clips with the reason `ADJUSTMENT_ONLY_FADE`; bands from `motionWindows(clip)`
  (clip-relative seconds) and the emphasis tick at `at − localRange(clip)[0]`; the ghost outline = `resolveClip` vs
  `resolvedTransform` at the playhead; tiles use `resolveClip` on a synthetic card clip with `motion` set. Emphasis "at
  playhead" = `setPresetParams(..., { at: localTime(clip, t, fps) })`. For Ken Burns hide duration/phase/count.
- Task 9 (transfer, user presets): copy whole slots; `setPreset` with a full PresetUse repairs it and keeps its `at` /
  `phase` (pass a new seed to re-randomise); out presets are already edge-relative.

## Concerns
1. Emphasis/loop `delay` is not read (R5-2) and the migration now zeroes it; a hand-edited emphasis delay is lost on load
   (it never had an effect).
2. Shake and Jitter amplitudes are per-axis fractions (x of W, y of H), so on a non-square format the shake is not
   isotropic in pixels; cheap to change before the deploy (one line each).
3. Spin 360 / Spin loop wrap the drawn rotation at half a turn (rotation jumps by 360·T there, same picture); a
   consumer that interpolates `transform.rotation` between frames (none today; motion blur is out of scope) would see
   the jump.
4. In/out never overlap after short-clip scaling, but a long single entrance (no exit) on a short clip simply does not
   finish (no scaling without an exit), as specified.
5. `presetMaxScale` with spring eases is conservative (q up to 3): Zoom with a spring and from 3 bounds at 5×; textures
   may be oversized in that corner (Task 6's cap applies).
