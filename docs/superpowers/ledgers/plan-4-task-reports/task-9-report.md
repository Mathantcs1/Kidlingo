# Task 9 report: chroma key

Status: DONE. Commit `8cefa77 feat: chroma key` (not pushed).

## Pre-work (Task 8 review)

- `PASS_SHADERS`, `failedTypes`, `unavailableTypes` and `registerPassShader` moved from `programs.ts` into the new
  `src/render/effects/registry.ts` (49 lines); `programs.ts` re-exports them, so every import keeps working and the
  behaviour is unchanged (programs.ts 198 → 160 lines). Verified green before adding chromaKey.
- Stand-ins: `tests/effect-pipeline.test.ts` gains a file-level `register(type, shader | undefined)` that saves the
  shipped shader and an `afterEach` that restores it. The "unregistered stack" test now unregisters `mirror`; the
  "no registered shader" test unregisters `chromaKey`; the sepia/bw failure-policy tests use the same helper (they used
  to DELETE the shipped sepia/bw for the rest of the file). `tests/e2e/effects-pipeline.spec.ts` unregisters `mirror`
  through `registerTestEffect('mirror', null)`; every e2e test opens a fresh harness page, so no restore is needed there.
- `chromaKey` added to `AVAILABLE_VIDEO_EFFECTS` (all 17 types now available); `tests/video-effects.test.ts` title and
  expected list updated.

## Design (src/render/effects/keyMath.ts, 112 lines; shaders/chromaKey.ts, 42 lines)

Colours are un-premultiplied sRGB 0..1; one pass; output premultiplied `(c' · a·keep, a·keep)`.

- chroma: Rec.709 (Cb, Cr) = ((B − Y) / (2(1 − Kb)), (R − Y) / (2(1 − Kr))) with `LUMA` from colourMath (scales
  `CB_SCALE`, `CR_SCALE` interpolated into the GLSL). Luma is ignored (shadows on the screen key like lit parts).
- `keyAlpha(rgb, key, similarity, smoothness)`: d = |chroma(c) − chroma(key)|; `keep = smoothstep(lo, similarity, d)`
  with `lo = max(0, similarity − smoothness)`, and the ramp never narrower than `MIN_FEATHER` (1e-3). Colours at least
  `similarity` away are kept whole, colours within `similarity − smoothness` are fully keyed out; similarity 0 keeps
  everything (lo = −1e-3 < 0 ≤ d). Defaults (0.35, 0.1) ramp over chroma distance 0.25..0.35 (green ↔ red ≈ 0.99).
- `suppressSpill(rgb, key, amount)`: s = amount · max(0, chroma(c)·chroma(key)) / |chroma(key)|²; c' = clamp(c −
  s·(key − Y(key))). This removes `amount` of the colour's chroma component along the key's chroma direction at constant
  luma. Each channel moves opposite to the key's excess over its own luma, so the key's strongest channel never
  increases; a grey key is a no-op. With a pure green key and amount 1, green always ends between red and blue.
- Single source: `keyCoeffs(params)` gives `u_keyChroma`, `u_edge` (lo, 1/width), `u_spillDir`, `u_spillScale`;
  `keyPixel` / `chromaKeyRef` (premultiplied FloatImage) are the CPU references. `run` draws NO pass when similarity
  and spill are both 0 (exact identity).
- The input is sampled at `v_uv` (the vertex stage already applies `u_uv`), as for colour/looks: a per-pixel effect
  needs no `at()` helper; the rotated-video e2e confirms it is upright.

## Rulings

- Ruling: the smoothness ramp lies INSIDE similarity (lo = similarity − smoothness, floored at 0) so that "similarity 0
  keeps everything" holds at any smoothness and keyAlpha is continuous in both params (an OBS-style outward band would
  key the exact key colour at similarity 0) — cost if wrong: users tune similarity slightly higher than in OBS.
- Ruling: chroma distance is raw Rec.709 CbCr (0..≈1.1), not normalised — cost if wrong: slider feel only.
- Ruling: the "no green fringe" e2e uses spill 1 (green provably between red and blue). At the DEFAULT spill 0.5 the
  measured edge ring reaches G − max(R, B) = 25 on the fixture (half the spill remains); this is logged, not asserted —
  cost if wrong: a default-spill fringe on hard green screens; raising the default (a data default, no migration
  needed for new effects) would fix it.
- Ruling: missing / non-finite params count as 0 (like the other math modules; the data layer always clamps first).

## Evidence

- RED unit: `tests/key-math.test.ts` failed (shaders/chromaKey missing), `video-effects` failed (chromaKey not
  available). RED e2e: with the `chromaKey` registry entry removed, 4/5 of `effects-chroma.spec.ts` failed (the halo
  test passes by design: no pass ⇒ untouched).
- GREEN: `npm test` 75 files / 1062 tests; `npm run typecheck`, `npm run build` clean; `grep -rl __clipforge dist`
  empty. e2e (one at a time, `--trace off`): effects-chroma 5/5, effects-pipeline + effects-pipeline-robust 11/11.
- Measured max |GL − reference|: 0.500/255 (gradient 256×48), 0.529/255 (texture 96×540) over 17 param sets.
  Edge ring G − max(R, B): −31 at spill 1, 25 at spill 0.5.
- Mutations (each restored, each failed a test): spill without `max(0, p)` (unit: key channel / identity), ramp
  without the MIN_FEATHER floor (unit: similarity 0 / NaN), keyPixel alpha without the source alpha (unit), GLSL
  output alpha without `src.a` (e2e halo test), GLSL spill sign flipped (e2e fringe, drift guard and rotated tests).

## Tests

- `tests/key-math.test.ts` (179): chroma range/greys; keyAlpha 0 at the key (4 keys) and near it, 1 far, monotonic
  along lines from the key (random far colours and settings), bounded/finite for 5000 random inputs incl. extremes,
  similarity 0 keeps everything, ramp edges and MIN_FEATHER; suppressSpill never increases the key channel (5000
  random), pure green + amount 1 ⇒ G ≤ max(R, B), luma kept, identities; keyPixel/chromaKeyRef premultiplied; the
  shader registered, one pass at defaults with keyCoeffs as declared uniforms, no pass at the identity, premultiplied
  output with `src.a * keep`.
- `tests/e2e/effects-chroma.spec.ts` (177): new ffmpeg fixture `green-screen.mp4` (160×160 H.264: red 80×80 square, an
  8-px linear red→green ramp, green beyond; `GREEN_SCREEN` in fixtures.ts) over a blue image on the track below: green
  shows exactly blue, the red interior equals the plain render (±3), edge ring G ≤ max(R, B) + 8 at spill 1 with >100
  blended pixels; similarity 0 + spill 0 draws no pass and is byte-identical, similarity 0 with spill renders
  identically over blue and over black (nothing shows through); half-alpha PNG edge (50 %/15 %): alpha ±1.5/255,
  straight colour ±1.5/a, transparent area untouched; drift guard (each param at min and max, defaults, 4 combined sets,
  gradient + texture, ≤ 3/255); rotated phone video (`quad-cw90.mp4`) matches the reference on the plain render and
  only the green quadrant is keyed.

## Concerns / notes for later tasks

- Task 10 (UI): the key colour is three 0..1 params (keyR/G/B); the native `<input type="color">` must map #rrggbb ↔
  the three params in ONE commit (one `updateVideoEffectCmd` patch with all three keys).
- Default spill 0.5 leaves a visible green fringe on hard edges (see ruling); consider default 1 or a "spill" label
  hint in the UI.
- The green-screen spec's first test takes ~22 s (25 600 per-pixel `expect` calls); fine, but a candidate to speed up.
- Exactness measured on SwiftShader only; the steep smoothness-0 ramp (1e-3 wide) could flip a pixel that sits within
  ~1e-6 chroma of the edge on a real GPU (none in the fixtures).
- Task 14 journey: chroma key on an overlay-image layer is covered by the same shader; nothing time-based.
