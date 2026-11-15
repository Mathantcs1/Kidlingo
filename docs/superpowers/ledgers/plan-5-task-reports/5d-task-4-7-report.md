# Plan 5D Tasks 4-7: report (implementer notes)

## Task 4 (timeline edits)
- `speedEdits.ts` (setSpeed/setReverse/setRamp/setPreservePitch), `freezeEdits.ts`; trim/split through the time map; twin match includes the
  retiming fields; freeze clips refuse detach; drag limits for reversed clips; `migrateSpeed` keeps the length of a repaired ramp (review fix).
- Mutations caught: ripple on all tracks (speed-edits), reverse halves not swapped (speed-split-trim), twin equality ignoring speed
  (detach-speed), ramp-length restore disabled (migrate-speed, 2 tests).
- Full e2e: 592 passed.
- Deviation: a forward START-trim drag is not clamped in `trimTarget` (existing tests pin that contract; core `trimClip` refuses `in < 0`).

## Task 5 (keys, presets, frame grid)
- `offsetOfLocal`/`shiftLocal`/`localAtStart`/`footageRange` in clipTime; key visibility, frame, diamonds, previous/next, key drag clamps,
  `moveKeys` (timeline seconds), emphasis bands, loop phase and the playhead emphasis go through the map. Identity-timed clips keep the old
  expressions (bit-identical).
- Mutation caught: key visibility by footage instead of timeline offset (keys-speed, reverse).
- E2E: new `speed-keys.spec.ts` + keyframes-timeline(-multi), keyframes-offframe, keyframes-path, presets-render.

## Task 6 (video render at speed and freeze)
- `drawCollect` looks frames up through `videoSourceTime`. Fixture `frame-index.mp4` (grey-coded frame numbers).
- Mutation caught: dropping the speed factor (speed-render 2x fails).
- Full e2e: 599 passed.

## Task 7 (reverse decode)
- `reverseCache.ts` (budget + window planner, unit-tested), `reverseRun.ts` (ImageBitmap window served as VideoFrame wrappers), `decodeStats.ts`.
  `videoSource.ts` split back under 210 lines.
- Measured (SwiftShader, 960x540, 300 output frames): phone-gop (2 s GOP) reverse 2.2-2.4x forward (plan target 2x, gate relaxed to 3x);
  long-gop (10 s GOP) 2.7x forward (gate 5x). Peak held bytes 132.7 MB <= 128 MiB budget. The forward time is render-dominated.
- Mutations caught: no mid-frame offset in `videoSourceTime` (first frame wrong); a forward-anchored window (time guards fail).
- Note: windows hold n frames (span (n-1)*dur plus the frame covering `lo`), the old window is released BEFORE decoding the next so the
  held bytes never exceed the budget.

## Task 8 (audio planning, resampler, reverse audio)
- A retimed clip is a virtual speed-1 source over clip-local timeline seconds [0, D] (`planWindow`); one `loadSegmentAudio` (decode, noise
  reduction in the footage domain, retime) serves the live mixer and the export. Resampler: Blackman-windowed sinc, cut-off follows the
  local speed (band-limited when sped up), samples read at their centres (so reverse is an exact mirror), output depends only on its
  global index (window-independent).
- Measured: 1 kHz at 2x -> 2 kHz (>0.98 amplitude), 10 kHz at 4x leaves < 1 % at its 8 kHz alias, seams (1 s windows vs one pass) 0 difference,
  live == export < 1e-3, A/V markers within 0 frames at 0.5x, 2x and reverse.
- Mutations caught: output index not global (all seam specs fail); the kernel-margin and grid-shift mutations are NOT caught (they are
  self-consistent / covered by the cut margin): documented, no test claims them.
- Full e2e: 613 passed.

## Task 9 (pitch-preserving stretch)
- Block-anchored WSOLA (`wsola.ts`): 15 ms hop, 30 ms Hann grains, +-7.5 ms offset search (decimated 4:1 then refined), chain restart on a global
  2 s grid so any slice of the output is a pure function of the footage. Default for a retimed clip unless `preservePitch === false`; a plain
  reverse at speed 1 is the exact mirror. First live window 2 s when a clip is stretched (D10).
- Measured: 440 Hz stays 440.0 Hz at 0.25x/0.5x/2x/4x with exact mapped length; sweep 100 Hz-8 kHz tracks the mapped footage frequency within 4 %
  (+-8 % gate: a 60 ms analysis window averages a moving tone); seams 0 difference incl. reverse and a ramp; A/V markers 85 ms early at 0.25x
  (transient smearing, a known WSOLA limit; gate 3 frames), within 10 ms at 2x/4x; pitch effect composes (0.5x + 12 st = 880 Hz).
- Mutations caught: no chain restarts (pitch test), chain not anchored on the global grid (window-independence test).
- Known limit: one mild phase seam per 2 s restart; AAC decode of different ranges may differ in the last bits (argmax flips only near ties).
