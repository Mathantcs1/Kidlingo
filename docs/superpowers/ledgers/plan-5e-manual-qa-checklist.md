# Plan 5E manual QA checklist (crop, flip, anchor point)

Everything in Plan 5E has only been checked in headless Chromium on Linux with SwiftShader (software WebGL2) and ffmpeg
frame grabs. Nothing has been seen or felt on a real GPU, with a trackpad, in Safari or in QuickTime. Run it in **real
desktop Chrome on a Mac** (note the Chrome version, macOS version and GPU in the results) and record pass/fail plus numbers
where asked. Safari is unverified: do not claim support from this list.

**Run it together with the Plan 4, 5A and 5B checklists** (none has been run). Prepare: a real 1080p clip at 30 fps, a
portrait phone clip (with rotation metadata), a still photo, a 4K clip if you have one, QuickTime Player, a trackpad as
well as a mouse.

## 1. Crop
- [ ] Type crop values in the four fields (Left, Top, Right, Bottom): the visible area shrinks, the picture that stays visible does not move, the cropped part shows what is below. Each commit is ONE undo step.
- [ ] Crop to the limit on each axis: at least 8 source pixels (about 2 % of a 300 px picture, 2 % otherwise) always stay; typing 100 leaves the minimum, never an empty clip.
- [ ] A very small crop (0.5 %, 1 px) on a 1080p clip: no thin light or dark line at the cropped edge, no shimmer while it plays (the half-texel inset); compare a still and a playing frame at 100 % zoom of your screenshot.
- [ ] Crop a portrait phone clip (rotation metadata): the crop edges are what you SEE, not the sensor orientation.
- [ ] Crop a clip with an effect (Blur, Glow, Pixelate, Vignette, a LUT): the effect works on the cropped picture only (a vignette is centred on the visible area, a blur does not pull in the cropped-away pixels).
- [ ] Frame mode Blur on a cropped clip: the blurred backdrop fills the frame from the cropped picture.
- [ ] Fit and Fill buttons: the visible area fits / fills the canvas, centred, also on a rotated clip and one with a pivot moved.
- [ ] Reset removes the crop in one step; Undo/Redo restore it exactly.
- [ ] Split, trim, duplicate, copy/paste a cropped clip: both halves and the copies keep the crop. Detach audio: the audio twin is unaffected.
- [ ] Switch the project format (16:9 to 9:16 and back): a cropped clip keeps its crop and returns to exactly where it was.

## 2. Crop on canvas
- [ ] "Crop on canvas" shows eight handles on the visible area and a dashed outline of the full picture; the move/scale/rotate handles are hidden. Drag each edge and each corner: the preview crops LIVE while you drag, and Undo undoes the whole drag in one step.
- [ ] Drag with a trackpad (tap-and-drag) and a mouse: no stuck drag, no jump on the first move (the 3 px threshold); Escape during a drag cancels; switching to another window mid-drag cancels.
- [ ] Rotated clip (e.g. 30 degrees) and a clip with a moved pivot: handles sit on the visible corners and dragging follows the pointer exactly (not offset or mirrored).
- [ ] Deselecting the clip, locking its track or moving the playhead off the clip ends crop mode; selecting it again does not bring it back.
- [ ] Handles at the very edge of a full-frame clip (outside the canvas) are still reachable.
- [ ] Small window / high DPI: handle size and hit area feel right (10 px handles).

## 3. Flip
- [ ] Flip horizontal and vertical (inspector buttons and the right-click menu): the picture mirrors; flipping twice restores it; the buttons show their pressed state.
- [ ] Flip a cropped clip: the mirror happens INSIDE the crop (the mask stays where it is). Flip a rotated clip: it mirrors about its own axes before it turns.
- [ ] Text in the footage reads mirrored when flipped (sanity check of the direction).

## 4. Anchor point (pivot)
- [ ] Anchor X/Y fields: Scale and Rotation (fields and handles) turn about the pivot; moving the anchor moves the picture (that is intended: X/Y are where the pivot lands). "To crop centre" puts the pivot at the middle of the visible area; Reset puts it back at the centre.
- [ ] The pivot dot is visible on the selected clip. Plain drag on the dot moves the clip; **Shift + drag** moves the pivot WITHOUT moving the picture (check on a trackpad: Shift while tap-dragging). Escape cancels. Not available while position, scale, rotation or the anchor are animated.
- [ ] Animate the anchor (stopwatch) with keys at two times and rotate the clip: the rotation visibly swings about the moving pivot; at 30 and 60 fps the motion is smooth.
- [ ] Anchor keys with a loop (Repeat, Ping-pong, Continue) behave like the other properties; Reset transform keeps the anchor keys; Undo restores.
- [ ] A preset (Spin, Pop, Pulse, Wobble) on a clip with a moved pivot turns/scales about that pivot.
- [ ] Copy/paste animation and Save as preset carry the anchor keys.

## 5. Export and playback
- [ ] Export a clip with crop + flip + a moved pivot + a rotation animation at 1080p and play the file in QuickTime: it matches the preview frame by frame (spot check frames at 0, middle and last; headless parity was 0.2/255 per pixel mean difference at 30 and 25 fps).
- [ ] Export at 25 fps and 30 fps projects: same result.
- [ ] A cropped 4K clip exports without a memory error; note export time against an uncropped one (the effect target of a cropped clip is smaller, so it should not be slower).
- [ ] A project saved with crop/flip/anchor and reloaded (including a hard reload within a second of an edit): everything is restored. Opening the project in an older tab shows "saved by a newer version" and leaves the data untouched.

## 6. Accessibility and keyboard
- [ ] Every crop, flip and anchor control is reachable by keyboard (Tab/Shift+Tab), has a label read by VoiceOver ("Crop left in percent", "Anchor x in percent of the frame from its centre"), and the pressed state of Flip and Crop on canvas is announced.
- [ ] The overlay handles are hidden from assistive tech on purpose; the fields are the keyboard path. Check that this is acceptable in practice (there is no arrow-key nudge on the handles).
- [ ] The Help panel has a "Crop, flip and anchor" topic that matches what you see.

## 7. Known limits to confirm (see README)
- [ ] Crop and flip are static (no keyframes); anchor keys are the only new animated property.
- [ ] Snapping while moving a cropped clip uses its visible area; centre snapping uses the visible centre.
- [ ] Crop, flip and anchor are refused on overlays, adjustment layers and audio clips (menu items are absent or greyed).

Record results (pass/fail, numbers, machine) at the bottom of this file.
