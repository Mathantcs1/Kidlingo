# Task 13 report: overlay UI (menu and inspector)

Status: DONE. Commit `feat(ui): overlay menu and inspector` (code, tests) plus this report. Not pushed.

## What was built
- `src/ui/overlayCommands.ts` (42): `overlayTrackFor(p, activeTrackId)` (pure), `addOverlayCmd(type)` (playhead, ONE `apply`,
  selects the new clip, info toast when the only layers are hidden), `updateOverlayCmd(clipId, patch)` (clipId-first, one
  step, same-reference no-op adds none); all through `guard`.
- `src/ui/OverlayMenu.tsx` (70): toolbar button `overlay-add` (aria-haspopup/expanded) opening a `role=menu` of
  `overlay-add-<type>` items; Escape and outside click close it. Mounted in `Toolbar.tsx` (141 lines).
- `src/ui/OverlayInspector.tsx` (113), mounted in `Inspector.tsx` (152) for overlay clips: `overlay-text`, `overlay-subtext`
  (draft, commit on Enter/blur, Escape reverts, no step when unchanged), `overlay-colour`, `overlay-accent` (native colour
  input, uncontrolled, commit on native `change`; Delete/Backspace guarded by the existing `color` key guard),
  `overlay-sticker` (select). Only the fields a type uses are shown (lower third: title, subtitle; subscribe: button text;
  bar and sticker: none) with type-specific colour labels. Disabled when locked/not editable.
- `ClipView`/`overlays.css`: `clip-overlay` gets an amber striped look.
- `overlayMath.sourceSizeFor(clip, media, frameInfo?, format?)`: overlays return `overlayBaseSize(type, format)`;
  `overlayTarget` passes `p.format`, so overlays get the on-canvas move/scale/rotate handles.
- `core/timeline.trimClip`: start trim of an overlay may move either way (grows to the left); `in` is forced to 0 and the end
  stays put.

## Rulings
- Ruling: T13-1 — New overlays go on the active video layer if visible, else the topmost visible unlocked video layer, else
  the topmost visible one (a locked one is then refused with "Track is locked"), else (all hidden) the topmost layer plus an
  info toast saying the overlay will not show. Cost if wrong: an unexpected layer (move it with layer controls).
- Ruling: T13-2 — Overlay animation runs from `clip.start` and ignores `in`; trimming the START of an overlay therefore
  re-times its slide-in (lower third) and bar fill (clip-relative), and `trimClip` sets `in: 0, out: duration - delta` for
  overlays so a start can also be dragged earlier. The right half of a split keeps `in` until its start is trimmed (then 0).
  Cost if wrong: none visible (`in` is unused for overlays).
- Ruling: T13-3 — Text fields commit once on Enter/blur (not per keystroke); the colour pickers on the native `change`.
- Ruling: T13-4 — Fields a type does not draw are hidden rather than disabled.

## Tests
- Vitest `tests/overlay-commands.test.ts` (11, RED first on the missing module): add one step + selection + undo, new layer when
  no room, locked toast with no step, visible-layer preference and hidden hint, `overlayTrackFor` cases, update one step /
  same value none / undo / locked, `sourceSizeFor` + `overlayTarget` for overlays, trim earlier/later/split-half/negative.
- e2e `tests/e2e/overlays-ui.spec.ts` (7, 211 lines): menu + one step + preview pixel + undo; text/subtext/colour/accent each
  one step (typing and Backspace in the field add none and do not delete the clip, Escape reverts), Delete/Backspace on the
  focused colour input keep the clip, preview colour follows; sticker select; transform field and PiP move/scale handles
  (one step each); trim both edges, move, split, no volume/audio panel and Detach disabled; locked layer (fields disabled,
  Add refuses with the toast, no step); reload restores exactly.
- Mutations (each failed, restored): text commit on every keystroke, `color` removed from the key guard, `sourceSizeFor`
  overlay branch (no handles), `trimClip` overlay branch (2 unit + e2e).
- Gate: `npm test` 85 files / 1160 tests, typecheck, build OK, `grep -rl __clipforge dist` empty. e2e one at a time, all
  green: overlays-ui 7, overlays-app 3, overlays-render 6, inspector 4, layers-ui 9, layers-ui-keys 7, effects-ui 8, pip 7,
  pip-drag 5, transform-fields 11.

## Concerns
- The e2e passed on first run after implementation (no UI existed): ability to fail is shown by the mutation checks.
- A light box colour on a lower third gives poor text contrast (T12-6 note): no warning added.
- `overlays-ui.spec.ts` is 211 lines (slightly over the ~200 target); Toolbar 141, Inspector 152.
- Dragging an overlay's start edge below 0 still shows the core "Trim extends beyond source" toast.
- Native colour picker popup is not driven in e2e (value set via `fill`, which fires `change`).
- Task 13a: `OverlayMenu.tsx` needs the "Adjustment layer" entry; `addOverlayCmd` placement helper is reusable.
