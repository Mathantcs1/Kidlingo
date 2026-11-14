# Plan 5A manual QA checklist (keyframe animation)

Everything below has only been checked in headless Chromium on Linux with SwiftShader (software WebGL2). Nothing in
Plan 5A has been seen, felt or measured on a real GPU, in a real browser window, with a trackpad or in QuickTime. Run it
in **real desktop Chrome on a Mac** (note the Chrome version, macOS version and GPU in the results) and record pass/fail
plus numbers where asked. Safari is unverified: do not claim support from this list.

**Plan 4's checklist (`plan-4-manual-qa-checklist.md`) has also never been run. Run both together**, before or right
after the 5A deploy (Ruling P5-2, O12): the effects, blend modes, overlays and adjustment layers that 5A animates are
exactly what Plan 4's list verifies on a real GPU.

Prepare: a real 1080p clip at 30 fps and one at 60 fps (phone or camera), a still photo (for a Ken Burns move), a
portrait clip, QuickTime Player, and a trackpad as well as a mouse.

This file merges the former `plan-5-manual-qa-checklist.md` (Tasks 8-10 items, now sections 3-6) with the Task 12 items.
It is the source for Part 5A; later parts (5B/5E/5D/5C) get their own sections.

## 1. Animation smoothness and correctness on real footage
- [ ] Ken Burns on a still: scale 100% -> 130% and a slow pan with easeInOut over 5 s. Play it in a 30 fps project and in a 60 fps one (the Format menu has no frame-rate setting: a project takes its fps from the first video clip dropped on an empty timeline, so start a new project with a 60 fps clip): no visible stepping, judder or shimmer; the motion eases in and out.
- [ ] Animate a video clip's position, scale, rotation and opacity together (fade-in 0 -> 100% over 1 s, a slide, a spin) on real 1080p footage in a 30 fps project and in a 60 fps one (start a new project with a 60 fps clip): playback keeps up, the picture is smooth and does not stutter when keys start or end.
- [ ] Animate a Colour effect (saturation, brightness) and a Blur radius across a clip: no flicker, no banding, no black frames. A keyed blur radius changes the pass count per frame: check it stays smooth.
- [ ] Every ease preset (Linear, Hold, Ease in, Ease out, Ease in-out, Back, Elastic, Bounce, Custom) on a scale and an opacity key: the motion looks like its name; Elastic and Bounce overshoot and settle; scale never shows a flash or a glitch at 0%.
- [ ] Scrub the playhead back and forth through an animated clip: the picture follows with no lag or stale frame; park the playhead between two frames' times and compare with the exported frame.
- [ ] Animated overlays (a lower third and a sticker with keyed scale/position/opacity): smooth, no texture swimming while scale animates.
- [ ] An adjustment layer with keyed opacity and a keyed effect param over several clips: the effect fades in and out as expected.

## 2. Export against the preview
- [ ] Export 1080p of an animated project (several animated clips, an animated effect, an overlay): open the MP4 in **QuickTime Player** and in Chrome. The motion, easing and colour changes match the preview at the start, middle and end of each move; the length is right; audio is in sync.
- [ ] Split and trim animated clips (including decoded video) at a whole frame and at a mid-frame time; on the mid-frame cut, `[` / `]` and the inspector Next/Previous reach every key, typing at a key replaces it, the frame then shows exactly the typed value (the key moves to the frame start, its diamond shifts by under one frame, Ruling P5-7) and the key diamond removes it (Ruling P5-6). Then export: no jump in the animation at the cut (a cut that is not a whole number of frames from the clip start may shift the grid by under one frame, Ruling P5-5).
- [ ] Known (M-1, deferred): after a mid-frame split two keys of one property can land in the same frame of the new grid; only the first is under the playhead and reachable by `[` / `]`, the second is shadowed until the first is removed (no key is lost). Split a clip with keys < 1 frame apart and judge whether this needs a fix.
- [ ] Export a 60 fps project with keys (start a new project with a 60 fps clip): the exported motion is as smooth as the preview. 4K export of one animated clip completes.
- [ ] Merge all of an animated project: the merged clip shows the animation, and Undo restores every key.

## 3. Timeline diamonds and keyboard (Task 8)
- [ ] Diamonds at different zoom levels: select an animated clip and zoom the timeline from the widest to the narrowest. Diamonds stay on the right key times, do not overlap confusingly, and are comfortable to click and drag (they are ~14 px targets) with a mouse AND a trackpad.
- [ ] A diamond at a clip's first frame overlaps the previous clip's end trim handle (~7 px) and this clip's start trim handle: check it is still easy to grab the diamond rather than the handles.
- [ ] Zoom the timeline out until a selected clip is under 24 px wide: the diamond row disappears and **Delete removes the clip, not hidden keys**.
- [ ] Delete-key behaviour (T8-3): with key diamonds selected Delete/Backspace AND Shift+Delete/Backspace remove the keys (one undo step) and never delete or ripple-delete a clip; with no key selected Delete removes the selected clips as before; the toolbar Delete buttons still delete clips. After undo or a selection change, no stale key selection remains.
- [ ] Drag a diamond: the picture follows live, one undo step on release, Escape cancels. Multi-select with Shift-click and drag/delete several keys at once: one step each.
- [ ] With several clips selected each shows its diamond row but `[` / `]` do nothing unless keys are selected (T8-2): judge whether that surprises. `[` / `]` jump to the previous/next key. They are unreachable on AltGr layouts (e.g. some European keyboards): confirm and decide on an alternative binding.
- [ ] Escape priority while recording: with key diamonds selected during a recording, the first Escape drops the key selection only (the take keeps recording); a second Escape discards the take.

## 4. Inspector keyframe rows (Tasks 6-7)
- [ ] The four keyframe rows (position, scale, rotation, opacity) are always visible: judge whether they are too noisy or crowded, especially in a narrow inspector, and whether a collapsed "Animate" disclosure is wanted.
- [ ] A typed draft on a keyed field is dropped if the playhead moves (for example while playing) before blur: check this feels acceptable, or whether playback should pause on field focus.
- [ ] Arrow keys on a slider commit one history step per press (no coalescing): check the undo depth feels sane after holding an arrow key.
- [ ] Stopwatch, key diamond, previous/next and the mini strip work for every effect parameter and the chroma colour group; Mirror mode has no stopwatch.
- [ ] On-canvas drag of an animated clip writes a key at the playhead (one undo step), and the handles sit on the animated picture while playing and scrubbing.

## 5. Ease editor (Task 9)
- [ ] Curve editor feel with a **trackpad**: dragging a handle is precise and smooth, the numbers update live, one undo step on release, Escape cancels; the 12 px handle is not too fiddly.
- [ ] Tab order inside the ease editor: there is no focus trap (Tab leaves the panel); handles lack an `aria-valuenow` range for y; the 12 px handle target is below the WCAG 2.5.8 24 px guideline. Decide whether to enlarge/trap.
- [ ] The CSS opacity change affects the existing disabled prev/next keyframe buttons: confirm they still look right.
- [ ] The 5-button preset row may clip in a narrow inspector: check at the minimum inspector width.
- [ ] Editing a multi-key selection's ease changes all of them in one step; a locked layer disables the editor.

## 6. Motion path (Task 10)
- [ ] Every position key dot is a tab stop (`tabIndex=0`): with 500 keys that is 500 Tab presses to pass the preview. Consider a roving tabindex and judge it.
- [ ] Key dots are 10 px discs (r = 5): check they are comfortable to click with a mouse and trackpad (and that dots within ~9 px of the clip centre, which let the press through to the move handle, feel right).
- [ ] With ~500 position keys, all dots re-render on every playback frame: play a clip with that many keys and check the preview stays smooth.
- [ ] The path (read-only) follows an animated clip through reframe (16:9 -> 9:16 -> 16:9) and undo.

## 7. Overlay text and rendering detail
- [ ] Overlay text shows aliasing at small scale (no mipmaps): check visually at 25-50% scale, and while the scale animates down. Judge whether mipmaps or a supersampled texture are wanted.
- [ ] Animated rotation of a text overlay and of a photo: edges look clean (no shimmer) in a 60 fps project (start a new project with a 60 fps clip).

## 8. Data and persistence
- [ ] Open a project saved before 5A (v5): it loads, plays and exports identically. Save one animated project, reload the tab: every key and ease is back.
- [ ] An older tab open during the 5A deploy shows "saved by a newer version" and does not overwrite the v6 project.
- [ ] A project with ~500 keys on a property still scrubs, edits and autosaves without delay (about 55-60 bytes per key).

## 9. Not covered / unverified
- [ ] Safari: unverified. Do not claim support; if tried, note what fails (WebCodecs, OPFS writes, `AudioDecoder`).
- [ ] Real GPU numbers: the performance guards (resolver cost, 1.2x preview frame time, memory) are SwiftShader measurements; recheck on a real GPU and note the frame times.

## 10. 5B (Task 8): path editing on the canvas
- [ ] The default tangent handle (a 4.5 px disc) can take a press meant for a corner, rotate or scale handle near it: try each handle on a clip whose key is under the playhead.
- [ ] Double-clicking the clip body near a key dot toggles that key corner/smooth (a hidden gesture): check it is not triggered by accident while moving a picture.
- [ ] The "Smooth path" chip at the canvas top-left can cover the picture: check on a small canvas and a picture at the top-left.
- [ ] The 600 ms "just clicked" window on key dots (a survivor mutation): click a dot, then press it again quickly and after a pause; both behave as expected.
