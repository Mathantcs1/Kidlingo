# Task 10 report: effects UI (stack editor, looks gallery, LUT picker)

Commit: `feat(ui): effects inspector, looks gallery and LUT picker`.

## What was built
- `src/ui/videoEffectCommands.ts` (65 lines): `addVideoEffectCmd(clipId, type, ref?)`, `updateVideoEffectCmd`, `removeVideoEffectCmd`,
  `moveVideoEffectCmd`, `applyLookCmd`, `setKeyColourCmd(clipId, effectId, '#rrggbb')`; each is `guard(() => apply(...))` = one undo step.
  Pure helpers: `hexToKey`/`keyToHex`, `addMenuGroups()` (available effects grouped by schema group, `lut` excluded), `lutStatus`.
  Deviation from the plan signature: `clipId` is the first argument (like the audio commands) instead of the implicit selection.
- `EffectsInspector.tsx` (89), `VideoEffectRow.tsx` (149), `LooksGallery.tsx` (29), `LutPicker.tsx` (69), `effects.css`; mounted in
  `Inspector.tsx` below the transform fields (144 lines) for non-audio clips.
- Add menu `fx-add` (optgroups by group, unavailable hidden) + `fx-add-button`; Enter on the select or the button adds.
- Rows: `fx-<id>-toggle|up|down|remove|<param>`; sliders keep a local draft and commit ONCE on the native `change` event.
  Chroma key: native `<input type=color>` (`fx-<id>-colour`) commits keyR/G/B in one apply, plus the neutral-colour hint
  (`fx-<id>-hint`); the three key sliders are replaced by the picker. Mirror mode shows its name. Note "Effects run from top to bottom" (`fx-order-note`).
- Everything disabled when the track is locked or the project not ready. 9th effect: existing refusal toast "At most 8 effects per clip".
- Looks: `fx-look-<key>` (nine), one step, Undo restores exactly.
- LUTs (ledger extras): (a) `fx-lut-remove-<id>` removes an unused LUT (used one refused with the in-use message), (b) a `.cube`
  chosen/dropped on the media bin shows an info toast ("Added the LUT ..."), bin input `accept` now includes `.cube`, (c) LUT list shows
  the name plus the file name; new optional `MediaRef.fileName` (set by `importLut`; no data version bump, older LUTs just lack it) and a
  Missing badge on the list and on a LUT effect row (`fx-<id>-missing`), (d) chroma key hint.
- `src/ui/keys.ts`: the Plan 3 range guard now also covers `type=color` (Delete/Backspace/S in the picker no longer delete/split).
- Picker: `fx-lut-import` (file input, `.cube`), `fx-lut-select-<mediaId>` ("Use" adds a LUT effect with that file).

## Tests
- Unit `tests/video-effect-commands.test.ts` (10 tests; written first, RED on missing module): one undo step per command, no-op adds none,
  look one step + exact undo, 9th refused with toast, lut needs a file, locked refuses, key colour one apply, hex round trip, menu groups, lutStatus.
  `tests/ui-helpers.test.ts` +1 assertion (colour guard).
- e2e `effects-ui.spec.ts` (8) and `effects-ui-lut.spec.ts` (3) + `effects-ui-helpers.ts`: brightness drag changes the preview pixel and is
  ONE undo step; toggle off in one step and pixel returns; reorder (invert/colour) changes the pixel; Teal & Orange one step + exact Undo;
  9th effect toast; locked track disabled; keyboard (Enter, arrows, Delete/Backspace in slider); chroma colour + hint; LUT import/names/use/
  refuse/remove; missing badge; bin feedback and a bad .cube message.
- Mutation checks (each failed, then reverted): colour dropped from the key guard -> keyboard/chroma tests fail; slider commit on `input` -> brightness one-step test fails.
- Gate: `npm test` 76 files / 1072 tests, typecheck, build OK, `grep -rl __clipforge dist` empty.
- e2e one at a time, all green: effects-ui 8, effects-ui-lut 3, audio-ui 8, inspector 4, layers-ui 9, layers-ui-keys 7, import 6, session 9.

## Concerns
- The e2e specs passed on first run after implementation (no UI existed before, so RED was trivial); ability to fail is shown by mutation checks.
- A LUT effect cannot be re-pointed at another LUT (remove and re-add); an effect on a locked clip hides nothing, it is only disabled.
- The "Missing" indicator reflects `MediaRef.missing`/removed media, not a runtime load failure (that still gets the preview toast from Task 6).
- Applying a look replaces the whole stack (labelled in the gallery); no confirm, Undo restores.
- Not pushed.
