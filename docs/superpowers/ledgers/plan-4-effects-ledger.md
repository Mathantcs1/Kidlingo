# Plan 4 (visual effects and looks): decision ledger

Plan: docs/superpowers/plans/2026-11-11-clipforge-plan-4-effects.md (rulings E1-E13 are in the plan). Branch:
`claude/clipforge-plan-4-effects` (not pushed, not deployed). The user approved the plan as written ("approved plan"), so
E1-E13 stand. The lines below record what implementation decided or discovered beyond the plan.

Commit trail: `76d5164` golden images, `c77bea7` T1 split, `db48657` T2 data v4, `38d3b79` T3 schemas/reference/edits,
`3abe50d` T4 pipeline + colour, `0173f49` T5 spatial, `84924a9` T6 stylise, `61fc57e` T7 chroma + LUT, `d2553a9` T8 looks,
`65ea414` T9 effects UI, `48b7cb3` T10 overlays, `6e38186` T11 overlay UI, and the T12 docs/journey commit.

## Rulings made while implementing

Ruling: P1 (T1) Golden images are RGB samples at 96x54 stored as JSON (`tests/e2e/golden/compositor.json`), compared within
+/-1; captured from the pre-split code and committed first. Regenerate only on purpose with `UPDATE_GOLDEN=1`.
Ruling: P2 (T2) `Clip.kind` gained `'overlay'` with `mediaId: ''`; `isPictureClip` replaces ad-hoc kind checks. An overlay
clip always keeps a spec when migrating (a missing/invalid one becomes a default lower third) so no clip vanishes.
Ruling: P3 (T4) Offscreen targets store the image TOP at texture t = 1; every effect shader reads the source through
`src(img)` (image space, v = 0 at the top). Shaders carry a `// fx:<key>` marker; the GL stub fails compiles by that marker.
Ruling: P4 (T4) A clip is "effected" when it has an enabled, available, not-failed effect; otherwise it takes the old draw
path (fast path, guarded by the golden images and by a mutation check).
Ruling: P5 (T5) Blur radius is a Gaussian sigma in source pixels (10-90 % edge width = 2.56 sigma). 17 taps per pass; sigma is
reduced by 2x downsamples until the taps cover about 2.7 sigma, then the result is upsampled again.
Ruling: P6 (T6) RGB split moves red toward +angle and blue toward -angle (total separation = 2 x amount). Glitch `speed` is
how often its pattern changes (frame x speed). Grain noise is zero-mean and weighted down in deep shadows/highlights.
Ruling: P7 (T7) Chroma key spill removal pulls the key's DOMINANT channel down toward the other two (skipped for white-ish
keys); alpha comes from the YCbCr chroma distance. LUT textures are loaded asynchronously in `FxEngine.prepare` before the
synchronous effect stage; a LUT that cannot be loaded is remembered as missing for the session (a transient OPFS error
therefore leaves that LUT off until reload; documented, deferred).
Ruling: P8 (T7) WebGL2 rejects UNPACK_PREMULTIPLY_ALPHA_WEBGL / UNPACK_FLIP_Y for 3D texture uploads, and uploadTexture leaves
them on, so the LUT upload resets them first (found by the GPU test, not by reading).
Ruling: P9 (T8) A look's vignette uses the Vignette effect's default size/softness; its grain uses size 1.5 and colour 0.3.
The CPU oracle covers the grade only; vignette and grain are checked separately.
Ruling: P10 (T9) Colour inputs are UNCONTROLLED (React resets a controlled colour input on every `input` event, so the
picker's `change` never carried the new colour). Found by the overlay UI test and fixed in both inspectors.
Ruling: P11 (T9) Paste REPLACES the target clip's stack (setFxStack). Copy is module state, not undoable and not saved.
Ruling: P12 (T10) The progress bar fraction is frame-quantised: 0 on the clip's first frame and 1 on its last frame, so a
preview frame and the exported frame at the same time agree. Overlay rasters are cached by (spec, pixel size, progress
frame) in an LRU of 32 and sized to the on-screen size in 1.25x steps (capped at 2048).
Ruling: P13 (T10) A format switch keeps an overlay's RELATIVE placement (the customised-clip rule), so a round trip is exact;
overlays are never refit.
Ruling: P14 (T12) The journey compares exported frames with compositor frames block-averaged 8x8 (grain would otherwise
differ because noise cells depend on the render size) and asserts the export differs clearly (mean > 10) from a
no-effects render, so "both lack the effects" cannot pass.

## Defects found by tests during implementation (all fixed)

- T7: LUT upload failed with INVALID_OPERATION because of the leftover premultiply pixel-store flag (P8).
- T11: colour pickers never committed (P10).
- Several test-side defects (wrong expectation for sharpen overshoot, clip-id-dependent grain seeds in a helper, a media
  cache that outlived its page, a hardcoded newer-version number) were fixed in the tests, not the code.

## Deferred / known limits (also in the README)

- Per-clip effects only; no keyframes or animated overlays (Plan 5); user-saved looks; premium extras (light leaks, lens
  flares, anamorphic streaks, halation, gate weave, camera shake, zoom punch, letterbox bars, bokeh, animated stickers).
- RGBA8 intermediate targets (banding under extreme grades); never run on a real GPU; real-Mac/Safari unverified.
- Overlay text is system-font only and length-capped; a LUT load failure is cached for the session.
- `src/ui/styles.css` was not split; new CSS is in `src/ui/fx.css`.
- Older v3 build + v4 save => "saved by a newer version", protected (tested with a v5 save against this build).
