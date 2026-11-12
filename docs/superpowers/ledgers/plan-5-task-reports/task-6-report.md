# Plan 5 Task 6 report: inspector stopwatches for transform and on-canvas keyed drag

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1332 (96 files) | 1344 (97 files; +12 `keyframe-commands`; `transform-readers` allowlist updated) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| new e2e | n/a | `keyframes-ui` 4/4 |
| related e2e (one run at a time, `--trace off`) | n/a | see "E2E runs" |

Commit: `feat(ui): transform keyframes in the inspector and on canvas` (+ this report).

## Design (files)
- `src/ui/keyframeCommands.ts` (100): store-bound commands, each `guard(() => apply(...))` = ONE undo step at the playhead:
  `toggleAnimatedCmd(clipId, target)` (stopwatch: `setAnimated(on/off)`), `setValueAtCmd(clipId, target, value)`
  (`setValueAt`; for Task 7's sliders), `setTransformAtCmd(clipId, patch)` (transform field commits: `setTransformAt`, so a
  typed X on a static clip patches only `x` exactly as before, and on keyed position keeps the resolved Y),
  `toggleKeyAtPlayheadCmd(clipId, target)`; playhead-only (no history, pauses playback): `jumpToKeyCmd(clipId, target |
  null, dir)` and `seekToKeyCmd(clipId, u)` (strip diamonds). Pure helpers: `onClip(clip, t)` (the edits' inside rule),
  `keyAtPlayhead(clip, target, t, fps)` (KeyRef within KEY_EPS of the playhead's local frame time, null off the clip),
  `keyTimelineTime(clip, u)`, `keyJumpTime(clip, target | null, t, fps, dir)` (visible keys only; the key the playhead's
  frame sits on is neither previous nor next).
- `src/ui/KeyframeControls.tsx` (130): one row per animatable property: label, stopwatch (`aria-pressed`, "Animate Scale"),
  previous ◀ / key ◆ (`aria-pressed` when a key is under the playhead; add/remove label) / next ▶, and the strip. Test ids come
  from a `KeyframeIds` object (`transformKeyIds(prop)` gives `kf-toggle|prev|next|key|strip-<prop>`; Task 7 passes its own
  `fx-<effectId>-<param>-kf` etc.). It subscribes to the playhead only while its property is animated.
  `TransformKeyframes` renders the transform rows (`inspector-keyframes`).
- `src/ui/KeyframeStrip.tsx` (54): `kf-strip-<prop>` with one `kf-strip-key` button per key inside the clip's visible local
  range (`data-time` = timeline time, `aria-label` "Keyframe at 1.20 s", `aria-current` on the key under the playhead), a
  playhead marker; a click seeks (no history).
- `src/ui/animation.css` (96, imported by KeyframeControls): new CSS lives here, not in `styles.css`.
- `src/ui/TransformFields.tsx` (114): values = `resolvedTransform(clip, playhead, fps)` (playhead subscribed only while
  `clip.keys` exists); commits through `setTransformAtCmd`; rotation spinbutton range ±36 000 while rotation is keyed;
  keyframe rows below the grid (adjustment: opacity only, via the existing `only` prop; overlays: all four). `Inspector.tsx`
  is untouched (TransformFields was already mounted for every non-audio clip), so no Inspector split was needed.
- `src/ui/TransformOverlay.tsx`: handles at `resolvedTransform(target.clip, playhead, fps)` or the live drag transform.
- `src/ui/useTransformDrag.ts` (171): start = resolved transform at the playhead read at the press (`g.at`, after pausing);
  live update = `{ transform, patch: dragPatch(start, current), t: g.at }`; release = ONE `setTransformAt(p, id, patch, g.at)`
  when the patch is non-empty; the drag also ends (no commit) when the clip's `keys` reference changes, the playhead moves,
  or the fps changes (plus the existing transform/format/removal checks).
- `src/ui/overlayHit.ts` (104): `LiveTransform` gains `patch` and `t`; `dragPatch(start, current)` (only changed fields;
  rotation = start + normaliseDegrees(current − start): unnormalised for keyed multi-turn rotation, ledger M-drag);
  `scaleFromZero` and its use in `transformFor` (ledger M2: a corner drag of a clip shown at scale 0 makes the grabbed corner
  follow the pointer instead of a 0 ratio stuck at the 2 % floor).
- `src/ui/Preview.tsx`: live preview = `withLiveValue(project, clipId, patch, t)`, the unguarded twin of the commit, so the
  live frame equals the committed one (pixel-compared in e2e).
- `src/core/transformEdits.ts`: `setClipTransform` checks the lock BEFORE the animated refusal (ledger M3).
- `tests/transform-readers.test.ts`: TransformFields and Preview have no direct reads any more (entries removed); the
  overlay/hit/drag entries now say they read the resolved (or live) transform; `storeTransform` reads stay "stored value on
  purpose". Each entry still matches exactly one line.

## Rulings (proposed for the ledger)
- T6-1 - Transform field commits go through `setTransformAt` (not `setValueAt` with a full position): a static X/Y edit
  patches only that axis (no clamp side effect on the other), keyed position keeps the resolved other coordinate.
- T6-2 - The key diamond on a STATIC property starts animating it (one key, like the stopwatch). On an animated property it
  removes the key under the playhead (the last key leaves the property static at that value, T4-2) or adds a key holding
  the value shown at the playhead (picture unchanged). Off the clip it is refused with the D8/O10 toast.
- T6-3 - Locked track / project not ready: fields, stopwatch and key diamond are disabled (title "Track is locked");
  previous/next and strip diamonds stay enabled (they only move the playhead, like the timeline ruler).
- T6-4 - Prev/next and strip consider only keys inside the clip's visible local range (keys kept beyond a trimmed edge are
  hidden); prev/next are disabled when there is no key in that direction. Jumps pause playback first.
- T6-5 - A drag commits only the fields it changed (an animated property the drag did not touch gets no new key); it is
  pinned to the playhead at the press and ends without committing if the playhead moves, the clip's keys/transform are
  replaced, the format/fps changes or the clip goes away.
- T6-6 - Scale 0 on canvas (M2): a corner drag from 0 uses the pointer distance / half-diagonal (bounded 0.02..20); the
  field shows 0 % and writes nothing until the user types.

## Tests and mutation checks
- `tests/keyframe-commands.test.ts` (12): stopwatch on/off one step each with the value kept and exact undo (JSON); locked
  and off-clip refusals as toasts with no step; static vs keyed `setValueAtCmd`; keyed X keeps resolved Y; key toggle (static
  ⇒ animate, add with shown value, remove; between-frame playhead on a key counts; off the clip: not pressed, refused);
  prev/next per target and over all targets, hidden keys outside the range, no history, pauses playback, a hand-edited key
  within KEY_EPS of the playhead frame is "here"; `dragPatch` (changed fields only, unnormalised rotation incl. wrap);
  `scaleFromZero` and `transformFor` routing; M3 lock-first message order.
- `tests/e2e/keyframes-ui.spec.ts` (4, on the pip project): stopwatch on Scale = one key and ONE step; typed 200 % at 1.5 s =
  second key; preview at 1.0 s shows the 150 % square (pixels at +130 green / +170 blue); the field follows scrubbing
  (130 at 0.8 s, frame-snapped); a corner drag at 1.0 s adds a THIRD key (~2.0) in ONE step and a snapshot of the live
  preview before release equals the committed frame after release (asserted max diff ≤ 1); stopwatch off keeps the shown
  value, removes keys, ONE step, undo restores project JSON exactly; typing off the clip ⇒ toast, project unchanged; locked
  layer ⇒ stopwatch/key/fields disabled; prev/next buttons and a strip diamond move the playhead (no history) and disable at
  the ends; key toggle add/remove one step each; Escape mid keyed drag ⇒ no change and the preview goes back; a keys-only
  edit mid drag ends it (release commits nothing); keyed rotation range ±36 000; Space from a mouse-focused stopwatch
  plays/pauses with no history step; an adjustment layer shows only the opacity row, a lower third all four.
- RED: the unit file failed on the missing module. The first e2e run started before the UI existed: the first two tests
  failed on the missing `kf-toggle-scale`; the dev server hot-reloaded my new code while that run was still going, so tests
  3-4 passed in it (their ability to fail is shown by the mutations below).
- Mutations (each restored from a scratch copy; all CAUGHT): `dragPatch` rotation normalised (unit); `keyAtPlayhead` without
  the on-clip check (unit); `keyJumpTime` without the KEY_EPS filter (unit); `transformFor` without the zero-scale branch
  (unit); M3 lock check removed (unit); `jumpToKeyCmd` not pausing (unit); drag not ending on a keys change (e2e prev/next);
  Preview back to `withClipTransform(live.transform)` (e2e: the live pixel stays at the keyed size); TransformFields value
  from `clip.transform` (e2e field value); TransformOverlay handles at the stored transform (e2e drag); drag start = stored
  transform (e2e key ≈ 1.33 not 2); drag commit through `setClipTransform` with the full transform (e2e: refused, no step).
  One survivor noted: the drag's initial `current` (only observable for a gesture that never moved) is not tested.

## E2E runs (sequential, `--trace off`)
keyframes-ui 4/4, inspector 4/4, pip 7/7, pip-drag 5/5, layers-ui 9/9, layers-ui-keys 7/7, overlays-ui 7/7,
transform-fields 11/11, rotation 3/3, effects-ui 8/8, editor 12/12, keyframes-render 4/4: 81/81 green, one spec at a time.
The full suite was NOT run (the controller runs it).

## Contract for Tasks 7-9
- Task 7: reuse `KeyframeControls` with `ids = { toggle: 'fx-<id>-<param>-kf', prev, next, key, strip }` (choose prev/next/
  key/strip ids in the same `fx-<id>-<param>-kf-…` family) and `target = { kind: 'effect', effectId, param }`; slider release
  ⇒ `setValueAtCmd(clipId, target, value)`; the shown value = `targetValueAt(clip, target, playhead, fps)` with the playhead
  subscribed only while animated (copy TransformFields' selector); update the two VideoEffectRow allowlist entries. Remember
  M1: `setValueAt` refuses non-animatable params even statically, so `mirror.mode` keeps `updateVideoEffectCmd`. The chroma
  key picker as keys = three `setValueAt` in ONE `apply` (write a dedicated command; `setValueAtCmd` is one apply per call).
- Task 8: `keyJumpTime(clip, null, t, fps, dir)` / `jumpToKeyCmd(clipId, null, dir)` are the `[` / `]` behaviour (visible keys,
  any target); `keyTimelineTime(clip, u)` places a diamond; `onClip` is the shared inside rule. Key selection must stay out
  of history.
- Task 9: `KeyframeStrip` diamonds are buttons (`kf-strip-key`, `data-time`); add the `kf-ease-open` affordance there (e.g. on
  a selected/current key) without changing the click = seek behaviour; `setEaseCmd` belongs in `keyframeCommands.ts`
  (file is 100 lines).
- Task 10: TransformOverlay is 103 lines; the motion path can mount inside `OverlayQuad`, which already has the resolved
  transform and `toCss`.

## Concerns
1. `tests/e2e/keyframes-ui.spec.ts` (214) and `tests/keyframe-commands.test.ts` (210) are slightly over ~200 lines.
2. The inspector rows add ~4 rows of 22 px under the transform grid for every picture clip (visible even when nothing is
   animated); a collapsed "Animate" disclosure could save space if it feels crowded in manual QA.
3. Prev/next/strip stay enabled on a locked track (T6-3); if the controller prefers "everything disabled", it is one prop.
4. The live-equals-commit pixel check compares downsampled whole-canvas snapshots (every 4th pixel) with tolerance 1.
