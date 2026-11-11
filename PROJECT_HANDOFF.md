# ClipForge: project handoff

Written at the end of a long Claude Code session so the next session can continue without losing context.
Read this file first, then `CLAUDE.md` (short operating rules), then the pointers in section 12.

## 1. What this is

**ClipForge** is a local-first, in-browser video editor for a YouTube/Instagram creator (the user, Mathan, mathanagururaj.s@gmail.com).
React 19 + TypeScript + Vite, no backend. Imported media lives in the browser's OPFS, the project JSON in IndexedDB.
Editing, preview (WebGL2) and export (WebCodecs → H.264/AAC MP4) all run client-side. Nothing is uploaded anywhere.

The user asked for: a Mac-friendly editor for mixed YouTube content with MP4 import/export, merging videos, effects
and premium looks for Instagram/YouTube, animation controls, separate audio tracks with their own cuts and effects,
and a multi-layer timeline. It is hosted on Vercel. Building is staged into plans (see section 8).

## 2. Where everything lives (READ THIS, it is easy to get wrong)

| Thing | Location |
|---|---|
| Code (working copy) | `/home/user/clipforge`, its own git repo (NOT a subfolder of Kidlingo) |
| Remote | only `kidlingo` → `https://github.com/Mathantcs1/Kidlingo` (an **orphan branch** holds ClipForge) |
| Deployed branch | `claude/macos-video-editor-lzye6c` on that remote = what Vercel serves |
| Live site | https://clipforge-indol-tau.vercel.app (Vercel Authentication is OFF, public) |
| Vercel | team "Mathan's projects" (`trade-journal-mathan`, `team_DwaxJujNZSykp0iwygdhXN0h`), project `clipforge` (`prj_DJABs4FyofqDa7l13HvANO0M0dq7`), framework preset is Next.js but `vercel.json` in the repo overrides to Vite |
| Local branches | `main` (only the early spec/plan docs), `build/foundation` (Plan 1 + hotfix, **deployed**), `feature/layers` (Plan 2; **now deployed to production**: its tip `4031ea7` is on `claude/macos-video-editor-lzye6c`; local name `claude/clipforge-plan-2-layers` in the Plan 3 checkout), `claude/quirky-cannon-7vz48u` (Plan 3 audio editing on top of Plan 2, **implemented, not pushed, not deployed**) |

Important facts:
- **Do not use `/home/user/Kidlingo/CLAUDE.md` or its Fairshare code for ClipForge.** Kidlingo is an unrelated expense-splitting app
  in the same GitHub repo; ClipForge only borrows that repo as a remote because the session had no other writable one.
- **A push to `claude/macos-video-editor-lzye6c` redeploys production** (Vercel auto-builds that branch) and ALSO triggers a preview build on the
  user's separate Vercel project `kidlingo` (harmless, different project). Never push without the user's go-ahead.
  At the time this was first written the remote branch was at `1ab3564`; Plan 2 has since been deployed (remote tip `4031ea7`). Plan 3 descends from it, so a push of `claude/quirky-cannon-7vz48u:claude/macos-video-editor-lzye6c` fast-forwards (only on the user's go-ahead).
- The existing Vercel projects `kidlingo` and `gtm-engineer` belong to unrelated apps. Never change their settings or production.
- The sandbox cannot reach vercel.com directly; Vercel is reachable only through the Vercel MCP tools (when connected). Git pushes to GitHub work via the git proxy.
- Stop-hook feedback ("uncommitted changes, commit and push") fires while subagents are mid-task. It is not an instruction to push; see `CLAUDE.md`.

## 3. How to run and verify

```
npm install
npm run dev            # vite dev server, http://localhost:5173 (also /harness.html, a dev-only test page)
npm run build          # tsc -b && vite build (prebuild copies third-party licences into public/licenses)
npm test               # Vitest (node env), tests/*.test.ts
npm run typecheck      # tsc -b
npm run e2e            # Playwright against the dev server (headless Chromium), tests/e2e/*.spec.ts
npm run e2e:preview    # Playwright against `vite preview` of the production build (1 spec)
```
Environment facts that matter:
- Playwright uses the pre-installed Chromium (`/opt/pw-browsers/chromium`, override with `PW_CHROMIUM_PATH`); NEVER run `playwright install`.
  Launch args: `--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader` (software WebGL2).
- Headless Chromium has WebCodecs H.264 encode/decode and AAC *decode* but **no native AAC encoder**; the exporter falls back to the
  WASM `@mediabunny/aac-encoder` (so tests exercise that path; native AAC on Mac Chrome/Safari is untested here).
- WebCodecs/OPFS need a secure context (localhost or HTTPS); `about:blank` has none.
- `ffmpeg`/`ffprobe` 6.1 are installed; e2e fixtures are generated into `tests/e2e/.fixtures/` (git-ignored) by `tests/e2e/fixtures.ts`.
- The e2e dev-server output shows a few forwarded `console.error` lines from tests that deliberately stub WebGL failures; they are expected.

## 4. Test results

**Plan 3 (branch `claude/quirky-cannon-7vz48u`, written at Task 10):**
- Vitest: **813 tests passed, 55 files** (`npm test`). `npm run typecheck` clean, `npm run build` OK, `grep -rl __clipforge dist` prints nothing.
- Playwright e2e: the full-suite count and the final-review result are recorded by the controller in `docs/superpowers/ledgers/plan-3-audio-ledger.md` (see ledger). The new journey spec `tests/e2e/audio-journey.spec.ts` passes alone (~15 s).
- Nothing from Plan 3 has been heard in a real browser: run `docs/superpowers/ledgers/plan-3-manual-qa-checklist.md` in desktop Chrome on a Mac.

**Plan 2 (end of the Plan 2 session, tip `9962ea8` on `feature/layers`):**
- Vitest: 650 tests, 41 files. Playwright e2e: 188 passed (5.0 min). `npm run e2e:preview`: 1 passed (production bundle incl. the lazily loaded WASM AAC chunk exports a real MP4).
- The deployed `build/foundation` tip (`1ab3564`) passed 415 unit + 114 e2e + 1 preview before it was pushed.

## 5. Features shipped

### Plan 1 (foundation, deployed) + final-review fixes + preview hotfix
- Import MP4 (H.264/AAC) plus MOV/M4V/WebM, MP3/WAV/M4A, JPG/PNG/WebP; precise error messages (damaged file, AVI/WMV/FLV/MPG unsupported, HEIC photo, empty media, HEVC where the browser cannot decode). Files go to OPFS and are never fully loaded into memory.
- Portrait/rotated/mirrored phone video renders upright; project frame rate adopts the first clip's rate (24/25/30/50/60).
- Timeline: trim, split, move, delete, ripple delete, merge (join clips; "Merge all into one clip" renders the composite to one clip), snapping, undo/redo (snapshot history), autosave, formats YouTube 16:9, Vertical 9:16, Square 1:1, Portrait 4:5.
- Preview: WebGL2 compositor (premultiplied alpha, per-clip decoders opened lazily, latest-wins render scheduling), playback with a windowed live Web Audio mixer (20 s windows).
- Export: MP4 H.264+AAC at 1080p/4K (fit inside 1920×1080 / 3840×2160 in the project's orientation), windowed audio mixdown (30 s windows), streamed to an OPFS temp file, progress + cancel, discard-protection and download-safe temp handling.
- Inspector: per-clip volume (0–200 %) and Fit/Fill/Blur.
- Robustness: single editor tab (Web Locks, in-place takeover), session restore with protection (a failed/unsupported restore never GCs media or overwrites the saved project), media removal + "New project" + startup GC, autosave failure notices, capability banner naming missing browser features, chunk-load error handling, third-party licence notices, README.
- Preview failure diagnostics: the panel names the real reason when WebGL2 cannot start (typed `GlUnavailableError`), with Try again and Copy details; export gives the same plain-English reason.

### Plan 2 (multi-layer timeline; deployed to production at `4031ea7`)
- Project data model **v2** (tracks have `name, hidden, muted, solo, locked`) with a migration chain (`src/core/migrate.ts`); v1 saves open unchanged; `{version:3+}` stays "unsupported" and is never overwritten.
- Track operations (add/remove/reorder/rename/flags, max 8 video + 8 audio, ≥1 of each kind) with lock guards on every clip-editing path.
- Hidden layers are not drawn nor decoded (preview and export); mute/solo apply to audio of any track kind.
- Active track (new media lands on it), track headers (name edit, mute, solo, lock, hide, up/down, remove), layers displayed highest-on-top, vertical scroll, "solo active" indicator.
- "Drop here for a new layer" zones (media from the bin or a clip drag creates a track + places it in one undo step).
- Picture-in-picture: on-canvas move/scale/rotate overlay (snap to canvas centre/edges, Shift = 15° rotation steps, Alt/Option = no snapping), numeric X/Y/Scale/Rotation/Opacity fields, Reset.
- Merge-all across layers (visible layers + audible tracks; resets the target track's mute/lock/hide and all solo flags); format switches keep customised placement and round-trip exactly (Ruling J).
- Keyboard fix: Space on a keyboard-focused button presses it (mouse-focused buttons keep Space = play/pause).

### Plan 3 (audio editing, on `claude/quirky-cannon-7vz48u`, NOT deployed)
- Project data model **v3**: every clip has `audio` (`fadeIn`, `fadeOut`, `pan`, `silent`, `effects[]`), tracks have `volume` and `duck`. Migration chain v1 -> v2 -> v3 in `src/core/migrate.ts`; a newer version stays "unsupported" and is never overwritten.
- ONE shared clip chain (`src/audio/chain.ts`) builds the gain/fade/pan/effect graph for both the live mixer and the offline export mixdown (same code, so preview = export).
- Detach audio (twin audio clip, `silent` flag, badge) and Attach back (only for an unedited twin); per-clip fades and balance-law pan; track volume slider; waveforms from cached peaks.
- Effect chain per clip (EQ, high/low-pass, compressor, reverb, echo, gain, pitch shift, noise reduction), presets (Podcast, Radio, Telephone, Deep, Chipmunk), Normalise.
- Auto-ducking (track `duck` = source track + amount/attack/release; follows clip coverage), with a header popover and cycle refusal.
- Voice-over recording (mic -> mono WAV, Play along, 30 min cap), `Permissions-Policy: microphone=(self)` in `vercel.json`.
- Decisions D1-D10 and any later rulings: `docs/superpowers/ledgers/plan-3-audio-ledger.md` (written by the controller; plan: `docs/superpowers/plans/2026-11-11-clipforge-plan-3-audio.md`).

### Not built (see section 8)
Effects/looks/LUT/chroma key/overlays, text, transitions, keyframes/easing, speed/reverse, crop/flip, track/master effects, crossfades, clip linking, auto-captions, stabilisation.

## 6. Architecture

```
src/core/     pure, framework-free logic (the only place model math happens): model.ts (Project v3), migrate.ts, timeline.ts,
              tracks.ts, merge.ts (join/snap/fit/reframe), fps.ts, scale.ts, formats.ts; v3 audio edits (fades/pan/volume/duck/detach/effect list)
src/state/    store.ts (Zustand; history snapshots, selection, activeTrackId, autosave), history.ts, selection.ts, persist.ts
              (IndexedDB via idb-keyval, key 'clipforge:current'), tabLock.ts
src/media/    import.ts/fileKind.ts/importErrors.ts, storage.ts (OPFS), decode.ts (frameAt per clip, serialised, cached),
              audioDecode.ts, gc.ts, support.ts (capability report), clip.ts
src/render/   compositor.ts (WebGL2; Phase 1 uploads, Phase 2 draws bottom→top), gl.ts/glContext.ts/glErrors.ts, geometry.ts,
              overlayGeometry.ts (pure PiP math), visible.ts (visualClipsAt), blur.ts, images.ts
src/audio/    plan.ts (audibleClips, trackAudible, window planner), mixer.ts + mixerSchedule.ts + mixerTypes.ts (live), mixdown.ts (offline windows),
              context.ts, chain.ts (the ONE shared clip chain: gain, fades, pan, effects, track volume, duck points; used by live and export),
              fade.ts, duck.ts (duck envelope from source-track coverage), effects/ (registry, params, eq, filters, compressor, reverb, echo, gain,
              normalise, pitch + pitchMath), presets.ts, stft.ts + denoise.ts/denoiseProfile.ts/denoiseSource.ts (spectral-gate noise reduction,
              per-clip noise profile), stats.ts (decode counters for tests)
src/media/    (also) peaks (waveform min/max cache per media id, getPeaks/peakAt) and the recorder (mic -> worklet -> WAV)
src/export/   exporter.ts (frames at t=n/fps → Mediabunny CanvasSource, audio windows, OPFS StreamTarget)
src/ui/       React components and hooks (Timeline, Lane, ClipView, TrackHeader, NewLayerZone, Preview, TransformOverlay,
              Inspector, ExportDialog, MediaBin, session.ts startup, commands.ts/edits.ts/trackCommands.ts store-bound edits;
              Plan 3: AudioInspector, EffectList/EffectRow, TrackVolume, DuckControls, Waveform, RecordButton, audioCommands/effectCommands/recordCommands/recordEdits, audio.css)
src/harness*.ts, harness.html   dev-only in-browser test page (window.cf), not in the production build
tests/*.test.ts (Vitest), tests/e2e/*.spec.ts (Playwright), tests/e2e/fixtures.ts (ffmpeg fixtures)
docs/superpowers/{specs,plans,ledgers}   design spec, plans, decision ledgers (section 12)
```
Data flow: UI gesture → pure `(p: Project) => Project` edit → ONE `store.apply` (one undo step; `TimelineError` becomes a toast) → compositor/mixer
re-render from the plain-JSON project; autosave debounces `history.present`. Media files are referenced by id, never embedded.

### Key decisions (rulings) you must not accidentally undo
Full text with costs is in `docs/superpowers/ledgers/plan-1-foundation-ledger.md`, `plan-2-layers-ledger.md` and `plan-3-audio-ledger.md` (Plan 3 rulings D1-D10: read it before touching `src/audio/chain.ts`, ducking or the recorder). The load-bearing ones:
1. All geometry is in **format pixels**; `Transform.x/y` are offsets from the canvas centre, y down, rotation clockwise, `scale` = source px → canvas px. Overlay geometry (top-left origin) must agree with `clipMatrix`.
2. `Project.tracks` order = compositing order (index 0 bottom). UI shows video tracks highest-layer-first, then audio.
3. The compositor `sources` map is keyed by **clip id** (one decoder per clip; split halves keep their own iterator); frames from `frameAt` are valid only until the next call and are never closed by the caller.
4. Export sizes: "1080p" = fit inside 1920×1080 in the project's orientation (square → 1080×1080, 4:5 → 1080×1350), "4k" doubles that.
5. Restore safety: GC (`gcMedia`) runs only after a verified restore and only in the tab holding the lock; a failed/unsupported restore disables autosave until the user decides. Never delete OPFS media otherwise.
6. Lock semantics: only `setTrackFlags`, `renameTrack`, `moveTrack` and `reframeProject` may act on a locked track; everything else throws `TimelineError('Track is locked')`.
7. Mute always wins; solo applies to ANY track kind; hidden affects picture only. After merge-all: target track unmuted/unhidden/unlocked and all solos cleared (Ruling H).
8. Reframe (format switch): clips whose x/y/scale equal the old fit refit; customised clips keep proportional placement with `scale' = scale·√(newW·newH/oldW·oldH)` (exact round trip, Ruling J). **Ruling K (implemented): no scale clamp in reframe** (only guard finite/>0) so clips above 20× also round-trip exactly.
9. Scale bounds `[min(0.02,cur), max(20,cur)]` for edits/drags so existing >20× clips are never pulled down.
10. Any history change pauses playback; track-flag toggles must go through `store.apply`.
11. Space = play/pause globally, except on keyboard-focused native controls (input-modality tracking decides).
12. AAC: native `AudioEncoder` when available, else lazily imported WASM encoder; output is always AAC.
13. Plan 3: live preview and export must go through the same `chain.ts`; pan is a balance law (far channel dropped, near channel unchanged); effects are per clip; ducking follows source-clip coverage; a detached twin is matched by `Attach back` only while unedited; recorded audio is a normal audio media (WAV in OPFS).
14. Style: TypeScript strict, 2 spaces, single quotes, semicolons; keep files ≲200 lines (a few exceed, see issues).

## 7. Completed work (commit trail)

Plan 1 tasks 1–12 (scaffold, model, timeline ops, merge/fit, state/persistence, media import + OPFS, decode, WebGL2 compositor, mixer + exporter,
UI shell 10a/10b, smoke e2e/docs, Vercel config) → whole-branch final review → three fix waves (A media/render, B audio/export, C app/storage/hosting/legal)
→ hosting on Vercel → preview-diagnostics hotfix (`72d95db`, `1ab3564`).
Plan 2 tasks (all reviewed, fix rounds closed, nothing pushed):

| Task | Commits | Content |
|---|---|---|
| 1 | `5eed7bc` | model v2 + migration |
| 2 | `0eb4ee7`, `91402d5` | track operations + lock guards |
| 3 | `36356ea` | hidden/mute/solo in render + audio |
| 4 | `ef0c2b0` | active track, selection extraction |
| 5a | `bce9623`, `abfa5e3`, `088b395` | track headers, commands, layer-ordered timeline, keyboard/a11y |
| 5b | `9ae6e4d`, `67c2c3d` | new-layer drop zones, hit-test fixes, OS file-drop guard |
| 6a | `f7874f5`, `a5cf8b1`, `44bd748` | overlay geometry, `setClipTransform`, numeric fields |
| 6b | `f6ff52a`, `dc7de7f` | on-canvas PiP overlay |
| 7 | `c0e527a`, `6da65a1`, `5373970`, `9962ea8` | merge-all with layers, reframe rules, decoder bounds, round-trip fix |
| 8 | `2a422ee` | journey + migration e2e, docs |

## 8. Remaining work

### Immediate (finish Plan 3, then deploy)
1. Plan 2 is deployed (Ruling K and its final review were done); its manual QA checklist (`plan-2-manual-qa-checklist.md`) has still not been run in a real browser.
2. Plan 3: final whole-branch review and fix wave (controller), then the manual QA checklist `docs/superpowers/ledgers/plan-3-manual-qa-checklist.md` in real desktop Chrome on a Mac (audible checks, microphone permission flows, QuickTime playback, the two-line audio track header layout).
3. Ask the user before deploying: merge into `build/foundation` and push to `claude/macos-video-editor-lzye6c` (redeploys production). Migration notes: v1 -> v2 -> v3 happens on load (Plan 2's v2 is already live); an older open tab would then show "saved by a newer version" and protect the data. The `microphone=(self)` Permissions-Policy change in `vercel.json` goes live with it.

### Roadmap (separate plans; write each in detail with the writing-plans skill, get the user's approval, then execute with subagent-driven-development)
- **Plan 3, audio editing: DONE (implemented on `claude/quirky-cannon-7vz48u`, not deployed).** See section 5. Still open for later: track/master effects, crossfades, clip linking, speed change with pitch preservation (Plan 5).
- **Plan 4, visual effects and looks:** WebGL2 effect registry (param schema + shader) with per-clip stacks and live preview: colour, looks (B&W, sepia, film grain, teal-orange, vignette, Cinematic/Moody/Golden Hour…, `.cube` LUT import), blur/sharpen/glow/pixelate, stylise (RGB split, glitch, VHS, mirror, invert), chroma key, overlays (lower thirds, subscribe button, progress bar, stickers). Split `compositor.ts`/`gl.ts` first. Data model v4.
- **Plan 5, animation and motion:** keyframes (transform + effect params) with easing and a curve editor, motion paths, text clips with animation presets, transitions (needs a clip-boundary overlap model), speed 0.25–4× / reverse / ramp with pitch-preserving audio (touches every `duration = out − in` call site: `clipDuration/clipEnd`, `trimClip`, `splitClip`, `ui/drag.ts`, `audio/plan.ts`, compositor source-time mapping, exporter), crop/rotate/flip. Data model v5.
See `docs/superpowers/plans/2026-11-10-clipforge-plan-2-layers.md` (Roadmap section) and the spec for details.

## 9. Known issues and deferred items

User-visible / behavioural:
- Safari is untested; the code needs `AudioDecoder` and `FileSystemFileHandle.createWritable` (believed Safari 26+). The banner names missing capabilities.
- Native AAC encoding on Mac Chrome/Safari is untested (headless tests use the WASM encoder).
- Reloading within ~500 ms of an edit loses that edit (IndexedDB write aborted on reload).
- Startup/takeover temp cleanup can delete a still-streaming download from a previous page session.
- Reloading the editor tab hands the editor to a waiting background tab (Web Locks queue semantics).
- "Retry loading" confirms only when media/clips were added since the failure.
- Huge clips whose corners lie outside the preview panel cannot be resized on the canvas (use the Inspector fields); Alt as the snap-off modifier clashes with some OS window managers.
- Preview picture is ~20 px smaller per side (room reserved for the rotate handle).
- Gaps, not yet planned: keyboard-only playhead/trim control, reordering clips by dragging onto others, relinking missing media, a CSP header, fast-start MP4 (the exporter writes `fastStart: false`), long 4K exports are untested (audio memory is bounded by the window design).
- `decodeAudioRange` trusts the track's sample rate (HE-AAC with SBR could be mis-placed); no `outputLatency` compensation for the playhead.

Plan 3 (audio) known issues and deferred items (full minors in the Plan 3 ledger / `.superpowers/sdd/.../progress.md`):
- Effects are per clip only (no track or master chain, no crossfades); detached audio is not linked to its video clip; a split restarts effects cold and tails stop at the clip end.
- Noise reduction is a basic spectral gate and runs on the main thread in short slices (first Play of a denoised clip waits ~0.5 s; a Worker was deferred); a clip that is only noise is left unchanged; probes cover at most ~4 s, so speech with pauses only outside probes gets no reduction; a failed noise probe is cached as null for the session (an export could then render a clip without reduction after a transient OPFS error).
- Echo wet can reach about x11 at feedback 0.9 / mix 1 and clip in the export.
- Recorder: the worklet posts every 128-frame quantum (batch to ~2048-4096 frames); Safari interrupted-state and track-mute handling is missing; 96/192 kHz interfaces use more memory (consider an `AudioContext` sampleRate of 48000); no latency compensation for Play along; recording is held in memory (30 min cap).
- Attach back is not offered once the twin was edited, and also not if the video clip had fades/pan/effects before the detach (the twin copies them).
- Slider arrow-key holds create many undo steps; waveform does not redraw on DPR/track-height change and failed peak decodes are not negatively cached; the two-line audio track header layout has never been viewed in a real browser (manual QA item).
- Positive duck amounts are clamped silently; the duck popover is a `role=group` without a focus trap.

Code-health (all tests pass despite these):
- Over the ~200-line guideline: `src/export/exporter.ts` 345, `src/ui/styles.css` 1211, `src/media/decode.ts` 212, `src/harness.ts` 204, `src/render/overlayGeometry.ts` 193–203.
- `clipFromMedia(m, trackId, …)` keeps an unused `trackId` parameter (plan defect, harmless).
- Plan 2 deferred minors (full list in `plan-2-layers-ledger.md`): migration shares arrays with its input; `cleanName` cuts by code point not grapheme; selection unit tests are thin; moving a clip to a new layer narrows a multi-selection; Ctrl+Z/Delete/S still act mid-PiP-drag (the drag ends quietly); `ArrowUp/Down` round trip in number fields commits the rounded value; two e2e assertions are near-vacuous.

## 10. Process used (and why the next session should keep it)

The user asked for "defect free" delivery. Work followed `superpowers:subagent-driven-development`:
plan (writing-plans) → user approves → per task: a fresh **implementer subagent** (TDD, commit with trailers, never pushes) → a **task reviewer** (spec + quality) →
fix loop (resume the implementer with the findings; scoped re-review each round, max 5) → final whole-branch review → themed fix waves.
The controller (main session) never fixes code itself, records every decision as `Ruling:` in a git-ignored ledger (`.superpowers/sdd/<plan>/progress.md`,
copied into `docs/superpowers/ledgers/` here), and lists all rulings for the user at the end. Reviewers found real defects in nearly every task
(data loss in GC after failed restore, rotated video, decoder leaks, reload storm, hidden drop targets, silent merged clip, …), so do not skip them.
Model choices: opus for render/audio/UI-heavy tasks and reviews, sonnet for mechanical tasks and re-reviews.

## 11. Session pitfalls

- The session hit the account's **monthly spend limit** twice during subagent runs (limit resets are announced in the error; raise it at https://claude.ai/settings/usage). Agents' work is saved; resume them with SendMessage instead of starting over.
- Commit trailers on this repo: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01AdHhRpvZKM6sx1ZxPEYbAk` (subagents sometimes wrote "Opus 5.5"; history on `build/foundation` was normalised once with `git filter-branch` before the first push; do not rewrite pushed history).
- Do not run the full e2e suite in parallel with another that uses port 5173 (`reuseExistingServer: false`).
- MCP tool sets (Vercel/GitHub/Gmail…) disconnect and reconnect between turns; re-load schemas with ToolSearch when needed.
- Never run `playwright install`; never push or deploy without explicit user confirmation; never touch the user's other Vercel projects.

## 12. Pointers

- `CLAUDE.md`: short operating rules for Claude Code.
- `README.md`: user-facing feature list, limits, deployment, troubleshooting, third-party licences.
- `docs/superpowers/specs/2026-11-10-clipforge-design.md`: the approved design (vision for all plans).
- `docs/superpowers/plans/`: Plan 1 (foundation), Plan 2 (layers, incl. Roadmap for Plans 3–5) and Plan 3 (audio editing).
- `docs/superpowers/ledgers/`: decision ledgers (`plan-1-foundation-ledger.md`, `plan-2-layers-ledger.md`, `plan-3-audio-ledger.md`) and the manual QA checklists `plan-2-manual-qa-checklist.md`, `plan-3-manual-qa-checklist.md`.
- `vercel.json` (SPA rewrite scoped away from `/assets`, cache + security headers; no CSP/COOP/COEP), `scripts/copy-licenses.mjs`, `playwright*.config.ts`.
