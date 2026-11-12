# ClipForge Plan 5: Animation and Motion (DRAFT, awaiting the user's approval)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not start any task until the user has approved this plan and answered the "Open decisions for the user" section at the end.**

**Goal:** Make every picture clip animatable. Part 5A (detailed below) ships a keyframe engine for position, scale, rotation, opacity and every numeric effect parameter, with easing presets, a per-segment cubic-Bézier curve editor, keyframe diamonds on the timeline and inspector stopwatches, evaluated in ONE place so preview and export cannot drift. Parts 5B–5E (roadmap-level here, each gets its own detailed plan when its turn comes) add animation presets/loops/springs/motion-path editing, crop/flip/anchor, speed/reverse/ramps with pitch-preserving audio, and transitions.

**Architecture:** Pure keyframe data and maths in `src/core` (`easing.ts`, `keyframes.ts`, `animate.ts`, `keyframeEdits.ts`; DOM-free, like the effect schema). ONE resolver `resolveClip(clip, t, fps)` turns a stored clip into the clip "as seen at time t" (evaluated transform and effect params, same object when nothing is animated). The compositor calls it once per clip per frame at the top of `collectDraws` (Phase 1), so every downstream reader (draw matrix, effect pipeline, adjustment opacity, overlay textures) receives plain static values and needs no change; the inspector and on-canvas handles call the same resolver at the playhead. Edits stay pure `(Project, …) => Project`, one `apply` per gesture. Data moves to **v6**.

**Tech Stack:** TypeScript strict, React 19, WebGL2 (unchanged shaders: only uniforms vary), SVG for the curve editor and motion-path display, Vitest, Playwright with real pixel reads and ffmpeg frame grabs. No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-11-10-clipforge-design.md` (line 27 "Animation controls", line 23 transitions, line 25 speed, line 26 crop/flip, line 62 effects/keyframe interpolation, line 83 testing). Roadmap: `docs/superpowers/plans/2026-11-11-clipforge-roadmap-plans-4-13.md` §3 (animation controls) and §2 (speed editor, transitions are listed under Plan 7 there: see Open decision O2). Handoff: `PROJECT_HANDOFF.md` §8 "NEXT: Plan 5". Format and process: `docs/superpowers/plans/2026-11-11-clipforge-plan-4-visual-effects.md`, `docs/superpowers/ledgers/plan-4-visual-effects-ledger.md`. Ledger for this plan: `docs/superpowers/ledgers/plan-5-animation-ledger.md`.

Branch: `feature/plan-5-animation` (created from the deployed Plan 4 state, `22f797c`, data v5).

---

## 1. Decomposition into shippable parts

Plan 5 as listed in the handoff (keyframes + easing + curve editor, motion paths, presets, transitions, speed/reverse/ramp with pitch-preserving audio, crop/rotate/flip) is roughly four plans' worth of work. Proposed split:

| Part | Scope | Data | Depends on | Risk | Rough tasks | Deploy gate |
|---|---|---|---|---|---|---|
| **5A Keyframe engine** | keyframes on position/scale/rotation/opacity and numeric effect params, easing presets, per-segment cubic-Bézier editor, inspector stopwatches, timeline diamonds, key retime/delete/ease, read-only motion-path display, `[`/`]` key navigation | **v6** | Plan 4 (effect params) | Medium | 12 | after 5A Task 12 |
| **5B Presets and motion** | entrance/emphasis/exit/loop animation stack per clip (fade, slide ×4, zoom, pop, spin, drop, whip, bounce, pulse, shake, Ken Burns), spring easing, loop/ping-pong for keyframes, spatial Bézier motion paths with on-canvas key dragging and orient-along-path, copy/paste keyframes (animation transfer with size adaptation), save-as-preset | v7 | 5A | Medium-low | 8–9 | after 5B |
| **5E Crop, flip, anchor** | crop rectangle (inspector + on-canvas), flip H/V, anchor point (pivot for scale/rotation, keyframable via 5A), fit/reframe of cropped media | v8 | 5A (anchor keys) | Low-medium | 6 | after 5E |
| **5D Speed** | constant speed 0.25–4×, reverse, speed ramps (keyframed speed curve), freeze frame, pitch-preserving audio (time-stretch) and reverse audio, in live mixer and export | v9 | 5A (ramp curve), central source-time mapping | **High** | 11–12 | after 5D |
| **5C Transitions** | cut-attached transitions (fade through black, crossfade, wipe, slide, zoom, glitch) with handles, audio crossfade on the same cut, auto-transition on Join | v10 | 5A (easing), 5D's `sourceTimeAt` if 5D ships first | **High** | 9–10 | after 5C |

**Recommended order: 5A → 5B → 5E → 5D → 5C.** 5A is the foundation everything else evaluates through. 5B is the most visible creator value for the least risk. 5E is small and changes the geometry functions (`clipMatrix`, `clipCorners`, `fitTransform`) once, before speed and transitions multiply their call sites. 5D before 5C because 5D replaces every `duration = out − in` / `in + (t − start)` site with one speed-aware mapping; transitions (which need source handles past `out` and before `in`) should be built on that mapping from day one rather than retrofitted. The roadmap file assigns speed and transitions to Plan 7 and crop to Plan 8; the handoff assigns them to Plan 5. See **O2**.

**Data versions (recommendation, O1):** one bump per deployed part that changes data (v6 for 5A, then v7…v10 as each part ships), never speculative fields for later parts. A bump is cheap after 5A Task 1 centralises the version constant in test fixtures (today 18 files hard-code `version: 5`). Parts deployed together share one bump (e.g. if the user wants 5A+5B in one deploy, both are v6). Every bump: identity/repair migration step, `{version: N+1}` stays "unsupported" and is never overwritten, and each deploy makes saves one-way for older open tabs (they show "saved by a newer version" and protect the data).

**Risk ranking (highest first):** 5D speed (every duration site, reverse decode cost with long GOPs, pitch-preserving time-stretch in two audio engines, window seams) > 5C transitions (breaks the no-overlap invariant unless modelled on cuts; dual decode; audio crossfade through `chain.ts`) > 5A (new data across many edit paths, evaluated-vs-stored confusion, Delete-key semantics) > 5E (geometry change across handles/fit/effects working size) > 5B (procedural layer on top of 5A).

---

## 2. Global Constraints (all parts)

- TypeScript strict; 2 spaces, single quotes, semicolons; files ≲200 lines. Already at/over the limit and likely touched: `src/export/exporter.ts` 203, `src/media/decode.ts` 212, `src/audio/mixdown.ts` 199, `src/core/audioEdits.ts` 199, `src/render/gl.ts` 198, `src/render/compositor.ts` 195, `src/state/store.ts` 193, `src/render/overlayGeometry.ts` 193, `src/core/timeline.ts` 176, `src/core/model.ts` 170: split before extending. New CSS goes in a new `src/ui/animation.css` (not `styles.css`, 1211 lines).
- `src/core/` stays pure/no DOM. Edits are `(Project, …) => Project`, throw `TimelineError` for user-facing refusals, never mutate input, return the SAME reference for no-ops. Locked tracks refuse every keyframe edit.
- One gesture = ONE `apply` = one undo step. Diamond drags, curve-handle drags and on-canvas drags use local state until release. Store-bound commands use `guard(() => apply(...))`. Undo restores the exact previous project (JSON-equal, same reference for untouched tracks).
- Preview and export both render through `Compositor.renderFrame` → `collectDraws`; animation is evaluated there and ONLY there for pictures (UI reads the same resolver at the playhead). Evaluation is deterministic from (project, t): no `Math.random`, no wall clock; evaluation time is the clip-relative time snapped to the project frame (same rule as Plan 4 D6, `snapToFrame`), so preview frame N equals export frame N.
- Static projects render byte-identically to Plan 4 (every existing pixel spec is the oracle), and a clip with no keys takes a zero-allocation fast path.
- Geometry stays in FORMAT pixels; `Transform.x/y` offsets from the canvas centre, y down, rotation clockwise, scale = source px → canvas px. Track array order = compositing order. Mute wins over solo; hidden affects picture only.
- Project data version becomes **6** in 5A; unknown newer ⇒ `unsupported`, never overwritten; v1–v5 saves open unchanged (static).
- Keep every existing `data-testid`; new controls get new ones. `window.__clipforge` stays DEV-only (`grep -rl __clipforge dist` prints nothing).
- Never delete user media except via the verified-restore GC.
- TDD: failing test first; mutation-check important guards (state in the task report which guard was broken and which test caught it). Commit trailers (blank line before): `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: <current session URL>`.
- Never push or deploy without the user's explicit go-ahead; never touch other Vercel projects; never run `playwright install`; never run two e2e runs at once (port 5173).
- Gate per task: `npm test && npm run typecheck && npm run build` (+ `grep -rl __clipforge dist` empty) plus touched e2e specs; full `npm run e2e -- --trace off` (~15 min, 391 specs at Plan 4's end) at 5A Tasks 1, 5, 8, 11, 12; `npm run e2e:preview` before any deploy.

---

## 3. Part 5A: Keyframe engine (detailed)

### 3.1 Decisions to approve (rulings proposed; change any before execution)

- **D1 Scope of 5A.** Keyframes for transform (position as ONE 2-D property, scale, rotation, opacity) and every numeric effect parameter whose schema marks it animatable (all of them except `mirror.mode`; LUT `ref` and `enabled` are not params). Applies to video, image, overlay and adjustment clips (overlays have no effects, so transform only; adjustment clips use opacity and effect params; their position/scale/rotation are ignored by the renderer and not offered). Audio clip volume/pan/fades are NOT animated in 5A (Plan 9 hook, O8). Cost if wrong: one schema flag or one clip kind more/less.
- **D2 Data model (v6), additive and optional.** Keys live next to what they animate, so existing lifecycles keep working: `Clip.keys?: TransformKeys` and `VideoEffect.keys?: Record<paramKey, Keyframe[]>`. Absent or empty ⇒ static (the stored `transform` / `params` value is used exactly as today). A property is animated iff its key list has ≥ 1 key (one key = constant). Removing an effect removes its keys; `applyLook` replaces them with the look's (none); `moveVideoEffect` keeps them. While a property is animated its stored static value is kept untouched and is ignored by rendering; turning animation off writes the value at the playhead into the static field (After Effects stopwatch behaviour). Cost if wrong: a later move of keys into a central table is a migration.
- **D3 Key time base: source-anchored local time.** A key's `t` is in clip-local seconds: `local(t) = clip.in + snap(t − clip.start)` for sourced clips (video, image) and `snap(t − clip.start)` for sourceless clips (overlay, adjustment: `in` is ignored there, as today). Consequences, all exact: move/ripple/join/moveClip-to-another-track change nothing; trimming a sourced clip's start leaves keys on the same footage frame (they do not move in timeline time); trimming a sourceless clip's start shifts its keys by −Δ so they also stay put in timeline time (unlike the built-in overlay slide-in, which follows `clip.start` per Ruling T13-2); split gives each half the keys that define its own range (D9). 5D generalises `local()` through the speed mapping, so keys stay on their footage frame when speed changes. Cost if wrong: keys drift relative to footage on trims (the opposite choice), a bounded refactor inside `keyframes.ts`.
- **D4 Interpolation.** Each key carries the ease of the segment that STARTS at it (the last key's ease is unused but kept). Values interpolate linearly in value space after easing the time fraction: `v = a + (b − a)·ease(u)`. Before the first key: the first key's value; after the last: the last key's value. Position interpolates x and y with the same eased fraction (straight path in 5A; curved spatial paths are 5B). Rotation is unbounded degrees while animated (0 → 720 = two turns; keyed rotation clamped to ±36 000), static rotation keeps today's (−180, 180] normalisation. Scale interpolates linearly (what the curve editor shows; see O9 for the log-space alternative). Cost if wrong: zoom feel; one function.
- **D5 Easing set.** `linear`, `hold` (step at the next key), `easeIn`, `easeOut`, `easeInOut` (CSS cubic-bezier .42/0/1/1, 0/0/.58/1, .42/0/.58/1), `back`, `elastic`, `bounce` (the standard "out" variants, endpoints exact), and `bezier` with user handles `x1, x2 ∈ [0, 1]`, `y1, y2 ∈ [−1, 2]` (overshoot allowed). Overshoot is clamped at evaluation to the property's legal range (opacity 0..1, scale ≥ 0, effect params to their schema min..max; position and rotation unclamped). Spring is NOT in 5A (5B, O3). Cost if wrong: a preset list.
- **D6 Curve editor = per-segment cubic-Bézier editor** (two draggable handles on a unit square showing the eased progress curve, plus preset buttons), opened from a key. No full multi-key value-graph editor in 5A (O4). Cost if wrong: a graph editor later reuses the same `Ease` data.
- **D7 One resolver, called in one render place.** `resolveClip(clip, t, fps): Clip` returns the same object for a static clip, else a shallow copy whose `transform` and `effects[].params` hold evaluated values and whose `keys` are dropped. `collectDraws` (drawCollect.ts:77) resolves each clip once at the top of its loop; nothing below it changes. The UI (inspector values, on-canvas handles, motion path) calls the same function at the playhead. A source-scan unit test lists every reader of `.transform` / `.params` in `src/render` and `src/ui` and fails on an unlisted one (same idea as Plan 4's `media[` audit).
- **D8 Editing an animated property writes a key at the playhead.** All value edits (inspector number fields, effect sliders, on-canvas drag) go through `setValueAt(p, clipId, target, value, t)`: static ⇒ today's static edit (same clamps, same refusals); animated ⇒ upsert the key at `local(t)` (replace a key within `KEY_EPS = 1e-4 s`, else insert with the ease of the segment it splits, else `linear` at the ends). Editing an animated property while the playhead is outside the clip is refused: `TimelineError('Move the playhead onto the clip to set a keyframe')` (O10). `updateVideoEffect` and `setClipTransform` keep their static semantics but REFUSE a patch to an animated property (`'This setting is animated: change it at the playhead'`), so no code path can make a silent no-op edit.
- **D9 Clip operations.** `splitClip`: both halves keep the keys that matter to them: keys inside the half's range plus the nearest key beyond each of its ends (exact: evaluation inside the range only depends on segments overlapping it); sourceless right halves shift their keys by −(split − start). `trimClip`: keys are kept even when outside the new range (extending the clip back restores the curve); sourceless start trims shift by −Δ (D3). `reframeProject` / `reframeOverlay`: every position key scales like `x/y` (`·w′/w`, `·h′/h`) and every scale key like `scale` (`·√(w′h′/wh)`); a clip with position or scale keys always counts as customised (never refit); the exact round trip of Ruling J must still hold (test). `setClipFit` removes position and scale keys (the fit defines the framing); `resetClipTransform` removes all transform keys. `detachAudio` gives the audio twin NO keys (audioEdits.ts:102 spreads `...clip`). Merge-all bakes animation into the rendered clip (it has no keys). `cloneVideoEffects` deep-copies keys.
- **D10 Timeline UI.** The SELECTED clip shows one row of summary diamonds (one diamond per distinct key time over all its properties, inside its visible range; small arrows when keys exist beyond either edge). Click = move the playhead there and select the keys at that time (Shift adds); drag = retime all selected keys, snapped to whole frames, committed ONCE on release (`moveKeys`); Delete/Backspace with selected keys deletes the keys, not the clip (key selection is UI state, not history, cleared on clip selection change, undo, or Escape). Per-property key rows live in the inspector (stopwatch, ◀ ◆ ▶ buttons, mini key strip). `[` / `]` jump the playhead to the previous/next key of the selected clip. Cost if wrong: shortcuts and layout only.
- **D11 Limits.** At most 500 keys per property (`MAX_KEYS`); key times and values must be finite; migration repairs hand-edited saves (sort by `t`, drop non-finite/duplicate times keeping the last, repair unknown eases to `linear`, clamp values per D5, truncate to `MAX_KEYS`, drop keys of unknown params and of non-animatable params).
- **D12 Not in 5A:** presets/animation stack, spring, loops, curved/spatial motion paths and on-canvas key dragging, copy/paste keys, anchor point, crop/flip, speed, transitions, audio automation, text animation (Plan 6), a full value-graph editor, keyframes on track/master properties.

### 3.2 Data model sketch (v6)

```ts
// src/core/easing.ts
export type EaseKind = 'linear' | 'hold' | 'easeIn' | 'easeOut' | 'easeInOut' | 'back' | 'elastic' | 'bounce' | 'bezier';
export interface Ease { kind: EaseKind; /** only for 'bezier': [x1, y1, x2, y2] */ bezier?: [number, number, number, number] }

// src/core/model.ts (additions)
export interface Keyframe { t: number; v: number; ease: Ease }               // t: clip-local seconds (D3)
export interface PositionKeyframe { t: number; x: number; y: number; ease: Ease }
export interface TransformKeys { position?: PositionKeyframe[]; scale?: Keyframe[]; rotation?: Keyframe[]; opacity?: Keyframe[] }
export interface Clip { /* …v5 fields… */ keys?: TransformKeys }              // absent = static
export interface VideoEffect { /* …v5 fields… */ keys?: Record<string, Keyframe[]> }
export interface Project { version: 6; /* … */ }

// src/core/videoEffects.ts: ParamDef gains `animatable?: false` (set on mirror.mode only).
```

Static clips are untouched by the migration (no `keys` field is added); v5 → v6 is identity plus repair of any `keys` present (a v5 save never has them). Lists are kept sorted by `t` with unique times (invariant enforced by every edit and by migration).

### 3.3 Time semantics summary

| Operation | Keys | Exactness test |
|---|---|---|
| move, ripple delete, join, move to another track | unchanged | resolved values at every frame equal before/after (offset by the move) |
| trim start (sourced) / end (any) | unchanged (may lie outside the range) | frames inside the new range unchanged |
| trim start (sourceless) | shifted by −Δ | frames inside the new range unchanged |
| split | each half keeps in-range keys + nearest beyond each end; sourceless right half shifted | property test: random keys/eases/split points, every frame of both halves equals the original |
| reframe | position/scale keys scaled like the static fields | round trip A→B→A returns the same keys (Ruling J tolerance) |
| setClipFit / Reset | removes position+scale / all transform keys | one undo step restores them |
| detach audio | twin has no keys | — |
| merge all | baked into pixels | export of merged clip matches the animated preview |
| 5D speed (later) | `local()` goes through the speed map | keys stay on the same footage frame |

Evaluation time is always `snapToFrame(t − clip.start, fps)` (moved from `src/render/effects/pipeline.ts:30-39` to `src/core/fps.ts` in Task 1 and re-exported, because core may not import render).

### 3.4 Render integration

- `collectDraws` (drawCollect.ts:72-125): `for (const raw of visualClipsAt(p, t)) { const clip = resolveClip(raw, t, p.format.fps); … }`. `Draw.clip` / `AdjustmentDraw.clip` are resolved clips, so `compositor.drawPicture` (compositor.ts:180-184, `clipMatrix(d.size, d.clip.transform, …)` and opacity), `applyClipEffects` (clipEffects.ts:25-27, reads `d.clip.effects`), `applyAdjustment` (adjustment.ts:46, `clip.transform.opacity`) and `luts.forFrame` (compositor.ts:138) need no change.
- Overlay textures (overlays/textures.ts:83-107): the texture size depends on `clip.transform.scale` (line 88). With animated scale that would redraw and re-upload the Canvas2D texture every frame. Fix in Task 5: size the texture from the clip's maximum scale over its keys (`maxScale(raw)`), passed alongside the resolved clip, so the texture is stable across frames and sharp at the largest size.
- Effects: animated params only change uniforms (no recompile); an animated blur radius changes the pass count per frame (blurMath), which is already supported. Time-based effects keep their own seeding (D6 of Plan 4).
- Determinism: easing maths in doubles, evaluated at `n/fps` in export and at the snapped playhead in preview; elastic/bounce use `Math.sin`/`Math.pow` only (same engine for preview and export).
- Hidden tracks: `visualClipsAt` already skips them before resolution (no evaluation cost).

### 3.5 UI design

- **Inspector (TransformFields.tsx:57-100, VideoEffectRow.tsx:21-60):** fields show the RESOLVED value at the playhead (re-render on playhead change only while the selected clip is animated). Each property row gets a stopwatch toggle (`kf-toggle-<prop>`, `fx-<effectId>-<param>-kf`), previous/next buttons (`kf-prev-<prop>`, `kf-next-<prop>`), an add/remove-key-at-playhead diamond (`kf-key-<prop>`, `aria-pressed` when a key is under the playhead), and a mini strip of that property's keys over the clip (`kf-strip-<prop>`, diamonds `kf-strip-key`). Position's stopwatch covers X and Y together. Committing a field = ONE `apply(setValueAt…)`. Rotation's field range widens to ±36 000 while rotation is animated.
- **On-canvas drag (TransformOverlay.tsx:44, useTransformDrag.ts:71-78/104/132, Preview.tsx:51):** handles sit at the resolved transform; the live preview during a drag shows exactly what release will commit (`withLiveValue(p, clipId, patch, t)` = the pure keyed write without guards, replacing `withClipTransform` for animated clips); release commits ONE `apply(setTransformAt(...))`; the drag-cancel subscription also ends the drag when the clip's `keys` reference changes.
- **Timeline (ClipView.tsx:42-77, Lane.tsx):** summary diamonds for the selected clip (`keyframe-row`, `keyframe-diamond` with `data-time`, keyboard-focusable buttons, `aria-label` "Keyframe at 1.20 s"), selection state in a small non-history store slice, drag with a 4 px threshold (drag.ts `pastThreshold`), frame-snapped and snapped to the playhead, refused moves (collision with an unselected key, outside the clip range) snap back with a toast. Delete/Backspace: keys first when selected (keys.ts:67-76 gets the routing; `shortcutBlockedByRange` rules still apply).
- **Ease editor (`EaseEditor.tsx`, popover):** opened from a selected key (`kf-ease-open`) in the inspector strip or by double-clicking a timeline diamond; preset buttons (`ease-preset-<kind>`), SVG square with two handles (`ease-handle-1`, `ease-handle-2`), numeric inputs for the four values (`ease-x1`…`ease-y2`), arrow keys nudge a focused handle by 0.01 (commit on key release: one undo step per press, not per auto-repeat), Escape closes without committing. Applies to all selected keys in one `apply`.
- **Motion path (read-only in 5A):** when the selected clip has position keys, the transform overlay draws the path (resolved position sampled once per frame over the clip's range, max 2 000 samples, `motion-path`) and a dot per key (`motion-key`); clicking a dot moves the playhead to that key.
- **Keyboard:** `[` / `]` previous/next key of the selected clip (new `Shortcut`s `prevKey`/`nextKey`); Delete/Backspace on selected keys; diamonds and strip keys are buttons reachable with Tab; Enter on a diamond opens the ease editor.

### 3.6 File Structure (5A)

| File | Responsibility |
|---|---|
| `src/core/easing.ts` (create) | `Ease`, `EaseKind`, `easeAt`, `cubicBezierAt`, `EASE_PRESETS`, `repairEase` |
| `src/core/keyframes.ts` (create) | `localTime`, `valueAt`, `positionAt`, `upsertKey`, `splitKeys`, `shiftKeys`, `scaleKeys`, `maxScale`, `KEY_EPS`, `MAX_KEYS` |
| `src/core/animate.ts` (create) | `resolveClip`, `resolvedTransform`, `isAnimated`, `animatedTargets` |
| `src/core/keyframeEdits.ts` (create) | `AnimTarget`, `KeyRef`, `setAnimated`, `setValueAt`, `removeKeys`, `moveKeys`, `setKeyEase` |
| `src/core/migrateKeys.ts` (create) | v6 key repair used by `migrate.ts` |
| `src/core/model.ts`, `migrate.ts`, `timeline.ts`, `merge.ts`, `overlays.ts`, `audioEdits.ts`, `clipEffects.ts`, `videoEffects.ts`, `videoEffectEdits.ts`, `fps.ts` (modify) | v6 types, migration, split/trim/reframe/detach/clone rules, `animatable` flag, static-edit refusals, frame snapping moved to core |
| `src/ui/transformEdits.ts` (modify, split if > 200) | `setTransformAt`, `withLiveValue`; Reset/fit key rules |
| `src/render/drawCollect.ts`, `src/render/overlays/textures.ts` (modify) | resolve per frame; stable overlay texture size |
| `src/ui/KeyframeControls.tsx`, `KeyframeStrip.tsx`, `KeyframeRow.tsx`, `EaseEditor.tsx`, `MotionPath.tsx`, `keyframeCommands.ts`, `keySelection.ts`, `animation.css` (create) | UI |
| `src/ui/TransformFields.tsx`, `VideoEffectRow.tsx`, `ClipView.tsx`, `TransformOverlay.tsx`, `useTransformDrag.ts`, `Preview.tsx`, `keys.ts`, `App`-level key handler (modify) | wiring |
| `tests/helpers/project.ts` (create) | shared `CURRENT_VERSION` and fixture builders |

---

### Task 1: Preparation (behaviour-preserving)

**Files:** Create `tests/helpers/project.ts`; modify the 18 files that hard-code `version: 5` (`grep -rln "version: 5" tests`), `src/core/fps.ts` (receives `frameIndex`, `snapToFrame`), `src/render/effects/pipeline.ts` (re-exports them), `src/core/timeline.ts` (split `splitClip`/`trimClip` into `src/core/clipEdits.ts` if Task 4's additions would pass 200 lines; keep `timeline.ts` re-exporting), `src/state/store.ts` (only if Task 8's key-selection slice needs room: extract `reconcileUi` to its own file).

**Interfaces:**
- Produces: `export const CURRENT_VERSION` (from `src/core/model.ts`, currently 5) used by every fixture; `frameIndex(t, fps)`, `snapToFrame(t, fps)` in `src/core/fps.ts` (same bodies, same results); no behaviour change anywhere.

- [ ] **Step 1:** Baseline: full `npm run e2e -- --trace off` and `npm test`; record counts (expected 391 / 1182).
- [ ] **Step 2:** Move code only; fixtures import `CURRENT_VERSION` (tests asserting "a v5 save migrates" keep literal 5 where the literal is the point).
- [ ] **Step 3:** Gate + full e2e ⇒ identical counts. **Step 4: Commit** `refactor: centralise project version in fixtures, frame snapping in core`.

### Task 2: Easing maths (pure)

**Files:** Create `src/core/easing.ts`, `tests/easing.test.ts`.

**Interfaces:**
- Produces: `easeAt(e: Ease, u: number): number` (u clamped to [0, 1]; `easeAt(e, 0) === 0` and `easeAt(e, 1) === 1` exactly for every kind; `hold` ⇒ 0 for u < 1); `cubicBezierAt(x1, y1, x2, y2, u)` (solve x(s) = u by Newton with bisection fallback, |x error| < 1e-7, monotone in u because x1, x2 ∈ [0, 1]); `EASE_PRESETS: Record<'easeIn' | 'easeOut' | 'easeInOut', [number, number, number, number]>`; `repairEase(raw: unknown): Ease` (unknown kind ⇒ linear; bezier handles clamped x∈[0,1], y∈[−1,2], non-finite ⇒ linear); `isSameEase(a, b)`.

- [ ] **Step 1: Failing tests:** exact endpoints for all kinds; `linear` identity; `easeInOut(0.5) = 0.5 ± 1e-9`; CSS reference values for the three presets at u = 0.25/0.5/0.75 (±1e-6, values from the CSS cubic-bezier definition); `bezier(0,0,1,1)` = linear ±1e-7; monotone for presets and random handles with y in [0, 1] (500 draws); `back` ("out" variant) overshoots above 1 then settles (max ≈ 1.1 for c1 = 1.70158; test the bound); `elastic`/`bounce` finite and bounded in [−0.5, 1.5]; `repairEase` cases (NaN, x1 = 2, unknown kind, missing bezier). Mutation check: change the Newton tolerance or swap x1/y1 ⇒ a reference test fails.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate. **Step 6: Commit** `feat: easing maths (presets and cubic bezier)`.

### Task 3: Data model v6, key evaluation and the resolver

**Files:** Create `src/core/keyframes.ts`, `src/core/animate.ts`, `src/core/migrateKeys.ts`, `tests/keyframes.test.ts`, `tests/animate.test.ts`, `tests/migrate-keys.test.ts`; modify `src/core/model.ts` (types, `version: 6`, `CURRENT_VERSION = 6`, `emptyProject`), `src/core/migrate.ts` (`CURRENT = 6`, line 9; accept 5 at line 120; `toClip` repairs `keys`, lines 76-90), `src/core/migrateEffects.ts` (effect `keys` repair), `src/core/videoEffects.ts` (`animatable: false` on `mirror.mode`), `tests/migrate.test.ts`, `tests/e2e/layers-migration.spec.ts`.

**Interfaces:**
- Consumes: `easeAt`, `repairEase` (Task 2); `snapToFrame` (Task 1).
- Produces:
  - Types of §3.2; `KEY_EPS = 1e-4`; `MAX_KEYS = 500`.
  - `localTime(clip: Clip, t: number, fps: number): number` (D3: `(isSourceless(clip) ? 0 : clip.in) + snapToFrame(t − clip.start, fps)`).
  - `valueAt(keys: readonly Keyframe[], u: number): number`, `positionAt(keys: readonly PositionKeyframe[], u: number): { x: number; y: number }` (binary search; D4).
  - `resolveClip(clip: Clip, t: number, fps: number): Clip` (D7: same reference when `!isAnimated(clip)`; result has no `keys`; clamps per D5), `resolvedTransform(clip, t, fps): Transform`, `isAnimated(clip): boolean`, `maxScale(clip): number` (max of static scale and every scale key).
  - Migration v5 → v6 (identity for static data) and v6 repair per D11; `{version: 7}` ⇒ `newer`.
- [ ] **Step 1: Failing tests:** `valueAt` before/at/between/after keys, single key constant, hold steps exactly at the next key, ease applied to the fraction, binary search on 500 keys equals a linear scan (property test); `positionAt` uses one eased fraction for x and y; `localTime` for sourced vs sourceless clips and snapping (t between frames maps to the frame start; fps 25 and 30); `resolveClip` returns the SAME object for a static clip (mutation check: always copy ⇒ test fails), evaluated transform and effect params for an animated one, clamps opacity/scale/effect params under `back` overshoot, leaves rotation/position unclamped, drops `keys`; migration: v5 project with every clip kind ⇒ v6, `keys` absent, input not mutated, idempotent; hand-edited v6 with unsorted keys, duplicate times, NaN values, unknown ease, keys on `mirror.mode`, keys for an unknown param, 600 keys ⇒ repaired exactly per D11; overlay `keys` kept; audio clip `keys` dropped; `{version: 7}` ⇒ `newer`.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** update the e2e migration spec (seed a v5 IndexedDB project, reload ⇒ re-saved as v6, picture unchanged; `{version: 7}` stays protected and is never overwritten). Gate + `npx playwright test tests/e2e/layers-migration.spec.ts tests/e2e/restore.spec.ts`. **Step 6: Commit** `feat: project data v6 (keyframes) and the clip resolver`.

### Task 4: Pure keyframe edits and clip-operation rules

**Files:** Create `src/core/keyframeEdits.ts`, `tests/keyframe-edits.test.ts`, `tests/keyframe-clip-ops.test.ts`; modify `src/core/timeline.ts` (or `clipEdits.ts` from Task 1: `splitClip` lines 102-123, `trimClip` lines 79-100), `src/core/clipEffects.ts` (`cloneVideoEffects` deep-copies keys; a split variant applies `splitKeys`), `src/core/merge.ts` (`reframeProject` lines 104-132: keys scale, animated ⇒ customised), `src/core/overlays.ts` (`reframeOverlay` lines 104-115), `src/core/audioEdits.ts` (`detachAudio` line 102: twin without keys), `src/core/videoEffectEdits.ts` (`updateVideoEffect` lines 44-58 refuses animated params), `src/ui/transformEdits.ts` (`setClipTransform` refuses animated props; `resetClipTransform` clears transform keys; `setTransformAt`, `withLiveValue`), `src/ui/edits.ts` (`setClipFit` lines 101-112 clears position/scale keys).

**Interfaces:**
- Consumes: Task 3 types and helpers; `assertUnlocked`, `findClip`, `TimelineError`.
- Produces:
  - `type AnimTarget = { kind: 'transform'; prop: 'position' | 'scale' | 'rotation' | 'opacity' } | { kind: 'effect'; effectId: Id; param: string }`; `interface KeyRef { target: AnimTarget; t: number /* local */ }`.
  - `setAnimated(p, clipId, target, on: boolean, t: number): Project` (on: one key at `localTime` with the resolved value, `linear`; off: static value := resolved value at t, keys removed; same reference if already in that state; non-animatable param, audio clip, adjustment position/scale/rotation, overlay effect ⇒ `TimelineError`).
  - `setValueAt(p, clipId, target, value: number | { x: number; y: number }, t: number): Project` (D8; static path delegates to the existing static edit and its clamps; animated path upserts; outside-clip refusal; same reference when the value equals the key's).
  - `setTransformAt(p, clipId, patch: Partial<Transform>, t): Project` (routes each field: x/y ⇒ position (the missing coordinate taken from the resolved value), others ⇒ their target; ONE resulting project).
  - `withLiveValue(p, clipId, patch, t): Project` (the same write without lock guard or clamping, for the live drag preview only, never committed).
  - `removeKeys(p, clipId, refs: KeyRef[])` (removing the last key of a property leaves it static at that key's value), `moveKeys(p, clipId, refs, delta: number)` (refuses `'Keyframes would overlap'` when a moved key lands within `KEY_EPS` of an unselected key, refuses `'Keyframes must stay on the clip'` outside the clip's visible local range; selected keys keep their order), `setKeyEase(p, clipId, refs, ease)`; all lock-guarded, same reference on no-op, ≤ `MAX_KEYS` else `TimelineError('At most 500 keyframes per setting')`.
- [ ] **Step 1: Failing tests:** each edit's exact result, refusals (locked, audio, outside clip, overlap, max keys, non-finite value, animated-param static patch), same-reference no-ops; split exactness property test (D9/§3.3: 300 random clips with random keys/eases, sourced and sourceless, every frame of both halves equals the original within 1e-9); split keeps only the needed keys (count assertion); trim start sourced/sourceless frame equality; reframe A→B→A round trip of keyed clips and overlays (Ruling J tolerance) and "animated never refits"; `setClipFit`/Reset remove the documented keys and undo (store test) restores them; `detachAudio` twin has no keys; `cloneVideoEffects` gives independent key arrays (mutate one, other unchanged); `applyLook` drops old effect keys. Mutation checks: remove the sourceless shift in split ⇒ property test fails; drop the "nearest key beyond the end" ⇒ property test fails.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + `npx playwright test tests/e2e/pip.spec.ts tests/e2e/layers-ui.spec.ts tests/e2e/overlays-ui.spec.ts` (static behaviour unchanged). **Step 6: Commit** `feat: keyframe edits and clip-operation rules`.

### Task 5: Render integration, parity and the reader audit

**Files:** Create `tests/transform-readers.test.ts`, `tests/e2e/keyframes-render.spec.ts`, `tests/e2e/keyframes-parity.spec.ts`; modify `src/render/drawCollect.ts` (line 77 loop), `src/render/overlays/textures.ts` (lines 83-107: texture size from `maxScale`), harness helpers if needed (`tests/e2e/harness-helpers.ts`).

**Interfaces:**
- Consumes: `resolveClip`, `maxScale` (Task 3).
- Produces: resolved clips in every `Draw`/`AdjustmentDraw`; `OverlayTextures.get(clip, format, t, fps, pixelScale, textureScale?)` with a texture key independent of the per-frame scale; `tests/transform-readers.test.ts` scans `src/render/**` and `src/ui/**` for `.transform` / `.params` / `.effects` reads and compares with an explicit allowlist (each entry commented "reads resolved clip" or "reads stored value on purpose").
- [ ] **Step 1: Failing tests:** e2e on solid-colour fixtures through the real compositor: opacity keys 0 → 1 over 1 s (linear) ⇒ the frame at 0.5 s has mean pixel at half (±2/255) and at 0.25 s with `easeIn` matches `easeAt` (±2/255); position keys move a 100 px square: centroid at the expected x at 3 frame times (±1 px), `hold` jumps exactly at the key frame; scale and rotation keys checked by bounding box/corner pixels; an animated colour `brightness` and blur `radius` match the static render of the evaluated value at the same frame (±1/255); adjustment-layer opacity keys; overlay with animated scale renders a texture that is NOT re-uploaded per frame (overlay texture stats unchanged across 10 frames) and is sharp at max scale; a clip with no keys renders byte-identical to before (existing pixel specs unchanged, plus one explicit before/after hash); parity: export 1080p of an animated stack (position + opacity + colour + grain) at 30 and 25 fps, ffmpeg frame N vs preview frame N (mean abs diff < 3/255; grain per Ruling T11-1); preview at a playhead between frames equals the frame start; hidden track with keys is never resolved (counter). Reader audit test fails on an unlisted reader (mutation check: add a dummy `clip.transform` read in a render file ⇒ fails).
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + full `npm run e2e -- --trace off`. **Step 6: Commit** `feat: animate clips in the compositor (preview and export)`.

### Task 6: Inspector stopwatches for transform and on-canvas keyed drag

**Files:** Create `src/ui/KeyframeControls.tsx`, `src/ui/KeyframeStrip.tsx`, `src/ui/keyframeCommands.ts`, `src/ui/animation.css`, `tests/keyframe-commands.test.ts`, `tests/e2e/keyframes-ui.spec.ts`; modify `src/ui/TransformFields.tsx` (values from `resolvedTransform` at the playhead, stopwatch/prev/next/key per row, rotation range when animated), `src/ui/TransformOverlay.tsx` (line 44: resolved transform), `src/ui/useTransformDrag.ts` (start = resolved transform; live via `withLiveValue`; release ⇒ ONE `setTransformAt` apply; cancel when `keys` reference changes, line 132), `src/ui/Preview.tsx` (line 51 live preview through `withLiveValue`).

**Interfaces:**
- Consumes: Task 4 edits; `useEditor` playhead.
- Produces: `keyframeCommands.ts` (`guard(() => apply(...))`): `toggleAnimatedCmd(clipId, target)`, `setValueAtCmd(clipId, target, value)`, `toggleKeyAtPlayheadCmd(clipId, target)`, `jumpToKeyCmd(clipId, target | null, dir: -1 | 1)` (moves the playhead only, no history); test ids per §3.5.
- [ ] **Step 1: Failing e2e:** stopwatch on Scale creates one key (ONE undo step); moving the playhead and typing a new scale adds a second key; the preview pixel at the midpoint shows the interpolated size; the field shows the interpolated value while scrubbing; on-canvas drag at a third time adds a third key in ONE undo step and the live preview during the drag equals the committed frame (pixel compare before release vs after); stopwatch off keeps the value at the playhead and removes keys (ONE step; undo restores the keys exactly: project JSON equal); typing while the playhead is outside the clip ⇒ toast, no change; locked track ⇒ controls disabled; prev/next buttons move the playhead to keys; Escape during a keyed drag cancels with no history change; Space still plays from a mouse-focused stopwatch button (input-modality rule).
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + `inspector`, `pip`, `layers-ui`, `layers-ui-keys`, `overlays-ui` specs. **Step 6: Commit** `feat(ui): transform keyframes in the inspector and on canvas`.

### Task 7: Effect-parameter keyframes in the effects inspector

**Files:** modify `src/ui/VideoEffectRow.tsx` (ParamSlider lines 21-60: shows resolved value at the playhead, release ⇒ `setValueAtCmd`; stopwatch/key/strip per animatable param; the chroma key colour picker commits all three params in ONE apply as keys when animated), `src/ui/EffectsInspector.tsx`; create `tests/e2e/keyframes-effects-ui.spec.ts`.

- [ ] **Step 1: Failing e2e:** animate Colour brightness from −0.5 to 0.5 ⇒ the preview pixel follows (midpoint ±2/255); slider release writes ONE key per release (arrow-key auto-repeat on the slider is one step per release, Plan 3 rule); `mirror.mode` has no stopwatch; removing the effect removes its keys (ONE step, undo restores effect and keys); applying a look replaces the animated stack in one step; adjustment-layer effect params animate; overlays show no effects UI (unchanged).
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + `effects-ui`, `effects-ui-lut`, `adjustment-app`. **Step 6: Commit** `feat(ui): keyframes for effect parameters`.

### Task 8: Timeline keyframe diamonds, key selection and keyboard

**Files:** Create `src/ui/KeyframeRow.tsx`, `src/ui/keySelection.ts` (non-history state + pure helpers), `src/ui/keyDrag.ts` (DOM-free maths: frame snapping, playhead snapping, refusal preview), `tests/key-drag.test.ts`, `tests/e2e/keyframes-timeline.spec.ts`; modify `src/ui/ClipView.tsx` (row under the name for the selected clip), `src/ui/keys.ts` (`prevKey`/`nextKey` shortcuts; Delete routing helper), the editor's key handler (keys first when selected), `src/state/store.ts` (key-selection slice cleared on selection change and undo/redo; split first if needed).

- [ ] **Step 1: Failing tests:** unit: summary diamonds = distinct key times across properties within the visible range, out-of-range indicators, frame snapping of a drag delta at 25/30/60 fps, playhead snap within 8 px; e2e: click a diamond ⇒ playhead at the key and the key selected; drag ⇒ keys retimed by whole frames, ONE undo step, the animation follows (pixel at the new time); a drag onto another key snaps back with a toast and no history change; Shift-click multi-select and drag moves all; Delete with keys selected removes keys and NOT the clip; Delete with no keys selected still deletes the clip (existing spec green); `[`/`]` jump between keys; Tab reaches diamonds, Enter opens the ease editor stub (Task 9 fills it); diamonds hidden for unselected clips; locked track: diamonds visible, drag/delete refused.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + full `npm run e2e -- --trace off` (shortcut routing touches every keyboard spec). **Step 6: Commit** `feat(ui): keyframe diamonds on the timeline`.

### Task 9: Ease presets and the cubic-Bézier curve editor

**Files:** Create `src/ui/EaseEditor.tsx`, `src/ui/easeEditorMath.ts` (DOM-free: handle ↔ SVG coordinates, clamping, nudge), `tests/ease-editor-math.test.ts`, `tests/e2e/keyframes-ease.spec.ts`; modify `KeyframeStrip.tsx`, `KeyframeRow.tsx` (open the editor), `keyframeCommands.ts` (`setEaseCmd`).

- [ ] **Step 1: Failing tests:** unit: coordinate round trips, clamping x∈[0,1] y∈[−1,2], nudge steps; e2e: choose `easeIn` on a segment ⇒ the pixel at the segment's quarter point matches `easeAt` (±2/255) and is ONE undo step; dragging handle 1 commits ONCE on release (history length +1) and the preview reflects the new curve; numeric inputs commit on Enter/blur; arrow-key nudges commit once per key release; Escape closes without a change; applying to several selected keys is one step; `hold` shows a step and the preview jumps at the next key's frame.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + specs. **Step 6: Commit** `feat(ui): easing presets and curve editor`.

### Task 10: Motion-path display

**Files:** Create `src/ui/MotionPath.tsx`, `src/ui/motionPathMath.ts` (DOM-free sampling: one sample per frame, max 2 000, plus key points), `tests/motion-path-math.test.ts`, `tests/e2e/keyframes-path.spec.ts`; modify `src/ui/TransformOverlay.tsx` (render the path under the handles; keep ≤ 200 lines).

- [ ] **Step 1: Failing tests:** unit: sample count bounded, endpoints equal the first/last key positions, hold segments produce a jump; e2e: a selected clip with three position keys shows `motion-path` through the three `motion-key` dots at the expected CSS positions (±1 px); clicking a dot moves the playhead to that key; no path for a clip without position keys or when not selected; the path follows a format switch (reframe).
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + `pip`, `keyframes-ui`. **Step 6: Commit** `feat(ui): motion path display`.

### Task 11: Robustness, performance and integration guards

**Files:** Create `tests/e2e/keyframes-robust.spec.ts`, `tests/keyframe-perf.test.ts`; modify only what the tests expose.

- [ ] **Step 1: Guarding tests:** split/trim/move/ripple/join/merge-all on animated clips in the real app (frame pixels before/after equal where the core says they must; merge-all export equals the animated preview); reframe 16:9 → 9:16 → 16:9 with animated clips (pixels and keys equal); reload restores keys exactly (project JSON); undo/redo walk across 10 keyframe gestures restores each state exactly; export of a 10 s project with 8 animated clips (all properties + 2 animated effects each) at 1080p completes and frame-for-frame determinism holds (two exports hash-equal per frame); performance: `resolveClip` for 16 clips × 6 properties × 500 keys < 0.2 ms per frame in Node (relative guard, numbers reported), preview frame time with 8 animated clips within 1.2× the same project static on SwiftShader; memory: overlay texture count/bytes unchanged by animated scale; autosave size grows linearly (≈ 60 bytes per key, reported).
- [ ] **Step 2:** Fix whatever the tests expose (if nothing, say so). **Step 3:** gate + full `npm run e2e -- --trace off`. **Step 4: Commit** `test: keyframe robustness, parity and performance guards`.

### Task 12: Journey, docs, ledger, QA checklist, final review

**Files:** Create `tests/e2e/keyframes-journey.spec.ts`, `docs/superpowers/ledgers/plan-5a-manual-qa-checklist.md`; modify `README.md` (animation section, limits: 500 keys per setting, no presets yet, speed/transitions not yet), `PROJECT_HANDOFF.md`, `CLAUDE.md` (data version v6, Plan 5 status), `docs/superpowers/ledgers/plan-5-animation-ledger.md`.

- [ ] **Step 1:** Journey e2e: import a video and an image; Ken-Burns-style scale + position keys on the image with `easeInOut`; opacity fade-in keys on the video; animate a colour effect; edit an ease with the curve editor; split the image clip; reload (project JSON exact); export 1080p; ffprobe duration within 1 frame; three frame grabs match the preview; undo chain one step per gesture.
- [ ] **Step 2:** Manual checklist (real desktop Chrome on a Mac): animation smoothness at 30/60 fps on real footage, curve editor feel with a trackpad, keyframe diamonds at different zoom levels, Delete-key behaviour, export in QuickTime matches preview, Safari unverified. (Plan 4's checklist is still unrun: run both together.)
- [ ] **Step 3:** Full gate: `npm test && npm run typecheck && npm run build && npm run e2e && npm run e2e:preview`; `grep -rl __clipforge dist` empty.
- [ ] **Step 4:** Final whole-branch review (fresh opus reviewer), one themed fix wave, scoped re-review. **Step 5: Commit** `docs,test: keyframes journey, QA checklist and handoff`. **Ask the user before any push or deploy** (deploying makes saves v6, one-way for older tabs).

*— Deployment gate: 5A can be deployed here (data v6). —*

### 3.7 Review focus (5A)

1. **Silent no-op edits:** any path that writes a static value of an animated property (inspector field, slider, fit, reset, look, reframe) must either write a key or refuse.
2. **Split/trim exactness** for sourced and sourceless clips (property tests) and the Ruling J round trip with keys.
3. **Evaluated vs stored:** every reader of `transform`/`params` in render/UI is in the audited allowlist; inspector shows resolved values; handles sit on the resolved picture.
4. **One apply per gesture:** diamond drags, curve handles, on-canvas keyed drags, slider releases, multi-key ease changes.
5. **Delete/Backspace semantics** with keys vs clips selected; key selection cleared on undo/selection change.
6. **Preview == export** at fps 25/30/60 and between-frame playheads; overlay texture stability.
7. **Data safety:** v5 → v6 migration, hand-edited keys repaired, `{version: 7}` protected.

### 3.8 Testing strategy (all parts)

- Pure Vitest for maths and edits: easing reference values, evaluation (exact at keys, binary search vs scan), split/trim/reframe property tests (random clips, every frame), migration repair, same-reference no-ops, refusals. Each important guard gets a recorded mutation check.
- Playwright pixel tests through the real compositor on solid-colour/square fixtures (centroids, bounding boxes, mean values at known frame times), parity tests with ffmpeg frame grabs of real exports, UI tests asserting history length (one step per gesture) and project JSON after undo.
- Determinism: two exports hash-equal per frame; preview at a between-frame playhead equals the frame start.
- The existing 391 e2e and 1182 unit tests are the oracle that static projects are unchanged.

### 3.9 Performance and memory notes

- Evaluation is O(properties × log keys) per clip per frame, allocation-free for static clips; negligible next to decode and GL.
- No shader recompiles: animated params are uniforms. Animated blur radius changes pass count, already bounded by the Plan 4 pool budget (640 MiB) and composite budget (128 MiB).
- Overlay textures sized from the maximum animated scale (stable; at most one texture per overlay clip as today).
- Inspector re-renders on playhead change only while the selected clip is animated; motion-path sampling is memoised per (clip keys, fps, format).
- Project JSON grows ≈ 60 bytes per key; history snapshots share unchanged tracks; `MAX_KEYS` bounds a property at ≈ 30 kB.

### 3.10 Risks (5A)

| Risk | Mitigation |
|---|---|
| A reader of `clip.transform`/`params` is missed and shows stored, not animated, values | D7 single resolver + reader audit test (Task 5) |
| Static edit silently ignored on an animated property | D8 refusals in `setClipTransform`/`updateVideoEffect` + Review focus 1 |
| Split/trim changes the picture | D9 rules + property tests with mutation checks |
| Delete key deletes a clip when the user meant a key | D10 routing, e2e both ways |
| One-way v6 data after deploy | deploy gate with explicit user go-ahead; restore protection unchanged |
| Built on unverified real-GPU behaviour (Plan 4 QA unrun) | run Plan 4 and 5A manual QA together before or right after the 5A deploy (O12) |
| Inspector re-render cost during playback | subscribe to the playhead only when animated |

### 3.11 Model choices (5A)

| Task | Implementer | Task reviewer | Why |
|---|---|---|---|
| 1 Preparation | sonnet | sonnet | mechanical, oracle = existing suites |
| 2 Easing maths | sonnet | sonnet | small pure maths with reference values |
| 3 Data v6 + resolver | opus | opus | data safety, semantics every later task consumes |
| 4 Edits + clip-op rules | opus | opus | exactness across split/trim/reframe, many modules |
| 5 Render integration + audit | opus | opus | compositor, parity, overlay textures |
| 6 Inspector + on-canvas keyed drag | opus | opus | live preview vs commit, drag lifecycle |
| 7 Effect-param keys UI | sonnet | sonnet | follows Task 6 patterns |
| 8 Timeline diamonds + keyboard | opus | opus | gestures, shortcut routing across the app |
| 9 Ease editor | sonnet | sonnet | self-contained component |
| 10 Motion path | sonnet | sonnet | small, read-only |
| 11 Robustness/perf | opus | sonnet | finds and fixes integration gaps |
| 12 Journey/docs | sonnet | — | final review: opus |

Scoped re-reviews of fix rounds: sonnet. Final whole-branch review: opus.

---

## 4. Audited code sites (from reading the code at `22f797c`)

### 4.1 Part 5A (keyframes)

| Site | What changes |
|---|---|
| `src/core/model.ts:8-14, 32-38, 75-95, 128, 152` | `Keyframe`/`TransformKeys` types, `Clip.keys?`, `VideoEffect.keys?`, `version: 6` |
| `src/core/migrate.ts:9, 76-90, 116-132` | `CURRENT = 6`, accept v5, repair `keys` per clip kind |
| `src/core/migrateEffects.ts` | repair effect `keys` |
| `src/core/videoEffects.ts:26-27, 74, 82-98` | `animatable` flag (mirror.mode), clamping reused for evaluation |
| `src/core/videoEffectEdits.ts:44-58, 85-93` | `updateVideoEffect` refuses animated params; `applyLook` drops old keys (implicit) |
| `src/core/clipEffects.ts:5-7` | deep-copy keys in `cloneVideoEffects`; split variant |
| `src/core/timeline.ts:79-100` (trim), `102-123` (split) | sourceless start-trim key shift; split key partition |
| `src/core/merge.ts:94-132` (reframe), `src/core/overlays.ts:104-115` (reframeOverlay) | scale keys like static fields; keyed ⇒ customised |
| `src/core/audioEdits.ts:95-110` (detachAudio, `...clip` at 102) | twin without keys |
| `src/ui/transformEdits.ts:21-69, 75-83` | static edit refusal, Reset clears keys, `setTransformAt`, `withLiveValue` |
| `src/ui/edits.ts:101-112` (setClipFit) | clears position/scale keys |
| `src/render/effects/pipeline.ts:30-39` | `frameIndex`/`snapToFrame` move to `src/core/fps.ts` |
| `src/render/drawCollect.ts:72-125` (loop at 77) | resolve each clip once per frame |
| `src/render/overlays/textures.ts:83-107` (scale at 88) | texture size from `maxScale` |
| `src/render/compositor.ts:180-184`, `clipEffects.ts:25-27, 41-47`, `adjustment.ts:46` | unchanged; read resolved clips (audit allowlist) |
| `src/ui/TransformFields.tsx:57-100`, `TransformOverlay.tsx:44-56`, `overlayHit.ts:51`, `useTransformDrag.ts:71-78, 104, 132`, `Preview.tsx:51` | resolved values, keyed commits, live preview |
| `src/ui/VideoEffectRow.tsx:21-60` | resolved slider value, keyed release |
| `src/ui/ClipView.tsx:42-77`, `src/ui/keys.ts:3, 67-76`, `src/state/store.ts:24-80` | diamonds, shortcuts, key selection |

### 4.2 Part 5D (speed): every `duration = out − in` and `in + (t − start)` site

Central change: `clipDuration(c)` and a new `sourceTimeAt(c, t)` in `model.ts:164-170` become speed-aware (`(out − in)/speed` for constant speed; an integral of the ramp curve for ramps; reverse maps `out − …`); every site below must call them instead of open-coding the arithmetic.

- Core: `timeline.ts:17` (overlaps), `89-95` (trim start/end), `106-118` (split cut point `cut = in + (time − start)` ⇒ `sourceTimeAt`), `151` (ripple delete), `168` (activeClipsAt), `174` (timelineDuration); `merge.ts:22-28, 41, 65`; `audioEdits.ts:33` (fade clamp); `audioQueries.ts:49` (attach-back equality must include speed); `migrate.ts:57` (`clipSeconds` for fade repair).
- Render: `drawCollect.ts:105` (`frameAt(clip.in + (t − clip.start))`), `overlays/textures.ts:89` (sourceless, unaffected but audited).
- Audio: `audio/plan.ts:48, 93-98` (segment `srcFrom/srcTo` mapping and `whenEnd`), `mixdown.ts:109-110`, `mixerSchedule.ts:39-40` (decode ranges and `start(when, lead)` scheduling: playback rate + time-stretch), `chain.ts:72` (gate end), `fade.ts:25, 36`, `duck.ts:61`, `effects/normalise.ts:14-16` (peak over the source range), `denoiseSource.ts:31, 48` (probe range/cache key).
- UI: `drag.ts:45` (`clip.out − clip.in` move span), `54`, `58-64` (`sourceEnd` for end-trim limit), `useClipDrag.ts:60, 64`, `edits.ts:31, 41`, `ClipView.tsx:44, 55`, `Waveform.tsx:37-45` (waveform span and direction), `AudioInspector.tsx:27`.
- Export/decode: `exporter.ts:97-98, 162-170` (duration and frame loop; unchanged maths but audited), `media/decode.ts:29-35` (`MAX_CACHED_FRAMES = 4`, `FORWARD_WINDOW = 2`: reverse playback is a backward seek per frame; needs a reverse GOP cache with a memory cap).

### 4.3 Part 5C (transitions)

`timeline.ts:16-18, 50-58` (overlap/`hasRoom`: transitions must not break the no-overlap invariant, see O5), `148-164` (deleteClip/ripple drop the cut's transition), `102-123` (split: a transition stays on its cut), `125-146` (moveClip: transitions removed when the cut disappears), `merge.ts:11-48` (joinClips: optional auto-transition), `render/visible.ts:18-21` + `drawCollect.ts` (both clips of a transition window are collected; per-clip decoders already exist, Ruling 3), `compositor.ts:153-176` (a transition pass using the CompositeBuffer, Ruling P2: no second mechanism), `audio/plan.ts:84-107` + `chain.ts:104-145` + `fade.ts` (equal-power crossfade on the cut through the ONE shared chain; plays source handles past `out`/before `in`), `drag.ts`/`useClipDrag.ts` (trim limited by handles), `ClipView.tsx`/`Lane.tsx` (transition chips on cuts), exporter unchanged.

### 4.4 Part 5E (crop, flip, anchor)

`render/geometry.ts:29-50` (`clipMatrix`: anchor offset; cropped quad size), `drawCollect.ts:99-119` (`size`/`uv` for the crop sub-rectangle and flips: `uvMatrix` already composes rotation/mirror), `clipEffects.ts:27` (`effectWorkingSize(d.size, d.texels, …)` of the cropped picture; crop BEFORE effects), `blur.ts` (backdrop from the cropped picture), `overlayGeometry.ts` + `TransformOverlay.tsx:54-56` + `overlayHit.ts:51` (`clipCorners` with anchor and cropped size), `merge.ts:69-79` (`fitTransform` of the cropped size) and `94-132` (reframe), `transformEdits.ts:43-54` (Reset to the cropped fit), `edits.ts:101-112`.

---

## 5. Roadmap-level outlines of the later parts

### 5B Presets and motion (v7, ~8–9 tasks, after 5A)

- **Data:** `Clip.motion?: { in?: PresetUse; emphasis?: PresetUse; out?: PresetUse; loop?: PresetUse }` with `PresetUse = { preset: PresetKey; duration: number; delay: number; params: Record<string, number> }`, evaluated procedurally relative to the clip's edges (so an exit animation stays at the end after a trim). `TransformKeys` gains a per-property loop mode (`none | repeat | pingPong`, count) and position keys gain optional spatial tangents. Spring easing (`{ kind: 'spring', stiffness, damping }`, analytic damped oscillator normalised to settle exactly at 1 at the segment end, deterministic).
- **Combination rule (animation blending):** final = keyframed/static value ∘ preset offsets: position adds, scale and opacity multiply, rotation adds; presets apply in the order in → emphasis/loop → out.
- **Tasks:** preset maths + library (fade, slide ×4 directions, zoom in/out, pop, spin, drop, whip, bounce, pulse, shake, Ken Burns) with exact edge values; data v7 + migration; resolver integration (one place, extends `resolveClip`); spring easing; keyframe loops; preset browser UI (categories, search, favourites, animated previews drawn by the same resolver on a small canvas, no video decode); spatial Bézier motion path editing on canvas + orient-along-path; copy/paste keys across clips with size adaptation (position/scale rescaled by source size ratio); save-as-preset (user presets stored in the project or IndexedDB: decide in the 5B plan); journey/docs.
- **Out of 5B:** per-word/letter stagger and typewriter (Plan 6 text, O7); drawn-path presets (need Plan 8 masks/paths).
- **Risks:** interaction of presets with keys (combination rule tests), overlay built-in slide-in vs presets (overlays keep T13-2 unless the user picks a preset), preview thumbnails cost.

### 5E Crop, flip, anchor (v8, ~6 tasks)

- **Data:** `Clip.crop?: { left, top, right, bottom }` (fractions of the source, sum < 1 per axis, min 8 px remaining), `Clip.flip?: { h: boolean; v: boolean }`, `Transform.anchor?: { x, y }` (fraction of the picture, default centre) keyframable through 5A (`TransformKeys.anchor`).
- **Tasks:** pure geometry (cropped size, uv sub-rect, anchor in `clipMatrix` and `clipCorners`, exact round trips); data v8 + migration; render (crop before effects, blur backdrop from the cropped picture); fit/reframe/Reset on cropped size; inspector crop fields + on-canvas crop mode (`crop-*` test ids) + flip buttons; journey/docs.
- **Risks:** `clipCorners`/hit-testing parity with `clipMatrix` (Ruling 1), effect working size of tiny crops, reframe exactness.

### 5D Speed, reverse, ramps (v9, ~11–12 tasks, highest risk)

- **Data:** `Clip.speed?: number` (0.25–4, default 1), `Clip.reverse?: boolean`, `Clip.speedKeys?: Keyframe[]` (ramp: speed as a keyframed curve over clip-local time, 5A easing), `Clip.preservePitch: boolean` (default true), freeze frame as a still segment created by an edit.
- **Tasks:** (1) behaviour-preserving refactor: every site in §4.2 calls `clipDuration`/`sourceTimeAt` (speed 1, full e2e as the oracle); (2) speed maths (constant, reverse, ramp integral and its inverse by monotone bisection, exact at clip edges, split/trim invariants); (3) data v9 + migration; (4) timeline edits (setSpeed keeps start, changes duration, refuses overlaps; trim/split with speed; ripple); (5) video render (source-time mapping in `drawCollect`, decoder forward-window tuning for 4×); (6) reverse video (GOP-backward decode with a bounded reverse frame cache: memory cap, decoder stats guard); (7) audio playback rate in both engines (segment planning in source time, window seams exact); (8) pitch-preserving time-stretch (WSOLA on decoded buffers in the shared `prepareSource` path so live and export match; pre-roll margins) and reverse audio (reversed buffer); (9) speed ramps in audio (piecewise-constant rate per window or resampled buffer); (10) UI (speed field, reverse toggle, ramp curve editor reusing EaseEditor, clip label "2×"); (11) parity/perf (A/V sync at 0.25×/4×/ramp within 1 frame and 1 audio quantum; export duration ffprobe); (12) journey/docs.
- **Risks:** A/V drift at window seams, reverse decode cost/memory with long-GOP phone footage (headless Chromium decode only), time-stretch artefacts (measured by a pitch/tempo check on a sine sweep), detach/attach equality (`audioQueries.ts:49`) must include speed, keyframes stay on footage frames (D3).

### 5C Transitions (v10, ~9–10 tasks, high risk)

- **Model (recommended, O5):** transitions attach to a CUT between two adjacent clips on the same track (`Track.transitions?: { id, fromClipId, toClipId, type, duration, ease, params }[]`), centred on the cut, using source HANDLES (the outgoing clip plays past its `out`, the incoming one before its `in`, by `duration/2`); clips never overlap on a track (the existing invariant and every `hasRoom` stay valid); when a source has no handle the transition is shortened to the available handle (or refused with a clear message); images and sourceless clips always have handles.
- **Types:** fade through black, crossfade (dissolve), wipe (4 directions, soft edge), slide/push (4 directions), zoom, glitch (deterministic, reuses the stylise hash); progress uses 5A easing.
- **Tasks:** cut model + pure edits (add/remove/set, refusals, delete/split/move/ripple/join rules); data v10 + migration; render (both pictures through their effect stacks, a transition shader pass on the CompositeBuffer, Ruling P2); audio crossfade (equal-power on the cut through `chain.ts`, handles decoded, live == export); UI (cut chips, transition browser, duration drag with one apply, inspector); auto-transition option on Join (spec line 20); parity/perf; journey/docs.
- **Risks:** handle availability on trimmed footage, two decoders per track during a transition (decoder bounds, Plan 2 Task 7 limits), audio seam exactness, blend/adjustment layers above a transition, speed interaction (built on 5D's mapping if 5D ships first).

---

## 6. Self-review notes

- Spec coverage (design line 27): keyframes for position/scale/rotation/opacity/effect params ✓ 5A; easing presets (ease in/out, back, elastic, bounce) ✓ 5A D5; custom Bézier curve editor ✓ 5A D6 (per segment); motion paths ✓ display 5A, editing 5B; in/out presets (pop, slide, spin, drop, whip) ✓ 5B; speed ramping ✓ 5D; Ken Burns ✓ 5B preset (and doable with 5A keys); copy/paste keyframes ✓ 5B. Transitions (line 23) ✓ 5C; speed/reverse (line 25) ✓ 5D; crop/flip (line 26) ✓ 5E. Roadmap §3: stagger/typewriter ⇒ Plan 6; drawn paths ⇒ Plan 8.
- Type consistency: `Ease` (T2) → `Keyframe` (T3) → edits (T4) → render (T5) → UI (T6–T10). `AnimTarget`/`KeyRef` defined once in T4. `snapToFrame` moves in T1 and is consumed by T3.
- Order rationale: refactor first (T1) so the v6 bump touches one constant; pure maths (T2–T4) before render (T5) so the pixel tests have an exact oracle; render before UI so every UI test can read pixels; the timeline diamonds (T8) after the inspector (T6–T7) because they reuse the same commands; robustness (T11) last before the journey.

---

## 7. Open decisions for the user (answer before implementation)

| # | Decision | Recommendation | Cost if wrong |
|---|---|---|---|
| O1 | **Data versions:** one bump per deployed part (5A v6, 5B v7, 5E v8, 5D v9, 5C v10) vs. reserving every future field in v6 now | One bump per deployed part; parts deployed together share a bump. No speculative fields. | Each extra bump = one migration line + one constant (cheap after Task 1). Reserving fields now risks a wrong design frozen into saves. |
| O2 | **Plan ownership:** speed and transitions are under Plan 7 and crop under Plan 8 in the roadmap file, but under Plan 5 in the handoff | Keep all five parts under the Plan 5 umbrella with separate detailed plans and deploy gates (5A now); update the roadmap file when 5A is approved. Alternative: Plan 5 = 5A+5B only and move 5C/5D/5E back to Plans 7/8. | Bookkeeping only; the work is the same. |
| O3 | **Spring physics** in 5A or later | Later (5B), as an easing kind; 5A ships back/elastic/bounce. | Users wanting springy motion use `elastic`/`back` until 5B. |
| O4 | **Curve editor:** per-segment cubic-Bézier editor + presets (5A) vs. presets only vs. a full multi-key value-graph editor | Per-segment Bézier editor + presets in 5A; full graph editor later (Plan 10 or a 5B extension) if wanted. | Presets-only saves ~1 task but misses the spec's "custom bezier"; a full graph editor adds ~3 tasks and gesture risk. |
| O5 | **Transitions overlap model:** cut-attached with source handles (clips never overlap) vs. true clip overlap on one track vs. cross-track only (two layers + opacity keys/presets) | Cut-attached with handles, centred on the cut. Cross-track dissolves already work after 5A/5B as a by-product. | True overlap rewrites every `hasRoom`/`overlaps` site and the timeline's mental model; cross-track-only fails the "drop a transition between two clips" expectation. |
| O6 | **Speed ramps:** ship in 5D with constant speed/reverse, or constant speed/reverse first and ramps later | Constant + reverse + pitch preservation first (5D), ramps as the last 5D tasks only if A/V seams are exact; otherwise split ramps into a 5D-2. | Ramps are the riskiest audio piece (time-varying stretch); bundling may delay all of 5D. |
| O7 | **Text animation dependency on Plan 6** | 5B presets work on any picture clip (incl. overlays); per-letter/word stagger and typewriter wait for Plan 6 text clips. Plan 6 must evaluate text animation through `resolveClip`. | Doing text animation before text clips exist would need a throwaway text model. |
| O8 | **Audio volume automation (Plan 9) hook** | Not in 5A. The keyframe/easing core is DOM-free and reusable; Plan 9 samples it into `GainPoint[]` for `scheduleGain` (chain.ts:39) so live and export share it. `Clip.keys` is designed so `volume`/`pan` keys can be added there later. | Animating volume now pulls the audio engines into 5A and doubles its risk. |
| O9 | **Scale interpolation:** linear (what the curve shows) vs. logarithmic (perceptually even zoom for Ken Burns) | Linear in 5A; 5B's Ken Burns preset uses log-space internally. | Long zooms look like they slow down; fixable with an ease. |
| O10 | **Editing an animated property with the playhead outside the clip** | Refuse with a toast ("Move the playhead onto the clip to set a keyframe"). Alternative: write the key at the nearest clip edge. | Minor UX friction either way. |
| O11 | **Keyframes on overlay and adjustment clips** | Yes: overlays get transform keys (no effects); adjustment clips get opacity + effect-param keys (position/scale/rotation not offered: full frame). | Excluding them is a one-line guard; including them costs a few tests. |
| O12 | **Plan 4 follow-ups and manual QA before 5A** | Run the Plan 4 manual QA checklist on a real Mac first (or alongside 5A's), and leave Plan 4's deferred minors (Ruling P11: overlay-canvas notice, effect pool idle release, blend/sticker selects commit per arrow key, all-in-one export test) out of 5A unless you want a short Task 0. | Building on unverified GPU behaviour may surface issues later in two plans at once. |
| O13 | **Rotation while animated:** unbounded multi-turn degrees (0→720 = two spins) vs. keep (−180, 180] | Unbounded (clamped ±36 000) while animated; static stays normalised. | With the normalised range, spins over 180° need several keys. |
| O14 | **Key time base:** keys stay on the footage frame when trimming (source-anchored, D3) vs. keys stay at a fixed offset from the clip start | Source-anchored (and sourceless clips keep keys at the same timeline time on trims). | The other choice makes animations slide relative to the picture on every start trim. |
| O15 | **Shortcuts:** `[`/`]` previous/next keyframe; Delete removes selected keys before clips | As proposed. | Rebinding later is trivial; Plan 7 frame navigation must avoid these keys. |
| O16 | **Deploy 5A alone** (data v6, one-way for older open tabs) or wait for 5B | Deploy 5A alone after its gate if the manual QA is clean; it is useful by itself (Ken Burns, fades, animated effects). | Waiting merges two bumps into one but delays value. |
