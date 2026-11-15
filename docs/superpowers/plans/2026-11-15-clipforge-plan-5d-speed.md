# ClipForge Plan 5 Part 5D: Speed, reverse, speed ramps and freeze frame (DRAFT for approval, data v9)

> **Provenance:** drafted from the real code at `1dba862` by a read-only research agent, reviewed by the controller (file sizes and a sample of file:line citations re-checked). Line numbers must be re-checked at the start of each task. Plans 5D and 5C are written to be consistent: 5C assumes the 5D time map (`src/core/clipTime.ts`). Order: **5D first, then 5C** (5C is branched off the 5D tip).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans), task by task. Nothing here is implemented yet: the user must approve this plan and answer §12 first. Adopted decisions are recorded as `Ruling: P5D-n` lines in `docs/superpowers/ledgers/plan-5-animation-ledger.md` BEFORE Task 1.

**Goal:** Let the user change a clip's speed (0.25×-4×, constant), play it backwards, give it a speed ramp (a keyframed speed curve with the 5A eases), and insert a freeze frame; the clip's sound follows in BOTH audio engines (live mixer and export mixdown), pitch-preserved by default (a block-anchored WSOLA time-stretch), reversed with the picture, and in sync with it. Preview and export stay identical (one time mapping, one shared audio prepare path). Data moves to **v9**.

**Architecture (summary):** ONE pure module, `src/core/clipTime.ts`, owns every relation between timeline time and footage time: `clipDuration(c)`, `clipEnd(c)`, `sourceTimeAt(c, t)` (timeline → footage), `timelineTimeAt(c, u)` (footage → timeline), `sourceSpan(c, a, b)` (footage interval under a timeline interval) and `trimLimits(c, media)`. Task 1 routes every open-coded `out − in` / `in + (t − start)` site through it at speed 1 (behaviour-identical, the full e2e is the oracle) and adds a source-scan audit that fails on any new open-coded site. Speed, reverse, ramps and freeze then change only that module (plus the decoder and the audio prepare step). Video asks the decoder for `sourceTimeAt(clip, t)`; reverse uses a bounded GOP-backward frame cache. Audio: a retimed clip is turned, in the shared `prepareSource` path (decode → noise reduction → **retime**), into a *virtual speed-1 source* whose time 0 is the clip's start, so the planner, `pieceTiming`, the mixdown scheduler and `chain.ts` keep their exact maths. Keys, emphasis and loops stay footage-anchored (5A D3): they reach footage through `localTime`, which now goes through the map.

**Tech stack:** unchanged (TypeScript strict, React 19, WebGL2, Web Audio, Mediabunny 1.65.2, Vitest, Playwright with ffmpeg/ffprobe). No new dependency: WSOLA and the resampler are ~300 lines of pure TS (DOM-free, unit-testable on Float32Arrays).

**Context read (for the reviewer):** `CLAUDE.md`; `PROJECT_HANDOFF.md` §5 (Plans 3, 5A, 5B, 5E), §6 (rulings 3 and 13), §8, §9 (Plan 3 audio limits, 5A frame-grid limit); Plan 5 plan §3.1 (D3 key time base), §3.3, §4.2 (5D audited sites, written at `22f797c` and re-audited below), §5 (5D outline), §7 O6; ledger rulings P5-1, P5-2, P5-5 (frame-grid anchoring, to be revisited here), P5-6, P5-8, P5B-1, P5E-1..4; Plan 3 plan D1 (one chain), D2 (detach = copy + silence), D3 (pitch shifter), D4 (noise reduction before the graph), D7 (window seams), D9 (speed deferred to Plan 5); the 5E plan as the template. Code at `1dba862` (`feature/plan-5e-crop-anchor`, data v8; production = `462d40b`, rollback candidate `26f032e`, v7). Baseline (ledger, 5E part gate at `fdda530`): `npm test` 1918, full e2e 587, `e2e:preview` 1.

Branch (proposed): `feature/plan-5d-speed` off `feature/plan-5e-crop-anchor` (`1dba862`).

---

## 1. Scope

In: `Clip.speed`, `Clip.reverse`, `Clip.speedKeys` (ramp), `Clip.preservePitch`, `Clip.freeze` (a freeze-frame clip created by an edit); speed-aware split/trim/ripple/join/move/copy-paste/detach/attach/merge-all; video at any speed and in reverse; audio at any speed, pitch-preserved or not, reversed, ramped, in both engines; inspector Speed section (field, chips, Duration field, Reverse, Preserve pitch, Ramp presets and points, Freeze frame), clip badge, context-menu entries, Help topic; migration v9.

Out (deferred, recorded in the ledger): optical-flow / frame-blending slow motion (5D shows the nearest frame); speeds outside 0.25-4 (O1); a draggable speed graph (the ramp graph is read-only, points are edited numerically; O5); ramp keys on the timeline diamond row; speed on image, overlay and adjustment clips (refused, O11); linked speed between a video clip and its detached twin (O10); time remapping by "source frame at time" keys (Premiere-style time remap); an AudioWorklet or Worker for the time-stretch (main thread in slices, like noise reduction; Worker is a later perf item).

## 2. Constraints (carried over)

- TypeScript strict; 2 spaces, single quotes, semicolons; files ≲200 lines, split BEFORE extending (Task 1). Already at or over the limit and touched here: `src/media/decode.ts` 212, `src/audio/mixdown.ts` 199, `src/ui/edits.ts` 191, `src/core/model.ts` 190, `src/export/exporter.ts` 203, `src/ui/useClipDrag.ts` 182, `src/audio/mixer.ts` 178. New types go in `src/core/speedTypes.ts`.
- `src/core` stays pure; edits are `(Project, …) => Project`, throw `TimelineError` for user-facing refusals, never mutate, return the SAME reference for no-ops. Locked tracks refuse every speed edit.
- One gesture = ONE `apply` = one undo step (a speed field commit, a chip click, Reverse, a ramp preset, a ramp point commit, Freeze frame incl. its split and ripple). Undo restores the exact previous project.
- Data **v9**: `CURRENT_VERSION = 9` (one constant); v1-v8 open unchanged (migration adds nothing, repairs what is present); `{version: 10}` is `newer` ⇒ `unsupported`, never overwritten. Saves from v9 are one-way.
- The time mapping is the ONLY place timeline↔footage arithmetic happens (audit test, Task 1). Speed 1 forward must stay bit-identical: `sourceTimeAt` returns `c.in + (t − c.start)` with exactly today's operations, and the audio path skips retiming entirely (identity fast path), so no existing pixel or sample changes.
- Preview == export: deterministic pure maths for the map, the ramp table, the resampler and WSOLA; window-independent DSP (§3 D9) so live (20 s windows) and export (30 s windows) produce the same samples.
- Plan 3 rulings stay: ONE `chain.ts` for both engines; noise reduction runs on the decoded SOURCE before anything else; pan law, ducking, seam gate unchanged; detach copies, it does not link.
- Keep every existing `data-testid`; new ids use the `speed-*` prefix (§7). `window.__clipforge` stays DEV-only (`grep -rl __clipforge dist` empty).
- TDD (failing test first), mutation-check each important guard and name the caught mutation in the task report. Commit trailers (blank line before): `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or the model that wrote the commit) and `Claude-Session: <current session URL>`.
- **No push, no deploy** without the user's explicit go-ahead in the current session (P5-2's conditions apply when it comes). Never touch `release/` or any Vercel project other than `clipforge` (never `kidlingo`, `gtm-engineer`). Never run `playwright install`; one e2e run at a time (port 5173).
- Model policy (P5-8): opus for the migration, the time map, split/trim/timing, decode, audio and DSP, render maths and the final whole-part review; sonnet for UI wiring, docs, file splits and test-only tasks. A reviewer on every task.

## 3. Decisions (proposed rulings; the ones needing the user are in §12)

- **D1 One time map.** `src/core/clipTime.ts` exports `clipDuration`, `clipEnd` (moved from `model.ts:184-190`, re-exported there so imports keep working), `sourceTimeAt(c, t)`, `timelineTimeAt(c, u)`, `sourceSpan(c, a, b): [lo, hi]` (sorted), `isIdentityTime(c)` (no speed fields, no freeze) and `trimLimits(c, media)`. Sourceless clips (overlay, adjustment) never carry speed: for them the functions are today's. Cost if wrong: none user-visible; it is the guard that makes the rest tractable.
- **D2 Data (v9), optional fields, absent = today.** `speed?: number` (0.25..4, absent = 1, `1` never stored); `reverse?: true`; `speedKeys?: Keyframe[]` (the ramp: `v` = speed at FOOTAGE time `t`; present ⇒ it wins over `speed`; 2..64 keys, values 0.25..4); `preservePitch?: false` (absent = preserved); `freeze?: { at: number }` (footage seconds; video clips only; a freeze clip has no speed fields). Allowed on: speed/reverse/ramp/pitch on `video` and `audio` clips; freeze on `video` only. Refused (`TimelineError`) on image, overlay, adjustment (O11).
- **D3 Constant speed and reverse.** Forward: `u = in + s·τ` with τ = t − start, `D = (out − in)/s`. Reverse: `u = out − s·τ`, same `D`. At s = 1 forward the code path is today's (bit-identical). The clip covers footage [in, out) in both directions; `in`/`out` keep their meaning (the footage range), so detach, normalise, the noise profile cache key (`denoiseSource.ts:48`) and peaks stay valid.
- **D4 Ramp maths (footage-anchored).** The speed curve s(u) is evaluated from `speedKeys` with the 5A evaluator (`evalKeys`, ease per segment, clamped to 0.25..4 so overshooting eases such as back/elastic/spring cannot reach 0; constant before the first and after the last key). Timeline offset of footage u: τ(u) = ∫ from in to u of du′/s(u′). Definition (not an approximation of something else, so preview and export agree by construction): r(u) = 1/s(u) is sampled on a FIXED grid of 64 cells per key segment, anchored on the key times (never on in/out), plus constant cells outside the keys; within a cell r is linear, so τ is a closed-form quadratic per cell and strictly increasing (r ≥ 0.25 > 0). A cumulative table per key list is memoised in a `WeakMap` keyed by the `speedKeys` array (edits make new arrays, like `cachedMotionPath`). `timelineTimeAt` = table lookup + cell quadratic. `sourceTimeAt` = monotone bisection: binary search over the cumulative table for the cell, then bisection inside the cell (≤ 60 iterations or |Δu| < 1e-12 s); the closed-form root is allowed as an optimisation only if the property tests agree to 1e-12. Exact edges: `sourceTimeAt(start) = in`, `sourceTimeAt(start + D) = out` returned literally (no arithmetic), reverse mirrored. Because the grid follows the keys, a split or trim does not change the curve: the split invariant holds to float rounding.
- **D5 Invariants (Vitest, property tests over random speeds/keys/eases/cuts; tolerance 1e-9 s unless stated).** (I1) `timelineTimeAt(sourceTimeAt(t)) = t` and the converse on [start, end]; (I2) monotone: forward increasing, reverse decreasing; (I3) edges exact (=== in/out); (I4) speed 1 forward: `sourceTimeAt` bit-equals `in + (t − start)` for 10 000 random clips; (I5) split at any t: `D_left + D_right = D`, and for every t in each half `sourceTimeAt(half, t) = sourceTimeAt(original, t)`; reverse halves are [cut, out] (left) and [in, cut] (right); (I6) trim then untrim returns the same clip (exact for constant speed; 1e-9 for ramps); (I7) setSpeed then setSpeed(1) restores `out` within one footage frame of the frame snap (D7) and is exact when the duration was already frame-aligned; (I8) the ramp total D equals Simpson's integral of 1/s with 4096 sub-intervals within 1e-6 s (sanity, not definition); (I9) a freeze clip: `sourceTimeAt ≡ at` for every t.
- **D6 Timeline edit rules** (new `src/core/speedEdits.ts`, `freezeEdits.ts`; trim/split in `clipEdits.ts`).
  - `setSpeed(p, ids, speed, {ripple})`: keeps `start`, keeps `in` (forward) / keeps the footage range's start-of-play edge (reverse keeps `out`), changes `D`; the new end must not overlap the next clip on the track: refused with `'Not enough room for this speed: the clip would overlap the next clip'` unless `ripple` (the Speed section's "Push later clips" toggle), which shifts every later clip on THE SAME TRACK by ΔD (same-track rule as ripple delete, `timeline.ts:103-119`). Several selected clips change in one apply, processed right to left so ripples compose. Same reference when nothing changes.
  - `setReverse(p, ids, on)`: D unchanged; no overlap possible. `setRamp(p, id, keys | preset | null)`: like setSpeed (D changes). `setPreservePitch(p, ids, on)`: audio only, D unchanged.
  - Trim: start edge forward `in' = sourceTimeAt(clip, time)`, reverse `out' = sourceTimeAt(clip, time)`; end edge forward `out'`, reverse `in'`; outward trims extrapolate the map (constant before/after the keys). Limits: footage within [0, media.duration] via `trimLimits` (today the end limit lives in `drag.ts:61-64` only; with reverse the START edge also needs the media-duration limit, so the core `trimClip` gains a media-aware check and the UI reads the same `trimLimits`). MIN_CLIP (0.05 s) stays a TIMELINE duration.
  - Split: `cut = sourceTimeAt(clip, time)` (`clipEdits.ts:64`); halves per I5; keys/effects/motion partition exactly as today, but in FOOTAGE time (`[lo, hi]` from `localRange`, which stays the footage range), and `speedKeys` are partitioned with the same `splitKeys` (keys deciding each half's range). Fades: left keeps fade-in, right fade-out, clamped to each half's TIMELINE duration (`clipEdits.ts:80, 85` use `cut − in` / `out − cut` today: must become the halves' `clipDuration`).
  - Ripple delete, join (`merge.ts:24, 30, 43`), snapping (`merge.ts:67`), `activeClipsAt`, `timelineDuration`, duck coverage, fades, the gate: already go through `clipDuration`/`clipEnd` and become speed-aware for free (verified by tests, not assumed).
  - Fades and audio effect times stay in TIMELINE seconds (not scaled by speed); a shortened clip clamps them with `fitFades`. Picture effects' time (`clipEffects.ts:43-44`, grain/glitch/VHS) stays timeline time.
  - Keys, emphasis `at`, loop `phase` and `speedKeys` are footage-anchored and NOT rewritten by any speed edit: they ride the footage (O3). In/Out presets keep timeline seconds (`motion.ts:71-90` uses `snapToFrame(t − start)`), so a 0.5 s entrance stays 0.5 s at any speed.
  - Detach: the twin copies the speed fields (the `...sound` spread at `detachAudio.ts:25` already does; a test pins it). Attach back requires equal speed, reverse, ramp and preservePitch: `audioQueries.ts:27-31` (`isUneditedTwin`) and `:49` (the start/in/out match). The twin does not follow later speed edits (O10).
  - Copy/paste/duplicate (`clipClipboard.ts`) carry the fields; animation copy/paste carries keys in footage time (a 1 s animation pasted onto a 2× clip plays in 0.5 s, consistent with O3).
- **D7 Frame grid (revisits P5-5).** Keep the evaluation grid anchored at the clip's TIMELINE start (`localTime = sourceTimeAt(clip, start + snapToFrame(t − start))`), so preview frame N = export frame N exactly as today. New: every speed edit (setSpeed, setRamp, setReverse is D-neutral) snaps the resulting duration to a whole number of output frames by moving the footage end that is played LAST (forward `out`, reverse `in`) by less than `speed/fps` footage seconds (O7); so a clip that started on the grid ends on it and ripple does not create new off-grid starts. P5-5's accepted sub-frame phase for off-frame cuts is unchanged.
- **D8 Freeze frame.** `freezeFrame(p, clipId, t, hold = 2)`: one apply that splits the clip at t (refused on the clip edges within MIN_CLIP: then it inserts before/after without a split), inserts a freeze clip `{ ...picture fields, freeze: { at: sourceTimeAt(clip, t) }, in: 0, out: hold, audio: silent }` and ripples later clips on the same track by `hold` (refused on a locked track; other tracks are not moved: a detached twin elsewhere is NOT shifted, a toast says so). The freeze clip keeps transform, crop/flip/anchor, effects, blend, fit; it gets the transform and effect values RESOLVED at t as static values and no keys/motion (frozen look). It behaves like an image clip for time (local = `snap(t − start)`, unbounded trims, `trimLimits` → Infinity), never sounds (`audibleClips`, `plan.ts:41-53`), and its decoder serves one cached frame. Alternative (bake the frame to an image media) is O6.
- **D9 Audio: a retimed clip is a virtual speed-1 source.** For a clip that is not `isIdentityTime`: the planner (`plan.ts:84-107`) gives its segments `srcFrom/srcTo` in CLIP-LOCAL TIMELINE seconds (0..D, exact `0`/`D` at the clip's own edges, as `in`/`out` are today) plus `media: [lo, hi]` = `sourceSpan` of the segment widened by the margins (see below). The engines decode `media` (real footage), then `prepareSource` (`denoiseSource.ts:65-72`) runs noise reduction on the source buffer as today and then **retime** (`src/audio/retime/`) which returns `{ buffer, start }` with `start` in the same virtual clip-local seconds. Everything after (`pieceTiming` `mixerSchedule.ts:73-88`, `MixdownStream.schedule` `mixdown.ts:106-139`, `buildClipChain`) is unchanged: the virtual source plays at rate 1, so fades, pan, effects, pitch shifter, duck and the seam gate see timeline-time audio. Margins: the effect pre/post-roll (`chainMargins`, timeline seconds) and `CUT_MARGIN` (0.05 s) are converted to footage with the map (≤ 4 × in footage) and the retimer's own margin (one grain + search tolerance) is added; still clamped to [in, out] like today (`mixerSchedule.ts:39-40`, `mixdown.ts:109-110`).
- **D10 Retime algorithms (pure, window-independent).** Output sample k of a clip has clip-local timeline time τ_k = k / sr on a grid anchored at the clip start (never at a window start), so any two renders produce the same samples.
  - `preservePitch: false` → **resampler**: y(τ) = x(sourceTimeAt(τ)) by a 32-tap Kaiser-windowed sinc whose cutoff is min(1, 1/s(τ)) (anti-aliasing at > 1×). Stateless per output sample ⇒ seams exact.
  - `preservePitch` (default) → **block-anchored WSOLA**: Hann grains of 40 ms, synthesis hop 20 ms (50 % overlap, constant overlap-add gain 1), search tolerance ±10 ms on a 4× decimated mono mix then ±4 samples at full rate; analysis positions come from the map (so ramps are native: nominal position of grain j = `sourceTimeAt(τ_j)`). The grain chain RESETS at every block boundary (blocks of 1.0 s of clip-local timeline time, anchored at the clip start): the first grain of a block takes its nominal position, so a block depends only on its own source span ⇒ any window renders the same blocks; overlap-add across a block edge sums both blocks' grains. Speed exactly 1 with reverse: pure sample reversal (no WSOLA). Speed exactly 1 forward: identity (D1 fast path).
  - Reverse: the decoded span is reversed and the map mirrored; reversed audio is the user-visible result (O9).
  - Cost guard (measured in Task 9, named budget): ≥ 10× real time for stereo 48 kHz on the test host (a 20 s live window in ≤ 2 s main-thread time, in slices that yield like `denoiseBuffer`). The live mixer uses a first window of 2 s (`LIVE_FIRST_WINDOW_SECONDS`) when an audible clip is retimed, so Play starts within ~0.3 s; seams are exact by construction so the window layout does not matter (O12).
- **D11 A/V sync (named numbers).** Video shows the frame at `sourceTimeAt(clip, t)` for t = n/fps (export) or the playhead (preview). Reverse samples the output frame's footage interval at its MIDDLE (`out − s·(τ + 0.5/fps)`), so the decoder's 1e-4 s tolerance (`decode.ts:36`) cannot pick the frame after `out`. Audio has no cumulative drift (WSOLA nominal positions come from the same map; the resampler is exact). Tolerances: |audio onset − video flash| ≤ 1/fps + 128/48000 s (≈ 36 ms at 30 fps) for the resampler and for speed-1 reverse; ≤ 1/fps + 10 ms (WSOLA tolerance) for stretched audio; drift between the first and last marker of a 60 s clip ≤ 2 ms; exported duration (ffprobe) within 1 frame of `timelineDuration`.

## 4. Audited code sites (current line numbers at `1dba862`)

| Site | Change |
|---|---|
| `src/core/model.ts:83` (comment "duration = out - in"), `:84-112` (Clip), `:145` (`CURRENT_VERSION = 8`), `:184-190` (`clipDuration`, `clipEnd`) | v9; fields typed in new `speedTypes.ts`; the two functions move to `clipTime.ts` (re-exported) |
| `src/core/timeline.ts:17-19` (overlaps), `:103-119` (`deleteClip` ripple, `dur` at 106), `:121-125` (`activeClipsAt`), `:127-131` (`timelineDuration`) | via `clipEnd`/`clipDuration`: speed-aware for free; tests pin it |
| `src/core/clipEdits.ts:33-55` (`trimClip`: 44 sourceless, 45 `in + delta`, 48 `in + (time − start)`, 50, 53) | trims through the map, reverse edge swap, media limit (D6) |
| `src/core/clipEdits.ts:57-90` (`splitClip`: 61, 64 `cut`, 67-70 key range, 80 `cut − in`, 85 `out − cut`) | cut through the map, reverse halves swap, fades on halves' timeline durations, `speedKeys` partition |
| `src/core/merge.ts:13-51` (`joinClips` 24, 30, 43), `:53-71` (`snapTime` 67) | via `clipDuration`/`clipEnd` |
| `src/core/audioEdits.ts:33` (fade clamp `clipDuration`) | automatic (timeline seconds) |
| `src/core/audioQueries.ts:27-31` (`isUneditedTwin`), `:49` (twin match on start/in/out) | equality includes speed, reverse, ramp, preservePitch |
| `src/core/detachAudio.ts:25` (`...sound` spread), `:52-68` (`attachAudio`) | twin keeps speed fields (test); freeze clips refuse detach |
| `src/core/migrate.ts:46-58` (`toClipAudio` fits fades to `duration`), `:60-61` (`clipSeconds = out − in`), `:82-85` (`toClip`) | speed repair FIRST, then fades fitted to the speed-aware duration; new `migrateSpeed.ts` |
| `src/core/keyframes.ts:29-31` (`localTime`), `:34-37` (`localRange`), `:42-45` (`keyVisible`), `:52-55` (`keyFrame`), `:63-68` (`keyIndexAtPlayhead`) | `localTime` via the map; `localRange` stays the footage range; visibility and frame of a key from its TIMELINE offset (`timelineTimeAt`), so in reverse a key at `out` is visible and one at `in` is not |
| `src/core/animate.ts:41-55` (`resolvedTransform`), `:95-117` (`resolveClip`) | unchanged code, footage `u` from `localTime`; fast path also requires `isIdentityTime` to skip nothing new |
| `src/core/motion.ts:46-55` (`motionWindows`, D at 48), `:71-90` (in/out on `snapToFrame(t − start)`), `:94-110` (emphasis/loop on `localTime`) | in/out unchanged (timeline); emphasis/loop footage-anchored via `localTime` (O3) |
| `src/core/motionEdits.ts:59-60, 116`, `presetCommands.ts:50` (`at = localTime`) | unchanged maths, footage times; tests at 2× and reverse |
| `src/core/keyframeEdits.ts:133` (`moveKeys(…, delta)`) | delta becomes a timeline-frame delta mapped per key (`sourceTimeAt(timelineTimeAt(k) + Δ)`; constant speed = uniform ±s·Δ) |
| `src/core/keyEditHelpers.ts:28, 53`, `transformKeyEdits.ts:59, 72, 78`, `animTargets.ts:87`, `orientBake.ts:50-51`, `drawnScale.ts:28`, `keyLoops.ts:43` | footage domain, unchanged; covered by the reverse/2× property tests |
| `src/core/animTransfer.ts:67-68, 137-142`, `animPayload.ts:113-114`, `clipClipboard.ts:44` | footage-time payloads (documented behaviour), clip copy carries fields |
| `src/render/drawCollect.ts:130` (`frameAt(clip.in + (t − clip.start))`) | `frameAt(videoSourceTime(clip, t))` (reverse mid-frame rule, freeze) |
| `src/render/clipEffects.ts:43-44`, `overlays/textures.ts:117-118` | audited: timeline time / sourceless, unchanged |
| `src/media/decode.ts:29` (`MAX_CACHED_FRAMES = 4`), `:31` (`FORWARD_WINDOW = 2`), `:36` (EPS), `:105-144` (`lookup`), `:123-131` (backward request ⇒ fresh seek), `:178-183` (`seek`) | split first (212 lines); reverse requests served by a bounded GOP-backward cache (Task 7); forward window unchanged (4× = 0.13 s steps) |
| `src/export/exporter.ts:74` (`timelineDuration`), `:98` (`frameCount`), `:162-170` (frame loop) | audited, unchanged maths |
| `src/audio/plan.ts:41-53` (`audibleClips`, D at 48), `:84-107` (`planWindow`, 93, 97-98 `in + (a − start)`) | virtual-source segments for retimed clips (D9); freeze clips silent |
| `src/audio/mixerSchedule.ts:12` (`CUT_MARGIN`), `:39-40` (decode range), `:49` (`prepareSource`), `:73-88` (`pieceTiming`) | decode `media` range; prepare returns virtual time; timing unchanged |
| `src/audio/mixdown.ts:16, 21`, `:109-110` (decode range), `:121` (`prepareSource`), `:125-139` (chain, `when`, `lead`) | as above (split the scheduler out first: 199 lines) |
| `src/audio/mixer.ts:15` (20 s windows), `:17` (`START_LEAD`), `:70`, `:120` | first live window 2 s when a clip is retimed (D10) |
| `src/audio/denoiseSource.ts:31, 48, 65-72` | unchanged keys (footage range); retime runs AFTER `denoiseBuffer` |
| `src/audio/chain.ts:72` (gate end `clipEnd`), `:111` (effects phase0 = `clip.start`), `:117` (fades); `fade.ts:36`; `duck.ts:61` | timeline time: automatic; tests at 2× |
| `src/audio/effects/normalise.ts:14-16` (peak over `[in, out]`) | unchanged (footage peak; the stretch may differ by < 0.5 dB: measured, documented) |
| `src/audio/effects/pitch.ts:28-60` | unchanged; runs on retimed audio (pitch effect and speed compose) |
| `src/ui/Waveform.tsx:37-45` (span and `clip.in + (x/w)·span`) | per column `sourceSpan` (ramp non-linear, reverse mirrored); none for freeze |
| `src/ui/drag.ts:45` (move span `out − in`), `:54-58`, `:61-64` (`sourceEnd`) | `clipDuration`; `trimLimits` for both edges |
| `src/ui/useClipDrag.ts:60` (`duration: clip.out − clip.in`), `:64` | `clipDuration` |
| `src/ui/edits.ts:33, 43` | via `clipEnd`: automatic |
| `src/ui/ClipView.tsx:56, 68` (width, waveform width), `:71` (`clip-name`) | automatic width; speed badge next to the name |
| `src/ui/keyframeCommands.ts:23` (`onClip`), `:33` (`keyTimelineTime = start + (u − lo)`), `:42-53` (`keyJumpTime`) | `timelineTimeAt`; order by timeline frame |
| `src/ui/keyDrag.ts:19-25` (`diamondX`), `:34-44` (`clampDelta`), `:47-51` (`snapDeltaToPlayhead`) | timeline offsets of keys via the map |
| `src/ui/KeyframeStrip.tsx:28-51`, `KeyframeRow.tsx:29, 59`, `PresetParams.tsx:96, 112`, `MotionBands.tsx:19, 25`, `motionGhost.ts:19`, `AudioInspector.tsx:27` | positions from `timelineTimeAt` (strips run in timeline direction, mirrored in reverse); `motionGhost` uses `clipEnd` |
| `src/ui/motionPathMath.ts:59, 83, 117, 135` | footage-domain sampling, unchanged (visibility from `keyVisible`) |
| new `tests/clip-time-readers.test.ts` | source scan: `.out - `, `out - in`, `.in + (`, `.in + ` on clip times outside `clipTime.ts`/`speedRamp.ts` fails (allowlist for path tangents `a.in`/`a.out`, which are unrelated) |

Unverified (open questions): whether `harness*.ts` dev pages open-code clip time (dev only; audit lists them); whether `mergeJob.ts` needs anything beyond the exporter (believed not: merge-all renders through the export compositor and mixdown).

## 5. Video render and reverse decode

- Forward speed: only the requested time changes; at 4× the decoder advances 4 frames per output frame (inside `FORWARD_WINDOW`), so decode work is ×4 (guard in Task 12: decoded frames per output frame ≤ ceil(s) + 1 at steady state; counter added to the decoder stats next to `videoSourceStats`).
- Reverse: `ReverseFrameCache` (new `src/media/reverseCache.ts`) inside the decoder. On a backward request before the cached run: find the preceding key frame (Mediabunny `EncodedPacketSink.getKeyPacket(t)`, present in 1.65.2's typings: behaviour on fragmented MP4/MOV to verify), decode [key, previous run start) with `VideoSampleSink.samples(start, end)` and keep the LAST frames that fit the byte budget, served in descending order; when exhausted, decode the same GOP again up to the oldest served frame. Cost O(G²/N) decodes per GOP (G frames per GOP, N frames that fit).
- Memory: frames are converted to `ImageBitmap` and the `VideoFrame` closed at once (holding many decoder frames can stall hardware decoders: open question on Mac, not reproducible headless). Budget `REVERSE_CACHE_BYTES = 128 MiB` per source (w·h·4 per frame: 1080p ≈ 8.3 MB ⇒ 15 frames; 4K ⇒ 3 frames, then the re-decode passes dominate), global cap 384 MiB across sources (preview and export pools coexist, see Plan 4's 1.6 GB note); `MAX_CACHED_FRAMES = 4` stays for forward play.
- Time guard: reverse export of a 10 s 1080p clip with a 10 s GOP (fixture `long-gop.mp4`, `-g 300`) within 5× the forward export of the same clip (target ≤ 3×); a 2 s GOP phone-like fixture within 2×. Preview reverse playback may drop frames (latest-wins scheduling): stated in README.
- Freeze: the clip's decoder asks one time; the cache keeps that frame (no re-decode per output frame: guard).

## 6. Audio in both engines

- Pipeline per segment (both engines, one code path): plan (virtual-source segment) → `decodeAudioRange(media)` → `prepareSource`: noise reduction (source domain, unchanged) → `retime(clip, decoded, local range)` → schedule exactly as today.
- Seams: the retimed buffer for [a, b) is sliced out of whole retime blocks; a 1 s-window render and an `Infinity`-window render of the same project must be EQUAL sample for sample before the context's own resampling, and within 1e-6 after it (the existing CUT_MARGIN keeps resampling neighbours real). Live vs export: the same function on the same input ⇒ identical buffers (asserted on the harness by comparing the prepared buffers of a live piece and an export segment).
- Ramps: the resampler and WSOLA read positions from the map, so a ramp needs no special engine code; seams are as exact as for constant speed.
- Pitch effect (Plan 3 D3) runs after retime: "Chipmunk" on a 0.5× clip still shifts by its semitones.
- Measurements (Task 9, numbers in the report): sine sweep 100 Hz → 8 kHz log, 3 s, at 0.5×, 2×, 4×: instantaneous frequency (STFT peak, `stft.ts`) within 1 % of the source at the mapped footage time for 20 checkpoints (preservePitch), within 1 % of `s ×` the source (resampler); output length = 3/s ± 1 frame; RMS per 100 ms within ±1.5 dB; steady 440 Hz: energy outside 440 ± 20 Hz ≤ −30 dB (phasiness/flutter proxy). Transient smearing (a click repeated within ~one grain at 0.25×) is a known WSOLA artefact: measured and documented, not gated.

## 7. UI and test ids (new; all existing ids kept)

- Inspector section "Speed" (`SpeedFields.tsx`, video/audio clips; hidden for images/overlays/adjustment; on a freeze clip it shows "Freeze frame, 2.0 s" and the hold field): `speed-section`, `speed-value` (percent number field 25-400, commits on Enter/blur), `speed-chip-{25,50,100,150,200,400}`, `speed-duration` (timeline seconds, sets speed = footage span / duration, clamped), `speed-ripple` (toggle "Push later clips"), `speed-reverse`, `speed-preserve-pitch`, `speed-reset`, `speed-freeze` (Freeze frame at the playhead), `speed-freeze-hold`.
- Ramp sub-section: `speed-ramp-toggle`, `speed-ramp-preset-{rampUp,rampDown,bullet,montage,flash}`, a read-only graph `speed-ramp-graph` (speed over timeline, points as dots), point rows `speed-ramp-point-{i}` with `speed-ramp-point-{i}-value` and an ease button `speed-ramp-point-{i}-ease` that opens the existing ease UI (`EaseCurve`/`EasePanel` reused with a speed target; its own ids unchanged), `speed-ramp-add` (point at the playhead), `speed-ramp-remove-{i}`.
- Timeline: `speed-badge` on `timeline-clip` ("2×", "0.5× ◀", "Ramp", "Freeze"; `data-speed` attribute for tests), title text includes the speed. Context menu: "Speed…" (focuses `speed-value`), "Reverse", "Freeze frame" (ids from the existing `contextMenuItems.ts` pattern). Help topic "Speed, reverse and freeze" (`helpContent.ts`/`helpContentMore.ts`).
- Gestures: each commit is one apply; refusals (overlap, locked, kind) are toasts; a ripple toggle state is UI-only.

## 8. Migration v9 (repair only; new `migrateSpeed.ts`)

v8 → v9 adds nothing. When present: `speed` finite and clamped 0.25..4, `1` dropped; `reverse` only `true`; `speedKeys` repaired like scalar keys (`migrateKeys` normalisation with `tooClose`, sorted, finite, eases repaired, values clamped 0.25..4, at most 64, fewer than 2 ⇒ dropped); `preservePitch` only `false`; `freeze` only on video clips with finite `at ≥ 0` (else dropped; a freeze clip drops speed fields and is `audio.silent`); speed fields dropped from image/overlay/adjustment clips. **Duration-preserving repair:** when a repair changes the clip's timeline duration (a clamped speed, dropped keys), the footage end played last is moved so `D` is unchanged (solved with the map), so a repair can never create an overlap; if that is impossible (footage < 0) the speed fields are dropped and the clip keeps its stored `in/out`, and the repair is reported in the migration test table. Fades are fitted AFTER the speed repair, to the timeline duration (`migrate.ts:46-61`). Idempotent (property test); unknown fields kept; `{version: 10}` unsupported and never overwritten (persist test).

## 9. Tasks

Each task ends with: `npm test && npm run typecheck && npm run build`, `grep -rl __clipforge dist` empty, the specs it touches (one at a time), a report `docs/superpowers/ledgers/plan-5-task-reports/5d-task-N-report.md` naming each caught mutation, one review (P5-8), a commit (never push). The model (P5-8) is in each task title. Full `npm run e2e -- --trace off` at Tasks 1, 4, 6, 8, 12 and the part gate.

1. **Behaviour-preserving refactor (opus).**
   - Files: new `src/core/clipTime.ts`, `src/core/speedTypes.ts` (types only, no fields read yet); `model.ts` re-exports; every site of §4 calls the map at speed 1 (`drawCollect.ts:130`, `plan.ts:97-98`, `clipEdits.ts:44-85`, `drag.ts:45, 61-64`, `useClipDrag.ts:60`, `Waveform.tsx:37-40`, `motionGhost.ts:19`, `keyframes.ts:29-55`, `keyframeCommands.ts:33`, `keyDrag.ts:25, 49`, `KeyframeStrip.tsx`, `PresetParams.tsx`, `MotionBands.tsx`, `migrate.ts:60-61`, `audioQueries.ts:49`); splits `decode.ts` (→ `decode.ts` + `videoSource.ts`), `mixdown.ts` (→ + `mixdownSchedule.ts`), `edits.ts`.
   - TDD: `tests/clip-time.test.ts` "speed-1 map is bit-identical (10 000 random clips)", `tests/clip-time-readers.test.ts` (fails first on the current tree, passes after the routing).
   - Mutations: an off-by-sign in `sourceTimeAt`; dropping one routed site (the audit must name it).
   - E2E: FULL run, 587 green (the oracle).
   - Commit: "refactor: one clip time map (speed 1)".
2. **Speed maths (opus).**
   - Files: `clipTime.ts`, new `src/core/speedRamp.ts`.
   - TDD: `tests/speed-map.test.ts` (I1-I4, I9; reverse mid-frame rule), `tests/speed-ramp.test.ts` (grid anchoring, monotone bisection, edges exact, I8, cache identity by array, eases with overshoot clamped, hold ease).
   - Mutations: grid anchored on `in` (I5 split test must fail), missing edge literal (I3), unclamped overshoot (finite-duration test), bisection stopping early (1e-9 round trip). No e2e.
   - Commit.
3. **Data v9 and migration (opus).**
   - Files: `model.ts` (`CURRENT_VERSION = 9`), `speedTypes.ts` fields, `migrateSpeed.ts`, `migrate.ts` order, fixtures.
   - TDD: `tests/migrate-speed.test.ts` (repair table, duration-preserving repair, kind gating, idempotence, v8 opens unchanged byte-for-byte after one save cycle except `version`), `tests/persist.test.ts` gains `{version: 10}` unsupported/never overwritten.
   - Mutations: fades fitted before the speed repair; repair that lengthens a clip (overlap test).
   - E2E: new `tests/e2e/speed-migration.spec.ts` (a hand-made v9 save with speed/reverse/ramp reloads and draws).
   - Commit.
4. **Timeline edits (opus).**
   - Files: `speedEdits.ts`, `freezeEdits.ts`, `clipEdits.ts` (trim/split with speed, reverse swap, media limit), `audioQueries.ts`, `detachAudio.ts` (freeze refusal).
   - TDD: `tests/speed-edits.test.ts` (keeps start, frame-snapped D (D7), overlap refusal and ripple right-to-left, locked/kind refusals, same-reference no-ops, fades clamped not scaled, keys/presets untouched), `tests/speed-split-trim.test.ts` (I5-I7 property tests incl. reverse and ramps, MIN_CLIP in timeline time, `trimLimits` both edges), `tests/freeze.test.ts` (split + insert + ripple in one result, edge cases, resolved static values, silent), `tests/detach-speed.test.ts` (twin carries fields; attach refused after the twin's speed changes).
   - Mutations: ripple on all tracks; reverse halves not swapped; twin equality ignoring speed.
   - E2E: FULL run (timing rules touch drag/trim).
   - Commit.
5. **Keys, presets and the frame grid under speed (opus).**
   - Files: `keyframes.ts` (`localTime`, `keyVisible`, `keyFrame`, `keyIndexAtPlayhead` via the map), `keyframeEdits.ts` (`moveKeys` mapping), `keyframeCommands.ts`, `keyDrag.ts`, strip/row/bands positions.
   - TDD: `tests/keys-speed.test.ts` (at 2×, 0.5×, reverse and a ramp: the resolved value at every output frame equals the value of the speed-1 clip at the mapped footage frame; key under the playhead in reverse; `[`/`]` order in timeline direction; diamond x; key drag of Δ frames at 2× moves footage by 2Δ/fps), `tests/motion-speed.test.ts` (In/Out windows unchanged in timeline seconds; emphasis/loop follow footage, reversed in reverse).
   - Mutation: key visibility using footage instead of timeline offset (reverse test fails).
   - E2E: `keyframes-timeline.spec.ts`, `keyframes-offframe.spec.ts`, `presets-render.spec.ts` (unchanged pass) + new `speed-keys.spec.ts` (diamonds on a 2× clip, Next key in reverse).
   - Commit.
6. **Video render at speed and freeze (opus).**
   - Files: `drawCollect.ts`, `videoSource.ts` (stats counter), `clipTime.ts` `videoSourceTime`.
   - Fixture: `frame-index.mp4` (frame index N encoded in grey levels in steps of 8 so H.264 noise cannot alias: left half `8·(N mod 32)`, right half `8·floor(N/32)`, 30 fps, 4 s, `-g 30`).
   - TDD/E2E: `tests/e2e/speed-render.spec.ts` (frame n shows source frame round(s·n) at 0.5×/2×/4×, a freeze shows one frame for 2 s, export == preview ≤ 1/255 at 25 and 30 fps, ffprobe duration), decode-count guard.
   - Mutation: dropping the speed factor (2× test fails by > 30 grey levels).
   - E2E: FULL run (render pipeline).
   - Commit.
7. **Reverse video decode (opus).**
   - Files: `reverseCache.ts`, `videoSource.ts`.
   - Fixtures: `long-gop.mp4` (1080p, `-g 300`), `phone-gop.mp4` (`-g 60`).
   - TDD: `tests/reverse-cache.test.ts` (pure budget/pass planner: frames kept, passes per GOP, byte accounting), `tests/e2e/speed-reverse.spec.ts` (frame n of a reversed clip is source frame N−1−n on `frame-index.mp4`, first and last frames, split of a reversed clip drift 0.00/255, memory: cache bytes ≤ budget via the harness, time guard 5× forward on `long-gop.mp4`).
   - Mutations: no mid-frame offset (first frame wrong), keeping the FIRST frames of the pass instead of the last (time guard fails).
   - Commit.
8. **Audio planning, resampler and reverse audio (opus).**
   - Files: `plan.ts` (virtual-source segments), `mixerSchedule.ts`, `mixdownSchedule.ts`, `denoiseSource.ts` (`prepareSource` calls retime), new `src/audio/retime/{retime.ts,resample.ts,retimeMath.ts}`.
   - TDD: `tests/retime-resample.test.ts` (pure: 1 kHz at 2× becomes 2 kHz, no aliasing above Nyquist at 4× (−40 dB), reversal exact, block/window independence: 1 s windows == one window bit for bit), `tests/plan-speed.test.ts` (segments in virtual time, exact 0/D edges, margins converted, freeze silent, speed-1 segments byte-identical to today).
   - E2E: `tests/e2e/speed-audio.spec.ts` (export of a 2× clip with preservePitch off: tone doubles, duration halves; reversed sweep; live vs export prepared buffers equal), `audio-chain.spec.ts`, `export-audio.spec.ts`.
   - Fixture: `av-sync.mp4` (white flash + 1 kHz burst every 1.0 s footage). A/V tolerance per D11 at 0.5×, 2×, reverse.
   - Mutations: margins not converted (seam test), window-anchored grid (window-independence test).
   - E2E: FULL run (both engines).
   - Commit.
9. **Pitch-preserving time-stretch (opus).**
   - Files: `src/audio/retime/wsola.ts` (+ decimated search helper), `retime.ts` dispatch, `mixer.ts` first window 2 s.
   - TDD: `tests/wsola.test.ts` (block independence: rendering blocks in any order/subset gives identical samples; overlap-add gain 1 ± 1e-6 on a DC input; 440 Hz stays 440 ± 2 Hz at 0.25×-4×; output length; reverse), `tests/wsola-perf.test.ts` (≥ 10× real time stereo 48 kHz, best of 5).
   - E2E: `speed-audio.spec.ts` gains the sine-sweep metrics of §6 and A/V at 0.25× and 4× (WSOLA tolerance); `audio-pitch.spec.ts` (pitch effect on a 0.5× clip).
   - Mutations: no chain reset at block edges (block-independence test), search window on the absolute instead of the decimated grid (perf guard).
   - Commit.
10. **Ramps end to end (opus; cuttable, O5).**
   - Files: `speedEdits.ts` (`setRamp`, presets in `speedPresets.ts`), audio/video already map-driven.
   - TDD: `tests/speed-ramp-edits.test.ts` (presets produce valid keys, D frame-snapped, overlap/ripple, split partitions `speedKeys`), E2E `tests/e2e/speed-ramp.spec.ts` (frame-index fixture under "Bullet": video source time matches the map at 12 frames; A/V markers within tolerance across the slow part; export == preview).
   - Commit.
11. **UI (sonnet).**
   - Files: `SpeedFields.tsx`, `SpeedRamp.tsx`, `speedCommands.ts`, `ClipView.tsx` badge, `contextMenuItems.ts`, help content, `speed.css`; drag ghosts use `clipDuration`.
   - Specs `tests/e2e/speed-ui.spec.ts` (each gesture = one undo step, overlap toast and ripple toggle, locked track refusal, Duration field, Reverse/Preserve pitch toggles, freeze from the context menu, badge text, keyboard path through the fields), `speed-ramp-ui.spec.ts` (preset, point value, ease opens the shared ease UI, graph dots).
   - Commit(s) per section.
12. **Robustness, perf, journey, docs (sonnet; opus final review).**
   - Guards: decode counts at 4×, reverse cache bytes, WSOLA throughput, resolver cost unchanged for speed-1 projects (5A/5B perf guards stay green), 60 s drift guard, autosave size per ramp key.
   - Journey `tests/e2e/speed-journey.spec.ts`: import → 2× → reverse → ramp preset → split inside the ramp (drift 0.00/255 at whole-frame cuts) → freeze frame → keyframe a scale on the reversed half → detach audio + attach back → undo the whole chain → reload → 1080p export (ffprobe duration; A/V markers).
   - Docs: `plan-5d-manual-qa-checklist.md` (audible checks on a real Mac: stretch quality on speech/music, reverse playback smoothness, long-GOP phone clips, QuickTime), README speed section and limits, `PROJECT_HANDOFF.md`, `CLAUDE.md` (v9), ledger. Final whole-part review (fresh opus, one themed fix wave).

**Part gate (before any deploy request):** all tasks reviewed clean, final review 0 Important, `npm test && npm run typecheck && npm run build`, dist hook grep empty, a FRESH full `npm run e2e -- --trace off` green (known flakes re-run alone: `audio-chain.spec.ts:94`, `audio-denoise.spec.ts:40/:57`, `import.spec.ts:141`, the loops-UI flake), `npm run e2e:preview` green, production tip an ancestor of HEAD. Then STOP and ask the user for the push/deploy go-ahead.

## 10. Risks

1. **A/V drift at window seams and over long clips.** Mitigation: one map for both media; window-independent DSP (grid at the clip start, block-anchored WSOLA); the 1 s-vs-∞ window equality test; the 60 s drift guard (≤ 2 ms); A/V markers at 0.25×, 2×, 4×, reverse, ramp.
2. **Reverse decode cost with long-GOP phone footage.** Mitigation: bounded byte budget with multi-pass re-decode, ImageBitmap conversion, time guards (5× forward on a 10 s GOP), decode counters; preview may drop frames (documented). Unknowns: real Mac hardware decoders (frame-pool stalls), HEVC phone files (decode support varies), `getKeyPacket` on fragmented files: manual QA items.
3. **Time-stretch artefacts.** Mitigation: sine-sweep and 440 Hz metrics with numeric gates; preservePitch can be switched off per clip (resampler, artefact-free but pitched); transient smearing and block-reset flutter documented; the 1.0 s block length and ±10 ms tolerance are constants that the measurements may tune (Ruling if changed).
4. **Detach/attach equality including speed.** Mitigation: twin carries the fields (spread, tested), `isUneditedTwin` and the twin match compare all four fields; Attach back is refused (not silently lossy) when they differ; freeze clips refuse detach.
5. **Keys on footage frames.** Mitigation: `localTime` through the map keeps every key on its footage frame (5A D3); visibility/frames/diamonds from the timeline offset; property tests at 2×, 0.5×, reverse, ramp; the user-visible consequence (animation speeds up and reverses with the clip) is O3.
6. **CPU on the main thread** (WSOLA after noise reduction, 4× decode). Mitigation: sliced work that yields, the 2 s first live window, throughput guard; a Worker is the documented next step.
7. **Wide refactor (Task 1).** Mitigation: speed-1 identity, the source-scan audit, full e2e as oracle before any behaviour change.
8. **Numerical edge cases** (tiny clips at 4×, ramps with hold eases, durations near MIN_CLIP). Mitigation: MIN_CLIP in timeline time, clamped speeds, exact edges, frame-snapped durations.

## 11. Self-review

Spec coverage (design line 25 speed/reverse; roadmap §2 speed editor; Plan 5 §5 5D outline): constant speed ✓ T2/T4/T6/T8; reverse ✓ T2/T7/T8; ramps ✓ T2/T10 (cuttable); freeze frame ✓ D8/T4/T6; pitch-preserving audio in live and export ✓ D9/D10/T8/T9; reverse audio ✓ T8; UI ✓ T11; migration ✓ §8/T3; the 12 outline tasks map 1:1 (outline 5 and 6 = Tasks 6/7; 7-9 = Tasks 8-10). Static/speed-1 projects stay bit-identical (D1, Task 1 oracle). Honest unknowns: Mediabunny key-packet lookup on every container, decoder behaviour with held frames on real hardware, WSOLA throughput on slow machines, VFR phone footage under the reverse mid-frame rule, Safari (untested). Effort estimate: about 12 tasks, roughly 1.7× Part 5A (12 tasks) in review load because Tasks 7-9 are new territory; about 45-60 subagent runs (implementer + reviewer + fix rounds), five full e2e runs (~40 min each with the new specs), i.e. 4-6 working sessions, of which Tasks 7-9 are about half. Cost if D9 is wrong (virtual source): a second scheduling path in both engines, about two tasks, no data change.

## 12. Decisions I need from you

| # | Question | Recommendation | Cost if wrong |
|---|---|---|---|
| O1 | Speed range | 0.25×-4× (constant and ramp points) | Widening later is a constant + migration clamp; >4× multiplies decode cost |
| O2 | Speed change that would overlap the next clip | Refuse with a toast; a "Push later clips" toggle ripples the same track | Always rippling can silently desync other tracks |
| O3 | Keys, emphasis and loops under speed/reverse | Footage-anchored (they speed up and reverse with the picture, as 5A D3 implies); In/Out presets keep timeline seconds | Switching emphasis/loop to timeline timing is one function in `motion.ts`; keys would need a key-time migration |
| O4 | Ramp time base | Ramp points on footage time (stable under trims and splits) | Timeline-based ramps make every trim redistribute the curve |
| O5 | Ship ramps in 5D | Yes, as Task 10 (cuttable) with presets + numeric points + read-only graph; draggable graph later | Cutting = drop Tasks 10 and the ramp UI; v9 stays valid |
| O6 | Freeze frame model | A video clip with `freeze: {at}` (no new media, keeps crop/effects) | Baking a PNG media instead is simpler to render but adds OPFS files and GC references |
| O7 | Snap durations to whole frames after a speed edit | Yes (moves the last-played footage edge by < 1 frame) | Without it, ripple creates off-grid starts (P5-5 phase) |
| O8 | Pitch preservation default and algorithm | On by default; block-anchored WSOLA (window-independent) | A phase vocoder is smoother on music but chains state across windows; ~1 task |
| O9 | Reverse audio | Reversed sound (with the picture) | Muting instead is one flag |
| O10 | Detached audio and speed | Not linked: the twin keeps its own speed; selecting both changes both; Attach back requires equal speed | Auto-follow needs clip linking (out of scope) |
| O11 | Speed on images/overlays/adjustment | Refused (use trim for duration) | Allowing it on images is harmless but meaningless |
| O12 | First live window for retimed clips | 2 s (Play starts quickly; seams exact anyway) | 20 s first window = up to ~2 s wait on Play |
| O13 | Fades with speed | Stay in timeline seconds, clamped when the clip shortens | Scaling them with speed is one line in `setSpeed` |
| O14 | Default freeze hold | 2 s, editable | Trivial |
| O15 | Migration repair that would change a clip's duration | Duration-preserving (move the last-played footage edge) | Changing duration can create overlaps in saved projects |

Approve as recommended, or tell me which to change; then I record P5D-1..n in the ledger, create `feature/plan-5d-speed` and start Task 1.
