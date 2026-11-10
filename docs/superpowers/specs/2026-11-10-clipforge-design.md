# ClipForge: Browser Video Editor for YouTube — Design

Date: 2026-11-10

## Purpose and success criteria

A local-first, in-browser video editor for a YouTube creator on a Mac, for mixed content (vlogs, tutorials, shorts). Success: the user can import clips, arrange and trim them on a timeline, add text titles, transitions and audio, and export an H.264/AAC MP4 ready to upload to YouTube. No account, no backend, no uploads. Mac is the target; works in Chrome and Safari 17+.

## Approach

WebCodecs + canvas compositing (approach B). Hardware-accelerated decode and encode via the browser; timeline, text, transitions and audio mixing are done in-page. Preview and export share one compositor so output matches what the user sees. ffmpeg.wasm import fallback (approach C) is explicitly out of v1.

## v1 scope

- Import video, audio and images.
- Multi-track timeline: trim, split, move, delete, ripple-delete.
- Text titles; fade and crossfade transitions.
- Per-clip volume; background music track.
- Export 1080p or 4K MP4 (H.264 + AAC), with progress and cancel.
- Undo/redo; autosave projects locally.

Out of v1: auto-captions, keyframe animation, color grading, chroma key, ffmpeg fallback import.

## Stack

Vite, TypeScript, React, Zustand (editor state), Mediabunny (WebCodecs decode and MP4 mux), Web Audio API, IndexedDB (project JSON), OPFS (imported media), Vitest, Playwright.

## Units

- `core/timeline`: pure functions over the project model (tracks, clips, in/out points, transitions): trim, split, move, ripple-delete, active-clips-at-time. No browser APIs.
- `media/`: import, metadata, thumbnails, waveforms, decoded frames/audio for a time range.
- `render/compositor`: `(timeline, t) -> canvas frame`; layering, text, fades, crossfades. Used by preview and export.
- `audio/mixer`: clip and music mixing, volume; live (Web Audio) and offline (export).
- `export/`: steps the timeline frame by frame, encodes H.264/AAC, muxes MP4; progress and cancel.
- `ui/`: media bin, preview player, timeline (drag/trim/split), inspector, export dialog.

## Data flow

UI actions mutate a plain-JSON project model; the compositor and mixer re-render from it. Undo/redo is a snapshot history stack; autosave serializes the JSON. Media files are referenced by ID, never embedded in the project JSON.

## Error handling and limits

- Undecodable file on import: clear message that the file cannot be decoded.
- No WebCodecs: banner recommending Chrome or Safari 17+.
- Export failure or cancel: clean teardown; output streamed to disk-backed storage where possible.
- Large files are never fully loaded into memory.

## Testing

- Vitest unit tests for `core/timeline` (primary correctness risk).
- Playwright smoke test: import a generated clip, split, export, verify output MP4 duration and streams.
- Cannot be verified on a real Mac or the user's footage in the build environment; expect tuning on the user's machine.

## Delivery

Code lives in a new standalone folder, `/home/user/clipforge`, with its own git repo. The user will create the remote and push.
