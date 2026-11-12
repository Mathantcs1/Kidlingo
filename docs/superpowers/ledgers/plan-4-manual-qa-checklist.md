# Plan 4 manual QA checklist (visual effects, looks, LUTs, chroma key, blend modes, overlays, adjustment layers)

Everything below has only been checked in headless Chromium on Linux with SwiftShader (software WebGL2). Nothing in Plan 4
has been seen or measured on a real GPU, in a real browser window, or in QuickTime. Run this in **real desktop Chrome on a
Mac** (note the Chrome version, macOS version and GPU in the results), and record pass/fail plus numbers where asked.
Safari is unverified: do not claim support from this list.

Prepare: a real 1080p clip and a real 4K clip (phone or camera), a real green-screen clip with a person with hair against
a green backdrop, a real `.cube` 3D LUT (for example a free creative LUT), a bad file renamed to `bad.cube`, a dark
background clip or still for the hair test, and QuickTime Player.

## 1. Each effect by eye (preview)
- [ ] Add each effect in turn to a clip and drag every slider across its full range: Colour (brightness, contrast, saturation, exposure, temperature, tint, hue, shadows, highlights), Black & white, Sepia, Split tone, Vignette, Film grain, Blur, Sharpen, Glow, Pixelate, RGB split, Glitch, VHS, Mirror (all 4 modes), Invert, Chroma key, LUT. The picture must change smoothly, with no banding, flicker, black frames or wrong orientation.
- [ ] Reorder effects (order-dependent pairs such as Invert then Colour), toggle one off and on, remove one. Each is one undo step and the preview follows.
- [ ] The 9th effect on a clip is refused with a plain-English toast.
- [ ] Portrait phone footage (rotated/mirrored) with Mirror, RGB split, Sharpen and Glow keeps the right orientation.

## 2. Look presets
- [ ] Apply each look (Black & White, Sepia, Vintage Film, Teal & Orange, Cinematic, Moody, Golden Hour, Cool Blue, Punchy) to real footage: it looks like its name, applies in one step and Undo restores the previous stack exactly. Applying a look replaces the clip's stack.

## 3. LUT import
- [ ] Import a real `.cube` (the Effects section's LUT import, and also through the media bin's Import button): its TITLE and file name show, using it adds a LUT effect and the picture matches what the same LUT does in another app (DaVinci Resolve, Photoshop or ffmpeg `lut3d`) to the eye.
- [ ] Intensity 0 equals no LUT, 1 is full; check a 17, 33 and 65 point LUT.
- [ ] A bad file (`bad.cube`, a 1D LUT, a truncated file, a binary file renamed to `.cube`) gives a short plain-English toast naming the file and imports nothing.
- [ ] Removing a LUT that a clip uses is refused with a message; removing it after the effect is gone works.
- [ ] Reload the page: the LUT effect still renders.

## 4. Chroma key on real green-screen footage
- [ ] Put the green-screen clip on a layer above a colourful background. Pick the key colour with the colour picker (one undo step), tune similarity, smoothness and spill.
- [ ] Hair against a DARK background layer: spill suppression keeps luma, so a light-grey fringe can remain at the edge (Ruling P8, spill default 0.75). Note how bad it is and whether another default or a spill range change is needed.
- [ ] A neutral key colour (white, grey, black) keys all neutrals regardless of brightness: the hint is shown and behaves as described.
- [ ] Export the keyed result and compare with the preview.

## 5. Time-based effects at playback speed
- [ ] Play (not scrub) with Film grain, Glitch and VHS: the animation runs without stutter on a 1080p clip and the preview does not fall behind the audio.
- [ ] Grain, glitch and VHS look deterministic when you scrub to the same time twice.

## 6. Grain in exports (bitrate decision)
- [ ] Known: grain is weaker in exports after the first few frames because H.264 at 12 Mbit/s cannot keep per-pixel noise (Ruling T11-1: 8/255 per pixel on grain alone). Export a 10 s clip with Film grain (amount 0.15 and 0.4) and compare against the preview: how much weaker is it at second 5 than in the preview?
- [ ] Decide: keep 12 Mbit/s, raise the 1080p/4K bitrate, or document only. Record the decision and the file size cost.

## 7. Performance on a real GPU
- [ ] 4 to 6 effects (for example Colour, Split tone, Vignette, Grain, Sharpen, Glow) on a real 1080p clip, then on a real 4K clip: playback keeps up or degrades gracefully. Note the frame rate and Activity Monitor GPU use.
- [ ] HEAVY stack on a real GPU: 8 x Blur at radius 100 on a 1080p clip. On SwiftShader this took about 17 s per frame (the time guard was deferred, Ruling T11-3). Record the per-frame time and whether the tab, the GPU process or the whole display hangs, and whether a "WebGL context lost" message appears. Decide whether the guard (render the strided stage at 1/s resolution) is needed.
- [ ] Re-run `npx playwright test tests/e2e/effects-parity.spec.ts` (and the colour/blur/stylise/looks specs) on the Mac with a real GPU build of Chromium: the perf threshold of 14x (Ruling T11-2, measured 9.4 to 11.8x on SwiftShader) and the 3/255 GPU-vs-CPU drift guards were calibrated on SwiftShader only. Record any failure with its measured value instead of loosening it blindly.

## 8. Blend modes and adjustment layers
- [ ] Each of the 12 blend modes on a clip over a different layer looks right (compare with the same blend in another editor). A lone blended clip over nothing looks Normal (Ruling P9, transparent backdrop).
- [ ] Partial alpha: a PNG with soft edges or partial transparency blended with each mode and at 50 % opacity has no dark or light fringes.
- [ ] Adjustment layer with Black & white above two coloured layers greys both and leaves a clip above it coloured; opacity 50 % gives the midpoint (Ruling P10: replace, then lerp by opacity), including where the adjustment layer overlaps partially transparent content; hiding the track removes the effect.
- [ ] If the blend shader cannot build, a toast says so and blend and adjustment layers are skipped: do not expect to see this on a Mac, report it if you do.

## 9. Overlays
- [ ] Add each overlay (lower third, subscribe button, progress bar, sticker) from the Add overlay menu; edit text, subtext, colour, accent and sticker; the preview updates and each edit is one undo step.
- [ ] Overlay text uses the system font stack (the app ships no fonts): check it reads well, and that long text and emoji do not overflow or render as boxes.
- [ ] Lower third slides in over the first 0.4 s and out over the last 0.4 s; the progress bar fills across the clip.
- [ ] Move, scale and rotate overlays on the canvas; trim, move and split them on the timeline.

## 10. Export compared with the preview
- [ ] Export 1080p (and 4K) a clip with look + LUT + chroma key + overlay and open the MP4 in QuickTime Player: the picture matches the preview (colour, grain, overlays) and it plays with sound.
- [ ] Export a project that uses a blend mode, an adjustment layer and a skipped effect (for example by removing the LUT media outside the app): the export dialog lists what was skipped.
- [ ] Merge all into one clip with effects, overlays and an adjustment layer: the merged clip equals the preview.

## 11. Memory during export
- [ ] During a 4K export of a heavily effected clip, watch the Chrome tab and GPU process memory in Activity Monitor or `chrome://gpu` / Task Manager: the preview and export compositors both hold effect pools (about 1.6 GB worst case at 4K: 2 x (640 + 128) MiB plus overlay textures). Note the peak, whether anything is lost and whether dropping the preview pool during export is needed.

## 12. Not covered
- [ ] Safari: not verified. If you try it, record what happens but do not treat it as supported.
- [ ] Native AAC encoding on the Mac (the tests use the WASM encoder) is still unverified from Plans 1 to 3.
