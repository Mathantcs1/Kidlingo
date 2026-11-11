# Task 12 report: overlay clips (data v5) and renderer

Status: DONE_WITH_CONCERNS (see Concerns). Commits:
- `5b39425 feat(render): overlay drawing for lower thirds, subscribe, progress bar and stickers` (spec types, defaults,
  per-field repair, Canvas2D drawing, sticker paths; compiles and passes on its own: 80 files / 1118 tests).
- `08f19b4 feat: overlay clips (data v5)` (clip kind, v5 migration, pure edits, media[] audit, compositor, UI guards).

## Design

- **Model (v5).** `Clip.kind` gains `'overlay'`; `Clip.overlay?: OverlaySpec` with
  `OverlaySpec { type: OverlayType; text; subtext; colour; accent; sticker?: StickerKind }` (as planned; colours
  `#rrggbb` lowercase; `sticker` only on sticker overlays). An overlay clip always has `mediaId: ''`, `effects: []`,
  `blend: 'normal'`, `fit: 'fit'`, `in: 0`, `out: duration`, default `ClipAudio` (unused). `Project.version: 5`.
- **`src/core/overlaySpec.ts`**: `OVERLAY_TYPES`, `STICKER_KINDS` (heart, star, arrow, like, bell, fire, check, sparkle),
  `OVERLAY_LABELS`, `STICKER_LABELS`, `MAX_OVERLAY_TEXT = 80` (code points), `DEFAULT_OVERLAY_DURATION = 5`,
  `overlayDefaults(type)` (fresh object), `isOverlayType`, `isStickerKind`, `hexColour`, `cutText`,
  `toOverlaySpec(raw)` (per-field repair, null for a non-object or unknown type).
- **`src/core/overlays.ts`** (pure): `overlayBaseSize(type, format)` (u = short side: lower third 0.8u x 0.2u,
  subscribe 0.4u x 0.11u, progress bar full width x 0.025u, sticker 0.3u square; integers >= 1),
  `overlayDefaultTransform(type, format)` (margin 0.06u: lower third bottom-left 1.5 margins up, subscribe
  bottom-right, bar flush with the bottom edge, sticker centred; scale 1), `newOverlayClip(type, start, duration,
  format)`, `overlayLabel(clip)` ("Lower third", "Sticker: Fire"), `addOverlayClip(p, trackId, type, start,
  duration = 5)`, `updateOverlay(p, clipId, patch)` (`OverlayPatch` = text/subtext/colour/accent/sticker),
  `reframeOverlay(clip, old, next)`.
- **Drawing** `src/render/overlays/draw.ts`: `drawOverlay(ctx, spec, size, progress, duration = 5)` (the plan's
  signature plus an optional duration, needed because the lower-third slide is timed in seconds),
  `overlayAnimation(type, time, duration)` / `animationAt(type, progress, duration)` (`slide`: smoothstep over
  `SLIDE_SECONDS = 0.4` at both ends; `fill`: time/duration), `OverlayContext` (the subset of the 2D context used, so
  a recording fake works in Vitest), `OVERLAY_FONT` (system stack). Lower third: rounded box in `colour`, accent bar,
  white title + light-grey subtext, text shrunk to 60 % then ellipsised to fit; slides in from the left INSIDE its own
  box (translate + alpha), so it never draws outside its region. Subscribe: rounded button in `colour`, play triangle
  and text in `accent`. Progress bar: track in `colour`, fill in `accent` from the left. Stickers
  (`stickers.ts`): vector paths in a unit square, filled `colour`, outlined `accent`.
- **Textures** `src/render/overlays/textures.ts` `OverlayTextures`: one GL texture per visible overlay clip, drawn on
  ONE shared scratch canvas (OffscreenCanvas, else a canvas element) and uploaded at once. Texture size =
  base size x |scale| x output px per format px, capped at `MAX_OVERLAY_SIDE = 2048` (and MAX_TEXTURE_SIZE)
  (`overlayTextureSize`). Re-drawn only when the key (spec JSON, texture size, slide, fill, duration) changes: the
  progress bar every frame, a lower third while sliding, others once. Clip time is snapped to the project frame
  (`snapToFrame`, as for effects), so preview frame N equals export frame N. Textures of overlays not drawn in a frame
  are deleted in the same frame (`prune`), so memory is bounded by the overlays on screen (worst 16 MiB each, at most
  one per video layer; typical 1080p lower third 0.75 MB). Disposed with the compositor.
- **Compositor**: `visualClipsAt` includes overlays (hidden layers still excluded); `collectDraws` handles an overlay
  BEFORE any media lookup (`DrawContext` gains `overlays` and `pixelScale(format)`); the draw is
  `{ clip, slot, size: base size, texels, uv: UPRIGHT }` and goes through the normal quad path, so position, scale,
  rotation and opacity work exactly like a picture clip. Guards for hand-made projects: `applyClipEffects` returns the
  input for overlays, `blendOf(clip)` (new, `render/clipEffects.ts`) is 'normal' for overlays, the blur fit is never
  drawn for them. `CompositorStats.overlayTextures {count, bytes}`.
- **media[] audit** (every `p.media[...]`/`clip.kind` site in src): overlays are skipped by `audibleClips`
  (no media), decoders (`kind === 'video'` filters in previewRenderer/exportSources), `referencedMedia` (never adds
  ''), `clipsUsingMedia('')` = 0, `reframeProject` (overlay branch), `setClipFit` (refused), `resetClipTransform`
  (back to the default place), `laneRejects` (overlays on video lanes only), `skippedEffectTypes` (overlay effects
  never count), drag `trimTarget` (no source end, like images), fps adoption (not video), detach (not video),
  Inspector/ClipView names. Merge all: `mergeRefusal`/`hiddenLayerClipCount`/`replaceWithMedia` count overlays like
  any clip; the merged export renders them.
- **UI (minimal, Task 13 owns the rest)**: Inspector shows Fit, Blend mode and Effects only for video/image clips
  (`picture` flag), keeps TransformFields for overlays, says "Overlays have no sound."; Inspector and ClipView name an
  overlay by `overlayLabel`. ClipView already gets the class `clip-overlay` from its kind. No data-testid changed.

## Rulings

- Ruling: T12-1 — Migration drops an overlay clip whose spec is not an object or whose type is unknown, or that sits on
  an audio track (it cannot be drawn or placed); every other field is repaired per field (text cut to 80, bad colour
  -> type default, bad/missing sticker -> 'heart', `sticker` removed from non-sticker types, unknown extra keys kept,
  mediaId '' / effects [] / blend normal / fit 'fit' forced). Same treatment as unknown effect types in v4 — cost if
  wrong: a hand-edited broken overlay is lost on the next save.
- Ruling: T12-2 — Overlay size is relative to the format (short side; the bar spans the width) and the transform's
  scale multiplies it; a format switch moves an overlay still at its default place to the new default and keeps a
  customised one's relative position and its scale (its size already follows the format) — cost if wrong: a
  customised overlay's size changes with the format's short side.
- Ruling: T12-3 — `addOverlayClip` refuses a locked target track (it does not silently fall back to a new layer); when
  the unlocked target has no room it adds a new video layer above ALL video layers (overlays belong on top) —
  cost if wrong: the overlay may land above layers the user expected it under (move it with the layer controls).
- Ruling: T12-4 — `drawOverlay(ctx, spec, size, progress, duration = 5)`: the extra optional `duration` is needed to
  time the 0.4 s slide in seconds from `progress` — cost if wrong: none (plan signature still works).
- Ruling: T12-5 — Overlay textures are drawn at the size they are shown at (output px), capped at 2048 px, and freed
  as soon as their overlay is not drawn in a frame (no idle cache): text stays crisp in preview and export, memory
  stays bounded; a 20x sticker on a 4K export is drawn at 2048 and scaled up — cost if wrong: a re-draw when an
  overlay comes back into view (cheap).
- Ruling: T12-6 — Overlay text in the lower third is white/light grey on the `colour` box (only box and accent are
  user colours, as in the spec); text and sticker colours are not separately editable — cost if wrong: a light box
  colour gives poor contrast (Task 13 can warn or pick text colour by luminance).

## Tests

- Unit (RED first: the three new files failed to import; then green):
  `tests/overlays.test.ts` (13: defaults, geometry for 16:9 and 9:16, newOverlayClip, labels, addOverlayClip room /
  new layer / clamped start / refusals: locked, audio track, unknown track, layer limit, NaN, zero/infinite duration,
  unknown type; updateOverlay edits, same-reference no-op, 80-code-point cut, refusals),
  `tests/overlay-audit.test.ts` (8: effects/looks/blend/fit refused with TimelineError; not audible, not a GC
  reference, not a media use; drawn only on visible tracks, skipped-effect list ignores overlays; merge refusal /
  hidden count / replaceWithMedia; split keeps the spec with new ids; lanes; transform fields + reset; reframe round
  trip), `tests/migrate-overlays.test.ts` (6: v4 opens unchanged as v5, idempotent, no mutation; v6 'newer'; valid
  overlay kept exactly; per-field repair; sticker default; drops unknown / audio-track overlays),
  `tests/overlay-draw.test.ts` (10: slide/fill math, clear first, bar rects, lower third parts and slide, one line,
  ellipsis, subscribe, all 8 stickers distinct and inside the texture, determinism). Updated version assertions in
  migrate/model/persist tests and `version: 4` -> `5` in 11 typed fixtures.
- e2e: `tests/e2e/overlays-render.spec.ts` (6): each type lit inside its default box (lower third 100 %, subscribe
  99.8 %, bar 100 %, sticker 38 %) and NOTHING lit outside it (2 px margin), colours of box/accent/button/track/
  sticker within 3/255, white text pixels; progress bar 25.0 / 50.0 / 95.0 % filled (limit +-3 %); lower third right
  edge -1 (t=0), half its width shifted at 0.2 s, full at 1.5 s, almost gone 1 frame before the end, byte-identical
  for the same time (same and fresh compositor), different across times; over an image with opacity 0.5 = exact
  midpoint, hidden layer and out-of-range draw nothing and hold no texture; a hand-made overlay with an invert effect,
  difference blend and blur fit renders byte-identical to a plain one with 0 effect and 0 blend passes; texture side
  54 / 108 (2x canvas) / 2048 (cap).
  `tests/e2e/overlays-export.spec.ts` (1): lower third + progress bar + star sticker over a picture, 25 fps, exported
  vs preview at frames 4, 8, 12: whole frame 1.08-1.34/255 (limit 3), inside each overlay (2 px inset) 0.83-3.92/255
  (limit 6), each overlay clearly present vs the no-overlay render.
  `tests/e2e/overlays-app.spec.ts` (3): inspector has no fit/blend/effects/volume for an overlay and does for an image,
  labels; preview draws sticker and button; `gcMedia` removes nothing; reload restores the tracks exactly (saved as
  v5); a v4 save opens with no notice and is re-saved as v5; Merge all: the merged 1080p frame shows sticker, button
  and background colours. `layers-migration.spec.ts`/`restore.spec.ts`: "newer" is now v6, saved version 5.
- Mutations (each fails, then restored): overlay effect refusal (1 unit), migration forcing (1), audio-track drop (1),
  skipped-effect guard (1), `clipsUsingMedia('')` guard (1), addOverlayClip room check (4), reframeOverlay (1), slide
  translate (1), reset-to-default (1); e2e: overlays missing from `visualClipsAt`, `blendOf` overlay guard, effect
  guard, `prune`, animation state missing from the texture key.

Gate: `npm test` 83 files / 1145 tests; `npm run typecheck`; `npm run build`; `grep -rl __clipforge dist` empty.
e2e (one run at a time, 1 worker, --trace off): run 1 = overlays-render, overlays-export, overlays-app,
layers-migration, restore, compositor, blur, rotation, pip, layers-render, export-gl, images, effects-pipeline, blend,
blend-export, effects-parity: 65 passed, 1 failed (restore.spec's newer-version test still wrote `version: 5`; fixed
to 6). Run 2 = restore, export, inspector, effects-ui, transform-fields, layers-ui, layers-robust-merge,
layers-robust, layers-robust-perf, pip-drag, effects-failure, blend-ui, effects-chroma, effects-pipeline-robust:
74/74. Full `npm run e2e` not run (controller's Task 12 gate).

## Contract for Task 13 (overlay UI)

- Commands: `addOverlayClip(p, trackId, type, start, duration?)` (playhead, active video layer; refusals are
  TimelineErrors for the toast) and `updateOverlay(p, clipId, patch)` (same reference for no-op = no undo step; colour
  inputs give `#rrggbb`); data for menus: `OVERLAY_TYPES`, `OVERLAY_LABELS`, `STICKER_KINDS`, `STICKER_LABELS`,
  `MAX_OVERLAY_TEXT`, `overlayDefaults`; names: `overlayLabel(clip)`.
- Inspector.tsx (150 lines): mount OverlayInspector for `clip.kind === 'overlay'` (the `picture` flag already hides
  fit/blend/effects; TransformFields stays). Detach/audio controls are already hidden (overlays are not audible).
- PiP handles: `sourceSizeFor` in `src/ui/overlayMath.ts` returns null without media, so overlays get no on-canvas
  handles yet: return `overlayBaseSize(clip.overlay.type, p.format)` for overlays (callers pass `p.media[...]`;
  `overlayTarget` needs `p.format`). `resetClipTransform` already resets an overlay to its default place.
- Trimming: like images, an overlay has no source end (`trimTarget` gives Infinity) but its start cannot be trimmed
  earlier than its original start (`in` would go below 0). Task 13 may want to allow that for overlays (e.g. shift
  `in`/`out` together) — pure core change in `trimClip`.
- ClipView: overlay clips already carry the class `clip-overlay` and their label; give them the distinct look.

## Contract for Task 13a (adjustment layers)

- Migration: add an `adjustment` branch to `toClip` in `src/core/migrate.ts` (pattern of the overlay branch: mediaId
  '', keep and repair `effects` via `toClipEffects`, keep `blend`, drop it from audio tracks). Today unknown clip kinds
  are passed through untouched (pre-existing behaviour).
- Render: add the kind to `visualClipsAt` (or handle it separately in the compositor) and branch in `collectDraws`
  BEFORE the media lookup like overlays; `blendOf` keeps the clip's own blend for adjustment clips; `applyClipEffects`
  only skips overlays. `skippedEffectTypes` already scans every clip on visible video tracks except overlays, so
  adjustment clips are counted.
- Core: `pictureClip` in videoEffectEdits refuses only audio and overlay, so effect edits, looks, LUTs and blend
  modes work on adjustment clips with no change; `setClipFit` should refuse adjustment clips too; the placement logic
  of `addOverlayClip` (target track with room, else a new layer above; locked refused) is what `addAdjustmentClip`
  needs — extract a shared helper rather than copying it.
- Audit: the same sites as above (audibleClips, referencedMedia, clipsUsingMedia, reframeProject, decoders) already
  ignore clips without media; `reframeProject` returns a media-less clip unchanged (fine: its transform is ignored).

## Concerns

1. Text is drawn with the machine's system font: the same project can render slightly differently on another
   machine (never between preview and export on one machine). Real Mac/Safari text rendering is unverified (Task 14 QA).
2. `OffscreenCanvas` 2D is used when present (Safari 16.4+), else a canvas element; if neither gives a 2D context,
   overlays are skipped with one console warning and no toast (very unlikely; no notice in the export).
3. Memory: overlay textures add at most 16 MiB per overlay on screen (one per video layer, max 8 layers), freed per
   frame; preview and export compositors each hold their own while an export runs.
4. Splitting an overlay gives two clips that each slide in/out (lower third) and each fill the bar 0-100 % over their
   own length: per-clip animation by design.
5. Dropping undrawable overlay clips in migration (T12-1) loses that hand-edited data on the next save.
6. `src/harness.ts` is still 203 lines (dev-only, untouched); `tests/e2e/layers-migration.spec.ts` is 203 lines
   (version bump only).
7. Not pushed.
