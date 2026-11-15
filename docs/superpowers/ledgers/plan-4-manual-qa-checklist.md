# ClipForge Plan 4 (effects, looks, overlays): manual QA in real Chrome on a Mac

Run `npm run dev` on branch `claude/clipforge-plan-4-effects`, open http://localhost:5173 in desktop Chrome on a Mac
(a real GPU). Every automated check ran in headless software WebGL on Linux, so nothing here has been seen on a real
GPU, and the tests measure pixels, not taste. Use a real phone clip (portrait too), a landscape clip, a real green-screen
clip and a `.cube` LUT from a colourist or a free pack. Tick each item; note anything odd.

1. **Colour.** Add Colour to a clip and drag each slider: exposure, brightness, contrast, saturation, hue, temperature,
   tint, shadows, highlights. The preview follows while you drag; no flicker; one undo step per release.
2. **Looks by eye.** Click each of the nine looks at 100 % and at 50 %: Cinematic, Moody, Golden Hour, Teal-Orange,
   Fashion, Clean Vlog, Film 35mm, Cyberpunk, Dreamy. Do they look like their names? Note any that look wrong (the table
   is in `src/fx/looks.ts`; tuning is a data change).
3. **LUT.** Import a real `.cube`; it looks like the colourist's reference. Re-import it: it works again. Delete the
   clip and undo: the LUT is still there. Try a 1D LUT and a text file renamed `.cube`: a clear message, nothing added.
4. **Blur, sharpen, glow, pixelate.** Scrub and play with each; blur radius 100 on a 4K clip stays smooth enough to
   scrub. Compare the preview and the export at the same frame (open the MP4 in QuickTime): they look alike.
5. **Stylise.** RGB split, glitch, VHS, mirror (all five modes, also on a portrait phone clip), invert, film grain:
   grain moves frame to frame and does not crawl when paused; glitch/VHS look intentional, not broken.
6. **Chroma key.** On real green-screen footage tune tolerance, softness and spill: clean edges, no green fringe on hair.
7. **Overlays.** Add a lower third with a long title (it shrinks, then ends with an ellipsis), a subscribe button, a
   progress bar over a clip and over the whole video, and a few stickers. Text is legible on bright and dark pictures;
   the fonts look acceptable; moving/scaling with the on-canvas handles feels right; an overlay is still sharp after
   scaling it up (it re-rasterises on the next frame).
8. **Performance.** Three stacked effected layers (one blurred, one keyed, one with a look): note the preview frame rate
   while playing and scrubbing. Export a 1080p and a 4K project and note the time. Report anything that stalls.
9. **Effects off.** The backslash key and the button show the plain picture; the project, undo history and the exported
   file are unchanged by it.
10. **Copy / Paste** a stack to another clip; one undo restores the old stack. The fx badge matches the number of
    enabled effects.
11. **Reload.** Build a project with effects, a LUT and overlays, reload: everything is back and looks identical.
12. **Merge all** a project with effects and overlays: the merged clip looks like the preview (a re-encode, not a
    redraw) and one undo brings everything back.
13. **Old tab.** Keep an old (Plan 3) build open, save a project here, reload the old tab: it says "saved by a newer
    version" and does not overwrite it.
14. **Safari / other browsers.** Unverified. If you try, note WebGL2 and OPFS behaviour (3D textures for LUTs in particular).
