# Plan 5C Task 1 (preparation, refactor only)
- compositor.ts 188 -> 167 (Phase 2 step loop -> `render/drawSteps.ts`); drawCollect.ts 151 -> 101 (image/video collection -> `drawCollectPicture.ts`); store.ts 197 -> 109 (autosave -> `state/autosave.ts`, bound via `bindAutosave`, store re-exports it).
- Not split: model.ts (185; `transitionTypes.ts` is created in Task 2 with its first use), exporter.ts (203), mixer.ts (189), mixdown 141, chain 164.
- 5D names for Q1: `sourceTimeAt`/`sourceAtOffset`/`timelineTimeAt`/`videoSourceTime`/`clipDuration` in `core/clipTime.ts`. A RAMP extrapolates along its own keys beyond the clip edges (not a held edge speed); constant speed holds the edge speed.
- Reader audit (`transform-readers.test.ts`) updated for the moved files. Gate: 2063 unit, tsc, build, dist hook empty, full e2e 633/633.
