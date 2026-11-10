# ClipForge: Browser Video Editor for YouTube — Design

Date: 2026-11-10

## Purpose and success criteria

A local-first, in-browser video editor for a YouTube creator on a Mac, for mixed content (vlogs, tutorials, shorts). Success: the user can import clips, arrange and trim them on a timeline, add text titles, transitions and audio, and export an H.264/AAC MP4 ready to upload to YouTube. No account, no backend, no uploads. Mac is the target; works in Chrome and Safari 17+.

## Approach

WebCodecs + canvas compositing (approach B). Hardware-accelerated decode and encode via the browser; timeline, text, transitions and audio mixing are done in-page. Preview and export share one compositor so output matches what the user sees. ffmpeg.wasm import fallback (approach C) is explicitly out of v1.

## v1 scope

- Import video, audio and images.
- Multi-track timeline: trim, split, move, delete, ripple-delete.
- Merge: drop several videos/images into the timeline and join them back-to-back (gapless, magnetic snapping); optional auto-transition between joined clips; reorder by drag; merge clips of different sizes/frame rates (scaled to project canvas, fit/fill/blur-background); merged audio is crossfaded or level-matched; one-click "Merge selected" and "Merge all to one clip".
- Project formats: YouTube 16:9, Reels/Shorts/TikTok 9:16, Square 1:1, Portrait 4:5; changing format re-fits clips (with blurred-background fill option).
- Text titles with animated presets (fade, slide, typewriter, pop).
- Transitions: fade, crossfade, wipe, slide, zoom, glitch.
- Per-clip effects (see Effects).
- Speed change (0.25x to 4x) and reverse.
- Crop, rotate, flip, scale and position; picture-in-picture via layered tracks.
- Animation controls: keyframes for position, scale, rotation, opacity and any effect parameter; easing presets (ease in/out, back, elastic, bounce) and a custom bezier curve editor; motion paths; in/out animation presets for clips, text and overlays (pop, slide, spin, drop, whip); speed ramping with a curve (smooth slow-mo to fast); Ken Burns zoom/pan; copy/paste keyframes across clips.
- Per-clip volume, audio fade in/out; background music track.
- Export 1080p or 4K MP4 (H.264 + AAC), with progress and cancel.
- Undo/redo; autosave projects locally.

Out of v1: auto-captions, video stabilization, ffmpeg fallback import.

## Effects

Effects are stackable per clip, reorderable, with live-adjustable parameters and a real-time preview.
- Color: brightness, contrast, saturation, exposure, temperature/tint, hue shift, curves-lite (shadows/highlights).
- Looks: black and white, sepia, vintage film (grain), cinematic teal-orange, vignette.
- Blur and sharpen: gaussian blur, sharpen, glow/bloom, pixelate.
- Stylize: RGB split, glitch, VHS, mirror, invert.
- Chroma key (green screen): key color, tolerance, edge softness, spill suppression.
- Premium looks for Instagram/YouTube: one-click look presets (Cinematic, Moody, Golden Hour, Teal-Orange, Fashion, Clean Vlog, Film 35mm, Cyberpunk, Dreamy) built from LUT-style color grading with an intensity slider; film emulation (grain, halation, gate weave); light leaks and lens flares; anamorphic streaks; soft glow/dreamy bloom; bokeh and background blur; letterbox cinematic bars; camera shake and zoom punch; whip-pan and flash transitions; beauty-lite skin smoothing is out of v1.
- Animated overlays: lower thirds, subscribe/like buttons, progress bar, and animated stickers/shapes, all keyframable.

Look presets are saved effect stacks plus a LUT, so users can also save their own and import `.cube` LUT files.

Each effect is a registry entry (`id`, parameter schema, WebGL2 fragment shader), so adding more later means adding one entry, with no changes to the compositor or UI.

## Delivery as a web app

The app is a static site (no server) that can be hosted anywhere (e.g. Vercel, Netlify, GitHub Pages) and used from any modern browser; all processing stays on the user's machine. A `npm run build` output in `dist/` is the deployable artifact.

## Stack

Vite, TypeScript, React, WebGL2 (effects and compositing), Zustand (editor state), Mediabunny (WebCodecs decode and MP4 mux), Web Audio API, IndexedDB (project JSON), OPFS (imported media), Vitest, Playwright.

## Units

- `core/timeline`: pure functions over the project model (tracks, clips, in/out points, transitions): trim, split, move, ripple-delete, merge/join (gapless concatenation, snapping), reframe to a canvas format, active-clips-at-time. No browser APIs.
- `media/`: import, metadata, thumbnails, waveforms, decoded frames/audio for a time range.
- `effects/`: effect registry (parameter schema + fragment shader per effect), keyframe interpolation with easing and bezier curves, LUT loading.
- `render/compositor`: `(timeline, t) -> canvas frame`, WebGL2; layering, transforms, effects, text, transitions. Used by preview and export.
- `audio/mixer`: clip and music mixing, volume; live (Web Audio) and offline (export).
- `export/`: steps the timeline frame by frame, encodes H.264/AAC, muxes MP4; progress and cancel.
- `ui/`: media bin, preview player, timeline (drag/trim/split), inspector, keyframe/curve editor, export dialog.

## Data flow

UI actions mutate a plain-JSON project model; the compositor and mixer re-render from it. Undo/redo is a snapshot history stack; autosave serializes the JSON. Media files are referenced by ID, never embedded in the project JSON.

## Error handling and limits

- Undecodable file on import: clear message that the file cannot be decoded.
- No WebCodecs: banner recommending Chrome or Safari 17+.
- Export failure or cancel: clean teardown; output streamed to disk-backed storage where possible.
- Large files are never fully loaded into memory.

## Testing

- Vitest unit tests for `core/timeline` (primary correctness risk).
- Vitest for keyframe interpolation, easing curves, speed-ramp time mapping, and merge/join logic (gapless, correct durations with transitions, mixed frame rates and sizes).
- Playwright: render each effect on a known test frame and assert pixel readback differs from the source in the expected way (e.g. B&W has equal RGB channels).
- Playwright smoke test: import a generated clip, split, export, verify output MP4 duration and streams.
- Cannot be verified on a real Mac or the user's footage in the build environment; expect tuning on the user's machine.

## Delivery

Code lives in a new standalone folder, `/home/user/clipforge`, with its own git repo. The user will create the remote and push.
