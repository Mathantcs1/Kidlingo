# Plan 5B Task 7 report: animation inspector, preset browser with animated previews, timeline bands, motion ghost

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1668 (129 files) | 1692 (133 files; +6 `preset-preview`, +5 `preset-search`, +5 `preset-swap`, +7 `motion-ghost`; `transform-readers` allowlist +6 entries) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| new e2e | n/a | `presets-ui` 6, `presets-browser` 5, `presets-canvas` 2 |
| related e2e (one at a time, `--trace off`) | n/a | see "E2E gate" |

Commits: `feat(ui): animation presets inspector and preset browser` + this report. Not pushed.

## Design (files)
- `src/ui/AnimationInspector.tsx` (47): section `anim-section` after Position and size for video/image/overlay/adjustment
  clips (none for audio), hint "Presets move the picture from the position above" (D3 rest rule), four `PresetSlot`s,
  and the browser of the slot being chosen. Locked track => every control disabled, title "Track is locked".
- `src/ui/PresetSlot.tsx` (63): `anim-slot-<slot>` (`data-preset`), name `anim-<slot>-name` ("None" when empty), Choose /
  Change `anim-choose-<slot>` (aria-haspopup, aria-expanded), Remove `anim-remove-<slot>` (one step), params when filled.
- `src/ui/PresetParams.tsx` (155): `PresetSlider` (range; local draft, ONE commit on the native `change` = release / key /
  fill, like 5A ParamSlider); `anim-<slot>-duration` ("Cycle" on the loop slot; hidden for Ken Burns, which spans the
  clip), `anim-<slot>-delay` (in/out), `anim-emphasis-at` (timeline time) + `anim-emphasis-here`, direction as a
  radiogroup `anim-<slot>-direction` with buttons `anim-<slot>-direction-<n>` (4 or 8), a slider `anim-<slot>-<param>`
  per other param (seed hidden: set once on choice), ease select `anim-<slot>-ease` (one step per choice; Spring commits
  with SPRING_DEFAULT params; "Custom" listed only when the stored ease is a bezier, e.g. Whip Out).
- `src/ui/PresetBrowser.tsx` (200): fixed popover beside the inspector (`preset-browser`, role dialog), `preset-search`,
  tabs `preset-cat-in|emphasis|loop|out|mine|favourites`, grid (role listbox, 3 columns) of `PresetTile`s. A tile applies
  to ITS slot (the tab's category) in ONE step, closes, focus returns to the opener. Escape closes without change. The
  root swallows every key (React stopPropagation: the window shortcut listener never sees Delete/S/Space pressed inside).
  Outside pointerdown closes. Search is focused on open (after placement); ArrowDown moves into the grid.
- `src/ui/PresetTile.tsx` (128): option `preset-tile-<key>` (`data-slot`, `data-animating`, aria-disabled + title reason),
  canvas `preset-preview-<key>` (120x68 CSS px x DPR, Canvas2D), star `preset-fav-<key>` (aria-pressed; tabIndex -1, F key on
  the focused tile). Only the tile the browser marks `animate` (hovered, else focused) runs a rAF loop on the 30 fps tile
  grid; all others and every tile under `prefers-reduced-motion` paint their still frame. The card's top edge is marked so
  a half turn reads.
- `src/ui/presetPreview.ts` (100, DOM-free): `TILE` (120x68 format, 30 fps), `CARD` (60 % width, 16:9), `cardClip(key,
  slot)` (synthetic image clip with the slot defaults; emphasis at 0.2 s; loop phase 0), `previewLength`, `previewFrame` /
  `previewCorners` (= `clipCorners(CARD, resolveClip(card, t, TILE).transform, TILE)`), `stillTime` (in 40 % / out 60 % of
  the window; emphasis and loop: the sampled frame furthest from rest, cached), `tileTime` (looped, snapped).
- `src/ui/presetSearch.ts` (28, DOM-free): case-insensitive substring; list name (Exit names in the Exit list) ranks above
  synonyms; ties keep library order; blank query keeps all.
- `src/ui/presetCommands.ts` (51): `setPresetCmd(clipId, slot, key)` (via `swapPreset`), `removePresetCmd(clipId, slot)`,
  `setPresetParamsCmd(clipId, slot, patch)`, `emphasisHereCmd(clipId)`: each `guard(() => apply(...))`, clipId first. The
  ONLY UI readers of the stored stack: `slotUse(clip, slot)` and `paramOf(use, key)`.
- `src/core/presetSwap.ts` (29, pure): `swapPreset(p, clipId, slot, key, t)` (ruling T7-1 below).
- `src/ui/presetFavourites.ts` (34): in-memory zustand store behind `useFavourites()` ({favourites, isFavourite, toggle};
  `PresetRef = {slot, key}`); Task 9 backs it with IndexedDB.
- `src/ui/MotionBands.tsx` (39) in ClipView (non-audio clips): `motion-band-in|out` from `motionWindows(clip)` (drawn
  windows incl. short-clip scaling), `motion-band-emphasis` over [at - lo, at - lo + duration] (clamped to the clip),
  `motion-band-loop` (striped 3 px line, full width). `pointer-events: none`, aria-hidden.
- `src/ui/motionGhost.ts` (65, DOM-free): `motionGhost(p, clip, t)` (drawn quad when the stack moves the picture away
  from its rest geometry; null for a pure fade, off the clip, no size), `pointInQuad`, `ghostHitAt(p, t, pt)` (topmost
  visible clip whose visible ghost contains the point).
- `src/ui/MotionGhost.tsx` (62): dashed outline `motion-ghost` (40 % opacity) for the ONE selected clip, mounted in
  Preview under the transform overlay; `useGhostSelect` on `.preview-stage`: a press that the transform overlay did not
  take (it stops presses on its handles/body), not on a motion key dot, released within the 4 px drag threshold on a
  ghost selects that clip (no history). A drag starting on a ghost does nothing; drags on the handles edit the rest
  transform as before.
- `src/ui/presets.css` (new; nothing added to styles.css). Inspector.tsx +2 lines, ClipView.tsx +3, Preview.tsx +3.

## E2E gate (one spec at a time, `--trace off`)
presets-ui 6, presets-browser 5, presets-canvas 2, inspector 4, pip 7, pip-drag 5, layers-ui 9, layers-ui-keys 7,
overlays-ui 7, adjustment-app 3, editor 12, keyframes-ui 4, keyframes-timeline 8: 79/79 green, no flake. Full e2e NOT run
(not required at Task 7; Task 8 runs it).

## Rulings (proposed for the ledger)
- T7-1 Swapping presets (the P5B note "decide and document"): choosing another preset for a FILLED slot keeps where it sits
  in time (in/out `delay`, emphasis `at`, loop `phase` and `count`) and the `direction` when the new preset has a
  direction param whose range contains it (Slide <-> Whip); duration, ease and every other param reset to the new
  preset's defaults (their meaning differs per preset). The browser says so ("Choosing another preset resets its
  settings (its timing and direction are kept)"). Same preset again = no step. One apply.
- T7-2 Ghost hit region (P5B-7 SHOULD, implemented): the canvas selects ONLY through ghosts of preset-moved pictures
  (opacity > 0, scale > 0, topmost first); static pictures stay unclickable on the canvas exactly as before (pip spec
  "empty canvas keeps the selection" unchanged). A moved picture under a static one is still picked (only moved pictures
  are candidates). The visible outline is drawn for the single selected clip only; the hit regions exist for every
  visible moved picture (including locked tracks: selection is allowed there).
- T7-3 Ghost visibility: shown when the drawn x/y/scale/rotation differ from the base at the playhead; opacity-only
  presets (Fade, Flash, Blink) draw on the handles and show no ghost.
- T7-4 A tile in another category than the opener's slot applies to that category's slot (note shown in the browser);
  Favourites hold {slot, key} refs (Fade In and Fade Out are separate). Search filters the current tab only.
- T7-5 Ease in the inspector is a native select (one step per choice), not the curve editor in "preset mode" (§7): the
  curve/spring editor for presets is left to Task 8 (spring fields). Loop `count` and `phase` have no control yet
  (count null = until the clip end); seed hidden.
- T7-6 Lower-third tiles: tiles draw the generic card (no overlay texture), so the built-in slide never appears in a tile;
  nothing to pass. The real lower third keeps Task 6's raw `builtIn` flags.

## Tests and mutation checks
- Unit (RED first: all four files failed on missing modules): `preset-preview` (28 entries; corners and opacity equal
  `clipCorners(resolveClip(card, t))` at 25 times each; card geometry; Slide In start one tile width left, Fade In 0, Fade
  Out ends 0; still frame inside the loop and away from rest for every entry; tile clock snapped/looped), `preset-search`,
  `preset-swap`, `motion-ghost`.
- e2e: `presets-ui` (Fade In via browser = ONE step, focus back to opener, preview pixel at 25 % of the window within 6/255
  of lime-over-blue at the resolver's opacity, undo removes; direction button / slider pointer drag (no step during the
  drag, one at release) / delay fill / ease select each one step, Whip swap keeps delay+direction; remove one step, undo
  restores clip JSON exactly, redo; emphasis "at playhead" one step and refused off the clip with a toast; adjustment layer:
  Fade/Blink enabled, Slide/Float aria-disabled with "Adjustment layers only fade" and a forced click applies nothing;
  sticker overlay takes Pop; audio clip has no section; locked track disables 7 controls, hidden track enabled).
  `presets-browser` (tabs/counts/Sink/My presets empty/favourites; search incl. synonym and empty message; keyboard: search
  focused, ArrowDown into grid, Delete and S inside change nothing, one tabindex=0 tile, arrows, Tab leaves the grid,
  Shift+Tab returns to the same tile, Escape closes + focus back, Enter applies ONE step; hovered tile canvas changes,
  unhovered still, exactly one animating; reduced motion: hovered tile still and non-blank). `presets-canvas` (band
  places/widths within 1.5 px of window x px/s; elementFromPoint on three band points is the clip; body drag from a band
  moves the clip, trim handle over the exit band trims, one step each; ghost at a Slide In first frame centred at the
  drawn x, same width as the handles' quad, gone at rest; click on it after deselecting selects with no history step; a
  drag from the ghost changes nothing; an Alt drag on the rest box moves the rest x and the ghost follows; a click on
  empty canvas keeps the selection).
- Mutations (all CAUGHT): ghost select call removed (presets-canvas ghost); bands `pointer-events: auto` (presets-canvas
  bands, after moving the probe points off the clip name: the first probe sat on `.clip-name` and let it survive);
  slider commits on `input` (presets-ui, steps during the drag); reduced-motion check removed (presets-browser); every
  tile animating (presets-browser x2); root key stopPropagation removed (keyboard: Delete deleted the clip); adjustment
  reason removed (presets-ui); swap carry-over guard removed (3 unit); ghost without the same-geometry check (unit); search
  without the label-over-synonym rank (unit).

## Contract for Tasks 8-10
- Task 8: the preset ease select can open the spring fields (reuse `SpringFields`); `slotUse`/`paramOf` are the only
  stack readers in src/ui (add any new reader to the audit). `useTransformDrag` is untouched: dragging still edits the
  rest transform; the ghost and its hit region sit in `MotionGhost.tsx` (Preview), not in TransformOverlay.
- Task 9: back `useFavourites()` (presetFavourites.ts) with the library record (`favourites: PresetRef[]`); "My presets"
  tab (`preset-cat-mine`) currently shows `preset-empty`; user tiles go in `PresetBrowser`'s `all` for `mine` (ids
  `preset-tile-user-<id>`); footer buttons `anim-copy`/`anim-paste`/`preset-save` belong in AnimationInspector (47 lines).
  PresetBrowser.tsx is at 200 lines: split (e.g. the keyboard handlers or the tab bar) before extending.
- Task 10: manual QA items below.

## Concerns
1. PresetBrowser.tsx is exactly 200 lines.
2. Default intensities make some tiles subtle (Jitter moves the card 0.5 px, Breathe 1.8 px): honest (same resolver),
   but they may look static in manual QA; exaggerating would break "a tile shows exactly what the clip will do".
3. The popover is fixed-positioned to the left of the inspector; on very narrow windows it is clamped to 8 px from the
   left and may cover the preview (manual QA).
4. Favourites are lost on reload until Task 9.
5. A moved picture covered by a static one is still selected by a click on the covered spot (T7-2).
6. Star buttons are not in the tab order (F on the focused tile toggles); manual QA for screen readers.
