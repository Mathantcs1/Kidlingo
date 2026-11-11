# Task 6 report: `.cube` LUT import and the LUT effect

Status: DONE_WITH_CONCERNS (minor; see Concerns). Commit: `e991cd9 feat: .cube LUT import and LUT effect`.

## Design

### Parsing and import
- `src/media/cube.ts` (pure): `parseCube(text)` → `{ size, data: Float32Array (size³×3, red fastest), domainMin,
  domainMax, title? }`. Tolerates CRLF/CR, whole-line and trailing `#` comments, blank lines, leading spaces,
  `TITLE "…"`, unknown UPPER_CASE keywords before the colour rows; honours `DOMAIN_MIN`/`DOMAIN_MAX` and
  `LUT_3D_INPUT_RANGE`. `CubeError` messages (plain English, pinned by tests):
  1D (`LUT_1D_SIZE`), size outside 2..65 (incl. 1, 66, 128), non-integer size, missing size (incl. empty file), wrong
  row count ("should have 8 colour rows for its size (2) but has 7."), a row that is not three plain finite numbers
  (`nan`, `NaN`, `Infinity`, `1e999`, `abc`, 2 or 4 values, `0,0,0`; names the line), a keyword after rows started,
  bad DOMAIN line, DOMAIN_MIN ≥ DOMAIN_MAX. `assertCubeBytes`: files over 40 MB are refused before reading.
- `src/media/lutImport.ts` `importLut(file)`: size check → parse → `putMedia(newId, file)` (the ORIGINAL file);
  returns `{ kind: 'lut', name: TITLE ?? file.name, duration: 0, hasAudio: false }`. A refusal throws
  `ImportError('Could not import <name>: <CubeError message>')` before anything is stored; a failed write is cleaned
  up by putMedia. `classifyFile` names `*.cube` (any case, any MIME) `{ kind: 'lut' }` and `importFile` dispatches it
  to `importLut` (so a `.cube` dropped on the media bin also imports, hidden from the bin list).
- Entry point (Task 10 builds the picker on it): `src/ui/lutCommands.ts` `importLutFiles(files)` → one `apply(addMedia)`
  per file, refusals as error toasts. Dev hook (DEV only): `window.__clipforge.importLutFiles`, `removeMediaItem`,
  `gcMedia`. Harness: `cf.importLutText(text, name)`; `cf.renderEffects` also returns `lutUnavailable: [id, name][]`.

### Extended PassShader contract (types.ts, documented there)
- `PassShader.inputs?(effect, ctx): PassInputs | null`, `PassInputs = { textures: Record<samplerName, PassTexture>;
  uniforms?: Uniforms }`, `PassTexture = { target: 'TEXTURE_2D' | 'TEXTURE_3D'; texture }`.
- Called once per frame per effect (inside the effect's try, so a throw is contained as before). Textures are bound to
  units 1, 2, … in key order for each pass (`uniform1i(sampler, unit)`), unbound after the pass, unit 0 re-selected.
  `inputs.uniforms` merge into each pass's own uniforms. `null` ⇒ the effect is skipped this frame (no pass) and is
  NOT marked unavailable. Every existing shader is unchanged (no `inputs`).
- `EffectContext.lut(ref)` now returns `LoadedLut { texture, size, domainMin, domainMax } | null` (synchronous).

### LUT shader + CPU reference
- `shaders/lut.ts`: un-premultiply → `x = clamp((c − u_dmin)·u_dscale)` → `texture(u_lut, (x(n−1)+0.5)/n)` with
  `n = textureSize(u_lut,0).x` → `clamp(mix(c, graded, u_intensity))` → re-premultiply. `uniform highp sampler3D`.
- `lutMath.ts`: `lutDomain` (shared by the shader's uniforms and the CPU), `lutCoord` (half-texel), `lutSample`
  (GL LINEAR/CLAMP_TO_EDGE trilinear: texel = u·n − 0.5, red fastest), `lutPixel(c, lut, intensity)`.
- Precision: RGB16F texture uploaded from the Float32Array (filterable in WebGL2 core; ~11-bit mantissa, keeps values
  outside 0..1); if the upload raises a GL error, RGBA8 fallback (8 bits per lattice value, clamped). Upload turns
  `UNPACK_FLIP_Y_WEBGL`/`UNPACK_PREMULTIPLY_ALPHA_WEBGL` off (3D uploads refuse them; the compositor's image uploads
  set them) and restores them plus `UNPACK_ALIGNMENT`.

### Prefetch (async-free draw phase)
- `LutTextures` (`luts.ts`, one per compositor): `get(id)` / `loaded(id)` load→parse→upload once per media id, in-flight
  loads shared; a missing/unreadable/invalid file resolves to null, is reported once (`onUnavailable(id)` +
  `console.warn`) and is never retried; `forFrame(p, clips)` loads the LUTs of every ENABLED lut effect of the clips
  and treats a ref to absent / `missing` / non-`lut` media as unavailable without touching storage; `dispose()`.
- Compositor Phase 1: after `collectDraws`, `this.frameLuts = await this.luts.forFrame(p, draws.map(d => d.clip))`;
  Phase 2's `ctx.lut` reads that map. Because `renderFrame` awaits Phase 1, BOTH preview and export wait for the LUT
  on the first frame that needs it: the export never encodes an ungraded frame (tested on frame 0), and the preview
  does not flash ungraded either. New `CompositorOptions.onLutUnavailable(mediaId, name)`; the preview wires it to an
  error toast `The LUT "<name>" could not be loaded, so its effect is skipped.` (`lutUnavailableMessage`, once per LUT
  per preview compositor). The exporter passes no callback yet (console.warn only; Task 11's export notice).

### GC / in-use
- GC protection already held (a LUT is in `p.media` of the history states); `referencedMedia` now also adds every
  clip effect `ref`, so a hand-edited state with a dangling ref still protects the file (unit test).
- `clipsUsingMedia` counts a clip whose effect stack (enabled or not) references the media. The media bin's existing
  behaviour for used media is NOT a refusal: it asks to confirm and removes the clips too. Doing that for a LUT would
  delete footage, so Ruling: removing a LUT that a clip uses is refused (`removeMediaFromProject` throws
  `TimelineError('Cannot remove <name>. It is used by 1 clip on the timeline.')`), using the existing in-use sentence,
  now shared as `usedByText(n)` by the confirm dialog and the refusal; `removeMediaItem` skips the confirm for LUTs
  and lets `guard` toast the refusal. An unused LUT is removed normally (never removes clips).

## Evidence
- Unit RED (before implementation): cube.test/lut-math.test/effect-pipeline-inputs.test failed to import their modules;
  lut-usage.test 4 failed (in-use count 0 vs 2, removal not refused, GC missing the effect ref, `.cube` → null).
- e2e RED: with the `lut` shader unregistered, effects-lut.spec 3 failed (drift guard, halo, export); with
  `ctx.lut = () => null` (Task 3 state) drift guard and export failed.
- GREEN: `npm test` 67 files / 993 tests; typecheck clean; build ok; `grep -rl __clipforge dist` and
  `grep -rl "importLutText\|registerTestEffect" dist` print nothing.
- e2e, one at a time: effects-lut 5/5, effects-lut-app 3/3, import 6/6, restore 6/6, effects-colour 5/5,
  effects-pipeline 7/7, effects-pipeline-robust 4/4; also compositor 10/10, images 1/1, effects-looks 8/8, session 9/9.
- Measured max |GL − lutPixel| over every pixel of the 256×48 gradient: identity 17³ 0.000, invert 2³ 0.000,
  swap+gamma 17³ 0.545, swap+gamma 17³ @0.5 0.526, swap+gamma 9³ with DOMAIN ≠ 0..1 0.528 (/255). Alpha edges (50 %/15 %)
  within 1.5/alpha, alpha within 1.5/255, transparent untouched. Export frames 0 and 5 within 8 levels of the inverse.
- Mutations (each fails, then restored): shader without half-texel (identity 7/255 → drift guard fails); shader lookup
  `.bgr` (blue fastest) → drift guard fails; no un/re-premultiply → halo test fails; prefetch not awaited → export
  frame 0 ungraded (40,129,200 vs 215,125,55); CPU blue-fastest index or no half-texel → 6-7 lut-math tests fail;
  parse reversing channels → 3 cube tests fail; no load cache → 3 LutTextures tests fail; notice not deduped →
  forFrame test fails; GC ignoring effect refs / in-use ignoring effect refs → lut-usage tests fail.

## Files (lines)
New: `src/media/cube.ts` 113, `src/media/lutImport.ts` 25, `src/render/effects/lutMath.ts` 65, `luts.ts` 131,
`shaders/lut.ts` 31, `src/ui/lutCommands.ts` 33; tests `cube.test.ts` 122, `lut-math.test.ts` 78, `lut-usage.test.ts` 66,
`lut-textures.test.ts` 100, `effect-pipeline-inputs.test.ts` 76, e2e `effects-lut.spec.ts` 141,
`effects-lut-app.spec.ts` 114, `lut-helpers.ts` 44.
Modified: `types.ts` 84, `programs.ts` 184, `pipeline.ts` 163, `compositor.ts` 200, `videoEffects.ts` (lut available),
`gc.ts` 53, `fileKind.ts` 118, `import.ts` 118, `edits.ts` 205, `projectCommands.ts` 68, `main.tsx` 63 (dev hook),
`previewRenderer.ts` 165, `Preview.tsx` 135, `harnessEffects.ts` 68, `tests/video-effects.test.ts` (available list).

## Concerns
1. `src/ui/edits.ts` is 205 lines and `compositor.ts` exactly 200: the next addition to either should split first
   (e.g. media edits out of edits.ts).
2. Ruling needed/confirmed: used-LUT removal is a refusal (not the confirm+cascade used for footage); message
   `Cannot remove <name>. It is used by N clip(s) on the timeline.`
3. A LUT that failed to load is cached as failed for the compositor's lifetime (never retried); the preview gets a
   fresh compositor on remount/Try again. Export shows no LUT notice yet (Task 11).
4. Importing `.cube` through the media bin's Import/drop works (hidden LUT media, no info toast); the bin's file input
   `accept` was left unchanged for Task 10.
5. `forFrame` loads LUTs sequentially (one await per distinct LUT on its first frame only); fine for typical stacks.

---

# Fix round 1 (review findings) — commit `91fcde2`

## Changes
- **Important, bounded messages:** `quoteLine(line)` in cube.ts strips control/replacement characters
  (`\p{Cc}`, U+FFFD) and keeps at most 40 characters (then `…`); it is the only place file text enters a CubeError
  (the size message quotes a parsed number, never raw text). New `src/ui/importMessage.ts`: `importMessage(file, e)`
  (moved out of MediaBin, now shared by the media bin and `importLutFiles`) caps every import toast at 300 characters
  (`MAX_IMPORT_MESSAGE`); `askPersist` moved there too.
- **(2)** `TITLE` is parsed from the raw line before `#` comments are stripped (`TITLE "Film #3"  # c` → `Film #3`;
  unquoted titles still drop a trailing comment). `TITLE` must be followed by a space or end of line.
- **(3)** A `LUT_3D_SIZE` line after the colour rows: "The LUT_3D_SIZE line must come before the colour rows."
- **(4)** `upload` checks `getError()` after the RGBA8 fallback; if that failed too it deletes the texture and throws;
  `fetch` turns that into `fail(id)` (null, one notice, effect skipped), or a silent null if the context was lost.
- **(5)** `importLutFiles` calls `askPersist()` after each successful import (once per page, shared with the bin).
- **(6)** `forFrame` first evicts cached LUTs (texture deleted, failure memory cleared) whose media is neither in
  `p.media` nor referenced by any effect of `p`; a load evicted mid-flight does not upload (`current()` check). Media
  still in the table (an undo away) is kept even if no clip uses it now.
- **(7)** `clipsUsingMedia` / `usedByText` / `removeMediaFromProject` moved to `src/ui/mediaEdits.ts` (30 lines) and
  re-exported from `edits.ts` (205 → 182 lines); no import site changed. compositor.ts untouched.

## Evidence
- RED: `npx vitest run tests/cube.test.ts tests/lut-textures.test.ts tests/import-message.test.ts` → 6 failed
  (40-char quote, 5 MB line / binary message length and control characters, TITLE with `#`, size after rows,
  fallback failure, eviction) and import-message.test could not import its module.
- GREEN: `npm test` 68 files / 1001 tests; typecheck clean; build ok; `grep -rl __clipforge dist` empty.
- e2e one at a time: effects-lut 5/5, effects-lut-app 4/4 (malformed test now also imports a 3 MB one-line file
  with a control character and checks the toast quotes exactly 40 `q`s + `…`; new test: persistent storage asked once
  after the first successful LUT import, not after a refused one), import 6/6, restore 6/6, layers-robust-merge 2/2,
  session 9/9 (the bin's persist test, after moving askPersist).
- Mutations (each fails, then restored): no `askPersist` in importLutFiles → e2e persist test fails; unbounded quote →
  e2e malformed test and 2 cube unit tests fail; no 300 cap → import-message test fails; no eviction → eviction test
  fails; fallback failure unchecked → OOM test fails.

## Files (lines)
cube.ts 132, luts.ts 158, new `src/ui/importMessage.ts` 26, new `src/ui/mediaEdits.ts` 30, edits.ts 182,
MediaBin.tsx 162, lutCommands.ts 27; tests cube.test.ts 154, lut-textures.test.ts 133, new import-message.test.ts 21,
e2e effects-lut-app.spec.ts 137.

## Remaining notes
- compositor.ts stays at 200 lines (left for the Task 11a split as instructed).
- A LUT evicted after a failure notifies again if the same media id comes back into the project (deliberate: it is
  a fresh attempt).
