# Task 4 report: fused colour effect

Status: DONE. Commit `1cdfb5e feat: fused colour effect` (not pushed).

## Math (src/render/effects/colourMath.ts, mirrored by src/render/effects/shaders/colour.ts)

Shader: sample premultiplied `src`; `a <= 0` ⇒ `vec4(0)`; un-premultiply `c = clamp(rgb / a)`; maths below; output
`vec4(c * a, a)` (alpha untouched). Values are display-referred sRGB 0..1; every stage is clamped to 0..1.

1. Exposure: `linearToSrgb(srgbToLinear(c) · 2^exposure)` (IEC 61966-2-1 piecewise sRGB, constants in `SRGB`).
2. White balance: `c · (1 + 0.2·temperature, 1 − 0.2·tint, 1 − 0.2·temperature)` (`WB_GAIN` 0.2): temperature + warms
   (R up, B down); tint + = magenta (G ×0.8), − = green (G ×1.2).
3. Shadows/highlights: `L = Rec.709 luma`; `c + 0.3·shadows·(1 − L)² + 0.3·highlights·L²` (`TONE_GAIN` 0.3).
4. Contrast: `(c − 0.5)·(1 + contrast) + 0.5`.
5. Brightness: `c + 0.5·brightness` (`BRIGHTNESS_RANGE`).
6. Saturation: `L + (c − L)·(1 + saturation)`, Rec.709 luma (0.2126, 0.7152, 0.0722); −1 = grey.
7. Hue: W3C Filter Effects `hueRotate` matrix (feColorMatrix constants 0.213/0.715/0.072), degrees.

Sharing: `colourCoeffs(params)` computes 2^e, the WB gains, tone offsets, 1+contrast, brightness offset, 1+sat and the
hue matrix rows once; the shader's `uniforms()` passes exactly those (u_expo, u_wb, u_tone, u_contrast, u_bright,
u_sat, u_hue0..2) and `colourPixel` applies them with `applyColour`. LUMA and the sRGB constants are interpolated into
the GLSL source from the TS constants. Exact identity at defaults: exposure/contrast/saturation stages are skipped when
their coefficient is 1 (same guards in GLSL); the hue matrix is the literal identity at 0°; WB ×1 and +0 offsets are
exact. Missing / non-finite param keys count as 0.

## Evidence

- RED unit: `tests/colour-math.test.ts` failed (module missing); updated `tests/video-effects.test.ts`
  (only colour available) and `tests/effect-pipeline.test.ts` (`PASS_SHADERS` keys = ['colour']) failed 2/56.
- RED e2e: with the `colour: COLOUR` registration commented out, all 4 tests of `effects-colour.spec.ts` failed
  (passes [0] ≠ [1]; GL vs reference off by 55.8/255; interior 200,120,60 vs 255,164,68).
- GREEN: unit 11/11; `npm test` 60 files / 939 tests; `npm run typecheck` and `npm run build` clean;
  `grep -rl __clipforge dist` empty. e2e (one run): effects-colour, effects-pipeline, effects-pipeline-robust,
  compositor, layers-render, export-gl: 31 passed.
- Measured: max |GL − colourPixel| = 0.489/255 over every pixel of a 4-colour 64×64 image × 4 sample param sets
  (tolerance 3); 50 %-alpha edge straight-colour error max 0.183/255 (tolerance 3), alpha change ≤ 1.5/255.
- Mutations (each restored): shader without un-premultiply ⇒ the halo test fails (edge 143,74,26 vs 255,163,68);
  CPU exposure as a plain multiply ⇒ the "exposure +1 doubles the LINEAR value" unit test fails; GLSL exposure as a
  plain multiply ⇒ the GL-vs-reference e2e fails.

## e2e spec (tests/e2e/effects-colour.spec.ts)

1. Solid red / mid-grey (128) / white PNGs at defaults: one pass, whole frame within 1/255 of the no-effect render.
2. 4 sample param sets on a 4-colour image: every pixel within 3/255 of `colourPixel(no-effect pixel)`.
3. Edge fixture (canvas-made PNG: opaque C, then 8 columns of C at 50 % alpha, then transparent) rendered over the
   black canvas and over a white image track; straight colour and alpha recovered from the two composites
   (`a = 1 − (W − B)`, `C = B / a`): alpha unchanged, edge colour = `colourPixel(edge colour before)`, transparent
   area shows untouched white.
4. Rotated phone video (`quad-cw90.mp4`, real decoder) with exposure −1.3, hue 120, shadows/highlights: quadrant
   centres match the reference applied to the plain render at the same place (so the picture is upright) and the four
   corners stay distinct.

## Files

- new `src/render/effects/colourMath.ts` (105), `src/render/effects/shaders/colour.ts` (64),
  `tests/colour-math.test.ts` (127), `tests/e2e/effects-colour.spec.ts` (172)
- modified `src/core/videoEffects.ts` (89; colour `available: true`, params unchanged),
  `src/render/effects/programs.ts` (161; `PASS_SHADERS = { colour: COLOUR }`), `tests/video-effects.test.ts`,
  `tests/effect-pipeline.test.ts`.

## Concerns

- The brief's interface text says "linear-in/linear-out"; the function is sRGB-in/sRGB-out (display-referred) with
  exposure done in linear light, as the task message specified. Callers must pass 0..1 sRGB values.
- Brightness is monotonic per channel only while hue is 0 and saturation ≤ 0 (saturation > 1 with clamped channels,
  and the hue matrix's negative entries, can lower a single channel); the unit test documents this scope.
- The hue matrix uses the CSS luma weights (0.213/0.715/0.072) while saturation/tone use exact Rec.709 weights; both
  are standard, the small difference is intentional and documented.

## Fix round 1 (commit d9fdecf `test: colour drift guard over a gradient and every param extreme; shared GLSL helpers`)

Changes:
- New drift guard in `tests/e2e/effects-colour.spec.ts`: a canvas-made 256×48 gradient (`gradientImage` in the new
  `tests/e2e/colour-helpers.ts`): rows 0-15 a grey ramp 0..255, then full-saturation hue sweeps at lightness 50 %, 25 %
  and 75 %. 23 param sets (each of the nine params alone at min and at max = 18, the 4 combined sets, defaults) are
  placed as consecutive 1 s clips of one track and rendered by ONE compositor (one `renderEffects` call, ~7.5 s);
  every other row × all 256 columns of every set must be within 3/255 of `colourPixel`. The defaults set must keep all
  256 ramp levels within 1/255 (and the plain render must be the ramp within 1/255).
  Measured max |GL − colourPixel| over the 23 sets: 0.500/255.
- Low alpha: the edge fixture gains columns 40-43 at 15 % alpha. Alpha must stay within 1.5/255; straight-colour
  tolerance is `1.5 / a` (RGBA8 premultiplied storage keeps c·a to ±0.5/255, so straight colour is known to about
  ±0.5/(255·a) per texture hop, and the black/white read-back adds as much again): 3/255 at 50 %, 10/255 at 15 %.
  Measured: 0.183/255 (50 %) and 2.635/255 (15 %).
- `src/render/effects/shaders/glsl.ts` (42 lines): `f()`, `GLSL_HEADER`, `GLSL_LUMA`, `GLSL_SRGB` (toLinear/toSrgb),
  `GLSL_PREMULTIPLY` (`unpremultiply(vec4)` with the alpha-0 guard, `premultiply(vec3, float)`), all written from the
  TS constants. `shaders/colour.ts` (46 lines) imports them; behaviour is unchanged (same specs green, same measured errors).
- `colourMath.ts`: the header now says which stages are skipped (exposure, contrast, saturation) and which are identity
  by arithmetic, and notes the JS-double vs GLSL-float32 guard comparison. The redundant `const h` is gone.
- `videoEffects.ts`: `AVAILABLE_VIDEO_EFFECTS` (a ReadonlySet, currently {'colour'}) is now the ONE place where an
  effect is made available. `fx()` reads it. `video-effects.test.ts` asserts `available === AVAILABLE_VIDEO_EFFECTS.has(t)`
  and that the set is ['colour']. `effect-pipeline.test.ts` asserts the `PASS_SHADERS` keys equal the set.

Mutation evidence (each mutation was undone afterwards; the restored file was checked):
- Tone mask `u_tone.x * (1.0 - l) * (1.0 - l)` → `(1.05 - l) * (1.0 - l)` in shaders/colour.ts: the OLD 3-colour
  sample test PASSED, and the new gradient test FAILED (`{"shadows":-1}` off by 4.07/255).
- Highlight mask `l * l` → `l * l * l`: both tests fail (old 3.17/255, barely; new `{"highlights":-1}` 11.8/255).
- toSrgb branch cut 0.0031308 → 0.006: BOTH tests pass. The two branches differ by at most ~1.9/255 there, which is
  inside the brief's 3/255 tolerance. That mutation is not visible at this tolerance.
- The shared `unpremultiply` without `/ p.a` in glsl.ts makes the halo test fail (edge 143,74,26 vs 255,163,68).

Commands run (all passed after the fixes): `npx vitest run tests/colour-math.test.ts tests/video-effects.test.ts
tests/effect-pipeline.test.ts` (67 tests); `npm test` (60 files, 939 tests); `npm run typecheck`; `npm run build`;
`grep -rl __clipforge dist` (no output). Then one run of `npx playwright test tests/e2e/effects-colour.spec.ts
tests/e2e/effects-pipeline.spec.ts tests/e2e/effects-pipeline-robust.spec.ts tests/e2e/compositor.spec.ts --trace off`
(26 passed).
