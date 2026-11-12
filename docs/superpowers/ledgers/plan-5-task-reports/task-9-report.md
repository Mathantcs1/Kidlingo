# Plan 5 Task 9 report: ease presets and the cubic-Bezier curve editor

Branch `feature/plan-5-animation`. Commit `feat(ui): easing presets and curve editor` (code) plus this report.

## What was built
- `src/ui/easeEditorMath.ts` (DOM-free): `FRAME` (plot 160 x 80 px per unit, 18 px margin, y range [-1, 2] so the unit square sits inside
  a taller plot), `toSvg` / `fromSvg` (round trip, clamped x in [0, 1], y in [-1, 2]), `clientToSvg` (scaled viewBox),
  `nudgeHandle` (0.01, Shift 0.1, rounded to 3 decimals so repeats never drift, clamped), `withHandle`, `bezierOf` (handles of linear,
  easeIn/Out/InOut, bezier; null for hold/back/elastic/bounce), `parseField`, `curvePath` (samples `easeAt`; `hold` is a real step).
- `src/ui/easeEditorStore.ts`: small zustand slice (`openEase(clipId, refs)`, `closeEase()`); remembers the focused element
  (returned to on close) and the anchor rect for placing the panel.
- `src/ui/EaseCurve.tsx`: the SVG (unit square, diagonal, curve `ease-curve` with `data-kind`, stems, two handles
  `ease-handle-1/2` as focusable `role="slider"` circles). Pointer drag and arrow nudges only DRAFT; the release commits.
- `src/ui/EaseEditor.tsx`: `EaseEditorHost` (mounted in `App.tsx`; registers `setEaseOpener(openEase)` and unregisters on unmount)
  and the panel: presets `ease-preset-<kind>` for all nine kinds (Custom = `ease-preset-bezier`), numeric fields `ease-x1..y2`,
  `ease-close`, `ease-editor` (role dialog, non-modal). Placed under (or over) the opening diamond, kept inside the window.
- `keyframeCommands.ts`: `setEaseCmd(clipId, refs, ease)` = ONE `guard(apply(setKeyEase))`; `groupRefsAt(clip, group, u)`.
- Entry points: Enter / double-click on a timeline diamond (Task 8 hook, ALL refs of the selected key times, three chroma refs per
  time); the inspector row button `kf-ease-open` (this property's group at the key under the playhead; aria-disabled otherwise);
  double-click on a strip key (`kf-strip-key`).
- CSS: new `src/ui/ease.css`; `animation.css` row grid widened to five 24 px buttons.

## Rulings (implementer)
- T9-1: presets commit immediately (one step each); picking the preset a key already has adds no step (core no-op, same reference).
- T9-2: handles are shown for linear, easeIn/Out/InOut and bezier (they are exact Bezier curves). Dragging, nudging or typing on a
  preset converts that segment to `{kind: 'bezier'}` starting from the preset's handles (linear starts at 0.25/0.25/0.75/0.75, an
  exact linear). Hold/back/elastic/bounce show no handles and disabled fields; "Custom" on them starts from the CSS `ease`
  (0.25, 0.1, 0.25, 1).
- T9-3: a drag/nudge that ends exactly on the preset's own handles commits nothing (a press without moving never converts a preset).
  Returning the pointer to the same pixel is not exact (sub-pixel, 3-decimal rounding), so that case commits a tiny custom change.
- T9-4: one undo step per gesture: drag = release; arrows = key release (auto-repeat only drafts; a blur mid-nudge also commits);
  numbers = Enter or blur; Escape (window capture listener) cancels everything pending and closes; a press outside commits a pending
  number (blur) and closes. Escape in the editor never reaches the global shortcuts, so it does not drop the key selection.
- T9-5: locked track: the editor opens read-only (presets/fields/handles disabled, note "Track is locked"); nothing can commit.
- T9-6: mixed eases (several keys that differ): the panel shows the first key's ease and says so; applying any ease sets all.
- T9-7: the editor closes by itself when its keys no longer exist (undo, delete, trim).
- T9-8: the panel is a floating non-modal dialog; focus goes to the active preset on open and back to the opener on close.
- T9-9: id `kf-ease-open` is used literally on every property row (scope with the row); the plan names it once.

## Tests
- `tests/ease-editor-math.test.ts` (10): round trips over the grid, clamping, scaled viewBox, nudge steps/drift/clamp, parse, bezierOf, curvePath.
- `tests/e2e/keyframes-ease.spec.ts` (4) and `keyframes-ease-keys.spec.ts` (6), helpers in `ease-helpers.ts`: easeIn at the quarter
  point matches `easeAt` (measured 0.0945 vs 0.0935, tolerance 2/255 + 0.005) in ONE undo step incl. all properties at that time;
  handle drag commits once with live curve/number and the preview follows the stored curve; numeric Enter/blur/clamp/invalid;
  arrows (3 presses = 3 steps; held = 1; Shift 0.1; playhead unmoved); Escape (plain, typed number, mid-drag) and focus return;
  several selected keys one step and one undo; hold step + jump at the next key's frame; locked; inspector button and strip
  double-click; chroma three refs.
- Mutations caught: commit during drag, commit on keydown, Escape without the cancel flag (each fails its test).

## Concerns
1. The panel can cover the timeline/diamonds it was opened from when the viewport is short (it flips above the anchor when it does not fit below).
2. Mixed-ease display is minimal (first key shown, a note).
3. `Enter` handling on the number inputs relies on the global shortcut `isTyping` guard (number inputs are text entry); verified by the e2e.
4. Strip/row buttons grew a 5th column; narrow inspectors may clip the strip (manual QA).

## Contract for Tasks 10-12
- Task 10 (motion path): nothing needed from here. Task 11: robustness specs may open the editor via `openEase(clipId, refs)`
  from `easeEditorStore.ts` (the host must be mounted, as in `App`); the editor closes itself when its keys vanish.
- Task 12: journey can use `ease-preset-*`, `ease-handle-1/2`, `ease-x1..y2`, `kf-ease-open`; QA checklist additions: panel placement
  on small windows, focus return, handle drag with a trackpad, screen-reader reading of the slider handles.

## Gate
npm test 1402 (102 files; +10 new), typecheck, build, `grep -rl __clipforge dist` empty. e2e one at a time (--trace off): keyframes-ease 4,
keyframes-ease-keys 6, keyframes-timeline 8, keyframes-timeline-multi 3, keyframes-ui 4, keyframes-effects-ui 9, editor 12,
layers-ui-keys 7, focus-modality 7: all green. One Task 8 test changed on purpose: `keyframes-timeline.spec.ts` 'click selects and
seeks...' now expects Enter on a diamond to open the editor, the first Escape to close it (selection kept, focus on the diamond)
and the second Escape to drop the key selection (file is now 209 lines). No full e2e run (per brief).
