# ClipForge Plan 2: Multi-Layer Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The timeline supports any number of stacked video layers and audio tracks (up to 8 of each): add, remove, rename, reorder, hide, mute, solo and lock tracks; drop media to create a new layer; edit a clip's position, scale and rotation directly on the preview (picture-in-picture); preview and export respect all of it.

**Architecture:** A versioned project model (v2: tracks gain `name`, `hidden`, `muted`, `solo`, `locked`) with a migration chain in the persistence layer; pure track operations in `core/tracks.ts`; lock guards in the existing timeline operations; the compositor and audio planner learn about hidden/muted/solo; the timeline UI gains per-track headers and a "new layer" drop zone; the preview gains an on-canvas transform overlay. The compositor already draws video tracks bottom→top and the timeline already supports several tracks of a kind; nothing there needs a redesign.

**Tech Stack:** unchanged (React 19, TypeScript strict, Zustand, WebGL2, Web Audio, Mediabunny, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-11-10-clipforge-design.md` ("Multi-track timeline", "picture-in-picture via layered tracks"). This plan is the new Plan 2; the earlier roadmap's Plans 2–4 move to Plans 3–5 (see Roadmap).

**Base:** branch `feature/layers` created from `build/foundation` AFTER the preview-diagnostics hotfix is merged there (the hotfix touches `src/render/gl.ts`, `src/ui/Preview.tsx`, `src/export/exporter.ts`).

## Global Constraints

- Style: TypeScript strict, 2 spaces, single quotes, semicolons; files ≲200 lines (split before extending: `src/state/store.ts` is at 200 lines).
- One gesture = one `apply` = one undo step; core operations are pure `(p: Project, …) => Project` and throw `TimelineError` for user-facing refusals (the UI shows them as toasts).
- Track order in `Project.tracks` stays "array order = compositing order, index 0 at the bottom". Video and audio tracks may be interleaved in the array; kind is `Track.kind`.
- Limits: `MAX_TRACKS_PER_KIND = 8`; a project always keeps at least one video and one audio track.
- Persistence: saved v1 projects must open unchanged in meaning (migration only adds defaults); an unknown newer version stays `unsupported` and is never overwritten (existing restore protection must keep working).
- Never delete user media as a side effect of track operations (media files are only freed by the existing GC).
- `npm run build` output must not contain `__clipforge`; all existing testids keep working.
- Verified-by-test rule: every task ends with `npm test && npm run typecheck`; UI/render tasks also run their Playwright specs; the last task runs the whole gate (`npm test && npm run typecheck && npm run build && npm run e2e && npm run e2e:preview`).

## Review Focus

1. Opening a project saved by the previous version (v1) must show the same clips on the same tracks, with no data lost and no restore warning. (Task 1)
2. Removing or reordering a track that has clips, undo/redo after every track operation, and a locked track must never be editable by any path (move target, trim, split, delete, ripple delete, merge, drop, drag, paste of media, volume/fit edits). (Tasks 2, 5)
3. Solo/mute semantics with video clips that carry audio, and hidden layers in both preview and export (export must match preview). (Task 3, 8)
4. A project with many layers must stay responsive: preview opens decoders only for visible active clips; hidden layers must not open decoders. (Task 3)
5. On-canvas editing of a rotated/scaled clip: handles must follow the clip, undo must restore it exactly, and a drag on empty canvas must not move anything. (Task 6)

---

## File Structure

```
src/core/model.ts          Track gains name/hidden/muted/solo/locked; Project.version 2; newTrack()
src/core/migrate.ts        migrateProject(raw): MigrateResult (v1 -> v2; chain for later plans)
src/core/tracks.ts         addTrack/removeTrack/moveTrack/renameTrack/setTrackFlags + limits
src/core/timeline.ts       lock guards (TimelineError 'Track is locked')
src/state/selection.ts     selection + activeTrackId actions extracted from store.ts
src/state/persist.ts       classifySaved uses migrateProject
src/render/visible.ts      visualClipsAt respects hidden tracks (moved out of compositor.ts)
src/audio/plan.ts          audibleClips respects muted/solo
src/ui/trackLayout.ts      displayOrder(tracks), lane geometry (pure)
src/ui/TrackHeader.tsx     per-track controls
src/ui/NewLayerZone.tsx    drop zone for a new layer
src/ui/trackCommands.ts    store-bound track commands (guard + apply)
src/render/overlayGeometry.ts   pure corner/handle/hit-test math for the on-canvas editor
src/ui/TransformOverlay.tsx     on-canvas move/scale/rotate handles
src/ui/useTransformDrag.ts      pointer logic for the overlay
src/ui/TransformFields.tsx      numeric x/y/scale/rotation/opacity inputs in the Inspector
tests/                     unit specs per module; tests/e2e/layers*.spec.ts
```

---

### Task 1: Project model v2 and migration

**Files:**
- Create: `src/core/migrate.ts`, `tests/migrate.test.ts`
- Modify: `src/core/model.ts`, `src/state/persist.ts:~22-32`, `tests/persist.test.ts`, `tests/model.test.ts`, `tests/e2e/harness-helpers.ts` (the `project()` builder), any test fixture building `{version: 1}`

**Interfaces:**
- Produces (exact):
```ts
export interface Track { id: Id; kind: TrackKind; name: string; hidden: boolean; muted: boolean; solo: boolean; locked: boolean; clips: Clip[] }
export interface Project { version: 2; format: {...unchanged}; tracks: Track[]; media: Record<Id, MediaRef> }
export function newTrack(kind: TrackKind, name?: string): Track;   // fresh id, defaults: hidden/muted/solo/locked false, name '' (UI derives "Video 2" when empty)
// migrate.ts
export type MigrateResult = { ok: true; project: Project } | { ok: false; reason: 'newer' | 'malformed' };
export function migrateProject(raw: unknown): MigrateResult;    // v1 -> v2 adds track defaults; v2 passes through (shape-checked); version > 2 => 'newer'; anything else => 'malformed'
```
- `emptyProject()` yields version 2 with default tracks created via `newTrack`.

- [ ] **Step 1: Write failing tests** (`tests/migrate.test.ts`): a v1 project with 2 tracks and 3 clips → `ok`, `version === 2`, every clip/media field identical (deep-equal on clips and media), tracks gain the five defaults; v2 input returns an equal project; `{version: 3}` → `{ok:false, reason:'newer'}`; `null`, `[]`, `{version: 1}` without tracks, tracks not an array, clip with non-object → `'malformed'`; calling `migrateProject` on its own output is idempotent; input object is not mutated. In `tests/persist.test.ts` the "newer version" case becomes version 3 and a stored v1 project loads as `ok` with version 2.
- [ ] **Step 2: Run** `npx vitest run tests/migrate.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `migrate.ts`, update `model.ts` types/`emptyProject`/`newTrack`, and make `classifySaved` call `migrateProject` (`newer` → existing "saved by a newer version" unsupported reason; `malformed` → existing wrong-shape unsupported reason; keep `none`/`unavailable` behaviour). Update every `version: 1` literal in code and tests.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS (fix compile errors from the new required Track fields everywhere tracks are constructed).
- [ ] **Step 5: Commit** `feat(core): project model v2 with track flags and migration`

### Task 2: Track operations and lock guards

**Files:**
- Create: `src/core/tracks.ts`, `tests/tracks.test.ts`
- Modify: `src/core/timeline.ts` (lock guards), `tests/timeline-guards.test.ts`

**Interfaces:**
- Consumes: `Project`, `Track`, `TimelineError`, `newTrack` (Task 1).
- Produces (exact):
```ts
export const MAX_TRACKS_PER_KIND = 8;
export function addTrack(p: Project, kind: TrackKind, opts?: { index?: number; name?: string }): Project;   // inserts at opts.index (default: video → end of the video tracks region is NOT required: default = append to array end for audio, above all existing video tracks i.e. after the last video track for video); TimelineError at the limit
export function removeTrack(p: Project, trackId: Id, opts?: { removeClips?: boolean }): Project;           // TimelineError if it has clips and !removeClips, or if it is the last track of its kind
export function moveTrack(p: Project, trackId: Id, toIndex: number): Project;                              // reorders within p.tracks; clamps; no-op returns p
export function renameTrack(p: Project, trackId: Id, name: string): Project;                               // trims, max 40 chars, empty allowed (UI shows default)
export function setTrackFlags(p: Project, trackId: Id, flags: Partial<Pick<Track, 'hidden' | 'muted' | 'solo' | 'locked'>>): Project; // hidden only valid for video tracks (TimelineError for audio); no-op returns p
export function trackLabel(p: Project, trackId: Id): string;                                                // name or "Video N"/"Audio N" (N = 1-based position among tracks of that kind, array order)
export function isLocked(p: Project, trackId: Id): boolean;
```
- `timeline.ts` guards: `addClip`, `moveClip` (source AND target track), `trimClip`, `splitClip`, `deleteClip`, `joinClips`, `rippleDelete` path throw `TimelineError('Track is locked')` when any involved track is locked.

- [ ] **Step 1: Write failing tests:** add video track at default index lands after the last video track; adding a 9th video track throws; `removeTrack` of a track with clips throws, with `removeClips:true` returns a project without those clips and track, removing the only video track throws; `moveTrack` keeps clip data; `renameTrack` trims and caps at 40; `setTrackFlags(audioTrack, {hidden:true})` throws; `trackLabel` numbers per kind in array order and uses names; every timeline operation listed above throws on a locked track (one test per operation, including moveClip into a locked target and out of a locked source) and works again after unlocking; inputs never mutated.
- [ ] **Step 2: Run** `npx vitest run tests/tracks.test.ts tests/timeline-guards.test.ts` → FAIL.
- [ ] **Step 3: Implement** `tracks.ts` and the guards (one `assertUnlocked(p, trackId)` helper in `timeline.ts`).
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(core): track operations and lock guards`

### Task 3: Hidden, muted and solo in preview, export and audio

**Files:**
- Create: `src/render/visible.ts`, `tests/visible.test.ts`
- Modify: `src/render/compositor.ts` (import `visualClipsAt` from `visible.ts`), `src/ui/previewRenderer.ts` (only open decoders for clips from `visualClipsAt`), `src/export/exporter.ts` (same source selection), `src/audio/plan.ts`, `tests/audio-plan.test.ts`, `tests/e2e/layers-render.spec.ts`

**Interfaces:**
- Produces (exact):
```ts
// render/visible.ts
export function visualClipsAt(p: Project, t: number): Clip[];        // clips of kind video|image on NON-hidden video tracks, bottom layer first
// audio/plan.ts
export function trackAudible(p: Project, track: Track): boolean;    // !muted && (no track in p has solo || track.solo)
export function audibleClips(p: Project): Clip[];                    // existing rules + trackAudible(track); solo applies to ANY track kind
```
- Rule: if at least one track has `solo`, only soloed tracks produce sound (a soloed video track's embedded audio counts); `muted` always silences its track even if soloed.

- [ ] **Step 1: Write failing tests:** `visualClipsAt` skips hidden tracks and keeps bottom→top order across 3 video tracks; `audibleClips`: muted track excluded; solo on one audio track excludes others and excludes video-track audio unless that video track is soloed; muted+solo → silent; no solo → unchanged behaviour. E2E (`layers-render.spec.ts`, harness): two image layers (red 48×48 bottom, green 32×32 top) → centre pixel green; hide top track → centre red; hide both → black; export of the same project (small, `maxLongSide`) decoded with ffmpeg shows the same pixels as the preview for both states; a hidden layer's video clip opens NO decoder (assert via `window.__clipforge.videoSourceStats`/exposed counter); `renderMixdown` of a muted track is silent and with solo only the soloed track is audible (peak assertions as in the existing mixdown specs).
- [ ] **Step 2: Run** the new specs → FAIL.
- [ ] **Step 3: Implement** the pure functions and wire them in (compositor, preview renderer, exporter, mixer/mixdown through `audibleClips`).
- [ ] **Step 4: Run** `npm test && npm run typecheck && npx playwright test tests/e2e/layers-render.spec.ts` → PASS.
- [ ] **Step 5: Commit** `feat(render,audio): hidden layers, mute and solo`

### Task 4: Active track state and store split

**Files:**
- Create: `src/state/selection.ts`, `tests/selection.test.ts`
- Modify: `src/state/store.ts` (extract selection/clamp helpers so the file shrinks below ~150 lines), `src/ui/edits.ts` (`appendMedia` uses the active track), `tests/project-edits.test.ts`

**Interfaces:**
- Produces: store state `activeTrackId: Id | null`, action `setActiveTrack(id: Id | null): void` (pruned to an existing track on `apply`/`undo`/`redo`/`loadProject`, like `selection`); pure `pruneActiveTrack(p: Project, id: Id | null): Id | null` in `selection.ts`; `appendMedia(p, mediaId, activeTrackId?)`: uses the active track when its kind matches the media (video/image → video track, audio → audio track) else the first track of the right kind (current behaviour); a locked target track makes `appendMedia` fall through to the next unlocked track of that kind, or throw `TimelineError('All tracks of this kind are locked')`.
- No behaviour change for existing flows (all existing unit and e2e tests stay green).

- [ ] **Step 1: Write failing tests:** `pruneActiveTrack` keeps valid ids and returns null for removed tracks; `appendMedia` honours the active track, ignores a kind-mismatched one, skips locked tracks, throws when all are locked; store test: removing the active track via `apply` clears `activeTrackId`; undo restores nothing stale.
- [ ] **Step 2: Run** `npx vitest run tests/selection.test.ts tests/project-edits.test.ts tests/store.test.ts` → FAIL.
- [ ] **Step 3: Implement** the extraction (no logic change) and the new state/action; keep `store.ts` exports unchanged for importers.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `refactor(state): extract selection helpers; add active track`

### Task 5: Track headers and layer-ordered timeline

**Files:**
- Create: `src/ui/trackLayout.ts`, `src/ui/TrackHeader.tsx`, `src/ui/NewLayerZone.tsx`, `src/ui/trackCommands.ts`, `tests/track-layout.test.ts`, `tests/e2e/layers-ui.spec.ts`
- Modify: `src/ui/Timeline.tsx`, `src/ui/Lane.tsx`, `src/ui/ClipView.tsx` (locked styling), `src/ui/useClipDrag.ts` (drop into the new-layer zone, locked lanes rejected), `src/ui/MediaBin.tsx`/`Lane.tsx` (media drop on the zone), `src/ui/styles.css`, `README.md`

**Interfaces:**
- Produces (exact):
```ts
// trackLayout.ts (pure)
export function displayOrder(tracks: Track[]): Track[];   // visual top→bottom: video tracks highest layer first (reverse array order), then audio tracks in array order
export function trackHeight(kind: TrackKind): number;      // px (video 56, audio 40)
// trackCommands.ts (store-bound; each = one apply via guard)
export function addLayer(kind: TrackKind): void; export function removeLayer(trackId: Id): void /* confirms when it has clips and removes them */;
export function moveLayer(trackId: Id, direction: 'up' | 'down'): void;   // "up" = higher layer/earlier visual position
export function toggleTrackFlag(trackId: Id, flag: 'hidden' | 'muted' | 'solo' | 'locked'): void;
export function renameLayer(trackId: Id, name: string): void;
```
- Testids (exact): `track-header` (with `data-track-id`, `data-track-kind`, `data-active`), `track-name`, `track-btn-mute`, `track-btn-solo`, `track-btn-lock`, `track-btn-hide` (video only), `track-btn-up`, `track-btn-down`, `track-btn-remove`, `btn-add-video-layer`, `btn-add-audio-track`, `new-layer-zone` (a drop target below the video lanes: `data-kind="video"`; and one below the audio lanes: `data-kind="audio"`). Existing `timeline-lane` testids and `data-track-id` stay.
- Behaviours: clicking a header sets the active track; double-click the name edits it (Enter commits one `renameLayer`, Escape cancels); buttons are keyboard operable with `aria-pressed`; locked lanes show a lock state, reject drops/drags with the lock toast; dropping a media item on `new-layer-zone` adds a track of that media's kind and the full-length clip in ONE apply (undo removes both); dragging a clip onto the zone of its kind moves it to a new track in ONE apply; `removeLayer` with clips asks for confirmation, with `removeClips`; lane rendering uses `displayOrder` and `trackHeight`; the timeline area scrolls vertically when taller than its panel while the track headers scroll with it.

- [ ] **Step 1: Write failing tests:** unit `displayOrder` (2 video + 1 audio interleaved in the array → expected order; stability; empty), `trackHeight`. E2E: default project shows one video + one audio header; `btn-add-video-layer` adds a second video lane ABOVE the first (DOM order) and it becomes active; adding clips via `btn-add-to-timeline` lands on the active track; mute/solo/lock/hide buttons toggle `aria-pressed` and state (read via `window.__clipforge.getState()`); a locked lane refuses a media drop and a clip drag with the lock toast and leaves state unchanged; unlocking works; rename via double-click + Enter and Escape cancel; drop of a media item on the video `new-layer-zone` creates a layer + clip, `btn-undo` removes both in one step; dragging a clip to the zone creates a layer in one step; remove with clips shows the confirm and, once accepted, `undo` brings track and clips back; move up/down changes the layer order and the preview compositing order (pixel check from Task 3 helper); 8-layer limit shows a toast; keyboard: tab to a header button and activate it with Enter/Space.
- [ ] **Step 2: Run** the new specs → FAIL.
- [ ] **Step 3: Implement** the pure layout module, commands, components, drag/drop changes and CSS (visual check: take screenshots at 1440×900 and 1024×700 under the scratchpad and fix layout defects; README feature list updated).
- [ ] **Step 4: Run** `npm test && npm run typecheck && npx playwright test tests/e2e/layers-ui.spec.ts tests/e2e/editor.spec.ts` → PASS (all pre-existing editor/gesture specs must still pass; update only where the DOM legitimately changed and say so).
- [ ] **Step 5: Commit** `feat(ui): layer headers, new-layer drop zone, layer ordering`

### Task 6: On-canvas transform editing (picture-in-picture)

**Files:**
- Create: `src/render/overlayGeometry.ts`, `src/ui/TransformOverlay.tsx`, `src/ui/useTransformDrag.ts`, `src/ui/TransformFields.tsx`, `tests/overlay-geometry.test.ts`, `tests/e2e/pip.spec.ts`
- Modify: `src/ui/Preview.tsx` (render the overlay above the canvas, only when exactly one visual clip is selected and not locked/hidden), `src/ui/Inspector.tsx` (mount `TransformFields`), `src/ui/edits.ts` (`setClipTransform`), `tests/project-edits.test.ts`, `src/ui/styles.css`

**Interfaces:**
- Produces (exact):
```ts
// overlayGeometry.ts (pure, DOM-free; canvas space = project.format pixels, y down)
export type Point = { x: number; y: number };
export function clipCorners(size: { width: number; height: number }, t: Transform, format: { width: number; height: number }): [Point, Point, Point, Point]; // TL, TR, BR, BL after scale/rotation/translate (same math as clipMatrix)
export type Handle = 'move' | 'scale-tl' | 'scale-tr' | 'scale-br' | 'scale-bl' | 'rotate';
export function hitTest(corners: [Point, Point, Point, Point], p: Point, tolerance: number): Handle | null;
export function dragMove(start: Transform, dx: number, dy: number): Transform;                       // translate in canvas px
export function dragScale(start: Transform, size: { width: number; height: number }, handle: Handle, pointer: Point, format: { width: number; height: number }): Transform; // uniform scale about the opposite corner's centre-preserving rule: scale about clip centre; min 0.02, max 20
export function dragRotate(start: Transform, centre: Point, pointer: Point, snapDeg?: number): Transform;   // degrees clockwise, snap to 15° when shift held (snapDeg = 15), normalised to (-180,180]
export function snapToCanvas(t: Transform, size: {width:number;height:number}, format: {width:number;height:number}, thresholdPx: number): Transform; // snaps clip centre/edges to canvas centre/edges within threshold
// edits.ts
export function setClipTransform(p: Project, clipId: Id, patch: Partial<Transform>): Project;       // clamps scale 0.02..20, opacity 0..1, finite numbers only (TimelineError otherwise); audio clips refused
```
- Behaviours: overlay shows a dashed outline with 4 corner handles and a rotate handle; dragging inside moves; one `apply(setClipTransform)` on pointerup (undo = one step; Escape cancels and restores); shift constrains rotation to 15° steps; corner drag scales uniformly; snapping to canvas centre/edges within 8 px (hold Alt to disable); the overlay follows the displayed clip rect (use `clipCorners` with the video's rotated size — reuse `rotatedSize`/`frameOrientation` from `render/geometry`); `TransformFields`: numeric inputs `inspector-x`, `inspector-y`, `inspector-scale` (percent), `inspector-rotation`, `inspector-opacity` (percent), committing one apply on change/blur/Enter, invalid input reverts; pointer handling filters by pointerId, handles `pointercancel` and a clip vanishing mid-drag (same rules as `useClipDrag`).

- [ ] **Step 1: Write failing tests:** unit: `clipCorners` for identity (centred rect), scale 0.5, rotation 90° (corners rotate clockwise), translation, combined; `hitTest` priority (rotate handle > corner > inside > null) and tolerance; `dragScale` keeps the aspect, clamps, scales about the centre; `dragRotate` angle for pointer positions, shift snapping and normalisation (e.g. 190° → -170°); `snapToCanvas` snaps and does not snap beyond threshold; `setClipTransform` clamps, rejects NaN/Infinity/audio clips, returns a new project. E2E (`pip.spec.ts`): two layers (a full-size image on layer 1, a green square on layer 2 selected): dragging the overlay moves the green square on the preview canvas (pixel check at the old and new location), scaling via a corner handle shrinks it, rotation handle rotates a non-square clip (asymmetric colours), each gesture is ONE undo step and undo restores the exact transform (`getState()` deep-equal), Escape mid-drag restores, a drag on empty canvas moves nothing and does not deselect the clip, hidden/locked clip shows no overlay, numeric fields update the preview, an export of the PiP project (small size via the test knob) matches the preview pixels at the PiP location (ffmpeg frame vs expected colour).
- [ ] **Step 2: Run** the new specs → FAIL.
- [ ] **Step 3: Implement** pure geometry first, then the hook/overlay/fields; keep all files ≲200 lines.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npx playwright test tests/e2e/pip.spec.ts tests/e2e/rotation.spec.ts tests/e2e/preview.spec.ts` → PASS.
- [ ] **Step 5: Commit** `feat(ui): on-canvas transform editing for picture-in-picture`

### Task 7: Multi-layer robustness (performance, merge-all, formats)

**Files:**
- Modify: `src/ui/previewRenderer.ts` (decoder pool bound for many layers), `src/ui/edits.ts` (`replaceWithMedia`/merge-all handles N layers and clears track flags sensibly), `src/core/merge.ts` (`reframeProject` already per clip: add a test with 3 layers), `tests/e2e/layers-robust.spec.ts`, `tests/merge.test.ts`

**Interfaces:** none new; behaviour:
- Preview with 6 stacked visible video layers (each a short clip) keeps at most (visible active clips + `KEEP_RECENT`) decoders open; scrubbing across the timeline never exceeds that bound.
- "Merge all into one clip" with several layers renders the composite (all visible layers, audio from audible tracks), replaces ALL clips on ALL tracks with the single merged clip on the lowest video track, and keeps the (now empty) tracks and their names/flags except `locked`/`hidden` which reset to false so the result is visible; one undo step restores everything including track flags.
- Format switch (`reframeProject`) refits clips on every layer and keeps each layer's per-clip transform offsets only for `fit` recomputation as today (reset, documented).
- Locked tracks are skipped by merge-all? No: merge-all refuses with a toast when any track containing clips is locked.

- [ ] **Step 1: Write failing tests:** 6-layer preview decoder bound (counter via the existing dev hook) while scrubbing 5 positions; merge-all on 3 layers + 2 audio tracks with different volumes → single clip whose exported/decoded frame equals the composite (pixel) and whose audio is non-silent; undo restores the 5 tracks with flags; merge-all refuses with a locked track; reframe with 3 layers.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run** the new specs plus `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat: robust multi-layer preview, merge-all and reframe`

### Task 8: Whole-feature acceptance, docs and release gate

**Files:**
- Create: `tests/e2e/layers-journey.spec.ts`
- Modify: `README.md` (features, keyboard/gesture notes, limits: 8 layers/tracks), `docs/superpowers/specs/2026-11-10-clipforge-design.md` (note multi-layer as shipped)

- [ ] **Step 1: Write the journey test (failing until everything works together):** import with-audio.mp4 and a PNG; add a second video layer; put the video on layer 1 and the PNG on layer 2; shrink the PNG to 25% and move it to the top-right on the preview; mute nothing; hide layer 2 → preview and export show only the video; unhide, export at 1080p square project via the UI; ffprobe: h264/aac/duration; extract a frame with ffmpeg and check the PNG's colour at the expected corner pixel; reload the page → layers, names, flags and transforms restored; open a stored v1 project fixture (written to IndexedDB through the dev hook) → migrates, shows the same clips.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/layers-journey.spec.ts` → FAIL, fix wiring until PASS.
- [ ] **Step 3: Run the whole gate** `npm test && npm run typecheck && npm run build && npm run e2e && npm run e2e:preview`; all PASS, no flakes (new specs ×3).
- [ ] **Step 4: Update docs** as listed.
- [ ] **Step 5: Commit** `test,docs: multi-layer journey and docs`

---

## Self-Review

- **Spec coverage (this plan's share):** multi-track timeline (add/remove/reorder/rename, per-track hide/mute/solo/lock) → T1–T5; picture-in-picture via layered tracks, position/scale/rotation, opacity fields → T3 (layer drawing already exists), T6; reorder by drag is deferred (reorder via up/down buttons); preview/export parity → T3, T7, T8; project data migration → T1. Not in this plan: effects, text, transitions, keyframes, audio effects, speed (Plans 3–5).
- **Type consistency:** `Track` fields defined once (T1) and used in T2–T5; `visualClipsAt`/`audibleClips`/`trackAudible` signatures defined in T3 are what T5/T7 tests rely on; `setClipTransform`/geometry in T6 only.
- **Proportion:** steps give signatures, test assertions and exact behaviours; no function bodies.
- **Risks to verify early:** (1) the compositor's per-track-visibility change must not change draw order for existing projects; (2) `moveClip` across lanes currently decides the track by DOM hit-test (`useClipDrag.laneAt`) — T5 must keep that working with reversed lane order; (3) `classifySaved` migration must keep the restore-failure protections (unknown newer version → `unsupported`, no GC, autosave off).

## Roadmap (separate plans, each written in detail when the previous one ships; order proposed for your review)

- **Plan 3: Audio editing.** Detach audio from a video clip; waveforms in timeline; record a voiceover (needs the microphone: `vercel.json` `Permissions-Policy` must drop `microphone=()`); per-clip fade in/out, pan, track volume; audio effect chain (EQ, compressor/normalise, reverb, echo, pitch shift, low/high-pass, voice presets, basic noise reduction) built from one shared "clip chain" used by BOTH the live mixer and the export mixdown; auto-ducking. Data model v3 (clip `audio` settings, effect list).
- **Plan 4: Visual effects and looks.** WebGL2 effect registry (parameter schema + shader) with per-clip stacks and live preview: colour (brightness, contrast, saturation, exposure, temperature/tint, hue, shadows/highlights), looks (B&W, sepia, vintage film grain, teal-orange, vignette, Cinematic/Moody/Golden Hour/…, `.cube` LUT import), blur/sharpen/glow/pixelate, stylise (RGB split, glitch, VHS, mirror, invert), chroma key; overlays (lower thirds, subscribe button, progress bar, stickers). Splits `compositor.ts`/`gl.ts` first. Data model v4.
- **Plan 5: Animation and motion.** Keyframes (position/scale/rotation/opacity/effect parameters) with easing and a curve editor, motion paths, text clips with animation presets, transitions (fade, crossfade, wipe, slide, zoom, glitch — needs a clip-boundary overlap model), speed (0.25–4×, reverse, speed ramp, pitch-preserving audio), crop/rotate/flip. Touches every `duration = out − in` call site (14 listed in the code audit) via a `speed` clip property. Data model v5.
