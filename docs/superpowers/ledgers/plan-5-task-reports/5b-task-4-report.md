# Plan 5B Task 4 report: spatial Bezier motion paths and orient along path (pure + resolver)

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1550 (113 files) | 1585 (117 files; +8 `spatial-path`, +8 `path-heading`, +12 `path-edits`, +7 `path-clip-ops`; `key-loops` now imports `evalPosition`) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| e2e (one at a time) | n/a | `keyframes-path` 10/10, `keyframes-path-drag` 3/3, `keyframes-render` 4/4, `keyframes-ui` 4/4, `keyframes-robust-reframe` 1/1 |

Commit: `4fd9ac9 feat: curved motion paths and orient along path` (+ this report). Not pushed.

## Design (files)
- `src/core/pathCurve.ts` (134, new; imports only types, so `keyframes.ts` can import it without a cycle): `isCurved(a, b)`
  (a non-zero `a.out` or `b.in`; zero/absent tangents = the straight 5A segment), `bezierPoint`, `bezierTangent`,
  `arcTable(a, b)` (cumulative ARC length at t = k/32, k = 0..32, 3-point Gauss-Legendre per step, written into a shared
  scratch `Float64Array`: no allocation), `arcParam(a, b, f)` and `curvedPoint(a, b, f)`. The eased fraction f is an
  arc-length fraction: the table step holding f·L, a linear guess inside it, then three Newton steps on the arc length
  (fixed count, deterministic). f = 0 / f = 1 return the keys exactly; an overshoot (f < 0 or > 1: back, elastic, spring)
  continues straight along the end tangent at the same speed; a segment without finite length falls back to the
  straight formula. The integrand uses `Math.sqrt(dx²+dy²)` (coordinates ≤ ±1e7, no overflow; `hypot` was 3x slower).
  Measured ~1 µs per curved evaluation (straight: ~0.07 µs, unchanged code).
- `src/core/keyframes.ts`: `positionAt` delegates a curved segment to `curvedPoint` (one line before the unchanged 5A
  return); `segmentIndex` is now exported (used by spatialPath/motionPathMath).
- `src/core/spatialPath.ts` (89, new): `evalPosition(list, loop | undefined, u)` (replaces Task 3's `evalPositionKeys`,
  still through `loopedTime`; offset per axis; without a loop it IS `positionAt`); `pathHeading(list, loop, u)` (degrees,
  `atan2` of the direction of travel, y down = clockwise, 0 = moving right); `orientHeading(keys, u)` (0 unless
  `orient` with ≥ 2 position keys).
- `src/core/pathEdits.ts` (159, new): `setKeyTangents(p, clipId, u, {in?, out?, broken?})`, `setKeyPosition(p, clipId, u,
  xy)`, `smoothPath(p, clipId)`, `setOrient(p, clipId, on)`, `withLivePath(p, clipId, {u, xy?, tangents?})`,
  `withTangentPatch(key, patch)` (pure, exported for Task 8 previews), `NO_PATH_KEY`, `PATH_NEEDS_KEYS`.
- `src/core/animate.ts`: `resolvedTransform` evaluates position through `evalPosition` and, with `orient`, adds
  `orientHeading` to the keyed or static rotation (BASE value, D7).
- `src/core/animTargets.ts`: `valueAtLocal` (position) through `evalPosition`. Rotation's `valueAtLocal` stays the STORED
  (keyed/static) rotation without the heading (stopwatch-off write-back and key values are heading-free).
- `src/core/transformKeyEdits.ts`: `route` (shared by `setTransformAt` and `withLiveValue`) stores a typed/dragged
  rotation as `v − heading` when orient is on; a result within 1e-9 of the stored value IS the stored value, so retyping
  the shown value is a no-op.
- `src/core/keyLists.ts`: `copyKey` deep-copies `in`/`out` (split halves, shifted lists, clones never share tangent
  objects); `mapTransformKeys` passes "keep whole" for a position list with a loop OR with `orient` (see R4-3).
- `src/core/clipEdits.ts`: comments only (the `looped` flag now also covers oriented paths).
- `src/core/reframeKeys.ts`: tangents scale ·rx/·ry like x/y (fresh objects); `broken` kept.
- `src/core/keyLoops.ts`: `evalPositionKeys` removed (moved to `spatialPath.evalPosition`).
- `src/ui/motionPathMath.ts`: sampling already goes through `positionAt`, so the drawn path follows curves; a curved
  segment shorter than `CURVE_POINTS` (24) frames is drawn with 24 evenly timed points (when `keys × 24 ≤ 1000`, so the
  2000-sample cap holds). Cache: still memoised on the list identity (every path edit, live or committed, makes a new
  list; test). Loops: the path draws the keyed span only, documented in the header (repeat/ping-pong retrace it; an
  offset cycle repeats the shape shifted).
- Transform-readers audit: unchanged (no new `.transform/.params/.effects` reader in src/render or src/ui).

## Rulings (proposed for the ledger)
- R4-1 - Even speed: a curved segment maps the eased fraction to the ARC-LENGTH fraction through a 32-step
  Gauss-Legendre table + 3 Newton steps (measured per-frame arc length within 0.007 % of the mean on smooth curves,
  0.32 % on a tight hairpin where per-frame chords cut the corner). Overshooting eases continue along the end tangent.
- R4-2 - Heading: straight segment = its chord (whatever the ease); curved = dB/dt at the arc-mapped parameter, or the
  direction between B(t ± 1/32) at a cusp / zero-length end tangent. Stationary segments (a `hold` ease, or a
  zero-length segment without tangents) keep the END heading of the nearest previous moving segment, else the START
  heading of the next one, else 0 (only when nothing moves at all). Before the first key = start of the first segment,
  after the last = end of the last. The heading follows the PATH direction, not the ease's sign (a `back` overshoot does
  not flip it); a ping-pong cycle played backwards adds 180°. Unnormalised degrees (rotation is unbounded).
- R4-3 - A split keeps an ORIENTED position list whole on both halves (like a looped one, D4): the heading fallback of a
  stationary segment may read a segment beyond the half's range, so partitioning changed frames (caught by the property
  test before the fix). Unoriented, unlooped position lists are still partitioned (tangents ride on the kept keys, so
  curved segments are identical).
- R4-4 - Smooth/broken semantics (`setKeyTangents`): `in`/`out` Vec sets, `null` removes, absent leaves; a ZERO tangent is
  stored as absent (straight); values clamped to ±KEYED_POSITION_LIMIT, non-finite refused ('Invalid tangent'). A smooth
  key (not broken after the edit): setting ONE tangent turns the other to the opposite direction keeping its own length
  (an absent partner stays absent); setting both stores both as given; `broken: false` on a broken key re-aligns `in` to
  `out`. A broken key's tangents move independently. Key found by `nearestKey` (within KEY_EPS of `u`; Task 8 passes the
  dot's `u` = key time).
- R4-5 - `smoothPath` = Catmull-Rom direction (prev → next) with each handle ONE THIRD of the chord to its own neighbour
  (the plan's "one third of the neighbour chord"; equal to the classic (next − prev)/6 for evenly spaced keys and free of
  overshoot when spacing is uneven); first key: out = (next − key)/3, last key: in = (prev − key)/3; a key between
  coincident neighbours gets no tangents; every `broken` flag cleared; needs ≥ 2 keys.
- R4-6 - `setKeyPosition` clamps like a keyed position write at the playhead (±REACH × format, within ±1e7) and keeps
  time, ease, tangents, `broken`.
- R4-7 - `setOrient(on)` needs ≥ 2 position keys (`PATH_NEEDS_KEYS`); migration still keeps orient with 1 key (R2-5,
  inert). Order everywhere: lock → kind (assertTarget: audio, adjustment refusals) → no-op → content refusals.
- R4-8 - `withLivePath` = the same maths and clamps as the commits (live == commit, tested), without the lock guard, and
  never throws (missing clip/key, audio/adjustment, invalid value ⇒ `p` itself).
- R4-9 - With orient, the rotation FIELD (resolvedTransform, BASE) shows stored rotation + heading; writes through
  `setTransformAt`/`withLiveValue` subtract the heading (D7 "heading stays derived"). Turning position animation off
  removes `orient` (Task 3) so the rotation drops the heading at that moment.

## Tests and mutation checks
- `tests/spatial-path.test.ts`: 10 000 random evaluations of tangent-free and ZERO-tangent lists (10 eases incl. spring,
  hold, back, elastic, bezier) equal a verbatim copy of the 5A `positionAt` with `Object.is` on x and y, and
  `evalPosition(list, undefined, u)` equals `positionAt`; `isCurved` cases; curved endpoints exact (and held outside);
  points on the analytic cubic ≤ 1e-9 at all 33 table samples and at 200 random times (nearest-point search); linear
  ease constant speed within 1 % per frame (4 curves incl. a hairpin and a one-sided tangent); eased (easeInOut, easeIn,
  bezier) arc-length fraction = `easeAt` within 2e-3 of the TRUE arc length; overshoot finite; huge (1e7) and tiny
  (1e-300) tangents finite; loops (repeat, offset) over a curve.
- `tests/path-heading.test.ts`: straight = atan2 at 7 times incl. before/after and 0/180/−90; curve leaves along `out`,
  arrives along −`in`; pause, hold and leading pause keep the previous/next heading (never 0); nothing moving = 0;
  zero-length end tangent within 3° of the limit direction; cusp finite; loops incl. ping-pong +180; resolver adds the
  heading to static and keyed rotation (off = 5A); `orientHeading` gates; setTransformAt/withLiveValue store v − heading,
  retyping the shown keyed value is a no-op (values chosen where (s + h) − h ≠ s).
- `tests/path-edits.test.ts`: smooth mirroring keeps length (both directions), broken independence, re-align on
  `broken: false`, both-given, null/zero/clamp, absent partner, no-ops (same reference), KEY_EPS lookup, refusals (locked,
  adjustment, audio, no key at u, overlay without keys, NaN/Infinity); setKeyPosition keeps time/ease/tangents with fresh
  tangent objects, clamps, refusals; smoothPath exact Catmull-Rom values, collinear thirds, corners → smooth, coincident
  neighbours, idempotent, refusals; setOrient on/off/no-ops/refusals; withLivePath == commit, ignores lock, never throws;
  an edited path re-migrates to the same project.
- `tests/path-clip-ops.test.ts`: property 200 random curved clips (video/image/overlay, half oriented, eases incl. hold/
  back/elastic): whole-frame split (P5-5) both halves frame-exact on x, y AND rotation, plus a whole-frame start trim;
  property at ANY cut (P5-6/7): each half keeps the curve on its own local range (1e-9); tangent objects never shared
  (halves, original, copyKey, shiftKeys); reframe scales tangents and round-trips A → B → A within 1e-9 for all 12 format
  pairs (Ruling J); motion path endpoints, every sample on the curve, the curve bulges; short curve = CURVE_POINTS + 1
  points; 400 curved keys stay ≤ MAX_PATH_SAMPLES; tangent edit ⇒ new cached path.
- Mutation checks (each applied to the file, tests run, file restored; all 20 CAUGHT): straight fast path removed
  (bit-identity + loop tests fail); parametrise by Bezier t instead of arc length (constant-speed + on-curve tests);
  shallow tangent copy in copyKey (split independence + setKeyPosition fresh-object tests); mirror uses the lead's
  length; smooth handle /6; orient not added; previous-heading fallback removed; ping-pong heading not reversed;
  reframe ignores tangents; oriented path partitioned by split (property test); route keeps the heading; no-op epsilon
  removed (after picking values where rounding differs - the first version of that test could not fail); live path
  lock-guarded; orient ≥ 2 keys check removed; same-key no-op removed; zero tangent kept; dense curve sampling off;
  Newton refinement off (speed 1.25 % ⇒ fails); `broken: false` re-align off; tangent clamp off.
- Determinism: no `Math.random`/`Date` in the new code; fixed-size table and iteration counts.

## Contract for Tasks 5-9
- Evaluate positions ONLY through `evalPosition(list, loop, u)` (or `positionAt` for a loop-free read); heading through
  `pathHeading`/`orientHeading`. `resolvedTransform` (BASE) already includes the curve and the heading; Task 5's
  `resolveClip` composes motion on top of it.
- Task 6: render needs nothing new (resolvedTransform is used by collectDraws via resolveClip). Parity/pixel specs for a
  curved centroid and orient corners per §8. The resolver budget (T11-1) with every clip curved: ~1 µs per curved
  position evaluation, measured in isolation.
- Task 8 (canvas editing): drag a key dot = `withLivePath(p, id, {u: dot.u, xy})` live, `setKeyPosition` on release
  (ONE apply); tangent handles = `{tangents: {out}}` / `{in}` (Alt ⇒ `broken: true` in the same patch); double-click
  corner/smooth = `setKeyTangents(..., {broken: !broken})` (smooth re-aligns `in` to `out`; to turn a corner WITHOUT
  tangents into a smooth curve, call `smoothPath` or pass both tangents); `mp-smooth` = `smoothPath`; `kf-orient` =
  `setOrient` (disabled/hidden below 2 position keys). The handle positions are key + tangent in format px
  (`clipCentre` like the dots). `motionPathMath` needs no change for curves; drawing loop cycles is still open (header
  documents the keyed-span rule). The rotation field with orient needs no special code (route subtracts the heading),
  but its label could say "includes path direction" (manual QA).
- Task 9 (transfer): position keys AND tangents are format px (no fit-scale adaptation); copy with `copyKey` (deep);
  copy `orient` only with ≥ 2 pasted position keys.
- Any new clip operation that partitions key lists must keep a looped OR oriented position list whole
  (`mapTransformKeys` flag).

## Concerns
1. Heading follows the spatial path, not the ease's direction: during a `back`/`elastic` overshoot the picture moves
   backwards while facing forwards (R4-2). If QA prefers velocity-facing, it is a sign check on the eased slope.
2. A repeat loop on an oriented path jumps heading at each cycle start (the position jumps too); ping-pong flips 180°
   at each turn (correct for travel direction, may look abrupt; manual QA).
3. `stationary()` treats only exact zero-length straight segments and `hold` eases as stationary; an extremely slow
   segment still faces its chord (by design).
4. The 1e-9 "retype = no-op" tolerance in `route` only applies with orient on; a deliberate change smaller than 1e-9°
   is swallowed (harmless).
5. Short curved segments are drawn with 24 time-uniform points, so the dots of the polyline are no longer exactly "the
   frames the preview shows" there (the drawn line is still on the path).
