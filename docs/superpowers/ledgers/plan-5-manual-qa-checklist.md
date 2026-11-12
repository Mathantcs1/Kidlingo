# Plan 5 manual QA checklist (animation)

Run in real desktop Chrome on a Mac (note Chrome/macOS/GPU). Everything here was only checked in headless Chromium on Linux.

## Part 5A (keyframes)
- [ ] A diamond at a clip's first frame overlaps the previous clip's end trim handle (~7 px) and this clip's start trim handle: check it is still easy to grab the diamond vs the handles.
- [ ] Diamonds are ~14 px targets: check they are comfortable to click and drag with a mouse and trackpad.
- [ ] The four keyframe rows (inspector) are always visible: judge whether they are too noisy.
- [ ] A typed draft on a keyed field is dropped if the playhead moves (playing) before blur: check it feels acceptable.
- [ ] Arrow keys on a slider commit one history step per press (no coalescing): check undo depth feels sane.
- [ ] Overlay text shows aliasing at small scale (no mipmaps): check visually at 25-50% scale.
- [ ] `[` / `]` are unreachable on AltGr layouts (e.g. some European keyboards): confirm and decide on an alternative binding.
- [ ] Zoom the timeline out until a selected clip is under 24 px wide: the diamond row disappears and Delete removes the clip, not hidden keys.

## Part 5A, Task 9 (ease editor)

- [ ] Tab order inside the ease editor: there is no focus trap (Tab leaves the panel); handles lack an `aria-valuenow` range for y; the 12px handle target is below the WCAG 2.5.8 24px guideline. Decide whether to enlarge/trap.
- [ ] The CSS opacity change affects the existing disabled prev/next keyframe buttons: confirm they still look right.
- [ ] The 5-button preset row may clip in a narrow inspector: check at the minimum inspector width.
