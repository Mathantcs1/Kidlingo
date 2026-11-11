# ClipForge Plan 3: Audio Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user detach, see (waveforms), record, fade, pan, level, process (EQ, compressor, reverb, echo, pitch, filters, voice presets, basic noise reduction) and auto-duck audio, with preview and export sounding identical.

**Architecture:** Project data moves to v3 (per-clip `audio` settings, per-track `volume` and `duck`). ONE shared "clip chain" builder (`src/audio/chain.ts`) turns a clip's settings into a Web Audio node graph; both the live mixer and the offline mixdown call it, so preview and export cannot drift. Everything numeric (fade curves, ducking envelope, peaks, denoise, WAV writing, reverb impulse) is a pure function with Vitest tests; engine and UI behaviour gets Playwright specs that measure real audio (ffprobe/ffmpeg `astats`, OfflineAudioContext RMS).

**Tech Stack:** Web Audio (GainNode, StereoPannerNode, BiquadFilterNode, DynamicsCompressorNode, ConvolverNode, DelayNode), Mediabunny `AudioSampleSink` (already used), idb-keyval (peaks cache), `getUserMedia` + AudioWorklet-free PCM capture, Vitest, Playwright. No new runtime dependency (see Decision D3).

**Spec:** `docs/superpowers/specs/2026-11-10-clipforge-design.md` (lines 28-29 audio editing and effects; line 64 `audio/mixer`; line 82 audio tests). Roadmap: `docs/superpowers/plans/2026-11-10-clipforge-plan-2-layers.md` (Plan 3). State, rulings and pitfalls: `PROJECT_HANDOFF.md`, `CLAUDE.md`.

## Global Constraints

- TypeScript strict; 2 spaces, single quotes, semicolons; files ≲200 lines (split before extending `mixer.ts` 225, `exporter.ts` 345, `styles.css` 1211; put new CSS in a new `src/ui/audio.css` imported by the new components).
- `src/core/` stays pure/no DOM. Edits are `(Project, …) => Project`, throw `TimelineError` for refusals, never mutate input, return the SAME reference for no-ops. Locked tracks refuse every clip edit (only `setTrackFlags`, `renameTrack`, `moveTrack`, `reframeProject` act on locked tracks; Plan 3 adds `setTrackVolume`/`setTrackDuck` as track-level settings that ARE allowed on locked tracks, like flags).
- One gesture = exactly one `apply` (drags/slider drags keep local state until release).
- Project data version becomes **3**; unknown newer ⇒ `unsupported`, never overwritten; v1 and v2 saves open unchanged.
- Mute wins over solo; hidden affects picture only; a clip with volume 0 or `audio.silent` is never decoded.
- Keep every existing `data-testid`; add new ones for new controls. `window.__clipforge` stays DEV-only (grep `dist/`).
- Export audio is always AAC; live and offline must use the SAME chain (Ruling 12 + this plan's D1).
- TDD: failing test first; mutation-check important guards. Commit trailers (blank line before): `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: <current session URL>`.
- Never push or deploy without the user's explicit go-ahead. Never run `playwright install`. Do not claim Safari/Mac behaviour beyond what is tested.
- Gate before each task is called done: `npm test && npm run typecheck && npm run build` plus the e2e specs the task touched; full `npm run e2e` (~5 min) at Tasks 7, 9 and 10.

## Decisions to approve (rulings proposed; change any before execution)

- **D1 One chain.** `buildClipChain(ctx, spec): ClipChain` is the only place gain/fade/pan/effects are wired. Live mixer and mixdown pass an `AudioContext` / `OfflineAudioContext`. Cost if wrong: none user-visible; it is the guard against preview≠export.
- **D2 Detach = copy + silence, not link.** `detachAudio` adds an audio clip (same `mediaId`, same `start/in/out`, volume and audio settings copied) on an audio track and sets the video clip's `audio.silent = true` (its own `volume` is kept, so "attach back" = clear `silent` and delete the audio clip). No clip linking/groups: moving the video later does not move the detached audio (explicit non-goal; noted in README). Cost if wrong: users expect linked moves; adding links later is a v4 field.
- **D3 Pitch shift without a dependency or AudioWorklet:** the classic two-tap modulated-delay ("Jungle") shifter built from `DelayNode`s, range ±12 semitones, window 100 ms. Works identically in live and offline contexts. Quality is "voice preset", not studio. Cost if wrong: swap the builder behind the registry entry; data model unchanged.
- **D4 Noise reduction = offline spectral gate** (`denoiseBuffer`, pure TS STFT, noise floor estimated from the quietest 10 % of frames of the decoded segment, strength 0..1), applied to each decoded segment before the node graph. "Basic" per the roadmap; it is not a learned denoiser.
- **D5 Ducking uses clip coverage, not speech detection.** A track may duck under the audible clips of one chosen source track (e.g. music under voice-over). Gain envelope from clip intervals with attack/release; silence INSIDE a trigger clip still ducks. Cost if wrong: music dips during pauses in a voice clip; detection can later use the peaks cache.
- **D6 Per-clip effects only.** The spec says "per clip or per track"; a per-track effect chain needs bus-level processing across window seams (reverb tails, compressor state) and is deferred to a later plan. Track-level controls in Plan 3: volume and ducking.
- **D7 Window seams.** Clips with stateful effects decode extra pre-roll before and post-roll after the segment (`chainMargins(effects)`), run the chain over the margin, and silence the margin with a gain envelope, so a render cut into 1 s or 30 s windows is audibly identical (tested by RMS difference).
- **D8 Voice-over capture** records mono 16-bit PCM from `getUserMedia` into memory chunks (capped at 30 min, visible timer) and writes a WAV that goes through the normal import path; no MediaRecorder/Opus (decode support in Mediabunny/headless is not guaranteed; WAV is). `Permissions-Policy` becomes `camera=(), microphone=(self), geolocation=()`.
- **D9 Not in Plan 3:** crossfades between adjacent clips (clips on a track cannot overlap; fade out + fade in cover the need), speed/pitch-preserving speed change (Plan 5), per-track effects (D6), clip linking (D2), audio-only export formats.
- **D10 No live parameter scrubbing during playback:** any history change pauses playback (Ruling 10), so effect changes are heard on the next Play. Slider drags commit once on release.

## Review Focus

1. **Seams:** a clip with each effect, fade or ducking spanning a 20 s live / 30 s export window cut must not click or change level. Test: render with `windowSeconds: Infinity` vs `1`, RMS difference < 1e-3 (Task 6, 7, 9).
2. **Detach twice-sounding:** exported audio after Detach equals the original (not doubled, not silent); undo restores the video clip's sound (Task 2, 4).
3. **Mic failures:** permission denied, no input device, tab hidden mid-recording, 30-min cap, recording while the project has a locked/missing audio track. Each must toast a plain-English reason and leave the project untouched (Task 10).
4. **Odd media:** detach on a video without audio is refused; mono and 5.1 sources pan/play without error; fade longer than the clip clamps; a clip shorter than the effect pre-roll; zero-length/silent audio gives flat waveform and no NaN in peaks/normalise (Tasks 2, 3, 5, 6).
5. **Data safety:** v2 → v3 migration of a project with clips on every track kind; a v3 save opened by this build; a `{version: 4}` save stays protected; deleting media removes its peaks cache; large (1 h) audio peaks stay bounded in memory (Tasks 1, 5).

## File Structure

| File | Responsibility |
|---|---|
| `src/core/model.ts` (modify) | `Project.version: 3`, `ClipAudio`, `AudioEffect`, `Track.volume`, `Track.duck`, `defaultClipAudio()`, `newTrack` defaults |
| `src/core/migrate.ts` (modify) | v1→v2→v3 chain, `CURRENT = 3` |
| `src/core/audioEdits.ts` (create) | `setClipAudio`, `setTrackVolume`, `setTrackDuck`, `detachAudio`, effect list edits |
| `src/core/timeline.ts`, `merge.ts` (modify) | split/trim/join keep fades and effects consistent |
| `src/audio/fade.ts` (create) | pure fade/envelope math |
| `src/audio/chain.ts` (create) | `buildClipChain`, the single graph builder |
| `src/audio/effects/registry.ts`, `effects/*.ts` (create) | effect definitions: params schema + node builder + margins |
| `src/audio/presets.ts` (create) | voice presets as effect lists |
| `src/audio/denoise.ts` (create) | `denoiseBuffer` (pure) |
| `src/audio/duck.ts` (create) | `duckEnvelope` (pure) |
| `src/audio/plan.ts` (modify) | `Segment` carries clip/track settings; skip `silent` |
| `src/audio/mixer.ts`, `mixdown.ts` (modify) | call `buildClipChain`; mixer split into `mixerSession.ts` if it grows |
| `src/media/peaks.ts`, `peaksStore.ts` (create) | peaks computation (pure core + streaming decode) and IndexedDB cache |
| `src/media/recorder.ts`, `wav.ts` (create) | PCM capture, WAV encoder (pure) |
| `src/ui/AudioInspector.tsx`, `EffectList.tsx`, `Waveform.tsx`, `RecordButton.tsx`, `audio.css` (create) | UI |
| `src/ui/audioCommands.ts` (create) | store-bound commands using `guard(() => apply(...))` |
| `vercel.json` (modify) | microphone permission |

---

### Task 1: Data model v3 and migration

**Files:** Modify `src/core/model.ts`, `src/core/migrate.ts`, every `version: 2` literal (grep `version`), `src/state/persist.ts` if it hard-codes 2; Test `tests/migrate.test.ts`, `tests/model.test.ts`, `tests/e2e/layers-migration.spec.ts` (extend or add `audio-migration.spec.ts`).

**Interfaces:**
- Produces:
  - `interface ClipAudio { fadeIn: number; fadeOut: number; pan: number; silent: boolean; effects: AudioEffect[] }` (seconds; pan −1..1)
  - `interface AudioEffect { id: Id; type: AudioEffectType; enabled: boolean; params: Record<string, number> }`; `type AudioEffectType = 'eq' | 'highpass' | 'lowpass' | 'compressor' | 'reverb' | 'echo' | 'pitch' | 'denoise' | 'gain'` (`gain` = the Normalise result, param `gainDb`)
  - `interface TrackDuck { sourceTrackId: Id; amountDb: number; attack: number; release: number }` (amountDb ≤ 0)
  - `Clip.audio: ClipAudio`; `Track.volume: number` (0..2, default 1); `Track.duck: TrackDuck | null`; `Project.version: 3`
  - `defaultClipAudio(): ClipAudio`; `clipFromMedia` (src/media/clip.ts) and every clip constructor set `audio: defaultClipAudio()`.

- [ ] **Step 1: Failing tests** (`tests/migrate.test.ts`): a v2 project with video + audio clips migrates to `version: 3` with `audio` equal to `defaultClipAudio()` on EVERY clip of every track and `volume: 1, duck: null` on every track; input object is not mutated; migrating a v3 project is idempotent (deep-equal, and `toBe`-distinct inputs not required); `{version: 4}` ⇒ `{ok:false, reason:'newer'}`; a v1 project reaches v3 in one call; malformed clip `audio` (e.g. `fadeIn: 'x'`, `pan: 9`) in a v3 save ⇒ repaired to clamped defaults per field, not rejected.
- [ ] **Step 2: Run** `npx vitest run tests/migrate.test.ts tests/model.test.ts` ⇒ FAIL (version 2).
- [ ] **Step 3: Implement** the model types and a `toClip`/`toTrack` in `migrate.ts` that fill/repair the new fields (`CURRENT = 3`). Keep `raw` unmutated and unknown extra fields passed through.
- [ ] **Step 4:** Update all `version: 2` literals and fixtures; `npm test && npm run typecheck` green.
- [ ] **Step 5:** e2e: extend the migration spec so a seeded v2 IndexedDB project opens with all clips, then reload shows it re-saved as v3, and a seeded `{version:4}` shows "saved by a newer version" and is not overwritten. Run `npx playwright test tests/e2e/layers-migration.spec.ts`.
- [ ] **Step 6: Commit** `feat: project data v3 (clip audio settings, track volume and duck)`.

### Task 2: Audio edits in core (pure)

**Files:** Create `src/core/audioEdits.ts`, `tests/audio-edits.test.ts`; modify `src/core/timeline.ts` (`splitClip`, `trimClip`), `src/core/merge.ts` (`joinClips`), `src/core/tracks.ts` (placement helper reuse).

**Interfaces:**
- Consumes: `updateClip`-style lock guard used by `src/ui/edits.ts` (move or re-export so core can use it; do NOT import `src/ui` from core: relocate the helper to `src/core/timeline.ts` and re-export from `edits.ts`).
- Produces:
  - `setClipAudio(p: Project, clipId: Id, patch: Partial<Pick<ClipAudio, 'fadeIn' | 'fadeOut' | 'pan'>>): Project` clamps: `pan` to [−1,1]; each fade to ≥0 and `fadeIn + fadeOut ≤ clip duration` (shrink the one NOT being edited last); non-finite ⇒ `TimelineError('Invalid audio setting')`; no-op ⇒ same reference.
  - `setTrackVolume(p, trackId, volume: number): Project` clamp 0..2, allowed on locked tracks.
  - `setTrackDuck(p, trackId, duck: TrackDuck | null): Project` refuses `sourceTrackId` equal to the track, unknown, or a track that itself ducks under this one (no cycles); `amountDb` clamped −40..0, `attack`/`release` 0.01..2 s.
  - `detachAudio(p, clipId: Id): Project` — throws `TimelineError` for audio/image clips, media without audio, `audio.silent` already true, locked source track, or no audio track available when 8 exist and all overlap; otherwise places the copy on the first unlocked audio track with free room for `[start, end)` else adds a track (max 8); sets video clip `audio.silent = true`. One undoable result.
  - `attachAudio(p, videoClipId, audioClipId): Project` clears `silent` and deletes the audio clip (used by Undo-free "Attach back" button).
  - `addEffect(p, clipId, type: AudioEffectType): Project`, `updateEffect(p, clipId, effectId, patch: {enabled?: boolean; params?: Record<string, number>}): Project`, `removeEffect`, `moveEffect(p, clipId, effectId, toIndex)`; params are clamped by the registry (Task 6 supplies `clampParams`; until then a `registryStub` returning params unchanged, replaced in Task 6).
- Also: `splitClip` — left half keeps `fadeIn` and gets `fadeOut: 0`, right half the reverse; effects copied with NEW ids to both; `trimClip` re-clamps fades; `joinClips` keeps the first clip's audio settings (documented).

- [ ] **Step 1: Failing tests** with the exact values: fade clamp (`fadeIn 3` on a 2 s clip ⇒ 2; then `fadeOut 1` ⇒ fadeIn shrinks to 1); pan clamp; same-reference no-ops; detach of a video clip with audio on a project with one audio track ⇒ audio clip at same `start/in/out`, video `silent: true`, volume copied; detach when the only audio track is locked ⇒ new track created (locked tracks are skipped, not refused); detach video without audio ⇒ throws; detach twice ⇒ throws; locked source track ⇒ throws `Track is locked`; duck cycle refused; split fades; effect ids unique after split; input never mutated.
- [ ] **Step 2: Run** `npx vitest run tests/audio-edits.test.ts` ⇒ FAIL.
- [ ] **Step 3: Implement** as specified (small pure functions; reuse `addTrack`, the overlap check used by `appendMedia`/`moveClip`).
- [ ] **Step 4: Run** `npm test && npm run typecheck` ⇒ PASS. Mutation-check: remove the `silent` set ⇒ detach test fails.
- [ ] **Step 5: Commit** `feat: pure audio edits (fades, pan, track volume, duck, detach, effect list)`.

### Task 3: Shared clip chain, fades, pan, track volume

**Files:** Create `src/audio/fade.ts`, `src/audio/chain.ts`, `tests/audio-fade.test.ts`, `tests/e2e/audio-chain.spec.ts`; modify `src/audio/plan.ts`, `mixer.ts`, `mixdown.ts`, `tests/audio-plan.test.ts`.

**Interfaces:**
- Produces:
  - `fadeGain(clip: Clip, t: number): number` — linear 0→1 over `[start, start+fadeIn]`, 1→0 over `[end−fadeOut, end]`, product of both, 1 elsewhere; `t` is timeline time.
  - `fadePoints(clip: Clip, from: number, to: number): { t: number; gain: number }[]` — breakpoints inside `[from, to)` for `setValueAtTime`/`linearRampToValueAtTime` scheduling (always includes the endpoints so windows join seamlessly).
  - `interface ChainSpec { clip: Clip; trackVolume: number; duckPoints?: { t: number; gain: number }[]; seg: Segment; ctxStart: number /* ctx time of timeline time 0 of this render */; ctx: BaseAudioContext }`
  - `buildClipChain(spec: ChainSpec): { input: AudioNode; output: AudioNode; dispose(): void }` — graph: input → effects (Task 6) → clip gain (`clip.volume` × fade automation) → `StereoPannerNode(pan)` → track gain (`trackVolume`) → duck gain (automation) → output. `Segment` gains `clip: Clip; trackVolume: number` fields (replaces the bare `volume`).
  - `audibleClips` additionally skips `clip.audio.silent`.
- Consumes: Task 1 model.

- [ ] **Step 1: Failing unit tests** (`audio-fade.test.ts`): `fadeGain` at start/middle/end for `fadeIn 1, fadeOut 1` on a 4 s clip at `start 2` (values 0, 0.5, 1, 1, 0.5, 0 at t = 2, 2.5, 3, 5, 5.5, 6); `fadePoints` for a window that cuts the fade in half returns the correct mid breakpoint (gain 0.5 at the cut) and equal gain on both sides of a boundary; fade longer than clip never exceeds 1 and never negative; `audibleClips` omits `silent` clips and clips on a track with volume 0.
- [ ] **Step 2: Run** `npx vitest run tests/audio-fade.test.ts tests/audio-plan.test.ts` ⇒ FAIL.
- [ ] **Step 3: Implement** `fade.ts` and `chain.ts`; change `mixer.ts` `schedule` and `mixdown.ts` `schedule` to build their node graphs through `buildClipChain` (delete their inline `createGain` code). Keep `mixer.ts` under 230 lines by moving session types to `mixerTypes.ts`.
- [ ] **Step 4:** Playwright `audio-chain.spec.ts` (use the harness like existing audio specs): export/mixdown a 1 kHz fixture tone with `fadeIn 1`: RMS of first 0.2 s < 0.25 × RMS of 2–3 s; `pan −1`: right channel RMS < 1 % of left; track volume 0.5 halves amplitude (±2 %); `silent` clip contributes nothing; live mixer scheduling (via `onSchedule`) still tiles sample-exactly (existing tests stay green).
- [ ] **Step 5:** `npm test && npm run typecheck && npm run build && npx playwright test tests/e2e/audio-chain.spec.ts` ⇒ PASS; existing audio specs (`grep -l mixer tests/e2e`) still pass.
- [ ] **Step 6: Commit** `feat: shared clip chain with fades, pan and track volume`.

### Task 4: Inspector audio controls, track volume, detach (UI)

**Files:** Create `src/ui/AudioInspector.tsx`, `src/ui/audioCommands.ts`, `src/ui/audio.css`; modify `src/ui/Inspector.tsx`, `src/ui/TrackHeader.tsx`, `src/ui/Toolbar.tsx` (Detach button), `tests/e2e/audio-ui.spec.ts`; Test `tests/audio-commands.test.ts`.

**Interfaces:**
- Consumes: Task 2 edits, `NumberField` (existing).
- Produces: `audioCommands.ts` exports `detachSelectedAudio()`, `setSelectedClipAudio(patch)`, `setTrackVolumeCmd(trackId, v)`, each `guard(() => apply(...))`.
- Test ids: `audio-fade-in`, `audio-fade-out`, `audio-pan`, `audio-detach`, `track-volume-<trackId>`.

- [ ] **Step 1: Failing e2e** (`audio-ui.spec.ts`): select a video clip with audio ⇒ "Detach audio" enabled ⇒ click ⇒ an audio clip appears on an audio track, the video clip shows a "audio detached" badge, ONE Cmd+Z restores both; Detach disabled for an image and for a video without audio; fields Fade in/out (seconds) and Pan commit on Enter/blur as one undo step; a track-header volume slider commits once on release; a locked clip's fields are disabled but the track volume still works.
- [ ] **Step 2:** Run the spec ⇒ FAIL.
- [ ] **Step 3:** Implement components (≤200 lines each) following the existing TransformFields/NumberField patterns (draft state, Enter/Escape, `aria` spinbutton roles).
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build && npx playwright test tests/e2e/audio-ui.spec.ts tests/e2e/inspector.spec.ts` ⇒ PASS.
- [ ] **Step 5: Commit** `feat(ui): fade, pan, track volume and detach audio`.

### Task 5: Waveforms

**Files:** Create `src/media/peaks.ts`, `src/media/peaksStore.ts`, `src/ui/Waveform.tsx`, `tests/peaks.test.ts`, `tests/e2e/waveform.spec.ts`; modify `src/ui/ClipView.tsx`, `src/media/gc.ts` / media removal path (delete peaks with media), `src/media/import.ts` (kick off background peaks).

**Interfaces:**
- Produces:
  - `PEAKS_PER_SECOND = 100`; `interface Peaks { rate: number; duration: number; data: Uint8Array /* min,max pairs, 0..255 mapped from -1..1 */ }`
  - `accumulatePeaks(acc: PeakAccumulator, samples: Float32Array, sampleRate: number): void` and `finishPeaks(acc): Peaks` (pure, streaming so memory is bounded by one decoded sample chunk, not the file).
  - `getPeaks(mediaId: Id): Promise<Peaks | null>` (cache hit from IndexedDB key `clipforge:peaks:<id>`, else compute by streaming `AudioSampleSink`, store, return); `deletePeaks(mediaId)`.
  - `peakAt(peaks: Peaks, from: number, to: number): { min: number; max: number }` for range stats (also used by Normalise, Task 6).
  - `<Waveform clip mediaId width height />` canvas drawing the clip's `[in, out)` slice; redraws on zoom; shows a flat line (no NaN) for silent audio and nothing while loading.

- [ ] **Step 1: Failing unit tests:** a 1 s full-scale sine at 48 kHz yields ≥ 99 buckets with |max| ≈ 1 (±1/255) and |min| ≈ −1; silence ⇒ all 128 (zero) with no NaN; chunk-boundary split (feed in 3 uneven chunks) equals one-shot; `peakAt` on a sub-range; empty input ⇒ `duration 0`, empty data.
- [ ] **Step 2:** `npx vitest run tests/peaks.test.ts` ⇒ FAIL. **Step 3:** implement pure core then the decode/cache layer.
- [ ] **Step 4: e2e** `waveform.spec.ts`: import a fixture with a loud half and a silent half; the clip's canvas has dark/loud pixels in the first half and a flat line in the second (pixel check); removing the media deletes the IndexedDB peaks key; reload reuses the cache (no second decode: spy via the dev hook counter in `src/audio/stats.ts`).
- [ ] **Step 5:** gate (`npm test && npm run typecheck && npm run build`, the spec). **Step 6: Commit** `feat: waveforms with cached peaks`.

### Task 6: Effect registry, native effects, presets, normalise (chain integration)

**Files:** Create `src/audio/effects/registry.ts`, `eq.ts`, `filters.ts`, `compressor.ts`, `reverb.ts`, `echo.ts`, `gain.ts`, `src/audio/presets.ts`, `src/ui/EffectList.tsx`, `tests/audio-effects.test.ts`, `tests/e2e/audio-effects.spec.ts`; modify `src/audio/chain.ts`, `src/audio/mixer.ts`, `src/audio/mixdown.ts` (margins), `src/core/audioEdits.ts` (use real `clampParams`), `src/ui/AudioInspector.tsx`.

**Interfaces:**
- Produces:
  - `interface EffectDef { type: AudioEffectType; label: string; params: ParamDef[]; margins(params): { pre: number; post: number }; build(ctx: BaseAudioContext, params: Record<string, number>): { input: AudioNode; output: AudioNode } }` and `interface ParamDef { key: string; label: string; min: number; max: number; step: number; def: number; unit?: string }`
  - `EFFECTS: Record<AudioEffectType, EffectDef>`; `defaultParams(type): Record<string, number>`; `clampParams(type, params): Record<string, number>` (clamps, fills missing, drops unknown keys, non-finite ⇒ default).
  - `chainMargins(effects: AudioEffect[]): { pre: number; post: number }` (sum over enabled effects; reverb `post = decay`, echo `post = delay × ~feedback tail`, filters/compressor/EQ `pre = 0.5`).
  - `reverbImpulse(sampleRate: number, seconds: number, seed = 1): Float32Array` deterministic exponential-decay noise (seeded PRNG) so live and offline match.
  - Native effects: `eq` (lowshelf 200 Hz, peaking 1 kHz Q 1, highshelf 4 kHz; params `low`,`mid`,`high` dB −12..12), `highpass` (`freq` 20..1000), `lowpass` (`freq` 1000..20000), `compressor` (threshold, ratio, attack, release, `makeup` dB), `reverb` (`seconds` 0.2..5, `mix` 0..1), `echo` (`delay` 0.05..1, `feedback` 0..0.9, `mix` 0..1), `gain` (`gainDb` −24..24, used by Normalise).
  - `PRESETS: Record<'podcast'|'radio'|'telephone'|'deep'|'chipmunk', Omit<AudioEffect,'id'>[]>` (pitch ones are defined in Task 7; this task ships podcast, radio, telephone) and `applyPreset(p, clipId, key): Project` (replaces the clip's effect list, one apply).
  - `normaliseGainDb(peaks: Peaks, clip: Clip, targetDb = -1): number` pure (uses `peakAt`; silent ⇒ 0).
  - `chain.ts` decodes with `chainMargins` extra source range; the margin part is multiplied by a gain that is 0 outside `[srcFrom, srcTo)` (D7).

- [ ] **Step 1: Failing unit tests** (`audio-effects.test.ts`): `clampParams` for every type (out-of-range, NaN, unknown key, missing key); `chainMargins` sums and ignores disabled effects; `reverbImpulse` deterministic (same seed ⇒ equal arrays) and decays (last 10 % energy < first 10 %); `normaliseGainDb` for peak 0.5 with target −1 dBFS ⇒ 20·log10(0.8913/0.5) ≈ +5.02 dB (assert 5.02 ±0.05), silence ⇒ 0; preset lists are valid under `clampParams`.
- [ ] **Step 2:** `npx vitest run tests/audio-effects.test.ts` ⇒ FAIL. **Step 3:** implement registry and effects.
- [ ] **Step 4: e2e signal tests** (`audio-effects.spec.ts`, offline render of fixture noise/tones via the harness; per effect assert the measurable change): lowpass 500 Hz cuts 4 kHz tone energy by > 20 dB and keeps 100 Hz within 1 dB; highpass mirror; EQ high +12 dB raises 8 kHz tone ≈ 12 dB (±1.5); compressor lowers a loud burst's peak relative to a quiet one (ratio of peaks drops); echo puts energy `delay` s after a click; reverb extends energy after a click beyond 0.3 s; `gain +6 dB` doubles amplitude (±3 %). **Seam test** (Review Focus 1): every effect, `windowSeconds: Infinity` vs `1` render of a 5 s tone burst ⇒ RMS of the sample-wise difference < 1e-3.
- [ ] **Step 5: UI:** `EffectList` (add dropdown, enable toggle, param sliders committing on release, remove, move up/down, preset menu, "Normalise" button) with test ids `effect-add`, `effect-<id>-toggle`, `effect-<id>-<param>`, `audio-preset`, `audio-normalise`; Playwright: add EQ, change a param, one undo step each; enabling/disabling changes the exported audio.
- [ ] **Step 6:** gate + `npx playwright test tests/e2e/audio-effects.spec.ts tests/e2e/audio-ui.spec.ts`. **Step 7: Commit** `feat: audio effect chain (EQ, filters, compressor, reverb, echo, normalise, presets)`.

### Task 7: Pitch shift and noise reduction

**Files:** Create `src/audio/effects/pitch.ts`, `src/audio/denoise.ts`, `tests/denoise.test.ts`, `tests/e2e/audio-pitch.spec.ts`; modify `registry.ts`, `presets.ts`, `chain.ts` (apply `denoiseBuffer` to the decoded segment before the graph).

**Interfaces:**
- Produces: effect `pitch` (`semitones` −12..12, builder per D3, `margins {pre: 0.2, post: 0.2}`); effect `denoise` (`strength` 0..1; `chain` calls `denoiseBuffer` when enabled, margin `pre: 0.2, post: 0.2`); `denoiseBuffer(buffer: AudioBuffer, strength: number): AudioBuffer` and a pure core `denoiseChannel(data: Float32Array, sampleRate: number, strength: number): Float32Array` (STFT 1024/hop 256, Hann, noise floor from the 10 % quietest frames, spectral subtraction with floor 0.1, overlap-add; output length = input length); presets `deep` (pitch −4), `chipmunk` (pitch +6).

- [ ] **Step 1: Failing unit tests** (`denoise.test.ts`): white noise at 0.05 amplitude + a 440 Hz tone: after `denoiseChannel(strength 0.8)` noise-only region RMS drops ≥ 6 dB while tone amplitude stays within 1.5 dB; `strength 0` returns an identical-valued array; output length equals input; all-zero input ⇒ all zero with no NaN; input shorter than one frame ⇒ returned unchanged.
- [ ] **Step 2:** run ⇒ FAIL. **Step 3:** implement (small in-file radix-2 FFT).
- [ ] **Step 4: e2e** `audio-pitch.spec.ts`: a 440 Hz tone with `pitch +12` renders with dominant frequency 880 Hz ±2 % (FFT of the exported window in-page), duration unchanged; `pitch −12` ⇒ 220 Hz; seam test (windows 1 s vs ∞) RMS diff < 2e-3 for pitch and denoise; export through the real exporter and `ffprobe` shows duration within 1 frame of the timeline.
- [ ] **Step 5:** full gate including full `npm run e2e`. **Step 6: Commit** `feat: pitch shift, noise reduction and voice presets`.

### Task 8: Auto-ducking

**Files:** Create `src/audio/duck.ts`, `tests/duck.test.ts`, `src/ui/DuckControls.tsx`, `tests/e2e/duck.spec.ts`; modify `src/audio/plan.ts` (compute envelope per session), `chain.ts` (`duckPoints` already in `ChainSpec`), `src/ui/TrackHeader.tsx`.

**Interfaces:**
- Produces:
  - `duckEnvelope(intervals: [number, number][], opts: { amountDb: number; attack: number; release: number }): { t: number; gain: number }[]` — merges overlapping/adjacent intervals; gain 1 outside; ramps to `10^(amountDb/20)` over `attack` seconds ending at each interval start and back to 1 over `release` seconds after each end; when a release would overlap the next attack the gain stays ducked; breakpoints strictly increasing in `t`.
  - `duckPointsFor(p: Project, track: Track): { t: number; gain: number }[] | undefined` — intervals = clip spans of AUDIBLE clips on `track.duck.sourceTrackId` (respects mute/solo/silent/volume 0); `undefined` when no duck configured or no source audible.
  - `<DuckControls track>`: source track select, amount (dB), attack, release, off; test ids `duck-source-<trackId>`, `duck-amount-<trackId>`.

- [ ] **Step 1: Failing unit tests** (`duck.test.ts`): single interval [10, 14], −12 dB, attack 0.2, release 0.5 ⇒ points `(9.8,1) (10,0.2512) (14,0.2512) (14.5,1)`; two intervals 0.3 s apart with release 0.5 ⇒ one continuous dip (no return to 1 between); empty ⇒ `[]`; zero amount ⇒ all gains 1; `duckPointsFor` ignores a muted source track; points monotonic.
- [ ] **Step 2:** FAIL. **Step 3:** implement; windowed engines receive only the points overlapping their window PLUS the previous and next point so ramps join exactly (assert in `duck.test.ts`: slicing then scheduling reproduces `gainAt(t)` within 1e-9).
- [ ] **Step 4: e2e** `duck.spec.ts`: music tone track ducking under a voice clip ⇒ exported music-segment RMS during the voice span is 12 dB (±1.5) lower than before it; returns after release; muting the voice track removes the ducking; seam test with `windowSeconds: 1`.
- [ ] **Step 5:** gate. **Step 6: Commit** `feat: auto-ducking`.

### Task 9: Voice-over recording

**Files:** Create `src/media/wav.ts`, `src/media/recorder.ts`, `src/ui/RecordButton.tsx`, `tests/wav.test.ts`, `tests/recorder-state.test.ts`, `tests/e2e/record.spec.ts`; modify `vercel.json`, `playwright.config.ts` (Chromium args `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`; extra args only for this spec's project if a separate project is needed), `src/ui/Toolbar.tsx` or `TimelineBar.tsx`, `src/ui/commands.ts` (import path reuse), `README.md` (microphone note).

**Interfaces:**
- Produces:
  - `encodeWav(chunks: Float32Array[], sampleRate: number): Blob` mono 16-bit PCM, correct 44-byte RIFF header, clipping to ±1.
  - `createRecorder(opts?: { maxSeconds?: number /* default 1800 */ }): Recorder` with `start(): Promise<void>` (rejects with `RecorderError` having `reason: 'denied' | 'no-device' | 'unsupported'`), `stop(): Promise<Blob>`, `cancel(): void`, `elapsed(): number`, `onLimit` callback; capture via `AudioContext` + `MediaStreamAudioSourceNode` into an inline `AudioWorklet` module (Blob URL) that posts Float32 chunks; if AudioWorklet is unavailable, reject `unsupported` (no deprecated ScriptProcessor).
  - Command `recordVoiceOver()` toggles: start at the playhead, timeline plays muted-for-recording-only if "Play along" is on (default on, headphones warning in the tooltip); stop ⇒ import the WAV via the existing import pipeline as audio media named "Voice-over N" and place it at the recorded start on the active audio track (or a new track if locked/overlapping), ONE apply.
- Test ids: `record-button`, `record-timer`.

- [ ] **Step 1: Failing unit tests:** `encodeWav` header bytes (`RIFF`, size, `WAVE`, `fmt `, PCM, 1 ch, rate, bits 16, `data` length) for 3 samples `[0, 1, -1]` ⇒ int16 `[0, 32767, -32768]`, values > 1 clip; state machine test for the recorder (fake injected `getUserMedia` rejecting `NotAllowedError` ⇒ `reason:'denied'`; `NotFoundError` ⇒ `'no-device'`); limit reached ⇒ `onLimit` once and `stop` still returns the audio.
- [ ] **Step 2:** FAIL. **Step 3:** implement; set `Permissions-Policy: camera=(), microphone=(self), geolocation=()` in `vercel.json`.
- [ ] **Step 4: e2e** (`record.spec.ts` with the fake mic): record 2 s ⇒ an audio clip ≈ 2 s (±0.3) appears on the active audio track at the playhead position, media named "Voice-over 1" in the bin, exported MP4 has non-silent AAC (`astats` RMS > −60 dB) — the fake device emits a beep; Esc/Cancel records nothing and adds no undo step; stubbing `getUserMedia` to reject shows the plain-English toast and changes nothing; reload keeps the clip (media persisted in OPFS).
- [ ] **Step 5:** gate; check `dist/` for no `__clipforge`. **Step 6: Commit** `feat: record voice-over (WAV via microphone)`.

### Task 10: Journey, docs, ledger, final review

**Files:** Create `tests/e2e/audio-journey.spec.ts`; modify `README.md`, `PROJECT_HANDOFF.md`, `docs/superpowers/ledgers/plan-3-audio-ledger.md` (create; list Rulings D1-D10 plus any new `Ruling:` lines), `docs/superpowers/ledgers/plan-3-manual-qa-checklist.md` (create).

- [ ] **Step 1:** Journey e2e: import a video with speech-like audio and a music file; detach audio; fade the music in/out; add EQ + compressor to the voice clip; duck the music under the voice; reload (everything restored exactly); export 1080p; `ffprobe` duration within 1 frame of the timeline and `astats` shows ducked music segment ≥ 9 dB below its undimmed level; undo chain walks back one step per gesture.
- [ ] **Step 2:** Manual checklist (real desktop Chrome on a Mac): fade in/out audible, pan left/right, each effect and preset audible, waveform alignment while zoomed, detach/attach, ducking by ear, microphone permission prompt (allow, deny, then re-allow in site settings), recording with headphones and without, export opened in QuickTime and the audio matches preview, Safari 17+ note (unverified).
- [ ] **Step 3:** Update docs (README features, limits: no linking, no per-track effects, recording cap 30 min; HANDOFF status and test counts).
- [ ] **Step 4:** Full gate: `npm test && npm run typecheck && npm run build && npm run e2e && npm run e2e:preview`; `grep -rc __clipforge dist` empty.
- [ ] **Step 5:** Final whole-branch review (fresh reviewer, `git diff <Plan-2-merge-base>..HEAD`), one themed fix wave, scoped re-review. **Step 6: Commit** `docs,test: audio journey, QA checklist and handoff`. Ask the user before any push or deploy.

## Self-Review notes

- Spec coverage (lines 28-29): separate tracks ✓ (Plan 2), detach ✓ T2/T4, record ✓ T9, waveforms ✓ T5, per-clip volume ✓ (existing) , pan/fade ✓ T3/T4, track volume ✓ T3/T4, effects EQ/denoise/compressor/normalise/reverb/echo/pitch/presets/filters ✓ T6/T7, ducking ✓ T8, live preview ✓ via the shared chain (D10), rendered into export ✓ T3/T6. Gaps recorded as D9/D6: crossfades, per-track effects, speed change (Plan 5), mute/solo per track (exists).
- Types used across tasks: `ClipAudio`, `AudioEffect`, `TrackDuck`, `Segment.clip/trackVolume`, `ChainSpec.duckPoints`, `Peaks`/`peakAt`, `chainMargins` are each defined in exactly one task and consumed later (T1→T2→T3→T6→T7/T8, T5→T6).
- Order rationale: model and pure edits first (T1-2), engine (T3) before any UI so every later task is audible end to end; waveform (T5) before Normalise (T6); the risky DSP (T7) isolated; recording last (needs permissions, config changes).
