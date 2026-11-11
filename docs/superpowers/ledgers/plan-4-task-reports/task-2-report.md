# Task 2 report: data v4, effect schema, pure stack edits

RED: `npx vitest run tests/video-effects.test.ts tests/video-effect-edits.test.ts tests/migrate.test.ts` failed first (two files could not import the missing modules, 7 migrate tests failed).
GREEN: 84/84 after implementation. `npm test` 889/889, typecheck and build clean, `__clipforge` absent from dist.
Mutation: removing the 8-effect cap and the lock guard made 7 edit tests fail; restored.
E2E (one at a time, all green): layers-migration (v1, v2, new v3->v4, `{version: 5}` stays protected), restore, compositor, export, layers-render, layers-robust-merge, layers-robust-perf, layers-robust, pip.

New: src/core/videoEffects.ts (schema, all 17 types `available: false`, final params), videoEffectEdits.ts (add/update/remove/move/applyLook/setClipBlend), migrateEffects.ts, clipEffects.ts, looks.ts (nine provisional looks, Task 5 refines).
Changed: model.ts (v4, Clip.effects/blend, MediaRef 'lut'), migrate.ts (accepts 1-4, newer = >4), timeline.ts splitClip (new ids on both halves), media/clip.ts, ui/edits.ts, ui/drag.ts, ui/MediaBin.tsx (lut hidden from bin), 37 test fixtures.

Concerns:
- looks.ts stacks are placeholders built from colour/bw/sepia/vignette/grain/splitTone; Task 5 owns the final data.
- addVideoEffect('lut') requires ref to existing media of kind 'lut'; migration drops lut effects without a string ref.
- audio clips always get blend 'normal'; setClipBlend refuses audio clips.

## Fix round 1
- detachAudio twin now gets `effects: []`, `blend: 'normal'` (only place that changes a clip's kind; clipFromMedia/placeRecording already produce empty stacks). Test added in tests/audio-edits.test.ts (RED first: 2 failed, then 114/114 green across video-effects, video-effect-edits, migrate, audio-edits).
- migrateEffects: missing/non-boolean `enabled` defaults to true, non-object `params` to defaults (unknown types and lut-without-ref still dropped); migrate test updated.
- Single `BLEND_MODES` exported from src/core/videoEffects.ts, used by edits and migration.
- `npm test` 890/890, typecheck, build clean; audio-ui (8) and layers-migration (4) e2e green, run one at a time.
