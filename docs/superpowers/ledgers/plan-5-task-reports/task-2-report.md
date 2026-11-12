# Plan 5 Task 2 report: easing maths (pure)

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1185 passed (88 files) | 1231 passed (89 files; +46 in `tests/easing.test.ts`) |
| typecheck, build | n/a | green; `grep -rl __clipforge dist` empty |
No e2e (pure logic, no UI).

## Design
- `src/core/bezier.ts` (new, ~55 lines): `cubicBezierAt(x1, y1, x2, y2, u)`. x1/x2 clamped to [0, 1] (so x(s) is monotone), Newton from s = u (max 8 iterations, |x error| < 1e-10), bisection fallback (64 iterations) when the slope is tiny or Newton leaves [0, 1]. Exactly 0 for u <= 0 / NaN, exactly 1 for u >= 1.
- `src/core/easing.ts` (~100 lines): `Ease`, `EaseKind`, `EASE_KINDS`, `EASE_PRESETS` (CSS definitions), `easeAt`, `repairEase`, `isSameEase`; re-exports `cubicBezierAt` so Task 3 imports everything from `easing`.
- `easeAt`: u clamped, NaN reads 0, endpoints returned before the switch so they are exact for every kind (incl. `back`, `elastic` whose formulas are not exact at 0/1 in floating point). `hold` is 0 for u < 1. `back`/`elastic`/`bounce` are the standard "out" variants (c1 = 1.70158; back max about 1.1). Preset kinds go through the same Bézier solver. `bezier` without handles behaves as linear.
- `repairEase`: non-object/array/unknown kind => linear; non-bezier kinds drop any stray `bezier`; bezier needs exactly 4 finite numbers else linear, then x clamped [0, 1], y clamped [-1, 2]. Returns a fresh object/array, never mutates input.
- `isSameEase`: kind, plus handles for bezier only (handles on other kinds are ignored).

## Rulings
- Ruling: T2-1 - Newton tolerance 1e-10 (tighter than the plan's 1e-7) so the reference tests (1e-6) and "linear within 1e-7" have margin; cost: nil.
- Ruling: T2-2 - solver lives in `bezier.ts`, `easing.ts` re-exports `cubicBezierAt` (keeps both files small, one import for consumers).
- Ruling: T2-3 - `cubicBezierAt` clamps x handles itself (defence in depth in addition to `repairEase`), y handles are used as given (overshoot allowed; clamping to the property range is the resolver's job, D5).
- Ruling: T2-4 - `easeAt` of NaN returns 0 rather than throwing.

## Tests (tests/easing.test.ts, 46)
Exact endpoints and clamping for all 9 kinds; linear identity; hold; easeInOut(0.5); CSS reference values for the three presets at 0.25/0.5/0.75 (values from an independent 200-step bisection script) and an asymmetric curve both ways round; preset constants; bezier(0,0,1,1) linear within 1e-7; monotone for presets and for 500 seeded (mulberry32) random handle sets with y in [0, 1]; x-solve accuracy; out-of-range x clamping; degenerate flat-x handles; back bound (1.09..1.11); elastic/bounce finite and in [-0.5, 1.5]; repairEase (NaN, x1 = 2, unknown kind, junk input, missing/short/non-numeric bezier, no mutation); isSameEase.

## Mutation checks (all restored from a saved copy, no git checkout)
- Newton/bisection tolerance 1e-10 -> 1e-2: 8 tests fail (reference values, linear, monotone, x-solve).
- Swap y handles for x handles in the final evaluation (x1/y1 mix-up): 4 tests fail (the three preset reference tests and the asymmetric test).
- Remove the x-handle clamp: initially SURVIVED; added the "out-of-range x handles are clamped" test, which now fails under the mutation.

## Contract for Task 3
- `import { easeAt, repairEase, isSameEase, EASE_PRESETS, type Ease, type EaseKind } from './easing'`.
- `easeAt(ease, u)` may return values outside [0, 1] for `back`, `elastic`, `bezier` with y outside [0, 1]; `valueAt` must clamp the RESULT to the property's legal range (D5), not the fraction.
- `hold` yields 0 until the next key (so `v = a`), 1 only at u = 1.
- `repairEase` is the only parser for stored eases (use it in migration for every key); it returns a fresh object each call, so compare with `isSameEase`, not `===`.
- Bezier handles inside stored data are guaranteed x in [0, 1], y in [-1, 2] after repair.

## Concerns
- None blocking. `elastic` goes to about 1.37 / below 1 in places; bound test uses the plan's [-0.5, 1.5].
