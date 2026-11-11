# Task 13a report: adjustment layers

Status: DONE (concerns below). Commits:
- `f332d9c refactor: move the blend pass draw out of compositeBuffer`: behaviour-preserving split before extending the
  composite (compositeBuffer.ts 201 -> 182 lines; the GL of one blend pass is `drawBlendPass` in blendProgram.ts, 87).
  Verified: npm test 1160, typecheck, blend + blend-failure + blend-export e2e 9/9.
- `a0ab1ac feat: adjustment layers`.

## Design

- **Model (data stays v5, no bump).** `Clip.kind` gains `'adjustment'`: `mediaId ''`, `effects` (max 8), `blend` and
  `transform.opacity` are used; the rest of the transform is ignored (full frame); `fit` is always `'fit'`; `audio` is the
  default and unused. v5 already means "overlay and adjustment clips may exist" (plan D1 / ledger T2->T12 row), and no
  released build wrote an adjustment clip, so no bump is needed: a v5 file from Task 12/13 builds has none. Before this
  task an unknown kind was passed through untouched by migration and skipped by the renderer; an older build opening a
  file with adjustment clips would show them as "Unknown media" clips that draw nothing (no data loss on load).
  `isSourceless(c)` (model.ts) = overlay or adjustment.
- **Core.** `src/core/placement.ts` `placeOnVideoLayer(p, trackId, clip, wrongTrack)`: the placement extracted from
  `addOverlayClip` (track lookup, video only, locked refused, room on the target else a new video layer above all video
  layers, layer limit). `addOverlayClip` now uses it (same messages). `src/core/adjustment.ts`: `ADJUSTMENT_LABEL`
  ("Adjustment layer"), `DEFAULT_ADJUSTMENT_DURATION = 5`, `newAdjustmentClip(start, duration)`,
  `addAdjustmentClip(p, trackId, start, duration = 5)` (start clamped to >= 0; NaN start / bad duration / audio track
  "Adjustment layers go on a video track" / locked "Track is locked" / unknown track / layer limit are TimelineErrors).
  Effect edits, looks, LUTs and blend modes need no change (`pictureClip` refuses only audio and overlay).
  `setClipFit` refuses ("Adjustment layers have no frame to fit"); `trimClip` treats it as source-less like overlays
  (start may move either way, `in` 0); `laneRejects` names it; `reframeProject` leaves it unchanged (no media).
- **Migration.** `toClip` adjustment branch: dropped on an audio track; `mediaId ''`, `fit 'fit'`, effects repaired by
  `toClipEffects`, blend by `toBlend`, a stray `overlay` key removed, unknown extra keys kept. Idempotent.
- **Render (Ruling P2, no second mechanism).** `visualClipsAt` includes adjustment clips (hidden layers excluded, so
  hiding the track removes the effect). `collectDraws` returns `FrameDraw = Draw | AdjustmentDraw`; an adjustment clip
  becomes `{ clip, adjustment: true }` BEFORE any media lookup (nothing uploaded). `src/render/adjustment.ts`:
  `adjustmentApplies(clip)` (an enabled effect), `needsComposite(d)` (non-normal blend, or an adjustment that applies),
  `applyAdjustment(composite, effects, clip, p, t, format, luts, onUnavailable)`: `backdrop = composite.currentSlot()`,
  `effects.run(backdrop, workingSize(composite.size, format), COMPOSITE_UV, clip.effects, ctx)`, and if the result is
  not the backdrop itself, immediately `composite.blend(blendOf(clip), clip.transform.opacity, { tex, uv: COMPOSITE_UV })`
  (skipped otherwise: a broken/only-disabled stack never blends the composite with itself). The compositor starts the
  composite when `draws.some(needsComposite)`; drawing continues into the new current target for the layers above.
  `clipEffectContext` (clipEffects.ts) is shared by clips and adjustments (same frame-snapped time, LUT lookup). LUTs on
  an adjustment are loaded with the frame (`luts.forFrame` gets every draw's clip). Export and Merge all use the same
  compositor path.
- **Audit.** Not audible (`audibleClips`: no media), not decoded (preview/export decoders take `kind === 'video'` only),
  not a GC reference (`referencedMedia` adds only media ids and effect refs: a LUT on an adjustment IS kept), not a media
  use (`clipsUsingMedia('')` = 0), no on-canvas handles (`sourceSizeFor` null), `skippedEffectTypes` counts its effects
  (already true; now tested). Merge all counts/replaces it like any clip.
- **UI.** OverlayMenu: a separator and `overlay-add-adjustment` ("Adjustment layer", role menuitem) ->
  `addAdjustmentCmd()` in overlayCommands.ts (shares `addAtPlayhead` with `addOverlayCmd`: layer from `overlayTrackFor`,
  ONE apply, selects the new clip, hidden-layer info toast). Inspector: name "Adjustment layer", "Adjustment layers have
  no sound.", Blend mode + Effects shown, Fit hidden, TransformFields with `only={['opacity']}` (label "Layer", no
  Reset). ClipView: label + `clip-adjustment` (violet gradient, dashed border). No data-testid removed or renamed;
  overlays-ui.spec's menu count is now 5.

## Rulings

- Ruling: T13a-1 — An adjustment layer with no enabled effect (or whose only effects cannot run) changes nothing and
  does not start the composite; its blend mode and opacity act only on its processed result (blending the unprocessed
  composite with itself would e.g. square it in Multiply) — cost if wrong: users expecting a "blend only" adjustment.
- Ruling: T13a-2 — Only `transform.opacity` of an adjustment clip is used and editable in the inspector; x/y/scale/
  rotation stay in the data (ignored), no handles, no Reset — cost if wrong: none visible.
- Ruling: T13a-3 — The effect working size of an adjustment is the composite size (viewport, Task 11a budget) capped by
  `workingSize` like any clip; radius-based effects scale by height, so they look the same at preview and export sizes —
  cost if wrong: a large viewport adds one more pipeline pool size per frame (see memory).
- Ruling: T13a-4 — Data stays v5 (no bump): v5 was defined for overlay + adjustment clips; unknown kinds were already
  passed through by migration — cost if wrong: a Task 12/13 build shows such clips as inert "Unknown media" clips.

## Memory

No new targets of its own: the composite is the Task 11a CompositeBuffer (128 MiB budget, freed after 30 idle frames);
the effect run on it uses the effect TargetPool (640 MiB budget) at the composite size, i.e. one more pool size per
frame (a frame with clips at 3 other working sizes thrashes the LRU, Task 7 note). Preview and export compositors each
hold their own while an export runs (as before).

## Tests

- Unit `tests/adjustment.test.ts` (16, RED first on the missing module): placement (room, new layer, clamp, shared with
  overlays), refusals (locked, audio track, unknown track, layer limit, NaN, 0/Infinity duration); effects/look/blend
  allowed, fit refused, overlay effects still refused; not audible / GC / media use / no handles; exporter decodes only
  the video clip; visible-track only; `skippedEffectTypes` counts adjustment glow (not on a hidden track); merge,
  reframe, lanes; trim/split; migration (repair, unknown keys kept, idempotent, v5 kept, dropped on audio);
  `addAdjustmentCmd` one step + select + undo, locked toast with no step.
- e2e `tests/e2e/adjustment.spec.ts` (5, harness, 64x64): B&W adjustment over a red/green layer and a blue square greys
  both (spread <= 2) and equals per-layer B&W within 2/255 while a yellow clip above stays yellow (1/255), blend passes
  0/1/0; before its start, on a hidden track and with only a disabled effect the frame is byte-identical to no
  adjustment (no blend pass); opacity 0.5 = midpoint within 2; invert in Multiply = c(1-c) via blendPixel within 2;
  top->bottom mirror proves the composite is read upright; a broken glow in Multiply changes nothing, 0 blend passes.
- e2e `tests/e2e/adjustment-app.spec.ts` (3): menu adds one (one step, selected, look, label, inspector: blend/effects/
  opacity shown, fit/volume/x/scale/Reset absent), adding B&W greys the preview, before its start still red; Merge all
  keeps the B&W (merged frame grey); export (colour + vignette + mirror, Screen at 0.7, rotated layer below, layer above)
  vs preview 1.66/1.64 per pixel (limit 3) and > 15 from the plain render; a broken glow -> skips
  `{ effects: ['glow'], luts: [] }` and the notice "Exported without these effects (this device cannot run them): Glow.".
- Mutations (each fails, restored from a copy): identity uv instead of COMPOSITE_UV (mirror test), no `out === backdrop`
  guard (broken-glow test), adjustments not starting the composite (4 tests), opacity ignored (midpoint), adjustment
  missing from visualClipsAt, migration branch, fit refusal, skippedEffectTypes limited to video/image, trim
  `isSourceless`, lane message (unit, 1-2 tests each).

Gate: `npm test` 86 files / 1176 tests; `npm run typecheck`; `npm run build`; `grep -rl __clipforge dist` empty.
e2e (one run at a time, 1 worker, --trace off): run 1 = adjustment, adjustment-app, blend, blend-ui, blend-export,
blend-failure, effects-pipeline, effects-failure, effects-ui, effects-parity, overlays-render, overlays-ui, overlays-app,
overlays-export, compositor: 70/70. Run 2 = layers-render, layers-ui, layers-ui-keys, layers-robust-merge, layers-robust,
layers-migration, export-gl, export, inspector, transform-fields, pip, pip-drag, images, restore, blur, rotation,
effects-lut-app: 80/80. Full `npm run e2e` not run (controller's gate).

## Concerns

1. If the blend program cannot compile, adjustment layers are skipped (like blend modes drawing as Normal); the toast
   and export notice still say only "blend modes ... drawn as Normal" (texts unchanged to keep their tests; consider
   mentioning adjustment layers in Task 14). Very unlikely (simple shader), untested on real GPUs.
2. An adjustment frame is composited (not byte-identical to a normal-only render even where the adjustment is a no-op
   visually); only frames without an applying adjustment keep the direct path.
3. Stats: an adjustment's blend counts in `blendPasses` (no separate counter).
4. `tests/adjustment.test.ts` is 204 lines (slightly over the ~200 target). compositor.ts is 195 lines (split before
   extending again).
5. Commit trailers follow the controller's lines (Co-Authored-By Sonnet 5.5). Not pushed.

## Fix round 1 (review: 1 Important, 3 Minor)

- **I1 (Ruling P10).** An adjustment's result now REPLACES the composite below and is lerped by its opacity instead of
  being blended back source-over (which let the unprocessed picture show through partly transparent pixels and grew
  coverage). CPU reference `adjustPixel(mode, backdrop, processed, opacity)` in src/render/blend.ts:
  `res = premultiply(mix(cs, B(cb, cs), w), αs)` with `w = min(1, αb/αs)` (= the reviewer's `B(cb, cs)` wherever the
  backdrop covers the processed pixel, which is the usual αb = αs case; where the backdrop is transparent, e.g. a glow
  spreading out, the processed colour shows as is, like blendPixel over a transparent backdrop), then
  `out = mix(backdrop, res, opacity)`. Same blend program with `uniform int u_adjust` (Ruling P2), set by
  `drawBlendPass(..., adjust)` / `CompositeBuffer.blend(..., adjust)`; applyAdjustment passes true. Opaque pixels give
  exactly what they gave before (adjustPixel = blendPixel there), so the existing adjustment e2e are unchanged.
- **M1.** Toast: "Blend modes and adjustment layers are unavailable on this device; blend modes draw as Normal and
  adjustment layers are skipped."; export/merge notice "... with blend modes drawn as Normal and adjustment layers
  skipped (this device cannot run them)." (effect-unavailable, export-notice, blend-failure updated; adjustment-app does
  not assert these texts).
- **M2.** `resetClipTransform` on an adjustment clip is a no-op returning `p` (opacity kept; the Reset button was
  already hidden for it). `tests/adjustment-transform.test.ts`.
- Tests: tests/blend-math.test.ts +5 adjustPixel cases (red/B&W at α 0.5, opacity 0/0.5/1 and clamping, alpha kept at
  opacity 0, multiply/screen at partial alpha, opaque = blendPixel, transparent backdrop, random premultiplied).
  e2e in a NEW file `tests/e2e/adjustment-alpha.spec.ts` (adjustment.spec.ts is 165 lines; split to stay <= ~200):
  B&W over red at opacity 0.5 with nothing below = grey at half the opaque B&W brightness and = per-layer B&W; the
  partial-alpha edge PNG under an invert adjustment (normal 1, multiply 0.5, screen 0.7, normal 0.5) matches
  adjustPixel within 2/255 at α 1, 128/255, 38/255, 0. Mutations: source-over again (flag false) fails both tests;
  opacity ignored in the GLSL adjust branch fails the second.
- Gate: npm test 87 files / 1182; typecheck; build; dist grep empty. e2e one at a time: adjustment 5, adjustment-alpha
  2, adjustment-app 3, blend 6, blend-ui 3, blend-export 1, blend-failure 2, effects-parity 3, effects-failure 5,
  overlays-render 6, compositor 10, layers-render 5 (all green).
- Remaining: tests/adjustment.test.ts 204 lines, compositor.ts 195 (unchanged; split before extending).
