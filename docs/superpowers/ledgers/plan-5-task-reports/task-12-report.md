# Plan 5 Task 12 report: keyframes journey, docs, QA checklist

## Counts
| | Before | After |
|---|---|---|
| `npm test` | 1435 (105 files) | 1435 (no unit change) |
| typecheck, build | green | green; `grep -rl __clipforge dist` empty |
| e2e run (one at a time, `--trace off`) | n/a | keyframes-journey 1/1 (38 s), keyframes-ui 4, keyframes-ease 4, keyframes-timeline 8, keyframes-robust-export 1/1 (2.1 min) |

No source change. Full e2e not run (controller). Not pushed.

## Files
- `tests/e2e/keyframes-journey.spec.ts` (155 lines), `tests/e2e/keyframes-journey-helpers.ts` (42): the journey, real UI.
- `tests/e2e/keyframes-robust-export.spec.ts`: exact-render check extended from 4 to 10 frames (1, 22, 45, 75, 110, 150, 190, 225, 262, 299; several mid-ease).
- `docs/superpowers/ledgers/plan-5a-manual-qa-checklist.md` (new, 38 items, merges every item of the old file); `plan-5-manual-qa-checklist.md` is now a pointer.
- `README.md` (animation feature section, roadmap, limits, shortcuts), `PROJECT_HANDOFF.md` (data v6, 5A section, test counts, next parts, known issues), `CLAUDE.md` (facts only), ledger line.

## The journey (18 gestures, each exactly one undo step, asserted from history depth)
Import a 3 s video and a 192x108 image; image on its own layer (shortened to 3 s as an uncounted setup edit).
1. Image: scale stopwatch, scale 50 (key at 0), position stopwatch, X -400, scale 90 and X 400 at 2.5 s, then `easeInOut` from the key at 0 s through the diamond's ease editor (one step; both scale and position keys change).
2. Video: opacity stopwatch, 0 at 0 s, 100 at 1 s, then the curve editor's `x1` field to 0.6 (a `bezier` ease, one step).
3. Video: add Colour, saturation stopwatch, -0.6 at 0 s, +0.6 at 2 s.
4. Split the video at 1.0 s (30 frames from its start) and the image at 1.5 s (45 frames) with the toolbar button; trim the video's right half's start by 12 px = 6 frames.
Then: undo x18 equals the start JSON exactly and the depth, redo x18 equals the final JSON; flush + reload restores the JSON exactly; 1080p export, ffprobe duration within one frame, three frames (39, 57, 78) against the reloaded preview.

## Measured tolerances (block means, 8x4 grid, per channel, /255)
- Split of the animated decoded video and the image, 8 frames around the cuts (29, 30, 31, 44, 45, 46, 60, 75): **0.00 at every frame**; guard < 3.
- Start trim of the video half, frames 45, 60, 75: **0.00**; guard < 3.
- Reloaded preview vs the pre-split preview at 39/57/78: 1.58/0.00/0.00 (fresh decode of the first frame); guard < 3.
- Export (1080p) vs preview at 39/57/78: **3.5/2.1/2.6**; guard < 8 (Plan 4's journey used 14).
- Exact 1080p render vs export, ten frames (robust-export): 0.96-1.21 mean abs error per channel (guard 3).
- The animation moves the picture: frame 39 vs 78 differ by more than 25/255 (asserted).

## Mutation check
`splitClip` right-half keys shifted by 0.5 s (`part(mid, hi, shift + 0.5)`): the journey fails at the cut frames (drift 66.8/64.8/17.9/18.9/18.9/22.4/1.1 against the guard 3). Reverted (`git checkout`).

## Concerns
1. Tolerances are SwiftShader and headless H.264 numbers; real GPUs and QuickTime are in the manual checklist.
2. The journey uses typed values and the store only for reads and the uncounted shortening of the still; the on-canvas drag and diamond drags are covered by other specs.
3. The journey cuts at whole frames (Ruling P5-5); non-whole-frame cuts remain accepted, documented.
4. 1080p exports are not byte-reproducible in headless Chromium (T11-2), so the journey compares block means, not hashes.
5. The extended ten-frame check moves about 120 MB through `page.evaluate` as base64 per render; it passed in 2.1 min total, but it is the heaviest spec in the suite.
