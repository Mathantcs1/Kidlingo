# ClipForge Plan 5 Part 5E: Crop, flip, anchor (DRAFT for approval, data v8)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans), task by task. Nothing here is implemented yet: the user must approve this plan and answer §9 first. Adopted decisions are recorded as `Ruling: P5E-n` lines in `docs/superpowers/ledgers/plan-5-animation-ledger.md` BEFORE Task 1.

**Goal:** Let the user crop a picture clip (numeric fields and on-canvas handles), flip it horizontally/vertically, and move its pivot (anchor point) so scale, rotation and animation presets turn about any point; the anchor is keyframable through the 5A engine. Preview and export stay identical (one geometry, one resolver). Data moves to **v8**.

**Architecture (summary):** the transform geometry stays defined on the FULL (uncropped) source frame; crop is a mask that shrinks the drawn quad and its UV rectangle; flip is a UV mirror applied before the clip rotation; the anchor is a fraction offset of the full frame that the existing `clipMatrix` / `clipCorners` pair uses as pivot. Because `Transform.x/y/scale/rotation` keep their meaning, every static, keyed and preset clip stays bit-identical when `crop`, `flip` and `anchor` are absent (the 549 e2e + 1813 unit tests are the oracle). Pure maths in `src/core` / `src/render/geometry.ts`; edits are pure `(Project, …) => Project`, one `apply` per gesture.

**Tech stack:** unchanged (TypeScript strict, React 19, WebGL2 with existing shaders: only the quad matrix and UV matrix vary; Vitest; Playwright with pixel reads and ffmpeg frame grabs). No new dependency.

**Context read (for the reviewer):** `CLAUDE.md`, `PROJECT_HANDOFF.md` §8-9, ledger `plan-5-animation-ledger.md` (P5-1, P5-2, P5-8), 5A plan §4.4/§5 (5E outline: audited sites), 5B plan (structure, D14 repair style), code at branch tip `b2d23df` (data v7; `src/render/geometry.ts`, `drawCollect.ts`, `overlayGeometry.ts`, `merge.ts` fit/reframe, `animate.ts`, `migrate*.ts`, `keyTypes.ts`).

Branch: `feature/plan-5e-crop-anchor` off `feature/plan-5-animation` (`b2d23df`, production = Plan 5B + UI pass, data v7; rollback candidate `c9caebe`, v6). Baseline: `npm test` 1813, full e2e 549, `e2e:preview` 1.

---

## 1. Scope

In: `Clip.crop` (4 edges), `Clip.flip` (h/v), `Clip.anchor` (+ `TransformKeys.anchor` keys and loops), crop inspector + on-canvas crop mode, flip buttons, anchor fields + pivot handle, "Fit/Fill to crop", Reset buttons, context-menu entries, help text, copy/paste/split/trim/reframe/twin rules, migration v8.

Out (deferred, recorded in the ledger): keyframing crop; rounded/feathered crop and masks (Plan 8); per-axis (non-uniform) scale; "pan behind" anchor compensation; crop/flip on overlay, adjustment and audio clips (refused); a 90° rotate button (the rotation field covers it).

## 2. Constraints (carried over)

- TypeScript strict; 2 spaces, single quotes, semicolons; files ≲200 lines, split BEFORE extending (Task 1). Near the limit: `compositor.ts` 195, `edits.ts` 188, `useTransformDrag.ts` 170, `model.ts` 185 (new types go in `src/core/cropTypes.ts`), `TransformOverlay.tsx` 147, `keyframeEdits.ts` 152. New CSS in `src/ui/crop.css`.
- `src/core` is pure; edits throw `TimelineError` for user-facing refusals, never mutate, return the SAME reference for no-ops. Locked tracks refuse crop/flip/anchor edits.
- One gesture = ONE `apply` = one undo step (a crop-handle drag, a field commit, a flip click, a reset, a fit-to-crop). Drags use local state until release. Undo restores the exact previous project.
- Data **v8**: `CURRENT_VERSION = 8` (one constant); v1-v7 open unchanged (migration adds nothing, repairs what is present); `{version: 9}` is `newer` ⇒ `unsupported`, never overwritten. Saves from v8 are one-way (older tabs refuse and protect them).
- The resolver is the ONLY evaluator (5A D7): anchor keys are evaluated in `resolveClip` (the drawn clip carries a plain `anchor`); the reader audit `tests/transform-readers.test.ts` gains `.crop`, `.flip`, `.anchor` and fails on an unlisted reader.
- Preview == export: deterministic closed-form maths only; a parity spec at 25 and 30 fps with crop+flip+anchor+rotation.
- Keep every existing `data-testid`; new ids in §6. `window.__clipforge` stays DEV-only (`grep -rl __clipforge dist` empty).
- TDD, mutation-check each important guard and name the caught mutation in the task report. Commit trailers (blank line before): `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01AdHhRsEwujEyBJRN1QpBgu`.
- **No push, no deploy** without the user's explicit go-ahead in the current session (Ruling P5-2's conditions still apply when that go-ahead comes). Do not touch `release/` or any Vercel project other than `clipforge`. Never run `playwright install`; one e2e run at a time (port 5173).
- Model policy (P5-8): opus for migration, render/geometry maths, split/trim rules, and the final whole-part review; sonnet for UI wiring, docs, refactors, test-only tasks.

## 3. Decisions (proposed rulings; the ones needing the user are in §9)

- **D1 Crop is a mask on the full frame.** `Clip.crop?: { left, top, right, bottom }`: fractions (0..1) of the DISPLAYED (already rotated by track metadata) source, measured from each edge. `x/y/scale/rotation` and the default pivot keep referring to the full uncropped frame, so cropping does not move the visible pixels and needs no position compensation or key rewrite (an in-place crop, like Premiere's Crop effect). The drawn quad is the sub-rectangle `[left, 1-right] × [top, 1-bottom]` of the frame quad. Rationale: no existing clip changes meaning; reframe, keys, presets and fit stay exact. Alternative (re-centre on the cropped picture) is O1.
- **D2 Limits.** Each edge 0..0.95; per axis `left+right ≤ 1 − minFrac`, `top+bottom ≤ 1 − minFrac`, where the remaining size is at least `max(8 source px, 2 % )` (8 px enforced at edit time with the media size; migration, which has no media, enforces the 2 % fraction only). A field/drag that would break the limit is clamped to it. All-zero crop is stored as absent (identity). Crop is in displayed orientation, so a rotated phone clip crops what the user sees.
- **D3 Flip.** `Clip.flip?: { h?: true; v?: true }`, absent = none (false values are never stored). Applied in displayed space on the cropped region BEFORE the clip's transform rotation (flip, then rotate): flipping a rotated clip mirrors the picture about its own vertical/horizontal axis, not the screen's. Implemented in the UV matrix (no shader change); effects see the flipped, cropped picture.
- **D4 Anchor.** `Clip.anchor?: Vec`: the pivot as a fraction of the FULL frame measured from its centre (x right, y down; default {0,0}; clamped ±2 so a pivot can sit outside the picture). `Transform.x/y` is the canvas position of the ANCHOR (default centre ⇒ identical to today). Scale and rotation (and 5B presets, which compose through the same matrix) pivot about it. Changing the anchor with its field or handle does NOT compensate: the picture moves (Premiere semantics; consistent with the Premiere-style UI). The reset and the "Anchor to crop centre" button are single applies. Alternative (compensating, "pan behind") is O2.
- **D5 Anchor keys.** `TransformKeys.anchor?: PositionKeyframe-shaped list without tangents` (t, x, y, ease) and a loop in `TransformKeys.loops.anchor`, evaluated linearly in x and y with the eased fraction by a small `evalAnchor` next to `evalPosition`. Everything that handles the four keyed transform props (stopwatch, diamonds, key lists, copy/paste, split, reframe-scaling, migration repair, loops) must learn the fifth. This is the widest part of the work: it is its own task (Task 5) so it can be cut and shipped later without touching crop/flip (O3).
- **D6 Matrix and corners (one formula, two implementations that must agree).** With frame size `S = size·scale`, anchor offset `a = (ax·Sw, ay·Sh)`, rotation `R`: a frame point `(u,v)` maps to `p = R·((u−½)·Sw − a.x, (v−½)·Sh − a.y)·… + (x, y)` generalising today's `clipMatrix`; the cropped quad uses the sub-rectangle `u∈[l,1−r], v∈[t,1−b]`. `clipCorners` returns the CROPPED quad's corners (handles, hit-test and outline follow what is visible); a new `frameCorners` returns the full-frame quad (the dashed "cropped away" outline in crop mode). `tests/overlay-geometry.test.ts`-style round trip: `clipCorners` equals `clipMatrix` applied to the cropped unit-square corners, for random clips (Ruling 1 parity).
- **D7 Render.** `drawCollect` computes the cropped `size` (displayed size × crop fraction) and composes the crop sub-rect and flip into `uv` (`cropUvMatrix`), so everything downstream (effects, blur backdrop for fit-mode `blur`, adjustment) sees the cropped picture: `effectWorkingSize(size, texels)` gets the cropped size and cropped texel counts. Edge bleed: UVs are inset by half a texel (clamped) so bilinear sampling never pulls in cropped-away pixels. Overlay and adjustment clips never carry crop.
- **D8 Fit and reframe.** `fitTransform` still takes the full source size (D1), so `reframeProject` and `atFit` are unchanged and exact (round trip A→B→A still exact). New actions: `fitToCrop(mode: 'fit' | 'fill')` sets scale and position so the cropped rectangle fills/fits the canvas (one apply; refuses when position or scale are keyed, like Reset today). Reset (existing) restores the full-frame fit and keeps crop (the user resets crop with `crop-reset`).
- **D9 Clip operations.** Split/trim/move/ripple/duplicate/join: `crop`, `flip`, `anchor` (and `keys.anchor`, via the existing key partitioning) follow the clip; both halves of a split keep them. Detached audio twin (`audioEdits.ts` twin spread) must DROP them. Clip copy/paste keeps them. Whole-animation copy/paste carries anchor keys (fractions, no size adaptation needed); crop/flip are not animation and are not transferred. Join (`merge.ts`) only merges contiguous cuts of the same source: its equality check must include `crop`, `flip` and `anchor`, so clips that differ are not joined (to be confirmed against the existing rule in Task 3).
- **D10 Migration v8 (repair only).** v7 → v8 adds nothing. When present: `crop` edges finite, clamped 0..0.95, axis sums limited to `1 − 0.02`, all-zero ⇒ dropped; `flip` only `true` booleans kept, empty ⇒ dropped; `anchor` finite and clamped ±2, `{0,0}` ⇒ dropped; `keys.anchor` repaired like position keys (sorted, finite, eases repaired, no tangents), `loops.anchor` repaired like other loops; audio/overlay/adjustment clips lose `crop`/`flip`/`anchor` (adjustment keeps nothing here). Unknown fields untouched. Idempotent; `{version: 9}` unsupported.

## 4. Audited code sites

| Site | Change |
|---|---|
| `src/core/model.ts` (185 lines), `keyTypes.ts` | `CURRENT_VERSION = 8`; `Clip.crop/flip/anchor` types from new `cropTypes.ts`; `KeyedTransformProp` += `'anchor'` (Task 5) |
| `src/core/migrate.ts` `toClip`, `migrateKeys.ts` (128), new `migrateCrop.ts` | D10 repair; anchor keys in `migrateKeys` |
| `src/render/geometry.ts` | `clipMatrix(src, t, canvas, view?)` with optional `{ crop, anchor }` (absent = today's maths, bit-identical); `cropUvMatrix`; `croppedSize`; flip in `uv` |
| `src/render/overlayGeometry.ts`, `src/ui/overlayHit.ts` | `clipCorners` with crop/anchor, `frameCorners`, scale-handle pivot = anchor, rotate about anchor |
| `src/render/drawCollect.ts:60-137` | cropped `size`, `uv` composition, cropped `texels`; clip `crop/flip/anchor` read from the RESOLVED clip |
| `src/render/clipEffects.ts`, `effects/pipeline.ts:25`, `blur.ts` | working size from the cropped size; backdrop from the cropped picture |
| `src/render/compositor.ts` (195) | pass `view` to `clipMatrix` (split a helper out first) |
| `src/core/animate.ts` | resolved clip carries the evaluated `anchor` (keys + loop) and no `keys.anchor`; fast path also checks `crop/flip/anchor`-free (no allocation for static) |
| `src/core/transformEdits.ts`, `src/ui/edits.ts` (188) | `setCrop`, `setFlip`, `setAnchor`, `resetCrop`, `fitToCrop`, `anchorToCropCentre` (new `cropEdits.ts`) |
| `src/core/keyLists.ts`, `keyframeEdits.ts`, `animTargets.ts`, `targetGroups.ts`, `targetLoops.ts`, `loopEdits.ts`, `reframeKeys.ts`, `animPayload.ts`/`animTransfer.ts` | the fifth keyed target (Task 5) |
| `src/core/clipEdits.ts` (split), `audioEdits.ts` (twin), `merge.ts` (join, reframe) | D9 rules |
| `src/ui/Inspector.tsx`/`TransformFields.tsx`/`KeyframeControls.tsx` | `CropFields`, `FlipButtons`, `AnchorFields` sections; stopwatch on anchor |
| `src/ui/TransformOverlay.tsx` (147), `useTransformDrag.ts` (170) | crop mode (handles on the full frame), pivot dot; split before extending |
| `src/ui/MotionPath.tsx`, `motionGhost.ts` | ghost/path use the cropped quad / anchor-aware centre |
| `src/ui/contextMenuItems.ts`, `helpContent.ts`, `keys.ts` | menu entries (Flip H/V, Reset crop, Crop mode), help section |
| `tests/transform-readers.test.ts` | allowlist `.crop/.flip/.anchor` readers |

## 5. Tasks

Each task ends with: `npm test && npm run typecheck && npm run build`, `grep -rl __clipforge dist` empty, the specs it touches (one at a time), a report in `docs/superpowers/ledgers/plan-5-task-reports/5e-task-N-report.md`, one review (P5-8), commit (never push).

1. **Preparation (sonnet, refactor only).** Split `compositor.ts`, `edits.ts`, `useTransformDrag.ts`, `TransformOverlay.tsx` below ~170 lines, add `cropTypes.ts` and the reader-audit placeholders; no behaviour change. Gate: unit + typecheck + build + FULL e2e (549) as the oracle.
2. **Pure geometry (opus).** `croppedSize`, `cropRect` limits (D2), `cropUvMatrix` + flip (D3), anchor in `clipMatrix`/`clipCorners` (D4, D6), `frameCorners`. Tests: absent = bit-identical to today (property test over random transforms); matrix ⇄ corners parity with crop+anchor+rotation+flip; flip∘flip = identity; crop uv corners; hit-test on the cropped quad; pivot invariance (the anchor point's canvas position is unchanged by scale and rotation).
3. **Data v8, migration, edits, clip rules (opus).** `CURRENT_VERSION = 8`, D10 migration (+ v7 fixtures, `{version: 9}` unsupported/never overwritten, idempotence, the repair table), static `Clip.crop/flip/anchor` in the resolver fast path, pure edits (`setCrop` with the 8 px limit from media size, `setFlip`, `setAnchor`, resets, `fitToCrop`, `anchorToCropCentre`; locked-track and kind refusals; same-reference no-ops), D9 rules (split/trim/dup/twin/paste/join/reframe).
4. **Render (opus).** `drawCollect` cropped size/uv/texels, half-texel inset, effects working size, blur-fit backdrop from the cropped picture, pixel specs (`crop-render.spec.ts`: crop edge position and exact pixels at a known frame; flip checks on a quadrant fixture; anchor pivot with rotation; rotated phone-metadata video; effects on a cropped clip; 25/30 fps export == preview via ffmpeg frame grab; bleed check at the crop edge).
5. **Anchor keys (opus, cuttable, O3).** Fifth keyed target through every 5A/5B site in §4 (stopwatch, diamonds, copy/paste, loops, split partition, reframe scaling, migration repair, resolver), reader audit, perf guard (resolver cost still within the 5B 2.5x guard).
6. **UI (sonnet).** Inspector sections (`crop-left/top/right/bottom`, `crop-reset`, `crop-fit`, `crop-fill`, `flip-h`, `flip-v`, `anchor-x`, `anchor-y`, `anchor-reset`, `anchor-to-crop`), on-canvas crop mode (`crop-mode-toggle`, `crop-handle-l/r/t/b/tl/tr/br/bl`, `crop-frame` dashed full frame, one apply on release, Esc cancels, arrow keys nudge), pivot dot (`anchor-handle`), context menu items, help topic, Playwright specs for each gesture incl. undo and a locked track.
7. **Robustness, journey, docs (sonnet; opus final review).** Journey spec (import → crop with handles → flip → move anchor → keyframe → preset → export → reload), edge cases (tiny crops, crop to the 8 px floor, huge anchors, 4K), `plan-5e-manual-qa-checklist.md`, README/handoff/CLAUDE.md/ledger updates, then the final whole-part review (fresh opus, one themed fix wave).

**Part gate (before any deploy request):** all tasks reviewed clean, final review 0 Important, `npm test && npm run typecheck && npm run build`, dist hook grep empty, a FRESH full `npm run e2e -- --trace off` green (known flakes re-run alone), `npm run e2e:preview` green, production tip an ancestor of HEAD. Then STOP and ask the user for the push/deploy go-ahead.

## 6. Test ids (new)

`crop-section`, `crop-left`, `crop-top`, `crop-right`, `crop-bottom`, `crop-reset`, `crop-fit`, `crop-fill`, `crop-mode-toggle`, `crop-frame`, `crop-handle-{l,r,t,b,tl,tr,br,bl}`, `flip-h`, `flip-v`, `anchor-section`, `anchor-x`, `anchor-y`, `anchor-reset`, `anchor-to-crop`, `anchor-handle`, plus the stopwatch id pattern of the existing keyed targets for `anchor`.

## 7. Risks

1. `clipMatrix` vs `clipCorners` drift (handles/hit-test vs picture): mitigated by D6's parity test and one shared helper.
2. Crop edge bleed and tiny crops (effects working size, blur kernels at a few pixels): half-texel inset, floor of 8 px, specs at the floor.
3. Anchor keys touch ~12 files (Task 5): isolated and cuttable.
4. Rotated phone footage: crop is in displayed orientation, tested with rotation metadata.
5. Presets with a moved anchor (spin pivots about the anchor; 5B presets' ghost/outline): covered by Task 4/6 specs; the Pop/Zoom overlay texture budget (T10-3) unchanged.
6. Real-GPU, Safari and QuickTime behaviour remains unverified (SwiftShader only): QA checklist item.

## 8. Self-review

Spec coverage (design line 26 crop/flip; 5A plan §5 5E: crop rectangle inspector + on-canvas ✓ T6; flip H/V ✓ T2/T4/T6; anchor keyframable ✓ T5; fit/reframe of cropped media ✓ D8/T3; migration ✓ D10/T3). Static projects stay byte-identical (D1, T2 property test, full e2e). No placeholders: every task names its tests. Cost if D1 is wrong: moving to a re-centred model is a change in `clipMatrix`/`clipCorners` plus a one-off position compensation in `setCrop`, about one task, with no data change.

## 9. Decisions I need from you

| # | Question | Recommendation | Cost if wrong |
|---|---|---|---|
| O1 | Crop model: mask on the full frame (the visible pixels do not move; pivot and scale defined on the uncropped frame) or re-centre on the cropped picture | Mask on the full frame (D1) | ~1 task of rework in geometry, no data change |
| O2 | Moving the anchor: picture moves (Premiere) or compensated so the picture stays put (After Effects "pan behind") | Picture moves (D4); the "Anchor to crop centre" button covers the common need | One function in `cropEdits.ts`; compensation is impossible while position is keyed |
| O3 | Ship anchor keyframes now (Task 5) or later | Now, as the approved roadmap says, but as a separate cuttable task | Cutting later = drop Task 5 and its UI row; no data change (v8 stays valid) |
| O4 | Keyframe crop too | No (static; animated reveals via presets/masks come with Plan 8) | A later part adds `keys.crop`, a new bump |
| O5 | Fit actions: add `crop-fit`/`crop-fill` ("fit/fill the cropped area to the canvas") | Yes | Small |

Approve as recommended, or tell me which to change; then I record P5E-1..n in the ledger and start Task 1.
