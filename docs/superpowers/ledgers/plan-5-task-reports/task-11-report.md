# Plan 5 Task 11 report: robustness, performance and integration guards

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1420 (103 files, at d9585d5) | 1435 (105 files; +4 `keyframe-perf`, +11 `keyframe-scale-zero`) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| new e2e (one sequential run, `--trace off`, 3.2 min) | n/a | 11/11: robust-edits 4, robust-merge 1, robust-reframe 1, robust-history 2, robust-perf 2, robust-export 1 |

Commit: `test: keyframe robustness, parity and performance guards` (73d1234) + this report. No source change: the tests exposed no
defect in ClipForge code (see "What the tests exposed"). Full e2e not run (the controller runs it). Not pushed.

## Files (all new; every file under 200 lines)
- `tests/keyframe-perf.test.ts` (149): resolver cost and autosave size.
- `tests/keyframe-scale-zero.test.ts` (86): scale 0 never NaN (unit sweep).
- `tests/e2e/robust-helpers.ts` (130): the animated stack in the REAL app (sourced lime image with `in` = 0.4, sourceless sticker
  overlay, adjustment layer with keyed opacity and keyed invert, each keyed on every property with mixed eases incl. back,
  elastic, bounce, hold; colour brightness + saturation keyed on the image), whole-canvas preview snapshots (base64; a
  sentinel frame first so a stale frame can never be read), frame comparison.
- `tests/e2e/robust-harness-helpers.ts` (57): the heavy 10 s, 8-clip project and its frozen twin (`resolveClip` at one time).
- `tests/e2e/keyframes-robust-{edits,merge,reframe,history,perf,export}.spec.ts` (124/110/93/121/72/75).

## What was tested
- **Clip operations in the real app** (toolbar buttons, timeline drags; exact canvas pixels, tolerance 0):
  split of image + overlay + adjustment at 2.0 s (45 frames from the clip start, Ruling P5-5) at 8 frame times around the cut;
  start trims of the sourced image and the sourceless overlay and an end trim of the adjustment layer by 12 px = 6 frames
  (asserted whole frames; overlay keys shifted by -0.2 s, image keys unchanged); move of image and overlay by +0.5 s
  (frame at t + 0.5 after == frame at t before); ripple delete and join of a filler before an animated clip (frame at
  t - 0.5). Every case: one undo step, undo restores the project JSON exactly.
- **Merge all** (real app, 1080p): frames 1/8/15/22/28 of the merged file vs the harness preview at 1080p of the pre-merge
  project: whole frame 0.74-1.68/255; on the pixels the animation moves between N-1/N/N+1 the merged frame is N
  (error 1.8-3.1 vs 22.8-69.8 for the neighbours). The keyed overlay and adjustment layer are baked in; Undo restores every
  key (JSON equal).
- **Reframe** 16:9 -> 9:16 -> 1:1 -> 16:9 (format select): at each format position keys are x*rx, y*ry and scale keys
  *sqrt(rx*ry) on the image (overlay scale keys stay, format-relative), rotation/opacity/effect keys and the adjustment clip
  untouched, the motion-path dots on the reframed keys (<= 1.5 format px); back at 16:9 every number within 1e-9, preview
  pixels equal (tol 1, measured 0), dots within 0.5 px; three undo steps restore the exact JSON.
- **History**: ten UI gestures (position/scale/rotation stopwatches, typed X/Y/scale/opacity at the playhead, the opacity key
  button, an ease preset on the 0.5 s diamond, rotation stopwatch off) = ten undo steps; undo x10 and redo x10 compare the
  project JSON with the recorded state at every step and the motion-path dot times with the stored position keys; flush +
  reload restores the JSON exactly and the path (3 dots) after reselecting.
- **Scale 0**: unit sweep over all 9 eases driving scale 2 -> 0 -> 0.5 (undershoot clamped), static scale 0 at +/-1e7 offsets
  under keyed position/rotation/opacity, and the static 0 that "animation off" writes at the 0 key, then re-keying, typing and
  keyed drag from 0: resolver, `clipMatrix`, `clipCorners`, overlay texture size and motion path finite at every frame. E2E:
  keyed and static scale 0 selected in the app at 5 playhead times: no "NaN" in the DOM or the inspector inputs, no errors.
- **Export**: 10 s, 8 clips (position, scale, rotation, opacity keyed with 8 eases; two effects each with a keyed param:
  colour, vignette, sepia, rgbSplit, bw, pixelate, invert, splitTone, sharpen, glow) at 1080p: 300 frames, 10.000 s,
  1920x1080; the 1080p render is exact run to run (fresh compositors); export vs preview 1.02-1.21/255 at 4 frames; per-frame
  framemd5 equality of two exports at a 320 px long side (300/300, 300 distinct). See Ruling T11-2.
- **Performance/memory**: resolver (Node), preview frame time (SwiftShader), overlay textures, autosave size (numbers below).

## Measured numbers
- `resolveClip`, 16 clips x 6 properties x 500 keys, best of 9 batches of 400 frames: **33-45 µs per frame** (budget 200 µs);
  5 keys: 19-25 µs (x1.66-1.81); a hand-written binary-search reference loop on the same machine at the same moment: 19-31 µs
  (resolver x1.48-1.77).
- Autosave (project JSON): **54.7 bytes per scalar key, 61.5 per position key**, linear (per-100-key steps within 2 %);
  500 keys = 26.7 / 30.0 KiB.
- Preview 1080p, 8 animated clips vs the same project frozen at 5 s, 15 interleaved frames: frozen median 127-131 ms,
  animated median 114-125 ms (**x0.89-0.98 on medians**); effect targets 3 (2.6 MiB) both; passes 326 vs 340 (keyed amounts
  cross neutral values, which skip passes).
- Overlays (sticker + lower third, scale keyed 0.5 -> 2 -> 1 vs static at 2): count 2, bytes identical to the static twin at
  every frame (129 600 at a 320x180 canvas); uploads identical to the static twin (2,3,...,4: the lower third's own built-in
  slide in/out, Ruling T13-2), so animated scale adds no upload.
- Export 1080p of the 10 s 8-clip project: 51 s (170 ms/frame); 320 px: 31 s.
- Merge all of the 1 s animated stack: whole-frame error 0.74-1.68/255.

## Rulings (proposed for the ledger)
- T11-1 - The resolver guard is threefold: the plan's 0.2 ms per frame on the BEST of 9 batches (a loaded machine still has a
  quiet batch), the resolver within 5x a reference loop measured in the same test (load cancels out; measured x1.5-1.8), and
  500 keys within 4x of 5 keys (binary search; measured x1.7). A linear-scan evaluator measured x7.6 / x7.7 and fails both
  relative guards (it would pass the absolute 0.2 ms: 150 µs).
- T11-2 - Headless Chromium's software H.264 encoder is not bit-reproducible at 1080p: two exports of a STATIC 10 s 1080p
  project differ in 299/300 decoded frames (mean 0.04-0.19/255, localised up to 120; frame 0, the key frame, identical); the
  same project at a 320 px long side is 300/300 identical, and the 1080p RENDER is identical. So "two exports hash-equal per
  frame" is asserted at 320 px through the same export path; at 1080p the test asserts exact render determinism, export
  completion (300 frames, 10 s, 1920x1080) and preview parity (< 3/255). Not a keyframe property and not fixable in our code
  (encoder internals); preview == export, the actual requirement, holds.
- T11-3 - The preview guard keeps the plan's 1.2x on interleaved medians (measured x0.89-0.98: evaluation is ~30 µs of a
  ~125 ms frame), with structural checks (same effect targets, passes <= the frozen twin and > 0.8x). The twin is the same
  project frozen with `resolveClip` at 5 s; keyed blur radius was left out of the heavy project because it changes the pass
  count per frame (Plan 4 behaviour), which would make the comparison measure blur tiers, not evaluation.
- T11-4 - Pixel equality around clip operations is exact (tolerance 0) except the format round trip (tolerance 1; measured 0),
  and is measured on the whole preview canvas at frame times k/30; trims and moves are done by real drags of 12 and 30 px at
  60 px/s, i.e. whole frames (P5-5), asserted from the store.

## Mutation checks (each restored; each caught)
- Split without the sourceless key shift (`shift = 0`) -> robust-edits split: pixel mismatch at frame 3 (and the key-time check).
- Sourceless start trim without the key shift -> robust-edits trim: pixel mismatch at frame 0.
- `localTime` from absolute time (`snapToFrame(t)`) -> move and ripple/join pixel mismatch.
- Reframe without key scaling -> robust-reframe (position key -281.25 expected).
- Exporter time off by one frame (`(n + 1) / fps`) -> robust-merge (whole frame 3.15/255, frame N+1 closest).
- Motion-path cache keyed on one constant (stale path) -> robust-history (dots do not follow undo).
- Overlay texture sized from the per-frame scale -> robust-perf memory (bytes 72 900 vs 291 600, uploads every frame).
- 4 ms of extra work per animated clip per frame -> robust-perf preview (x1.21 > 1.2).
- `Math.random()` in the resolved rotation -> robust-export (1080p render not equal).
- Linear-scan key search -> keyframe-perf (x7.66 > 4, x7.57 > 5).
- No scale floor in the resolver -> keyframe-scale-zero (back, elastic, bezier undershoot).

## What the tests exposed
- No defect in ClipForge's code: every operation, round trip, history walk, reload and export guard passed first time once the
  test itself was right (fixes were to the tests: the end key is not a dot (T10-4, end exclusive); the merge timing check
  needed a moving-pixel mask because whole-frame means barely move on a mostly static frame; the overlay upload count follows
  the lower third's own slide).
- Encoder non-determinism at 1080p (T11-2): pre-existing, not ours, documented.

## Concerns
1. The perf guards are SwiftShader numbers on this machine; real GPUs are unverified (as in Plan 4).
2. The 1.2x preview guard has ~20-30 % headroom; on a much noisier machine it could flake (interleaving keeps both sides under
   the same load; the minima are reported too).
3. `keyframes-robust-export` takes ~2 min (one 1080p and two 320 px 10 s exports) and `-perf` ~25 s: they add ~2.5 min to the
   full e2e run.
4. T11-2: users comparing two exports byte for byte will see differences; only matters for tooling, not for viewers.
5. Not covered here (left to Task 12's journey and manual QA): video (decoded) clips under split/trim; the sub-frame phase of
   non-frame-aligned cuts (P5-5, accepted).
