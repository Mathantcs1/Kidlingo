# ClipForge

ClipForge is a video editor that runs entirely in your browser. You import clips, arrange, trim and split them on
a timeline, preview the result, and export an MP4. There is no server: decoding, rendering and encoding all
happen on your machine (WebCodecs, WebGL2, Web Audio), and your media never leaves it.

It is a static site built with React, TypeScript and Vite.

## Features

- **Import** video, audio and images with the Import button or by dropping files onto the media bin (several at
  once). Each item shows its kind, duration and whether it has sound. Videos without an audio track (for example
  screen recordings) import fine.
- **Timeline** with one video track and one audio track. Add media with the `+` button (appends to the end of
  the matching track) or by dragging it from the media bin onto a track.
- **Editing**: select clips (Shift-, Ctrl- or Cmd-click to select more than one), drag to move, drag the clip edges to trim, split at
  the playhead, delete. Moves and trims snap to the edges of other clips and to 0. Timeline zoom in and out.
- **Merge** joins the selected clips back to back with no gaps. **Merge all into one clip** renders the whole
  timeline into a single new video in the media bin and replaces the timeline with it (one undo step; it can be
  cancelled).
- **Formats**: YouTube 16:9 (1920x1080), Vertical 9:16 for Reels/Shorts/TikTok (1080x1920), Square 1:1
  (1080x1080) and Portrait 4:5 (1080x1350). Changing the format refits every clip to the new canvas.
- **Preview** of the frame under the playhead, rendered with WebGL2, and **playback** with sound (Play/Pause).
- **Undo/redo** for every edit, and **autosave**: the project is restored when you reopen the page. Clips whose
  media is no longer in browser storage are marked "missing media" instead of breaking the project.
- **Export** to MP4 (H.264 video + AAC audio) at 1080p or 4K, with a progress bar, cancel, and a file name you
  choose. 1080p fits the video in a 1920x1080 frame of the project's orientation (so 1080 px on the short side
  for every preset, e.g. 1080x1080 for Square); 4K doubles that (3840x2160 frame). A project with no audible clip
  exports without an audio track. Exporting does not change the project.

## Roadmap (planned, not implemented yet)

None of the following exist yet. They are planned as follow-up plans (Plans 2-4, outlined in the roadmap section
of [docs/superpowers/plans/2026-11-10-clipforge-foundation.md](docs/superpowers/plans/2026-11-10-clipforge-foundation.md)):

- **Plan 2, audio editing**: multiple audio tracks, detaching audio from video, waveforms, voiceover recording,
  audio effects, ducking, pitch-preserving speed changes.
- **Plan 3, visual effects and looks**: shader effects (color, blur, stylize, chroma key), LUT looks and `.cube`
  import, overlays.
- **Plan 4, animation and motion**: keyframes and easing, motion paths, text with animation presets,
  transitions, speed ramps, reverse, crop/rotate/flip.

There is currently no per-clip volume control, no fit-mode picker (clips are fitted to the canvas), and no
transition or text tool.

## Supported files

- Video: `.mp4` (H.264 + AAC is the main format), `.mov`, `.m4v`, `.webm`
- Audio: `.mp3`, `.wav`, `.m4a`
- Images: `.jpg`, `.png` (placed as 5-second clips)

A file imports only if your browser can decode its codecs; otherwise you get a clear "cannot be decoded" message
and nothing is stored.

**HEVC (H.265) and iPhone videos.** iPhones record HEVC by default, which many browsers cannot decode. Either
try Safari, or set the iPhone to record H.264 before filming: **Settings → Camera → Formats → Most Compatible**.

## Browser requirements

- **Chrome** (desktop) or **Safari 17+ on Mac**.
- Needs **WebCodecs** (decode and encode), **WebGL2** (preview and export rendering) and the **Origin Private
  File System (OPFS)** (media storage and export temp files).
- Without WebCodecs, ClipForge shows a banner at the top, "Your browser can't edit video. Use Chrome or Safari 17
  or later.", and import is disabled. Without WebGL2 the preview panel says it cannot show the preview.
- The page must be served over HTTPS or from `localhost`; these APIs are not available on plain HTTP.

## Privacy

Everything stays on your device; nothing is uploaded. Imported media files are copied into the browser's Origin
Private File System, and the project (the timeline as JSON, which references media by ID) is saved in IndexedDB.
Clearing this site's data in the browser deletes your projects and imported media.

## Keyboard shortcuts

Shortcuts are ignored while you type in a text field or select, and while the export dialog is open.

| Key | Action |
| --- | --- |
| Space | Play / pause |
| S | Split at the playhead (the selected clips, or every clip under the playhead if none is selected) |
| Delete or Backspace | Delete the selected clips |
| Ctrl+Z / Cmd+Z | Undo |
| Shift+Ctrl+Z / Shift+Cmd+Z, or Ctrl+Y | Redo |

In the export dialog, Escape closes it (unless an export is running) and Tab stays inside the dialog.

## Limits and known trade-offs

- **Audio memory**: for playback and export the audio of each clip is decoded in full into memory, and export
  renders a full mixdown up front. Expect roughly 1 GB of memory for about 20 minutes of stereo audio, so very
  long timelines may run out of memory.
- **Video files are not loaded into memory**: they are stored in OPFS and read on demand. Export streams the MP4
  into a temp file in OPFS (in memory only if OPFS is missing).
- **Export encoders**: H.264 uses the browser's WebCodecs encoder. AAC uses the browser's native encoder when it
  has one, and otherwise falls back to a WASM AAC encoder that is downloaded on first use. This repo's tests run
  in headless Chromium on Linux, which has no native AAC encoder, so the WASM path is the one that is tested; the
  native AAC path (Chrome or Safari on Mac) has not been tested here.
- Not tested on a real Mac or with real phone footage; the tests use generated clips.
- One video track and one audio track; no effects, transitions or text yet (see the roadmap).

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

Code layout: `src/core` (pure project model and timeline operations), `src/state` (store, undo history,
persistence), `src/media` (support check, OPFS storage, import, decode), `src/render` (WebGL2 compositor),
`src/audio` (mixer), `src/export` (MP4 exporter), `src/ui` (React components).

## Deploying

ClipForge is a static site with no server-side code. Build it and host the `dist/` folder on any static host
(Vercel, Netlify, GitHub Pages, Cloudflare Pages, S3, nginx, ...):

```sh
npm run build   # typecheck + production build into dist/
npm run preview # serve dist/ locally on http://localhost:4173
```

It must be served over **HTTPS** (or from `localhost`), because WebCodecs and OPFS only work in secure contexts.
No special headers (COOP/COEP) are required.

- **Vercel:** `vercel.json` configures the Vite build (`npm run build` into `dist/`), rewrites every path to
  `/index.html` (static files are served first, so assets still resolve), sets long-lived immutable caching for
  `/assets/*`, and adds `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` headers. Import the
  repository in Vercel or run `vercel --prod`.
- **Netlify / Cloudflare Pages:** build command `npm run build`, publish directory `dist`. A single-page fallback
  is optional because the app has one route.
- **GitHub Pages:** the site is served from a sub-path, so build with a base path:
  `npx vite build --base=/<repo>/` (`vite.config.ts` sets no `base`, so the CLI flag is honoured), then publish `dist/`.
  Pages is HTTPS by default.

To check the production bundle (including the lazily loaded AAC encoder chunk) end to end, run
`npm run e2e:preview`. It builds the site, serves it with `vite preview` and exports a 1 s clip, verified with
ffprobe. The Vercel rewrite and headers are applied by Vercel and cannot be tested locally.
