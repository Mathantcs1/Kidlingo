# ClipForge Plan 5 Part 5B: Animation presets and motion (DRAFT, data v7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The decisions in §3 and §14 are adopted as rulings by the controller unless the user objects; record each as a `Ruling:` line in `docs/superpowers/ledgers/plan-5-animation-ledger.md` before Task 1 starts.

**Goal:** Give every picture clip one-click motion on top of the 5A keyframe engine: an animation stack per clip (entrance, emphasis, continuous loop, exit) chosen from a preset browser with animated previews, with editable parameters (duration, delay, direction, distance, intensity, ease); spring easing with stiffness/damping/mass; loop/ping-pong/offset cycles with a count on any keyframed property; curved (spatial Bézier) motion paths edited on the canvas, with orient-along-path; copy/paste of keys and whole animations between clips with size adaptation; and save-as-preset into a personal preset library. Everything is evaluated by the ONE resolver, so preview and export cannot drift. Data moves to **v7**.

**Architecture:** Presets are a small PROCEDURAL layer stored on the clip (`Clip.motion`), not baked keys. Pure maths in `src/core` (`spring.ts`, `keyLoops.ts`, `spatialPath.ts`, `presets.ts`, `presetMath.ts`, `motion.ts`, `animTransfer.ts`; DOM-free). `resolveClip` gains three stages, in one place: (1) keys evaluated with loops and spatial paths (the 5A "base" or "rest" value, extended), (2) orient-along-path added to rotation, (3) preset offsets composed by the blending rule (position and rotation add, scale and opacity multiply). The compositor still calls it once per clip per frame at the top of `collectDraws`; the inspector and handles show and edit the BASE value; previews in the browser are drawn by the same resolver on small Canvas2D tiles. Edits stay pure `(Project, …) => Project`, one `apply` per gesture.

**Tech Stack:** TypeScript strict, React 19, WebGL2 (no new shaders: only uniforms vary), Canvas2D for preset tiles, SVG for the editable motion path, idb-keyval (already a dependency) for the user preset library, Vitest, Playwright with real pixel reads and ffmpeg frame grabs. No new runtime dependency.

**Spec and context:** `docs/superpowers/specs/2026-11-10-clipforge-design.md` line 27 (animation controls: in/out presets pop, slide, spin, drop, whip; Ken Burns; motion paths; copy/paste keyframes); roadmap `docs/superpowers/plans/2026-11-11-clipforge-roadmap-plans-4-13.md` §3 (preset browser, preset parameters, loop control, spring controls, animation transfer, animation blending, save-as-preset, initial presets); the 5A plan `docs/superpowers/plans/2026-11-12-clipforge-plan-5-animation.md` (§2 constraints, §3 D1–D12, §5 "5B Presets and motion" outline, §7 O3/O4/O7/O9/O11); ledger `docs/superpowers/ledgers/plan-5-animation-ledger.md` (P5-1..P5-7, T3..T11 rulings, deferred minors); 5A task reports `docs/superpowers/ledgers/plan-5-task-reports/`.

Branch: `feature/plan-5-animation` (continues after the 5A deploy; production = `c9caebe`, data v6). Baseline at 5A's end: `npm test` 1475 (106 files), full e2e 470/470, `e2e:preview` 1/1.

---

## 1. Decomposition

5B is one deployable part (one data bump, v7). Inside it, the work splits into four independent layers that share only the resolver:

| Layer | What | Data (v7) | Tasks |
|---|---|---|---|
| Key evaluation extensions | spring ease, key loops, spatial Bézier tangents, orient along path | `Ease.spring`, `TransformKeys.loops`/`VideoEffect.loops`, `PositionKeyframe.in/out/broken`, `TransformKeys.orient` | 2, 3, 4, 8 |
| Procedural presets | preset library maths, animation stack, blending rule, clip-operation rules, render integration | `Clip.motion` | 2, 5, 6, 7 |
| Animation transfer | copy/paste keys and whole animations with size adaptation | none (UI clipboard) | 9 |
| User presets | save-as-preset, personal library, favourites | none in the project (IndexedDB library, own schema) | 9 |

Order: preparation → data v7 → pure evaluation (spring/loops, then spatial/orient) → presets (pure, then render) → preset UI → loop/spring/path UI → transfer and user presets → robustness + journey. Pure maths before render so pixel tests have an exact oracle; render before UI so UI tests can read pixels (the 5A order, which worked).

---

## 2. Global Constraints (carried over from 5A, plus 5B specifics)

- TypeScript strict; 2 spaces, single quotes, semicolons; files ≲200 lines. At or near the limit and touched here: `src/ui/EaseEditor.tsx` 200, `src/core/audioEdits.ts` 200, `src/render/compositor.ts` 195, `src/state/store.ts` 193, `src/core/keyframeEdits.ts` 188, `src/core/model.ts` 180, `src/ui/useTransformDrag.ts` 171, `src/ui/Inspector.tsx` 162: split BEFORE extending (Task 1). New CSS goes in a new `src/ui/presets.css` (`animation.css` is 217 lines; `styles.css` 1211).
- `src/core/` stays pure/no DOM. Edits are `(Project, …) => Project`, throw `TimelineError` for user-facing refusals, never mutate input, return the SAME reference for no-ops. Locked tracks refuse every motion, loop, tangent, orient and paste edit.
- One gesture = ONE `apply` = one undo step: choosing a preset, a param slider release, a tangent drag, a key-dot drag, a paste onto several clips, applying a user preset. Drags use local/live state until release. Store-bound commands use `guard(() => apply(...))`. Undo restores the exact previous project (JSON-equal).
- Data **v7**: `CURRENT_VERSION = 7` (model.ts:135, the ONE constant; migrate.ts derives `CURRENT` from it); v1–v6 saves open unchanged (identity for v6 data without the new fields); `{version: 8}` is `newer` ⇒ `unsupported`, never overwritten (persist.ts `classifySaved`). Every new field is optional; absent = 5A behaviour bit for bit.
- **The resolver is the ONLY evaluator.** Pictures are evaluated in `collectDraws` (drawCollect.ts:84) and nowhere else in `src/render`; UI values come from the same core functions (`resolvedTransform` = base, `resolveClip` = drawn). The reader audit (`tests/transform-readers.test.ts`) gains `.motion` / `.loops` / `.orient` and fails on an unlisted reader. Preset tiles call `resolveClip` too.
- **Preview == export**: evaluation is deterministic from (project, t): clip-relative time snapped to the project frame (`snapToFrame`, P5 D3/§3.3), no `Math.random`, no wall clock, closed-form maths only (`Math.exp/sin/cos/pow/atan2/hypot`); "random" presets (shake, jitter) use a seed STORED in the preset params. Export frame N equals preview frame N (parity specs at 25 and 30 fps).
- Static and 5A-only projects render byte-identically (all 470 e2e specs are the oracle; a clip without keys and without `motion` takes the zero-allocation fast path and `resolveClip` returns the same object).
- Geometry in FORMAT px; `Transform.x/y` offsets from the canvas centre, y down, rotation clockwise, scale = source px → canvas px. Preset distances are fractions of the format size (so a format switch needs no rescaling).
- Keep every existing `data-testid`; new controls get the ids in §6. `window.__clipforge` stays DEV-only (`grep -rl __clipforge dist` prints nothing).
- Never delete user media except via the verified-restore GC. The user preset library is never deleted or overwritten when it fails to load or has a newer schema.
- TDD: failing test first; mutation-check every important guard and state in the task report which guard was broken and which test caught it. Commit trailers (blank line before): `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: <current session URL>`.
- Never push or deploy without authorisation (5B deploys only under Ruling P5-2, §10); never touch other Vercel projects; never run `playwright install`; never run two e2e runs at once (port 5173).
- Gate per task: `npm test && npm run typecheck && npm run build` + `grep -rl __clipforge dist` empty + touched e2e specs, run one at a time; full `npm run e2e -- --trace off` at Tasks 1, 6, 8, 9, 10; `npm run e2e:preview` before the deploy.

---

## 3. Decisions (rulings proposed; rationale and cost if wrong)

- **D1 Representation: procedural layer, not baked keys.** A preset is stored as `Clip.motion.<slot> = PresetUse` (preset key + duration + delay + ease + params) and evaluated on the fly. Rationale: timing stays relative to the clip's edges (an exit stays at the end after a trim; the user's own keys are untouched); units are format-relative (survives reframe with no code); params stay editable after the fact (change direction or duration in one step); data is tiny (≈150 bytes per slot vs ≈55 bytes per key per frame); presets and keys coexist without one rewriting the other. Baking would make every trim, split and reframe a key edit and lose "change the slide direction". Cost if wrong: users who want to fine-tune a preset key by key need a "Convert to keyframes" action (sample the preset into ≤ 500 keys per property, one apply): about one task, deferred (§14 Q9).
- **D2 Animation stack: four slots per clip, one preset each.** `in` (entrance), `emphasis` (one-shot), `loop` (continuous), `out` (exit). Timing, all on the clip's own frame grid `s = snapToFrame(t − clip.start, fps)`, `D = clipDuration(clip)`:
  - `in`: progress `p = (s − delay) / duration`, active for `p < 1`; before `delay` the clip shows the preset's start state (a fade-in with a delay is invisible until it starts). Frame 0 shows exactly the start state (`p = 0`).
  - `out`: ends at the clip end: `p = (s − (D − delay − duration)) / duration`; after its end (`s ≥ D − delay`) the end state holds. The end state itself is reached exactly at the clip end (the first frame after the clip), like a key at the end edge.
  - `emphasis`: a one-shot window at a stored LOCAL time `at` (source-anchored exactly like a key, 5A D3: `local = in + s` for sourced clips), duration `duration`; identity outside its window.
  - `loop`: whole clip, phase anchored to local time: `τ = (localTime(clip, t, fps) + phase) / period`; `count` optional (null = until the clip ends). The `kenBurns` preset is a `loop`-slot "span" preset whose progress is `s / D` over the visible clip (it does not repeat).
  - Short clips: when `in` and `out` windows (with delays) overlap, both are scaled by `D / (din + delayIn + dout + delayOut)` AT EVALUATION (stored values are kept, so extending the clip restores them).
  Cost if wrong: more slots (e.g. two emphases) = an array per slot in a later bump; the four-slot UI is the common editor model (Keynote/Canva/CapCut).
- **D3 Animation blending (combination rule).** `drawn = compose(base, Σ presets)`: position offsets ADD (format px = fraction × format width/height), rotation offsets ADD (degrees, about the clip centre; 5E's anchor later), scale factors MULTIPLY, opacity factors MULTIPLY; the operations are commutative, so slot order never matters; clamps once at the end (opacity 0..1, scale ≥ 0, NaN-safe). `base` is the 5A value (static or keyed, now with loops, spatial path and orient). Presets never touch effect params in 5B. The inspector fields and on-canvas handles show and edit the BASE ("rest") transform; the canvas shows the drawn picture and, when it differs at the playhead, a faint outline of it (`motion-ghost`), so a slide-in at frame 0 is edited where it lands, not off-screen. Cost if wrong: an "override" rule (preset replaces the keyed value inside its window) is one function swap in `motion.ts`; showing the drawn value in the fields would need write-back maths that does not exist for multiplicative stacks.
- **D4 Key loops.** Per animated target `KeyLoop { mode: 'repeat' | 'pingPong' | 'offset'; count: number | null }` (count = cycles after the first, integer 1..1000; null = until the clip end). Applies after the last key; before the first key the first value holds (no loop-in in 5B). Period = `last.t − first.t`; a target with < 2 keys or a period < 1 frame ignores its loop. `offset` adds `cycle × (last − first)` (endless spin from 0→360 keys; position offsets add per axis). Stored next to the keys (5A D2 principle): `TransformKeys.loops?: Partial<Record<TransformProp, KeyLoop>>`, `VideoEffect.loops?: Record<param, KeyLoop>`; removing a target's last key or turning its stopwatch off removes its loop. Loops evaluate in local time, so moves/trims change nothing; a looped target is NOT partitioned by split (both halves keep its full list, shifted for sourceless right halves) because evaluation beyond the last key reads the whole list. Cost if wrong: loop-in/pre-cycles is an extra `mode` value later.
- **D5 Spring easing (O3).** New ease kind `{ kind: 'spring', spring: { stiffness, damping, mass } }` (stiffness 1..1000 N/m-like, damping 0..100, mass 0.1..10; defaults 170/26/1 ≈ snappy, presets Gentle 120/14/1, Snappy 170/26/1, Bouncy 180/12/1, Wobbly 180/8/1). Evaluated in CLOSED FORM (damped harmonic oscillator: under-, critically and over-damped branches) in physical SECONDS over the segment's real duration, so the same spring feels the same on a 0.5 s and a 2 s segment: `x(τ)` with `ω0 = √(k/m)`, `ζ = c / (2√(km))`; `easeAt(e, u, seconds)` = `x(u·S) + u·(1 − x(S))` (linear endpoint correction: exactly 0 at u = 0, exactly 1 at u = 1, continuous; tiny when the spring has settled by the segment end). `easeAt` gains an optional `seconds` argument (default 1) that only `spring` reads; `valueAt` passes `keys[i+1].t − keys[i].t`. Overshoot is clamped per property (5A D5). No fixed-step integration, so no dt-dependent drift between 25/30/60 fps or preview/export. The ease editor shows the spring curve for the selected segment's duration and warns when the spring needs longer than the segment to settle (`|1 − x(S)| > 0.02`). Cost if wrong: a fixed-step integrator would need a fixed internal dt table; same API.
- **D6 Spatial Bézier motion paths.** `PositionKeyframe` gains optional `in?: {x, y}` and `out?: {x, y}` tangent offsets (format px, relative to the key) and `broken?: true` (tangents move independently; default smooth: dragging one mirrors the other's DIRECTION, keeping its length). A segment whose ends have no tangents (`a.out` and `b.in` absent or zero) is the 5A straight line computed by the 5A code path (byte-identical). A curved segment is the cubic Bézier `a, a + a.out, b + b.in, b`; the temporal ease maps to ARC LENGTH through a fixed 32-sample table per evaluation (deterministic; linear ease = constant speed, the After Effects behaviour). New keys get no tangents; "Smooth path" (`mp-smooth`) sets Catmull-Rom tangents on all position keys in ONE apply; Alt-drag a dot's tangent handle breaks it; double-click a key dot toggles corner/smooth. Cost if wrong: parametrising by Bézier t instead of arc length makes speed uneven along curves; a one-function change.
- **D7 Orient along path.** `TransformKeys.orient?: true` (only with ≥ 2 position keys): drawn rotation += path heading at the evaluated time, `atan2(dy, dx)` in degrees of the path derivative (y down ⇒ clockwise, matching `Transform.rotation`); heading 0 = moving right. A zero derivative (cusp, hold, before the first or after the last key) uses the segment chord, then the nearest non-degenerate segment, else 0, so the picture never snaps to 0 mid-path. Rotation keys still add (a tilt on top of the heading). It is part of the base value (the rotation field shows keyed rotation + heading; editing rotation writes the keyed/static rotation, the heading stays derived). Cost if wrong: the "picture faces up" convention (heading −90) is a constant.
- **D8 Copy/paste and animation transfer.** An in-memory animation clipboard (UI state, not saved, not history, cleared on New project). Two scopes:
  - **Keys:** Ctrl/Cmd+C with timeline keys selected (or `kf-copy`) copies those keys (every target at the selected times, tangents/eases included). Ctrl/Cmd+V (or `kf-paste`) pastes into every selected clip at the playhead: the earliest copied key lands on the playhead's frame, relative timing kept; pasted keys replace a key in the same frame window (P5-6); targets the destination cannot take are skipped and counted in one toast.
  - **Whole animation:** `anim-copy` / `anim-paste` copy every key list, loops, orient and the motion stack; paste REPLACES the destination's animation, keys anchored at the visible start (source local `lo` → destination local `lo`).
  - **Size adaptation:** scale keys × `fitScale(dest) / fitScale(source)` where `fitScale` = `fitTransform(media size, format, clip.fit).scale` (overlays: base-size ratio of their types; adjustment clips: none); position keys and tangents stay in format px (same canvas); motion params are already relative. Effect keys go to the destination's effect of the same TYPE and occurrence (first colour → first colour); missing ⇒ skipped (toast). Kind filters: adjustment ⇒ opacity only; overlay ⇒ transform only; audio ⇒ nothing. Ctrl/Cmd+C/V inside text fields stay native (`isTextEntry`), and with nothing to copy/paste the event is not prevented (Plan 7 clip copy can claim it later). Multi-clip paste = ONE apply; `MAX_KEYS` refusal as in 5A. Cost if wrong: relative position pasting (offset from the destination's rest position) is a flag on the payload.
- **D9 Save-as-preset storage: a personal library in IndexedDB, copied into clips on use.** Key `clipforge:presets` (idb-keyval, the store `persist.ts` already uses), record `{ version: 1, presets: UserPreset[], favourites: PresetRef[] }` with its own migration: a newer or malformed record is shown read-only and NEVER overwritten (same rule as projects). A user preset is a whole-animation snapshot (D8 payload) + name (1–40 chars) + category (`in`/`emphasis`/`loop`/`out`/`custom`); position keys are stored relative to the first position key and applied relative to the destination's rest position (a saved "slide" works on any clip); keys of `out` presets are anchored to the clip END. Applying COPIES the content into the clip (the project never references a library id), so projects stay self-contained and portable, deleting a preset changes no project, and project data needs nothing new. Cap: 100 presets, 64 kB each. Library export/import as a file is deferred to Plan 11/12 (library manager, portable package). Cost if wrong: in-project presets would need `Project.presets` in a later bump (cheap) but vanish on New project (the app keeps one project at a time, persist.ts:5 `clipforge:current`), which is why the library is cross-project.
- **D10 Preset browser with animated previews.** A popover per slot (`preset-browser`): category tabs (Entrance, Emphasis, Continuous, Exit, My presets, Favourites), a search field (label and synonyms, case-insensitive), a star per tile (favourites in the library record), and tiles whose previews are drawn on a small Canvas2D (120×68 CSS px × DPR) by the SAME resolver: a synthetic card clip (16:9 rounded rectangle at 60 % of the tile) with the preset applied is `resolveClip`ed at the tile's time and its corners come from `clipCorners` (the handles' geometry), so a tile shows exactly what the clip will do, without video decode and without WebGL contexts (one context per tile would exceed browser limits). Only the hovered/focused/selected tile animates (one shared rAF loop, 30 fps, preview loop of the preset's window plus 0.4 s rest); others show a still at their most telling frame; `prefers-reduced-motion` shows stills only. Cost if wrong: thumbnails of the user's actual frame need decode; deferred.
- **D11 Ken Burns in log space (O9).** `kenBurns` interpolates its zoom factor in log space, `f(p) = z0·(z1/z0)^p` (perceptually even), pan linear in format fractions, default ease `linear` (a continuous drift); params zoom start/end (0.5..3, default 1 → 1.2), pan direction (8 directions) and distance (0..0.5). 5A key interpolation stays linear (unchanged).
- **D12 Clip operations.** `motion` follows the clip: move/ripple/join/move to another track ⇒ unchanged; trim ⇒ `in`/`out` follow the edges by construction; `emphasis.at` and `loop.phase` follow 5A D3 (sourced: footage-anchored, unchanged; sourceless start trim by Δ ⇒ `at −= Δ`, `phase += Δ`); split ⇒ left half keeps `in`, `emphasis` (if its window starts in the left half), `loop`; right half keeps `out`, `emphasis` (if its window starts in the right half), `loop` (sourceless right half: `phase += cut offset`, `at −=` cut offset); a split inside an entrance window leaves the right half starting at rest (accepted discontinuity, like Plan 4 time-based effects; the left half is frame-exact); `reframeProject`/`reframeOverlay` ⇒ motion unchanged, tangents scale like x/y; `setClipFit`/Reset transform ⇒ keys as in 5A, motion KEPT (it has its own Remove buttons); `detachAudio` ⇒ twin gets no motion; merge-all ⇒ baked into pixels; key loops never partitioned by split (D4). Cost if wrong: one rule per operation in `motionEdits.ts`.
- **D13 Targets per clip kind.** Video, image, overlay: every preset. Adjustment: only presets that touch opacity alone (Fade, Flash, Blink-loop); the browser greys out the rest. Audio: none (Plan 9 owns volume automation). Overlay lower thirds: a lower third with an `in` preset turns OFF its built-in slide-in at the start, one with an `out` preset turns off the slide-out at the end (Ruling T13-2 otherwise unchanged), so the two never stack.
- **D14 Limits and repair (migration v7).** Preset `duration` 0.05..30 s, `delay` 0..30 s, loop `period` 0.1..60 s, params clamped to the preset's schema, unknown preset key or slot ⇒ slot dropped, ease repaired (`repairEase` extended for `spring`: non-finite ⇒ defaults, clamped), `count` integer 1..1000 or null, tangents finite and within ±`KEYED_POSITION_LIMIT`, `broken`/`orient` booleans (anything else dropped), `emphasis.at` finite. Adjustment clips keep only opacity-only presets; audio clips lose `motion`; loops of absent targets dropped.
- **D15 Not in 5B:** per-letter/word stagger and typewriter (Plan 6 text, O7); drawn-path presets (Plan 8 masks); effect-parameter presets (blur-in, glitch-in), motion blur; loop-in/pre-cycles; a multi-key value-graph editor (O4); "Convert preset to keyframes" (bake); dragging timeline preset bands to resize; preset library export/import; thumbnails of the actual clip; anchor point (5E); speed/transitions (5D/5C); audio presets.

---

## 4. Audited code sites (read at `02e943a`)

| Site | What changes |
|---|---|
| `src/core/model.ts:80-102` (Clip), `:135` (`CURRENT_VERSION = 6`), `:3-5` | `Clip.motion?: ClipMotion` (types in a new `motionTypes.ts`), `CURRENT_VERSION = 7`; split the type block first if > 200 |
| `src/core/keyTypes.ts:14-28` | `PositionKeyframe.in?/out?/broken?`, `TransformKeys.loops?/orient?`, `KeyLoop` |
| `src/core/easing.ts:5-13, 32-59, 64-77, 79-86` | `'spring'` kind + `spring` params, `easeAt(e, u, seconds = 1)`, `repairEase` for spring, `isSameEase` compares spring params |
| `src/core/keyframes.ts:83-87` (`fraction`), `:94-102` (`valueAt`), `:105-116` (`positionAt`), `:118-123` (`maxScale`) | segment seconds passed to `easeAt`; `positionAt` delegates curved segments to `spatialPath.ts` (straight path unchanged); `maxScale` × the motion's maximum scale factor |
| `src/core/animate.ts:32-44` (`resolvedTransform`), `:47-57` (`resolveEffect`), `:64-74` (`resolveClip`), `:22-26` (`isAnimated`) | loops (D4) + orient (D7) in the base; `resolveClip(clip, t, format)` adds motion (D3); fast path also checks `motion` |
| `src/core/keyLists.ts:10` (`copyKey`), `:26-35` (`splitKeys`), `:41-54` (`mapTransformKeys`), `:61-64`, `:87-101` (`upsertKey`) | deep-copy tangents; split keeps full lists for looped targets; `mapTransformKeys` carries `loops`/`orient` |
| `src/core/animTargets.ts:70-75` (`valueAtLocal`), `:82-100` (`withTargetKeys`), `:118-125` (`animatedTargets`) | looped value at the playhead; removing a target's keys removes its loop; `animatedTargets` unchanged |
| `src/core/keyframeEdits.ts:79-89` (`setAnimated` off ⇒ drop loop), `:142-151` (`removeKeys` last key ⇒ drop loop), `:158-172` (`moveKeys` keeps tangents) | loop lifecycle; file is 188 lines ⇒ new edits go to `loopEdits.ts`, `pathEdits.ts` |
| `src/core/migrate.ts:78-81` (`toClip`), `:124-140` (`migrateProject`); `src/core/migrateKeys.ts:36-43, 49-62, 65-74`; `src/core/migrateEffects.ts` | v7: repair tangents, loops, orient, spring eases, effect loops; new `migrateMotion.ts` for `motion` |
| `src/core/clipEdits.ts:27-48` (trim), `:51-81` (split, halves at 69-74) | motion split/trim rules (D12), looped targets not partitioned (D4) |
| `src/core/audioEdits.ts:101` (twin `...clip`) | twin without `motion` (file at 200 lines: split first) |
| `src/core/reframeKeys.ts:12-23` (`scaleFramingKeys`) | tangents scale ·rx/·ry |
| `src/core/transformEdits.ts:43-82` (Reset/`setClipTransform`), `src/ui/edits.ts:103-118` (`setClipFit`) | motion kept (D12); loops/orient follow the 5A key removal of position/scale |
| `src/core/overlays.ts:107` (`reframeOverlay`), `src/render/overlays/draw.ts:27-34` (`overlayAnimation`), `src/render/overlays/textures.ts:92-100` | built-in slide off at an edge with a preset (D13): `get` receives `builtIn: { in, out }` in the texture key |
| `src/render/drawCollect.ts:84` (resolve), `:94` (`maxScale(raw)`) | `resolveClip(raw, t, p.format)`; texture scale includes motion's maximum factor |
| `src/render/visible.ts` | unchanged (hidden tracks are skipped before resolution) |
| `src/ui/TransformFields.tsx:71`, `TransformOverlay.tsx:54`, `useTransformDrag.ts:72` | keep `resolvedTransform` (BASE, D3) and pass segment seconds through; TransformOverlay draws the `motion-ghost` from `resolveClip` |
| `src/ui/motionPathMath.ts:57-91` (`sampleMotionPath` uses `positionAt`), `:95-111` (cache signature), `MotionPath.tsx` (98) | sample the spatial curve; cache key includes tangents (new arrays on edit); dots become draggable; tangent handles |
| `src/ui/EaseEditor.tsx` (200), `EaseCurve.tsx` (128), `easeEditorMath.ts` (98) | spring preset + three fields: split `EasePanel` first |
| `src/ui/KeyframeControls.tsx` (145) | loop control per animated target (`KeyLoopControl.tsx`, new) |
| `src/ui/Inspector.tsx:125-127` | `<AnimationInspector>` after `TransformFields` for picture/overlay/adjustment clips |
| `src/ui/ClipView.tsx:26-77` | `MotionBands` (new) for clips with `motion` |
| `src/ui/keys.ts:3, 63-78` (`Shortcut`, `shortcutFor`), `src/ui/shortcutCommands.ts`, `src/ui/useShortcuts.ts:40-60` | `copyAnim`/`pasteAnim` (Ctrl/Cmd+C/V), not prevented in text entry or with nothing to do |
| `src/ui/keySelection.ts:53` (`selectedRefs`) | source of the keys payload |
| `src/state/persist.ts` | unchanged; new `src/state/presetLibrary.ts` beside it (same idb-keyval, own key and schema) |
| `tests/transform-readers.test.ts` (130) | allowlist entries for `motion`/`loops`/`orient` readers |
| `tests/helpers/project.ts` | `CURRENT_VERSION` already central (5A Task 1): the bump touches one constant |

---

## 5. Data model sketch (v7) and migration

```ts
// src/core/easing.ts
export type EaseKind = 'linear' | 'hold' | 'easeIn' | 'easeOut' | 'easeInOut' | 'back' | 'elastic' | 'bounce' | 'bezier' | 'spring';
export interface SpringParams { stiffness: number; damping: number; mass: number }
export interface Ease { kind: EaseKind; bezier?: [number, number, number, number]; /** only 'spring' */ spring?: SpringParams }

// src/core/keyTypes.ts (additions)
export interface Vec { x: number; y: number }
export interface PositionKeyframe { t: number; x: number; y: number; ease: Ease; in?: Vec; out?: Vec; broken?: true }
export type LoopMode = 'repeat' | 'pingPong' | 'offset';
export interface KeyLoop { mode: LoopMode; count: number | null }
export interface TransformKeys {
  position?: PositionKeyframe[]; scale?: Keyframe[]; rotation?: Keyframe[]; opacity?: Keyframe[];
  loops?: Partial<Record<'position' | 'scale' | 'rotation' | 'opacity', KeyLoop>>;
  orient?: true;
}
// VideoEffect (model.ts): loops?: Record<string, KeyLoop>

// src/core/motionTypes.ts (new)
export type MotionSlot = 'in' | 'emphasis' | 'loop' | 'out';
export type PresetKey =
  | 'fade' | 'slide' | 'zoom' | 'pop' | 'spin' | 'drop' | 'whip' | 'rise'          // in / out (mirrored)
  | 'pulse' | 'shake' | 'wobble' | 'flash' | 'hop' | 'spin360'                    // emphasis
  | 'breathe' | 'float' | 'spinLoop' | 'jitter' | 'blink' | 'kenBurns';           // loop
export interface PresetUse { preset: PresetKey; duration: number; delay: number; ease: Ease; params: Record<string, number> }
export interface EmphasisUse extends PresetUse { at: number }       // clip-local time (5A D3)
export interface LoopUse extends PresetUse { phase: number }        // duration = period; delay unused (0)
export interface ClipMotion { in?: PresetUse; emphasis?: EmphasisUse; loop?: LoopUse; out?: PresetUse }
// Clip (model.ts): motion?: ClipMotion   (absent = no presets)
export interface Project { version: 7; /* … */ }
```

Preset params are numbers (enums as integers): `direction` 0..7 (left, right, up, down, and four diagonals for Ken Burns), `distance` (fraction of format width/height), `intensity` (0..1 or a preset-specific range), `from` (zoom start factor), `turns`, `seed` (integer, set once when the preset is chosen). Each preset definition (`src/core/presets.ts`) declares `slots`, `opacityOnly`, a `ParamDef[]` schema (min, max, step, default; the Plan 4 `ParamDef` type) and a default ease.

**Migration v6 → v7** (`migrate.ts` accepts integer versions 1..7; `{version: 8}` ⇒ `newer`): identity for every v6 save (none has the new fields); `toClip` also runs `repairMotion(c.motion, kind)` (new `migrateMotion.ts`) and `repairClipKeys` repairs tangents, `broken`, `loops`, `orient`; `repairEffectKeys` repairs effect `loops`; `repairEase` repairs `spring`. All per D14. Idempotent, never mutates input; a v7 save re-migrates to itself (JSON-equal).

---

## 6. Resolver extension

```ts
// src/core/animate.ts
export function resolvedTransform(clip, t, fps): Transform      // BASE: keys (+ loops D4, spatial path D6, orient D7); 5A when none
export function resolveClip(clip, t, format: { width; height; fps }): Clip   // DRAWN: base ∘ motion (D3); same object when static
// src/core/motion.ts
export function motionAt(clip, t, format): MotionOffsets | null  // null when no slot is active at t (allocation-free)
export interface MotionOffsets { dx: number; dy: number; drot: number; kScale: number; kOpacity: number }
export function composeMotion(base: Transform, o: MotionOffsets): Transform  // add/add/mul/mul, then clamp once
export function maxMotionScale(clip): number                      // upper bound of kScale over the stack (texture sizing)
```

- Key evaluation goes through ONE function per kind: `evalKeys(list, loop, u, min, max, seconds-aware)` in `keyLoops.ts` (numeric) and `evalPosition(list, loop, u)` in `spatialPath.ts`; `resolvedTransform`, `resolveEffect` and `animTargets.valueAtLocal` all call them (so the inspector shows looped values).
- `resolveClip` signature change: its one render caller (drawCollect.ts:84) passes `p.format`; tests and tiles pass a format. Task 1 makes the change behaviour-preserving.
- Fast path: `!isAnimated(clip) && clip.motion === undefined` ⇒ return `clip`. `motionAt` returns null outside every active window (a clip with only an `in` preset is static after it), and `resolveClip` then returns the keys-only result.
- Overlay textures: `maxScale(raw) × maxMotionScale(raw)` so a Pop's 1.15 overshoot or Zoom-from-2 stays sharp and the texture is never re-uploaded per frame (the 5A Task 5 stats guard extended).

---

## 7. UI design

- **Inspector "Animation" section** (`AnimationInspector.tsx`, `anim-section`), after Position and size, for video/image/overlay/adjustment clips: four slot rows `anim-slot-in`, `anim-slot-emphasis`, `anim-slot-loop`, `anim-slot-out`, each showing the chosen preset's name or "None", a choose button `anim-choose-<slot>` (opens the browser), remove `anim-remove-<slot>` (one apply), and when set its params: `anim-<slot>-duration`, `anim-<slot>-delay` (in/out), `anim-emphasis-at` ("at playhead" button `anim-emphasis-here`), `anim-<slot>-<param>` sliders/selects (direction as a 4- or 8-button segmented control `anim-<slot>-direction`), `anim-<slot>-ease` (opens the ease editor in "preset" mode). Each slider commits on release (one apply), like 5A's ParamSlider. Locked track ⇒ disabled with the lock hint. Footer buttons: `anim-copy`, `anim-paste`, `preset-save` (Save as preset…).
- **Preset browser** (`PresetBrowser.tsx`, popover anchored to the slot; `preset-browser`): `preset-search`, category tabs `preset-cat-in|emphasis|loop|out|mine|favourites`, tiles `preset-tile-<key>` (user presets `preset-tile-user-<id>`) each with a canvas `preset-preview-<key>` and a star `preset-fav-<key>`; Enter/click applies (ONE apply, popover closes, focus returns to the slot button); arrow keys move between tiles (roving tabindex: ONE tab stop for the grid, unlike the 5A dot list); Escape closes without change. "My presets" tiles have delete `preset-user-delete-<id>` (confirm dialog; library only, no undo, no project change) and rename. Disabled tiles carry `aria-disabled` and a reason title (adjustment layers: "Adjustment layers only fade").
- **Save as preset** (`SavePresetDialog.tsx`, `preset-save-dialog`): name `preset-save-name`, category `preset-save-category`, save `preset-save-confirm`; refuses an empty/over-long name and a full library with a toast; saving writes the library, not the project (no undo step).
- **Timeline bands** (`MotionBands.tsx` in ClipView): for every clip with `motion`, a translucent ramp at the start (`motion-band-in`, width = in window), at the end (`motion-band-out`), a tick for emphasis (`motion-band-emphasis`) and a thin striped line for a loop (`motion-band-loop`); `pointer-events: none` (never steals clip drags/trims); clicking the clip and its slot in the inspector is the edit path. Key diamonds unchanged.
- **Key loops** (`KeyLoopControl.tsx` in each animated KeyframeControls row): select `kf-loop-<prop>` / `fx-<effectId>-<param>-loop` (None, Repeat, Ping-pong, Continue (offset)), count field `kf-loop-count-<prop>` ("∞" when empty); ONE apply each; hidden for < 2 keys.
- **Spring in the ease editor:** preset button `ease-preset-spring`, spring preset chips `ease-spring-gentle|snappy|bouncy|wobbly`, fields `ease-spring-stiffness`, `ease-spring-damping`, `ease-spring-mass` (commit on Enter/blur), the curve drawn for the selected segment's duration, a note `ease-spring-note` when it does not settle in time. Mixed selections (segments of different lengths) draw the first segment's curve (stated in the note).
- **Motion path editing** (MotionPath.tsx, TransformOverlay): key dots `motion-key` become draggable (4 px threshold; drag moves that key's x/y, live preview via a `withLivePath` twin, ONE apply on release; click still seeks); the key under the playhead shows tangent handles `motion-tangent-in` / `motion-tangent-out` (drag = ONE apply; Alt-drag breaks; double-click the dot toggles corner/smooth `data-corner`); toolbar chip on the overlay `mp-smooth` (Catmull-Rom all keys, ONE apply) and an inspector toggle `kf-orient` (Orient along path, ONE apply). Locked track: path visible, no drag. The ghost outline `motion-ghost` (dashed, 40 % opacity) shows where the picture is drawn when presets move it away from the handles.
- **Keyboard:** Ctrl/Cmd+C copies selected keys (timeline selection) or nothing; Ctrl/Cmd+V pastes the clipboard payload into the selected clips at the playhead; both ignored in text entry and range/colour inputs (`shortcutBlockedByRange` extended); the browser grid uses arrows/Enter/Escape and swallows global shortcuts while focused (EaseEditor pattern).

---

## 8. Test strategy

- **Pure Vitest:** spring closed form vs a 1e-5-step RK4 reference (|error| < 1e-6 at 200 points for 12 parameter sets incl. ζ = 0, ζ = 1 exactly, ζ > 1), exact endpoints, physical-time invariance (same τ value on a 0.5 s and 2 s segment within the correction); loops (repeat/pingPong/offset, count boundaries, < 2 keys inert, before first key holds, offset on position); spatial path (straight segments bit-identical to 5A `positionAt`, Bézier endpoint exactness, arc-length speed constancy under linear ease within 1 %, tangent repair); orient heading (straight line = atan2, cusp fallback, hold); every preset: exact identity at rest, exact start/end states, params at min/max, opacity-only flags; blending: commutativity (all slot permutations equal), clamps, keyed base + presets; motion clip-op rules (split/trim/move/reframe property tests: frames inside each half equal the original where D12 says, a split inside an entrance window documented by an explicit test); migration v6→v7 identity, v7 repair of every malformed case in D14, `{version: 8}` newer; transfer (size adaptation ratios, effect matching, kind filters, refusals, same-reference no-ops); library record migration and the never-overwrite rule (fake idb).
- **Playwright through the real compositor** on solid-colour fixtures: Fade In mean pixel at 25/50/75 % of the window (±2/255 of the predicted value), Slide In centroid at three frames (±1 px), Pop scale bounding box including the overshoot frame, Spin corners, Ken Burns log zoom (scale at p = 0.5 equals √(z0·z1) ±0.5 %), spring and loops on keys (pixel matches the core value), curved path centroid on the Bézier (±1.5 px) and orient (corner positions), adjustment-layer Fade, overlay lower third with an In preset has no built-in slide (pixel at the slide-in frame), texture upload count unchanged across 10 frames with Pop/Zoom.
- **Parity:** export 1080p and 320 px of a stack (keys with spring + loop + curved path + orient + in/emphasis/loop/out presets + a colour key) at 30 and 25 fps; ffmpeg frame N vs preview frame N (mean abs diff < 3/255 at 1080p per Ruling T11-2; frame-for-frame hash equality at 320 px); a between-frame playhead equals the frame start.
- **UI specs:** one undo step per gesture (history length) and project JSON after undo for every new control; browser search/categories/favourites/keyboard; animated tile pixel changes between two rAF frames on hover and is still without hover and under reduced motion; save/rename/delete preset survives reload; library with `{version: 2}` is read-only and untouched (IndexedDB bytes equal after a session); Ctrl/Cmd+C/V in a text field copies text (native) and does not paste keys.
- **Mutation checks** (recorded per task): spring endpoint correction removed; loop count off by one; split partitioning looped lists; straight-path fallback removed (byte-identical guard fails); blending order-dependent (commutativity test fails); built-in slide not disabled; resolver fast path always copying; library overwrite on newer schema; paste without size adaptation.
- The existing 1475 unit and 470 e2e tests are the oracle that 5A and static projects are unchanged.

---

## 9. Performance and memory notes

- Per clip per frame: keys O(properties × log keys) as in 5A; a curved position segment adds 32 Bézier evaluations (≈1 µs); motion adds ≤ 4 slot evaluations (closed-form, no allocation when inactive). Guard: the 5A resolver budget (best-of-9 < 0.2 ms for 16 clips × 6 properties × 500 keys, Ruling T11-1) must still hold with every clip also carrying a curved path and four presets (≤ 2× the 5A measurement, reported).
- No shader changes, no recompiles; overlays keep one texture each (sized by `maxScale × maxMotionScale`).
- Preset tiles: Canvas2D only, ≤ 30 tiles, one rAF loop, only one tile animated at a time; tiles unmount with the popover (no background work). No WebGL contexts, no decode.
- Motion path sampling stays memoised on the position list (tangent edits create a new list); sample cap 2 000 unchanged.
- Data: ≈150 B per preset slot, ≈40 B per tangent pair, ≈40 B per loop; library ≤ 100 × 64 kB = 6.4 MB worst case, typical < 100 kB.
- The animation clipboard holds plain JSON (bounded by `MAX_KEYS` per target).

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Users expect the inspector to show the drawn (preset-moved) value | D3 "rest value" rule stated in the UI (fields labelled by the section, ghost outline on canvas); manual QA item |
| Presets and keys combine surprisingly | commutative blending + property tests; Remove buttons per slot |
| Spring looks wrong on short segments | physical-time evaluation + endpoint correction + "does not settle" note |
| A looped list partitioned by split changes the picture | D4 rule + split property test with loops (mutation-checked) |
| Curved paths break 5A byte-identity | straight segments take the unchanged 5A code path; explicit byte/hash test |
| Lower thirds animate twice | D13 built-in slide switched off at the edge with a preset (pixel test) |
| Preset tiles cost CPU while the inspector is open | one animated tile, rAF only while the popover is open, reduced motion |
| Library lost or clobbered | own schema version, never-overwrite on newer/malformed, writes only on explicit save/delete/favourite |
| Ctrl/Cmd+C/V steal native copy | text-entry and nothing-to-do pass-through tests |
| One-way v7 data after deploy | P5-2 gate; older tabs show "saved by a newer version" and protect the data |
| Plan 4 and 5A manual QA still unrun | run Plans 4, 5A and 5B checklists together on a real Mac before or right after the 5B deploy |

---

## 11. Model choices

| Task | Implementer | Task reviewer | Why |
|---|---|---|---|
| 1 Preparation | sonnet | sonnet | mechanical splits, signature change, oracle = existing suites |
| 2 Data v7 + migration | opus | opus | data safety, every later task consumes the types |
| 3 Spring + key loops | opus | opus | closed-form maths, split exactness, resolver core |
| 4 Spatial paths + orient | opus | opus | arc-length maths, byte-identity of straight paths |
| 5 Preset library + blending + clip-op rules (pure) | opus | opus | semantics of every preset, D12 rules |
| 6 Render integration + parity | opus | opus | compositor, overlay textures, built-in slide, parity |
| 7 Animation inspector + preset browser + bands | opus | sonnet | large UI, gestures, Canvas2D tiles |
| 8 Loop/spring UI + on-canvas path editing | opus | opus | drag lifecycle, live == commit |
| 9 Transfer + save-as-preset library | opus | opus | size adaptation, IndexedDB safety, shortcuts |
| 10 Robustness, journey, docs, QA | sonnet | sonnet | final review: opus |

Scoped re-reviews of fix rounds: sonnet. Final whole-part review: opus (fresh).

---

## 12. Tasks

### Task 1: Preparation (behaviour-preserving)

**Files:** split `src/ui/EaseEditor.tsx` (extract `EasePanel` into `EasePanel.tsx`), `src/core/audioEdits.ts` (move `detachAudio`/attach helpers into `src/core/detachAudio.ts`, re-exported), `src/core/keyframeEdits.ts` (move `selection`/`commitClip` helpers into `src/core/keyEditHelpers.ts` if needed for room), `src/ui/useTransformDrag.ts` (extract the stale-drag check), `src/ui/Inspector.tsx` (extract `VolumeControl`/`FitControl` into `ClipBasics.tsx`); change `resolveClip(clip, t, fps)` to `resolveClip(clip, t, format)` (drawCollect.ts:84 and tests); `easeAt(e, u, seconds = 1)` signature (unused argument for now) with `valueAt`/`positionAt` passing segment seconds; tests updated.

**Interfaces:**
- Produces: `resolveClip(clip: Clip, t: number, format: { width: number; height: number; fps: number }): Clip` (same results); `easeAt(e: Ease, u: number, seconds?: number): number` (same results); all re-exports kept; no behaviour change.

- [ ] **Step 1:** Baseline: `npm test` (1475) and full `npm run e2e -- --trace off` (470); record counts.
- [ ] **Step 2:** Move code only; every file ≤ 200 lines; reader-audit allowlist updated for moved readers.
- [ ] **Step 3:** Gate + full e2e ⇒ identical counts. **Step 4: Commit** `refactor: prepare for Plan 5B (file splits, resolver takes the format)`.

### Task 2: Data model v7 and migration

**Files:** create `src/core/motionTypes.ts`, `src/core/migrateMotion.ts`, `tests/migrate-v7.test.ts`, `tests/e2e/presets-migration.spec.ts`; modify `src/core/model.ts` (`Clip.motion?`, `VideoEffect.loops?`, `CURRENT_VERSION = 7`), `src/core/keyTypes.ts` (tangents, `broken`, `KeyLoop`, `loops`, `orient`), `src/core/easing.ts` (`spring` kind + `SpringParams` type, `repairEase`, `isSameEase`; maths come in Task 3: until then `easeAt` treats spring as linear and a test pins that temporary rule), `src/core/migrate.ts` (`toClip` runs `repairMotion`), `src/core/migrateKeys.ts` (tangents/loops/orient), `src/core/migrateEffects.ts` (effect loops), `tests/migrate.test.ts`.

**Interfaces:**
- Consumes: 5A types; `repairEase`, `KEYED_POSITION_LIMIT`, `MAX_KEYS`.
- Produces: the §5 types; `repairMotion(raw: unknown, kind: Clip['kind']): ClipMotion | undefined` (D14; preset schema lookup through a minimal `PRESET_SCHEMA` table in `presets.ts` stubbed with the final keys and param ranges, filled with maths in Task 5); `repairLoop(raw): KeyLoop | undefined`; `repairTangent(raw): Vec | undefined`; migration v6→v7 identity; `{version: 8}` ⇒ `newer`.

- [ ] **Step 1: Failing tests:** v6 project of every clip kind ⇒ v7 JSON-equal except `version`, input not mutated, idempotent; hand-edited v7: unknown preset/slot dropped, durations/delays/params clamped, NaN `at` ⇒ emphasis dropped, `count` 0/1.5/2000/-1/"x" repaired per D14, loops of absent targets dropped, tangents non-finite ⇒ dropped and huge ⇒ clamped, `broken: 'yes'` dropped, `orient: 1` dropped, spring params NaN ⇒ defaults and out of range ⇒ clamped, adjustment clip keeps only opacity-only presets (`fade`) and drops `slide`, audio clip loses `motion` and loops; `{version: 8}` ⇒ `newer` and `classifySaved` says unsupported. Mutation check: drop the `version > CURRENT` test ⇒ the newer test fails.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** e2e `presets-migration.spec.ts`: seed a v6 IndexedDB project with keys, reload ⇒ saved as v7, picture unchanged (pixel), keys unchanged; seed `{version: 8}` ⇒ "saved by a newer version" notice and the stored bytes are unchanged after interaction. Gate + `npx playwright test tests/e2e/presets-migration.spec.ts tests/e2e/keyframes-migration.spec.ts tests/e2e/restore.spec.ts`. **Step 6: Commit** `feat: project data v7 (animation presets, loops, spatial paths, spring)`.

### Task 3: Spring easing and keyframe loops (pure + resolver)

**Files:** create `src/core/spring.ts`, `src/core/keyLoops.ts`, `src/core/loopEdits.ts`, `tests/spring.test.ts`, `tests/key-loops.test.ts`, `tests/loop-edits.test.ts`; modify `src/core/easing.ts` (`easeAt` spring branch), `src/core/keyframes.ts` (`valueAt` passes segment seconds), `src/core/animate.ts` (`resolvedTransform`/`resolveEffect` through `evalKeys`), `src/core/animTargets.ts` (`valueAtLocal` looped; `withTargetKeys` removes the loop with the last key), `src/core/keyframeEdits.ts` (stopwatch off / last key removed ⇒ loop removed), `src/core/keyLists.ts` (`splitKeys` caller rule), `src/core/clipEdits.ts` (split does not partition looped targets).

**Interfaces:**
- Consumes: Task 2 types; `localTime`, `segmentIndex` logic.
- Produces: `springAt(s: SpringParams, tau: number): number` (closed form), `springEase(s, u, seconds)` (endpoint-corrected); `SPRING_PRESETS`; `loopedTime(list, loop, u): { u: number; cycle: number; reverse: boolean }`; `evalKeys(list, loop | undefined, u, min, max): number` (the ONE numeric evaluator); `setKeyLoop(p, clipId, target, loop | null): Project` (lock guard, `assertTarget`, < 2 keys ⇒ `TimelineError('A loop needs two keyframes')`, same reference on no-op).

- [ ] **Step 1: Failing tests:** spring vs RK4 reference (12 sets, |err| < 1e-6), exact 0/1 endpoints, ζ = 1 branch continuity (ζ = 1 ± 1e-9 within 1e-9), over-damped monotone, damping 0 bounded, physical-time invariance; `valueAt` with spring on a 0.5 s and a 2 s segment; loops: repeat/pingPong/offset values at 20 times across 3 cycles vs a hand-computed oracle, `count` stops looping exactly after the counted cycles (last value holds), < 2 keys inert, before-first holds, offset accumulates on rotation 0→360 (t = 2.5 periods ⇒ 900°), effect param loops clamp to the schema; `setKeyLoop` refusals and no-ops; removing the last key or stopwatch off removes the loop; split property test with loops (200 random clips, sourced and sourceless, both halves frame-exact). Mutation checks: no endpoint correction ⇒ endpoint test fails; partition looped lists in split ⇒ property test fails; count off by one ⇒ count test fails.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate (pure; no e2e). **Step 6: Commit** `feat: spring easing and keyframe loops`.

### Task 4: Spatial Bézier motion paths and orient along path (pure + resolver)

**Files:** create `src/core/spatialPath.ts`, `src/core/pathEdits.ts`, `tests/spatial-path.test.ts`, `tests/path-edits.test.ts`; modify `src/core/keyframes.ts` (`positionAt` delegates curved segments, straight unchanged), `src/core/animate.ts` (orient adds the heading to the base rotation), `src/core/keyLists.ts` (`copyKey` deep-copies tangents), `src/core/reframeKeys.ts` (tangents scale), `src/ui/motionPathMath.ts` (samples the curve; cache signature).

**Interfaces:**
- Produces: `evalPosition(list, loop | undefined, u): Vec`, `pathHeading(list, loop, u): number` (degrees), `arcTable(a, b)` (32 samples, internal); `setKeyTangents(p, clipId, u: number, tangents: { in?: Vec | null; out?: Vec | null; broken?: boolean }): Project`, `smoothPath(p, clipId): Project` (Catmull-Rom tangents on every position key), `setKeyPosition(p, clipId, u, xy): Project` (moves one position key, tangents kept), `setOrient(p, clipId, on): Project`; `withLivePath(p, clipId, change)` (unguarded live twin for drags).

- [ ] **Step 1: Failing tests:** a key list with no tangents gives `positionAt` results bit-identical to the 5A implementation (copy of the 5A function kept in the test as the oracle, 10 000 random evaluations); curved segment endpoints exact; points lie on the analytic Bézier (≤ 1e-9 at sampled t); linear ease ⇒ speed constant within 1 % (arc length per frame); eased ⇒ arc-length fraction equals `easeAt`; heading of a straight line equals `atan2`; heading at a cusp/hold uses the fallback (never jumps to 0); orient adds heading + keyed rotation; `smoothPath` tangents equal Catmull-Rom (one third of the neighbour chord); reframe scales tangents (round trip Ruling J); split/trim with tangents frame-exact (property test); edits: lock refusal, `broken` semantics (smooth mirrors direction keeps length), same-reference no-ops, adjustment/audio refusals; motion-path sampling follows the curve (endpoints, max samples). Mutation checks: remove the straight-path fast path ⇒ bit-identity test fails; parametrise by Bézier t ⇒ constant-speed test fails; shallow tangent copy ⇒ split independence test fails.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + `npx playwright test tests/e2e/keyframes-path.spec.ts tests/e2e/keyframes-render.spec.ts` (5A unchanged). **Step 6: Commit** `feat: curved motion paths and orient along path`.

### Task 5: Preset library, blending rule and motion clip-operation rules (pure)

**Files:** create `src/core/presets.ts` (definitions, schema, labels, synonyms), `src/core/presetMath.ts` (per-preset offsets at progress p), `src/core/motion.ts` (`motionAt`, `composeMotion`, `maxMotionScale`), `src/core/motionEdits.ts`, `tests/presets.test.ts`, `tests/motion.test.ts`, `tests/motion-edits.test.ts`, `tests/motion-clip-ops.test.ts`; modify `src/core/animate.ts` (`resolveClip` composes motion; fast path), `src/core/clipEdits.ts` (D12 split/trim), `src/core/detachAudio.ts` (twin without motion), `src/core/keyframes.ts` (`maxScale` unchanged; callers multiply).

**Interfaces:**
- Consumes: `easeAt` (incl. spring), `localTime`, `snapToFrame`, `clipDuration`.
- Produces: `PRESETS: Record<PresetKey, PresetDef>` with `slots`, `opacityOnly`, `params: ParamDef[]`, `defaultDuration`, `defaultEase`, `label`, `synonyms`; `presetOffsets(key, slot, p, params, format): MotionOffsets`; `motionAt`, `composeMotion`, `maxMotionScale` (§6); edits `setPreset(p, clipId, slot, use | null, t)` (`emphasis.at` defaults to the playhead's local time; `seed` set from `t`-independent data on creation so tests can inject it: `setPreset` takes an optional seed), `setPresetParams(p, clipId, slot, patch)` (clamped; one call per slider release), all lock-guarded, kind-filtered (D13: `'Adjustment layers only fade'`), same reference on no-op.
- Initial library (labels in §14 Q1): in/out `fade`, `slide` (direction 4, distance 0..2 default 1), `zoom` (from 0..3, default 0.5 in / 1.5 out), `pop` (intensity: overshoot 0..0.5; spring ease), `spin` (turns −3..3, default 0.5, with scale 0.5→1), `drop` (from above, bounce ease, distance), `whip` (fast slide with `back` overshoot and a small rotation), `rise` (short slide up + fade); emphasis `pulse` (scale 1→1+i→1), `shake` (seeded sum of sines, intensity px fraction, frequency), `wobble` (rotation oscillation, degrees), `flash` (opacity dip count), `hop` (vertical hop, bounce), `spin360`; loop `breathe` (scale sine), `float` (vertical sine), `spinLoop` (rev/period), `jitter` (seeded shake loop), `blink` (opacity on/off, opacity-only), `kenBurns` (D11).

- [ ] **Step 1: Failing tests:** for every preset: rest state is the identity offset exactly (dx = dy = drot = 0, k = 1), start/end states exact (Slide In from left starts at dx = −distance·W; Fade In starts at kOpacity 0; out presets end at their end state at p = 1), params at min/max finite, `opacityOnly` presets touch only kOpacity; timing (D2): in with delay, out at the end, emphasis window at `at`, loop phase, short-clip scaling of overlapping in/out, frame-grid snapping (between-frame t equals frame start); blending: all 24 slot permutations give identical results, keyed base + presets, clamps (Pop overshoot on opacity 1 stays 1, scale never < 0), `maxMotionScale` bounds the sampled maximum for every preset over its param range (500 random draws); Ken Burns log zoom at p = 0.5 = √(z0 z1); shake deterministic for a seed and independent of fps sampling (same τ ⇒ same value); clip-op rules per D12 (split property test incl. the documented in-window discontinuity, trim edges, sourceless shifts of `at`/`phase`, move/ripple unchanged, detach twin, merge input unchanged); `resolveClip` fast path same object with `motion` absent, a fresh object with an active slot, the keys-only result when no slot is active. Mutation checks: order-dependent blend (multiply before add on a shared field) ⇒ permutation test fails; drop short-clip scaling ⇒ overlap test fails; `phase` not shifted on sourceless split ⇒ property test fails.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate (pure). **Step 6: Commit** `feat: animation presets, stack timing and blending`.

### Task 6: Render integration, parity and the reader audit

**Files:** create `tests/e2e/presets-render.spec.ts`, `tests/e2e/presets-parity.spec.ts`, `tests/e2e/keyframes-motion-render.spec.ts`; modify `src/render/drawCollect.ts` (texture scale × `maxMotionScale`), `src/render/overlays/textures.ts` (`get(..., builtIn)` in the texture key), `src/render/overlays/draw.ts` (`overlayAnimation` honours `builtIn`), `tests/transform-readers.test.ts` (allowlist), harness helpers if needed.

**Interfaces:**
- Consumes: `resolveClip` (Task 5), `evalPosition` (Task 4), `evalKeys` (Task 3).
- Produces: drawn clips with presets in every `Draw`/`AdjustmentDraw`; overlay textures stable across preset frames; lower thirds without double slide.

- [ ] **Step 1: Failing tests (e2e, real compositor, solid-colour fixtures):** each preset family's pixel checks listed in §8 (Fade, Slide, Pop overshoot frame, Spin, Drop bounce frame, Ken Burns, Pulse, Shake determinism (two renders equal), Blink on an adjustment layer); keyed spring and loop frames match `evalKeys`; curved path centroid and orient corners; lower third with an In preset: no built-in slide at 0.1 s (pixel), without a preset unchanged (existing spec); overlay texture uploads constant across 10 Pop frames and sharp at the overshoot; a 5A-only project hash-identical to before (explicit before/after hash on 3 keyed fixtures, machine-independent per the T5 fix); parity at 30 and 25 fps (1080p within 3/255, 320 px hash-equal per frame); hidden track with motion never resolved (counter). Reader audit: an unlisted `.motion` read in a render file fails (mutation check).
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + full `npm run e2e -- --trace off`. **Step 6: Commit** `feat: render animation presets and curved paths (preview and export)`.

### Task 7: Animation inspector, preset browser with animated previews, timeline bands

**Files:** create `src/ui/AnimationInspector.tsx`, `src/ui/PresetSlot.tsx`, `src/ui/PresetBrowser.tsx`, `src/ui/PresetTile.tsx`, `src/ui/presetPreview.ts` (DOM-free: synthetic card clip, tile times, corners via `resolveClip` + `clipCorners`), `src/ui/presetSearch.ts` (DOM-free filter/rank), `src/ui/presetCommands.ts`, `src/ui/MotionBands.tsx`, `src/ui/presets.css`, `tests/preset-preview.test.ts`, `tests/preset-search.test.ts`, `tests/e2e/presets-ui.spec.ts`, `tests/e2e/presets-browser.spec.ts`; modify `src/ui/Inspector.tsx` (section), `src/ui/ClipView.tsx` (bands), `src/ui/TransformOverlay.tsx` (`motion-ghost`).

**Interfaces:**
- Consumes: Task 5 edits and `PRESETS`; `useEditor` playhead; library favourites come in Task 9 (Task 7 keeps them in memory behind a `favourites` hook that Task 9 backs with IndexedDB).
- Produces: `setPresetCmd(clipId, slot, key)`, `removePresetCmd`, `setPresetParamsCmd` (`guard(() => apply(...))`); `previewCorners(def, slot, tileTime, size): Point[]` (pure); test ids per §7.

- [ ] **Step 1: Failing tests:** unit: preview corners equal `clipCorners(resolveClip(card, t))` (same resolver), tile still frame choice, search ranks label > synonym and is case-insensitive; e2e: choosing Fade In from the browser is ONE undo step and the preview pixel at 25 % of the window matches; changing direction/duration/delay via controls is one step per release; remove is one step and undo restores the slot exactly (JSON); emphasis "at playhead" sets `at`; adjustment layer shows only opacity presets enabled; overlay gets presets; locked track disables controls; browser: category tabs, search narrows tiles, keyboard (arrows, Enter applies, Escape closes, single tab stop), hovering a tile changes its canvas between two frames, an unhovered tile is still, `prefers-reduced-motion` (emulated) keeps all stills; bands appear with widths proportional to the windows and never intercept a clip drag/trim (existing drag specs green); the ghost outline appears at a Slide In's first frame and not at rest.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + `presets-*`, `inspector`, `pip`, `layers-ui`, `overlays-ui`, `adjustment-app`, `editor` specs. **Step 6: Commit** `feat(ui): animation presets inspector and preset browser`.

### Task 8: Loop and spring controls, on-canvas motion path editing, orient toggle

**Files:** create `src/ui/KeyLoopControl.tsx`, `src/ui/SpringFields.tsx`, `src/ui/pathCommands.ts`, `src/ui/usePathDrag.ts`, `src/ui/pathDragMath.ts` (DOM-free: threshold, tangent mirroring, Alt break), `tests/path-drag-math.test.ts`, `tests/e2e/keyframes-loops-ui.spec.ts`, `tests/e2e/keyframes-spring-ui.spec.ts`, `tests/e2e/path-edit.spec.ts`; modify `src/ui/KeyframeControls.tsx` (loop control), `src/ui/EasePanel.tsx` (spring), `src/ui/MotionPath.tsx` (draggable dots, tangent handles, smooth chip), `src/ui/TransformOverlay.tsx`, `src/ui/TransformFields.tsx` (orient toggle `kf-orient`), `src/ui/keyframeCommands.ts` (`setLoopCmd`).

**Interfaces:**
- Consumes: `setKeyLoop` (Task 3), `setKeyTangents`/`setKeyPosition`/`smoothPath`/`setOrient`/`withLivePath` (Task 4), spring maths (Task 3).
- Produces: commands each ONE apply; live preview during path drags equals the committed frame.

- [ ] **Step 1: Failing tests:** unit: drag threshold, mirrored tangent keeps the other length, Alt breaks, double-click toggles corner; e2e: Repeat on a 2-key opacity ⇒ the pixel at 1.5 periods equals the value at 0.5 (one step), count limits cycles, Ping-pong and Continue (rotation 0→90 continue ⇒ 180° at 2 periods, corners), loop control hidden with 1 key; spring: choosing Spring then Bouncy is one step each, the preview frame matches the core value, fields commit on Enter, the note appears on a short segment; path: dragging a key dot moves that key (one step, pixel follows), a click still seeks, tangent drag curves the path (centroid at mid-segment off the chord, one step), Escape during a drag cancels with no history change, Smooth path one step, orient toggle rotates the picture along a diagonal path (corner pixels), locked track: no drag, path visible; dragging the clip body still moves the clip (dot pass-through rule of 5A kept).
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + full `npm run e2e -- --trace off` (canvas pointer routing touches every PiP spec). **Step 6: Commit** `feat(ui): key loops, spring easing and curved path editing`.

### Task 9: Animation transfer (copy/paste) and save-as-preset library

**Files:** create `src/core/animTransfer.ts` (pure payloads, size adaptation, paste/replace edits), `src/state/presetLibrary.ts` (idb-keyval record, migration, never-overwrite), `src/ui/animClipboard.ts` (non-history store), `src/ui/transferCommands.ts`, `src/ui/SavePresetDialog.tsx`, `tests/anim-transfer.test.ts`, `tests/preset-library.test.ts`, `tests/e2e/anim-transfer.spec.ts`, `tests/e2e/user-presets.spec.ts`; modify `src/ui/keys.ts` (`copyAnim`/`pasteAnim` shortcuts; `shortcutBlockedByRange`), `src/ui/useShortcuts.ts` (pass-through rules), `src/ui/shortcutCommands.ts`, `src/ui/AnimationInspector.tsx` (copy/paste/save buttons), `src/ui/PresetBrowser.tsx` ("My presets", favourites persisted), `src/ui/projectCommands.ts` (New project clears the clipboard).

**Interfaces:**
- Consumes: `selectedRefs` (keySelection.ts:53), `fitTransform` (merge.ts:72), `setPreset`, key list helpers.
- Produces: `copyKeys(clip, refs): KeysPayload`, `copyAnimation(clip, media, format): AnimPayload` (whole, with source fit scale), `pasteKeys(p, clipIds, payload, t): { project; skipped: number }`, `pasteAnimation(p, clipIds, payload): { project; skipped }`, `presetFromAnimation(payload, name, category): UserPreset` (relative position), `applyUserPreset(p, clipId, preset, t)`; library: `loadLibrary(): Promise<LibraryState>` (`ok` | `readOnly(reason)` | `unavailable`), `saveUserPreset`, `renamePreset`, `deletePreset`, `setFavourite` (each refuses in `readOnly`).

- [ ] **Step 1: Failing tests:** unit: keys payload relative timing, paste lands the earliest key on the playhead frame, replaces same-frame keys (P5-6), size adaptation ratio (4000×3000 photo fill ⇒ 1920×1080 video fill: scale keys × the fit-scale ratio, exact), effect key matching by type and occurrence, skipped counts, kind filters, `MAX_KEYS` refusal, multi-clip paste ONE project, whole-animation replace exact (copy A→B then B→A round trip equals A when sizes match), user preset relative position applied to a clip at another place, out-category anchoring to the clip end; library: newer/malformed record ⇒ read-only and `set` never called (fake idb), cap 100 and 64 kB refusals, rename/delete/favourite; e2e: select keys, Ctrl/Cmd+C, select another clip, move the playhead, Ctrl/Cmd+V ⇒ keys there (one undo step, pixel), Ctrl/Cmd+C/V in the clip-name field copies text and leaves the project alone, Copy animation/Paste animation between a photo and a video adapts scale (bounding box), save as preset ⇒ appears under My presets after reload, applying it is one step, delete asks and removes it from the library only (the clip keeps its animation), favourites persist, a `{version: 2}` library is shown read-only and its IndexedDB value is byte-identical after the session.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + full `npm run e2e -- --trace off` (global shortcuts). **Step 6: Commit** `feat: copy and paste animation, save as preset`.

### Task 10: Robustness, performance, journey, docs and QA checklist

**Files:** create `tests/e2e/presets-robust.spec.ts`, `tests/e2e/presets-journey.spec.ts`, `tests/presets-perf.test.ts`, `docs/superpowers/ledgers/plan-5b-manual-qa-checklist.md`; modify `README.md` (presets, loops, spring, curved paths, copy/paste, personal presets; limits), `PROJECT_HANDOFF.md`, `CLAUDE.md` (data v7, Plan 5B status), the ledger; only what the tests expose in `src/`.

- [ ] **Step 1: Guarding tests:** split/trim/move/ripple/join/merge-all/reframe/undo-redo walks on clips with presets + loops + curved paths in the real app (pixels where D12 says they must be equal, cutting at whole frames per P5-5); reload restores everything (project JSON exact); export of a 10 s 1080p project with 8 clips each carrying 4 presets + a curved path + loops completes; determinism (320 px hash-equal per frame, 1080p render identical, export within 3/255); performance: resolver budget (§9), preview frame time with 8 preset clips ≤ 1.2× static (SwiftShader, reported), tile CPU (one animated tile), no texture growth.
- [ ] **Step 2:** Journey e2e: import a photo and a video; Ken Burns + Fade In on the photo; Slide In from the left + Pulse emphasis + Fade Out on the video; keys with a spring ease and a Repeat loop on a sticker overlay; curve its path and orient it; copy its animation to a second sticker; save it as a preset and apply it to a third after reload; split the video at a whole frame; export 1080p; ffprobe duration within one frame; five frame grabs match the preview; one undo step per gesture across the whole journey.
- [ ] **Step 3:** Manual checklist (real desktop Chrome on a Mac; run with Plan 4's and 5A's): preset feel at 30/60 fps, tile animation smoothness and CPU, spring feel, tangent handles with a trackpad, Ctrl vs Cmd copy/paste, library persistence across browser restarts, lower third + presets, QuickTime playback of the export; Safari unverified.
- [ ] **Step 4:** Full gate: `npm test && npm run typecheck && npm run build && npm run e2e && npm run e2e:preview`; `grep -rl __clipforge dist` empty.
- [ ] **Step 5:** Final whole-part review (fresh opus reviewer), one themed fix wave, scoped re-review. **Step 6: Commit** `docs,test: Plan 5B journey, guards, QA checklist and handoff`.

*— Deployment gate: 5B can be deployed here (data v7), under Ruling P5-2. —*

### Review focus (5B)

1. The resolver is the only evaluator: no preset/loop/path maths outside `src/core` evaluators; reader audit complete; tiles use `resolveClip`.
2. Base vs drawn: fields and handles edit the base; no edit path writes a drawn value back into keys.
3. Byte-identity of static and 5A-only projects (straight paths, no motion, no loops).
4. Split/trim exactness with loops, tangents and presets (D4, D12) and the documented in-window discontinuity.
5. One apply per gesture for every new control, including multi-clip paste and path drags (live == commit).
6. Preview == export at 25/30 fps; spring/shake determinism.
7. Data safety: v6 → v7, D14 repairs, `{version: 8}` protected; library never overwritten.
8. Shortcut routing: Ctrl/Cmd+C/V never break native copy/paste in text fields.

---

## 13. Deployment gate

5B deploys under the user's standing authorisation **Ruling P5-2** once ALL hold: Tasks 1–10 complete with clean review/fix loops; final whole-part review clean (0 Important); `npm test && npm run typecheck && npm run build`; `grep -rl __clipforge dist` empty (plus the other dev hooks named in the 5A gate); a FRESH full `npm run e2e -- --trace off` all green (a known flake must pass when re-run alone); `npm run e2e:preview` green; production (`c9caebe`) is an ancestor of HEAD (fast-forward only). Then fast-forward push the feature branch HEAD to `claude/macos-video-editor-lzye6c`, record the gate and the deploy in the ledger, and state in the deploy note that the manual QA (Plans 4, 5A, 5B) is unrun. After the deploy, older open tabs refuse v7 saves ("saved by a newer version") and protect the data (accepted by the user under P5-2). Anything failing ⇒ do NOT deploy; report.

---

## 14. Decisions taken (controller will adopt your recommendations as rulings unless the user objects)

| # | User-visible choice | Recommendation | Cost if wrong |
|---|---|---|---|
| Q1 | **Initial preset list and names** | Entrance/Exit (mirrored): Fade, Slide (left/right/up/down), Zoom, Pop, Spin, Drop, Whip, Rise/Sink. Emphasis: Pulse, Shake, Wobble, Flash, Hop, Spin 360. Continuous: Breathe, Float, Spin loop, Jitter, Blink, Ken Burns. 28 entries from 20 definitions. | Adding/renaming a preset is one definition + one test; removing one later needs a migration rule (drop slot). |
| Q2 | **Presets procedural vs baked into keys** | Procedural layer (`Clip.motion`), keys untouched (D1). | Bake later as "Convert to keyframes" (~1 task). |
| Q3 | **Stack shape** | Four slots per clip, one preset each: In, Emphasis, Loop, Out (D2). | Multiple emphases later = array per slot, a bump. |
| Q4 | **Blending rule (scope of "animation blending")** | Presets add (position, rotation) or multiply (scale, opacity) on top of the keyed/static value; order-free; fields and handles edit the rest value, a ghost shows the drawn picture (D3). Override/replace modes not offered. | Override mode is one function swap; a per-slot blend-mode choice is a small UI addition. |
| Q5 | **User presets location** | Personal library in IndexedDB (survives New project), copied into the clip on use so projects stay portable; library export/import later (D9). | In-project presets need a `Project.presets` field in a bump and vanish on New project. |
| Q6 | **Spring in 5B (O3)** | Yes: closed-form spring ease in physical seconds with stiffness/damping/mass and 4 named presets; also used by Pop (D5). | Users without it use back/elastic (as in 5A). |
| Q7 | **Loop modes** | Repeat, Ping-pong, Continue (offset), with a count (∞ default); after the last key only (D4). | Loop-in/pre-cycles later as another mode. |
| Q8 | **Motion path speed** | Arc-length parametrised (even speed along curves, like After Effects); curves only where tangents exist; "Smooth path" button (D6). | Bézier-t parametrisation gives uneven speed; one function. |
| Q9 | **Deferred to later plans** | Text stagger/typewriter → Plan 6; drawn-path presets and masks → Plan 8; effect-param presets (blur-in), motion blur, loop-in, bake-to-keys, band drag-resize, library import/export → Plan 10/11/12 or a 5B follow-up; anchor → 5E; speed → 5D; transitions → 5C; audio presets → Plan 9. | Each is additive; none blocks 5B's data. |
| Q10 | **Lower-third built-in slide with a preset** | A preset on an edge turns the built-in slide off at that edge (D13). | Keeping both double-animates; a one-line flag. |
| Q11 | **Copy/paste semantics** | Ctrl/Cmd+C/V for selected keys (absolute positions, scale adapted by fit-scale ratio, pasted at the playhead); "Copy/Paste animation" buttons replace the whole animation; text fields keep native copy (D8). | Relative-position paste is a payload flag; clip copy/paste (Plan 7) can take Ctrl/Cmd+C/V when no keys are selected. |
| Q12 | **Preview tiles** | Canvas2D card driven by the same resolver; only the hovered/focused tile animates; reduced motion = stills; no decode (D10). | Real-frame thumbnails need decode and caching (later). |
| Q13 | **Deploy 5B alone (v7)** | Yes, under P5-2 once gated; QA (4, 5A, 5B) run together on a real Mac. | Waiting for 5E merges two bumps but delays value. |
