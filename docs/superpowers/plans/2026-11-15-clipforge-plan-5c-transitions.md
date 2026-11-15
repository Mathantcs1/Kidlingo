# ClipForge Plan 5 Part 5C: Transitions on cuts (DRAFT for approval, data v10)

> **Provenance:** drafted from the real code at `1dba862` by a read-only research agent, reviewed by the controller (file sizes and a sample of file:line citations re-checked). Line numbers must be re-checked at the start of each task. Plans 5D and 5C are written to be consistent: 5C assumes the 5D time map (`src/core/clipTime.ts`). Order: **5D first, then 5C** (5C is branched off the 5D tip).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans), task by task. Nothing here is implemented yet: the user must approve this plan and answer §13 first. Adopted decisions are recorded as `Ruling: P5C-n` lines in `docs/superpowers/ledgers/plan-5-animation-ledger.md` BEFORE Task 1. This plan is written for the tree AFTER Plan 5D (speed, reverse, ramps; data v9) has shipped: wherever it says "the 5D mapping" it means 5D's single speed-aware source-time function (drafted in parallel as `sourceTimeAt(clip, t)` / `clipDuration(clip)`). §4 lists exactly what 5C needs from it; if 5D lands with different names, Task 1 renames, nothing else changes.

**Goal:** Let the user put a transition on any CUT between two touching clips on a track (fade through black, crossfade/dissolve, wipe in four directions with a soft edge, slide and push in four directions, zoom, deterministic glitch), set its duration and easing, and hear an equal-power audio crossfade on the same cut, identically in preview and export. Join ("Merge selected") can add a transition at every new cut. Data moves to **v10**.

**Architecture (summary):** a transition is DATA ON THE TRACK attached to a cut (`Track.transitions`), centred on the cut and fed by source HANDLES: during the window the outgoing clip keeps playing past its `out` and the incoming one starts before its `in`. Clips never overlap, so `overlaps`/`hasRoom`/`assertFree` and every edit that relies on them stay exactly as they are; one pure `reconcileTransitions` keeps the cut data valid after every structural edit. Render: the frame planner yields a "transition step" for the pair; both pictures go through their own resolver, effect stack, crop/anchor and transform exactly as today, each into a viewport-sized layer target of the ONE `CompositeBuffer`, and one fused transition+blend pass writes the result into the composite (Ruling P2: no second compositing mechanism). Audio: the planner extends each clip's audible span over its handles and adds a crossfade envelope that the ONE shared `chain.ts` schedules for live playback and export alike. Frames with no active transition are bit-identical to v9 (the full e2e suite is the oracle).

**Tech stack:** unchanged (TypeScript strict, React 19, WebGL2 with one new fragment program that reuses the existing blend GLSL, Web Audio, Vitest, Playwright with pixel reads, ffmpeg/ffprobe frame and audio grabs). No new dependency.

**Context read (for the reviewer):** `CLAUDE.md`; `PROJECT_HANDOFF.md` §5, §6 (rulings 3, 13), §8, §9; ledger `plan-5-animation-ledger.md` (P5-1, P5-2, P5-5, P5-8, P5B-2, T10-3, P5E-1..4); 5A plan §4.3 (5C audited sites), §5 (5C outline), O5 (cut-attached model approved under P5-1); Plan 2 plan (Task 3 decoder rules, Task 7 decoder bound `visible + KEEP_RECENT`); Plan 4 (CompositeBuffer, blend/adjustment passes, Ruling P2, budgets); the 5E plan (template); design spec lines 20 (auto-transition on merge, crossfaded merged audio), 23 (transitions), 28 (audio crossfades). Code read at `feature/plan-5e-crop-anchor` tip `1dba862` (data v8; line numbers below are from that tree and must be re-checked against the 5D tip in Task 1).

Branch: `feature/plan-5c-transitions` off the 5D branch tip (data v9). Baseline: whatever 5D's part gate records (5E gate was `npm test` 1918, full e2e 587, `e2e:preview` 1).

---

## 1. Scope

In: `Track.transitions` (data v10) on video tracks: types `dip` (fade through black), `dissolve` (crossfade), `wipe` ×4 (soft edge), `slide` ×4, `push` ×4, `zoom`, `glitch`; duration (centred on the cut, handles permitting), progress easing through the 5A `easeAt`; audio crossfade of the clips' embedded audio on the same cut (equal power by default, constant gain option); audio-only crossfades on audio-track cuts (type `audio`, see O3); add/remove/set edits; the delete/split/move/trim/ripple/join/paste/duplicate/detach/media-removal/speed rules; Join with a transition; timeline chips and cut "+" buttons; a transitions browser; a transition inspector; context-menu entries; shortcut `T`; Help topic; migration v10.

Out (deferred, recorded in the ledger): alignment other than centred (start-at-cut / end-at-cut); transitions between clips on different tracks (layer opacity keys and 5B presets already do that); transitions at a clip's free edge (fade from/to nothing: the 5B Fade In/Out presets and audio fades cover it); custom transition colours and user transition presets; morph/flow transitions; keyframing transition parameters; transitions involving adjustment clips (refused); roll/ripple trim of a transitioned cut (the cut edge cannot be trimmed while keeping the transition, D9); automatic audio crossfades for detached twins.

## 2. Constraints (carried over)

- TypeScript strict; 2 spaces, single quotes, semicolons; files ≲200 lines, split BEFORE extending (Task 1). At or near the limit on the 5E tip: `src/core/model.ts` 190 (new types go in `src/core/transitionTypes.ts`), `src/render/compositor.ts` 188, `src/render/drawCollect.ts` 150, `src/media/decode.ts` 212, `src/export/exporter.ts` 203, `src/state/store.ts` 197, `src/ui/useClipDrag.ts` 182, `src/audio/mixdown.ts` 199, `src/audio/mixer.ts` 178, `src/audio/chain.ts` 164. New CSS in `src/ui/transitions.css`.
- `src/core` is pure and DOM-free; edits throw `TimelineError` for user-facing refusals, never mutate, and return the SAME reference for no-ops (`setTransition` with equal values, `removeTransition` of an unknown id is a refusal, `reconcileTransitions` with nothing to fix returns its input). Locked tracks refuse every transition edit (`assertUnlocked`, `timeline.ts:46-48`).
- One gesture = ONE `apply` = one undo step: dropping a tile on a cut, a chip duration drag (local state until release), a field commit, a type change, Remove, the `T` shortcut, "Merge with transition". A structural edit that also shortens or drops transitions is still one apply.
- Data **v10**: `CURRENT_VERSION = 10` (one constant); v1-v9 open unchanged (migration adds nothing, repairs what is present); `{version: 11}` is `newer` ⇒ `unsupported`, never overwritten. Saves from v10 are one-way. After the 5C deploy any change to the transition schema (types, params, ranges) needs a bump (same rule as P5B-2).
- Preview == export: one planner (`visible.ts`), one resolver, one shader with a CPU mirror, one audio planner and chain; parity specs at 25 and 30 fps (§7).
- Keep every existing `data-testid`; new ids use the `transition-` prefix (§6). `window.__clipforge` stays DEV-only (`grep -rl __clipforge dist` empty).
- TDD: failing test first; mutation-check each important guard and name the caught mutation in the task report.
- Commit trailers (blank line before): `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the session's `Claude-Session:` line from CLAUDE.md. **No push, no deploy** without the user's explicit go-ahead in the current session (P5-2's conditions apply when it comes). Never touch `release/` or any Vercel project other than `clipforge`. Never run `playwright install`; one e2e run at a time (port 5173).
- Model policy (P5-8): opus for the migration, render maths, audio seams, timing/split/trim/handle rules and the final whole-part review; sonnet for UI wiring, docs, refactors, test-only tasks.

## 3. Decisions (proposed rulings; the ones needing the user are in §13)

- **D1 Model: cut-attached, centred, handles (approved direction O5 of the 5A plan).** `Track.transitions?: Transition[]` (absent = none; empty arrays are not stored), each `{ id, fromClipId, toClipId, type, duration, ease, direction?, softness?, amount?, audio? }` (types in `transitionTypes.ts`). The window is `[c − d/2, c + d/2)` with `c = clipEnd(from) = to.start`. During `[c − d/2, c)` the incoming clip draws from its pre-`in` handle; during `[c, c + d/2)` the outgoing clip draws from its post-`out` handle. `start/in/out` and `clipEnd` never change, so the track's no-overlap invariant (`timeline.ts:17-19`), `hasRoom` (51-53), `assertFree` (55-59), `activeClipsAt` (121-125), snapping (`merge.ts:53-71`) and every drag limit keep their meaning. Rejected: true overlap (rewrites every `hasRoom` site and the timeline's model), cross-track only (fails "drop a transition between two clips").
- **D2 Validity (one predicate, `transitionValid(p, track, tr)`).** Both clips exist on THIS track, `|clipEnd(from) − to.start| ≤ EPS` (adjacent), neither is `adjustment` and both are picture clips (video track) or both audio (audio track, type `audio` only); `d ≥ 2/fps`; `d/2 ≤ handleAfter(from)` and `d/2 ≤ handleBefore(to)` (D3); the clip's two half-windows fit inside it: `dIn/2 + dOut/2 ≤ clipDuration(clip)` for every clip; at most one transition per cut and per clip side. Render and audio treat an invalid transition as absent (defensive), but no edit may leave one (property test, Task 2).
- **D3 Handles via the 5D mapping.** `handleBefore(clip, media)` / `handleAfter(clip, media)` in TIMELINE seconds: how far the clip can be drawn before `start` / after `clipEnd` with source time staying inside `[0, media.duration]` at the speed held at that edge (reverse clips mirror). Images, overlays: `Infinity` (a still or a procedural picture). Missing media: 0. **No handle ⇒ shorten, never extend the clip**: add/set clamp `d` to `2·min(available)` rounded DOWN to whole frames; below 2 frames the edit is refused with "Not enough footage beyond the cut for a transition: trim the clips to leave some" (O2).
- **D4 Duration.** Seconds, stored; edits snap to whole project frames (an even frame count so a frame-aligned cut gives frame-aligned window edges); default 1.0 s; min 2 frames; max 5 s (O6). Progress `u = clamp((t − (c − d/2)) / d, 0, 1)`, eased `e = easeAt(ease, u)`, exact 0 at the first window frame and exact 0.5 at `t = c` for symmetric eases.
- **D5 Ease subset.** `linear`, `easeIn`, `easeOut`, `easeInOut`, `bezier` with `y1, y2` clamped to [0, 1] (no overshoot: a wipe edge or a slide would leave the frame). `hold`, `back`, `elastic`, `bounce`, `spring` are refused by edits and repaired to `linear` by migration (O7). Defaults: `linear` for dip/dissolve/glitch/audio, `easeInOut` for wipe/slide/push/zoom.
- **D6 Types (exact maths in `transitionMath.ts`, mirrored by the shader).** With premultiplied layer pictures `A`, `B` (each clip already transformed, effected, cropped, faded by its own opacity) and eased progress `e`: `dip` = A with rgb·(1 − 2e) for e < ½, then B with rgb·(2e − 1) (alpha kept: the picture area turns black; on the bottom track this is the classic fade through black); `dissolve` = mix(A, B, e); `wipe` = mix(A, B, smoothstep(−s, s, edgeDistance(x, dir, e))) with softness `s` ∈ [0, 0.5] of the frame (default 0.05), the edge travelling so that e = 0 shows all A and e = 1 all B; `slide` = B shifted in from `dir` by (1 − e) frames OVER a static A; `push` = A shifted out by e, B shifted in by (1 − e), both moving; `zoom` = A scaled about the frame centre by 1 + (Z − 1)·e, B by Z^(e − 1), cross-mixed by smoothstep(0.35, 0.65, e) (Z = `amount` ∈ [1.2, 4], default 2); `glitch` = dissolve whose mix is blocky: per block hit test `grainHash(frame, bx, by + SALT) < g(e)` plus a per-row horizontal shift and an RGB split, both scaled by `sin(π·e)·amount`, using the existing stylise hash (`looksMath.ts:122` `grainHash`, re-exported as `styliseMath.ts:30` `hash`; GLSL twin `shaders/glsl.ts:49`) with the timeline frame index, so it is identical in preview and export and repeatable.
- **D7 Render = steps, layers, one fused pass.** `visible.ts` gains `frameStepsAt(p, t)`: in track order, either a plain clip or `{ transition, from, to, u }`; `visualClipsAt` (18-21) becomes the flattened clip list of the steps, so the preview's (`previewRenderer.ts:130`) and export's (`exportSources.ts:18`) decoder selection automatically include the handle clip (one definition, Plan 2 Task 3). `collectDraws` (`drawCollect.ts:109-171`) emits a `TransitionDraw { a: Draw, b: Draw, transition, e, frame }`; a handle draw reads its frame at `sourceTimeAt(clip, t)` beyond the clip's range (replacing today's `clip.in + (t − clip.start)` at line 151, which 5D already routes through the mapping). In Phase 2 a transition step: effects(A) → draw A into layer target 1 → effects(B) → draw B into layer target 2 (the order matters: an effect output is overwritten by the next run of its size, `compositor.ts:164-166`) → `CompositeBuffer.transition(...)` reads backdrop + both layers and writes the next ping-pong target. Any frame with an active transition takes the composite path (`needsComposite` gains the step); frames without one are untouched.
- **D8 Blend modes in a transition.** The fused pass computes, per pixel, `mix(blend(bd, A′, mA), blend(bd, B′, mB), w)` for the mixing types (dissolve, wipe, zoom, glitch) and `blend(blend(bd, A′, mA), B′, mB)` for the stacking types (slide, push, dip), where `A′`, `B′` are the shifted/scaled/darkened layers and `mA`, `mB` each clip's own blend mode; with Normal it equals `over(bd, mix(A, B, w))` exactly (premultiplied over is linear in the source), so the common case is the textbook result. It reuses the blend GLSL of `shaders/blend.ts` (no second formula). Adjustment layers ABOVE the track see the finished transition (they run on the composite so far, `adjustment.ts:214-231`); adjustment clips cannot be part of a transition (D2).
- **D9 Edit rules (one `reconcileTransitions(p, trackIds?)`, run at the end of every structural edit, same reference when nothing changes).** It drops transitions whose clips are gone, moved to another track or no longer adjacent; clamps durations to handles and clip lengths (D2/D3) rounding down to whole frames; drops those below 2 frames; dedupes; sorts by cut time. Per edit: **delete** (`timeline.ts:103-119`) drops the clip's transitions; **ripple delete** (113-114) makes the neighbours adjacent but never invents a transition; **split** (`clipEdits.ts:57-90`) re-points `fromClipId` of the clip's OUT transition to the right half (the right half gets the new id at line 83; the IN transition stays with the left half, same id), and a split inside a window shortens that transition (O5); **move** (`timeline.ts:80-101`) of a transitioned clip away drops its transitions (a move that keeps adjacency, i.e. none today, would keep them); **trim** (`clipEdits.ts:33-55`) of the cut edge breaks adjacency and drops the transition (the command toasts "Transition removed: the clips no longer meet"; undo restores), trim of the far edge shortens if the clip became too short; **join** (`merge.ts:13-51`) keeps transitions between selected clips that were already adjacent and optionally adds one at each new cut (D11); **paste/duplicate** (`clipClipboard.ts:84-117`) carry a transition when BOTH its clips are in the payload (ids remapped), otherwise not (O8); **detach audio** (`detachAudio.ts:19-49`) leaves the picture transition; the twins get no audio crossfade (deferred), and the video clips' embedded crossfade stops because they become silent; **attach back** unchanged; **remove media** (`ui/mediaEdits`) and **remove track** go through reconcile / take the transitions with the track; **5D speed/reverse changes** reconcile (handles in timeline seconds change with speed); **reframe** and track flags/order never touch transitions. Locked tracks: every transition edit refuses; structural edits already refuse there.
- **D10 Animation in the handle (frozen at the edge).** In a handle the FOOTAGE keeps playing (source time from the 5D mapping) but everything the resolver evaluates is held at the clip's edge frame: `resolveClip(raw, tEdge, format)` with `tEdge = clamp(t, start, clipEnd − 1/fps)` for transforms, keys, key loops, 5B presets and effect params; effect time-bases (`clipEffectContext`, `clipEffects.ts:44`, glitch/VHS/grain frame index) keep running so grain does not freeze. Rationale: `localTime` (`keyframes.ts:29-31`) and `motionAt` (`motion.ts:71-75`) were never defined outside the clip and an Out preset's last frame is the intended end state. Consequence documented in Help: a clip with a Fade Out preset AND a transition crossfades from a nearly invisible picture.
- **D11 Join with a transition (spec line 20).** `joinClips(p, ids, opts?: { transition?: TransitionSpec })`: after placing the clips back to back, adds `spec` at every cut BETWEEN consecutive selected clips that has none, each clamped by D3; cuts with no handle are skipped. `joinTransitionReport` (pure) returns how many were added/shortened/skipped for the toast. UI: context-menu "Merge with crossfade" next to "Merge" (uses the last transition type and duration used in this session, default dissolve 1 s).
- **D12 Audio crossfade on the same cut.** For a video-track transition both clips' embedded audio (when audible: `audibleClips`, `plan.ts:41-53`) plays over its handle; gains over the window follow `power`: gA = cos(e·π/2), gB = sin(e·π/2) (equal power, default) or `gain`: 1 − e, e (constant gain; exact for two halves of the same shot, O4), using the transition's own ease. The envelope is a breakpoint list of 33 points per side (32 linear segments; equal-power chord error ≤ 3.1e-4 in amplitude) in timeline time, the same numbers in every window. On a transitioned edge the clip's own audio fade on THAT edge is ignored (the crossfade is the fade; the stored value is kept and the inspector shows "replaced by the transition").
- **D13 Selection and keyboard.** A transition is selected in a non-history UI slice (`transitionSelection.ts`, like 5A's `keySelection.ts`), cleared on clip selection, undo/redo when it no longer exists, Escape. Delete/Backspace with a transition selected removes it (routing: keys first, then transition, then clips; `keys.ts:97` `keyRouted` gains the tier). `T` (new `Shortcut` `addTransition`) adds the last-used transition at the cut nearest the playhead on the selected clip's track (or the active track), within one clip's reach; refusals toast.

## 4. What 5C needs from 5D (the 5D mapping)

1. `sourceTimeAt(clip, t)` defined for `t` in `[start − handleBefore, clipEnd + handleAfter]`: beyond an edge it extrapolates at the speed held at that edge (for a ramp: the edge speed; for reverse: source time keeps decreasing). If 5D keeps it range-limited, 5C adds `handleSourceTimeAt` next to it in the same file (never a second formula elsewhere).
2. `clipDuration(clip)` speed-aware (timeline seconds) and used by `clipEnd`.
3. The inverse at the edges: source seconds available before `in` / after `out` (from `media.duration`) → timeline seconds, for D3.
4. The audio side: 5D's segment planning (`planWindow` source range for a timeline span, time-stretch with pitch preservation) must accept a span that starts before `start` or ends after `clipEnd`, and its decode-range clamp (`mixdown.ts:109-110`, `mixerSchedule.ts:39-40`, today `[clip.in, clip.out]`) must become "the audible source span", which 5C passes in.
5. 5D's revisit of P5-5 (frame-grid anchoring of local time) fixes what `tEdge` (D10) means; 5C uses 5D's frame helper.
6. 5D's source-scan audit (no raw `in + (t − start)` outside the mapping) must cover the files 5C adds.
Open question Q1: the exact 5D names, the reverse representation (`in < out` kept with a flag?) and whether ramps can be read at an edge without allocation; Task 1 confirms and adapts.

## 5. Audited code sites (5E tip line numbers; re-check on the 5D tip)

| Site | Change |
|---|---|
| `src/core/model.ts` (190) | `CURRENT_VERSION = 10`; `Track.transitions?` typed from new `transitionTypes.ts` |
| `src/core/timeline.ts:17-19, 51-59` | unchanged (D1) — guarded by a test that `hasRoom` ignores transitions |
| `src/core/timeline.ts:80-119` | `moveClip`, `deleteClip` (ripple 113-114) end with `reconcileTransitions` |
| `src/core/clipEdits.ts:33-55, 57-90` | trim reconcile; split re-points the OUT transition to the right half (id at 83) |
| `src/core/merge.ts:13-51` | `joinClips` opts.transition (D11); reconcile |
| `src/core/clipClipboard.ts:32-53, 84-117` | payload carries both-ends transitions, ids remapped (`fresh` at 53) |
| `src/core/detachAudio.ts:19-68`, `audioQueries.ts:38` | no transition on twins; attach-back equality unaffected |
| `src/core/tracks.ts:38` (`removeTrack`), `src/ui/mediaEdits.ts` | transitions follow the track / reconcile |
| new `src/core/transitions.ts`, `transitionEdits.ts`, `transitionReconcile.ts`, `migrateTransitions.ts` | D2-D5, D9, D11, §8 migration |
| `src/core/migrate.ts:104-121, 129-145` | track repair keeps raw `transitions`; project-level `repairTransitions` after media/tracks (needs adjacency and media durations) |
| `src/core/animate.ts:95-117`, `keyframes.ts:29-31`, `motion.ts:71-75` | unchanged; callers pass `tEdge` for handle draws (D10) |
| `src/render/visible.ts:18-21` | `frameStepsAt`; `visualClipsAt` = flattened steps |
| `src/render/drawCollect.ts:109-171` (151: frame time) | `TransitionDraw`; handle source time; split `drawCollectTransition.ts` |
| `src/render/compositor.ts:133-178` (154, 158-175) | step loop; split the loop into `drawSteps.ts` first |
| `src/render/compositeBuffer.ts:13, 49-60, 72-100` | second layer target; `transition()`; target count 4 on transition frames |
| new `src/render/transitionMath.ts`, `transitionProgram.ts`, `effects/shaders/transition.ts` | D6/D8 CPU mirror, program, GLSL (imports blend GLSL) |
| `src/render/adjustment.ts:204-206` | `needsComposite` true for transition steps |
| `src/media/decode.ts:29, 91, 179` | unchanged API; a handle draw starts the incoming decoder at `in − d/2` (one seek) |
| `src/ui/previewRenderer.ts:23, 124-170`, `src/export/exportSources.ts:11-32` | unchanged code, more clips via `visualClipsAt`; bound test |
| `src/audio/plan.ts:84-107` | audible span `[start − hIn, end + hOut]`, `Segment.xfadePoints` |
| `src/audio/fade.ts:128-155` | `fadeGain/fadePoints` ignore a transitioned edge's fade (D12); `transitionGainPoints` |
| `src/audio/chain.ts:68-82, 104-145` | gate tail at the AUDIBLE end (72); `xfade` GainNode scheduled like duck (128-131), absent ⇒ no node |
| `src/audio/mixdown.ts:109-110`, `mixerSchedule.ts:39-40`, `duck.ts:61` | decode range and duck coverage use the audible span |
| `src/ui/ClipView.tsx`, `Lane.tsx`, `Timeline.tsx` | chips on cuts, cut "+" buttons, duration drag |
| `src/ui/drag.ts:41-64`, `useClipDrag.ts:148` | unchanged limits; commit toasts when a transition was removed/shortened |
| `src/ui/keys.ts:3, 66-101` | `addTransition` (`T`), Delete routing tier |
| `src/ui/contextMenuItems.ts:32-58` (no submenus: `contextMenuModel.ts:4-18`) | flat items; `testId` overrides with `transition-menu-*` |
| `src/ui/Inspector.tsx`, new `TransitionInspector.tsx`, `TransitionBrowser.tsx` | inspector and browser |
| `src/ui/helpContent*.ts`, `helpShortcuts.ts` | `transitions` topic, `T` shortcut |
| `tests/transform-readers.test.ts` | handle draws read the resolved clip only; allowlist new readers |

## 6. Test ids (new)

`transition-chip` (`data-transition-id`, `data-type`), `transition-chip-handle-l`, `transition-chip-handle-r`, `transition-cut` (the "+" on a bare cut, `data-cut-time`), `transition-browser`, `transition-tile-{dip,dissolve,wipe,slide,push,zoom,glitch,audio}`, `transition-drop-ghost`, `transition-inspector`, `transition-type`, `transition-duration`, `transition-ease`, `transition-direction-{left,right,up,down}`, `transition-softness`, `transition-amount`, `transition-audio-curve`, `transition-remove`, `transition-menu-add-start`, `transition-menu-add-end`, `transition-menu-remove`, `transition-menu-merge`, `transition-fade-replaced` (audio inspector note), `transition-help`.

## 7. Parity and exactness requirements (numbers)

- **Video parity:** for every type, export frame N (ffmpeg grab of a 320 px export) vs the harness preview render at `t = N/fps`, at 25 and at 30 fps, for N ∈ {window start − 1, window start, start + 1, cut − 1, cut, cut + 1, window end − 1, window end}: mean |Δ| ≤ 1/255 per channel over the frame and ≤ 3/255 at 9 probe points (the 5E crop-render tolerances). Frame `window start − 1` and `window end` must equal the no-transition render exactly (0/255 in the preview).
- **Progress exactness:** solid red → solid blue image clips, dissolve linear, d = 1 s: preview R at frame N = 255·(1 − u_N) ± 2/255 with `u_N = (N/fps − (c − d/2))/d`; at the cut frame (u = 0.5) R = B = 128 ± 2. Wipe: edge column within 1 px of `e·W` (softness 0). Slide/push: a marker pixel moves by `e·W` ± 1 px.
- **GPU vs CPU:** `transitionMath.ts` vs the shader, every type and direction, 8 progress values, mixed blend modes: ≤ 3/255 (the Plan 4 drift guard).
- **Audio seams:** `planWindow` segment `when/whenEnd/srcFrom/srcTo` bit-identical on both sides of every window boundary inside a handle (0.5 s windows across a 1 s crossfade); crossfade gains at `c` are the same number on both sides (`cos(π/4)`, exact); power: |gA² + gB² − 1| ≤ 1e-3 everywhere; gain: gA + gB = 1 within 1e-12 at breakpoints. Null test: a 1 kHz tone clip split at a frame boundary with a `gain` crossfade of 1 s vs the unsplit clip, offline mixdown: peak residual ≤ 1e-3 (−60 dBFS) (to be tightened to the existing split-continuity tolerance if that is stricter: Q6). Equal power on identical material: RMS at the cut = √2 × the source ± 0.5 dB; on uncorrelated noise: RMS within ± 0.5 dB across the window. No click: largest sample step at each window edge ≤ the source's own largest step + 1e-3. Live == export: the mixer's scheduled segments and gain point lists equal the mixdown's for the same windows (pure comparison) plus one e2e capture following the existing `audio-chain.spec.ts` pattern (Q7).
- **Bit-identity elsewhere:** a project without transitions renders and mixes exactly as in v9 (full e2e unchanged; unit test that `frameStepsAt` returns plain clip steps and `planWindow` output is deep-equal for such projects).

## 8. Migration v9 → v10 (repair only, `migrateTransitions.ts`, opus)

v9 → v10 adds nothing. When `transitions` is present on a track: non-array ⇒ dropped; entries must be objects with string `id`, `fromClipId`, `toClipId` and a known `type` (else dropped); `duration` finite, clamped to [2/fps, 5 s] then to handles and clip lengths (D2/D3, with the repaired media durations; missing media ⇒ handle 0 ⇒ dropped); `ease` repaired with 5A `repairEase` then restricted to D5 (others ⇒ `linear`); `direction` one of four (else the type's default), `softness` [0, 0.5], `amount` per type range, `audio` `power|gain` (else absent); non-adjacent, cross-track, adjustment or kind-mismatched pairs dropped; duplicates per cut/side: the first kept; duplicate ids re-issued; empty list ⇒ field removed. Unknown fields kept. Idempotent (`migrate(migrate(x)) ≡ migrate(x)`). `{version: 11}` ⇒ `newer`, the save is never overwritten. v1-v9 fixtures open and re-save as v10 without visible change.

## 9. Tasks

Each task ends with: `npm test && npm run typecheck && npm run build`, `grep -rl __clipforge dist` empty, the specs it touches (one at a time), a report in `docs/superpowers/ledgers/plan-5-task-reports/5c-task-N-report.md`, one review (P5-8), a commit (never a push).

### Task 1: Preparation (sonnet; refactor only)
- **Files:** split `src/core/model.ts` (new `src/core/transitionTypes.ts` with the types only, unused), `src/render/compositor.ts` (step loop → `src/render/drawSteps.ts`), `src/render/drawCollect.ts` (video/image collection → `drawCollectPicture.ts`), `src/state/store.ts` (selection slices), and `src/audio/mixdown.ts` / `chain.ts` if 5D left them above ~185 lines. Re-audit every §5 line number on the 5D tip; record 5D's real names (Q1) in the task report.
- **Tests:** none new (refactor); the oracle is unit + typecheck + build + a FULL e2e run on the split tree.
- **Commit:** `refactor: prepare for transitions` (no behaviour change).

### Task 2: Pure model, validity and edit rules (opus)
- **Files:** create `src/core/transitions.ts` (`cutsOf`, `windowOf`, `handleBefore/After` via the 5D mapping, `maxDuration`, `transitionValid`), `transitionEdits.ts` (`addTransition`, `removeTransition`, `setTransition`, `setTransitionDuration`), `transitionReconcile.ts` (`reconcileTransitions`, `transitionChanges(before, after)` for toasts); modify `timeline.ts`, `clipEdits.ts`, `merge.ts`, `tracks.ts`, `ui/mediaEdits.ts`, 5D's speed edits (D9).
- **Failing tests first** (`tests/transition-model.test.ts`, `transition-edits.test.ts`, `transition-rules.test.ts`): adjacency; handle clamp rounds DOWN to whole frames; 2-frame floor refusal text; locked refusals; same-reference no-ops; split re-points the OUT transition to the right half and keeps the IN one; split inside a window shortens; ripple never invents a transition; trim of the cut edge drops it, trim of the far edge shortens; detach leaves picture transitions; `hasRoom`/`assertFree` results unchanged with transitions present; a seeded property test (2 000 random sequences of split/move/trim/delete/ripple/join/add/set over 3 tracks) asserting `transitionValid` after every successful edit.
- **Mutation checks:** remove the reconcile call from `splitClip` (property test fails); swap the from/to re-pointing; round the clamp up; ignore `locked`.
- **Commit:** `feat(core): transitions on cuts (model and edit rules)`.

### Task 3: Data v10 and migration (opus)
- **Files:** `model.ts` (`CURRENT_VERSION = 10`), `migrate.ts` (track repair keeps raw `transitions`; project-level repair after tracks/media), new `migrateTransitions.ts`, fixtures under `tests/fixtures/`.
- **Failing tests first** (`tests/transition-migrate.test.ts`): §8 repair table row by row; v8/v9 fixtures with and without transitions open and re-save as v10 deep-equal apart from `version`; idempotence; `{version: 11}` ⇒ `newer`; persist-level "never overwritten" like 5E's.
- **E2e:** `transition-migration.spec.ts`: a hand-built v10 save with a 9 s transition loads clamped; a v11 save shows the "saved by a newer version" banner and an attempted edit does not overwrite it.
- **Mutation checks:** accept version 11; skip the handle clamp; keep a cross-track pair.
- **Commit:** `feat(data): v10 transitions migration`.

### Task 4: Frame steps, handle draws and decoders (opus)
- **Files:** `render/visible.ts` (`frameStepsAt`, flattened `visualClipsAt`), `drawCollect.ts` + new `drawCollectTransition.ts` (`TransitionDraw`, handle source time through the 5D mapping, `tEdge` resolution, D10), `tests/transform-readers.test.ts` allowlist.
- **Failing tests first** (`tests/transition-steps.test.ts`): step order across 3 tracks with a hidden layer; window edges exactly at `c ± d/2` (start inclusive, end exclusive); handle source time for 1×, 2×, 0.5× and reversed clips; `tEdge` holds keys, loops and presets at the edge frame while grain/glitch frame indices keep running; transition-free projects give plain steps deep-equal to today's `visualClipsAt`.
- **E2e:** `transition-decoders.spec.ts`: two decoders on the track during a window, none for hidden tracks; scrubbing 6 positions across 3 transitioned tracks never exceeds (drawn clips incl. handle clips) + `KEEP_RECENT`; the export opens the incoming decoder at the window start and closes the outgoing one at the window end (`videoSourceStats`).
- **Mutation checks:** draw the handle at `in` instead of `in − Δ`; skip the hidden-track filter; resolve the handle at `t` instead of `tEdge`.
- **Commit:** `feat(render): transition frame steps and handle frames`.

### Task 5: Transition pass on the CompositeBuffer (opus)
- **Files:** new `render/transitionMath.ts` (CPU mirror of D6/D8), `render/effects/shaders/transition.ts` (imports the blend GLSL), `render/transitionProgram.ts`; modify `compositeBuffer.ts` (second layer target, `transition(...)`, 4-target sizing on transition frames), `drawSteps.ts`, `adjustment.ts` (`needsComposite`).
- **Failing tests first** (`tests/transition-math.test.ts`, `transition-composite.test.ts`): every type and direction at e ∈ {0, ¼, ½, ¾, 1}; e = 0 ⇒ exactly A and e = 1 ⇒ exactly B; Normal-mode mix equals over-of-mix (D8 linearity); glitch repeatable for one frame and different for the next; `compositeSize` for 3840×2160 and 2160×3840 with 4 targets is the full viewport (126.6 MiB ≤ 128 MiB).
- **E2e:** `transition-render.spec.ts` (§7 progress checks on solid-colour image fixtures for each type; GPU vs CPU ≤ 3/255), `transition-blend.spec.ts` (a PiP scaled, rotated, cropped, anchored, with an effect and a 5B preset over a lower layer; Screen → Multiply; an adjustment layer above; blend-unavailable fallback = hard cut at `c` with the existing notice).
- **Mutation checks:** swap A/B; flip the wipe direction sign; skip the layer clear; progress measured from the clip start.
- **Commit:** `feat(render): transition pass`.

### Task 6: Audio crossfade through the shared chain (opus)
- **Files:** `audio/plan.ts` (audible span, `Segment.xfadePoints`), `audio/fade.ts` (`transitionGainPoints`, edge rule D12), `audio/chain.ts` (`xfade` node, gate at the audible end), `audio/mixdown.ts`, `audio/mixerSchedule.ts` (decode ranges), `audio/duck.ts` (coverage).
- **Failing tests first** (`tests/transition-audio-plan.test.ts`, `transition-audio-gain.test.ts`): §7 seam and gain numbers; fade-in plus an IN transition is not silenced before `start`; the tail gate closes at `clipEnd + hOut`; duck coverage includes handles; no `xfade` node and a deep-equal plan without transitions; audio-track `audio` transitions plan like video-track ones.
- **E2e:** `transition-audio.spec.ts` (offline mixdown and an exported file decoded to PCM with ffmpeg): the null test, the √2 bump with `power` on identical material, uncorrelated RMS flatness, no clicks at window edges, live == export capture.
- **Mutation checks:** swap cos/sin; build the envelope per window; leave the gate at `clipEnd`; clamp the decode range to `[in, out]`.
- **Commit:** `feat(audio): crossfades on transitioned cuts`.

### Task 7: Speed, robustness, performance, memory (opus)
- **Files:** tests only, plus fixes found.
- **E2e:** `transition-speed.spec.ts` (2× outgoing, 0.5× reversed incoming, a ramp ending at the cut: picture parity and the `gain` null-test variant), `transition-robust.spec.ts` (a 3-frame handle clamps to 6 frames with a toast; images and overlays; a long-GOP handle seek gives the right first window frame, never black; 4K export with a transition keeps `compositeMemory` ≤ 128 MiB and the effect pool unchanged; three simultaneous transitions on three tracks = 6 decoders), `transition-perf.spec.ts` (a 1080p transition frame on SwiftShader ≤ 2.5× the same frame with one Screen-blend layer: measure first, record the ratio as a ruling like T10-1).
- **Commit:** `test: transitions with speed, edge cases and budgets`; FULL e2e at the end of this task.

### Task 8: Timeline UI (sonnet)
- **Files:** `ui/ClipView.tsx`, `ui/Lane.tsx`, new `ui/TransitionChip.tsx`, `ui/transitionDrag.ts` (DOM-free maths: symmetric duration, frame snap, live clamp), `ui/transitionSelection.ts`, `ui/transitionCommands.ts`, `ui/keys.ts`, `ui/transitions.css`.
- **Failing tests first:** `tests/transition-drag.test.ts` (clamps, snapping, min 8 px chip, nearest-cut search for `T`).
- **E2e:** `transition-timeline.spec.ts`: add via `transition-cut`; a duration drag is ONE undo step and stops at the handle limit; Delete removes the selected transition (keys still win when selected); `T` adds at the nearest cut; locked track: no "+" and drags refused; trimming a cut edge removes the transition with a toast and undo restores it.
- **Commit:** `feat(ui): transition chips on the timeline`; FULL e2e (Delete routing touches many specs, Q5).

### Task 9: Browser, inspector, context menu, Help (sonnet)
- **Files:** new `ui/TransitionBrowser.tsx` (static SVG tiles, drag onto a cut, `transition-drop-ghost`), `ui/TransitionInspector.tsx`, `ui/Inspector.tsx`, `ui/AudioInspector.tsx` (`transition-fade-replaced`), `ui/contextMenuItems.ts` (flat items, `testId` overrides), `ui/helpContentMore.ts` + `helpShortcuts.ts`.
- **E2e:** `transition-ui.spec.ts`: each control round-trips to the data and the picture with one undo step; ease list offers only D5 kinds; keyboard access (Tab/Enter on tiles and chips); clip menu "Add transition at start/end"; Help search finds "crossfade".
- **Commit:** `feat(ui): transition browser, inspector and menus`.

### Task 10: Join with a transition and clipboard carry (opus)
- **Files:** `core/merge.ts` (`joinClips` opts, `joinTransitionReport`), `core/clipClipboard.ts` (payload transitions, remapped ids), `ui/edits.ts` (`mergeClips` option), `ui/commands.ts`.
- **Failing tests first** (`tests/transition-join.test.ts`, `transition-clipboard.test.ts`): added/shortened/skipped counts; no second transition at a cut that had one; paste to another track keeps the pair; a pair that would not be adjacent after paste is dropped; duplicate twice keeps ids unique.
- **E2e:** `transition-join.spec.ts`: three clips with gaps → "Merge with crossfade" → two transitions in one apply; the exported frame at each cut is a 50 % mix (± 3/255); a clip without a handle is skipped with a toast.
- **Mutation checks:** add at every cut of the track instead of only between selected clips; keep ids on paste.
- **Commit:** `feat: merge with transitions; copy/paste keeps transitions`.

### Task 11: Journey, docs, final review (sonnet; opus final review)
- **Files:** `tests/e2e/transition-journey.spec.ts`, `docs/superpowers/ledgers/plan-5c-manual-qa-checklist.md`, README (limits), `PROJECT_HANDOFF.md`, `CLAUDE.md` (data v10), the ledger.
- **Journey:** import two videos with handles → crossfade via "+" → change to wipe right with softness → drag the duration → split the outgoing clip outside the window → undo chain exact → reload → 1080p export: the picture at the cut and the audio crossfade checked with ffprobe/ffmpeg.
- **QA checklist:** real GPU, Mac Chrome/Safari, QuickTime playback, audible crossfades, 6 simultaneous decoders (Q4), dip on an upper track (Q8).
- **Final review:** fresh opus, read-only, one themed fix wave. **Commits:** `test: transitions journey`, `docs: Plan 5C`.

**Part gate (before any deploy request):** all tasks reviewed clean, final review 0 Important, the full gate, dist hook grep empty, a FRESH full `npm run e2e -- --trace off` green (known flakes re-run alone), `npm run e2e:preview` green, the production tip an ancestor of HEAD. Then STOP and ask the user for the push/deploy go-ahead.

**Effort (rough):** 11 tasks, about 1.3-1.6× Plan 5B (10 tasks); roughly +180 unit tests and +45 e2e tests (full e2e about +5 min). Highest-variance tasks: 5 (shader + composite budget) and 6 (audio seams), each could need a second fix round.

## 10. Risks

1. **Handle availability on trimmed footage.** Many imported clips are used whole (no handle at either end): the "+" would be refused often. Mitigation: D3 shorten-first, an explicit refusal text that says what to do, the chip shows the clamped duration; O2 offers the alternative (borrow frames by freezing the edge frame).
2. **Two decoders per track during a window.** Preview bound becomes (drawn clips incl. handle clips) + `KEEP_RECENT` (2); three simultaneous transitions = 6 live decoders, each with up to 4 cached frames (`decode.ts:29`). Real Chrome/Safari hardware decoder limits are unverified (Q4); the incoming decoder's seek now happens at the window start (possible first-frame stall in preview; export waits, so no wrong frame).
3. **Audio seam exactness.** Handles change every segment's source range, fades, the tail gate and duck coverage; any engine computing its own span would break live == export. Mitigation: one planner field, pure comparisons of mixer vs mixdown plans, the null test.
4. **Blend modes and adjustment layers above a transition.** D8's fused pass must match `blendPixel`; a frame that previously did not need the composite now does (cost only inside windows). Fallback when the blend program fails: hard cut plus the existing notice.
5. **Speed interaction.** Handles depend on edge speed and direction; a ramp or reverse misread gives a wrong handle frame. Mitigation: everything through the 5D mapping, Task 7 specs with 2×, 0.5× reversed and a ramp.
6. **Memory.** One extra RGBA8 viewport target (33 MB at 4K), within the existing 128 MiB composite budget at 4K (4 targets = 126.6 MiB); larger preview viewports composite smaller on transition frames only (visible softness only on huge displays, QA item). Overlay texture budget T10-3 unchanged.
7. **Frozen animation (D10) surprises.** A Fade Out preset plus a dissolve looks like a dip; documented and listed in QA.
8. **Hidden coupling via `visualClipsAt`.** Changing it to include handle clips also feeds the merge-all job and harness; covered by the bit-identity test for transition-free projects and the full e2e.
9. **All measurements SwiftShader-only** (as for Plans 4-5E): real-GPU, Safari and QuickTime unverified; manual QA items.

## 11. Open questions (unverified; resolve in the named task)

- Q1 (Task 1): 5D's real API names, reverse representation, whether `sourceTimeAt` extrapolates past the edges.
- Q2 (Task 6): does `decodeAudioRange` return silence or throw for a range past the audio stream's end when the audio track is shorter than the video track? Handle availability may need `min(videoDuration, audioDuration)` for the audio side only.
- Q3 (Task 4): `motionAt`/`localTime` behaviour outside the clip is not relied upon (D10 clamps), but the reader audit must prove no handle draw reaches them unclamped.
- Q4 (Task 11 QA): hardware decoder limits in real browsers with 6 open `VideoDecoder`s.
- Q5 (Task 8): whether `keyRouted` can take a third tier without disturbing the 5A Delete specs (full e2e at Task 8).
- Q6 (Task 6): the tolerance of the existing split-continuity audio spec, to align the null-test bound.
- Q7 (Task 6): how the existing e2e captures live playback output (the `audio-chain.spec.ts` pattern) and whether it can capture a window seam.
- Q8 (Task 5): whether Premiere-like "dip to black" on an upper track should cover lower layers with black (D6, chosen) or fade to transparency; cheap to switch (one shader branch).

## 12. Self-review

Spec coverage: line 23 fade/crossfade/wipe/slide/zoom/glitch ✓ D6 (push added as the slide sibling); line 20 auto-transition on merge ✓ D11, merged audio crossfaded ✓ D12; line 28 audio crossfades ✓ D12 + O3; 5A §5 outline (cut model, handles, both pictures through their stacks, CompositeBuffer pass, equal-power through `chain.ts`, Join option, risks) ✓ D1-D12, Tasks 2-10. No overlap invariant touched (D1). Every structural edit named in the brief has a rule (D9) and a test (Task 2 property test). Preview == export by construction (one planner, one shader, one chain) and by measurement (§7). No placeholders: each task names its failing tests and mutations; unknowns are listed in §11, not assumed. Cost if D1 is wrong (users want overlap-style transitions): the data still describes a cut and a duration, so an alignment option or a "borrow frames" mode is an additive change, not a rewrite.

## 13. Decisions I need from you

| # | Question | Recommendation | Cost if wrong |
|---|---|---|---|
| O1 | Model: cut-attached and centred with source handles (clips never overlap) vs. overlapping clips on one track | Cut-attached, centred (D1; same as 5A O5 under P5-1) | Overlap = rewrite of every `hasRoom`/`assertFree` site and all drag rules (several tasks) |
| O2 | No handle: shorten the transition to the available handle and refuse below 2 frames, vs. freeze the edge frame to "borrow" the missing duration | Shorten / refuse (D3); freeze-frame borrowing deferred | Adding a freeze mode later is one flag and one branch in the handle draw; no data loss |
| O3 | Audio-only crossfades on audio-track cuts (type `audio`) in 5C | Yes: same model, same chain, small UI (spec line 28; Plan 3 deferred "no crossfades") | Dropping it = remove one type and its tile; no data change if done before deploy |
| O4 | Audio curve default | Equal power by default, constant gain as an option per transition (exact for two halves of one shot) | One default; existing saves keep their stored value |
| O5 | Split inside a transition window | Allow the split and shorten the transition to fit (toast), never refuse (a no-selection split acts on all tracks) | Refusing instead is one guard; users may find silent shortening surprising (undo restores) |
| O6 | Duration limits | Default 1 s, min 2 frames, max 5 s, whole frames | A schema range: changing it after deploy needs a bump (P5B-2 rule) |
| O7 | Eases offered for progress | linear, ease in/out/in-out, bezier without overshoot; no hold/back/elastic/bounce/spring | Allowing overshoot later needs per-type clamping rules; migration already repairs |
| O8 | Copy/paste/duplicate carry a transition when both its clips are copied | Yes | Not carrying = simpler payload; users would re-add transitions after duplicating a sequence |
| O9 | Animation inside handles: frozen at the edge frame (footage keeps playing) vs. continuing keys/presets beyond the clip | Frozen (D10) | Continuing would need defined extrapolation for keys, loops and every preset (5B); visual-only change |
| O10 | Dip colour: black only vs. black/white option | Black only in 5C | A `colour` param later is additive (schema bump after deploy) |
| O11 | Shortcut `T` for "add transition at the nearest cut" (Mod+D is Duplicate) | Yes | Rebinding is trivial |
| O12 | Join: offer "Merge with crossfade" as a separate menu item using the last-used transition | Yes (D11) | A settings toggle instead is UI-only |

Approve as recommended, or tell me which to change; then I record P5C-1..n in the ledger and start Task 1 (after 5D's part gate).
