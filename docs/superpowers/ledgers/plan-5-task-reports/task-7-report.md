# Plan 5 Task 7 report: effect-parameter keyframes in the effects inspector

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1346 (97 files) | 1364 (99 files; +7 `target-groups`, +11 `effect-keyframe-commands`; `transform-readers` allowlist updated) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| new e2e | n/a | `keyframes-effects-ui` 9/9 |

Related e2e (one at a time, `--trace off --workers 1`): keyframes-effects-ui 9, effects-ui 8, effects-ui-lut 3, adjustment-app 3,
keyframes-ui 4, keyframes-render-fx 5, inspector 4, layers-ui-keys 7: all green. Full suite NOT run (controller runs it).
Commit: `feat(ui): keyframes for effect parameters` (+ this report).

## Design (files)
- `src/core/targetGroups.ts` (new, 24): `setTargetsAnimated(p, clipId, targets, on, t)`, `setTargetsAt(p, clipId, entries, t)`,
  `setEffectParamsAt(p, clipId, effectId, params, t)`: folds of `setAnimated` / `setValueAt`, so a group is ONE pure edit (one
  `apply`) and a refusal on any member (locked, off the clip, non-animatable) refuses everything. A partly animated group writes
  keys where animated and the static value elsewhere. No new data, no migration.
- `src/ui/effectParams.tsx` (new, 120; split out of `VideoEffectRow.tsx`, now 67): `ParamSlider` and `KeyColour`.
  `useShown(clip, effect, key, fallback)` = `targetValueAt` at the playhead while the param is animated (playhead subscribed only
  then), else the stored value. Slider keeps its draft and commits once on the native `change` event through
  `setEffectParamCmd`. Every animatable param renders `KeyframeControls` below the slider with ids
  `fx-<id>-<param>-kf` (stopwatch), `-kf-prev`, `-kf-next`, `-kf-key`, `-kf-strip`. `mirror.mode` (`animatable: false`) renders none.
  The chroma key colour keeps its picker (`fx-<id>-colour`) and gets ONE group row `fx-<id>-colour-kf[-prev|-next|-key|-strip]`
  (keyR leads for pressed/prev/next/strip; stopwatch and diamond act on all three). The three key sliders stay hidden as before.
- `src/ui/videoEffectCommands.ts`: `KEY_TARGETS(effectId)`; `setEffectParamCmd(clipId, effectId, param, value)` (animated:
  `setValueAtCmd`, else `updateVideoEffectCmd`, so mirror.mode and static params are unchanged; M1 respected);
  `setKeyColourCmd` now decides INSIDE its single `apply`: animated colour = `setEffectParamsAt` (three keys at the playhead),
  static = `updateVideoEffect` exactly as before.
- `src/ui/keyframeCommands.ts` (118): `toggleAnimatedCmd` and `toggleKeyAtPlayheadCmd` take an optional `group` (default `[target]`,
  so transform rows behave exactly as in Task 6). `KeyframeControls` gets an optional `group` prop.
- `EffectsInspector` passes the whole `clip` to `VideoEffectRow` (needed for keys). Removing an effect, applying a look, moving an
  effect needed no code: keys live on the effect (D2) and Task 4's edits already drop/keep them; Task 7 only pins it with tests.
- Reader audit: the two VideoEffectRow reads (`const stored = effect.params[def.key]`, `keyToHex({ keyR: effect.params.keyR`) are
  gone; ONE new entry `src/ui/effectParams.tsx` `(effect.params[key] ?? fallback)` ("resolved value at the playhead when animated,
  the stored value on purpose when not"), count 1. `VideoEffectRow.tsx` `schema.params.filter(` unchanged (1).

## Rulings (proposed for the ledger)
- T7-1 - Static effect params keep going through `updateVideoEffect` (`setEffectParamCmd` only uses `setValueAt` when animated), so
  M1 never bites and a non-animatable param can never reach `setValueAt`.
- T7-2 - The chroma key colour is ONE animated group (stopwatch/diamond/strip act on keyR/G/B together); prev/next/pressed state
  follow keyR, which is valid because every colour write goes through the group edits. A hand-edited save with only some of the
  three animated still renders correctly and edits per param (`setTargetsAt` is per target).
- T7-3 - Held arrow keys on a slider: same as Plan 4/Plan 3 (`change` fires per key press in Chromium), i.e. each press is one commit
  = one step; on an animated param a press at a playhead that already has a key replaces that key (still one key, one step per press).
  No new coalescing was added (it would change the static Plan 4 behaviour; the lead's "one step per release" is met per press-release).
- T7-4 - Effect keyframe edits (stopwatch, diamond) follow the slider's disabled state (locked track, project not ready, or the effect switched off); previous/next/strip stay available whenever the param is animated (same rule as T6-3).

## Tests and mutation checks
- `tests/target-groups.test.ts` (7), `tests/effect-keyframe-commands.test.ts` (11: static/animated/off-clip/mirror param commands, chroma
  static = one static step, animated = three keys in ONE step with exact undo, off-clip refusal writes nothing, group stopwatch off keeps
  the shown colour, group diamond add/remove one step each, remove effect with keys + exact undo, look over an animated stack + exact undo).
- `tests/e2e/keyframes-effects-ui.spec.ts` (9): brightness -0.5 -> 0.5 (field and preview follow; midpoint within 2/255 of the plain
  image; stored value untouched; strip shows 2 keys; undo one key per step), one key per drag release and per arrow press, key diamond
  pressed on a key, next jumps with no history, locked track disables stopwatch/key/slider but not previous, typing off the clip =>
  toast and no change, mirror.mode has no stopwatch and still edits statically, remove effect + undo (project JSON equal), look +
  undo (JSON equal), chroma colour group (three keys per commit, one step, stored colour untouched, picker shows the interpolated
  #800080, stopwatch off one step), adjustment layer params animate (preview pixel follows), overlays have no `fx-panel`/`-kf` ids.
- TDD note: I wrote the pure group edits and their test file together (the test passed on first run), then the command tests (written
  before the commands, RED by missing exports) and the e2e spec (RED by missing ids in spirit; run after the UI existed). Ability to
  fail is shown by these mutations, all CAUGHT and restored: slider value from the stored param (e2e field value); `setEffectParamCmd`
  never using `setValueAtCmd` (2 unit tests); `setKeyColourCmd` always static (3 unit tests); group diamond removing only keyR's key
  (unit); `setEffectParamsAt` folding only the first param (6 unit tests); stopwatch rendered for mirror.mode (e2e).

## Contract for Tasks 8-9
- Task 8: effect keys are ordinary `Keyframe[]` on `effect.keys[param]`; `keyTimes(clip)` / `keyJumpTime(clip, null, ...)` already include
  them (Task 4/6), so summary diamonds, `[` `]` and Delete routing need no effect-specific code. A diamond's KeyRefs for an effect are
  `{ target: { kind: 'effect', effectId, param }, t }`; the chroma colour contributes three refs at the same time (use `keyRefsAt`).
- Task 9: `KeyframeStrip` is shared by effect rows (`fx-<id>-<param>-kf-strip`); a key's ease applies per param, so the chroma colour's
  ease editor must pass all three refs (use the group via `KEY_TARGETS(effectId)`); `setEaseCmd` can take a ref list.

## Concerns
1. Effect rows now show two extra lines per animatable param (about 22 px each) even when nothing is animated: a long stack gets tall
   (a collapsed "Animate" disclosure per row is the obvious fix if manual QA finds it crowded; one prop in `ParamSlider`).
2. `tests/e2e/keyframes-effects-ui.spec.ts` is 229 lines (over ~200); `addEffect2` in it duplicates `addEffect` for the adjustment
   layer (the helper reads clip 0, which is the image clip there).
3. A typed/dragged draft on a keyed slider is dropped if the playhead moves before release (same as Task 6 concern 3); data-safe.
4. Brightness is not additive 1:1 in pixel terms, so the spec asserts relative ordering plus the exact midpoint (identity), not absolute
   channel values at the ends.
