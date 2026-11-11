# Task 8 report: stylise effects (rgbSplit, glitch, vhs, mirror, invert)

Status: DONE. Commit `feat: stylise effects` (not pushed).

## Design

Files: `src/render/effects/styliseMath.ts` (140, coefficients + pure per-row/pixel helpers, single source of the
uniforms), `src/render/effects/styliseRef.ts` (108, CPU image references for the drift guards),
`src/render/effects/shaders/stylise.ts` (150, five `PassShader`s), `shaders/glsl.ts` gains `GLSL_HASH` (the GLSL twin
of `grainHash`; GRAIN now uses it, behaviour unchanged) and `GLSL_SAMPLE` (`at(vec2 p)`: sample at a working-pixel
position, clamped to the pixel centres, mapped through `u_uv`). Registered in `PASS_SHADERS`; availability flipped in
`AVAILABLE_VIDEO_EFFECTS` (everything but chromaKey is now available).

- **invert**: straight colour `mix(c, 1 − c, amount)`, alpha untouched.
- **mirror** (mode rounded/clamped 0..3): 0 left→right, 1 right→left, 2 top→bottom, 3 four-way (top-left quadrant).
  Pure `mirrorSource(x, y, w, h, mode)` on pixel centres (odd sizes keep the middle column). Moves premultiplied RGBA
  as a whole, so alpha follows the mirrored picture.
- **rgbSplit**: offset `d = amount · referenceScale(workingHeight) · (cos, sin)(angle)` (1080-row px, y down = clockwise);
  red sampled at p − d (red moves +d), blue at p + d, green and alpha at p (bilinear, clamped).
- **glitch** (time-based): blocks `b = max(1, blockSize · scale)` tall, `GLITCH_ASPECT (4) · b` wide. A block is hit when
  `hash(frame, bx, by) < intensity · 0.5`; hit blocks shift horizontally by whole pixels
  `⌊(hash(frame, bx, by + 0x10000) − 0.5) · intensity · 0.2 · width⌋`, with red at +split and blue at −split
  (`⌊hash(…, by + 0x20000) · intensity · 0.5 · b⌋`); alpha comes from the shifted green sample.
- **vhs** (time-based): wobble (rows in bands of `max(1, 8·scale)` shift by whole pixels, ±`wobble · 12 · scale / 2`),
  bleed (chroma = c − luma mixes by `bleed` towards the mean chroma of 4 taps to the left, step `max(1, round(3·scale))`),
  scanlines (row cells of `max(1, 2·scale)`; odd cells × `1 − 0.5·scanlines`), noise (luminance
  `0.5·noise·(hash(frame, cx, cy) − 0.5)` on cells of `max(1, 2·scale)`).
- `hash` = looksMath `grainHash` (re-exported); salts are added to the y argument (block rows never reach 2^16).
- All sizes are relative to 1080 working rows via looksMath `referenceScale`; the scales and reciprocals are computed on
  the CPU (float32 via `Math.fround`) and passed as uniforms; the GLSL has no referenceScale. Cell indices use the grain
  recipe `⌊(i + 0.5)·inv + CELL_EPS⌋` (`cellOf`). Shifts are whole pixels so samples land on texel centres.
- Each shader uses `run` so an identity setting draws NO pass (invert amount 0, rgbSplit amount 0, glitch intensity 0,
  vhs all zero); mirror always draws one pass. Time-based effects read `u_frame` (EffectContext.frame, clip-relative).

## Rulings

- Ruling: "alpha of transparent regions untouched" is exact for invert, rgbSplit and vhs without wobble (alpha = the
  pixel's own alpha). The geometric effects (mirror, glitch shifts, vhs wobble) move premultiplied RGBA as a whole, so
  alpha follows the displaced picture (a valid premultiplied result, no black blocks); on full-width alpha rows (the
  tested fixture) horizontal displacement leaves alpha unchanged — cost if wrong: a user expecting a mirrored logo to
  keep its original transparency mask would see the mask mirrored, which is the natural mirror behaviour.
- Ruling: rgbSplit samples sub-pixel offsets bilinearly (smooth with amount), glitch/vhs shifts are whole pixels (exact
  CPU/GPU agreement through hashed decisions) — cost if wrong: none.
- Ruling: glitch "blocks" are 4:1 wide blocks of `blockSize` height; vhs constants (VHS in styliseMath) are design
  choices, not from the plan — cost if wrong: look tweaks only (constants live in one place, the GLSL follows).

## Evidence

- RED unit: `tests/stylise-math.test.ts` failed (module styliseMath missing). Schema/pipeline tests updated first and
  failed 4/76 until the shaders were registered (`video-effects`, `effect-pipeline` ×3).
- RED e2e: with the five PASS_SHADERS entries removed, `effects-stylise.spec.ts` failed 5/6 (the transparency guard
  passes by design).
- GREEN: `npm test` 74 files / 1048 tests; `npm run typecheck`, `npm run build` clean; `grep -rl __clipforge dist` empty.
- e2e (one at a time, `--trace off`): effects-stylise 6/6, effects-stylise-reference 8/8, effects-pipeline +
  effects-pipeline-robust 11/11, effects-grain 5/5 and effects-looks 8/8 (GLSL_HASH refactor) green.
- Measured max |GL − reference| (every pixel, every set, gradient 256×48 and texture 96×540): rgbSplit 0.499,
  glitch 0.000, vhs 0.500, mirror 0.000, invert 0.490 (/255). Soft edges: straight-colour error 0.996 (50 %),
  3.355 (15 %, tolerance 10) /255; alpha within 1.5/255.
- Mutations (each restored, each failed a test): glitch shift sign (255/255 off), scanline parity (130/255),
  rgbSplit blue direction (26/255), `at` without u_uv (rotated video test), rgbSplit alpha from the red sample and
  invert on premultiplied colour (edge alpha test), mirror split point moved (mode 0 pixel compare).

## Tests

- `tests/stylise-math.test.ts`: hash determinism + distribution (mean 0.5 ± 0.02, deciles 10 % ± 1.5 % over 10 000);
  invert twice/amount 0/alpha; mirror sources per mode, mode rounding, mode 0 and 3 images; rgbSplit offsets and
  channel shifts; glitch scale/identity/determinism/whole-pixel shifts/transparent rows; vhs identity, scales,
  scanlines, alpha, determinism, zero-mean noise.
- `tests/stylise-shaders.test.ts`: each shader registered, one pass at defaults with declared float/vec uniforms only,
  no pass at identity; time-based shaders read u_frame and contain no 1080.
- `tests/e2e/effects-stylise.spec.ts`: invert twice ±1, amount 0 no pass; mirror mode 0 and 2 pixel compares;
  rgbSplit amount 0 identity and amount 20 at 540 rows = ±10 px red/blue (angles 0 and 90); glitch/vhs byte-identical
  per frame, same within a frame, differ across frames, clip-relative; transparent stays transparent; disabled skipped.
- `tests/e2e/effects-stylise-reference.spec.ts`: the drift guard (every param min/max, mirror every mode, defaults,
  combined sets, two fixtures, ≤ 3/255); soft-edge alpha/straight colour (1.5/alpha) on row and column alpha fixtures;
  mirror four-way alpha; rotated phone video (mirror, rgbSplit, glitch) matches the reference upright.
- Updated stand-ins: `tests/effect-pipeline.test.ts` (unregistered type is now chromaKey; the invert override restores
  the shipped shader), `tests/e2e/effects-pipeline.spec.ts` (chromaKey instead of mirror), `tests/video-effects.test.ts`.

## Concerns / notes for later tasks

- Task 9: chromaKey is the LAST unregistered type; the "unregistered type" stand-ins in `tests/effect-pipeline.test.ts`
  (two places) and `tests/e2e/effects-pipeline.spec.ts` (one) use chromaKey and must switch to unregistering a type
  temporarily (e.g. `registerPassShader(t, undefined)` with restore) when chromaKey lands.
- `src/render/effects/programs.ts` is 198 lines: Task 9 adds one import + one entry → split (e.g. move PASS_SHADERS
  into `registry.ts`) before or during Task 9.
- `tests/stylise-math.test.ts` is 202 lines (tests only).
- Glitch and VHS change every frame (no hold), so at 60 fps they flicker twice as fast as at 30 fps; parity across
  fps is per frame index, as D6 specifies for grain.
- Float32 agreement relies on IEEE multiply without FMA at the cell/shift floors (same caveat as grain, bounded by
  CELL_EPS for cells; a shift exactly on an integer boundary could differ by one pixel on a GPU that fuses).
- Exactness is measured on SwiftShader only; real GPUs' 8-bit sub-texel weights add ≈ 1/255 for rgbSplit's
  bilinear samples.
