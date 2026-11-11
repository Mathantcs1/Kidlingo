# Task 7 report: blur, sharpen, glow, pixelate (multi-pass)

Status: DONE_WITH_CONCERNS (minor; see Concerns). Commit: `4cdece7 feat: blur, sharpen, glow and pixelate effects`.

## Design

### Sizes (RESOLUTION RULING kept)
- blur/glow `radius`, sharpen `radius` and pixelate `size` are in pixels of a **1080-row reference picture**, like
  grain: working px = value × workingHeight / 1080 (`blurRadius`, `pixelBlock` in `blurMath.ts`; computed on the CPU,
  passed as uniforms/taps). This supersedes D2's "clip pixels × working/display size" (documented in blurMath.ts).
- `pixelBlock(size, h)` is exactly 1 (identity) at size ≤ 1 at EVERY resolution, else `max(1, size·h/1080)`. So at
  2160 rows size 2 is already a 4-px block (size 1 → 2 is a jump there; accepted to keep "size 1 = identity").

### Kernel and tap cap (`blurMath.ts`)
- sigma = radius / 2 (`SIGMA_PER_RADIUS`), truncated at ±3 sigma, renormalised (sum 1 within 1e-6).
- `gaussianKernel(radius)`: `{ offsets, weights }` ascending, symmetric, 0 in the middle. Within the cap (±3σ reach
  ≤ 2 × `MAX_SIDE_TAPS` = 64 texels) LINEAR-SAMPLING taps: pairs (k, k+1) at offset (k·g_k + (k+1)·g_{k+1})/(g_k+g_{k+1}),
  weight g_k + g_{k+1}; with GL LINEAR + CLAMP_TO_EDGE this is EXACTLY the discrete gaussian (unit test expands the taps
  to texels and checks it to 1e-9). Beyond the cap: point taps every s = ceil(reach/32) texels.
- `blurStages(radius)`: stages, each = one H + one V pass. Within the cap 1 stage. Beyond it (sigma > ~21 working px,
  e.g. radius 100 at ≥ 460 rows): a pre-blur stage of sigma_pre = s (recursively the same rule), then the strided stage
  with sigma_main = sqrt(sigma² − s²). The pre-blur's response at the stride's Nyquist frequency is e^(−π²/2) ≈ 0.7 %,
  so strided taps do not alias; variances add to sigma² (unit test: within 3 %, the loss being the ±3σ truncation).
  **Every pass reads ≤ 65 texels at any radius**; worst case 3 stages (radius ≥ ~700 working px), 6 passes.
- Accuracy: CPU reference vs GL ≤ 1/255 in every drift-guard set, including the strided path (radius 100 at 540 rows).
- Blur works on PREMULTIPLIED values; CLAMP_TO_EDGE at the clip picture's edges (edge pixels extend; the clip's
  rectangle never grows).

### Shaders (`shaders/blurFamily.ts`, one program per type, modes by a `u_mode` uniform)
- Taps uploaded as float-array uniforms (`uniform float u_off[65], u_w[65]`, `u_n`): `UniformValue` now accepts a
  `Float32Array` → `uniform1fv` (`uniformCall`); vec length checks unchanged.
- Direction: the fragment declares the vertex stage's `uniform mat3 u_uv`; stepUv = (u_uv · (dir/size, 0)).xy, so the
  first pass, which samples the clip's input through its rotation/mirror uv, blurs along PICTURE axes (rotated-video
  test; mutation without u_uv fails). Where the input texture's resolution differs from the working size (4K video in a
  smaller working size) the linear taps are a close approximation only (documented).
- blur: H, V per stage (2 passes; 4 beyond the cap).
- sharpen (unsharp): blur of the input; last V pass composites on STRAIGHT colour: c + amount·(c − blurredStraight),
  blurredStraight = blurred premultiplied / blurred alpha (alpha-weighted mean: transparent neighbours add no colour, so
  no halo); alpha untouched; clamp 0..1. 2 passes.
- glow: bright pass m = smoothstep(threshold, threshold + 0.1 (`GLOW_KNEE`), luma) → (c·a·m, a·m); its blur; last V pass:
  g = intensity·blurred, a' = clamp(a + g.a(1 − a)), rgb' = min(rgb + g.rgb, a') (additive light, valid premultiplied;
  over transparent areas it is C-coloured light with alpha g.a). 3 passes (5 beyond the cap).
- pixelate: block index floor(fragCoord·invBlock + 1e-4) (float32 reciprocal like grain), samples the pixel nearest the
  block centre (clamped for partial last blocks), anchored at the top-left. 1 pass.
- Strength 0 draws NO pass: blur radius 0, sharpen amount 0, glow intensity 0 or radius 0, pixelate size ≤ 1.

### Third target / pool change (`passResources.ts`, `pipeline.ts`, `types.ts`)
- `TargetPool.pair(size)` replaced by `target(size, avoid)`: per size a ping-pong pair (created together, as before)
  plus an optional SCRATCH target created lazily; returns the first of the pair whose texture is not in `avoid`, else
  the scratch. The pipeline passes `avoid = [current source, the effect's input]`.
- New invariant (all effects): **a pass never writes the texture it samples nor the current effect's input.** For
  one-pass effects this reproduces the old A/B alternation exactly (existing pool tests unchanged). It also fixes a
  latent bug: a multi-pass effect that threw in pass ≥ 2 used to roll back to an input it had already overwritten
  (new unit test was RED on the old code).
- `PassRunner.draw(uniforms, { input: true })` binds the effect's input as `u_input` (next free unit after `inputs`
  textures) with `u_inputX/u_inputY` (its uv rows; identity when it is a working target).
- Memory bound (documented in TargetPool): ≤ 3 RGBA8 targets per working size, ≤ 3 sizes (LRU) ⇒ ≤ 9 × W×H×4 bytes,
  W×H the working size (source size capped at 2× the format's long side and MAX_TEXTURE_SIZE). Worst case 1080p format
  (working ≤ 3840×2160): 99.5 MB per size, ≤ 298 MB in all (was ≤ 199 MB with pairs only). The scratch exists only for
  sizes where a multi-pass effect follows another effect.
- Instrumentation: `EffectPipeline.memory()` / `CompositorStats.effectMemory {targets, bytes}`; the harness
  `renderEffects` returns `memory[]` per frame.

### CPU references (`blurRef.ts`, split from blurMath.ts for the 200-line rule)
`blurRef`, `sharpenRef`, `glowRef`, `pixelateRef` over a premultiplied `FloatImage`, pass for pass as the shaders,
emulating GL LINEAR/CLAMP_TO_EDGE fetches of the same taps and (option `quantise`) the RGBA8 rounding of every stored
intermediate (the composite pass is not stored before compositing, as on the GPU).

## Evidence
- RED unit: `tests/blur-kernel.test.ts` failed to import `blurMath` (no tests ran). RED e2e (written before any shader):
  3 failed / 1 passed — line spread profile `…0,255,0…`, pixelate `passes [] ≠ [1]`, glow `near white at 63,22` not >
  20 (the identity test passed trivially: types not yet available). RED pipeline: `tests/effect-pipeline-input.test.ts`
  4 failed (no `memory()`, no `u_input` rows, rollback test showed the input being overwritten).
- GREEN: `npm test` 71 files / 1022 tests; `npm run typecheck`; `npm run build`; `grep -rl __clipforge dist` empty.
- e2e (one run): effects-blur, effects-blur-reference, effects-colour, effects-looks, effects-pipeline,
  effects-pipeline-robust, effects-lut, compositor, blur — **54 passed**.
- Measured: drift guard (96×540 texture: ramp, hue sweep, checkerboard + white bar; every param alone at min and max,
  defaults, 2 combined sets): blur 1.000, sharpen 1.000, glow 1.000, pixelate 0.000 /255 max. Soft 50 %/15 % edge
  (64×540): GL vs reference straight colour error 0 (×alpha) and alpha within 2/255; blur and sharpen keep the edge
  colour C within 1.5/a + 1 (blur spreads alpha, matching the reference). Rotated phone video (quad-cw90) blur 200 and
  pixelate 150 vs reference on the upright frame: 0.000. 1-px line energy ratio 0.9922 both directions (the 0.8 % loss
  is 8-bit rounding of the tails). Blur 12 then 16 vs blur 20: max 1/255. Radius 100 at 1080 rows (strided): energy
  within 2 %, monotonic tail, half-height still > 0.5 at sigma. 1×1: 3 targets / 12 bytes; 4000×100 (format 2000×50,
  decoded 3840×96): 3 targets / 4 423 680 bytes ≤ bound 4 800 000. Eight blurs: passes 16/frame, memory exactly 3
  targets of 256×48.
- Mutation checks (each reverted): un-normalised kernel weights → 3 kernel tests + line-energy e2e fail (energy ×20);
  blur on un-premultiplied colour → edge test fails ("blur halo at 27,10"); pixelate sampling the block corner →
  12 288 pixels differ; sharpen composite on premultiplied values → edge test fails; glow without the threshold mask →
  "unchanged at 63,152: 16,16,16 vs 0,0,0"; blur step ignoring u_uv → rotated test fails; pool not avoiding the effect
  input → 3 pipeline-input unit tests fail.

## Files (lines)
New: `src/render/effects/blurMath.ts` 105, `blurRef.ts` 118, `shaders/blurFamily.ts` 144, `tests/blur-kernel.test.ts`
115, `tests/blur-ref.test.ts` 97, `tests/effect-pipeline-input.test.ts` 106, `tests/e2e/blur-helpers.ts` 126,
`tests/e2e/effects-blur.spec.ts` 153, `tests/e2e/effects-blur-reference.spec.ts` 106.
Modified: `passResources.ts` 114, `pipeline.ts` 179, `programs.ts` 190 (registry + float arrays), `types.ts` 99,
`compositor.ts` 203 (+3: `effectMemory` stat), `harnessEffects.ts` 71, `videoEffects.ts` (available), tests
`effect-pipeline-run.test.ts` (Uniforms type), `effect-pipeline.test.ts` (unregistered-type checks now use vhs/glitch),
`video-effects.test.ts` (available list).

## Concerns
- `compositor.ts` is 203 lines (+3 for the memory stat); split it before Task 11 adds anything.
- Exact 0/255 GL-vs-CPU agreement (edge, rotated video, pixelate) is what SwiftShader gives; real GPUs filter with
  ~8-bit fractional weights, so the linear-sampling taps can differ by ~1/255 there (still inside 3/255). Untested on
  real GPUs.
- The blur radius → working pixels uses the WORKING height: a portrait 4K format allows working heights up to 7680
  (MAX_TEXTURE_SIZE), i.e. radius 100 → σ 355 → 3 stages / 6 passes of 65 reads at 4320×7680; correct but slow.
- `pixelBlock` jump from 1 to ≥ 2·scale at > 1080 rows (identity rule kept).
- Glow `radius 0` means "off" (no pass) rather than "unblurred bright pass added" (the brief requires identity).
- Tests in `effect-pipeline-run.test.ts` still unregister (delete) the real `blur`/`glow` shaders in `afterEach` for the
  rest of that file; harmless today (module state per file), the new test file restores originals instead.

## Full e2e run (controller's gate)
`npm run e2e -- --trace off` on commit 4cdece7, nothing else running: **311 passed (8.8 min), 0 failed, 0 flaky**, exit 0.
(A first attempt was killed at test 76/311 when the session turn ended, with no failure up to there; this is the complete re-run.)

## Fix round 1 (review of 4cdece7) — commit `752c246 fix: rotated input rows test, pool byte budget, pixelate anchoring test`

### Important 1: u_input rows on a rotated / mirrored input
- e2e (`effects-blur-reference.spec.ts`): the orientation test now runs blur 200, pixelate 150, **sharpen {2, 5}** and
  **glow {0.3, 60, 1}** on `quad-cw90.mp4` AND `quad-cw90-hflip.mp4`, per pixel vs the CPU reference on the displayed
  frame: all 0.000/255.
- Unit (`effect-pipeline-input.test.ts`): uv `[0,1,0,-1,0,0,1,0,1]` (quarter turn + translation) as the first effect's
  input ⇒ uniform3fv rows exactly `[0,-1,1]`, `[1,0,0]`.
- Mutation (rows transposed in `inputRows`): the unit test fails, and the e2e fails on `quad-cw90.mp4 sharpen`. The
  mirrored fixture alone does not catch it: cw90+hflip's uv is a diagonal reflection (a symmetric matrix), so its
  transpose is itself. That is why both fixtures are kept.

### Important 2: pool byte budget
- `POOL_BYTE_BUDGET = 640 MiB`; `TargetPool(gl, max = 3, budget)`. After each `target()` call: drop LRU scratches
  (not the current size's), then evict LRU sizes (never the current one) while the PLANNED bytes (existing targets ×
  W×H×4) exceed the budget. The 3-size LRU is unchanged. `stats()`/`effectMemory` still report the bytes actually
  allocated. A single size whose targets exceed the budget is kept while it is in use (documented).
- RED first (`tests/effect-pool-budget.test.ts`, fake GL): 4 failed before the change (no budget export; after
  17x16: 6400 > 4452; scratch not dropped; the 3x-budget entry check failed). GREEN after it: three alternating sizes stay
  ≤ budget after every call; the LRU scratch goes before any pair (A's pair is reused without reallocating); the in-use
  entry is never evicted, even at 3× the budget; dispose brings the accounting back to 0 and deletes every
  framebuffer.
- Real worst cases (also in the passResources.ts header). 1 target = W×H×4 bytes, with W×H the working size (source
  capped at 2× the format's long side and MAX_TEXTURE_SIZE):

  | format | max working size | per target | one size: pair / +scratch | 3 sizes: pairs / +scratch | with budget |
  |---|---|---|---|---|---|
  | 1080p | 3840×2160 | 33.2 MB | 66 / 100 MB | 199 / 299 MB | 299 MB (under budget) |
  | 4K or portrait 4K | 7680×4320 | 132.7 MB | 265 / 398 MB | 796 MB / 1.19 GB | ≤ 671 MB (640 MiB) |
  | 8K (MAX_TEXTURE_SIZE ≥ 16384) | 15360×8640 | 531 MB | 1.06 / 1.59 GB | n/a | that one size, transiently over budget |

### Important 3 (ledgered for Task 11): Known limit
blurFamily.ts header: blur 100 on a 3840×2160 working size is sigma 100. That means a pre-blur stage of 31 reads and a
strided stage of 61 reads, H and V, so 184 reads per pixel and ≈ 1.5 G fetches per blur. A stack of 8 is
≈ 12 G fetches per frame, which risks the GPU watchdog or a lost context. Candidate fix: run the strided stage at 1/s
resolution. No time guard was added.

### Minors
- (4) The pixelate e2e now uses size 225, i.e. 10-px blocks at 48 rows; on 256×48 the last column and row blocks are
  partial. Mutation (anchored bottom-right): "12288 pixels differ from their block centre".
- (5) blurFamily.ts now documents that the first H pass and pixelate's centre sample use LINEAR filtering when the
  source has more texels than the working size (an accepted approximation).
- (6) The reference spec header notes that the 3/255 guard is calibrated on SwiftShader (≈1/255 more on real GPUs,
  doubled by sharpen amount 2).
- (7) `GlPassProgram.draw` sets `u_input` to unit 0 in every pass without the input (it is a no-op for shaders that do
  not declare it). Fake-GL unit test: u_input is unit 0 in the plain pass and unit 1 in the input pass (RED before:
  `['unset', 1]`).
- (8) `effect-pipeline-run.test.ts` now saves and restores the shipped shaders instead of deleting them.

### Commands
Changed unit tests green. `npm test`: 72 files, 1028 tests. `npm run typecheck` and `npm run build` pass, and
`grep -rl __clipforge dist` finds nothing. e2e (one run): effects-blur, effects-blur-reference, effects-pipeline,
effects-pipeline-robust, compositor: **35 passed**. No full e2e this round (per the controller).
Line counts: passResources.ts 148, programs.ts 192, blurFamily.ts 152.
