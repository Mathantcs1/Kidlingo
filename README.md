# ClipForge

ClipForge is a video editor that runs entirely in your browser. You import clips, arrange, trim and split them on
a timeline, preview the result, and export an MP4. There is no server: decoding, rendering and encoding all
happen on your machine (WebCodecs, WebGL2, Web Audio), and your media never leaves it.

It is a static site built with React, TypeScript and Vite.

## Features

- **Import** video, audio and images with the Import button or by dropping files onto the media bin (several at
  once). Each item shows its kind, duration and whether it has sound. Videos without an audio track (for example
  screen recordings) import fine.
- **Media bin**: the `×` button removes an item from the project (if clips use it, ClipForge asks first and removes
  them too, as one undo step). **New project** starts over with an empty YouTube project (it asks first if the
  current project has anything in it); the imported files it no longer needs are then deleted from the browser.
- **Timeline** with stacked **video layers** and **audio tracks** (up to 8 of each; higher video layers are drawn on
  top and shown higher). Add media with the `+` button (appends to the end of the active track of the matching kind)
  or by dragging it from the media bin onto a track.
- **Track headers**: click a header (or an empty spot on its lane) to make it the active track; double-click the name
  to rename it (or focus it and press Enter or F2); the **M** button mutes, the **S** button solos (a "Solo on" badge shows while any track is soloed), the lock refuses every
  edit on the track, the eye hides a video layer from preview and export; the arrows reorder layers and `×` removes a
  track (asking first if it has clips). **+ Video layer** and **+ Audio track** add tracks. Each is one undo step.
  Mute and solo apply to the sound of video clips on a video layer too; while any track (of either kind) is soloed,
  only soloed tracks are heard. Hidden layers and muted tracks are left out of the export exactly as in the preview.
- **New-layer drop zones**: drop media from the bin, or drag a clip, onto the strip above the top video layer (or
  below the bottom audio track) to put it on a brand-new layer/track of its kind in one undo step.
- **Editing**: select clips (Shift-, Ctrl- or Cmd-click to select more than one), drag to move, drag the clip edges to trim, split at
  the playhead, delete, and **ripple delete** (delete and close the gap). Moves and trims snap to the edges of other clips and to 0. Timeline zoom in and out; during playback the timeline scrolls to keep the playhead in view.
- **Clip inspector** (right of the preview, for one selected clip): **volume** from 0 to 200 % (0 mutes), and for
  video and image clips how they cover the frame: **Fit** (whole picture, black bars), **Fill** (fills the frame,
  edges cropped) or **Blur** (whole picture over a blurred copy of itself). Choosing a mode resets the clip's
  position and scale to that mode's framing. Changing the project format keeps each clip's mode.
- **Audio editing** (the Inspector's Audio section for one selected clip with sound, and the audio track headers):
  - **Detach audio** turns a video clip's sound into its own audio clip on an audio track (the video clip is silenced
    and badged). **Attach back** removes the twin again, offered only while the twin still has the sound settings (volume, fades, pan, effects) the video clip had when detached.
  - **Waveforms** on audio clips (and a thin strip on video clips with sound), computed once per file and cached.
  - **Fade in / fade out** (seconds) and **pan** per clip; **track volume** with a slider in each audio and video track header (video clips' sound uses their track's volume).
    Pan is a balance law: at hard left or right the far channel is dropped and the near one stays at its source level.
  - **Effect chain** per clip (add, reorder, toggle, edit, remove): EQ, high-pass, low-pass, compressor, reverb, echo,
    gain, pitch shift and noise reduction, plus one-click **presets** (Podcast voice, Radio, Telephone, Deep voice,
    Chipmunk) and **Normalise** (raises the clip so its peak reaches near full scale). The live preview and the
    export use the same chain, so what you hear is what is exported.
  - **Auto-ducking**: the **D** button in an audio track header makes that track (say, music) dip under the clips of
    another audio track (say, a voice) by an amount you set, with attack and release. One undo step per change.
- **Picture effects** (the Inspector's Effects section for one selected video, image or adjustment clip; Plan 4, effect stacks run in
  list order, up to 8 per clip, each add/edit/toggle/reorder/remove is one undo step, and the preview and the export use the same shaders):
  - **Colour** (brightness, contrast, saturation, exposure, temperature, tint, hue, shadows, highlights), **LUT**,
    looks (**Black & white**, **Sepia**, **Split tone**, **Vignette**, **Film grain**), **Blur**, **Sharpen**, **Glow**,
    **Pixelate**, **RGB split**, **Glitch**, **VHS**, **Mirror**, **Invert** and **Chroma key**.
  - **Look presets** (Black & White, Sepia, Vintage Film, Teal & Orange, Cinematic, Moody, Golden Hour, Cool Blue,
    Punchy): one click replaces the clip's stack with the look's effects, as one undo step.
  - **LUTs**: import a `.cube` 3D LUT (2 to 65 points per side, up to 40 MB) with the Effects section's LUT import or the media bin's
    Import button; it is stored like media, named by its TITLE and file name, and used through the LUT effect (with an
    intensity). A LUT that a clip uses cannot be removed until the effect is removed. A bad `.cube` gives a message naming the file.
  - **Chroma key**: key colour (one colour picker, one undo step), similarity, smoothness and spill.
  - **Blend modes** (12, in the Inspector next to the effects) for any video or image clip, and **adjustment layers**
    (Add overlay menu): an effect stack, plus opacity and blend mode, that applies to everything on the layers beneath it
    during its time range; hide the track to turn it off.
  - **Overlays** (Add overlay menu): lower third, subscribe button, progress bar and stickers (heart, star, arrow, like,
    bell, fire, check, sparkle). They are clips on a video layer (text, subtext, colour, accent and sticker in the
    Inspector; position, scale, rotation and opacity like any clip) and are drawn with the system font stack.
- **Keyframe animation** (Plan 5, Part 5A): animate a clip over time instead of setting one fixed value.
  - **What can be keyed**: position, scale, rotation and opacity of video, image, overlay and adjustment clips
    (adjustment clips: opacity only), and every numeric parameter of a picture effect (Colour, Blur, Vignette,
    Chroma key colour and so on; Mirror's mode is not animatable). Audio clips have no keyframes.
  - **Inspector**: each property has a stopwatch (switch animation on or off, one undo step each), a key diamond
    (add a key holding the value shown, or remove the key under the playhead), previous/next key buttons and a mini
    key strip. While a property is animated, typing a value, dragging a slider or dragging the clip on the preview
    writes a key at the playhead (one undo step per gesture); the playhead must be on the clip. Turning animation off
    keeps the value shown at the playhead.
  - **Easing**: every segment between two keys has an ease: Linear, Hold, Ease in, Ease out, Ease in-out, Back,
    Elastic, Bounce or a **custom cubic-Bezier curve** edited in the ease editor (open it from a diamond with a
    double-click or Enter, or the ∿ button; drag the two handles or type the numbers; presets and curve edits are
    one undo step and apply to every property keyed at that time).
  - **Timeline diamonds**: a selected animated clip shows a row of key diamonds. Click to select a key (Shift-click for
    several), drag to retime (whole frames, one undo step, Escape cancels), Delete or Backspace removes the selected
    keys; `[` and `]` jump the playhead to the previous/next key.
  - **Motion path**: a selected clip with position keys shows its path on the preview (dots at the keys; clicking a
    dot moves the playhead to that key; with Plan 5B the dots and tangent handles can be dragged, see below).
  - Splitting, trimming, moving, ripple-deleting, joining, merging all and changing the project format keep the
    animation where it was (the keys follow the clip or the format).
- **Animation presets, springs, loops and curved paths** (Plan 5, Part 5B; saved data version 7):
  - **Presets**: the Inspector's Animation section has four slots per clip, In, Emphasis, Loop and Out, one preset
    each, chosen in a browser with animated previews (tabs Entrance, Emphasis, Continuous, Exit, My presets, Favourites;
    search by name or synonym; only the hovered tile moves, and with "reduce motion" on every tile is a still).
    Entrance/exit: Fade, Slide (four directions), Zoom, Pop, Spin, Drop, Whip, Rise (Sink on the way out). Emphasis:
    Pulse, Shake, Wobble, Flash, Hop, Spin 360 (the window starts at the playhead). Continuous: Breathe, Float, Spin
    loop, Jitter, Blink, Ken Burns. Each has its duration, delay, ease and parameters (direction, distance, intensity,
    turns...), one undo step per change. A preset is a procedural layer on top of the clip's own values (position and
    rotation add, scale and opacity multiply), so presets and keyframes combine, the fields and handles keep editing
    the clip's own (rest) transform, and a faint outline (the motion ghost) shows where a preset actually draws the
    picture. Adjustment layers only take the opacity presets (Fade, Flash, Blink); audio clips take none. A lower third
    with an In or Out preset turns its built-in slide off at that edge. Presets follow the clip when it is split,
    trimmed, moved, reframed or merged; the data stays small (about 150 bytes per slot).
  - **Spring easing**: a spring ease (stiffness, damping, mass, or Gentle / Snappy / Bouncy / Wobbly) in the ease
    editor, computed in real seconds so the same spring feels the same on a short and a long segment.
  - **Key loops**: after the last key a property can Repeat, Ping-pong or Continue (add each cycle's change: a steady
    spin), with a cycle count or until the end of the clip; one undo step per change.
  - **Curved motion paths**: drag the dots and the tangent handles of a clip's position keys on the preview (smooth
    keys mirror the other handle; Alt or Option breaks it; double-click a dot to switch corner/smooth; Escape cancels a
    drag; one undo step per drag), **Smooth path** curves the whole path in one step, and **Orient along path** turns
    the picture to face the way it moves. Speed along a curve is even (the ease maps to distance).
  - **Copy and paste**: Ctrl/Cmd+C copies the selected keyframes (or, with none selected, the selected clips),
    Ctrl/Cmd+V pastes what was copied last (keys at the playhead; clips at the playhead on the active track, one step per
    paste, so one copy can be pasted at several places), Ctrl/Cmd+D duplicates the selected clips right after them.
    **Copy animation / Paste animation** (buttons, or Ctrl/Cmd+Alt+C / V) replace a clip's whole animation (keys, loops,
    orient, effect keys and presets) with another's, adapting the scale when the pictures differ in size. Text fields
    keep native copy and paste.
  - **Personal presets**: Save as preset stores a clip's animation (name up to 40 characters, a category) in a library
    in the browser (IndexedDB, up to 100 presets of 64 kB; it survives New project and is not part of the project
    file); applying one copies it into the clip in one undo step, relative to the clip's own position. Rename, delete
    (asks first; clips keep their animation) and favourites are in the browser. A library written by a newer version is
    shown read-only and never overwritten.
- **Numeric position/scale/rotation/opacity fields** in the inspector for a video, image or overlay clip (adjustment clips get opacity only): X and Y in
  pixels from the frame centre (0 = centred), scale and opacity in percent, rotation in degrees clockwise. Type a
  value and press Enter (or leave the field) to apply it as one undo step; Up/Down step the value (Shift ×10) and
  Escape reverts what you typed. **Reset** puts the clip back where its Fit/Fill/Blur mode places it. The fields
  are disabled on a locked track.
- **Picture-in-picture on the preview**: drag, scale and rotate a clip directly on the preview; hold Shift to snap
  rotation, Alt to disable snapping. Select one video or image clip under the playhead (on a visible, unlocked
  layer) and drag inside its outline to move it (it snaps to the frame centre and edges), a corner to scale it
  about its centre, or the round handle above it to rotate it (hold Shift to snap the angle to 15° steps). Each
  drag is one undo step; Escape cancels it.
  Alt (Option on a Mac) disables snapping while you drag. A very large clip whose corners fall outside the preview
  panel can still be scaled and rotated with the inspector's numeric fields.
- **Merge** joins the selected clips back to back with no gaps. **Merge all into one clip** renders the whole
  timeline into a single new video in the media bin and replaces the timeline with it (one undo step; it can be
  cancelled). With layers, the new video is the composite of the visible layers (hidden layers are left out; if any hold clips you are asked to confirm first, because those clips are removed) with
  the sound of the audible tracks (muted ones, or those silenced by a solo elsewhere, are left out); it lands on the
  lowest video layer, which is unhidden, unmuted and unlocked, with its volume reset to 100 % and no ducking (the
  merged video already holds them) so the result is seen and heard. Every solo is
  cleared (the merged video already holds the mix); otherwise tracks keep their names, and the other (now empty)
  tracks their mute and hide flags. Undo brings back every clip and flag. A locked track that holds clips blocks
  it up front ("Track is locked") before anything is rendered; an empty locked track does not.
- **Formats**: YouTube 16:9 (1920x1080), Vertical 9:16 for Reels/Shorts/TikTok (1080x1920), Square 1:1
  (1080x1080) and Portrait 4:5 (1080x1350). Changing the format refits every clip still at its fit framing to the
  new canvas (faded or rotated full-frame clips still refit, keeping their opacity and rotation); a clip you moved
  or scaled keeps its place relative to the frame (position scaled per axis, size by the square root of the area
  ratio), so a picture-in-picture in the top-right corner stays there. Switching to another format and back
  restores the placement exactly, whatever the clip's size.
- **Preview** of the frame under the playhead, rendered with WebGL2, and **playback** with sound (Play/Pause).
- **Undo/redo** for every edit, and **autosave**: the project is restored when you reopen the page (a pending
  change is also saved when the tab is hidden or closed). If saving fails (for example because browser storage is
  full) a message says so once and the toolbar shows **Not saved** until saving works again. Clips whose media is
  no longer in browser storage are marked "missing media" instead of breaking the project.
- **Voice-over**: **Record** (in the toolbar) records from your microphone, starting at the playhead; press it
  again (**Stop**) to add the take as audio media named "Voice-over N", placed at the start position on the active
  audio track (or on a new audio track when that one is locked or the take would overlap a clip); one undo step.
  **Cancel** or Esc discards the take (a take longer than 5 seconds asks first; Esc while typing in a field
  or in a dialog does not). Export and Merge all wait until recording stops, and leaving the page asks first. The browser asks for microphone permission the first time; if it was
  blocked, allow it for this site in the address bar and try again. A timer shows the length; a take stops by
  itself at **30 minutes** (and keeps what was recorded). **Play along** (on by default) plays the timeline while
  you record so you can talk over the picture: **use headphones**, or the microphone picks up the playback. There
  is no latency compensation, so the voice can land slightly early against the picture (by the microphone's
  start-up and input latency, usually tens of milliseconds). The
  take is stored as an uncompressed mono WAV on your device (about 6 MB per minute at 48 kHz) and never leaves it.
- **Export** to MP4 (H.264 video + AAC audio) at 1080p or 4K, with a progress bar, cancel, and a file name you
  choose. 1080p fits the video in a 1920x1080 frame of the project's orientation (so 1080 px on the short side
  for every preset, e.g. 1080x1080 for Square); 4K doubles that (3840x2160 frame). A project with no audible clip
  exports without an audio track. Exporting does not change the project.

## Roadmap (planned, not implemented yet)

The multi-layer timeline (Plan 2), audio editing (Plan 3), visual effects (Plan 4) and the animation engine (Plan 5, Parts
5A and 5B) are implemented. Production runs `c9caebe` (deployed 2026-11-12): Plans 2 and 3, all of Plan 4 (Part B overlays and
adjustment layers included) and Plan 5 Part 5A (keyframes; data v6). **Plan 5 Part 5B (presets, springs, loops, curved
paths, copy/paste, personal presets; data v7) is implemented on the feature branch `feature/plan-5-animation` and is NOT
deployed yet.** The previous deployment (`1379e01`, Plan 4 complete, data v5) is the rollback candidate; saves from v6 are
one-way (an older tab shows "saved by a newer version" and leaves the data untouched) and so will saves from v7 be once
5B is deployed: a v6 build cannot open a v7 project. The manual QA checklists of Plans 4, 5A and 5B are still unrun on a
real GPU/Mac/Safari/QuickTime. The rest of Plan 5 is outlined in
[docs/superpowers/plans/2026-11-12-clipforge-plan-5-animation.md](docs/superpowers/plans/2026-11-12-clipforge-plan-5-animation.md):

- **5E crop, flip, anchor point**, **5D speed** (constant speed, reverse, ramps, freeze frame, pitch-preserving
  audio) and **5C transitions** (crossfade, wipe, slide, zoom on a cut).
- Later: text stagger/typewriter presets, effect-parameter presets, motion blur, loop-in, "convert preset to keyframes",
  library export/import, and a professional UI pass (a visual and usability polish of the whole editor; no data change).

There is currently no transition, speed, crop or text-clip tool (overlays carry fixed text only).

## Supported files

- Video: `.mp4` (H.264 + AAC is the main format), `.mov`, `.m4v`, `.webm`
- Audio: `.mp3`, `.wav`, `.m4a`
- Images: `.jpg`, `.png` (placed as 5-second clips)

A file imports only if your browser can decode its codecs; otherwise you get a clear "cannot be decoded" message
and nothing is stored.

**HEVC (H.265) and iPhone videos.** iPhones record HEVC by default, which many browsers cannot decode. Either
try Safari, or set the iPhone to record H.264 before filming: **Settings → Camera → Formats → Most Compatible**.

## Browser requirements

- **Tested in desktop Chrome** (the automated tests run in headless Chromium on Linux).
- **Safari: untested.** It is expected to work only on versions that provide WebCodecs audio decoding
  (`AudioDecoder`) and `FileSystemFileHandle.createWritable()` (Safari 26 and later, to our knowledge).
- ClipForge needs **WebCodecs** (video and audio decoding, video encoding), **WebGL2** (preview and export
  rendering), **Web Audio** and the **Origin Private File System (OPFS)** with writable files (media storage and
  export temp files).
- If any of these is missing, a banner at the top names exactly what is missing, for example "Your browser is
  missing: WebCodecs audio decoding, OPFS file writing. Use a recent desktop Chrome." Import is disabled when
  decoding or OPFS file writing is missing. Without WebGL2 the preview panel says it cannot show the preview.
  Without writable OPFS an export is built in memory (the export dialog says so), which limits very long or 4K
  exports to what fits in RAM.
- The page must be served over HTTPS or from `localhost`; these APIs are not available on plain HTTP.
- **One tab at a time.** All tabs of the site share one saved project and one media store, so ClipForge takes a
  browser lock ([Web Locks API](https://developer.mozilla.org/docs/Web/API/Web_Locks_API)) when it opens. A second
  tab shows "ClipForge is already open in another tab" and stays inert (it never loads, saves or deletes
  anything); when the first tab is closed or reloaded, exactly one waiting tab takes over in place (no
  reload) and loads the saved project. Browsers without Web Locks are
  assumed to use one tab, but since that cannot be proven ClipForge then never deletes unused media files at
  startup: they are freed only by **New project** (or by clearing the site's data).

### Troubleshooting: "Preview says WebGL2 is not available"

The preview panel names the reason the renderer could not start (WebGL2 missing, the browser refusing a WebGL2
context, a shader that would not compile, or GPU resources that could not be created). The rest of the editor
keeps working; export needs WebGL2 too and says so in the export dialog if it is missing.

- In Chrome, open `chrome://gpu`: under "Graphics Feature Status", **WebGL2** should say "Hardware accelerated".
  If it says "Unavailable" or "Software only", WebGL2 is turned off or blocked for your graphics card or driver.
- Make sure graphics acceleration is on: Chrome Settings → System → "Use graphics acceleration when available",
  then relaunch Chrome. In other browsers, look in the browser's graphics/performance settings.
- Click **Try again** in the preview panel (it starts the renderer on a fresh canvas), or reload the page.
- If it keeps failing, click **Copy details** and send us the text: it holds the technical error, the GPU
  renderer/vendor strings, your browser's user agent and what each WebGL2 context request returned.

## Privacy

Everything stays on your device; nothing is uploaded. Voice-over recordings and the audio processing (effects, noise reduction, waveforms) stay in the browser too. Imported media files are copied into the browser's Origin
Private File System, and the project (the timeline as JSON, which references media by ID) is saved in IndexedDB.
Clearing this site's data in the browser deletes your projects and imported media. Imported files that no
project state uses any more (removed media, undone imports, replaced merges) are deleted the next time ClipForge
starts and after **New project**; while the page is open they are kept so undo still works. Nothing is deleted at
startup unless the saved project was loaded successfully (or there was none). If the saved project cannot be
loaded (a storage error, or a project saved by a newer version), a notice says so, the saved project and all
media are left untouched and nothing is saved until you choose **Retry loading** or **Start a new project**. The
same happens if you start editing before the saved project has loaded. Loading the saved project asks first if you
have imported or edited anything since, because that work is then discarded. ClipForge asks the
browser for persistent storage after the first import, so the browser is less likely to evict your media.

## Keyboard shortcuts

Shortcuts are ignored while you type in a text field or select, and while the export dialog is open.

| Key | Action |
| --- | --- |
| Space | Play / pause |
| S | Split at the playhead (the selected clips, or every clip under the playhead if none is selected) |
| Delete or Backspace | Delete the selected keyframes if any are selected, otherwise the selected clips |
| Shift+Delete or Shift+Backspace | Same for keyframes; otherwise ripple delete: delete the selected clips and close the gaps |
| `[` / `]` | Jump the playhead to the previous / next keyframe of the selected clip (needs a key selected when several clips are selected) |
| Ctrl+C / Cmd+C | Copy the selected keyframes, or (none selected) the selected clips |
| Ctrl+V / Cmd+V | Paste what was copied last: keyframes at the playhead, or clips at the playhead on the active track |
| Ctrl+D / Cmd+D | Duplicate the selected clips right after them |
| Ctrl+Alt+C / Ctrl+Alt+V (Cmd+Option on a Mac) | Copy / paste the whole animation of a clip (buttons in the Animation section do the same) |
| Ctrl+Z / Cmd+Z | Undo |
| Shift+Ctrl+Z / Shift+Cmd+Z, or Ctrl+Y | Redo |

In the export dialog, Escape closes it (unless an export is running) and Tab stays inside the dialog.

Layers and the preview:

- On a track header, Enter or F2 renames the focused track name (Enter saves, Escape cancels). Tabbing into a header
  makes that track the active one.
- Space on a button you reached with the keyboard (Tab), such as a track's M/S/lock/eye button, presses that button
  instead of starting playback; after a mouse click on a button, Space still plays and pauses.
- While dragging a clip on the preview: Shift snaps rotation to 15° steps, Alt (Option on a Mac) turns snapping
  off, Escape cancels the drag.
- In the inspector's numeric fields: Up/Down step the value (Shift ×10), Enter applies, Escape reverts.

## Limits and known trade-offs

- **Audio memory**: playback decodes audio in windows of about 20 seconds just ahead of the playhead, so Play
  starts quickly and memory does not grow with the timeline length; export renders the mix window by window,
  interleaved with the video frames.
- **Video files are not loaded into memory**: they are stored in OPFS and read on demand. Export streams the MP4
  into a temp file in OPFS (in memory only if writable OPFS is missing). Finished exports stay in OPFS until the
  next export (or, if you downloaded them, until ClipForge next starts), so a running download is never cut off.
- **Export encoders**: H.264 uses the browser's WebCodecs encoder. AAC uses the browser's native encoder when it
  has one, and otherwise falls back to a WASM AAC encoder (FFmpeg, LGPL) that is downloaded on first use. This
  repo's tests run in headless Chromium on Linux, which has no native AAC encoder, so the WASM path is the one
  that is tested; the native AAC path has not been tested here.
- Not tested on a real Mac, in Safari or with real phone footage; the tests use generated clips.
- **Tracks**: up to 8 video layers and 8 audio tracks; a project always keeps at least one of each. Layers are
  reordered with the header arrows (not by dragging headers). The preview only opens decoders for clips on visible
  layers under the playhead, so hidden layers cost nothing while playing.
- **Audio editing limits**:
  - Detaching audio does not link the two clips: moving, trimming or splitting one leaves the other where it is.
  - Effects are per clip only (no track or master effects), and there are no crossfades between clips. An effect
    tail (reverb, echo) stops at the end of the clip, and splitting a clip restarts the effects cold in the second half.
  - **Noise reduction** is a basic spectral gate, not a studio denoiser. It learns the noise from the quiet parts of
    the clip, so it needs a little room tone; a clip that is only noise is left unchanged. It runs on the main thread
    in short slices, so the first Play of a denoised clip can wait about half a second. Export always renders it fully.
  - **Ducking** follows where the source track's clips are (their coverage), not whether anyone is speaking.
  - Echo can clip loud material in preview and export: the wet gain reaches about 1.67x at the defaults and about 11x at
    feedback 0.9 / mix 1. Use lower feedback or mix, or lower the clip volume (a limiter is future work).
  - Hiding the browser tab while recording is believed harmless in desktop Chrome but is unverified elsewhere.
  - **Voice-over** is recorded as mono WAV, held in memory until you stop and capped at 30 minutes. With Play along the
    voice can land slightly early (no latency compensation), and without headphones the microphone hears the playback.
    It needs the browser's microphone permission, and the host must not block it (`Permissions-Policy: microphone=(self)`,
    see Deploying). Safari is unverified for all of this.
- **Visual effects limits** (Plan 4):
  - At most 8 effects per clip. Effects run at the clip's picture size capped at twice the project's long side (for
    example 3840 px in a 1080p project), so very large photos are processed at a reduced size. Effects are refused on overlay
    clips; adjustment layers take effects.
  - A LUT must be a 3D `.cube` with 2 to 65 points per side and at most 40 MB; 1D LUTs are refused.
  - A **neutral key colour** (white, grey, black) keys every neutral pixel regardless of brightness. Spill suppression
    keeps brightness, so hair over a dark layer can keep a light-grey edge.
  - **Film grain (and other fine noise) is weaker in an export than in the preview** after the first few frames: the
    exporter's H.264 rate (12 Mbit/s) cannot hold per-pixel noise.
  - **Blend modes and adjustment layers need an extra blend shader.** If it cannot be built, a message says so and
    those clips are drawn normally or skipped, in the preview and in the export notice.
  - Overlay text uses the system font stack of the device; there are no custom fonts, so the look differs between machines.
  - Very heavy stacks are slow, for example 8 blurs of radius 100 took about 17 s per frame in the software renderer used
    by the tests; there is no time guard yet, and a GPU reset during an export ends it with a "WebGL context lost" error.
    The preview and an export each hold their own effect memory while an export runs.
  - All performance and accuracy measurements were made with the software renderer (SwiftShader) in headless Chromium;
    nothing was measured on a real GPU.
- **Animation limits** (Plan 5, Part 5A):
  - At most **500 keys per property** (a further key is refused; a hand-edited project is trimmed to the earliest 500).
    A key costs about 55 to 60 bytes of saved project.
  - No speed change, transitions or crop/flip yet (Parts 5E, 5D and 5C). (Presets, springs, loops and draggable paths
    arrived in Part 5B, below.)
  - A split or trim that is not a whole number of frames from the clip's start can move the animation's frame grid by
    less than one frame. A static edit of an animated property is refused ("This setting is animated: change it at the
    playhead"); turn the stopwatch off first.
  - A scale of 0 hides a clip (an Elastic or Back ease can overshoot to 0 briefly; values are floored at 0).
  - **Exports are not bit-reproducible in headless Chromium**: its software H.264 encoder gives slightly different bytes
    run to run at 1080p (the rendered frames are identical, the encoded ones differ by well under 1/255 on average).
  - Overlay text uses the device's system font; the animation measurements (preview frame time, memory, parity with
    the export) were made with the software renderer (SwiftShader) in headless Chromium on Linux, not on a real GPU,
    in Safari or in QuickTime (see `docs/superpowers/ledgers/plan-5a-manual-qa-checklist.md`).
- **Presets, loops and paths limits** (Plan 5, Part 5B; data v7 is one-way, a v6 build cannot open a v7 project):
  - One preset per slot (In, Emphasis, Loop, Out); no second emphasis, no per-letter text animation, no effect-parameter
    presets (blur-in), no motion blur, no loop before the first key and no "convert preset to keyframes" yet.
  - A preset's duration is 0.05 to 30 s, its delay 0 to 30 s, a loop's period 0.1 to 60 s, a key loop's count 1 to 1000
    or until the end; a clip with a shorter length than its In and Out windows together shrinks both. A split inside an
    entrance leaves the right half starting at rest (the left half is exact); an emphasis that straddles a cut stays
    whole on the half where it starts. If an entrance and an exit overlapped (both were shortened to fit the clip), a
    split also changes the kept frames of the left half, because each half then holds a lone, unscaled preset.
  - Presets act on position, rotation, scale and opacity only, never on effect parameters. Pop overshoots, so
    a Pop on an overlay draws it from a larger texture (sharp at the overshoot); overlay textures have no mipmaps, so a
    sticker shrinking a lot can show slight aliasing.
  - **Overlay texture budget**: the overlay textures drawn in one frame share 128 MiB (about eight at the 2048 px cap);
    past that, later overlays in the frame are drawn from smaller, softer textures (same size and place on screen).
    Preview and export use the same rule.
  - The library holds at most 100 presets of 64 kB each, lives in this browser only (no export or import yet) and is
    shared by every project; a private window may not be able to save to it.
  - Cmd+Option+C (copy animation) is also Chrome's Inspect shortcut on a Mac and may not be claimed (the buttons always
    work). Ctrl/Cmd+D is claimed whenever a clip is selected.
  - After a reload a project is restored exactly except that the order of fields inside a clip's `keys` may be
    normalised (no visible difference).
  - Like 5A: measurements (frame time, memory, parity) are from headless Chromium with a software renderer, not a real GPU,
    Safari or QuickTime (see `docs/superpowers/ledgers/plan-5b-manual-qa-checklist.md`).
- No transitions, speed change, crop or text clips yet (see the roadmap).

## Development

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript only
npm run build      # typecheck + production build into dist/
npm run e2e        # end-to-end tests (Playwright)
```

The end-to-end tests need **Chromium** and **ffmpeg/ffprobe** on the `PATH` (ffmpeg generates the test clips in
`tests/e2e/.fixtures/`, ffprobe checks exported files). Playwright starts the dev server itself on port 5173.
To use a specific Chromium build, set `PW_CHROMIUM_PATH=/path/to/chromium`; otherwise a preinstalled
`/opt/pw-browsers/chromium` is used if present, else Playwright's own browser (`npx playwright install chromium`).
Chromium is launched with a software WebGL2 renderer (SwiftShader), which is slow but works headless.

`npm run dev` and `npm run build` first run `scripts/copy-licenses.mjs`, which collects the licence texts of
everything that ships in the bundle into `public/licenses/` (git-ignored; copied to `dist/licenses/`).

Code layout: `src/core` (pure project model and timeline operations), `src/state` (store, undo history,
persistence), `src/media` (support check, OPFS storage, import, decode), `src/render` (WebGL2 compositor),
`src/audio` (shared clip chain, effects, mixer, mixdown, ducking), `src/export` (MP4 exporter), `src/ui` (React components).

## Deploying

ClipForge is a static site with no server-side code. Build it and host the `dist/` folder on any static host
(Vercel, Netlify, GitHub Pages, Cloudflare Pages, S3, nginx, ...):

```sh
npm run build   # typecheck + production build into dist/
npm run preview # serve dist/ locally on http://localhost:4173
```

It must be served over **HTTPS** (or from `localhost`), because WebCodecs and OPFS only work in secure contexts.
No special headers (COOP/COEP) are required.

- **Vercel:** `vercel.json` configures the Vite build (`npm run build` into `dist/`), rewrites every path except
  `/assets/*` to `/index.html` (static files are served first, so existing files still resolve), sets long-lived
  immutable caching for `/assets/*`, and adds `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`
  headers. A missing `/assets/*` file therefore gets a real 404 instead of the app shell, so a tab left open across
  a redeploy cannot cache an HTML page under an old chunk name; when such a tab needs a chunk that is gone, it
  says "ClipForge was updated — reload the page." The `Permissions-Policy` header allows the microphone for
  this site only (`microphone=(self)`, for voice-over recording) and disables the camera and geolocation. Other hosts
  must not block the microphone in their headers, or recording reports that access was blocked. Import the repository in Vercel or
  run `vercel --prod`.
- **Netlify / Cloudflare Pages:** build command `npm run build`, publish directory `dist`. A single-page fallback
  is optional because the app has one route.
- **GitHub Pages:** the site is served from a sub-path, so build with a base path:
  `npm run build -- --base=/<repo>/` (this also runs the licence-collecting prebuild step; `vite.config.ts` sets no
  `base`, so the flag is honoured), then publish `dist/`.
  Pages is HTTPS by default.

To check the production bundle (including the lazily loaded AAC encoder chunk) end to end, run
`npm run e2e:preview`. It builds the site, serves it with `vite preview` and exports a 1 s clip, verified with
ffprobe, and checks that the third-party licence notices are served and linked. The Vercel rewrite and headers
are applied by Vercel and cannot be tested locally.

## Third-party licenses

ClipForge ships the following third-party code in its bundle. The full licence texts are served with the site at
`/licenses/THIRD-PARTY.txt` (linked as "Third-party licenses" at the top right of the app) and generated by
`scripts/copy-licenses.mjs` from the installed packages.

| Package | Version | Licence |
| --- | --- | --- |
| [mediabunny](https://github.com/Vanilagy/mediabunny) | 1.65.2 | MPL-2.0 |
| [@mediabunny/aac-encoder](https://github.com/Vanilagy/mediabunny/tree/main/packages/aac-encoder) | 1.65.2 | MPL-2.0 |
| FFmpeg (AAC encoder, compiled to WASM inside @mediabunny/aac-encoder) | commit [`60a2818f76dcd1fee3155b1791304af104a0fc1b`](https://github.com/FFmpeg/FFmpeg/commit/60a2818f76dcd1fee3155b1791304af104a0fc1b) (`n9.1-dev-2902-g60a2818f76d`), unmodified | LGPL-2.1-or-later |
| [React](https://github.com/react/react) and react-dom | 19.3.1 | MIT |
| scheduler (dependency of react-dom) | 0.28.0 | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | 5.1.0 | MIT |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | 6.3.0 | Apache-2.0 |
| Vite 8.3.7 / Rolldown 1.2.18 runtime helpers | | MIT |

The FFmpeg build details are quoted from the @mediabunny/aac-encoder README: it was built from the commit above with
Emscripten 4.0.21, enables no GPL, version 3 or nonfree components, and its licence files are included. The
Mediabunny packages are used unmodified; their source is in the linked repository.
