# ClipForge Plan 6: editor essentials and product polish (DRAFT for approval, data v11 and v12)

> **Status:** DRAFT. Nothing here is implemented. The user must approve this plan and answer §12 before any task starts.
> **Provenance:** written at production `35b3fc3` (Plan 5 parts 5A-5E all deployed, data v10) from `CLAUDE.md`, `PROJECT_HANDOFF.md`, the 5C/5D plans and a read of the code listed in §2. Line numbers and file sizes must be re-checked at the start of each task.
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, task by task (implementer, then reviewer, fix loop, final whole-part review). Decisions are recorded as `Ruling: P6x-n` lines in a new ledger `docs/superpowers/ledgers/plan-6-ledger.md` BEFORE Task 1 of each part.

**Goal.** Two groups of work. **Group A** (what editors expect next): captions and SRT, text/title upgrades, audio clean-up (remove silences, loudness to a target, voice clean-up preset), export presets, and the two deferred minors from 5C and 5D (transition keyframes, per-point ramp eases). **Group B** (polish): a consistent UI pass with a first-run tour and shortcut hints, a portable `.clipforge` project file and a personal-preset library export/import, and starter templates.

**Hard rules (from the brief and CLAUDE.md).** Local-first: no backend, no AI or transcription service, no data leaves the browser. Never push or deploy without the user's explicit go-ahead in that session; never touch `release/` or the Vercel projects `kidlingo` and `gtm-engineer`. Any breaking data change bumps `Project.version` with a step in `migrate.ts`; a newer version stays unsupported and is never overwritten (`CURRENT_VERSION` is 10 today). Keep every `data-testid`; `window.__clipforge` stays DEV-only (grep `dist/`). Never run `playwright install`. Manual QA of Plans 4-5 on a real Mac is still unrun: this plan claims no browser support beyond what is tested.

---

## 1. Parts, order and data impact

| Part | Content | Data |
|---|---|---|
| **6A** Captions and text | caption clips, SRT import/export, typewriter and stagger reveal, more title templates | **v11** |
| **6B** Audio clean-up | remove silences, loudness normalisation (LUFS), voice clean-up preset | none |
| **6C** Export presets | Shorts/Reels/TikTok 9:16, YouTube 1080p/4K, size or bitrate choice, optional SRT sidecar | none (settings in `localStorage`) |
| **6D** Deferred minors | keyframes for transition parameters, ease editor per speed-ramp point | **v12** (transition keys only; ramp ease is UI-only, keys already carry `ease`) |
| **6E** Project files | `.clipforge` save/open with media, personal-preset library export/import | none |
| **6F** Starter templates | intro, lower-third pack, vertical short | none |
| **6G** UI pass | spacing and states across the inspector, first-run tour, shortcut hints | none |

Order: 6A, 6B, 6C, 6D, 6E, 6F, 6G. Reasons: 6C reuses the 6A SRT sidecar; 6F builds on 6A's templates and 6E's file reader; 6G goes last because the tour and the hints must describe features that exist and it touches almost every inspector (conflicts with parallel work otherwise). Each part is its own branch off the previous tip (`feature/plan-6a-captions`, ...), gated and deployable independently under the same conditions as Ruling P5-2 (the user's explicit go-ahead per push; the gate is in §9). Saves from v11 and v12 are one-way, like v7-v10.

Version policy (Ruling P6-1 proposed): one bump per part that changes the schema, never silently widened later. 6A bumps to 11 (it adds an overlay type, which older builds would DROP as unknown, see `toOverlaySpec`: that is a breaking change, not an optional field). 6D bumps to 12. If the user prefers fewer bumps, 6D may be folded into 6A's branch and ship as v11; this costs the independence of the two parts (question Q2).

## 2. Code read (for the reviewer)

`src/core/model.ts` (Project v10, `OverlaySpec`, `Track.transitions`), `src/core/overlaySpec.ts` and `overlays.ts` (overlay types, per-field repair, drop of unknown types), `src/render/overlays/{textures,draw}.ts` (Canvas2D texture per overlay, re-drawn only when spec, size or animated state changes; 128 MiB per-frame budget), `src/core/migrate.ts` (+ `migrateTransitions.ts`), `src/core/transitionTypes.ts`, `src/core/speedTypes.ts` and `keyTypes.ts` (`Keyframe.ease` exists on speed keys), `src/audio/effects/normalise.ts` (peak-only normalise to the `gain` effect), `src/media/peaks.ts`, `src/audio/presets.ts`, `src/export/{exporter,exportSize}.ts` (`VIDEO_BITRATE` 12/40 Mbit/s keyed by `ExportQuality '1080p'|'4k'`), `src/ui/ExportDialog.tsx`, `src/media/{storage,gc}.ts` (OPFS, verified-restore GC), `src/state/persist.ts` (IndexedDB key `clipforge:current`), `src/core/userPresets.ts` + `state/presetLibrary.ts`, `src/ui/{helpContent*,shortcutCommands,useShortcuts}.ts`.

Facts that shape the plan: there is no text clip; all text lives in overlay clips (`lowerThird`, `subscribe`, ...) drawn as Canvas2D textures. Only the `gain` audio effect measures anything today (source peak, 8-bit peaks). The exporter has one bitrate per quality. Project JSON references media by id; the media bytes are in OPFS only. User presets already live in a library store.

---

## 3. Part 6A: captions and text (data v11)

**Decisions (proposed rulings).**

- **P6A-1 A caption is an overlay clip of type `caption`** (`OverlayType` gains `caption`; spec fields `text`, `colour` (text), `accent` (background box), plus optional new fields below). Rejected: a separate `Project.captions` array (a second timing model: its own move/trim/split/undo/selection/snapshots/export path) and a text clip kind outside overlays (duplicates the overlay texture path). As overlay clips, captions inherit move, trim, split, copy/paste, keyframes, presets, transitions-free track rules, export and preview for free. The cost: v11 and a new overlay type in the repair code.
- **P6A-2 Captions live on a track the user chooses; "Import SRT" creates one new video track ("Captions") on TOP** with one caption clip per cue (`start` = cue start, duration = cue length, snapped to the project frame grid, never overlapping: overlapping cues are shifted/trimmed per rule below). Existing captions can be edited in place: the inspector shows the cue text (multi-line), style, position preset (bottom, centre, top) and size.
- **P6A-3 Caption look:** bottom-centred, safe margin 8% of the frame height, text auto-wrapped to 90% of the frame width at a size in format px (default 5% of the frame height), outline or box background (default semi-opaque box). Font: system font stack, like other overlays (known limit, documented). Max text 200 code points per cue (new constant; the existing 80 limit is for names and titles, `MAX_OVERLAY_TEXT`), up to 3 lines.
- **P6A-4 SRT import (pure parser `core/srt.ts`):** accepts BOM, CRLF, missing index lines, `,` or `.` millisecond separators, multi-line cues, simple tags (`<i>`, `<b>`, `<font>` stripped, never executed), HTML entities decoded; a malformed block is skipped and counted in a report ("Imported 142 cues, skipped 3"). Limits: 5 MB, 5000 cues (refusal beyond). Overlapping cues: the earlier cue's end is trimmed to the later start (reported). Cues of zero length or beyond the project's end are skipped (reported); the timeline is not extended automatically. An offset field (seconds, ±) on the import dialog.
- **P6A-5 SRT export (pure `core/srt.ts` writer):** the caption clips of the chosen track in start order, UTF-8 with BOM-less LF endings, millisecond-rounded, cues numbered from 1; empty-text clips are skipped. A "Download .srt" action in the track menu and a checkbox in the export dialog (6C) to write it next to the video. Round trip test: import then export is byte-identical to a canonical file, and export then import reproduces the clips (frame-snapped).
- **P6A-6 Typewriter and stagger reveal** on text overlays (`lowerThird`, `caption`): `OverlaySpec.reveal?: { mode: 'typewriter' | 'word' | 'stagger'; duration: number }`. `typewriter` reveals characters (grapheme-aware, `Intl.Segmenter` with a code-point fallback) at a constant rate over `duration` seconds from the clip start; `word` reveals words; `stagger` fades each character/word in with a short (0.15 s) alpha and 8% rise, offsets spread over `duration`. A pure function `revealAt(spec, localTime, fps)` returns per-unit visibility/alpha/offset; the overlay texture key includes the reveal frame index so a texture is re-drawn only while revealing (one redraw per project frame during the window, none after: keep the existing re-draw guard). Time maps through `clipTime`, never open-coded. Frame-based, so preview and export match.
- **P6A-7 More title templates:** a template is a preset of `OverlaySpec` fields plus a 5B motion preset (entrance/exit), applied when the overlay is created. Add: Centre title, Big title with subtitle, Quote card, Chapter marker, Corner tag, Outro "Thanks for watching", Caption styles (Classic box, Outline, Karaoke-style highlight bar). Each new template is a pure data entry in `core/titleTemplates.ts` (no new draw code unless a new type is needed: the two draw variants added are `centreTitle` and `quote`, both new `OverlayType`s in the same v11 repair, per-field defaults like the existing four).

**Migration v10 to v11.** Adds nothing to old projects; repairs what is present: unknown overlay types still drop the clip (unchanged rule) except `caption`, `centreTitle`, `quote` which are now known; `reveal` is repaired per field (`mode` unknown ⇒ removed; `duration` clamped 0.1..10, non-finite ⇒ removed). `{version: 12}` stays unsupported.

**Tasks.**
1. Ledger and rulings P6-1, P6A-1..7; split `overlaySpec.ts`/`model.ts` if they cross 200 lines.
2. Version bump v11 + migration + `OverlayType` extension + repair tests (old v10 save opens identically; a v11 file with unknown overlay type still drops that clip only; `{version: 12}` unsupported and not overwritten).
3. `core/srt.ts` parser/writer + property tests (fuzz malformed input never throws; ordering; round trips).
4. Pure edit `importCaptions(p, cues, opts)` creating the track and clips (one `apply`, one undo; locked/limits; frame snapping) + `captionTrackToSrt`.
5. Caption draw (wrap, box/outline, safe margins; `draw.ts` split first) and thumbnails; pixel specs (preview vs export parity at 25/30 fps; text actually drawn at the expected rows).
6. Reveal maths `revealAt` + texture re-draw gate + parity spec; mutation-check the gate (a reveal that never completes, an off-by-one frame).
7. UI: caption inspector (text area, style chips, position), "Import SRT" / "Download SRT" entries (file input, drag-drop of `.srt` onto the timeline), report toast; title template gallery in the overlay menu; Help topic.
8. Journey e2e (import SRT, edit a cue, export MP4, ffprobe + frame grabs at cue times show text, SRT download re-imports) and the part gate.

**Risks.** Many cues = many overlay textures: the per-frame texture budget (128 MiB) and "textures of overlays not drawn are deleted at once" keep this bounded, but an overlapped caption crossfade must not exceed it (test with 3 simultaneous captions at 4K). System fonts differ per machine (documented; the renderer measures with the real font so wrapping is correct per machine, but cue line breaks can differ between machines: accepted, QA item). RTL and complex scripts: rendered through Canvas2D as the browser shapes them; no claim of correct bidi layout beyond what is tested (Arabic and Devanagari smoke render only).

---

## 4. Part 6B: audio clean-up (no data change)

**Decisions.**

- **P6B-1 Remove silences** is a pure edit over a clip (or the selected clips) using the cached waveform peaks (`media/peaks.ts`), not a decode: `findSilences(peaks, {thresholdDb = -40, minSilence = 0.5 s, padding = 0.1 s, in, out})` returns footage ranges. The edit `removeSilences(p, clipIds, ranges, mode)` splits at range edges and deletes the silent pieces; `mode`: **ripple** (default: the remaining pieces close up, in ONE `apply`, honouring other tracks' sync by also rippling the linked picture of a video clip: a video clip with its own audio cuts the picture too; the detached-twin case cuts both clips by the same ranges) or **keep gaps**. A preview (silences drawn on the waveform, count and total removed time) with sliders for threshold, minimum length and padding before confirming. Locked tracks refuse; a clip with speed/ramp/freeze is refused in v1 (ranges are footage seconds and the time map makes ripple ambiguous): "Reset speed first" (Q4). Peaks are 8-bit, so the detector's resolution is the peak bucket size (documented); the test uses ffmpeg-generated fixtures with known silences and asserts each cut is within one bucket.
- **P6B-2 Loudness normalisation to a target LUFS** (default -14 LUFS integrated, presets -14 streaming, -16 podcast, -23 broadcast): a new pure measurement `audio/loudness.ts`, ITU-R BS.1770-4: K-weighting biquads (48 kHz coefficients, recomputed by the bilinear transform for other rates), 400 ms blocks with 75% overlap, absolute gate -70 LUFS, relative gate -10 LU, stereo sum with channel weights. Measured on the CLIP'S AUDIBLE SOURCE RANGE decoded through the existing decode path (`decodeAudioRange`), not on peaks (peaks cannot give LUFS). Result is written as the existing `gain` effect (`gainDb`, clamped to its range, by default a true-peak safety cap of -1 dBTP computed from the sample peak so the gain never clips: if the cap bites the result says so). Applies per clip ("Normalise to -14 LUFS") and to the whole mix ("Loudness of the timeline" measured by the same mixdown path used for export, offline, with a progress bar and cancel; the correction is applied as gain on every audible clip so relative balance holds; refused when the timeline has no audio). The spec measurement is verified against ffmpeg `ebur128` on the fixtures to within 0.5 LU (tests call ffmpeg; this is the oracle).
- **P6B-3 Voice clean-up preset:** one button "Clean up voice" that adds a chain to a clip using existing effects only: highpass 80 Hz, `denoise` (the existing spectral gate, moderate), `eq` (gentle presence +2 dB around 3 kHz, low-mid cut -2 dB at 250 Hz), `compressor` (3:1, moderate), then a loudness normalise to -16 LUFS via P6B-2. Added as the existing effect objects in one `apply` (effects are capped; refused with a toast if the cap would be hit; replaces nothing the user already has). Preset data goes in `audio/presets.ts` next to the existing presets so it also appears in the audio preset list. No new effect type, so no data change.

**Tasks.** (1) ledger + rulings; (2) `findSilences` + `removeSilences` pure edits and tests (fixtures: leading/trailing/middle silence, no silence, all silence, tiny clips, trimmed clips, reversed refusal); (3) silences UI (waveform overlay + dialog + context menu + undo as one step) and e2e that counts cuts and verifies total duration drop and that audio is continuous (ffprobe of the export, no click: check RMS across the joins); (4) K-weighting + gating `loudness.ts` with ffmpeg `ebur128` oracle tests; (5) clip and timeline normalise commands and UI with the true-peak guard; (6) voice preset and e2e (noise-added fixture: measured noise floor drops, loudness lands within 1 LU of target); (7) part gate.

**Risks.** Measuring by full decode is memory and time heavy for long clips: decode in windows and accumulate per-block energies (the same window design as the mixdown; test with a 30-minute synthetic WAV bounded by memory). K-weighting must follow the actual sample rate. Normalising the mix by clip gain does not account for effects that change loudness after the gain (compressor, limiter): the whole-timeline measure is therefore taken from the mixdown, which includes them, and it re-measures after applying (second pass) and reports the final value honestly.

---

## 5. Part 6C: export presets (no data change)

**Decisions.**

- **P6C-1 A preset is `{ id, label, aspect, long side/short side or fit-frame, fps cap?, videoBitrate, audioBitrate, note }`** in `export/exportPresets.ts` (pure). Built-ins: **YouTube 1080p** (the project's orientation fit in 1920×1080, 12 Mbit/s), **YouTube 4K** (3840×2160, 40 Mbit/s), **Shorts / Reels / TikTok 9:16** (1080×1920, 10 Mbit/s, project fps capped at 30, AAC 128 kbit/s, warning when the project is not 9:16: choosing it offers "Switch project to Vertical" (uses the existing reframe) or "Fit with blur bars" (rendered by exporting the project frame inside the 9:16 frame with the blur backdrop; deferred if costly, Q5), **Instagram square 1080×1080**, **Small file (720p, 4 Mbit/s)**. Presets are descriptions only: they choose among values the exporter already supports.
- **P6C-2 Size or bitrate choice:** the dialog gains an "Advanced" section: output size (preset fit / custom long side from 480 to the quality cap, even dims via `evenDims`), video bitrate (Mbit/s, 1-80, default from the preset), and a **target file size** field that derives the bitrate (`size·8/duration − audio`, refused when below a floor of 0.3 Mbit/s with the numbers shown). A live estimate of the file size and a warning for bitrates above what the chosen size warrants. `exportSize` and `VIDEO_BITRATE` become one `exportPlan(project, settings)` pure function returning `{ width, height, videoBitrate, audioBitrate }`, tested for every preset and orientation; the exporter takes the plan instead of `quality`. The test-only `longSide` hook stays.
- **P6C-3** The last-used preset is remembered in `localStorage` (try/catch, per-viewer convenience only); the preset list never alters the project. The optional SRT sidecar (6A) is a checkbox shown only when the project has a caption track; download is a second file from the same dialog.
- **Honest limits:** a bitrate is a request to Chromium's encoder, not a guarantee (the encoder may under-shoot); the dialog says "about", and the test measures the produced file with ffprobe and allows a tolerance (Q6: ±20%). The notes for platforms (Shorts length limit etc.) are NOT stated as facts that can go stale: the preset labels carry geometry and bitrate only.

**Tasks.** (1) ledger; (2) `exportPlan` + presets + tests (size maths, even dims, 9:16 on a 16:9 project, caps, file-size derivation, refusal ranges); (3) exporter takes the plan (existing 1080p/4k output unchanged: the full e2e is the oracle; byte-identical settings for the old defaults); (4) dialog UI (preset select, advanced fields, estimate, SRT checkbox, focus/keyboard behaviour kept; all current testids kept); (5) e2e: export each built-in on a 320 px-equivalent test hook, ffprobe asserts size, fps, codec, bitrate within tolerance; (6) part gate.

**Risks.** `exporter.ts` is 203 lines: split the plan and the sink creation out first. 4K export memory is already a documented risk; a custom size above the 4K frame is refused.

---

## 6. Part 6D: deferred minors (data v12)

**Decisions.**

- **P6D-1 Keyframes for transition parameters.** `Transition.keys?: { softness?: Keyframe[]; amount?: Keyframe[] }` (the only numeric parameters: `softness` for wipe, `amount` for zoom and glitch; `duration`, type and direction stay static: animating duration makes the window non-deterministic and the handle rules unsound). Key times are in TRANSITION-LOCAL seconds (0 at the window start), clamped to [0, duration]; ease from the 5A set restricted to the transition ease subset (no overshoot, same rule as D5 of 5C because softness and amount have hard ranges), values clamped to the parameter's range. A pure `resolveTransition(tr, u)` returns the static fields with the keyed ones evaluated by the existing `keyframes.ts` machinery; `transitionMath.ts` and the shader receive the evaluated values as uniforms (no GLSL change beyond already existing uniforms), so the CPU mirror stays exact. Resizing the duration scales the key times proportionally; reconcile drops keys beyond the clamped duration. UI: the transition inspector shows a diamond per keyable field like the clip inspector (`KeyframeControls` reused through its target interface) and a small strip under the chip; copy/paste of keys is NOT extended (deferred).
- **P6D-2 Ease editor per speed-ramp point.** No data change (speed keys already store `ease`): `setRampKeyEase(p, clipId, keyIndex, ease)` in `speedEdits.ts` (uses `Keyframe.ease`, frame snapping and clamping unchanged) and a UI that opens the existing `EaseEditor` from a ramp point with the 5D eases allowed. The time map is closed-form per cell for the linear case; non-linear eases change the integral. Ruling needed from the 5D maths (Q7): either (a) allow only eases whose speed integral stays closed-form (linear, easeIn/Out quadratic, hold), or (b) numerically integrate with a fixed 64-step Simpson rule per cell and prove monotonic and consistent between `timelineTimeAt` and `sourceAtOffset` (round-trip tests to 1e-9 s). Proposed: (b) with the property test, falling back to (a) if the round trip cannot hold.

**Migration v11 to v12.** Adds nothing; repairs `Transition.keys` per field (unknown fields dropped, keys sorted, clamped, ≤ 64 per field, a keyed field on a type that does not use it removed). `{version: 13}` unsupported.

**Tasks.** (1) ledger and Q7 ruling; (2) bump/migrate/repair tests; (3) `resolveTransition` + math tests + render parity (CPU mirror vs shader within the existing tolerance; preview vs export); (4) edits (`setTransitionKey`, `moveTransitionKey`, `removeTransitionKey`, reconcile on duration change) with undo and lock tests; (5) transition inspector keyframe UI; (6) `setRampKeyEase` + integral tests + UI; (7) gate. The 5C/5D e2e must stay green unchanged (static transitions and linear ramps are bit-identical to v10).

**Risks.** 5C's `transitionMath` and shader are tight: adding evaluated uniforms must keep frames without keys bit-identical (the 5C pixel specs are the oracle). Speed-ramp eases touch the audio time map (`retime`): the live and export planners must use the same map (the existing parity spec is extended with a ramp ease).

---

## 7. Part 6E: project files and the preset library (no data change)

**Decisions.**

- **P6E-1 `.clipforge` is a ZIP** (store-only entries, no compression: media is already compressed) containing `project.json` (the project exactly as saved, `version` included), `manifest.json` (`{ format: 'clipforge', fileVersion: 1, projectVersion, app, created, media: [{ id, name, size, sha256? }] }`) and `media/<id>` files. A tiny pure ZIP writer/reader (`core`-free `src/media/zip.ts`, CRC-32, ZIP64 needed for > 4 GiB: **refused in v1 with a clear message**, Q8) with streaming writes through `FileSystemWritableFileStream`/`showSaveFilePicker` where available and a Blob download otherwise; reading streams entries from the `File` (`Blob.slice`), never loading a whole media file into memory. No dependency is added.
- **P6E-2 Save is "Save project file...", open is "Open project file...", never silently replaces the current project:** opening asks "Replace the current project?" (it is also still in the autosave, and the undo-able "New project" rules apply: the current project is kept recoverable by writing the import as the new current project only after every media file was verified and stored; if anything fails the current project is untouched). Imported media get new ids only when an id already exists with DIFFERENT bytes (size or hash mismatch); then every reference (clips, effect `ref`, transitions are clip-id based and unaffected) is remapped by one pure function `remapMediaIds` with a test over every id-carrying field (`mediaId`, `VideoEffect.ref`). Media missing from the file (the user chose "project only") opens with `missing: true`, as today's relink-less behaviour (relinking is a known gap; a "project only, no media" option is offered with that warning).
- **P6E-3 Safety:** the file's `projectVersion` goes through `migrateProject`; a NEWER one refuses with the existing "saved by a newer version" text and changes nothing; malformed ZIPs, path traversal (`../`), duplicate or unexpected entries, over-size entries (limit 20 GiB total, per entry 4 GiB by ZIP) and a `project.json` that is not a project are refused before anything is written; media bytes are written under the id name only (never a name from the file). Import does not run GC. The verified-restore GC rule and "never delete user media except through the verified-restore GC" are unchanged: no code path in 6E deletes media.
- **P6E-4 Personal-preset library export/import:** `.clipforge-presets.json` (`{ format: 'clipforge-presets', fileVersion: 1, presets: UserPreset[] }`) through the existing library store. Import validates each preset with the same repair as `presetLibrary.ts` (damaged ones are skipped and counted), de-duplicates by content hash, never overwrites an existing preset id (a clashing id gets a new id), caps at the library's existing limit. Export includes selected or all presets. Both go through `Blob` + download / `<input type=file>`: no network.

**Tasks.** (1) ledger; (2) ZIP writer/reader + tests (round trip, fuzzed corrupt headers, traversal, CRC mismatch, ZIP64 refusal, > 2 GiB streaming with a sparse test file that is NOT held in memory); (3) `projectFile.ts` export/import orchestration with rollback, `remapMediaIds` (property test), safety refusals; (4) UI (File menu items, progress, cancel, confirmation, error banners) + e2e (build a project with a real clip, save, clear storage, open, ffprobe the exported render equal to the original's frame hash at two times; open a v11-labelled-as-newer file refuses; open a file whose media collides with different bytes remaps); (5) preset library export/import + e2e; (6) gate.

**Risks.** Size: a 1-hour 4K project is many GiB; saving streams, but browsers without `showSaveFilePicker` build a Blob in memory: gate with a size check and message ("this browser cannot save files this large"). OPFS write failures mid-import: rollback removes ONLY the media files that import itself created and that no history state references (not through the GC; a dedicated, tested `removeCreated`-style path, as `storage.ts` already does for failed imports). Safari support is unverified: say so.

---

## 8. Part 6F: starter templates (no data change)

**Decisions.**

- **P6F-1 A template is a pure function `(project) => project`** (plus a small manifest) that adds tracks and clips made only of sourceless things (overlays, captions, adjustment clips): **Intro** (centre title + subtitle with an entrance preset and a fade, 5 s, an optional accent bar), **Lower-third pack** (3 styled name/title bars, a subscribe button and an outro "Thanks for watching" sequenced on one overlay track), **Vertical short** (switches the project to 1080×1920 via the existing reframe if empty, adds a caption track with style "Classic box", a title card and a progress bar; no media). Templates never carry media (nothing to license or lose) and never touch existing clips except `reframe` when the user confirms. Applying is ONE `apply` (one undo step); the placeholder text is selected for editing.
- **P6F-2 UI:** a "Templates" gallery in the media bin and in the first-run empty state, tiles with live-rendered thumbnails through the existing preview path (no stored images).
- Template definitions live in `core/templates/*.ts` (data, tested for validity by running them through `migrateProject` and `transitionValid`/overlap checks so a bad template cannot ship).

**Tasks.** (1) ledger; (2) template engine + three templates + validity tests (each template result opens through `migrateProject` unchanged and has no overlaps); (3) gallery UI + apply command + e2e with pixel checks (title text visible at the expected frame, vertical format set); (4) gate. **Risks:** text length overflow on small formats (templates use the 6A wrapping); a template applied to a non-empty project must not overlap existing clips (it goes on NEW tracks).

---

## 9. Part 6G: UI pass (no data change)

Scope (the spacing, states and discoverability gaps; the Premiere-style pass already shipped): (1) **Inspector consistency:** one section header component (title, reset, collapse state remembered per section in `localStorage`), one row layout (label column, field, unit, keyed-diamond slot), consistent focus, hover, disabled and mixed-selection states, a shared empty state ("Select a clip"); audit every inspector (`Inspector`, `AudioInspector`, `EffectsInspector`, `OverlayInspector`, `CropFields`, `SpeedFields`, transition and caption inspectors) with a list in the ledger; (2) **tokens:** collapse repeated paddings/colours in `styles.css` (1211 lines, over the guideline) into CSS custom properties and split it per area; no visual regression outside the intended changes (screenshot specs at fixed sizes, reviewed by eye); (3) **first-run tour:** 6 steps (media bin, timeline, preview, inspector, export, Help), keyboard-operable (Esc, arrows, Tab trap like the existing dialogs), skippable, shown once (flag in `localStorage`, try/catch) with "Take the tour" in the Help menu; (4) **shortcut hints:** tooltips on toolbar buttons and context-menu rows show the key from the SAME source as the Help shortcut table (`helpShortcuts.ts` becomes the single registry; a test fails when a registered shortcut has no hint or the hint disagrees with the binding); (5) keep every existing `data-testid` (a script lists them before and after; the diff must be empty plus additions).

**Tasks.** (1) ledger + inspector audit list; (2) shared section/row components, migrate inspectors one per commit with screenshot checks; (3) CSS split and tokens; (4) tour component + store + e2e (shown once, replays, keyboard, never blocks editing when dismissed); (5) shortcut registry and hints + consistency test; (6) accessibility sweep (axe-style manual checks: names, focus order, contrast of the new tokens) and Help updates for all of Plan 6; (7) gate.

**Risks.** Touching every inspector invites regressions in ~550 e2e specs; hence one inspector per commit and the testid diff script. A tour overlay can intercept clicks in specs: it never shows under automation unless a test opts in (a `localStorage` seed in the fixtures; e2e fixtures set the "seen" flag).

---

## 10. Gate (every part; the template from Ruling P5-2)

`npm test && npm run typecheck && npm run build`; `grep -rl __clipforge dist` empty; the e2e specs touched; a FRESH full `npm run e2e` all green (known flakes re-run alone and named); `npm run e2e:preview`; final whole-part review by a fresh opus reviewer and ONE themed fix wave; production (`35b3fc3` or the then-current tip) an ancestor of HEAD; ledger entry. **No push or deploy at the gate: the user's explicit go-ahead is asked for each part.** Every important guard gets a mutation check named in the task report (e.g. SRT overlap trim, the reveal re-draw gate, the true-peak cap, the zip traversal refusal, media-id remap, the "newer version" refusal, the tour once-only flag).

Model policy (P5-8): opus for the migration, SRT/time maths, loudness, zip/rollback, render and the final reviews; sonnet for UI wiring, docs, template data, refactors.

## 11. Cross-cutting risks

- **Scope.** This is about seven parts; each is shippable alone. If anything must be dropped, the order of value per effort is 6A, 6C, 6B, 6E, 6F, 6G, 6D.
- **Overlay texture budget** with captions (6A) and templates (6F): covered by the existing 128 MiB per-frame budget; specs at 4K with many simultaneous overlays.
- **File size limits** (`ExportDialog.tsx` 193, `exporter.ts` 203, `styles.css` 1211, `store.ts` 197, `model.ts` ~190): each part's Task 1 splits before extending.
- **Unverified platforms:** nothing here is claimed for Safari or real Mac Chrome beyond what the e2e measures; each part adds its items to a manual QA checklist (`plan-6a-...` etc.), and Plans 4-5's remain unrun.

## 12. Questions for the user (please answer before Task 1)

- **Q1 Captions as overlay clips (P6A-1)** with a v11 bump. OK? (Alternative: a separate captions array: more code, same bump.)
- **Q2 Version bumps:** 6A = v11, 6D = v12 (two independent one-way steps). Or fold the transition keys into 6A's v11 (one bump, less independent)?
- **Q3 Order and cuts:** the order above; may any part be cut or reordered (e.g. 6D and 6G last or dropped)?
- **Q4 Remove silences** refuses clips with speed/ramps/freeze in v1. Acceptable?
- **Q5 9:16 preset on a 16:9 project:** only "Switch project to Vertical" in v1 (blur-bar fit deferred). OK?
- **Q6 Bitrate tolerance** in tests ±20% (encoder is a request). OK?
- **Q7 Ramp eases:** numeric integration with a round-trip proof (proposed), else closed-form eases only.
- **Q8 `.clipforge` size:** refuse files over 4 GiB per entry (no ZIP64) in v1. OK?
- **Q9 Loudness target default** -14 LUFS with -16 and -23 as choices, true-peak cap -1 dBTP. OK?
- **Q10** After approval: one branch per part off the previous tip, deploys only on your explicit go-ahead per part (P5-2 style). Confirm.
