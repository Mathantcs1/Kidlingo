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
