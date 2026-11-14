# Plan 5B manual QA checklist (animation presets, loops, springs, curved paths, copy/paste, personal presets)

Everything in Plan 5B has only been checked in headless Chromium on Linux with SwiftShader (software WebGL2). Nothing
has been seen, felt or measured on a real GPU, in a real browser window, with a trackpad or in QuickTime. Run it in
**real desktop Chrome on a Mac** (note the Chrome version, macOS version and GPU in the results) and record pass/fail plus
numbers where asked. Safari is unverified: do not claim support from this list.

**Run it together with `plan-4-manual-qa-checklist.md` and `plan-5a-manual-qa-checklist.md`** (neither has been run;
sections 10 and 11 of the 5A file hold the first 5B items and stay there, they are repeated below so this list is complete).
Prepare: a real 1080p clip at 30 fps and one at 60 fps, a still photo, a portrait clip, QuickTime Player, a trackpad as
well as a mouse, and a screen reader (VoiceOver) for section 7.

## 1. Preset feel
- [ ] Apply every Entrance preset (Fade, Slide x4 directions, Zoom, Pop, Spin, Drop, Whip, Rise) to a 1080p clip in a 30 fps project and in a 60 fps one (start a new project with a 60 fps clip): the motion reads as intended, with no stepping or judder; Pop and Drop overshoot/bounce visibly but not wildly.
- [ ] Apply every Emphasis preset (Pulse, Shake, Wobble, Flash, Hop, Spin 360) at the playhead: the window starts where the playhead was; Shake looks like shake (same on every replay).
- [ ] Apply every Continuous preset (Breathe, Float, Spin loop, Jitter, Blink, Ken Burns) to a photo and to a video: smooth at 30 and 60 fps; Ken Burns spans the whole clip.
- [ ] Stack In + Emphasis + Loop + Out on one clip, trim it very short (shorter than In + Out): the two windows shrink to fit, nothing flickers.
- [ ] Lower third: add an In preset and an Out preset: no double slide (the built-in slide is off at that edge); with no preset the built-in slide is back.
- [ ] A preset on a sticker overlay and on an adjustment layer (opacity presets only): the others are greyed out.
- [ ] Play 8 preset clips at once on 1080p footage: playback keeps up (note frame drops), compare with the same clips without presets.

## 2. Preset browser and tiles
- [ ] Tile animation on hover/focus is smooth and only the hovered tile moves; note CPU use in Activity Monitor while hovering (one animated tile should be a sliver of a core).
- [ ] Tiles with tiny motion (Jitter, Breathe) look almost still on the tile: judge whether the tile still shows what the preset does.
- [ ] With macOS "Reduce motion" on, every tile is a still.
- [ ] Narrow window: the popover stays inside the window and is reachable by keyboard (arrows, Enter, Escape, F favourite).
- [ ] VoiceOver reads the listbox as options with names; the star, rename and delete mouse shortcuts are not announced twice (they are aria-hidden; F, F2, Delete are the keyboard equivalents).

## 3. Spring and key loops
- [ ] Spring feel: Gentle, Snappy, Bouncy and Wobbly on a position segment of 0.5 s and of 2 s: the same spring feels the same on both; the "needs longer than the segment" note appears on the short one.
- [ ] Repeat, Ping-pong and Continue on opacity, scale, rotation and position: loops after the last key; a count stops them; Continue spins steadily (0 -> 360 keys).
- [ ] A loop on a clip with a very short period (a few frames): no flicker beyond what the keys say; the picture does not stutter at the loop point.
- [ ] Editing at a playhead inside a later loop cycle adds a key past the last one (the hint says so): check it is understandable.

## 4. Curved paths and orient
- [ ] Tangent handles with a TRACKPAD and a mouse: drag a handle (smooth keys mirror the direction), Alt/Option-drag breaks it, double-click a dot toggles corner/smooth; Escape during a drag cancels.
- [ ] The default tangent handle (a 4.5 px disc) can take a press meant for a corner, rotate or scale handle near it: try each handle on a clip whose key is under the playhead (5A file, section 10).
- [ ] Double-clicking the clip body near a key dot toggles that key corner/smooth (a hidden gesture): check it is not triggered by accident while moving a picture (5A file, section 10).
- [ ] The "Smooth path" chip at the canvas top-left can cover the picture: check on a small canvas and a picture at the top-left (5A file, section 10).
- [ ] The 600 ms "just clicked" window on key dots: click a dot, press it again quickly and after a pause; both behave as expected (5A file, section 10).
- [ ] Orient along the path: a picture moving along a curve turns with it, no snapping at the ends; turning orient off keeps the current heading.
- [ ] Motion ghost: a faint outline shows where a Slide In puts the picture at its first frame; clicking the ghost selects the clip; dragging still edits the rest position.
- [ ] Ghost lags during an Alt-drag (it is drawn from the stored project) and clicking it replaces a multi-selection: confirm both are acceptable.

## 5. Copy, paste, duplicate, animation transfer
- [ ] Ctrl vs Cmd: Cmd+C / Cmd+V copy and paste clips (no keys selected) and keys (keys selected) on a Mac; Cmd+Option+C / V (copy/paste animation) conflicts with Chrome's Inspect shortcut: note which wins; the buttons always work (5A file, section 11).
- [ ] Ctrl/Cmd+D duplicates the selected clip, so the browser's bookmark shortcut is suppressed on the editor page whenever a clip is selected; D still types normally in text fields (5A file, section 11).
- [ ] Text fields keep native copy/paste (clip name, track name, preset name, overlay text) and never touch the project.
- [ ] Paste a video clip with its detached audio on interleaved video/audio tracks, on a video and on an audio target track: each lands on the nearest track of its own kind, in order; a refusal names the problem and changes nothing (5A file, section 11).
- [ ] Paste a clip with presets, loops and a curved path at three places, then undo three times and redo: the picture and the animation match the original each time.
- [ ] Copy animation from a 4000x3000 photo to a 1080p video: the picture size stays proportional (scale adapted).
- [ ] Paste keys onto a clip that cannot take some of them (an adjustment layer): the toast says how many were skipped.

## 6. Personal presets and the library
- [ ] Save as preset, then quit the browser completely and reopen: the preset is still under My presets; applying it is one step and works on a clip somewhere else on the timeline.
- [ ] Favourites persist across a browser restart.
- [ ] Save as preset, close the dialog with Escape while it is saving: the preset still appears in My presets and nothing errors (5A file, section 11).
- [ ] Two browser tabs saving presets at the same moment: both presets are in the library after a reload (5A file, section 11).
- [ ] Delete a preset: it asks first; clips that used it keep their animation.
- [ ] Private/incognito window: saving a preset says why it cannot (library unavailable); nothing is lost.

## 7. Data and persistence
- [ ] Open a project saved before 5B (v6): it loads, plays and exports identically. Save a project with presets, loops and curved paths, reload the tab: everything is back.
- [ ] An older tab open during the 5B deploy shows "saved by a newer version" and does not overwrite the v7 project (a v7 save is one-way; v6 builds cannot open it).
- [ ] Merge all of a project with presets: the merged clip looks like the preview (the same check as the automated one, on real footage).
- [ ] Same-frame key pairs after an off-frame split (two source keys landing in one frame of the new grid): the second is shadowed (not reported under the playhead, not reachable by previous/next) until the first is removed; no key is lost.
- [ ] Switch the format 16:9 -> 9:16 -> 1:1 -> 16:9 on a project with presets and curved paths: paths scale with the canvas, presets (fractions of the format) look the same, the round trip restores the picture.

## 8. Rendering detail and export
- [ ] Overlay minification (no mipmaps): a sticker or text overlay with Pop/Zoom/offset-loop presets and a scale animating down: look for shimmer or aliasing at 25-50 % size, and at the overshoot frame. If it shimmers, mipmaps or a supersampled texture are the follow-up. Also check a sticker split into two halves (one half without the Pop): its edge sharpness differs slightly (Ruling T10-2).
- [ ] Many big overlays (20+ stickers at 10x scale or more) on one frame: the preview stays responsive and nothing turns to a blank box; with more than about 8 capped overlays the later ones look slightly softer (the 128 MiB overlay texture budget, Ruling T10-3).
- [ ] Export a 10 s 1080p project with presets, springs, loops and curved paths and play it in QuickTime and in Chrome: the motion matches the preview frame for frame (note the file size and the export time).
- [ ] Export a project at 25 fps and at 60 fps: the same check.
- [ ] Rotation and presets on text overlays and photos in a 60 fps project: edges are clean.

## 9. Not covered / unverified
- [ ] Safari: unverified. Do not claim support; if tried, note what fails.
- [ ] Real GPU numbers: the 1.2x preview frame-time guard, the 2.5x resolver guard and the memory budgets are SwiftShader measurements; recheck on a real GPU and note the frame times.
- Known flake (not a product bug): e2e `keyframes-loops-ui.spec.ts` "Repeat, a count, Ping-pong and back to until the end" fails about 1 run in 5 under load; it passes on re-run.
