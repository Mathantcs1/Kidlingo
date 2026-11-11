# Task 14 report: journey, docs, QA checklist

## Delivered
- `tests/e2e/effects-journey.spec.ts` (124 lines) + `tests/e2e/effects-journey-helpers.ts` (92 lines). Through the real UI: import a
  video and a green-screen PNG (green with a red box, on its own video layer), import a `.cube` through the media bin, apply the Teal &
  Orange look (1 step), set the colour effect's saturation (1), add the LUT (1), add chroma key on the PNG image layer (1; effects are
  refused on overlay clips), add a lower third at the playhead (1). Asserts: one undo step per gesture (depth + 1 each), undo x5 returns the
  exact starting project JSON and depth, redo x5 the exact final JSON, reload restores the exact project JSON and the same preview,
  keyed corner shows the video (not green) and the red box stays, 1080p export has 1920x1080 and a duration within one frame of the
  timeline, an 8x4 grid of block means of the export frame at 1.5 s matches the preview (max 3.0/255, threshold 14), and the export's top row
  differs from the UNSTYLED source frame by 68.9/255 (threshold 30), so the look/colour/LUT really reach the export.
- Mutation check: comparing the export frame 28 frames later than the preview raised the drift to 101.8 and failed the `< 14` assertion; the spec was restored.
- `docs/superpowers/ledgers/plan-4-manual-qa-checklist.md`: 12 sections (each effect, looks, LUT good/bad, chroma key incl. hair over dark with
  P8, time-based effects, grain bitrate decision, performance incl. HEAVY stack and the real-GPU recheck of the 14x threshold and 3/255 guards,
  blend + adjustment incl. partial alpha, overlays/system font, QuickTime export match, memory during export, Safari unverified).
- README.md (features, roadmap, limits), PROJECT_HANDOFF.md (branches, test results, Plan 4 features, architecture, remaining work, known
  limits, pointers) and CLAUDE.md (data v5, branch list, roadmap) updated with facts only.

## Gate
`npm test` 1182 passed (87 files); typecheck clean; build OK; `grep -rl __clipforge dist` empty; e2e one at a time with `--trace off`:
effects-journey 1/1 (~20 s), effects-ui 8/8, overlays-ui 7/7, adjustment-app 3/3. The full e2e suite was not run (as instructed); the
last full run is the Part B gate (389/390, one unrelated flake) in the ledger.

## Notes / concerns
- The `fx-lut-import` input only exists while a clip is selected, so the journey imports the `.cube` through the media bin's file input.
- The `effects-ui-helpers.ts` `effects()`/`addEffect` helpers read the FIRST clip of the first track, so the journey adds chroma key with the raw controls.
- The journey keeps the preview/export grid tolerance at 14/255 (measured 3.0): it is calibrated on SwiftShader only.
- The workspace named in the brief does not exist; the ledger already lives in `docs/superpowers/ledgers/`. The ledger file itself was not edited.
- Final whole-branch review and the push/deploy decision for Part B remain with the controller and the user.
