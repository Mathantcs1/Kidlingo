# Plan 5B Task 6 report: render integration, parity and the reader audit

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1658 (126 files) | 1668 (129 files; +3 `draw-collect`, +4 `drawn-scale` (new), +3 `overlay-builtin` (new); `transform-readers` detector test extended) |
| typecheck, build | green | green; `grep -rl` for `__clipforge`, `breakVideoEffect`, `breakBlendProgram`, `failNoiseProbes`, `renderBlend` in `dist` empty |
| new e2e | n/a | `presets-render` 6, `presets-overlays` 3, `keyframes-motion-render` 4, `presets-parity` 2 (30 and 25 fps) |
| related e2e (ONE run, `--workers 1`, `--trace off`) | n/a | see "E2E gate" below |

Commits: `feat: render animation presets and curved paths (preview and export)` + this report. Not pushed. Full e2e NOT run
(the controller runs it after review, per the brief).

## Design
- The compositor already evaluated presets, spring eases, loops, curved paths and orient through the ONE resolver since
  5B Tasks 1-5 (`collectDraws` calls `resolveClip(raw, t, p.format)`); preview and export share `collectDraws`. So the
  family pixel tests passed on the pre-Task-6 code (they pin the behaviour; the RED part of this task was overlays: see
  below). What was missing, and is now implemented:
- `src/core/drawnScale.ts` (new, 41 lines, pure): `maxDrawnScale(raw)` = (`maxScale(raw)` + the climb of an `offset`
  scale loop) × `maxMotionScale(raw)`, capped at `MAX_DRAWN_SCALE` (= `KEYED_SCALE_LIMIT`, 1e6; NaN/∞ read as the cap).
  The offset climb = cycles × (last − first) for a rising list; cycles = `count`, or with no count the cycles starting
  before the clip's local end (`ceil((hi − first.t) / period)`, conservative). Repeat/ping-pong add nothing (they stay
  within the keys). A sub-frame period gives a huge finite number ⇒ the cap ⇒ the texture is capped at
  `MAX_OVERLAY_SIDE` (2048 px) by `overlayTextureSize` as before (Ruling P5B-3). Without loops and presets it is EXACTLY
  `maxScale` (5A textures unchanged; unit-tested).
- `src/render/drawCollect.ts`: overlay texture scale = `maxDrawnScale(raw)` (RAW clip: the resolved one has no keys, loops
  or motion); `builtIn = { in: !raw.motion?.in, out: !raw.motion?.out }` passed to the texture cache.
- `src/render/overlays/draw.ts`: `BuiltInSlide`, `BUILT_IN_SLIDES`; `overlayAnimation`/`animationAt`/`drawOverlay` take an
  optional `builtIn` (default both on). An edge whose slide is off reads as `SLIDE_SECONDS` from that edge (fully in), so
  with both on the formula is the old one bit for bit (unit test against the original at 400 times).
- `src/render/overlays/textures.ts`: `get(..., textureScale, builtIn = BUILT_IN_SLIDES)`; the key carries the flags; with an
  In/Out preset the lower third's built-in slide at that edge is 1, so the texture is ONE still upload through the
  preset's frames.
- No compositor change (195 lines, untouched), no shader change, no new harness hook (`renderBlend` already reports
  `overlayTextures` and `overlayUploads`; `renderRgb` and `exportWithSkips` cover parity).

## Rulings (proposed for the ledger)
- T6-1 - Overlay textures are sized by `maxDrawnScale(raw)` (keys + offset-loop climb, × preset bound, capped at 1e6; the
  pixel cap stays `MAX_OVERLAY_SIDE`). Eased overshoot between keys is still not included (5A T5 Minor 3, unchanged so
  5A projects keep their textures byte for byte).
- T6-2 - The lower third's built-in slide is decided from the RAW clip's `motion.in` / `motion.out` only (D13/Q10);
  emphasis and loop presets leave both built-in slides on. An edge that is off reads as fully in (slide 1), not as a
  separate code path.
- T6-3 - The reader audit now also flags `.motion`, `.loops`, `.orient` (reads, destructuring) in `src/render` and `src/ui`
  (a CSS class such as `'.motion-key'` is excluded by `(?!-)`); the one render reader (drawCollect `builtIn`) is listed
  with its reason and count 1.

## Tests (RED first) and numbers
- RED on the pre-Task-6 code (`src/render` stashed): the 3 `presets-overlays` specs failed (lower third at 0.1 s with an In
  Fade vs the fully-in still: max diff 26; Pop texture 54² = 11 664 B instead of 62²; offset-loop texture 81² instead of
  2048²), 2 new `draw-collect` unit tests failed; the 5A hash test failed only because its literals were not yet recorded.
  The 5A literals were then recorded ON THAT CODE (two runs, identical) and pass unchanged after the change.
- `presets-render.spec.ts` (core oracle = `resolveClip`): Fade In linear 0/60/128/187/255 vs 0/59.5/127.5/187/255, easeOut
  91 vs 90.57, Fade Out 128 / 8 vs 127.5 / 8.5 (±2); Slide In from the left centroid 75/160/235 vs 74.67/160/234.67 (hand
  formula equal to the resolver to 1e-6); Pop frame 0 empty, overshoot frame 6 at scale 1.1499: box 115 × 115; Spin In
  p = 0.5: 30 × 120 box, red end on top (−90°); Drop: touch frame 9, bounce top frame 13 (back up, both ±1 px of the
  resolver); Ken Burns 1 → 2: 200 px at 0, 282 × 282 at mid-clip (√2 × 200 = 282.84; resolver √2 to 1e-12); Pulse 230
  (1.15) mid-window, 200 after; Shake: two fresh compositors give identical hashes, centroids ±1 px of the resolver,
  largest offset 13.7 px; Blink on an adjustment invert: inverted / original / inverted / original at 0.2/0.7/1.2/1.8 s.
- `keyframes-motion-render.spec.ts`: bouncy spring position (centroid within 0.5 px of `evalPosition`, overshoots the last
  key) and opacity (±2 of `evalKeys`); loops repeat 60, ping-pong 90, count 1: 60 then holds 100, offset cycle 2 centroid
  330 (hand formula = `evalPosition`); curved path centroids within 0.4 px of `evalPosition` (arch 120 px above the chord);
  orient along a diagonal: heading 26.565° (= atan2), box 160 × 108 (expected 160.0 × 107.3), red end at the heading
  ±2°; 5A-only keyed fixtures (images with every property + colour keys, sticker with elastic scale and rotation keys, lower
  third mid-slide with opacity keys, adjustment with hold keys, progress bar position keys): 6 hashes equal the pre-Task-6
  literals (asserted only on the recorded GL, like 5A's static hash test; elsewhere skipped with a warning) and all 6
  differ from each other.
- `presets-overlays.spec.ts`: lower third with an In Fade at 0.1 s == the fully slid-in still at opacity 0.1 (byte equal;
  vs the built-in slide frame max diff 25); Out Fade at 1.9 s likewise; an In preset keeps the built-in slide-OUT (equal to
  no preset at 1.9 s); the existing `overlays-render` spec (no preset) is unchanged. Pop: 10 frames one 62² texture,
  `overlayUploads` 1, peak frame byte-equal to a static sticker at scale 1.1499; Zoom from 2: 10 frames one 108² texture,
  1 upload, a mid-window frame (scale 1.692) within mean 0.07/255 of a static sticker (max 24 on filtered edges: minified
  from the ×2 texture, no mipmaps, 5A T5 Concern 1); offset scale loop with a 0.01 s period and no count: 2048² texture,
  1 upload over 3 frames; offset count 2 (0.5 → 1): 108² (bound 2).
- `presets-parity.spec.ts` (1 s stack: spring-eased curved position with orient, repeat scale loop, keyed colour, Slide
  In + Pulse + Breathe + Fade Out; 1920 × 1080 export): preview vs export 1.01-1.09/255 per pixel at 6 frames per fps
  (neighbour frames 1.7-9.4, asserted larger); two 320 px exports frame-for-frame equal (30/30 and 25/25 frames, all
  distinct); between-frame playheads equal the frame start (3 pairs).
- `draw-collect.test.ts` (+3): texture scale = `maxDrawnScale` of the RAW clip (2.4 for keys 1 → 2 with Pop 0.2, 2.5 for
  an offset count-2 loop) and the drawn clip carries the Pop's scale 0 and no `motion`; `builtIn` flags per clip
  (none / in / in+out); a hidden track with `motion` is never resolved (counter = visible clips only) and an empty stack
  (`motion: {}`) is the SAME object. `drawn-scale.test.ts` (4): equals `maxScale` for 5A clips, loop modes and sourced
  ranges, bounds every frame of looped/preset clips, cap for sub-frame/NaN/∞. `overlay-builtin.test.ts` (3).
- Mutation checks (each restored; all CAUGHT): texture without the preset bound (1 unit + e2e on the old code); builtIn.in
  ignored in drawCollect (3); offset-loop climb removed (4); cap removed (1); cycles undercounted (2); overlayAnimation
  ignoring `builtIn.in` (1 unit; e2e lower-third spec on the old code); an unlisted `clip.motion` read added to
  `textures.ts` (audit fails, 2); resolving every clip of every track before the visibility filter (3).

## E2E gate (one playwright run, `--workers 1`, `--trace off`)
presets-render, presets-overlays, presets-parity, keyframes-motion-render, compositor, blend, blend-export, blend-failure,
adjustment, adjustment-alpha, adjustment-app, overlays-render, keyframes-render, keyframes-render-fx, keyframes-parity,
effects-parity, export-gl, pip, pip-drag, pip-visibility: 83/83 passed (9.6 min), no flake (console warnings are the deliberate failure-injection specs).

## Contract for Tasks 7-9
- Render: nothing in `src/render` evaluates presets; `Draw.clip` is resolved (no `motion`, `keys`, `loops`). Anything that
  needs the stack takes the RAW clip and must be listed in `tests/transform-readers.test.ts` (it now flags `.motion`,
  `.loops`, `.orient`).
- Handles and hit testing (Task 7 ghost, Task 8): `TransformOverlay` places handles at `resolvedTransform` (the BASE/rest
  value, D3) and `overlayHit` hit-tests that box. With a preset active the picture is drawn elsewhere (offset, scaled,
  faded) while the handles stay at rest: this is the D3 design. NOT implemented here (gap documented): the `motion-ghost`
  outline of the drawn picture (`clipCorners(size, resolveClip(clip, playhead, format).transform)`) belongs to Task 7
  (listed in its files); clicking the drawn picture away from the rest box does not select it (Task 7/8 may add the
  ghost box as a second hit region).
- Motion path: `src/ui/motionPathMath.ts` still draws the keyed span only (no loop cycles); Task 8 draws offset cycles
  (capped) or a hint. Unchanged here, so no regression.
- Overlay sizing: use `maxDrawnScale(raw)` for any future overlay/texture sizing; it is the ONE bound.
- `overlayAnimation(type, time, duration, builtIn?)`: a UI preview of a lower third (e.g. a preset tile, Task 7) should
  pass the clip's flags the same way (`{ in: !motion?.in, out: !motion?.out }`).

## Concerns
1. Overlay minification without mipmaps (5A T5 Concern 1) now also applies to Zoom/Pop/offset-loop bounds: a mid-zoom frame
   differs from a static sticker by up to 24/255 on edge pixels (mean 0.07). A capped 2048² texture for a pathological
   offset loop drawn small could alias; mipmaps remain the fix if manual QA shows shimmer.
2. `maxDrawnScale` still ignores eased overshoot between scale keys (back/elastic/spring/bezier on a keyed scale): such an
   overlay is slightly soft at its peak (kept for 5A byte-identity; Pop/Zoom presets ARE covered via `presetMaxScale`).
3. The new specs read full frames back into Node (`renderBlend` returns number arrays): ~10-30 s per test at 640 × 360;
   `test.setTimeout(120_000)` per file.
4. The 5A hash literals are SwiftShader values on this machine (machine-aware skip elsewhere); the constant-key and
   static hash tests of 5A Task 5 remain.
