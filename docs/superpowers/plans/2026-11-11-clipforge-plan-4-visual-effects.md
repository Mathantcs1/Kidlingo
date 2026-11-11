# ClipForge Plan 4: Visual Effects and Looks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every video/image clip a stack of WebGL2 effects (colour, looks, `.cube` LUTs, blur/sharpen/glow/pixelate, stylise, chroma key) with live preview and identical export, add blend modes, then (Part B) overlay clips (lower third, subscribe button, progress bar, stickers) and adjustment layers (one effect stack applied to everything beneath it).

**Architecture:** A pure effect schema + stack edits in `src/core` (DOM-free, like the audio effect params); a WebGL2 `EffectPipeline` in `src/render/effects/` that runs each clip's enabled effects as full-screen passes (ping-pong render targets) between "upload frame" and "draw with transform", inside the ONE compositor used by both preview and export (so they cannot drift, same principle as D1 in Plan 3). `compositor.ts`/`gl.ts` are split first, behaviour-preserving. Data moves to v4 (`Clip.effects`).

**Tech Stack:** WebGL2 (GLSL ES 3.00, TEXTURE_3D for LUTs), Canvas2D (overlays, Part B), Vitest, Playwright with real pixel reads and ffmpeg frame grabs. No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-11-10-clipforge-design.md` (effects and looks, overlays, compositor sections). Roadmap: `docs/superpowers/plans/2026-11-10-clipforge-plan-2-layers.md` (Plan 4). Process/rulings: `PROJECT_HANDOFF.md`, `docs/superpowers/ledgers/plan-3-audio-ledger.md`.

## Global Constraints

- TypeScript strict; 2 spaces, single quotes, semicolons; files ≲200 lines (`compositor.ts` is at 200: Task 1 splits it before anything is added; `styles.css` is 1211: new CSS goes in a new `src/ui/effects.css`).
- `src/core/` stays pure/no DOM. Edits are `(Project, …) => Project`, throw `TimelineError` for refusals, never mutate input, return the SAME reference for no-ops. Locked tracks refuse effect edits like every clip edit.
- One gesture = ONE `apply`; slider drags commit once on release (same as Plan 3). Store-bound commands use `guard(() => apply(...))`.
- Geometry is in FORMAT pixels; textures hold PREMULTIPLIED alpha; every effect shader must be correct for premultiplied input (un-premultiply before colour math, re-premultiply after).
- Preview and export call the same `renderFrame`; effects must be deterministic from (project, time): no `Math.random`/wall-clock in shaders or passes.
- Project data version becomes **4**; unknown newer ⇒ `unsupported`, never overwritten; v1–v3 saves open unchanged. Part B bumps to **5** (decision D1: overlay and adjustment clip kinds).
- Keep every existing `data-testid` (hundreds of e2e use them); new controls get new ones. `window.__clipforge` stays DEV-only (grep `dist/`).
- Never delete user media except via the verified-restore GC; LUT files count as media for GC.
- A shader that fails to compile/link, or a lost GL context mid-stack, must never blank the preview or abort an export: the affected effect is skipped, a plain-English toast/notice says which, and the rest of the frame still renders (Decision D8).
- TDD: failing test first, mutation-check important guards. Commit trailers (blank line before): `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: <current session URL>`.
- Never push or deploy without the user's explicit go-ahead; never touch other Vercel projects; never run `playwright install`; never run two e2e runs at once (port 5173).
- Gate per task: `npm test && npm run typecheck && npm run build` plus touched e2e specs; full `npm run e2e` at Tasks 1, 7, 11a, 12, 13a, 14 (Task 1 proves the split changed no pixel; Task 12 audits every `p.media[...]` use).

## Decisions to approve (rulings proposed; change any before execution)

- **D1 Two deployable parts.** Part A = Tasks 1–11a (effects engine, colour, looks, LUT, blur/sharpen/glow/pixelate, stylise, chroma key, UI, parity, blend modes). Part B = Tasks 12–13a (overlays and adjustment layers). Part A is data v4 and can be deployed alone; Part B introduces new clip kinds (`overlay`, `adjustment`) and so bumps data to **v5** (an older v4 build must not open them), which pushes Plan 5's keyframes to v6 (see the roadmap file for the later plans). Cost if wrong: you wanted one deploy; just deploy after Task 13.
- **D2 One pass per effect, ping-pong targets, working size cap.** Effects run on an offscreen texture at `min(clip display size, 2× the format's long side)`; max **8 effects per clip**; multi-pass effects (blur, glow) use 2–3 internal passes. Cost if wrong: very heavy stacks may play below real time on slow GPUs; export still renders every frame.
- **D3 Colour is ONE fused effect** `colour` with 9 params (brightness, contrast, saturation, exposure, temperature, tint, hue, shadows, highlights) rather than nine separate effects: one shader pass, one panel, how editors present it. B&W and Sepia stay separate effects.
- **D4 Looks are preset stacks of the same effects** (no separate system, no intensity slider): `applyLook` replaces the clip's stack in ONE edit; the user then tweaks any param. Nine looks: Black & White, Sepia, Vintage Film, Teal & Orange, Cinematic, Moody, Golden Hour, Cool Blue, Punchy. Cost if wrong: swap the list in one data file.
- **D5 `.cube` LUTs**: 3D LUTs only, size 2–65, DOMAIN_MIN/MAX honoured; 1D LUTs and bigger sizes are refused with a clear message. The file is stored in OPFS as media of new kind `lut` (hidden from clip placement), referenced by `VideoEffect.ref`; sampled trilinearly from a TEXTURE_3D. Deleting a used LUT's media is refused like any used media.
- **D6 Time-based effects (grain, glitch, VHS) are deterministic**: seeded from the clip-relative time snapped to the project frame, so export frame N equals preview frame N.
- **D7 Effects apply to video and image clips only** (not audio, not overlays); the "Blur" fit's backdrop is derived from the PROCESSED clip so foreground and backdrop match.
- **D8 Shader failure policy**: per-effect programs compile lazily; a failure disables that effect type for the session, toasts once ("Effect X is not supported on this graphics setup"), and the clip draws without it, in preview and in export.
- **D9 Chroma key** works in YCbCr with similarity, smoothness and spill suppression and a native colour input; no eyedropper in v1 (listed as deferred).
- **D11 Blend modes** are per clip (`Clip.blend`, 12 standard modes: normal, multiply, screen, overlay, darken, lighten, colour dodge, colour burn, hard light, soft light, difference, exclusion), implemented by compositing into an intermediate buffer and blending in a shader against the backdrop (fixed-function blending cannot do most modes). Cost if wrong: one extra full-frame pass per non-normal clip.
- **D12 Adjustment layers** are a clip kind `adjustment` on a video track: its effect stack is applied to the composite of every track below it for the clip's time range (data v5, Part B). Not applicable to the audio tracks. Opacity blends the adjusted result with the unadjusted composite.
- **D10 Not in Plan 4:** effect keyframes/animation (Plan 5), masks/shapes (Plan 8), copy/paste effect stacks, look thumbnails, preview eyedropper, web fonts for overlays (system font stack only), 1D/`.3dl` LUT formats, HDR/10-bit.

## Review Focus

1. **Premultiplied-alpha fringes:** colour/chroma/LUT on a PNG with soft transparent edges must not leave dark or bright halos (Tasks 4, 6, 9 tests use a half-transparent edge fixture).
2. **Odd media:** portrait/rotated phone video, 4K frames, images with transparency, tiny images (<8 px) with blur/pixelate; effect working-size cap must keep memory bounded (Tasks 4, 7).
3. **Shader/context failure mid-stack:** compile error, link error, lost context: preview and export keep going without the broken effect (Task 4 policy test, Task 11 export test).
4. **Preview ≠ export:** time-based effects at fps ≠ 30, exported frame N versus preview frame N, odd canvas sizes (Task 11).
5. **Malformed `.cube`:** wrong size line, NaN, CRLF, comments, 1D LUT, DOMAIN ≠ 0..1, 128³; deleting a LUT still referenced by a clip; reload restores LUT clips (Task 6).
6. **Data safety:** v3→v4 migration of clips on every track, hand-edited unknown effect types or out-of-range params are repaired/dropped, `{version: 5}` stays unsupported in Part A (Task 2).

## File Structure

| File | Responsibility |
|---|---|
| `src/core/videoEffects.ts` (create) | `VideoEffectType`, `VideoEffect`, schema table (`VIDEO_EFFECTS`), `defaultParams`, `clampParams`, `LOOKS`, `MAX_VIDEO_EFFECTS` |
| `src/core/videoEffectEdits.ts` (create) | pure stack edits and `applyLook` |
| `src/core/model.ts`, `migrate.ts` (modify) | `Clip.effects`, `Project.version: 4`, `MediaRef.kind` gains `'lut'`, migration v3→v4 |
| `src/render/renderTarget.ts`, `drawCollect.ts` (create, from compositor/blur) | extracted `RenderTarget` and Phase-1 draw collection |
| `src/render/effects/pipeline.ts` | `EffectPipeline` (ping-pong, working size, per-effect failure policy) |
| `src/render/effects/programs.ts` | lazy program cache (full-screen pass helper, uniforms from params) |
| `src/render/effects/shaders/*.ts` | one GLSL source module per effect family |
| `src/render/effects/luts.ts`, `src/media/cube.ts`, `src/media/lutImport.ts` | LUT texture cache, pure `.cube` parser, import into OPFS |
| `src/render/effects/colourMath.ts` | pure CPU reference of the colour shader (tests compare GL output to it) |
| `src/ui/EffectsInspector.tsx`, `VideoEffectRow.tsx`, `LooksGallery.tsx`, `videoEffectCommands.ts`, `effects.css` | UI |
| Part B: `src/render/overlays/*`, `src/ui/OverlayInspector.tsx`, `overlayCommands.ts` | overlay clips |

---

### Task 1: Split compositor.ts and gl.ts (behaviour-preserving)

**Files:** Create `src/render/renderTarget.ts`, `src/render/drawCollect.ts`; modify `src/render/compositor.ts`, `src/render/blur.ts`, `src/render/gl.ts`; no test changes.

**Interfaces:**
- Produces: `class RenderTarget { constructor(gl); readonly slot: TextureSlot; bind(width: number, height: number): void; dispose(): void }` (moved out of blur.ts, exported); `collectDraws(ctx: DrawContext, p: Project, t: number, sources: Map<Id, VideoSource>): Promise<Draw[]>` (the whole of "Phase 1"); `Draw` type exported; `compositor.ts` keeps `createCompositor`, `GlCompositor.render` as orchestrator ≤ 150 lines.

- [ ] **Step 1:** Record the baseline: run the pixel/export specs that guard the compositor and note they pass: `npx playwright test tests/e2e/compositor.spec.ts tests/e2e/blur.spec.ts tests/e2e/rotation.spec.ts tests/e2e/pip.spec.ts tests/e2e/layers-render.spec.ts tests/e2e/export-gl.spec.ts tests/e2e/images.spec.ts`.
- [ ] **Step 2:** Move code only (no logic change); keep every export used elsewhere (`grep -rn "from '../render"` to check imports), keep `data-testid`s untouched.
- [ ] **Step 3:** `npm test && npm run typecheck && npm run build`, the same e2e specs ⇒ identical pass; then full `npm run e2e` ⇒ 256+ pass. No new tests are needed because the existing pixel specs are the oracle.
- [ ] **Step 4: Commit** `refactor: split compositor into collect/render target modules`.

### Task 2: Data model v4, effect schema and pure stack edits

**Files:** Create `src/core/videoEffects.ts`, `src/core/videoEffectEdits.ts`, `tests/video-effects.test.ts`, `tests/video-effect-edits.test.ts`; modify `src/core/model.ts`, `src/core/migrate.ts`, `src/core/timeline.ts` (`splitClip`), every `version: 3` fixture; extend `tests/migrate.test.ts`, `tests/e2e/layers-migration.spec.ts`.

**Interfaces:**
- Produces:
  - `type VideoEffectType = 'colour' | 'bw' | 'sepia' | 'splitTone' | 'vignette' | 'grain' | 'lut' | 'blur' | 'sharpen' | 'glow' | 'pixelate' | 'rgbSplit' | 'glitch' | 'vhs' | 'mirror' | 'invert' | 'chromaKey'`
  - `interface VideoEffect { id: Id; type: VideoEffectType; enabled: boolean; params: Record<string, number>; ref?: Id }` (`ref` = LUT media id for `lut`)
  - `interface ParamDef { key: string; label: string; min: number; max: number; step: number; def: number; unit?: string }`; `interface EffectSchema { type; label; group: 'colour' | 'look' | 'blur' | 'stylise' | 'key'; params: ParamDef[]; timeBased: boolean; available: boolean }`; `VIDEO_EFFECTS: Record<VideoEffectType, EffectSchema>` (params per effect are fixed in the tasks that implement them; this task registers all types with `available: false` except none, then each task flips its own)
  - `defaultParams(type)`, `clampParams(type, params)` (clamp, fill, drop unknown keys, non-finite ⇒ default), `MAX_VIDEO_EFFECTS = 8`
  - `Clip.effects: VideoEffect[]` (video and image clips; `[]` default; audio clips always `[]`); `Clip.blend: BlendMode` (default `'normal'`) with `type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'colourDodge' | 'colourBurn' | 'hardLight' | 'softLight' | 'difference' | 'exclusion'`; `Project.version: 4`; `MediaRef.kind` gains `'lut'`
  - `setClipBlend(p, clipId, mode: BlendMode): Project` (lock-guarded, same-reference no-op, video/image clips only).
  - Edits (all lock-guarded, same-reference no-ops, ≤ `MAX_VIDEO_EFFECTS` else `TimelineError('At most 8 effects per clip')`): `addVideoEffect(p, clipId, type, ref?)`, `updateVideoEffect(p, clipId, effectId, patch: { enabled?: boolean; params?: Record<string, number> })`, `removeVideoEffect`, `moveVideoEffect(p, clipId, effectId, toIndex)`, `applyLook(p, clipId, lookKey)` (replaces the stack in one edit; `LOOKS` is data listed in Task 5), refusals for audio clips and images-vs-video are none (both allowed)
  - `splitClip` copies effects with NEW ids to both halves; `joinClips`/`trimClip` leave them untouched.

- [ ] **Step 1: Failing tests:** migration of a v3 project with video, image and audio clips ⇒ `version: 4`, `effects: []` and `blend: 'normal'` on every clip (an unknown blend value in a hand-edited save repairs to `'normal'`), input not mutated, idempotent; `{version: 5}` ⇒ `newer`; a hand-edited v4 clip with an unknown effect type is dropped, out-of-range params are clamped, duplicate effect ids are re-id'd (keep the first), more than 8 effects are truncated; `clampParams` for every type (NaN, out of range, unknown key, missing key); edit tests with exact values (add 9th effect refused; move to index clamps; split gives unique ids; locked track refuses; same reference on no-op).
- [ ] **Step 2:** Run `npx vitest run tests/video-effects.test.ts tests/video-effect-edits.test.ts tests/migrate.test.ts` ⇒ FAIL. **Step 3:** Implement as specified (migration step `toClipEffects` modelled on `toClipAudio`).
- [ ] **Step 4:** Update fixtures and the e2e migration spec (seed a v3 IndexedDB project, reload ⇒ re-saved as v4; `{version: 5}` stays protected).
- [ ] **Step 5:** `npm test && npm run typecheck && npm run build`; `npx playwright test tests/e2e/layers-migration.spec.ts tests/e2e/restore.spec.ts`. **Step 6: Commit** `feat: project data v4 (video effect stacks) and pure effect edits`.

### Task 3: Effect pipeline infrastructure (no visible effect yet)

**Files:** Create `src/render/effects/pipeline.ts`, `programs.ts`, `shaders/passthrough.ts`, `tests/effect-pipeline.test.ts` (pure parts), `tests/e2e/effects-pipeline.spec.ts`; modify `src/render/compositor.ts`, `src/render/drawCollect.ts`, `src/render/blur.ts` (backdrop from the processed texture).

**Interfaces:**
- Consumes: `RenderTarget`, `QuadRenderer`, `Draw` (Task 1), `VideoEffect` (Task 2).
- Produces:
  - `workingSize(display: Size, format: Size): Size` (pure: `min(display, 2 × format long side)`, aspect preserved, integer, never empty)
  - `class EffectPipeline { constructor(gl, quad); run(input: TextureSlot, size: Size, effects: VideoEffect[], ctx: EffectContext): TextureSlot; dispose(): void }` where `interface EffectContext { time: number /* clip-relative seconds snapped to the frame */; frame: number; fps: number; lut(ref: Id): WebGLTexture | null; onUnavailable(type: VideoEffectType): void }`; returns `input` itself when no enabled, available effect applies (zero extra passes).
  - `programFor(gl, type): PassProgram | null` (lazy compile, caches failure and calls `ctx.onUnavailable` once per type per session), `interface PassProgram { draw(src: WebGLTexture, params: Record<string, number>, ctx: EffectContext, size: Size): void }`.
  - Compositor: for each draw, `slot = pipeline.run(...)` then the existing transformed `quad.draw` of the result; blur backdrop uses the result.
- [ ] **Step 1: Failing tests:** `workingSize` (1080p/4K sources, portrait, 1×1, tall 100×4000); pipeline with only disabled effects returns the SAME slot (no passes); a registered test-only effect whose shader fails to compile ⇒ skipped once, `onUnavailable` called once, the draw still happens (e2e: stub a bad shader through a DEV hook and check pixels equal the no-effect render). Run ⇒ FAIL.
- [ ] **Step 2:** Implement; add a temporary `invert`-like test shader only inside the e2e harness (not shipped). **Step 3:** Pixel specs from Task 1 stay identical for clips without effects. **Step 4:** gate + `npx playwright test tests/e2e/effects-pipeline.spec.ts` and the Task 1 spec list. **Step 5: Commit** `feat: effect pipeline infrastructure`.

### Task 4: Colour effect (fused) with CPU reference

**Files:** Create `src/render/effects/shaders/colour.ts`, `src/render/effects/colourMath.ts`, `tests/colour-math.test.ts`, `tests/e2e/effects-colour.spec.ts`; modify `src/core/videoEffects.ts` (`colour` available).

**Interfaces:**
- Produces: schema `colour` params (key, min, max, step, def): `brightness` −1..1 0, `contrast` −1..1 0, `saturation` −1..1 0, `exposure` −2..2 0 (stops), `temperature` −1..1 0, `tint` −1..1 0, `hue` −180..180 0 (degrees), `shadows` −1..1 0, `highlights` −1..1 0; `colourPixel(rgb: [number, number, number], p: Record<string, number>): [number, number, number]` (pure, linear-in/linear-out per the shader's documented order: exposure → temperature/tint → shadows/highlights → contrast → brightness → saturation → hue, in display-referred 0..1 sRGB values; defaults are identity).
- [ ] **Step 1: Failing tests:** `colourPixel` identity at defaults (exact), saturation −1 ⇒ equal channels, exposure +1 doubles linear value, hue 180 maps red to cyan-ish within tolerance, all outputs clamped 0..1 and finite for random params (property test over 500 draws). e2e: solid-colour PNGs (red, mid-grey, white) through the real compositor with defaults ⇒ unchanged within 1/255; with sample params each output pixel within 3/255 of `colourPixel`; a PNG with a 50 %-alpha edge keeps its edge pixels' colour ratio (no halo: premultiplied handling).
- [ ] **Step 2–4:** run RED, implement the shader (un-premultiply → math → re-premultiply) and CPU reference, run GREEN. **Step 5:** gate + spec. **Step 6: Commit** `feat: fused colour effect`.

### Task 5: Looks (B&W, sepia, vignette, grain, split tone) and the nine look presets

**Files:** Create `shaders/look.ts` (bw, sepia, splitTone, vignette, grain), `src/core/looks.ts`, `tests/looks.test.ts`, `tests/e2e/effects-looks.spec.ts`; modify `videoEffects.ts`.

**Interfaces:**
- Produces: schemas — `bw` `amount` 0..1 def 1; `sepia` `amount` 0..1 def 1; `splitTone` `shadowHue` 0..360 def 210, `shadowAmount` 0..1 def 0.3, `highlightHue` 0..360 def 30, `highlightAmount` 0..1 def 0.3, `balance` −1..1 def 0; `vignette` `amount` 0..1 def 0.4, `size` 0..1 def 0.5, `softness` 0..1 def 0.5; `grain` (`timeBased: true`) `amount` 0..1 def 0.15, `size` 1..4 def 1.5. `LOOKS: Record<LookKey, { label: string; effects: Omit<VideoEffect, 'id'>[] }>` for `bw, sepia, vintage, tealOrange, cinematic, moody, goldenHour, coolBlue, punchy` (each 1–4 effects built only from Task 4–5 effects, valid under `clampParams`); `applyLook` from Task 2 uses it.
- [ ] **Step 1: Failing tests:** every look valid under `clampParams` and ≤ 8 effects; unit math for `bw` luma weights (Rec.709), `sepia` matrix; e2e: B&W on a red PNG ⇒ R=G=B equal to luma ±2; vignette darkens corners but not the centre (centre ±1, corner < 0.8× centre); grain is deterministic: two renders of the same frame time are byte-identical, different frame times differ, and the mean luminance stays within ±2 % of the input; `applyLook` through the UI-free command is ONE undo step.
- [ ] **Step 2–5:** RED, implement, GREEN, gate. **Step 6: Commit** `feat: looks (bw, sepia, split tone, vignette, grain) and nine presets`.

### Task 6: `.cube` LUT import and LUT effect

**Files:** Create `src/media/cube.ts`, `src/media/lutImport.ts`, `src/render/effects/luts.ts`, `shaders/lut.ts`, `tests/cube.test.ts`, `tests/e2e/effects-lut.spec.ts`; modify `src/media/import.ts` / `fileKind.ts` (accept `.cube`), `src/media/gc.ts` (`referencedMedia` includes effect `ref`s), `src/media/storage.ts`, `videoEffects.ts` (`lut`: `intensity` 0..1 def 1, `ref` required).

**Interfaces:**
- Produces: `parseCube(text: string): { size: number; data: Float32Array /* size³×3, r fastest */; domainMin: [number, number, number]; domainMax: [number, number, number]; title?: string }` throwing `CubeError(message)` for: 1D LUT (`LUT_1D_SIZE`), size outside 2..65, wrong number of data rows, non-finite values, missing size; tolerates CRLF, `#` comments, blank lines, `TITLE "…"`; `importLut(file: File): Promise<MediaRef>` (kind `'lut'`, name from TITLE or filename; stores the original text in OPFS); `LutTextures { get(mediaId): Promise<WebGLTexture | null>; dispose() }` (TEXTURE_3D RGB16F or RGBA8 fallback, trilinear, cached by media id).
- [ ] **Step 1: Failing tests:** `parseCube` happy path (size 2 identity cube ⇒ exact data), each refusal above with its message, CRLF/comment tolerance, DOMAIN ≠ 0..1 normalised; e2e: an identity 17³ LUT leaves pixels within 1/255; an inverting LUT inverts a PNG; `intensity 0.5` is the midpoint; import via the UI file input adds a LUT to the effect's picker; a clip using a LUT survives reload; removing the LUT media while a clip references it is refused with the existing "in use" message (and GC never deletes it); a missing LUT file ⇒ the effect is skipped with a toast, frame still renders.
- [ ] **Step 2–5:** RED, implement, GREEN, gate (`npx playwright test tests/e2e/effects-lut.spec.ts tests/e2e/import.spec.ts tests/e2e/restore.spec.ts`). **Step 6: Commit** `feat: .cube LUT import and LUT effect`.

### Task 7: Blur, sharpen, glow, pixelate (multi-pass)

**Files:** Create `shaders/blurFamily.ts`, `tests/e2e/effects-blur.spec.ts`, `tests/blur-kernel.test.ts`; modify `pipeline.ts` (multi-pass programs), `videoEffects.ts`.

**Interfaces:**
- Produces: schemas — `blur` `radius` 0..100 px (of the working size, def 8); `sharpen` `amount` 0..2 def 0.6, `radius` 0.5..5 def 1; `glow` `threshold` 0..1 def 0.7, `radius` 0..100 def 20, `intensity` 0..2 def 0.8; `pixelate` `size` 1..200 px def 12. Pure `gaussianKernel(radius: number): { offsets: number[]; weights: number[] }` (linear-sampling taps, weights sum to 1 ±1e-6, radius 0 ⇒ identity). Blur/glow run separable H+V passes on the ping-pong targets; radius is in clip pixels and scales with `workingSize / display size` so a given radius looks the same at any resolution.
- [ ] **Step 1: Failing tests:** kernel sums/monotonic weights; e2e: blur of a 1-px white line widens its energy but conserves total luminance within 2 %; blur radius 0 and sharpen amount 0 are identity ±1; pixelate size 8 ⇒ every 8×8 block constant; glow adds energy only around pixels above the threshold; premultiplied-edge fixture shows no halo; a 1×1 and a 4000×100 image do not throw; effect stacks of 8 blur effects stay within the working-size memory bound (stat counter).
- [ ] **Step 2–5:** RED, implement, GREEN, gate; run the full `npm run e2e` at the end of this task. **Step 6: Commit** `feat: blur, sharpen, glow and pixelate effects`.

### Task 8: Stylise (RGB split, glitch, VHS, mirror, invert)

**Files:** Create `shaders/stylise.ts`, `tests/e2e/effects-stylise.spec.ts`, `tests/stylise-math.test.ts`; modify `videoEffects.ts`.

**Interfaces:**
- Produces: schemas — `rgbSplit` `amount` 0..50 px def 6, `angle` 0..360 def 0; `glitch` (`timeBased`) `intensity` 0..1 def 0.4, `blockSize` 4..200 def 40; `vhs` (`timeBased`) `scanlines` 0..1 def 0.4, `bleed` 0..1 def 0.4, `noise` 0..1 def 0.2, `wobble` 0..1 def 0.2; `mirror` `mode` 0..3 (0 left→right, 1 right→left, 2 top→bottom, 3 four-way) def 0; `invert` `amount` 0..1 def 1. Pure `hash(frame: number, x: number, y: number): number` mirrored by the shader hash so glitch offsets are testable on the CPU.
- [ ] **Step 1: Failing tests:** `hash` determinism and distribution (mean ≈ 0.5 ±0.02 over 10 000 samples); e2e: invert twice = identity ±1; mirror mode 0 makes the right half the mirror image of the left (pixel compare); rgbSplit amount 0 identity and amount > 0 offsets the red channel by the expected pixels ±1; glitch/vhs render byte-identical for the same time and differ across frame times; every effect keeps alpha of transparent regions untouched.
- [ ] **Step 2–5:** RED, implement, GREEN, gate. **Step 6: Commit** `feat: stylise effects`.

### Task 9: Chroma key

**Files:** Create `shaders/chromaKey.ts`, `src/render/effects/keyMath.ts`, `tests/key-math.test.ts`, `tests/e2e/effects-chroma.spec.ts`; modify `videoEffects.ts`.

**Interfaces:**
- Produces: schema `chromaKey` params `keyR`, `keyG`, `keyB` 0..1 (def 0, 1, 0), `similarity` 0..1 def 0.35, `smoothness` 0..1 def 0.1, `spill` 0..1 def 0.75 (Ruling P8); pure `keyAlpha(rgb, key, similarity, smoothness): number` (YCbCr chroma distance with smoothstep, 0 = keyed out) and `suppressSpill(rgb, key, amount): rgb`; the shader outputs premultiplied RGBA so layers below show through.
- [ ] **Step 1: Failing tests:** `keyAlpha` is 0 for the key colour, 1 for far colours, monotonic in distance, bounded 0..1 for random inputs; spill suppression never increases the key channel; e2e (ffmpeg-generated green-screen fixture: a green background with a red square and a soft edge) over a blue image layer on the track below: green area shows blue, the red square stays red, edge pixels blend without a green fringe (green channel not above max(R,B) + 8 on the edge ring); `similarity 0` keeps everything; the PNG half-alpha fixture still shows no halo.
- [ ] **Step 2–5:** RED, implement, GREEN, gate. **Step 6: Commit** `feat: chroma key`.

### Task 10: Effects UI (stack editor, looks gallery, LUT picker)

**Files:** Create `src/ui/EffectsInspector.tsx`, `VideoEffectRow.tsx`, `LooksGallery.tsx`, `videoEffectCommands.ts`, `effects.css`, `tests/video-effect-commands.test.ts`, `tests/e2e/effects-ui.spec.ts`; modify `src/ui/Inspector.tsx` (mount below the transform fields; keep it ≤ 200 lines).

**Interfaces:**
- Consumes: Task 2 edits, `VIDEO_EFFECTS` schema, `importLut` (Task 6).
- Produces: `videoEffectCommands.ts` (`guard(() => apply(...))`): `addVideoEffectCmd(type, ref?)`, `updateVideoEffectCmd(effectId, patch)`, `removeVideoEffectCmd`, `moveVideoEffectCmd`, `applyLookCmd(key)`. Test ids `fx-add`, `fx-add-button`, `fx-<id>-toggle`, `fx-<id>-<param>`, `fx-<id>-remove`, `fx-<id>-up`, `fx-<id>-down`, `fx-look-<key>`, `fx-lut-import`, `fx-lut-select-<id>`. Effects are grouped in the add menu by schema `group`; unavailable effects are hidden; sliders commit once on release; native `<input type="color">` for the chroma key colour; disabled for a clip on a locked track; a short note that effects run top to bottom.
- [ ] **Step 1: Failing e2e:** add Colour ⇒ brightness slider changes the preview pixel (read the canvas) and is ONE undo step per release; toggling disables the effect (pixel returns) in one step; reorder changes the result for two order-dependent effects (e.g. invert then colour); looks gallery applies Teal & Orange in ONE step and Undo restores the previous stack exactly; 9th effect refused with the plain-English toast; locked clip disabled; keyboard: Enter on Add adds, arrows on sliders work, Delete/Backspace in a slider does not delete the clip (Plan 3's range guard).
- [ ] **Step 2–5:** RED, implement, GREEN, gate (`audio-ui`, `inspector`, `layers-ui`, `layers-ui-keys` specs too). **Step 6: Commit** `feat(ui): effects inspector, looks gallery and LUT picker`.

### Task 11: Preview/export parity, failure policy and performance

**Files:** Create `tests/e2e/effects-parity.spec.ts`, `tests/e2e/effects-failure.spec.ts`; modify `src/export/exporter.ts` only if the parity test finds a gap (it is 345 lines: if a change is needed, extract first).

- [ ] **Step 1: Failing/guarding tests:** build a clip with a 4-effect stack (colour, grain, vignette, LUT), export 1080p, grab frame N with ffmpeg and compare to the preview canvas read at the same time at export size: mean abs diff < 3/255 (H.264 tolerance), for an fps-25 project too; time-based effects at 25 fps export equal frame-for-frame deterministic runs (two exports byte-compare their frame hashes); failure policy: force a compile failure for `glow` (DEV hook) ⇒ one toast, preview still draws, export finishes and its frames equal the no-glow render; lost-context mid-export keeps the existing "plain-English failure" behaviour; hidden track with effects is neither drawn nor processed (pipeline pass counter 0); performance guard: a 1080p preview frame with 4 effects renders within 6× the no-effect frame time on SwiftShader (relative, reported with numbers; the threshold is a regression guard, not a promise).
- [ ] **Step 2:** fix whatever the tests expose (if nothing, say so). **Step 3:** gate + full `npm run e2e`. **Step 4: Commit** `test: effects parity, failure policy and performance guards`.

### Task 11a: Blend modes

**Files:** Create `src/render/blend.ts`, `src/render/effects/shaders/blend.ts`, `tests/blend-math.test.ts`, `tests/e2e/blend.spec.ts`; modify `src/render/compositor.ts` (composite into an intermediate target when any visible clip is non-normal; normal-only frames keep today's fast path byte-for-byte), `src/ui/Inspector.tsx`/`EffectsInspector.tsx` (a blend-mode select), `src/ui/videoEffectCommands.ts` (`setBlendCmd`).

**Interfaces:**
- Consumes: `Clip.blend`, `setClipBlend` (Task 2), `RenderTarget` (Task 1).
- Produces: pure `blendChannel(mode: BlendMode, backdrop: number, source: number): number` (per channel, un-premultiplied 0..1, the W3C compositing formulas) and `blendPixel(mode, backdropRGBA, sourceRGBA): RGBA` (premultiplied in/out, alpha "source-over"); the GLSL mirrors them; test id `blend-mode-select`.
- [ ] **Step 1: Failing tests:** `blendChannel` exact values for each mode at (0.2, 0.6), (0, 1), (1, 0) (multiply 0.12, screen 0.68, difference 0.4, …); all modes bounded 0..1 and finite for random inputs; `normal` equals source-over; e2e: two solid-colour images on two layers: GL result within 2/255 of `blendPixel` for every mode; a half-transparent source edge blends without a halo; a frame with only `normal` clips renders byte-identical to before this task (existing pixel specs unchanged); undo of a blend change is ONE step; hidden/locked rules as for transform edits.
- [ ] **Step 2–5:** RED, implement, GREEN, gate + the Task 1 spec list + `effects-parity` (blend + effects together export equal to preview). **Step 6: Commit** `feat: per-clip blend modes`.

*— Deployment gate: Part A (Tasks 1–11a) can be deployed here (data v4). —*

### Task 12 (Part B): Overlay clips (data v5) and renderer

**Files:** Create `src/render/overlays/draw.ts`, `src/render/overlays/textures.ts`, `src/core/overlays.ts`, `tests/overlays.test.ts`, `tests/e2e/overlays-render.spec.ts`; modify `src/core/model.ts` (v5: `Clip.kind` gains `'overlay'`, `Clip.overlay?: OverlaySpec`), `migrate.ts` (v4→v5 identity step), `src/core/timeline.ts`/`edits.ts`/`merge.ts`/`audio/plan.ts`/`render/visible.ts`/`render/drawCollect.ts`/`media/gc.ts`/`export/exporter.ts` wherever `p.media[clip.mediaId]` is assumed (find with `grep -rn "media\[" src`); overlay clips have `mediaId: ''` and are skipped by media lookups, audio planning, GC and decoders.

**Interfaces:**
- Produces: `type OverlayType = 'lowerThird' | 'subscribe' | 'progressBar' | 'sticker'`; `interface OverlaySpec { type: OverlayType; text: string; subtext: string; colour: string /* #rrggbb */; accent: string; sticker?: 'heart' | 'star' | 'arrow' | 'like' | 'bell' | 'fire' | 'check' | 'sparkle' }`; pure `overlayDefaults(type): OverlaySpec`, `addOverlayClip(p, trackId, type, start: number, duration = 5): Project` (placed on the target video track with `hasRoom` or a new video layer; default transform places lower thirds bottom-left, subscribe bottom-right, progress bar at the bottom edge, stickers centred); `drawOverlay(ctx: CanvasRenderingContext2D, spec: OverlaySpec, size: Size, progress: number /* 0..1 of the clip */): void` (system font stack only; progress bar fills with `progress`, lower third slides in over the first 0.4 s and out over the last 0.4 s as a function of clip time, deterministic); textures are cached per (spec, size) and re-rendered when the spec or the size changes (progress bar re-renders per frame).
- [ ] **Step 1: Failing tests:** migration v4→v5 identity and `{version: 6}` ⇒ `newer`; `addOverlayClip` placement/refusals (locked track, no room ⇒ new layer, max layers); overlay clips ignored by `audibleClips`, GC, `mergeRefusal`, decoders (no `p.media` lookup throws); `drawOverlay` on a node-canvas-free fake context records the expected calls for each type (unit); e2e: each overlay type renders non-empty pixels in the expected screen region over a black frame, progress bar at 50 % has ~half the bar filled (±3 %), export frames match the preview region, Merge all keeps overlays, effects are refused on overlay clips (`TimelineError`).
- [ ] **Step 2–5:** RED, implement, GREEN, gate + full `npm run e2e` (the `media[` audit touches many modules). **Step 6: Commit** `feat: overlay clips (data v5)`.

### Task 13 (Part B): Overlay UI

**Files:** Create `src/ui/OverlayMenu.tsx`, `OverlayInspector.tsx`, `overlayCommands.ts`, `tests/e2e/overlays-ui.spec.ts`; modify `src/ui/Toolbar.tsx` or `MediaBin.tsx` (≤ 200 lines each), `ClipView.tsx` (distinct look for overlay clips).

- [ ] **Step 1: Failing e2e:** "Add overlay" menu (`overlay-add`, `overlay-add-<type>`) adds a clip at the playhead on the active video layer in ONE undo step; the inspector edits text/subtext/colour/accent/sticker (`overlay-text`, `overlay-subtext`, `overlay-colour`, `overlay-accent`, `overlay-sticker`) each commit once and update the preview; transform fields and PiP handles work on overlays; trimming/moving/splitting works; Detach/audio controls are not shown for overlays; locked track refuses; reload restores.
- [ ] **Step 2–5:** RED, implement, GREEN, gate. **Step 6: Commit** `feat(ui): overlay menu and inspector`.

### Task 13a (Part B): Adjustment layers

**Files:** Create `src/core/adjustment.ts`, `src/render/adjustment.ts`, `tests/adjustment.test.ts`, `tests/e2e/adjustment.spec.ts`; modify `src/core/model.ts` (`Clip.kind` gains `'adjustment'`; no media, `mediaId: ''`), `migrate.ts` (already v5 from Task 12), `src/render/compositor.ts`, `src/render/drawCollect.ts`, `src/ui/OverlayMenu.tsx` (an "Adjustment layer" entry), `src/ui/ClipView.tsx`; reuse the Task 12 audit of `p.media[...]` sites.

**Interfaces:**
- Produces: `addAdjustmentClip(p, trackId, start, duration = 5): Project` (placed like overlays); in the compositor, when an adjustment clip is active at time t, everything drawn BEFORE it (the tracks beneath, in array order) is first resolved into an intermediate target, the clip's effect stack runs over that target, and the result is composited back with the clip's opacity and blend mode, then drawing continues with the tracks above. An adjustment clip's own transform is ignored (full frame); effect edits/looks/LUT apply to it exactly as to a video clip (same commands); audio is untouched.
- [ ] **Step 1: Failing tests:** `addAdjustmentClip` placement/refusals; adjustment clips are ignored by audio planning, GC and decoders; e2e: an adjustment layer with a B&W effect over two coloured layers makes both grey while a clip ABOVE the adjustment layer stays coloured; outside its time range nothing changes; opacity 0.5 gives the midpoint; hiding the track removes the effect; export frames match preview; Merge all keeps the adjustment's effect on the merged result; effects on an overlay clip are still refused.
- [ ] **Step 2–5:** RED, implement, GREEN, gate (full `npm run e2e`). **Step 6: Commit** `feat: adjustment layers`.

### Task 14: Journey, docs, ledger, QA checklist, final review

**Files:** Create `tests/e2e/effects-journey.spec.ts`, `docs/superpowers/ledgers/plan-4-visual-effects-ledger.md`, `docs/superpowers/ledgers/plan-4-manual-qa-checklist.md`; modify `README.md`, `PROJECT_HANDOFF.md`, `CLAUDE.md` (facts only: data version, roadmap).

- [ ] **Step 1:** Journey e2e: import a video; apply the Teal & Orange look; tweak colour; add a LUT; add chroma key on an overlay-image layer; add a lower third; reload (project JSON exact); export 1080p; ffprobe duration within 1 frame and a frame grab matches the preview region; undo chain one step per gesture.
- [ ] **Step 2:** Manual checklist (real desktop Chrome on a Mac): each effect by eye, look presets, LUT import of a real `.cube` (and a bad one), chroma key on real green-screen footage, grain/VHS/glitch at playback speed, performance with 4–6 effects on a real 1080p/4K clip, export opened in QuickTime matches preview, overlays text rendering in the system font, Safari unverified.
- [ ] **Step 3:** Docs and ledger (copy rulings from the SDD ledger), README limits (8 effects per clip, working-size cap, LUT limits, system fonts only, no keyframes yet).
- [ ] **Step 4:** Full gate: `npm test && npm run typecheck && npm run build && npm run e2e && npm run e2e:preview`; `grep -rc __clipforge dist` empty.
- [ ] **Step 5:** Final whole-branch review (fresh reviewer), one themed fix wave, scoped re-review. **Step 6: Commit** `docs,test: effects journey, QA checklist and handoff`. Ask the user before any push or deploy.

## Self-Review notes

- Spec/roadmap coverage (the broader control list is in `2026-11-11-clipforge-roadmap-plans-4-13.md`): blend modes ✓ T11a, adjustment layers ✓ T13a, colour ✓ T4, looks (B&W, sepia, film grain, teal-orange, vignette, Cinematic/Moody/Golden Hour) ✓ T5, `.cube` ✓ T6, blur/sharpen/glow/pixelate ✓ T7, stylise (RGB split, glitch, VHS, mirror, invert) ✓ T8, chroma key ✓ T9, overlays (lower thirds, subscribe, progress bar, stickers) ✓ T12–13, "split compositor/gl first" ✓ T1, data v4 ✓ T2, live preview and identical export ✓ T3/T11. Deferred items are listed in D10.
- Type consistency: `VideoEffectType`/`VideoEffect`/`ParamDef`/`EffectSchema` defined once in T2 and consumed by T3 (`EffectContext`, `PassProgram`), T4–9 (schemas/shaders), T10 (commands). `RenderTarget`/`Draw` defined in T1 and consumed by T3. `workingSize` T3 used by T7's radius scaling.
- Order rationale: the split (T1) and the model (T2) first; pipeline (T3) before any visible effect so every later task is observable; colour (T4) is the reference for the CPU-vs-GL test pattern; LUT (T6) after looks because it needs OPFS/GC changes; UI (T10) after all effects exist so the menu is complete; parity (T11) last in Part A to catch drift once everything is in; overlays (Part B) after a deploy gate because they change the data version.
- Proportion: 16 tasks for a scope the roadmap lists as one line; each task carries exact param ranges and tests, no shader bodies.
