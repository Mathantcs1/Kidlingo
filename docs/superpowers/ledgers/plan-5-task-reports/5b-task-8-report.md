# Plan 5B Task 8 report: loop and spring controls, on-canvas motion path editing, orient toggle

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1692 (133 files) | 1722 (138 files; +15 `path-drag-math`, +5 `orient-toggle`, +4 `spring-ui`, +4 `motion-path-cycles`, +2 `drag-stale`; `motion-path-math` and `transform-readers` updated) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| new e2e | n/a | `keyframes-loops-ui` 4, `keyframes-spring-ui` 4, `path-edit` 6, `path-edit-orient` 2 |
| related e2e (one at a time, `--trace off`) | n/a | keyframes-ease 4, keyframes-ease-keys 6, keyframes-path 10, keyframes-path-drag 3, keyframes-ui 4, presets-ui 6, presets-canvas 2, pip 7, pip-drag 5, inspector 4, layers-ui 9, overlays-ui 7, editor 12, keyframes-effects-ui 9, transform-fields 11, presets-browser 5: all green, no flake |

Commit: `d1ea3e4 feat(ui): key loops, spring easing and curved path editing` (+ this report). Not pushed. The FULL e2e was
NOT run (per the brief: the controller runs it after review; canvas pointer routing touches every PiP spec).

## Design (files)
- **Loops.** `src/ui/KeyLoopControl.tsx` (new, 84): under each animated `KeyframeControls` row (grid row 2), a select
  `kf-loop-<prop>` / `fx-<effectId>-<param>-loop` (No loop, Repeat, Ping-pong, Continue) and a count field
  `kf-loop-count-<prop>` / `fx-…-loop-count` (placeholder "∞"; empty = `count: null`; Enter/blur commits; a non-number keeps
  the stored count). Hidden below two keys; it reads the STORED loop (`targetLoop`), so an inert loop kept on a one-key target
  reappears as it was when a second key arrives. A hint `kf-loop-<prop>-hint` shows when the playhead is past the last key of a
  looped target ("an edit here adds a key and lengthens the loop", R3-8). `setLoopCmd(clipId, group, loop|null)` in
  `keyframeCommands.ts` folds `setKeyLoop` over the group (the chroma colour's three params loop together) in ONE apply.
  `KeyframeIds` gained `loop` / `loopCount` (transform and effect id builders updated).
- **Spring.** `src/ui/SpringFields.tsx` (new, 105): chips `<prefix>-gentle|snappy|bouncy|wobbly` (aria-pressed on an exact
  match; the current spring again = no step), fields `<prefix>-stiffness|damping|mass` (draft text, commit on Enter/blur,
  clamped to `SPRING_LIMITS`, unchanged = no step), note `<prefix>-note` = `springNote(s, seconds)` when
  `springResidual > 0.02`. Prefix `ease-spring` in the ease editor; `anim-<slot>-spring` under the preset ease select
  (PresetParams, seconds = the preset's duration). `EasePanel.tsx`: the `OFFERED` filter is gone (all ten kinds); `choose('spring')`
  commits `{kind:'spring', spring}` with the shown spring's params (or SPRING_DEFAULT); the spring replaces the four Bézier
  fields; the curve is drawn with the SEGMENT's seconds (`segmentSeconds(list, t)` in `easeEditorMath.ts`; `curvePath(e, f,
  samples, seconds)`; `EaseCurve` takes `seconds`). The panel's window behaviour moved verbatim to `useEasePanelChrome.ts` to
  make room (EasePanel 191 -> 157).
- **springResidual guard (P5B-3).** `src/core/spring.ts`: `springResidual(s, Infinity)` = 0 for a damped spring, 1 for
  damping 0 (cos(∞) was NaN); other invalid seconds read as 1 like `springEase`; a non-finite result reads as 1.
- **Path editing.** `src/ui/pathDragMath.ts` (new, DOM-free): `pathDragStarted` (4 px, the shared `pastThreshold`),
  `draggedKeyXY` / `draggedTangent` (start + pointer travel in format px: no jump), `shownTangents(list, i)` (only sides
  with a segment; stored, else Smooth path's default from the now exported `smoothKey`, marked `empty`),
  `tangentDragPatch(list, i, side, v, alt)`, `isCorner`, `cornerTogglePatch`. `src/ui/usePathDrag.ts` (new): the gesture
  (pointer capture, threshold, live `LivePath {clipId, change}`, ONE `commitPathChangeCmd` on release, Escape / cancel /
  lost capture / blur / `isStaleDrag` end it without commit, Alt pressed or released mid-drag re-applies, playback paused on
  activation, `consumeClick` so the click after a drag does not seek). `src/ui/pathCommands.ts` (new):
  `commitPathChangeCmd` (setKeyPosition and/or setKeyTangents = exactly what `withLivePath` showed), `smoothPathCmd`,
  `toggleCornerCmd`, `setOrientCmd`. `src/ui/PathHandles.tsx` (new): the keys layer (dots + tangent handles
  `motion-tangent-in|out` with stems, `data-empty` for defaults, `data-corner` on dots). `MotionPath.tsx` now composes the
  line (plus faint `motion-path-cycle` polylines), the children (handles), `PathHandles` and the toolbar chip `mp-smooth`
  (top-left of the canvas box; with `mp-loop-hint` when more Continue cycles exist than drawn). `Preview.tsx` keeps
  `livePath` and renders `pathShown = withLivePath(project, …)` (then the transform live value on top); the overlay, the
  path and the ghost receive `pathShown`, so dots, handles and the picture follow a path drag and equal the commit.
- **Orient.** `src/ui/OrientToggle.tsx` (new): checkbox `kf-orient` after the keyframe rows (picture clips with position
  keys; disabled below two keys unless it is on). `setOrientAt(p, clipId, on, t)` in `src/core/orientBake.ts`: on =
  `setOrient`; OFF = `setOrient(false)` + `bakeDroppedHeading` at the playhead (clamped onto the clip like `removeKeys`).
- **M4 (live drag of an oriented, position-keyed clip).** `TransformOverlay.liveHandles`: for a KEYED clip the handles
  during a transform drag are `resolvedTransform` of `withLiveValue(project, …)` at the drag's playhead (the release's
  result), so they turn with the new heading; a static clip keeps `live.transform` (pip specs unchanged).
- **Offset-loop cycles on the path.** `motionPathMath.offsetCycles(clip)`: shifts c·(last − first) of the Continue cycles
  that start inside the visible range, at most `MAX_DRAWN_CYCLES` (3) and the count; `moreCycles` beyond. The cache
  signature now includes the position loop (a loop change keeps the same key list).
- **dragStale.** `DragSnapshot.storeMotion?` (optional): when snapshotted, a replaced preset stack also ends the drag.
  The transform drag and the path drag both snapshot it; the path drag's key list is covered by `storeKeys`.
- CSS in the new `src/ui/motionEdit.css` (loop row, tangent handles, cycles, chip, orient) and `ease.css` (spring).
  `animation.css` (217) and `presets.css` untouched. `PresetBrowser.tsx` untouched (200).

## Rulings (proposed for the ledger)
- T8-1 Orient OFF from the inspector bakes the heading at the playhead into the stored rotation (keyed rotation: every
  key shifted; refused beyond ±KEYED_ROTATION_LIMIT as R4-11), so the frame at the playhead keeps its picture - the
  stopwatch-off rule. `setOrient(false)` in core stays non-baking (by design, R4-11); the UI uses `setOrientAt`.
- T8-2 Tangent drags on a SMOOTH key pass BOTH tangents (the other one opposite, keeping its length, or its Smooth-path
  default length when absent), so a smooth key never becomes a one-sided visual corner; an end key drags its one handle;
  Alt (held at any time during the drag) or a broken key moves one handle (Alt sets `broken`). A handle dropped on its key
  removes that tangent.
- T8-3 Handles are shown for the key under the playhead only (sides that have a segment); absent tangents show at the
  Smooth path default (dashed, `data-empty`), so a corner can be pulled into a curve directly.
- T8-4 Corner / smooth (double-click a dot): corner = broken, or a side with a segment lacks a tangent. Corner -> smooth:
  a broken key with both tangents re-aligns (`broken: false`), otherwise that key gets Smooth path's tangents; smooth ->
  corner removes both tangents (straight segments meet at the key). The dot under the playhead lets presses through to the
  clip (5A rule), so a double-click within its reach on the clip body toggles that key; a clicked dot also keeps the pointer
  for 600 ms (`data-armed`) so a double-click's second press reaches it even after the first click seeked onto it.
- T8-5 The spring editor draws and warns for the FIRST ref that owns a segment (a last key owns none); refs of different
  segment lengths add the note "The segments differ in length; the curve shows the first." Choosing Spring on a spring keeps
  its parameters (no step).
- T8-6 Loop count field: empty or "∞" = until the clip end (`null`); a non-number is ignored (stored count kept); numbers go
  through `setKeyLoop` (rounded, clamped 1..1000). Changing the mode keeps the count.
- T8-7 During a transform drag, a KEYED clip's handles show the evaluated live result (M4); static clips unchanged.
- T8-8 Continue (offset) position loops draw up to 3 further cycles faintly (dashed) plus a toolbar hint when the loop goes
  on; Repeat / Ping-pong retrace the keyed span and draw nothing extra.
- T8-9 Locked track: path, dots (seek) visible; no dot drag (not even a live preview), no tangent handles, no Smooth path
  chip; loop select, count, spring chips/fields and orient disabled.

## Tests and mutation checks
- RED first: `path-drag-math`, `orient-toggle`, `spring-ui` failed on their missing modules / exports before the code; the e2e
  specs were written against the finished UI (their ability to fail is shown by the mutations below).
- Unit: `path-drag-math` (threshold, dot/tangent travel, shown tangents incl. defaults and end keys, mirrored length kept,
  both tangents passed, Alt breaks, broken independent, zero removes, corner toggle both ways, broken re-align),
  `orient-toggle` (bake static/keyed at the playhead, frame kept, off-clip end, no-ops, lock, ONE store step + undo),
  `spring-ui` (residual never NaN, note, segment seconds incl. last key, curve depends on seconds only for spring),
  `motion-path-cycles` (none for repeat/ping-pong, shifts, count, cap + more, cache follows a loop change), `drag-stale`.
- e2e: `keyframes-loops-ui` (Repeat: 1.5 periods == 0.5 periods by pixel; count 1 holds after cycle 1; Ping-pong 0.75 at
  0.5 s; count cleared; None; undo; one step each; Continue rotation 0->90 = 180 deg at 2 periods by corner pixels and the
  field; past-last-key hint; hidden with 1 key and the stored loop shown again; locked disabled), `keyframes-spring-ui`
  (Spring then Bouncy one step each, same spring / Spring-on-spring no step, preview at 0.5 s 0.5472 vs core 0.5454; fields
  Enter / Tab-blur / clamp / unchanged; Wobbly on the 0.3 s segment shows the note and a stiff critically damped spring
  clears it; locked read-only), `path-edit` (dot drag ONE step, live pixels, live snapshot == committed within 1, no seek,
  dot follows, click seeks, undo exact; Escape cancels; tangent drag ONE step, resolver mid-point 150+ px off the chord and
  the pixel there; Smooth path ONE step + idempotent; double-click corner both ways incl. the dot under the playhead;
  locked: no live move, no toast, no history; body drag still moves the clip with handles shown), `path-edit-orient`
  (kf-orient ONE step, yellow/red ends along the 33.69 deg heading, field 33.69; off bakes, frame kept; M4 live handles at
  45 deg during a body drag and after release). `keyframes-ease` test 1: the spring `toHaveCount(0)` assertion is replaced
  by `toBeVisible` together with the removed `OFFERED` filter.
- Mutations (each applied, run, restored; CAUGHT unless stated): mirror uses the lead's length (2 unit); Alt ignored (1);
  smooth passes only the lead (2); corner re-align branch removed (1); setOrientAt without the bake (4); springResidual
  Infinity branch removed (1); cycle cap removed (1); cache signature without the loop (1); storeMotion check removed (1);
  click after a drag not consumed (path-edit 1); Escape not ending the drag (path-edit 2); Preview without withLivePath
  (path-edit 1); commit on every move (path-edit 1); locked dots draggable (path-edit locked, after adding the live-move
  and no-toast checks: the first version only checked history and survived because the core refuses the commit);
  overlay double-click handler removed (path-edit smooth/corner); EasePanel seconds fixed at 1 (spring note); loop control
  shown with 1 key (loops hidden test); mode change drops the count (loops test 1); M4 handles from `live.transform`
  (path-edit-orient M4); Spring committing a bare `{kind}` (spring test 1, after adding the Spring-on-spring check: the
  first version survived because repairEase fills SPRING_DEFAULT). SURVIVED by design: removing the 600 ms `data-armed`
  window (Chromium dispatches the dblclick to the clip body where the overlay handler toggles the key anyway); kept as a
  safeguard for browsers that do not fire dblclick across two targets (manual QA).

## Contract for Tasks 9-10
- Task 9 (transfer): loops are read with `targetLoop` and set with `setKeyLoop`/`withTargetLoop`; tangents with
  `withTangentPatch`/`setKeyTangents`; `pathDragMath` has nothing transfer needs. `smoothKey` is exported from pathEdits.
  New UI readers of `.motion/.loops/.orient` must be added to `tests/transform-readers.test.ts` (entries added here:
  dragStale/useTransformDrag/usePathDrag storeMotion, OrientToggle, TransformOverlay liveHandles). PresetBrowser.tsx is
  still 200 lines (split before adding My presets). `KeyframeIds` now requires `loop`/`loopCount`.
- Task 10 (journey/QA): test ids `kf-loop-<prop>`, `kf-loop-count-<prop>`, `kf-loop-<prop>-hint`, `fx-<id>-<param>-loop`
  (`-count`), `ease-preset-spring`, `ease-spring-*`, `anim-<slot>-spring-*`, `motion-tangent-in|out`, `mp-smooth`,
  `mp-loop-hint`, `motion-path-cycle`, `kf-orient`; helpers in `tests/e2e/path-edit-helpers.ts`. The full e2e run for Task 8
  is pending (controller).
- Manual QA items: tangent handles with a trackpad (4.5 px radius), double-click on the dot under the playhead in Safari,
  Alt on macOS (Option) mid-drag, the Smooth path chip over the picture's top-left corner, loop row width in a narrow
  inspector, spring feel at 30/60 fps, heading flips on ping-pong (R4 concern).

## Concerns
1. A tangent handle or a non-current dot lying on the clip body takes presses in its small disc (as 5A dots did); a body
   drag there needs a press elsewhere on the clip.
2. The `mp-smooth` chip sits at the canvas box's top-left and can cover a picture there (it stops its own presses only).
3. The orient toggle bakes on OFF (T8-1): other frames change (the heading no longer follows the path), like the stopwatch.
4. While a dot drag is live only that key moves; the key under the playhead's tangent handles follow the live project. A
   dot drag of a key whose Smooth path default handles are shown recomputes the defaults live (they are not stored).
5. The 600 ms armed window lets a press on the clip centre right after clicking a dot drag that key instead of the clip
   (same key, same result in practice).
6. Full e2e not run here; `keyframes-loops-ui`/`keyframes-spring-ui` read single preview pixels (tolerance 3-4/255 + 0.005).
