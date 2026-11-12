# Plan 5 Task 8 report: timeline keyframe diamonds, key selection and keyboard

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1364 (99 files) | 1386 (101 files; +12 `key-drag`, +10 `key-selection`) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| new e2e | n/a | `keyframes-timeline` 8/8 |

Related e2e (one at a time, `--trace off`): keyframes-timeline 8, keyframes-ui 4, keyframes-effects-ui 9, editor 12, layers-ui 9,
layers-ui-keys 7, ux 4, gestures 3, dragdrop 3, focus-modality 7, keyframes-drag-cancel 1, pip-drag 5: 72/72 green. (There is
no `timeline.spec.ts` / `trim.spec.ts`; timeline drag/trim/ripple/delete live in `editor.spec.ts`.) The full suite was NOT run
(the brief said not to; the plan lists a full run at Task 8, so the controller should run it).
Commit: `029ccb3 feat(ui): keyframe diamonds, selection and keyboard on the timeline` (+ this report).

## Design (files)
- `src/ui/keySelection.ts` (75): non-history key selection `KeySel = { clipId, times }` (clip-LOCAL summary times) in its own
  small zustand store `useKeySelection` (store.ts untouched: `reconcileUi` was already extracted to `src/state/selection.ts` in
  Plan 4, and a separate store keeps the selection out of history by construction). Pure helpers: `visibleKeyTimes(clip)`
  (= `keyTimes` filtered by `keyVisible`; none for audio), `pickKey` (plain replaces, additive toggles within the clip),
  `isPicked`, `pruneKeySel(sel, p, clipSelection)` (same object when valid; drops times whose keys vanished or became hidden
  by a trim; NO_KEYS when the clip is gone/unselected), `selectedRefs(clip, times)` = `keyRefsAt` per time (one ref per
  animated target, so the chroma colour's three refs at one time are always all included), `followEditor` (a subscription to
  `useEditor`: a new clip-selection reference clears, undo/redo clears (detected as present === previous past tail / future
  head), any other project change prunes).
- `src/ui/keyDrag.ts` (78, DOM-free): `rowSummary(clip)` (diamond times + `before`/`after` flags for keys beyond the edges),
  `diamondX(clip, u, pps)` (D3: `(u − localRange[0])·pps` from the clip's left), `frameDelta` (px → whole frames),
  `clampDelta` (whole frames; every moved key stays in the visible range `[lo, hi)`, end exclusive like the strip),
  `snapDeltaToPlayhead` (the grabbed key snaps onto the playhead within 8 px, frame-rounded), `dragDelta` (the pipeline),
  `moveRefusal(p, clipId, refs, delta)` (runs `moveKeys` and returns its TimelineError message: live refusal preview).
- `src/ui/keySelectionCommands.ts` (83): `selectKeyCmd` (selection + `seekToKeyCmd`, no history), `deleteSelectedKeysCmd`
  (ONE `removeKeys` apply), `moveSelectedKeysCmd(delta)` (ONE `moveKeys` apply; the selection follows the moved keys),
  `deleteRouted` (keys first, else clips), `jumpKeyCmd(dir)` (`jumpToKeyCmd(keyClipId, null, dir)`; key clip = the key
  selection's clip, else the single selected clip), and the Task 9 hook `setEaseOpener(fn)` / `openEaseCmd()`.
- `src/ui/useKeyDrag.ts` (133): the diamond gesture. Press selects an unselected diamond (Shift/Ctrl/Cmd adds) so a drag of it
  moves it; past 4 px (`pastThreshold`) the drag becomes live (pauses playback); `live = { delta, rejected }` local state;
  release commits ONE `moveSelectedKeysCmd(delta)` (refusals = toast, diamonds snap back); Escape (window capture listener, so
  it runs before the editor's Escape-clears-selection), pointercancel/lostpointercapture, any project change or the key
  selection leaving the clip end it without committing. Click without drag: plain = select only this + seek; additive toggles.
  Locked track: nothing moves live (`rejected` styling), release calls the move so the core reports 'Track is locked'.
- `src/ui/KeyframeRow.tsx` (85): `keyframe-row` (data-clip-id) over the lower edge of each SELECTED clip, rendered by `Lane`
  as a SIBLING of the clip button (buttons cannot nest), hidden for audio clips, clips without keys, and clips narrower than
  `MIN_ROW_PX = 24`. Diamonds `keyframe-diamond` are buttons (Tab-reachable) with `data-time` (timeline time, follows the live
  drag), `data-selected`, `aria-pressed`, `aria-label` "Keyframe at 1.20 s"; arrows `keyframe-more-before/after`. Enter on a
  diamond selects it (if needed) and calls `openEaseCmd()`; double-click calls `openEaseCmd()` (for ONE time: the first click of the double-click reduced the selection to that diamond; Enter uses the whole selection).
- `src/ui/keys.ts`: new shortcuts `prevKey` (`[`), `nextKey` (`]`), `deleteKeys`; `keyRouted(s, keysSelected)` maps
  Delete/Backspace (and Shift+Delete/Backspace) to `deleteKeys` while keys are selected; `shortcutBlockedByRange` also blocks
  `deleteKeys` on sliders/pickers. `useShortcuts.ts` routes through `keyRouted`, maps the new commands, and Escape (not typing,
  not consumed) clears the key selection.
- `src/ui/useClipDrag.ts`: `swallowNextClick` exported (reused). `src/ui/Lane.tsx`: one line rendering the rows.
  `src/ui/animation.css`: row/diamond styles (z-index 2, `pointer-events: none` on the row, `auto` on diamonds).
- No core change, no data change.

## Rulings (proposed for the ledger)
- T8-1 - Key selection lives in its own non-history zustand store (`useKeySelection`), not in `useEditor`; it is cleared when
  the clip-selection REFERENCE changes (any click on a clip, the lane or a new selection), on undo/redo and on Escape, and
  pruned (not cleared) by any other edit. A drag commit re-selects the moved keys.
- T8-2 - Diamonds show on every selected picture clip (multi-selection shows several rows) but the key selection belongs to ONE
  clip; picking on another clip starts a new selection. `[` / `]` act on the key selection's clip, else on the single
  selected clip (nothing with 0 or ≥ 2 selected clips and no key selection).
- T8-3 - Delete/Backspace AND Shift+Delete/Backspace remove selected keys before clips (never ripple-delete a clip while keys
  are selected). A refused key delete (locked track) is a toast and does NOT fall back to deleting the clip. The toolbar
  Delete/Ripple buttons keep deleting clips (only the keyboard is routed).
- T8-4 - Drag: whole frames from the original key times, grabbed key snaps to the playhead within 8 px, clamped so every moved
  key stays on `[lo, hi)` (the end is off the clip, like the strip); an overlap with an unselected key of the same target is
  shown live (`is-reject`) and refused on release with the core toast ('Keyframes would overlap'), no history.
- T8-5 - Locked track: diamonds visible, focusable, click selects and seeks; drag shows no movement and release reports
  'Track is locked'; Delete reports 'Track is locked'. Hidden tracks behave normally (hidden affects picture only).
- T8-6 - Row hidden below 24 px clip width; diamonds sit over the clip's lower 12 px, above the trim handles (a key at the very
  clip start overlaps the start trim handle's lower part; the upper part still trims).

## Tests and mutation checks
- `tests/key-drag.test.ts` (12): summary times across transform/effect keys incl. KEY_EPS merge; hidden/edge flags (a key at
  the end is beyond it); sourceless local range; audio and static clips empty; `diamondX` sourced vs sourceless (D3);
  `frameDelta` at 25/30/60 fps; `clampDelta` both ends + end exclusive; playhead snap within/outside 8 px; `dragDelta`;
  `moveRefusal` (overlap, ok, locked).
- `tests/key-selection.test.ts` (10): pick/toggle; prune (same object, vanished, unselected, missing, hidden by trim);
  chroma three refs per time; store follows the editor (select+seek no history, prune on edit, clear on undo/redo/new clip
  selection); move ONE step + selection follows + overlap toast; `keyRouted`; Delete keys first then clip; locked refusal
  without clip fallback; `[`/`]` mapping and jumps (no history; nothing with no selection).
- `tests/e2e/keyframes-timeline.spec.ts` (8): diamonds at the right x (±1 px) for a sourced clip (start 1, in 0.5) and a
  sourceless adjustment (start 0.5, in 7 ignored), inside the clip's lower half; none for unselected and audio clips; click
  selects + seeks, Shift adds, clicking the clip body clears (clip stays selected), focus + Enter selects/seeks, Escape clears,
  no history; drag +30 px = +0.5 s in ONE step (live only during the drag), selection follows, the clip stays selected and the
  playhead unmoved, preview pixels follow the new curve (scale 1.667 at 2.0 s), Ctrl+Z restores project JSON exactly; drag
  onto another key: live `is-reject`, toast, JSON unchanged; Escape mid-drag: no change, selection kept; Delete removes the
  selected key (ONE step, opacity static at its value), the next Delete removes the clip; `[`/`]` walk 1.0 → 1.5 → 2.0 (stop)
  → 1.5 → 1.0 with no history; locked: select/seek ok, Delete and drag refused with 'Track is locked', JSON unchanged.
- TDD: both unit files were written first and failed (missing modules); the e2e spec was written after the UI and passed on its
  first run, so its ability to fail is shown by mutations.
- Mutations (restored from a scratch copy; CAUGHT unless noted): unit - diamondX using `clip.in` for sourceless; clampDelta end
  inclusive; snap threshold 0; no undo/redo clear; no clip-selection clear; prune using all key times (hidden kept); deleteRouted
  never keys-first; move not re-selecting; refs only the first target (chroma); keyRouted without rippleDelete; audio guard in
  rowSummary (after strengthening the test with an out-of-range key). e2e - Escape listener without capture (Escape test);
  useShortcuts without `keyRouted` (Delete test); locked live movement (locked test); diamondX sourceless (position test).
  SURVIVOR: removing `swallowNextClick` after a drag - in Chromium the committed move re-keys the diamond element so the
  trailing click never reaches a handler; kept as a guard, the e2e now asserts the clip stays selected and the playhead unmoved.

## Contract for Tasks 9-12
- Task 9: `setEaseOpener((clipId, refs) => …)` in `src/ui/keySelectionCommands.ts` registers the ease editor; Enter on a timeline
  diamond (selecting it first if unselected) calls it with `selectedRefs` of the WHOLE selection; a double-click opens it for a SINGLE
  time (its first click already reduced the selection to that diamond) (all targets,
  three chroma refs per time). `setKeyEase(p, clipId, refs, ease)` in ONE apply; the key selection survives the edit (pruning
  keeps times whose keys still exist). Register in an effect and unregister (`null`) on unmount. Enter currently
  `preventDefault`s the native click.
- Task 10: nothing here; `keyTimelineTime` / `seekToKeyCmd` are the shared seek helpers.
- Task 11: robustness specs should cover drag after split/trim (pruning drops hidden times) and keys selected across undo.
- Task 12: journey can use `keyframe-diamond` click + drag; QA checklist: diamonds at different zoom levels (row hidden < 24 px),
  Delete precedence, Shift-click multi-select, trackpad drag.

## Concerns
1. `tests/e2e/keyframes-timeline.spec.ts` is 204 lines (slightly over ~200).
2. With several clips selected, each shows a row; `[`/`]` then do nothing unless keys are selected (T8-2) - may surprise.
3. A key at the clip's first frame puts a diamond over the lower part of the start trim handle (T8-6); manual QA should judge.
4. The plan's Task 8 gate calls for a full `npm run e2e`; not run per the brief (controller to run).
5. `npm run build` prints a pre-existing Rolldown INEFFECTIVE_DYNAMIC_IMPORT warning (mediabunny), unrelated.


## Fix round 1
Multi-key move/delete unit + e2e tests (`tests/e2e/keyframes-timeline-multi.spec.ts`), `routeShortcut`/`COMMANDS` extracted to `src/ui/shortcutCommands.ts` (dead `deleteRouted` removed), key selection cleared while its row is hidden (`selWithoutHiddenRow`), Escape that cleared the selection calls `preventDefault`, `deleteKeys` range-guard test.
