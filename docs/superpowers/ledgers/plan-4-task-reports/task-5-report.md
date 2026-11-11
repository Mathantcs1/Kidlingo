# Task 5 report: looks (bw, sepia, splitTone, vignette, grain) and nine presets

Commit ca168fb `feat: looks (bw, sepia, split tone, vignette, grain) and nine presets`.

## Math (all un-premultiplied sRGB 0..1, clamped, alpha untouched, exact identity at amount 0; documented in src/render/effects/looksMath.ts)
- bw: mix(c, Rec.709 luma, amount).
- sepia: mix(c, clamp(M·c), amount), M = classic W3C sepia matrix [.393 .769 .189; .349 .686 .168; .272 .534 .131].
- splitTone: tint(side) = amount·(hueToRgb(h) − luma(hueToRgb(h))) (zero-luma offset). hueToRgb = HSV s=v=1 (360 = 0 = red). pivot = 0.5 − 0.4·balance (+ favours highlights); s = smoothstep(pivot−.5, pivot+.5, L(c)); out = c + (1−s)·shadowTint + s·highlightTint. Tints/pivot are uniforms from TS (single source, no GLSL hue code).
- vignette: d = |pixel − centre| in pixels / half-diagonal (circle, aspect-correct, 1 at corners), centre pixel = gl_FragCoord (working size = clip image); falloff = smoothstep(size, size+max(softness,1e-3), d); c·(1 − amount·falloff). Note size=1 therefore means no darkening.
- grain: grainHash(frame, x, y) = lowbias32 over frame·0x9e3779b1 + x·0x85ebca6b + y·0xc2b2ae35 (uint wrap = Math.imul), top 24 bits / 2^24, in [0,1); GLSL uses identical uint maths. cell = floor(pixelCentre/size) (size as float32); out = c + amount·(hash − 0.5) on all channels (zero-mean luminance noise); seed = ctx.frame (u_frame). grainHash/grainPixel are exported for Task 8.

## Looks (src/core/looks.ts, one-line intent comment each)
bw [bw]; sepia [sepia]; vintage [sepia .45, colour contrast −.1 sat −.15, vignette .35, grain .12]; tealOrange [colour contrast .12 sat .1, splitTone 190°/.4 shadows, 30°/.4 highlights]; cinematic [colour contrast .2 sat −.1, splitTone 200°/.2, 40°/.15, vignette .3]; moody [colour exposure −.3 contrast .2 sat −.25, splitTone 220°/.25, 35°/.1, vignette .5 size .4]; goldenHour [colour temp .4 sat .1, splitTone 20°/.1, 40°/.2, vignette .2]; coolBlue [colour temp −.4 tint −.05, splitTone 215°/.25, 200°/.1]; punchy [colour contrast .3 sat .3]. All 1-4 effects, valid under clampParams.

## RED / GREEN
- RED: `npx vitest run tests/looks.test.ts` failed at import (looksMath missing). GREEN after implementation: 61 files / 957 tests pass.
- The e2e specs were written after the implementation (passed first run); their ability to fail is shown by mutation checks instead:
  - vignette aspect broken (distance on normalised uv, ellipse): gradient drift guard and the circular-on-wide-picture test FAIL.
  - grain frame seed replaced by 0: byte-identity/next-frame test and CPU-reference test FAIL.
  Both reverted. (bw/sepia/splitTone share the same drift-guard harness; not separately mutated.)
- Gate: npm test, typecheck, build OK; `grep -rl __clipforge dist` empty.
- Playwright, one run: effects-looks + effects-colour + effects-pipeline + compositor: 30 passed (plus effects-grain, 5 tests, run earlier together with effects-looks: 13 passed).

## Measured max errors (GL vs CPU reference, /255)
bw/sepia/splitTone/vignette gradient (every param min/max + combined, 5/5/14/11 sets): 0.5. Grain 6 sets x 64x64: 0.5. Alpha edges (straight colour): 50 %: ≤0.94; 15 %: bw 3.2, vignette 3.3, splitTone 1.7, sepia 0.9 (tolerance 1.5/alpha = 10).

## Files (lines)
New: src/render/effects/looksMath.ts 119, src/render/effects/shaders/look.ts 100, tests/looks.test.ts 207, tests/e2e/effects-looks.spec.ts 110, tests/e2e/effects-grain.spec.ts 99, tests/e2e/look-helpers.ts 70.
Modified: src/core/looks.ts (50), src/core/videoEffects.ts (+5 types in AVAILABLE_VIDEO_EFFECTS), src/render/effects/programs.ts (registered 5 shaders), tests/video-effects.test.ts (availability assert/title), tests/effect-pipeline.test.ts and tests/e2e/effects-pipeline.spec.ts (used sepia/bw as "no shader" stand-ins; switched to mirror/pixelate).

## Concerns
- Spec split: grain lives in effects-grain.spec.ts (not effects-looks.spec.ts) to keep files ≲200 lines; tests/looks.test.ts is 207 lines.
- applyLook-one-undo-step is tested with the real zustand store in the Vitest file (tests/looks.test.ts), not in Playwright (no UI until Task 10).
- Grain depends on working-size pixel coordinates, so noise pattern is tied to the clip's working resolution (same in preview and export by design). Grain size params like 1.1 could differ between float32/double only at exact cell boundaries; the CPU reference mirrors float32.
- vignette uses gl_FragCoord (not v_uv) so it stays centred when the first pass samples a rotated source.

## Fix round 1 (review)
Commit: `fix: grain relative to 1080 rows, working-size and rotation tests for vignette and grain`.
- Important 1: grain cell = clamp(size,1..4) * referenceScale(workingHeight), referenceScale = h/1080 (exported `referenceScale`, `REFERENCE_ROWS`, `grainCell(size, workingHeight)` in looksMath.ts for Task 8; shader gets the height from `uniforms(..., size)`). Documented in the looksMath.ts header, including the clamping bias.
- Minor 4: cells = floor(coord * invCell + 1e-4), invCell = float32(1/cell) passed as uniform `u_invCell`; CPU mirrors with Math.fround at each step (`grainInvCell`, `CELL_EPS`). Unit test pins exact boundary (size 1.5).
- Minor 3: Vitest: mean at mid-grey ≈ 0.5, at white < 0.99, at black > 0.01.
- Minor 5: grain tests moved to tests/looks-grain.test.ts (87 lines); tests/looks.test.ts now 165.
- Important 2: new tests/e2e/effects-looks-sizes.spec.ts: (a) 128x32 clip (scale 1) in a 256x48 format, vignette per pixel vs `vignettePixel` on the clip's own grid, max error 0.5/255; (b) quad-cw90.mp4 (displayed portrait): corner darkening ratios equal within 0.02, centre untouched, 10 pixels vs the reference within 3, grain byte-identical across two renders and matching grainPixel; (c) flat grey 64x540 vs 128x1080, size 4: per-pixel vs reference <= 2, mean same-sign run 3.84 px vs 7.71 px (ratio 2.0, asserted 1.6..2.4).
- RED/mutation: referenceScale forced to 1 makes 3 of the new grain Vitest cases fail. Vignette distance hard-wired to vec2(256,48) fails the 128x32 e2e. Grain scale hard-wired to 1080 rows fails the correlation-length e2e. All reverted.
- Commands: npm test 62 files / 961 pass; typecheck, build OK; `grep -rl __clipforge dist` empty; playwright effects-looks, effects-grain, effects-looks-sizes, effects-colour, effects-pipeline: 28 passed (one run).
