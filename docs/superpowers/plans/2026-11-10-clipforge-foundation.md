# ClipForge Foundation Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working in-browser editor where you import MP4s (and other supported media), arrange/trim/split/merge them on a multi-track timeline, preview with a WebGL2 compositor, play audio, undo/redo, autosave, and export an H.264/AAC MP4.

**Architecture:** Pure-TS project model and timeline operations (`core/`) with no browser APIs; a Zustand store with snapshot history; WebCodecs-based media I/O via Mediabunny; one WebGL2 compositor shared by preview and export; a Web Audio mixer shared by live playback and offline export render.

**Tech Stack:** Vite, TypeScript, React, Zustand, WebGL2, Mediabunny (WebCodecs decode + MP4 mux), Web Audio API, IndexedDB (project JSON), OPFS (media), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-clipforge-design.md`

## Roadmap (separate plans, written after this one ships)

- **Plan 2: Audio editing**: multi-track audio, detach audio, waveforms, record voiceover, per-clip/track audio effect chain, ducking, pitch-preserving speed.
- **Plan 3: Visual effects and looks**: effect registry (WebGL2 shaders), color/blur/stylize/chroma key, LUT looks and `.cube` import, overlays.
- **Plan 4: Animation and motion**: keyframes, easing/bezier editor, motion paths, text with animation presets, transitions, speed ramp, reverse, crop/rotate/flip.

## Global Constraints

- Platform: static site, no backend; all processing local. Works in Chrome and Safari 17+ on Mac.
- Primary format: import `.mp4` (H.264/AVC + AAC); also `.mov`, `.m4v`, `.webm`, MP3/WAV/M4A, JPG/PNG. HEVC imports only where the browser can decode it, otherwise a clear "cannot be decoded" message.
- Export: MP4, H.264 + AAC, 1080p or 4K, with progress and cancel.
- Project formats: YouTube 16:9, Reels/Shorts/TikTok 9:16, Square 1:1, Portrait 4:5.
- No WebCodecs: show a banner recommending Chrome or Safari 17 or later.
- Large files are never fully loaded into memory; media lives in OPFS and is referenced by ID, never embedded in project JSON.
- Project model is plain JSON; undo/redo is a snapshot history stack; autosave serializes the JSON.
- Merge: back-to-back gapless join with snapping; mixed sizes/frame rates fit to the project canvas (fit / fill / blurred-background fill).
- Code style: TypeScript strict, 2 spaces, single quotes, semicolons.
- Cannot be verified on a real Mac or on the user's footage in the build environment.

## Review Focus

1. Split or trim at/outside a clip boundary (time equal to start/end, or outside) must not create zero-length clips; it must fail loudly or no-op as specified. (Task 3)
2. Importing an MP4 with no audio track (screen recordings) must work and produce no audio clip. (Task 6)
3. Odd canvas or clip dimensions (e.g. 1081 px wide) must encode, since H.264 needs even dimensions; export rounds down to even. (Task 9)
4. Export of an empty timeline must refuse with a message, not produce a 0-byte file. (Task 9)
5. Reloading a saved project whose media is gone from OPFS must open with those clips flagged "missing media", not crash. (Task 5)

---

## File Structure

```
package.json, vite.config.ts, tsconfig.json, playwright.config.ts, index.html
src/main.tsx, src/App.tsx
src/core/model.ts          types + factory helpers (no logic)
src/core/timeline.ts       trim/split/move/delete/activeClipsAt
src/core/merge.ts          joinClips, fitTransform
src/core/formats.ts        canvas format presets
src/state/history.ts       generic undo/redo stack
src/state/store.ts         Zustand store, actions, autosave hook
src/state/persist.ts       IndexedDB project save/load
src/media/support.ts       WebCodecs capability check
src/media/storage.ts       OPFS read/write by media ID
src/media/import.ts        probe + import file -> MediaRef
src/media/decode.ts        frame/audio access for a time
src/render/gl.ts           WebGL2 context + textured-quad draw
src/render/compositor.ts   renderFrame(project, t, sources)
src/audio/mixer.ts         live playback + offline render
src/export/exporter.ts     export MP4 with progress/cancel
src/ui/*                   MediaBin, Preview, Timeline, ExportDialog, FormatPicker
tests/                     *.test.ts (Vitest), e2e/*.spec.ts (Playwright)
```

---

### Task 1: Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`, `README.md`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build` (`tsc -b && vite build`), `test` (`vitest run`), `typecheck`, `e2e` (`playwright test --trace off`).

- [ ] **Step 1: Write the failing test** `tests/smoke.test.ts`: `import { describe, it, expect } from 'vitest'; it('runs', () => expect(1 + 1).toBe(2));`
- [ ] **Step 2: Run** `npx vitest run` → FAIL (no vitest/config yet).
- [ ] **Step 3: Scaffold** a Vite + React + TS (strict) project; add deps `react`, `react-dom`, `zustand`, `mediabunny`, `idb-keyval`; dev deps `vitest`, `typescript`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@playwright/test`. Do not run `playwright install` (Chromium is preinstalled; see Task 11 for launch options). `App.tsx` renders the text `ClipForge`. `.gitignore` ignores `node_modules`, `dist`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` → all PASS.
- [ ] **Step 5: Commit** `chore: scaffold ClipForge`

### Task 2: Project model and formats

**Files:**
- Create: `src/core/model.ts`, `src/core/formats.ts`
- Test: `tests/model.test.ts`

**Interfaces:**
- Produces (exact):
```ts
export type Id = string;
export type TrackKind = 'video' | 'audio';
export interface Transform { x: number; y: number; scale: number; rotation: number; opacity: number } // x,y in canvas px from center; rotation degrees
export interface Clip { id: Id; mediaId: Id; kind: 'video' | 'audio' | 'image'; start: number; in: number; out: number; transform: Transform; volume: number; fit: 'fit' | 'fill' | 'blur' } // seconds; duration = out - in
export interface Track { id: Id; kind: TrackKind; clips: Clip[] }
export interface MediaRef { id: Id; name: string; kind: 'video' | 'audio' | 'image'; duration: number; width?: number; height?: number; fps?: number; hasAudio: boolean; missing?: boolean }
export interface Project { version: 1; format: { width: number; height: number; fps: number }; tracks: Track[]; media: Record<Id, MediaRef> }
export function newId(): Id;
export function emptyProject(formatKey?: FormatKey): Project;   // one video track, one audio track
export function clipDuration(c: Clip): number;
export function clipEnd(c: Clip): number;                         // start + duration
// formats.ts
export type FormatKey = 'youtube' | 'vertical' | 'square' | 'portrait';
export const FORMATS: Record<FormatKey, { width: number; height: number }>; // 1920x1080, 1080x1920, 1080x1080, 1080x1350
```

- [ ] **Step 1: Write failing tests:** `clipDuration({in:2,out:5,...}) === 3`; `clipEnd` of `start:10,in:2,out:5` is `13`; `emptyProject('vertical').format` equals `{width:1080,height:1920,fps:30}`; `emptyProject()` has exactly one `video` and one `audio` track; `newId()` returns distinct strings across 1000 calls.
- [ ] **Step 2: Run** `npx vitest run tests/model.test.ts` → FAIL.
- [ ] **Step 3: Implement** the interfaces above; `newId` via `crypto.randomUUID()`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(core): project model and format presets`

### Task 3: Timeline operations

**Files:**
- Create: `src/core/timeline.ts`
- Test: `tests/timeline.test.ts`

**Interfaces:**
- Consumes: `Project`, `Clip`, `Id`, `clipDuration`, `clipEnd`, `newId` (Task 2).
- Produces (all pure, return a new `Project`, never mutate):
```ts
export class TimelineError extends Error {}
export function findClip(p: Project, clipId: Id): { track: Track; clip: Clip };   // throws TimelineError if absent
export function addClip(p: Project, trackId: Id, clip: Clip): Project;           // throws TimelineError on overlap with an existing clip on that track
export function trimClip(p: Project, clipId: Id, edge: 'start' | 'end', time: number): Project; // time is timeline seconds; start-trim advances `in` and `start`; end-trim changes `out`; result duration must be >= 0.05s else TimelineError; may not extend beyond source (in >= 0) 
export function splitClip(p: Project, clipId: Id, time: number): Project;        // throws TimelineError unless start+0.05 <= time <= end-0.05; left keeps id, right gets newId()
export function moveClip(p: Project, clipId: Id, newStart: number, trackId?: Id): Project; // newStart clamped to >= 0; TimelineError on overlap or if trackId kind differs from clip kind (image counts as video)
export function deleteClip(p: Project, clipId: Id, opts?: { ripple?: boolean }): Project; // ripple shifts later clips on the same track left by the deleted duration
export function activeClipsAt(p: Project, t: number): Clip[];                    // clips with start <= t < end, ordered bottom track first (video tracks in array order)
export function timelineDuration(p: Project): number;                           // max clipEnd across all tracks, 0 if empty
```

- [ ] **Step 1: Write failing tests** with a helper that builds a project with one video clip `{start:0,in:0,out:10}`:
  - `splitClip` at t=4 gives clips `[0,4)` (in 0,out 4) and `[4,10)` (in 4,out 10); ids differ; original project unchanged.
  - `splitClip` at t=0, t=10, t=0.01, t=11 each throws `TimelineError` (Review Focus 1).
  - `trimClip(start, 3)` → start 3, in 3, out 10; `trimClip(end, 6)` → out 6; `trimClip(end, 0.01)` throws.
  - `moveClip` onto an overlapping clip throws; moving to `-5` clamps to 0.
  - `deleteClip` with `ripple:true` on the first of two back-to-back 5s clips moves the second to start 0; without ripple it stays at 5.
  - `activeClipsAt(p, 10)` excludes a clip ending at exactly 10 and includes one starting at 10.
  - `timelineDuration` of empty project is 0.
- [ ] **Step 2: Run** `npx vitest run tests/timeline.test.ts` → FAIL.
- [ ] **Step 3: Implement** the functions above using structural copying (spread), with a 0.05 s `MIN_CLIP` constant exported from this file.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(core): timeline operations`

### Task 4: Merge and fit

**Files:**
- Create: `src/core/merge.ts`
- Test: `tests/merge.test.ts`

**Interfaces:**
- Consumes: Task 2 types, `addClip`/`findClip`/`TimelineError` (Task 3).
- Produces:
```ts
export function joinClips(p: Project, clipIds: Id[]): Project;   // clips must be on the same track; placed back-to-back in the given order, first at min(start) of the set; throws TimelineError if tracks differ or clipIds < 2; clips after the set on the track shift to stay after the joined run
export function snapTime(p: Project, trackId: Id, time: number, threshold: number): number; // snaps to 0 or any clip start/end on any track within threshold seconds, else returns time
export function fitTransform(src: { width: number; height: number }, canvas: { width: number; height: number }, mode: 'fit' | 'fill' | 'blur'): Transform; // fit: scale so the whole source is visible, centered; fill: cover the canvas; blur: same scale as fit (blurred background is drawn by the compositor)
export function reframeProject(p: Project, key: FormatKey): Project; // sets p.format width/height, recomputes each video/image clip's transform via fitTransform keeping its `fit` mode
```

- [ ] **Step 1: Write failing tests:**
  - Joining A(0–3), B(10–14), C(20–22) in order [A,B,C] yields starts 0, 3, 7 and ends 3, 7, 9.
  - Join order [C,A] places C at 0 then A at 2.
  - Clips on different tracks → `TimelineError`.
  - `snapTime` with threshold 0.1: 4.95 with a clip end at 5 → 5; 4.5 → 4.5.
  - `fitTransform({1920,1080}→{1080,1920},'fit')` scale `1080/1920 = 0.5625`; `'fill'` scale `1920/1080 ≈ 1.7778`; centered (x=0,y=0).
  - `reframeProject(p,'vertical')` updates format to 1080x1920 and every video clip's scale accordingly.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the four functions; scale is a uniform multiplier of source pixels onto canvas pixels.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(core): merge, snapping, reframe`

### Task 5: History, store and persistence

**Files:**
- Create: `src/state/history.ts`, `src/state/store.ts`, `src/state/persist.ts`
- Test: `tests/history.test.ts`, `tests/store.test.ts`

**Interfaces:**
- Consumes: Task 2–4.
- Produces:
```ts
// history.ts
export interface History<T> { past: T[]; present: T; future: T[] }
export function createHistory<T>(initial: T): History<T>;
export function commit<T>(h: History<T>, next: T, limit?: number): History<T>; // limit default 100; clears future; no-op if next === present
export function undo<T>(h: History<T>): History<T>;
export function redo<T>(h: History<T>): History<T>;
// store.ts (Zustand)
export interface EditorState { history: History<Project>; selection: Id[]; playhead: number; playing: boolean }
export interface EditorActions { apply(fn: (p: Project) => Project): void; undo(): void; redo(): void; select(ids: Id[]): void; setPlayhead(t: number): void; setPlaying(b: boolean): void; loadProject(p: Project): void }
export const useEditor: UseBoundStore<StoreApi<EditorState & EditorActions>>;
// persist.ts
export function saveProject(p: Project): Promise<void>;                  // IndexedDB key 'clipforge:current'
export function loadProject(): Promise<Project | null>;
export function reconcileMedia(p: Project, existsInStorage: (id: Id) => Promise<boolean>): Promise<Project>; // sets media[id].missing = true for absent media
```
- `apply` must catch `TimelineError` from `fn`, leave state unchanged, and surface the message via `lastError: string | null` on the store.

- [ ] **Step 1: Write failing tests:** history: commit→undo→redo round trip; commit after undo clears future; limit=3 keeps 3 past entries; undo on empty past returns same object. store: `apply(addClip…)` then `undo()` restores the previous project; an `apply` whose fn throws `TimelineError` leaves `present` unchanged and sets `lastError`. persist: `reconcileMedia` with a fake `existsInStorage` returning false for `m1` marks `media.m1.missing === true` and leaves `m2` untouched (Review Focus 5).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Autosave: subscribe to the store and call `saveProject` debounced 500 ms (in `store.ts`, no-op when `indexedDB` is undefined so Vitest works).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(state): history, store, persistence`

### Task 6: Media support check, storage and import

**Files:**
- Create: `src/media/support.ts`, `src/media/storage.ts`, `src/media/import.ts`
- Test: `tests/support.test.ts`; `tests/e2e/import.spec.ts` (Playwright, run in Task 11)

**Interfaces:**
- Produces:
```ts
export function hasWebCodecs(g?: typeof globalThis): boolean;      // 'VideoDecoder' in g && 'VideoEncoder' in g
// storage.ts (OPFS, directory 'clipforge-media')
export function putMedia(id: Id, file: Blob): Promise<void>;
export function getMediaFile(id: Id): Promise<File>;               // throws if absent
export function hasMedia(id: Id): Promise<boolean>;
export function removeMedia(id: Id): Promise<void>;
// import.ts
export class ImportError extends Error {}                          // message is user-facing, e.g. 'This file uses a codec your browser cannot decode (HEVC). Try Safari, or set iPhone Camera to Most Compatible.'
export function importFile(file: File): Promise<MediaRef>;         // stores file in OPFS; probes with Mediabunny; hasAudio = file has an audio track; images get duration 5
export function clipFromMedia(m: MediaRef, trackId: Id, start: number, canvas: {width:number;height:number}): Clip; // full-length clip with fitTransform 'fit' applied
```
- Video files with no audio track must yield `hasAudio:false` and never an error (Review Focus 2).

- [ ] **Step 1: Write failing unit test:** `hasWebCodecs({} as any)` is false; with fake `VideoDecoder`/`VideoEncoder` keys it is true.
- [ ] **Step 2: Write Playwright test** `tests/e2e/import.spec.ts` (executed in Task 11): generate fixtures with `ffmpeg` in a global setup (`tests/e2e/fixtures.ts`): `with-audio.mp4` (3 s, 640x360, sine audio) and `no-audio.mp4` (2 s); import both via the file input `[data-testid=file-input]`; assert the media bin shows two items, durations ≈3 and ≈2, and only `with-audio.mp4` is flagged `data-has-audio="true"`.
- [ ] **Step 3: Run** `npx vitest run tests/support.test.ts` → FAIL.
- [ ] **Step 4: Implement** the three files. Use Mediabunny `Input` + `BlobSource` + `ALL_FORMATS` to read duration, primary video track dimensions/fps and audio-track presence; check decodability with `canDecode()` on the video track and map failure to `ImportError`. Verify exact Mediabunny API names against the installed version's docs.
- [ ] **Step 5: Run** unit test → PASS. **Commit** `feat(media): capability check, OPFS storage, import`

### Task 7: Frame and audio decode access

**Files:**
- Create: `src/media/decode.ts`
- Test: `tests/e2e/decode.spec.ts`

**Interfaces:**
- Consumes: `getMediaFile` (Task 6).
- Produces:
```ts
export interface VideoSource { frameAt(sourceTime: number): Promise<ImageBitmap | VideoFrame | null>; close(): void }
export function openVideoSource(mediaId: Id): Promise<VideoSource>;    // sequential access optimized; keeps a small frame cache; never loads the whole file
export function decodeAudio(mediaId: Id, from: number, to: number, ctx: BaseAudioContext): Promise<AudioBuffer | null>; // null if the media has no audio
```

- [ ] **Step 1: Write failing Playwright test:** open `with-audio.mp4`; `frameAt(1.5)` returns non-null with width 640; `frameAt(99)` returns the last frame or null without throwing; `decodeAudio(id, 0, 1, ctx)` returns a buffer of ≈1 s with non-zero samples; `decodeAudio` on `no-audio.mp4` returns `null`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/decode.spec.ts` → FAIL.
- [ ] **Step 3: Implement** with Mediabunny's video sample sink (timestamp lookup) and audio sample/buffer sink; cache the last N frames and `close()` them on eviction.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(media): frame and audio decode`

### Task 8: WebGL2 compositor

**Files:**
- Create: `src/render/gl.ts`, `src/render/compositor.ts`
- Test: `tests/e2e/compositor.spec.ts`

**Interfaces:**
- Consumes: `Project`, `activeClipsAt` (Tasks 2–3), `VideoSource` (Task 7).
- Produces:
```ts
export interface Compositor { renderFrame(p: Project, t: number, sources: Map<Id, VideoSource>): Promise<void>; canvas: HTMLCanvasElement | OffscreenCanvas; resize(w: number, h: number): void; dispose(): void }
export function createCompositor(canvas: HTMLCanvasElement | OffscreenCanvas): Compositor;
```
- Draw order: video tracks bottom to top, each active clip as a textured quad using `transform` (x, y, scale, rotation, opacity) and source size; background black. For `fit: 'blur'`, draw the clip first scaled to fill with a box blur, then the fitted clip on top. Image clips use a cached `ImageBitmap`.

- [ ] **Step 1: Write failing Playwright test:** create a 4x4-pixel-per-side solid red image clip and a green image clip on two video tracks (green on top at opacity 0.5) in a 64x64 project; `renderFrame(p, 0, …)`; read back the center pixel with `gl.readPixels`; assert it is ≈ (128, 64, 0) ±2 (green 50% over red... i.e. blended); assert a pixel outside the clips' bounds is black; at `t` beyond all clips the whole frame is black.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** a single quad shader with a 3x3 transform matrix, premultiplied-alpha blending, texture upload via `texImage2D` from `ImageBitmap`/`VideoFrame`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(render): WebGL2 compositor`

### Task 9: Audio mixer and exporter

**Files:**
- Create: `src/audio/mixer.ts`, `src/export/exporter.ts`
- Test: `tests/e2e/export.spec.ts`; `tests/export-dims.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 7, 8.
- Produces:
```ts
// mixer.ts
export interface Mixer { play(p: Project, from: number): Promise<void>; stop(): void; currentTime(): number }
export function createMixer(): Mixer;                                  // live playback via AudioContext
export function renderMixdown(p: Project, sampleRate?: number): Promise<AudioBuffer | null>; // OfflineAudioContext; null if no audible clips; applies clip.volume and track clip placement/trim
// exporter.ts
export type ExportQuality = '1080p' | '4k';
export class ExportError extends Error {}
export function evenDims(w: number, h: number): { width: number; height: number };           // rounds each down to nearest even number
export function exportSize(p: Project, q: ExportQuality): { width: number; height: number }; // scales project format so the long side is 1920 (1080p) or 3840 (4k), preserving aspect, then evenDims
export function exportProject(p: Project, opts: { quality: ExportQuality; onProgress(frac: number): void; signal: AbortSignal }): Promise<Blob>; // throws ExportError('Nothing to export') when timelineDuration(p) === 0
```
- Export steps frame-by-frame at `format.fps`, calls `compositor.renderFrame`, feeds an H.264 video source, adds the mixdown as AAC audio, finalizes MP4. Abort must stop encoding, release all decoders/encoders, and reject with `DOMException('Aborted','AbortError')`.

- [ ] **Step 1: Write failing unit tests** `tests/export-dims.test.ts`: `evenDims(1081, 1921)` → `{1080,1920}`; `exportSize` for a 1080x1350 project at `'1080p'` → long side 1920 ⇒ `1536x1920`; at `'4k'` → `3072x3840`; `exportProject` of `emptyProject()` rejects with `ExportError` (Review Focus 3, 4).
- [ ] **Step 2: Write failing Playwright test:** project with `with-audio.mp4` (3 s) split at 1.5 s and the second half moved to 3.0 s (gap) then rejoined via `joinClips`; export `'1080p'`; parse the resulting blob with Mediabunny; assert container MP4, video codec `avc`, audio codec `aac`, duration 3.0 s ±0.2, size 1920x1080; progress callbacks are monotonic and end at 1. Second test: abort at 30% progress → promise rejects with `AbortError`.
- [ ] **Step 3: Run** both → FAIL.
- [ ] **Step 4: Implement** per the interfaces. Choose bitrate from resolution (1080p ≈ 12 Mbps, 4k ≈ 40 Mbps), 128 kbps AAC.
- [ ] **Step 5: Run** unit + Playwright tests → PASS.
- [ ] **Step 6: Commit** `feat(export): mixer and MP4 exporter`

### Task 10: UI shell and merge-to-one-clip

**Files:**
- Create: `src/ui/MediaBin.tsx`, `src/ui/Preview.tsx`, `src/ui/Timeline.tsx`, `src/ui/ExportDialog.tsx`, `src/ui/FormatPicker.tsx`, `src/ui/Banner.tsx`; modify `src/App.tsx`
- Test: `tests/e2e/editor.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: elements with these `data-testid`s: `file-input` (multiple, accepts `video/*,audio/*,image/*`), `media-item` (with `data-has-audio`), `timeline-clip`, `playhead`, `btn-split`, `btn-delete`, `btn-merge`, `btn-undo`, `btn-redo`, `btn-play`, `btn-export`, `format-select`, `banner-no-webcodecs`, `error-toast`.
- Behaviors: drag media from bin to timeline (adds clip at drop time, snapped via `snapTime`, 8 px ≈ threshold); click clip selects; shift-click multi-select; drag clip edges to trim; `btn-split` splits selected at playhead; `btn-merge` calls `joinClips` on the selection ordered by start; "Merge all into one clip" renders the timeline with `exportProject`, imports the result as new media, and replaces the timeline with that single clip (one undoable step); keyboard: Space play/pause, S split, Delete delete, Cmd/Ctrl-Z undo, Shift-Cmd/Ctrl-Z redo; `Preview` re-renders on playhead change and during playback via the compositor with audio from the mixer; `Banner` shown when `hasWebCodecs()` is false; errors from `lastError` appear in `error-toast`; on startup `loadProject` + `reconcileMedia` restore the session.

- [ ] **Step 1: Write failing Playwright test:** import both fixtures; drag `with-audio.mp4` to the timeline; assert one `timeline-clip`; move the playhead to 1 s and click split → two clips; click both (shift) and `btn-merge` → clips adjacent; `btn-undo` ×2 → back to one clip; format select to "vertical" → preview canvas aspect ≈ 9:16; reload page → clips and format restored; delete a media file from OPFS via test hook then reload → the clip shows `data-missing="true"` and no crash.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the components; keep each file under ~200 lines, logic stays in `core/` and `state/`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(ui): editor shell`

### Task 11: End-to-end smoke test and docs

**Files:**
- Create: `tests/e2e/smoke.spec.ts`; modify `playwright.config.ts`, `README.md`

- [ ] **Step 1: Write failing Playwright test:** import `with-audio.mp4` → drag to timeline → split at 1 s → apply format "square" → export `1080p` → capture the download; assert via Mediabunny/ffprobe that the file is H.264 + AAC MP4, 1080x1080, duration 3.0 s ±0.2.
- [ ] **Step 2: Run** `npm run e2e` → FAIL until all wiring is complete. Launch Chromium with `args: ['--no-sandbox', '--enable-features=...']` as required for WebCodecs in headless; do not run `playwright install`. If headless Chromium lacks an H.264 encoder, record that limitation in README and gate only the encode assertions behind `VideoEncoder.isConfigSupported`.
- [ ] **Step 3: Fix** wiring issues until PASS; run the full suite: `npm test && npm run typecheck && npm run build && npm run e2e` → all PASS.
- [ ] **Step 4: README:** how to run, supported formats, HEVC note (set iPhone Camera → Formats → Most Compatible), browser requirements, and how to deploy `dist/` to a static host.
- [ ] **Step 5: Commit** `test: end-to-end smoke; docs`

### Task 12: Host online (Vercel)

**Files:**
- Create: `vercel.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the `dist/` output of `npm run build` (Task 1) and the passing suite (Task 11).
- Produces: a public HTTPS URL serving the editor. HTTPS is required for WebCodecs and OPFS to work.

- [ ] **Step 1: Write `vercel.json`:** build command `npm run build`, output directory `dist`, and a single-page-app rewrite of all paths to `/index.html`. No server functions.
- [ ] **Step 2: Verify locally:** `npm run build && npx vite preview`, load the preview URL in Playwright and assert the page shows `ClipForge` and no `banner-no-webcodecs`.
- [ ] **Step 3: Ask the user to confirm** before deploying, since a deploy is public. Then deploy the `dist/` build with the Vercel tools (project name `clipforge`), and open the returned URL.
- [ ] **Step 4: Verify the live URL:** the page loads over HTTPS, `hasWebCodecs()` is true in Chromium, and importing the fixture MP4 and exporting a 1 s clip works on the hosted copy.
- [ ] **Step 5: Document** the live URL and redeploy steps in `README.md`. **Commit** `chore: Vercel hosting config`

---

## Self-Review

- **Spec coverage (this plan's share):** MP4 and other formats import (T6); multi-file drag/drop (T10); streamed OPFS media (T6–7); multi-track timeline with trim/split/move/delete/ripple (T3); merge, snapping, mixed sizes/fit modes, merge-all-to-one-clip (T4, T10); social formats and reframe (T2, T4, T10); WebGL2 compositor shared by preview/export (T8); audio playback and per-clip volume (T9); export MP4 H.264/AAC 1080p/4K with progress/cancel (T9); undo/redo and autosave (T5); WebCodecs banner and clear import errors (T6, T10). Deferred by design to Plans 2–4: separate audio tracks/detach/record/effects, pan/fades/ducking, visual effects/looks/LUT/chroma, keyframes/easing, text, transitions, speed/reverse, crop/rotate/flip, overlays, per-clip fades. Clip `volume` is the only audio control in this plan.
- **Type consistency:** `Id`, `Clip`, `Project`, `MediaRef`, `Transform`, `FormatKey`, `VideoSource`, `ExportQuality` are defined once (T2, T7, T9) and reused with identical names; `TimelineError` is thrown by T3/T4 and caught by the store (T5).
- **Proportion:** steps give signatures, assertions and exact values; no function bodies except where behavior is pinned by tests.
- **Risk to verify early:** Mediabunny API names and headless-Chromium H.264/AAC encoder availability (Tasks 6, 9, 11); if headless lacks encoders, the Playwright encode tests need a headed or flagged run.
