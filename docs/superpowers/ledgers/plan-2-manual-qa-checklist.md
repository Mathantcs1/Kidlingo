# ClipForge Plan 2 (layers): manual QA in real Chrome on a Mac

Run `npm run dev` on branch `feature/layers`, open http://localhost:5173 in desktop Chrome. Use a real phone/camera
clip (H.264), a PNG with transparency (e.g. a logo) and an audio file (MP3/M4A). Tick each item; note anything odd.

1. **Add layers.** Import the clip, the PNG and the audio file. Add the clip to the timeline. Click **+ Video layer**:
   a "Video 2" header appears ABOVE "Video 1" and is highlighted as active. Click **+** on the PNG: it lands on Video 2,
   not Video 1. Click **+ Audio track** and add the audio file: it lands on the new audio track. Undo (Cmd+Z) removes
   them one step at a time; Shift+Cmd+Z brings them back.
2. **Rename / active track.** Double-click "Video 2", type "Logo", Enter. Tab to another header: it becomes active.
   Press F2 on a focused name, Escape: the name is unchanged.
3. **Hide.** Click the eye on "Logo": the PNG disappears from the preview immediately (paused and while playing);
   click again: it is back. Play the timeline with the layer hidden and check nothing flickers.
4. **Lock.** Lock "Video 1". Try to drag, trim, split (S), delete (Backspace) and ripple-delete its clip, and drag the
   PNG onto Video 1: each is refused with "Track is locked" and nothing changes. The inspector fields and the
   on-canvas handles are disabled for a clip on the locked track. Unlock.
5. **Mute / Solo.** Play: you hear the clip's own sound and the audio file. Mute Video 1: the clip's sound stops
   (the audio file continues). Unmute. Solo the audio track: only the audio file is heard, and the "Solo on" badge
   shows. Unsolo. Changes apply within a moment while playing (playback pauses on each change; press Space again).
6. **New-layer drop zone.** Drag the PNG from the media bin onto the strip above the top video layer: a new layer is
   created holding it (one undo step). Drag an existing timeline clip onto the strip: it moves to a new layer.
   Drop an audio file on the strip below the bottom audio track: new audio track. Dropping over the ruler or the
   header column does nothing. Dragging a Finder file onto the timeline does not navigate the page away.
7. **PiP move.** Select the PNG clip with the playhead over it: an outline with corner handles and a round rotate
   handle appears on the preview. Drag inside the outline: it moves and snaps to the centre/edges; hold Option (Alt)
   while dragging: no snapping. Escape mid-drag puts it back. A single click (no drag) does not move it and adds no
   undo step.
8. **PiP scale and rotate.** Drag a corner: it scales about its centre. Drag the round handle: it rotates; hold Shift:
   it snaps to 15° steps. The inspector X/Y/Scale/Rotation fields follow. Cmd+Z after each gesture restores it exactly.
   Rotated and scaled, the handles still sit on the clip's corners.
9. **Numeric fields.** Type Scale 25, Enter; X 600, Y -300, Enter; Opacity 50: the preview matches. Up/Down arrows step
   by 1 (Shift by 10); Escape reverts a half-typed value; **Reset** puts it back to its fit framing.
10. **Format switch.** With the PNG small in the top-right corner, switch to **Vertical 9:16**: the background clip
    refits; the PNG stays in the top-right area. Switch to **Square** and back to **YouTube**: still top-right, at
    the same size and place as before the first switch (format round trips are exact since Ruling J; Cmd+Z also restores exactly).
11. **Merge all and export.** Hide one extra layer, then **Merge all into one clip**: the result shows only the visible
    layers, with the audible tracks' sound; one Cmd+Z brings every track, name and flag back. Then **Export** at
    1080p: open the MP4 in QuickTime; the PNG is where it was in the preview, hidden layers are absent, muted
    tracks are silent, and the duration matches the timeline.
12. **Reload and old projects.** Reload the page (Cmd+R): every layer, name, hide/mute/solo/lock flag and PiP
    position comes back exactly, with no warning banner. Old (v1) projects: storage is per site origin, so this
    can only be checked where the new build is served from the same origin as the old one (e.g. right after the
    production deploy): a project saved by the previous build opens with the same clips and no "could not load"
    notice. Locally it is covered by tests/e2e/layers-migration.spec.ts. Also try 8 video layers: **+ Video layer** then refuses politely, and
    scrolling/playing stays smooth.
