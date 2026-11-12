# Plan 5 Task 5 report: render integration, parity and the reader audit

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1323 (94 files) | 1332 (96 files; +6 `draw-collect`, +3 `transform-readers`) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| new e2e | n/a | `keyframes-render` 4/4, `keyframes-render-fx` 5/5, `keyframes-parity` 2/2 |
| related e2e (one run at a time, `--trace off`) | n/a | see "E2E runs" below |

Commit: `feat: animate clips in the compositor (preview and export)` (+ this report).

## Design
- `src/render/drawCollect.ts`: the loop is now `for (const raw of visualClipsAt(p, t)) { const clip = resolveClip(raw, t, p.format.fps); … }`.
  Every `Draw` / `AdjustmentDraw` carries the RESOLVED clip, so `compositor.drawPicture` (opacity, `clipMatrix`), the blur-fit
  backdrop (opacity), `applyClipEffects` (effect params), `applyAdjustment` (opacity, effect params), `needsComposite` /
  `blendOf` and `luts.forFrame` read evaluated values without change (D7, plan §3.4). Static clips come back as the same
  object (the resolver's fast path), so a static project renders byte-identically (hash test below). Hidden tracks are
  filtered by `visualClipsAt` BEFORE resolution (counter test). Preview and export share this path (`Compositor.renderFrame`),
  so they evaluate identically; the time is snapped inside `localTime`, so a between-frame playhead shows the frame start.
- `src/render/overlays/textures.ts`: `OverlayTextures.get(clip, format, t, fps, pixelScale, textureScale = clip.transform.scale)`.
  The texture size (and so the cache key) depends on `textureScale`, not on the per-frame scale; `collectDraws` passes
  `maxScale(raw)` (RAW clip: the resolved one has no keys). An animated scale therefore uploads once and is drawn at its
  largest size. New instrumentation getter `uploads`.
- `CompositorStats.overlayUploads` (new, cumulative since creation) and `harnessBlend.renderBlend` returns it per frame.
  `compositor.ts` stays at 195 lines (the stat shares the `overlayTextures` line).
- No other source change was needed: scale 0 already gives a zero-area quad (`clipMatrix` stays finite: no division by the
  scale anywhere in the draw path) and `overlayTextureSize` treats 0 as 1 (finite texture).

## Rulings (proposed for the ledger)
- T5-1 - The overlay texture is sized from `maxScale(raw)` (Task 3 definition: max of the STORED static scale and every scale
  key). A keyed overlay whose ignored static scale is larger than all its keys gets a larger texture than needed (capped at
  2048 px); harmless, and it keeps the Task 3 contract.
- T5-2 - New stat `CompositorStats.overlayUploads` (cumulative). Existing `overlayTextures {count, bytes}` is unchanged (the
  Plan 4 specs `toEqual` it).
- T5-3 - The blur-fit backdrop does not depend on the clip's scale (Plan 4 behaviour), so a blur-fit clip at scale 0 still
  shows its blurred full-frame backdrop; only the picture itself vanishes. "Scale 0 renders nothing" is tested on `fit` clips
  and overlays. Its opacity follows the resolved opacity (animated fades fade the backdrop too).
- T5-4 - The reader audit is line-based: a regex finds `.transform` / `.params` / `.effects` property reads (and destructuring
  `{ … transform … } =`) in `src/render/**` and `src/ui/**`, ignoring comments and `this.effects` members; each finding must
  match an allowlist entry `[file, substring, why]`, and every entry must still match something (no stale entries). Entries
  for UI readers that Task 6/7 must switch to the resolved value are marked "(Task 6 …)" / "(Task 7 …)".

## Tests and mutation checks
- `tests/draw-collect.test.ts` (Node, fake GL/textures, `resolveClip` wrapped in a call counter via `vi.mock`): every draw kind
  (adjustment, image, video, overlay) carries evaluated opacity/scale/effect params and no keys; static clips arrive as the SAME
  object; a hidden track with keys is never resolved (counter = only the visible clip), nor a clip outside its range; the
  overlay texture scale is `maxScale` (3, 3, 3) while the drawn clip's scale animates (1, 2, 1.75); scale 0: `clipMatrix`
  finite, `overlayTextureSize` finite, keys evaluating to 0 reach the draw as 0.
- `tests/transform-readers.test.ts`: the audit (36 entries), every entry has a reason, and the detector itself (read,
  destructuring, optional chain, comment exclusion, dummy read in `compositor.ts` ⇒ unlisted).
- `tests/e2e/keyframes-render.spec.ts`: opacity 0 → 1 linear (128 at 0.5 s) and `easeIn` at 0.25 s (21.00 vs `easeAt` at the
  snapped time 21.04); position centroid at 0/0.5/0.8 s exact (±1 px allowed, 0 measured); hold: frames 14 and 0.499 s at the
  old x, frame 15 (the key's frame) at the new x; scale bbox 50/125/200 px; rotation bbox 160×40, 142×142 (45°), 40×160;
  static scale 0 (image, overlay, with x/y = ±1e7) and keys ending at 0 render all black with glError 0 and no page/console
  errors.
- `tests/e2e/keyframes-render-fx.spec.ts`: keyed colour brightness and keyed blur radius equal the static render of
  `valueAt` (max diff 0); adjustment opacity keys (200,30,30 at 0, 128 grey at 0.5) and adjustment invert-amount keys equal a
  static 0.5 render; overlay with scale keys 1 → 3: 10 frames, one texture of 162² px (bytes constant), `overlayUploads` 1,
  and the frame at the max equals the static scale-3 render byte for byte; a static stack (effects, multiply blend, rotated/
  scaled/translucent clip, adjustment at 0.4, lower third mid-slide) hashes to the values recorded with the PRE-Task-5 code
  (stashed `src/`, same machine), and the same stack with every property keyed to one constant key renders byte-identically;
  a between-frame playhead (7.4/30, 12.9/30, 20.5/30) equals the frame start for keyed transform + effect + adjustment.
- `tests/e2e/keyframes-parity.spec.ts` (30 and 25 fps, 1080p export via the real exporter, ffmpeg frames): a 960×540
  four-colour picture with position (easeOut), opacity, colour brightness (easeInOut) and grain amount keys over a grey
  background. Without grain, per pixel at 4 frames: 0.94-1.13/255 (neighbouring frame 5.4-11.7/255, asserted larger);
  with grain (Ruling T11-1): 8×8 block means 1.07-1.21/255; grain correlation inside the clip's resolved box 0.55-0.88 with
  frame N vs 0.06-0.16 with N + 1.
- RED first: with `src/` stashed (pre-Task-5 code), all 9 new render tests failed (the static-hash test only because its
  literals were not yet recorded; the scale-0 test on its keyed frame, the static scale-0 frames were already black) and
  both unit files failed; the static hashes were recorded from that pre-Task-5 run, then `src/` was restored.
- Mutation checks (each restored): dummy `clip.transform.scale` read added to `src/render/blend.ts` ⇒ audit fails; overlay
  `textureScale` = `clip.transform.scale` instead of `maxScale(raw)` ⇒ unit test fails and the e2e overlay test fails (bytes
  grow every frame, 10 uploads); resolving every clip of every track before filtering ⇒ counter test fails; no resolution
  (`clip = raw`) ⇒ 4 unit tests fail (and the e2e specs, as on the pre-Task-5 code).

## E2E runs (sequential, `--trace off`)
- Batch 1 (58/58, 3.3 min): keyframes-render, keyframes-render-fx, keyframes-migration, compositor, blend, blend-export,
  blend-failure, adjustment, adjustment-alpha, adjustment-app, overlays-render, overlays-export, overlays-app, layers-render,
  images, preview-gl.
- Batch 2 (140/140, 7.3 min): every effects-*.spec.ts, keyframes-parity, export, export-gl, export-ui, pip, pip-drag,
  pip-visibility, overlays-ui, blend-ui, layers-migration.
- The full suite was NOT run (the controller runs it after review, per the task brief).

## Contract for Tasks 6-8
- Pictures: never evaluate keys in `src/render`; `Draw.clip` / `AdjustmentDraw.clip` are already resolved. Anything new in the
  compositor that needs a clip value reads `d.clip` (resolved). Something that needs the keys (like texture sizing) must take
  the RAW clip from `collectDraws` (`raw`), as the overlay texture does.
- UI: Task 6 must switch the allowlisted readers in `TransformFields.tsx`, `TransformOverlay.tsx`, `overlayHit.ts` (its target
  transform), `useTransformDrag.ts` (start/current) and `Preview.tsx` (live preview via `withLiveValue`) to the resolved value
  at the playhead (`resolvedTransform(clip, playhead, fps)`), then update the reasons in `tests/transform-readers.test.ts`
  (`storeTransform` stays a stored-value read on purpose). Task 7: `VideoEffectRow.tsx` (`stored` and the chroma key hex) ⇒
  resolved params (`targetValueAt`). Any new reader in `src/render`/`src/ui` must be listed with its reason or the unit test
  fails.
- Hit testing / handles must use the same resolved transform the compositor draws at the playhead time (the playhead may sit
  between frames: `resolvedTransform` snaps internally, so it matches the picture).
- Stats: `compositor.stats().overlayUploads` is available for Task 11's memory/perf guards.

## Concerns
1. Overlay textures sized for the max scale are minified with LINEAR filtering (no mipmaps) when shown much smaller (e.g. keys
   0.1 → 3): text can alias at the small end. Plan-accepted trade-off (§3.4: stable and sharp at max); a mipmap or a two-size
   cache would fix it if manual QA shows shimmer.
2. T5-3: a blur-fit clip at scale 0 still shows its backdrop (Plan 4 semantics).
3. The static hash literals are SwiftShader-on-this-machine values; if Chromium/SwiftShader changes, re-record them from a
   build without keys (the constant-keys equality and every Plan 4 pixel spec are machine-independent oracles).
4. `maxScale` includes the ignored static scale (T5-1).
