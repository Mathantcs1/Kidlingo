# Plan 5 Task 3 report: data model v6, key evaluation and the resolver

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1233 passed (89 files) | 1278 passed (92 files; +19 `keyframes`, +10 `animate`, +16 `migrate-keys`, +1 `video-effects`, old version asserts updated) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| e2e | n/a | `layers-migration` 5/5 (one new test), `restore` 6/6, `overlays-app` 3/3 (version asserts updated) |

Commit: `40f12b4 feat: project data v6 (keyframes) and the clip resolver` (+ this report).

## Design
- `src/core/keyTypes.ts` (new, 28 lines): `Keyframe`, `PositionKeyframe`, `TransformKeys` (§3.2). `model.ts` re-exports them (kept
  model.ts at 180 lines instead of growing it), adds `VideoEffect.keys?`, `Clip.keys?`, `CURRENT_VERSION = 6`. `emptyProject`
  and `Project.version` already derive from the constant; `migrate.ts` `CURRENT` derives from it too (not hard-coded).
- `src/core/keyframes.ts` (78): `KEY_EPS = 1e-4`, `MAX_KEYS = 500`, `KEYED_ROTATION_LIMIT = 36000`, `localTime` (D3, via
  `snapToFrame`), `valueAt(keys, u, min = -Inf, max = Inf)`, `positionAt`, `maxScale`. One binary search (`segmentIndex`) shared
  by both evaluators; between keys `a + (b − a)·easeAt(a.ease, fraction)`; exactly the key value at a key; first/last value
  outside. `valueAt` clamps the VALUE to `[min, max]` (Task 2 contract); `positionAt` is unclamped. Empty list ⇒ NaN.
- `src/core/animate.ts` (74): `isAnimated` (allocation-free loop), `resolvedTransform` (returns `clip.transform` itself when no
  transform key list is non-empty; clamps opacity 0..1 and scale ≥ 0; rotation/position unclamped), `resolveClip` (SAME object
  when `!isAnimated`; otherwise a shallow copy without `keys`, effects with keys get evaluated params clamped to the schema
  range and lose their `keys`; effects without a `keys` field and an unanimated transform are shared by reference).
- `src/core/migrateKeys.ts` (79): `repairKeyList`, `repairPositionKeys`, `repairClipKeys(raw, kind)`, `repairEffectKeys(raw, type)`,
  `withKeys(obj, keys)`. Every stored ease goes through `repairEase`.
- `src/core/migrate.ts`: accepts every integer version 1..CURRENT (so v5 and v6), `{version: 7}` ⇒ `newer` (checked first),
  non-integer/missing/0 ⇒ `malformed`. `toClip` = old body (now `toClipFields`) + `withKeys(…, repairClipKeys(c.keys, c.kind))`.
- `src/core/migrateEffects.ts`: `toVideoEffect` strips and repairs `keys` with `repairEffectKeys`.
- `src/core/videoEffects.ts`: `ParamDef` now extends the audio `ParamDef` with `animatable?: false` (only `mirror.mode`);
  new helper `animatableParam(type, key)` (schema def or undefined) used by both the resolver and the migration.

## Rulings (proposed for the ledger)
- Ruling: T3-1 - `valueAt` takes optional `min`/`max` (default ±Infinity) and clamps the evaluated value; the resolver passes the
  per-property range (opacity 0..1, scale ≥ 0, effect params schema min..max). Satisfies the Task 2 contract with the plan's signature.
- Ruling: T3-2 - Duplicate times (equal or within `KEY_EPS` of the previously kept key) are resolved by "the later one replaces it"
  after a stable sort, so kept keys are always ≥ KEY_EPS apart (the edit invariant). A chain of near-duplicates collapses to its
  last member.
- Ruling: T3-3 - Truncation to `MAX_KEYS` keeps the EARLIEST 500 keys (after sort/dedup).
- Ruling: T3-4 - Migration clamps key values per D5 (opacity 0..1, scale ≥ 0, keyed rotation ±36 000, effect params schema range);
  position keys only need finite x/y. Keys missing `t`/`v`/`x`/`y`, non-objects and non-array lists are dropped; extra fields on
  a key are dropped (keys are rebuilt as `{t, v|x,y, ease}`); an emptied list is removed, and an emptied `keys` object is removed
  from the clip/effect (static data never carries `keys: {}` after migration).
- Ruling: T3-5 - Clip-kind rules in migration: audio clips lose all keys (and their effects, as before); adjustment clips keep only
  `opacity` keys (position/scale/rotation are not used for them, D1/O11); overlay, video, image clips keep all four. Unknown
  transform properties are dropped.
- Ruling: T3-6 - The resolver ignores (and strips) effect keys on unknown or non-animatable params instead of throwing, so an
  in-memory clip can never make rendering fail; migration removes them from stored data anyway.
- Ruling: T3-7 - A clip whose `keys` object exists but holds only empty lists is static: `resolveClip` returns it as-is (it keeps
  the empty field). Edits (Task 4) should not create empty lists; migration never does.
- Ruling: T3-8 - `migrateProject` version gate is now "integer 1..CURRENT"; a fractional version below CURRENT is `malformed`
  (it was before too, via the explicit list).

## Tests and mutation checks
- `tests/keyframes.test.ts`: constants; `valueAt` before/at/between/after, single key, empty ⇒ NaN, hold step exactly at the next
  key, ease on the fraction, last key's ease unused, value clamping under `back`, 500-key binary search vs linear scan (seeded,
  2000 probes + every key time); `positionAt` one eased fraction, exact at keys, unclamped; `localTime` sourced/sourceless, frame
  snapping at 25/30 fps, before-start; `maxScale`.
- `tests/animate.test.ts`: `isAnimated`; SAME object for static clips (incl. `keys: {}` and empty lists); every transform property
  evaluated at the snapped local time, `keys` dropped, rest of the clip strictly equal; sourced vs sourceless; effect params
  evaluated, others kept, effect keys dropped, input not mutated, unanimated effects shared; clamping under `back`; mirror.mode /
  unknown param keys ignored; determinism.
- `tests/migrate-keys.test.ts`: v5 with every clip kind ⇒ v6, no `keys`, input not mutated, idempotent; v7 ⇒ newer; 5.5 ⇒ malformed;
  valid keys kept exactly; unsorted; duplicates (also within KEY_EPS) keep the last; NaN/Infinity/malformed; unknown/malformed eases;
  D5 value clamps; 600 keys ⇒ 500 earliest; unknown transform props; overlay kept / adjustment opacity-only / audio dropped; effect
  keys clamped, mirror.mode and unknown params dropped; effect 600 keys; idempotent on hand-edited data.
- `tests/video-effects.test.ts`: only `mirror.mode` is non-animatable; `animatableParam`.
- Updated: `migrate`, `migrate-overlays`, `adjustment`, `model`, `persist` (current-version asserts now use `CURRENT_VERSION`,
  "newer" uses `CURRENT_VERSION + 1`; inputs that are literally v4/v5 saves keep their literal).
- e2e: `layers-migration.spec.ts` new test: a v5 IndexedDB save (pip fixture: blue background with an invert effect, lime square,
  tone) reloads with no notice, 6 preview pixels identical to before, `present` tracks equal the v5 tracks, no `keys` anywhere,
  next save is v6 with identical clips. The v6-unsupported test now writes `CURRENT_VERSION + 1` (asserted to be 7) and checks it is
  never overwritten. `restore.spec.ts` newer-version test uses `CURRENT_VERSION + 1`; `overlays-app.spec.ts` current-version asserts.
- Mutation checks (each restored from a scratch copy): resolver always copies ⇒ "returns the SAME object" fails; no value clamp in
  `valueAt` ⇒ 2 tests fail; no scale clamp in the resolver ⇒ overshoot test fails; dedup keeps the first ⇒ 2 tests fail; no sort ⇒
  4 fail; no truncation ⇒ 2 fail; binary search skipping (`hi = mid - 2`) ⇒ the 500-key property test fails. Survived (equivalent):
  `<` instead of `<=` in the search and a linear-step search (both only change which side of a key boundary is used; at a key the
  fraction is 0 or 1, and `easeAt` is exact at both ends).

## Contract for Tasks 4-7
- Import types from `./model` (`Keyframe`, `PositionKeyframe`, `TransformKeys`), evaluation from `./keyframes` (`KEY_EPS`,
  `MAX_KEYS`, `KEYED_ROTATION_LIMIT`, `localTime`, `valueAt`, `positionAt`, `maxScale`), resolver from `./animate`
  (`resolveClip`, `resolvedTransform`, `isAnimated`), schema from `./videoEffects` (`animatableParam(type, key)`, `ParamDef.animatable`).
- Invariants every edit must keep (migration enforces them on load): lists sorted by `t`, neighbours ≥ `KEY_EPS` apart, ≤ `MAX_KEYS`,
  finite t/v/x/y, eases valid (`repairEase` shape), values within D5 ranges (keyed rotation ±36 000), no keys on audio clips, only
  opacity keys on adjustment clips, no keys on non-animatable/unknown params, and prefer removing an emptied list (and an emptied
  `keys` object) rather than storing `[]`/`{}`.
- `resolveClip` is pure and returns the input object for static clips: callers may use reference equality as a "nothing animated"
  fast path. The resolved clip has no `keys` (clip or effects); never write a resolved clip back into the project.
- `localTime` takes TIMELINE time; `valueAt`/`positionAt` take LOCAL time. `maxScale` reads stored keys (pass the RAW clip, not a
  resolved one, Task 5 overlay textures).
- `animatedTargets` (listed for `animate.ts` in §3.6) is NOT implemented: it needs `AnimTarget`, which Task 4 defines. Task 4 should
  add it next to `AnimTarget` (or in `animate.ts`).

## Concerns
- Scale keys may be evaluated down to 0 (D5 "scale ≥ 0"), below the static minimum 0.02 (`scaleBounds`). Task 5 should check that a
  zero scale renders as "invisible" without NaNs (matrix inverse, overlay texture size from `maxScale` is unaffected since it is a max).
- `tests/e2e/layers-migration.spec.ts` is now 254 lines (was 207); the new test could move to its own spec using `overlay-helpers`'
  `savedProject`/`writeSaved` if the reviewer wants the file under ~200 lines.
- Data v6 is one-way for older open tabs once deployed (they show "saved by a newer version"); unchanged from the plan.
