# Task 3 report: Effect pipeline infrastructure

Status: DONE_WITH_CONCERNS (minor; see Concerns). Commit: `f6c482d feat: effect pipeline infrastructure`.

## Design (the contract Tasks 4-9 use)

- **Add an effect** = one module `src/render/effects/shaders/<type>.ts` exporting a `PassShader`, then an entry in
  `PASS_SHADERS` (`src/render/effects/programs.ts`) and flip `VIDEO_EFFECTS[type].available`. Nothing else.
- `PassShader` (`src/render/effects/types.ts`):
  `{ fragment: string; uniforms(params, ctx, size): Record<string, number | number[]>; run?(pass: PassRunner, params, ctx, size): void }`.
  - `fragment` is a full GLSL ES 3.00 shader. It gets `in vec2 v_uv` (v = 0 at the TOP of the picture),
    `uniform sampler2D u_src` (premultiplied), `uniform vec2 u_size` (working px), `uniform float u_time`, `u_frame`,
    and writes `out vec4 outColor` (premultiplied). `gl_FragCoord.y` also grows downwards in the picture.
  - `uniforms` values: number → `uniform1f`, length 2/3/4 → `uniform{2,3,4}fv` (`uniformCall`). No int/sampler/matrix
    uniforms yet (Task 6's LUT sampler will need an extra texture-binding hook).
  - `run` is the multi-pass hook (Task 7 blur): call `pass.draw(uniforms)` once per pass; each draw samples the current
    source and writes the next ping-pong target. Zero draws = unchanged picture. Proven by the harness `invertTwice`
    effect (2 passes, output = input).
- `EffectPipeline` (`pipeline.ts`): `run(input, size /*working*/, uv /*input orientation*/, effects, ctx): TextureSlot`.
  Returns `input` itself with **zero GL calls** when no enabled effect has a registered, working program. Otherwise:
  saves framebuffer/viewport/blend/active texture, disables blend, binds its own VAO (`layout(location = 0) a_unit`),
  runs the passes, restores the state. Pass 1 samples the input through the draw's `uv` (rotation/mirror applied), so
  every working texture is upright.
- **Orientation decision (deviation from "bottom-up + flipV"):** passes draw an UNflipped fullscreen quad, so working
  textures are stored top row first exactly like an uploaded texture; the compositor draws the result with the
  identity uv (`UPRIGHT`) and passes later get `uv = identity`. No flips anywhere; shaders see y-down.
- GL objects (VAO, two `RenderTarget`s) are created lazily on first real use; targets reallocate only on size change
  (`RenderTarget.bind`). `MAX_TEXTURE_SIZE` further caps the working size (`capLongSide`).
- `workingSize(display, format) = capLongSide(display, 2 * max(format.w, format.h))`; `display` is the clip's displayed
  (rotated) source size, so it never upscales; integer (round), never 0.
- `frameIndex(t, fps) = floor(t*fps + 1e-6)` (0 for t ≤ 0, non-finite, fps ≤ 0); `snapToFrame = frameIndex / fps`.
  Compositor: `t_clip = t − clip.start` (timeline time since the clip starts, not source time).
- **Failure policy (D8)** in `programFor(gl, type, onUnavailable)`: programs cached per context (WeakMap); a compile/link
  failure is cached per `PassShader` object for the whole session (all contexts, so an export compositor neither
  retries nor re-notifies) and `onUnavailable(type)` is called exactly once, plus a `console.warn`. If the context is
  lost at failure time it throws `'WebGL context lost'` and caches nothing.
- Compositor: `CompositorOptions.onEffectUnavailable?(type)`; `CompositorStats.effectPasses` (cumulative). Phase 2:
  `applyEffects(d)` → blur backdrop and quad draw both use the processed slot/uv (D7). `EffectContext.lut` returns null
  (Task 6).
- Test-only shaders (`passthrough`, `invert`, `invertTwice`, `gain`, `frame`, `broken`) live in `src/harnessEffects.ts`
  and are registered over real types via `cf.registerTestEffect(type, name)`; `cf.renderEffects` returns frames, pass
  counts, unavailable calls and the error. Harness is dev-only (not in `dist`).

## Evidence

- Unit RED: `npx vitest run tests/effect-pipeline.test.ts` → failed to import `src/render/effects/pipeline` (no tests ran).
  GREEN: 17 passed (workingSize 1080p/4K/720p cap/portrait/1×1/100×4000/fractional, capLongSide, snapToFrame/frameIndex
  for 24/25/29.97/30/60 over 400 frames, uniformCall, same slot + zero GL calls for empty/disabled/unregistered stacks
  via a recording fake GL, failure cached + onUnavailable once across contexts, lost context throws and is not cached).
- e2e RED: with the compositor's `applyEffects` call removed, `effects-pipeline.spec.ts` → 5 failed, 2 passed (the two
  that pass are the disabled-stack and lost-context checks, which by design hold without the pipeline). GREEN: 7/7.
- Mutations: (1) `failed.add(shader)` removed → unit "caches a compile failure" fails and e2e "fails to compile" fails
  (unavailable reported 3×). (2) the `!e.enabled` skip removed → e2e "same slot" fails (passes [1,2] vs [0,0]). Both restored.
- Gate: `npm test` 58 files / 907 tests passed; `npm run typecheck` clean; `npm run build` ok; `grep -rl __clipforge dist`
  and `grep -rl registerTestEffect dist` print nothing.
- e2e (one run): effects-pipeline, compositor, blur, rotation, pip, layers-render, export-gl, images → 36 passed (50 s).

## Files (lines)

- new `src/render/effects/pipeline.ts` 172, `programs.ts` 128, `types.ts` 48, `shaders/passthrough.ts` 15
- modified `src/render/compositor.ts` 143 → 178
- new `src/harnessEffects.ts` 85, `src/harnessPixels.ts` 18 (readPixels moved out of harness.ts); `src/harness.ts` 206 → 201
  (+ `bottom` option for `makePng`/`putImageMedia`)
- new `tests/effect-pipeline.test.ts` 170, `tests/e2e/effects-pipeline.spec.ts` 148
- `drawCollect.ts` and `blur.ts` needed no change (blur receives the processed slot/uv from the compositor).

## Concerns / notes for later tasks

1. `EffectPipeline` constructor is `(gl)`, not `(gl, quad)`: it owns a tiny VAO so `gl.ts` (198 lines) did not grow.
2. Because failures are session-wide, a later export compositor gets no `onEffectUnavailable` call for a type that
   already failed in preview; Task 11's export notice should read a "failed types" list rather than rely on the callback
   (easy to expose from programs.ts).
3. Several clips with different working sizes in one frame reallocate the two shared targets back and forth each frame;
   fine for now, a per-size pool is the fix if Task 11 profiling shows it.
4. A glow-style effect that needs the effect's own input alongside the current source needs a third target (the runner
   only ping-pongs); extend `PassRunner` in Task 7.
5. The test shaders are registered over real types (`invert`, `sepia`); when Tasks 4-9 register those, the spec keeps
   working (registerTestEffect overrides), but it removes nothing afterwards: each Playwright test is a fresh page.
6. Mid-stack context loss is handled by the existing assertUsable/LOST path and the compile-time `isContextLost` check;
   the e2e covers loss between frames, not during a pass.

---

# Fix round 1 (review findings) — commit `1b1101f`

## Changes
- **I1 lost context in run():** `assertNotLost(gl)` (throws `Error('WebGL context lost')`, the `CONTEXT_LOST` string the
  preview matches) runs before saving state, after the passes (a loss mid-stack turns later GL calls into no-ops, so
  the result is garbage), in the per-step error path, and before `TargetPool`/`createUnitQuad` throw their resource
  errors. `restore()` is skipped when the context is lost, so the `finally` can no longer mask the error with a TypeError.
- **I2 source-bounded working size:** `Draw.texels` is the texture resolution in display orientation (images: the
  decoded slot; video: the display size the frame is uploaded at). `effectWorkingSize(display, texels, format)` =
  `workingSize(cappedSize(display, max(texels)), format)`. `workingSize` itself is unchanged and pure.
- **M3 pool:** `src/render/effects/passResources.ts` `TargetPool` holds pairs keyed `WxH`, LRU, at most 3; `dispose` frees all.
- **M4 containment:** each effect step (uniforms/run/uniform setters) runs in a try. A non-lost error calls
  `markUnavailable`: the shader is off for the session, `onUnavailable` is called once, and `out`/`srcUv`/the ping-pong
  index roll back to their values before the step. Lost-context errors propagate.
- **M5:** `unavailableTypes()` in programs.ts (session-wide, failure order; cleared per type by `registerPassShader`)
  and `Compositor.unavailableTypes()`. Task 11's export notice should read this, not depend on the callback.
- **M6:** `capLongSide` removed; `cappedSize` from images.ts is used.
- **M8:** the PassShader contract in types.ts documents float/vec2-4 only (no int/bool/matrix/sampler). The unit test
  checks every test shader's declared uniforms and `uniforms()` values against it.
- Test shaders moved to `src/harnessShaders.ts`, which has no DOM imports so unit tests can load it. New test shaders:
  throwing, throwsMidway, badVector, loseMidway (loses the context through a harness hook between its two passes).

## Evidence
- RED: `tests/effect-pipeline.test.ts`: 4 failed (`effectWorkingSize`/`unavailableTypes` missing).
  `tests/effect-pipeline-run.test.ts` against the old pipeline: 8 failed. The reviewer's failures reproduced exactly:
  "got 'Cannot read properties of null'" and "got 'Could not create framebuffer'", pool 12 reallocations vs 4,
  "Error: bug" / "half way" / "Unsupported uniform of length 5" escaping.
- GREEN: both files 41/41 together with image-cap. `npm test` 59 files / 928 tests passed. Typecheck clean, build ok,
  `grep -rl "__clipforge\|registerTestEffect\|loseMidway" dist` prints nothing.
- Mutations: rollback removed ⇒ unit "rolled back" and e2e "throw" tests fail. Post-loop `assertNotLost` removed ⇒
  unit "lost between two passes" fails, and the e2e silently returned a BLACK frame with no error. Both guards restored.
- e2e in one run: effects-pipeline, effects-pipeline-robust (new: lost mid multi-pass, errors contained/rolled back
  and reported once per session, two image clips at same/different working sizes, one video source shared by two
  clips with effects vs single renders), compositor, blur, rotation, pip, layers-render, export-gl, images ⇒ 40 passed.

## Files (lines)
pipeline.ts 159, programs.ts 158, passResources.ts 72 (new), types.ts 53, compositor.ts 185, drawCollect.ts 95,
harnessEffects.ts 58, harnessShaders.ts 48 (new), tests: effect-pipeline.test.ts 171, effect-pipeline-run.test.ts 155
(new), fake-gl.ts 39 (new), e2e effects-pipeline-robust.spec.ts 109 (new).

## Remaining notes
- RGBA16F not done (ledgered as a known limitation).
- The new e2e spec is a separate file (the original was at 148 lines); include it in the Task 7 full run (it is picked up automatically).
- For a 90/270-rotated video `texels` is taken as the display size, because frames are uploaded at displayWidth/Height.
