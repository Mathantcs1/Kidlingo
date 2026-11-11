# Task 11 report: preview/export parity, failure policy and performance

Status: DONE_WITH_CONCERNS (see Concerns). Commits:
- `c9ffb2b refactor: split exporter.ts (size, compositor, temp files, sources, AAC encoder)`: behaviour-preserving,
  exporter.ts 345 -> 188 lines (new `exportSize.ts` 32, `exportCompositor.ts` 60, `exportTemp.ts` 69,
  `exportSources.ts` 32, `aacEncoder.ts` 16); the public API is still re-exported from exporter.ts.
- `570e1e1 fix: say which effects and LUTs an export left out; toast for an effect that cannot run`.
- `2c73287 test: effects parity, failure policy and performance guards`.

## What the tests exposed (fixed)

1. **The preview never passed `onEffectUnavailable`**: a glow shader that failed to compile was skipped with no toast at
   all (only a console.warn). `PreviewRenderer` now forwards it and `Preview.tsx` shows
   `effectUnavailableMessage(type)`: "The Glow effect cannot run on this device, so it is skipped." (once per type per
   session, D8).
2. **No export notice existed.** `ExportOptions.onSkipped(skips)` is called once at the end of a successful export when
   anything was left out: `effects` = `skippedEffectTypes(p, compositor.unavailableTypes())` (session-wide list, read at
   the end, so a failure first seen by the preview, which gets no second callback, is still listed; only types used by
   an enabled effect on a visible track), `luts` = names from the export compositor's own `onLutUnavailable` (carried
   note from Task 6). The export dialog shows it (`export-notice`, cleared by the next job); merge-all shows it as an
   info toast ("Merged without ... Undo brings the original clips back."): merging bakes the degraded picture.
   Pure helpers in `src/render/effects/unavailable.ts`. The toast store moved to `src/ui/toastStore.ts` (Toast.tsx
   re-exports it) because importing Toast.tsx from mergeJob installed its store subscriptions and broke
   `export-job.test.ts`'s lastError checks.

## Tests

- Unit: `tests/effect-unavailable.test.ts` (5: skipped types order/hidden/disabled, messages; RED on missing module),
  `tests/export-notice.test.ts` (3: dialog notice set and cleared, merge info toast, no toast when nothing skipped;
  mutation-checked: dropping `notice: null` from `begin()` and dropping the merge toast each fail).
- `tests/e2e/effects-parity.spec.ts` (3):
  - colour + grain + vignette + LUT (17-point cube), 1920x1080 image, exported at 1080p, ffmpeg frames 0 and 2 vs the
    preview compositor at export size, at 30 and 25 fps. Three checks (see Ruling T11-1): the stack WITHOUT grain per
    pixel < 3/255; the full stack on 8x8 block means < 3/255; the exported grain correlates with the preview's frame N
    clearly more than with frame N+1 (same > 0.3, same - next > 0.15).
  - grain + glitch + VHS at 25 fps exported twice: identical ffmpeg framemd5 per frame (10 frames), and > 5 distinct.
  - Mutation: exporter rendering `t + 1/fps` fails the grain-correlation check (0.146 vs 0.680).
- `tests/e2e/effects-failure.spec.ts` (5):
  - in the app: `__clipforge.breakVideoEffect('glow')` (new DEV-only hook), invert + glow added through the UI => exactly
    one toast (MutationObserver log) over several renders, the preview still shows the inverted picture, the 1080p export
    finishes with the notice "Exported without these effects (this device cannot run them): Glow." and still one toast.
    RED before the fix (no toast).
  - harness: colour + broken glow + missing LUT + LUT exports frame-for-frame (framemd5) equal to colour + LUT, and
    `skips` = `{effects: ['glow'], luts: ['Gone.cube']}`, also on a second export (no callback that time). RED before
    the fix (skips null). Mutation: exporter without its onLutUnavailable fails.
  - context lost between two passes of a stack mid-export (`exportLosingContext`, loseMidway shader, 4th frame) =>
    rejects with the existing 'WebGL context lost' (shown as "Export failed: WebGL context lost"), no temp file left.
    Mutation: exporter swallowing renderFrame errors fails. (Removing only the pipeline's lost-context rethrow does NOT
    fail it: the post-stack assertNotLost and the compositor's assertUsable still catch the loss: defence in depth.)
  - hidden track with colour + blur + glow: passes [0, 0], effect memory 0 targets, frames black. Mutation: dropping the
    hidden filter in visible.ts fails.
  - performance guard (Ruling T11-2): 1080p, 4 effects vs none, interleaved frames, ratio of medians <= 14x; plus 4
    passes per frame exactly and exactly one 1920x1080 target pair (15.8 MiB). Mutation: recompiling shaders every frame
    measured 15.1-15.3x and fails.
- Harness (`src/harnessEffects.ts` 187 lines, dev-only): `renderRgb`, `timeRenderPair`, `exportWithSkips`,
  `exportLosingContext`. `grep -rl "__clipforge\|does not compile\|breakVideoEffect" dist` is empty.

Gate: `npm test` 78 files / 1080 tests; typecheck; build; dist grep empty. e2e one at a time, all green:
effects-parity 3, effects-failure 5, export 6, export-ui 4, export-dialog 2, export-gl 1, effects-lut-app 4,
effects-pipeline 7, effects-pipeline-robust 4, effects-ui 8, effects-ui-lut 3, layers-robust-merge 2, editor 12, fps 2.
Full `npm run e2e` not run (controller's Part A gate).

## Measured numbers (headless Chromium, SwiftShader)

Parity (mean |export - preview| / 255):

| fps / frame | no grain, per pixel | full stack, 8x8 blocks | full stack, per pixel | grain corr. same / next |
|---|---|---|---|---|
| 30 / 0 | 1.61 | 1.53 | 5.53 | 0.68 / 0.14 |
| 30 / 2 | 1.61 | 1.69 | 6.39 | 0.55 / 0.17 |
| 25 / 2 | 1.61 | 1.87 | 6.92 | 0.44 / 0.20 |

No effects at all: 1.27 per pixel (a systematic -1..-2 level shift from the YUV round trip). Grain alone: 8.0 per pixel,
1.9 on 8x8 blocks. Grain alone by export frame: correlation 0.83 with the same preview frame (0.00 with any other) at
frames 0-1, 0.69 at 2, ~0.05 with ANY frame at frame 7: the encoder's rate control drops grain in later P-frames.

Frame times at 1080p (one 1920x1080 image clip, median of 9-15 frames): none 13-18 ms; colour 75 (38 without the
exposure branch, which SwiftShader executes even at exposure 0); grain 43; vignette 36; invert 32; LUT 17-pt 86,
33-pt 81; colour+grain+vignette+LUT 158-189 ms (9.4-11.8x; 9.7-11.0x on interleaved medians); glow (defaults) 912 ms;
blur radius 100: 2.1 s; 8 x blur radius 100: 17.1 s per frame.

Pool memory (`TargetPool`, 640 MiB budget): 4 effects on one 1080p clip = 2 targets, 15.8 MiB. Four 4K-class image
layers (3840x2160 capped, 3600x2000, 3200x1800, 2400x1350) each with invert + blur (scratch) in a 1080p or 4K project:
9 targets = 185 MiB (3 sizes kept, LRU; the 4th size thrashes every frame, perf only). Theoretical worst cases are as
documented in passResources.ts: 1080p format 299 MB, 4K format capped at 671 MB, 8K format up to 1.59 GB transiently.
New finding: during an export the preview compositor stays alive with its own pool, so the worst case during an
export is twice the per-compositor figure (e.g. ~1.3 GB at a 4K format).

## Rulings

- Ruling: T11-1 — Parity is checked per pixel on the stack without grain, on 8x8 block means with grain, and by grain
  correlation with frame N vs N+1, instead of one per-pixel mean over the 4-effect stack: H.264 at the 1080p bitrate
  (12 Mbit/s) cannot keep per-pixel film grain (8/255 per pixel on grain alone), a codec limit not a render gap —
  cost if wrong: a fine-detail drift inside 8x8 blocks of the grain stack could slip (the no-grain per-pixel check
  still covers colour/vignette/LUT).
- Ruling: T11-2 — Performance guard relative threshold 14x (plan: 6x) plus exact structural guards (passes per frame,
  target count/bytes): measured 9.4-11.8x on SwiftShader with lean shaders (a trivial pass costs ~1 no-effect frame;
  the floor for 4 passes is ~5x); 14x still fails a per-frame recompile (15.1x) — cost if wrong: a <30% per-pass
  slowdown goes unnoticed by the time check.
- Ruling: T11-3 — Time guard for maximal stacks NOT implemented; documented measured limit instead (8 x blur 100 at
  1080p = 17 s/frame on SwiftShader, single blur 100 = 2.1 s, glow 0.9 s): the strided 1/s-resolution stage would
  change blur/glow output and break the Task 7 CPU-reference drift guards, too large for a parity task; D2 accepts slow
  preview, export is not real-time, and a GPU watchdog reset ends as the existing plain "WebGL context lost" failure
  (tested here) — cost if wrong: very heavy stacks stall the preview on weak GPUs; revisit after Task 14 manual QA on
  real hardware.

## Concerns

1. Film grain is visibly weaker in the exported file than in the preview after the first few frames (rate control at
   12 Mbit/s). Not a renderer bug; options for later: a higher bitrate when time-based noise effects are present, or a
   note in the README. Worth a Task 14 manual QA item.
2. Real GPUs are untested: all numbers are SwiftShader. The colour shader's exposure branch and the 3D LUT fetch are
   the expensive passes in software; on hardware they should be cheap. Pass fusion of point-wise effects would be the
   fix if real-GPU QA shows slow stacks.
3. Preview + export compositors coexist during an export (2 effect pools); see memory above.
4. The 4-effect perf threshold is calibrated on this machine's SwiftShader; a different CPU could shift the ratio.
5. Not pushed.
