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
- **Timeline** with one video track and one audio track (more tracks are planned). Add media with the `+` button (appends to the end of
  the matching track) or by dragging it from the media bin onto a track.
- **Editing**: select clips (Shift-, Ctrl- or Cmd-click to select more than one), drag to move, drag the clip edges to trim, split at
  the playhead, delete, and **ripple delete** (delete and close the gap). Moves and trims snap to the edges of other clips and to 0. Timeline zoom in and out; during playback the timeline scrolls to keep the playhead in view.
- **Clip inspector** (right of the preview, for one selected clip): **volume** from 0 to 200 % (0 mutes), and for
  video and image clips how they cover the frame: **Fit** (whole picture, black bars), **Fill** (fills the frame,
  edges cropped) or **Blur** (whole picture over a blurred copy of itself). Choosing a mode resets the clip's
  position and scale to that mode's framing. Changing the project format keeps each clip's mode.
- **Merge** joins the selected clips back to back with no gaps. **Merge all into one clip** renders the whole
  timeline into a single new video in the media bin and replaces the timeline with it (one undo step; it can be
  cancelled).
- **Formats**: YouTube 16:9 (1920x1080), Vertical 9:16 for Reels/Shorts/TikTok (1080x1920), Square 1:1
  (1080x1080) and Portrait 4:5 (1080x1350). Changing the format refits every clip to the new canvas.
- **Preview** of the frame under the playhead, rendered with WebGL2, and **playback** with sound (Play/Pause).
- **Undo/redo** for every edit, and **autosave**: the project is restored when you reopen the page (a pending
  change is also saved when the tab is hidden or closed). If saving fails (for example because browser storage is
  full) a message says so once and the toolbar shows **Not saved** until saving works again. Clips whose media is
  no longer in browser storage are marked "missing media" instead of breaking the project.
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

There is currently no transition, text or effects tool, and only one video and one audio track.

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

## Privacy

Everything stays on your device; nothing is uploaded. Imported media files are copied into the browser's Origin
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
| Delete or Backspace | Delete the selected clips |
| Shift+Delete or Shift+Backspace | Ripple delete: delete the selected clips and close the gaps |
| Ctrl+Z / Cmd+Z | Undo |
| Shift+Ctrl+Z / Shift+Cmd+Z, or Ctrl+Y | Redo |

In the export dialog, Escape closes it (unless an export is running) and Tab stays inside the dialog.

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

`npm run dev` and `npm run build` first run `scripts/copy-licenses.mjs`, which collects the licence texts of
everything that ships in the bundle into `public/licenses/` (git-ignored; copied to `dist/licenses/`).

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

- **Vercel:** `vercel.json` configures the Vite build (`npm run build` into `dist/`), rewrites every path except
  `/assets/*` to `/index.html` (static files are served first, so existing files still resolve), sets long-lived
  immutable caching for `/assets/*`, and adds `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`
  headers. A missing `/assets/*` file therefore gets a real 404 instead of the app shell, so a tab left open across
  a redeploy cannot cache an HTML page under an old chunk name; when such a tab needs a chunk that is gone, it
  says "ClipForge was updated — reload the page." The `Permissions-Policy` header disables the microphone
  (`microphone=()`); it must be relaxed when voiceover recording (Plan 2) lands. Import the repository in Vercel or
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
