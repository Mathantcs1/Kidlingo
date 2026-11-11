# Task 11a report: per-clip blend modes

Status: DONE (concerns below). Commits:
- `50a272d refactor: split compositor`: behaviour-preserving. compositor.ts 203 -> 151 lines: public types to
  `src/render/compositorTypes.ts` (re-exported from compositor.ts), the per-clip effect step to
  `src/render/clipEffects.ts` (`applyClipEffects`). Verified: npm test 1080, typecheck, the Task 1 render specs
  (compositor, blur, rotation, pip, layers-render, export-gl, images) + effects-pipeline: 36/36.
- `19562aa feat: per-clip blend modes`.

## Design

- `src/render/blend.ts` (pure): `blendChannel(mode, b, s)` (un-premultiplied 0..1, W3C Compositing Level 1; dodge of
  a black backdrop = 0, burn of a white backdrop = 1), `blendPixel(mode, backdrop, source)` (premultiplied in/out:
  co = cs(1-ab) + cb(1-as) + as*ab*B(Cb, Cs), ao = as + ab(1-as); 'normal' = source-over exactly),
  `BLEND_MODE_INDEX` (index in `BLEND_MODES`), `SOFT_LIGHT_KNEE`, `compositeSize(viewport, maxSide, targets, budget)`.
- `src/render/effects/shaders/blend.ts`: GLSL twin. `const int MODE_*` generated from `BLEND_MODES`/`BLEND_MODE_INDEX`,
  knee from `SOFT_LIGHT_KNEE`; reuses `GLSL_PREMULTIPLY`. `src/render/blendProgram.ts` compiles it (PASS_VERTEX +
  unit quad; backdrop unit 0, layer unit 1).
- `src/render/compositeBuffer.ts` `CompositeBuffer` (Ruling P2, the ONE intermediate composite): ping-pong pair +
  one layer target, all at `compositeSize(viewport)`, created on first use, disposed with the compositor.
  API: `begin(viewport): boolean` (binds current, clears opaque black; false = blend program unusable -> caller
  draws everything as normal), `bindCurrent()`, `currentSlot()`, `beginLayer()`/`bindLayer()`,
  `blend(mode, opacity = 1, layer?: { tex, uv })` (fullscreen blendPixel pass current+layer -> other, swap, leaves
  new current bound, GL blending re-enabled), `present(viewport)` (quad draw onto the canvas viewport, then
  assertNotLost), `idle()`, `stats()`, `dispose()`, `passes`, `COMPOSITE_UV` (reads a composite texture upright).
- Compositor: `composite = draws.some(blend !== 'normal') && composite.begin(viewport)`. Normal-only frames: the old
  code path exactly (canvas clear, letterbox viewport, quad draws), plus `composite.idle()`. Blend frames: normal clips
  draw straight into the bound current target with GL premultiplied-over (same as the canvas path); a non-normal clip
  draws (blur backdrop + quad, with its opacity) into the cleared layer, then `blend(mode)`. Effects run first and
  their pipeline output is drawn immediately (Task 7 note). `BlurBackground.draw` takes a `bindOutput` callback
  (default: canvas at the viewport, so the normal path is unchanged) instead of always binding the canvas.
- Stats: `CompositorStats.blendPasses`, `compositeMemory`.
- UI: `src/ui/BlendModeSelect.tsx` (`blend-mode-select`, 12 labelled modes) mounted in Inspector.tsx just above
  EffectsInspector for non-audio clips; disabled on a locked track (title "Track is locked") or when not editable;
  hidden tracks keep it enabled (as for transform fields). `setBlendCmd(clipId, mode)` in videoEffectCommands.ts
  (clipId-first, `guard(() => apply(setClipBlend))`): one undo step, no step for the same mode, locked = toast.
- `unavailable.ts` not extended: blend is not an effect type. A blend program that fails to compile (not a lost
  context) turns blending off for that compositor with a console.warn; frames then draw as normal (see Concerns).

## Rulings

- Ruling: T11a-1 — A blended clip is rendered as a LAYER (its blur-fit backdrop + picture, with opacity, into a
  transparent target) and then blended full-frame, not by a blend-shader quad: one path that handles the blur fit and
  is exactly what 13a needs (blend an arbitrary texture with opacity) — cost if wrong: one extra clear + fullscreen
  pass per blended clip.
- Ruling: T11a-2 — The composite is the letterboxed VIEWPORT size (not the canvas or the format), budget 128 MiB for
  its 3 targets (3 x 3840x2160 fit); bigger viewports composite smaller and are scaled up on present; targets freed
  after 30 consecutive frames without a blend — cost if wrong: 8K exports with blend modes lose some resolution.
- Ruling: T11a-3 — The backdrop of the first layer is opaque black (the canvas the fast path draws on), so e.g.
  Multiply on the bottom layer gives black and Screen gives the picture — cost if wrong: users may expect blend modes
  on the bottom layer to be a no-op.

## Memory numbers (RGBA8, 3 targets)

1080p viewport (export): 3 x 8.3 MB = 24.9 MB; 4K viewport: 99.5 MB (within 128 MiB); 8K viewport: scaled to fit
128 MiB (4459x2508). Preview canvases are smaller (e.g. 960x540: 6.2 MB). Comes on top of the effect TargetPool
(640 MiB budget) and, during an export, exists in both the preview and export compositors only if both draw blend
frames (the preview frees its own after 30 idle frames).

## Tests

- `tests/blend-math.test.ts` (23): exact values per mode at (0.2, 0.6), (0, 1), (1, 0) (multiply 0.12, screen 0.68,
  difference 0.4, overlay 0.24, dodge 0.5, burn 0, hard light 0.36, soft light 0.2496, exclusion 0.56, ...), extra
  branch points, bounded/finite for random + edge inputs, index table; blendPixel: normal == source-over (random),
  opaque = blendChannel, transparent source keeps the backdrop, half alpha = half-way (no halo), transparent backdrop
  shows the source, premultiplied output bounded; compositeSize caps.
- `tests/video-effect-commands.test.ts` +2: setBlendCmd one step / no-op / undo; locked refuses with toast (RED first).
- `tests/e2e/blend.spec.ts` (5): every mode x 2 colour pairs x opacity 1/0.5 vs blendPixel at 3 points (worst
  1.40/255, limit 2), outside the layer equals the backdrop exactly, blend pass count; half-alpha edge (128/255 and
  38/255 columns) vs blendPixel with straight colour (tol 3), transparent column = backdrop; normal-only frames:
  0 blend passes, 0 composite targets, byte-identical to a fresh render, also after a blended frame, a hidden
  non-normal clip and a non-normal clip outside its range take the direct path; idle release after 30 frames;
  invert + multiply; blended blur-fit clip; 96x64 letterboxed canvas bars; lost context -> "WebGL context lost".
- `tests/e2e/blend-ui.spec.ts` (3): Multiply darkens the preview in ONE step, Screen another, two Undos back to
  Normal; locked track disabled and refused, hidden track editable; no select for audio clips.
- `tests/e2e/blend-export.spec.ts` (1): two layers with colour + vignette and a rotated half-opacity layer in
  multiply/overlay and screen/difference, exported (320 wide) vs preview: 1.59-1.74/255 per pixel (limit 3); and far
  (> 15) from the all-normal render.
- Mutations (each fails): composite path disabled (4 fail), blur backdrop ignoring bindOutput (1), overlay roles
  swapped in GLSL (1), idle release removed (1), dropping the (1 - as) backdrop term in GLSL (3).

Gate: `npm test` 79 files / 1105 tests; typecheck; build; `grep -rl __clipforge dist` empty. e2e (one run, 1 worker,
--trace off): blend, blend-ui, blend-export, compositor, blur, rotation, pip, pip-drag, pip-visibility, layers-render,
export-gl, images, effects-parity, effects-pipeline, effects-failure, inspector, effects-ui, transform-fields,
layers-ui: 96/96. Full `npm run e2e` not run (controller's gate).

## Contract for Task 13a (adjustment layers)

Reuse `CompositeBuffer` (do not add another intermediate target):
1. A frame with an active adjustment clip must start the composite (extend the compositor's `composite` condition:
   any non-normal clip OR any adjustment clip).
2. At the adjustment clip: `const backdrop = composite.currentSlot()`; run the effect pipeline on it with
   `uv = COMPOSITE_UV` and size = `composite.size` (capped by the pipeline as usual); then IMMEDIATELY
   `composite.blend(clip.blend, clip.transform.opacity, { tex: result.tex, uv: COMPOSITE_UV })` (pipeline outputs are
   upright, top row first: COMPOSITE_UV flips target coordinates to them). A pipeline run that applies nothing returns
   the backdrop itself: skip the blend then (blend() must not be handed a composite target).
3. `blend` leaves the new current bound; keep drawing the tracks above with `bindOutput = composite.bindCurrent`.
4. The pipeline pool gains a viewport-size entry (Task 7 note: > 3 working sizes per frame thrash its LRU).
5. Extend `skippedEffectTypes` for adjustment tracks (Task 11 note).

## Concerns

1. A blend program that fails to compile silently (console.warn only) draws blended clips as normal, in the preview
   and the export; no toast/export notice (unlike effects). Very unlikely (simple shader), but untested on real GPUs.
2. Blend frames are not byte-identical to an all-normal render even where every clip is normal-equivalent (they go
   through the composite); only the normal-only path is guaranteed byte-for-byte (by design, per the plan).
3. A native select fires `change` per arrow key on some platforms: each arrow is one undo step (each is a distinct
   committed choice). Real Safari/Mac untested.
4. `src/harness.ts` is 203 lines (dev-only; +2 lines for the blend harness).
5. Not pushed.

## Fix round 1

- Ruling P9 supersedes T11a-3: `CompositeBuffer.begin` clears to TRANSPARENT; `present` draws the composite
  premultiplied-over the black canvas (blendFunc ONE, ONE_MINUS_SRC_ALPHA). A blend mode with nothing below it (lone
  clip, uncovered area) looks Normal; Normal pixels unchanged. blend-ui expectation updated; new blend.spec case
  (mutation-checked: clearing to opaque black fails it). blend-math/blend-export needed no change.
- `CompositorOptions.onBlendUnavailable` (once per compositor, on blend compile failure only). Preview: one toast
  (`BLEND_UNAVAILABLE_MESSAGE`); export/merge: `ExportSkips.blend` adds a notice line. DEV hook `breakBlendProgram`
  (via `setBlendFragmentOverride`), spec `tests/e2e/blend-failure.spec.ts`; `dist/` has no `__clipforge`.
- Leak fixed: ping-pong targets created one by one, first disposed if the second throws.
