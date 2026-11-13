# Plan 5B Task 2 report: data model v7 and migration

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1475 (106 files) | 1508 (109 files; +13 `migrate-v7`, +13 `migrate-v7-keys`, +7 `ease-spring-data`; `migrate-keys` version asserts now use `CURRENT_VERSION`) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty (also breakVideoEffect, breakBlendProgram, failNoiseProbes, renderBlend) |
| e2e (one at a time) | n/a | `presets-migration` 2/2 (new), `keyframes-migration` 1/1, `restore` 6/6, `layers-migration` 4/4, `keyframes-ease` 4/4, `keyframes-ease-keys` 6/6 (EasePanel touched) |

Commit: `e75be80 feat: project data v7 (animation presets, loops, spatial paths, spring)` (+ this report).

## Design (files)
- `src/core/motionTypes.ts` (53, new): `MotionSlot`, `MOTION_SLOTS`, `PresetKey` (the 20 keys of §5), `PresetUse`
  `{preset, duration, delay, ease, params}`, `EmphasisUse` (+ `at`, clip-LOCAL time), `LoopUse` (+ `phase`, `count: number | null`;
  `duration` = period, `delay` always 0), `ClipMotion {in?, emphasis?, loop?, out?}`, `MOTION_LIMITS` (duration 0.05..30,
  delay 0..30, period 0.1..60, count 1..1000).
- `src/core/presets.ts` (69, new): `PRESET_SCHEMA: Record<PresetKey, PresetSchema>` with `slots`, `opacityOnly`, default
  `duration`, default `ease`, `params: PresetParam[]` (Plan 4 `ParamDef` + `integer?: true`), and `isPresetKey`
  (`Object.hasOwn`, so `toString`/`__proto__` are not presets). Opacity-only: `fade`, `flash`, `blink` (D13). Params
  (min..max, default): slide/whip `direction` int 0..3 (0 left, 1 right, 2 up, 3 down) + `distance` 0..2 (1); zoom `from`
  0..3 (0.5); pop `intensity` 0..0.5 (0.15, spring ease); spin `turns` −3..3 (0.5); drop `distance` 0..2 (0.6, bounce);
  rise `distance` 0..0.5 (0.1); pulse `intensity` 0..1 (0.15); shake `intensity` 0..0.2 (0.02), `frequency` 1..30 Hz (8),
  `seed` int 0..2^31−1 (0); wobble `intensity` 0..90° (10); flash `flashes` int 1..10 (2); hop `distance` 0..1 (0.1);
  spin360 `turns` −3..3 (1); breathe `intensity` 0..0.5 (0.05); float `distance` 0..0.5 (0.03); spinLoop `turns` −10..10 (1);
  jitter `intensity` 0..0.1 (0.01) + `seed`; blink `duty` 0.05..0.95 (0.5, hold ease); kenBurns `from` 0.5..3 (1), `to`
  0.5..3 (1.2), `direction` int 0..7 (0), `distance` 0..0.5 (0.05). Labels/synonyms/maths are Task 5's.
- `src/core/migrateMotion.ts` (76, new): `repairMotion(raw, kind)`, `withMotion(clip, motion)`.
- `src/core/easing.ts` (133): `'spring'` kind, `SpringParams`, `Ease.spring?`, `SPRING_DEFAULT` (170/26/1), `SPRING_LIMITS`,
  `repairSpring`, `repairEase` (spring always comes back with all three params), `isSameEase` (spring compares params; a
  missing `spring` reads as the defaults). `easeAt` still has `void seconds` and spring falls through to the linear default
  (comment marks it TEMPORARY; `tests/ease-spring-data.test.ts` pins it).
- `src/core/keyTypes.ts` (59): `Vec`, `PositionKeyframe.in?/out?/broken?: true`, `LoopMode`, `LOOP_MODES`, `KeyLoop`,
  `LOOP_COUNT_MAX`, `KeyedTransformProp`, `TransformKeys.loops?/orient?: true`.
- `src/core/model.ts` (185): `Clip.motion?: ClipMotion`, `VideoEffect.loops?: Record<string, KeyLoop>`, `CURRENT_VERSION = 7`;
  re-exports `ClipMotion`, `KeyLoop`, `Vec`. `migrate.ts` `CURRENT` already derives from it (version gate: integers 1..7).
- `src/core/migrateKeys.ts` (128): `repairTangent`, `repairCount`, `repairLoop` (exported), tangents/`broken` in
  `repairPositionKeys`, `loops` + `orient` in `repairClipKeys`, `repairEffectLoops`.
- `src/core/migrateEffects.ts`: effect `loops` stripped and repaired after the keys. `src/core/migrate.ts`: `toClip` =
  `withMotion(withKeys(fields, repairClipKeys), repairMotion(c.motion, c.kind))`.
- `src/core/keyLists.ts`: `mapTransformKeys` carries `loops` (copied) and `orient` (see R2-6).
- `src/ui/EasePanel.tsx`: `LABELS.spring = 'Spring'` (Record type) and the preset row maps `OFFERED` = `EASE_KINDS` without
  `spring`, so no half-built spring button appears before Task 8 (Task 8 removes the filter and adds the fields).

## Rulings (proposed for the ledger)
- R2-1 - Loop `count` repair (KeyLoop and LoopUse share `repairCount`): a finite number is ROUNDED (`Math.round`) and clamped to
  1..1000 (0 ⇒ 1, 1.5 ⇒ 2, 2000 ⇒ 1000, −1 ⇒ 1); anything else (`'x'`, NaN, ±Infinity, missing, null) ⇒ `null` (until the clip
  end, the default). A loop with an unknown `mode` is dropped.
- R2-2 - Preset slot repair rebuilds the slot (extra fields dropped): unknown preset, a preset in a slot its schema does not list
  (e.g. `pulse` in `in`), or a non-object ⇒ slot dropped; non-finite `duration` ⇒ the preset's default (finite ⇒ clamped to
  0.05..30, loop period 0.1..60); non-finite `delay` ⇒ 0 (finite ⇒ 0..30); the loop slot's `delay` is always 0; `ease` that is not
  an object ⇒ the preset's default ease, an object ⇒ `repairEase` (unknown kind ⇒ linear); `params` rebuilt from the schema
  (finite ⇒ clamped, integer params rounded first; missing/non-finite ⇒ default; unknown keys dropped); emphasis needs a finite
  `at` (else the slot is dropped, D14); loop `phase` non-finite ⇒ 0; an emptied stack ⇒ `motion` removed. The emphasis `delay` is
  stored and clamped like in/out (Task 5 decides whether it is read).
- R2-3 - Kind rules: audio ⇒ no `motion`, no keys, no loops (effects already [] on audio); adjustment ⇒ only `opacityOnly`
  presets (fade/flash/blink), and only the opacity loop (it is the only key list it keeps); video/image/overlay/unknown kind ⇒
  everything.
- R2-4 - Tangents: `in`/`out` kept only when an object with finite numeric `x` and `y` (else that tangent is dropped, the key
  stays), clamped to ±`KEYED_POSITION_LIMIT`; a zero tangent is kept as stored; `broken` kept only when exactly `true`.
- R2-5 - Loops and orient follow their targets: a loop survives only for a property/param that still has a key list after repair
  (D14 "loops of absent targets dropped"; a 1-key list keeps its loop, it is inert per D4); `orient` is kept only when exactly
  `true` AND position keys exist (1+). A `keys` object never holds only `loops`/`orient` after migration.
- R2-6 - Until Tasks 3/4 own them, clip operations must not lose v7 key data: `mapTransformKeys` (split/trim/shift/reframe)
  carries `loops` and `orient` unchanged; tangents ride along on the key copies (`copyKey` is still a shallow `{...k}`; Task 4
  deep-copies). Split therefore keeps the loop on both halves on PARTITIONED lists - Task 3 must replace this with D4 (looped
  targets not partitioned).
- R2-7 - `spring` is a stored ease kind from v7 but the ease editor does not offer it until Task 8 (filtered in EasePanel). A
  stored spring renders as linear until Task 3 (pinned by a test that Task 3 must rewrite).

## Tests and mutation checks
- `tests/migrate-v7.test.ts`: CURRENT_VERSION 7; v6 save of every clip kind with transform keys (eased, bezier, hold) and effect
  keys ⇒ v7 JSON byte-equal apart from `version`, input not mutated, idempotent (JSON), no `motion` added; versions 1..7 accepted;
  `{version: 8}` and `CURRENT_VERSION + 1` ⇒ `newer`, `classifySaved` ⇒ `unsupported` with "newer version"; motion: valid
  four-slot stack kept exactly (video, image, overlay), unknown preset/slot/wrong slot/`toString`/non-objects dropped; timing
  clamps and defaults; params clamp/round/default/drop; ease repair incl. spring; NaN/Infinity/missing/string `at` ⇒ emphasis
  dropped; phase NaN ⇒ 0; count table; extra fields; adjustment keeps fade/flash/blink and drops slide; audio loses motion;
  schema sanity (20 keys, defaults in range, opacity-only set).
- `tests/migrate-v7-keys.test.ts`: tangents kept / dropped / clamped, `broken` variants, `repairTangent`; loops kept, count table
  via `repairLoop`, unknown mode / absent target / unknown prop dropped, emptied loops removed; adjustment opacity loop only;
  audio loses keys and loops; effect loops kept only for keyed animatable params; orient rules; spring eases on keys (valid,
  NaN ⇒ defaults, clamps, missing); split keeps loops/orient/tangents/effect loops/motion on both halves and re-migrates equal.
- `tests/ease-spring-data.test.ts`: kind/defaults/limits; TEMPORARY linear rule (incl. a 0.25 s segment); repairEase spring cases
  and idempotence; non-spring never gets a `spring` field; `isSameEase` per param.
- `tests/e2e/presets-migration.spec.ts`: (1) pip fixture, green square with position keys (easeInOut) and opacity keys (hold),
  saved, rewritten as v6, reload: no notice, 6 preview pixels at t = 1, 0.5 and 1.75 identical to before, tracks and keys
  equal the v6 tracks, no `motion`, next save is version 7 with the same clips and picture. (2) a version-8 value carrying an
  unknown preset and a malformed loop: notice "saved by a newer version", no clips; adding a layer, moving the playhead and
  `flushAutosave` leave the stored value byte-identical (JSON.stringify of the IndexedDB value before/after).
- Updated: `tests/migrate-keys.test.ts` (v5 test asserts `CURRENT_VERSION`; "newer" uses `CURRENT_VERSION + 1`),
  `tests/e2e/layers-migration.spec.ts` (dropped `expect(v7.version).toBe(7)`, titles say "next version"). Literal-v5/v6 inputs
  keep their literals.
- Mutation checks (22 unit, each on a scratch copy, all CAUGHT): `version > CURRENT` removed (5 fail); CURRENT_VERSION 6 (16);
  slot check; adjustment filter; audio keeps motion; emphasis `at` not required; loop delay kept; loop period with duration
  limits; params not clamped; integer params not rounded; count not rounded (2); count not clamped (2); loops of absent targets
  kept (2); orient truthy; orient without position keys; tangent not clamped; broken truthy; effect loops unfiltered; spring
  not clamped (3); spring `isSameEase` ignores params; `easeAt` spring non-linear (temporary pin); `mapTransformKeys` drops
  loops. e2e (2, CAUGHT): `version > CURRENT` removed ⇒ presets-migration test 2 fails (no notice); migration dropping keys ⇒
  test 1 fails (pixels/keys).

## Contract for Tasks 3-9
- Types: import `ClipMotion`, `KeyLoop`, `Vec` from `./model` (or `./motionTypes` / `./keyTypes`); `MOTION_SLOTS`,
  `MOTION_LIMITS` from `./motionTypes`; `LOOP_MODES`, `LOOP_COUNT_MAX`, `KeyedTransformProp` from `./keyTypes`;
  `SPRING_DEFAULT`, `SPRING_LIMITS`, `repairSpring` from `./easing`; `PRESET_SCHEMA`, `isPresetKey`, `PresetParam` from
  `./presets`; `repairMotion`, `withMotion` from `./migrateMotion`; `repairLoop`, `repairTangent`, `repairCount` from
  `./migrateKeys`.
- Invariants every edit must keep (migration enforces them on load, so an edit that breaks one changes on reload): every
  stored spring ease has all three params within limits; loops only for targets with keys; `orient` only `true` and only with
  position keys; tangents finite within ±1e7; `broken` only `true`; motion slots canonical (all schema params present, clamped,
  integer params integral; loop `delay` 0; emphasis `at` finite; count integer 1..1000 or null); no motion on audio; adjustment
  only opacity-only presets.
- Task 3: delete `void seconds` and the TEMPORARY comment in `easeAt`, add the spring branch, and REWRITE the pinned test in
  `tests/ease-spring-data.test.ts`; replace R2-6's split behaviour with D4 (looped targets not partitioned); removing a target's
  last key / stopwatch off must also remove its loop (`withTargetKeys` today keeps `loops` in the keys object - see concern 2).
- Task 4: `copyKey` must deep-copy `in`/`out`; `reframeKeys` must scale tangents; `withoutTransformKeys`/Reset must drop
  `orient` and the position/scale loops with their lists.
- Task 5: fill `presets.ts` (labels, synonyms, maths) keeping the keys and ranges (or change ranges here + migration tests);
  zoom's `out` default (1.5) is not in the schema (one `def` per param) - add an out-default or set it in `setPreset`;
  `detachAudio` twin still spreads `...clip` minus `keys`, so it would carry `motion` (D12: twin gets no motion) - fix there.
- Task 8: remove the `OFFERED` filter in `EasePanel.tsx` when the spring fields land.

## Concerns
1. `detachAudio` (src/core/detachAudio.ts:25) copies `motion` onto the audio twin; harmless until Task 5 creates motion (and a
   reload strips it), but Task 5 must add `motion: _motion` to the destructuring with a test.
2. `withTargetKeys` (animTargets.ts:83-89) keeps `loops`/`orient` when the last list is removed, leaving `keys: { loops }` (an
   "animated"-looking object with no lists: `isAnimated` is false, so rendering is fine; migration would drop it). Task 3/4 own
   the lifecycle; nothing writes loops/orient before then except hand edits.
3. The schema numbers (durations, defaults, ranges) are my reading of §5/§12 Task 5/D11 where the plan names no value; they are
   one table to adjust in Task 5 (migration tests reference `PRESET_SCHEMA` defaults, not literals, except the clamp bounds
   0..3 direction, 0..2 slide distance, 0..1 pulse intensity and the spring ranges from D5).
