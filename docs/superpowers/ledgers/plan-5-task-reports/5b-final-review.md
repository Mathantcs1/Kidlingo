# Plan 5B final whole-part review (c9caebe..0a29797, branch feature/plan-5-animation)

Reviewer: fresh opus, read-only (temporary mutations and one temporary spec/test, all restored; `git status` clean except this file).

## Verdict

**DO-NOT-DEPLOY yet: 1 Important, 6 Minor.** The Important finding is a small UI fix (no data loss, undoable). Data safety
(migration v6 -> v7, repairs, `{version: 8}` protection, library never overwritten), the resolver-only invariant,
preview == export and one-apply-per-gesture all hold. Once I1 is fixed, has an e2e guard and a scoped re-review, and the
P5-2 gate passes (fresh full e2e and `e2e:preview`, which this review did NOT run), 5B can be deployed.

## Gate run by the reviewer

- `npm test`: 1807/1807 (146 files). `npm run typecheck`: green. `npm run build`: green.
- dist greps (`__clipforge`, `breakVideoEffect`, `breakBlendProgram`, `failNoiseProbes`, `renderBlend`): all 0 files.
- e2e, one at a time, `--trace off`: presets-journey 1/1 (1.1 min; export vs preview drift max 3.6/255),
  presets-robust-history 2/2, clip-copy-paste 4/4.
- Full e2e and `e2e:preview`: NOT run (not in scope; required by P5-2 before the deploy).

## Important (fix before deploy)

**I1. The "Save as preset" dialog does not stop the editor's global shortcuts. Delete pressed on its buttons deletes
the selected clip, and S splits a clip.** `src/ui/SavePresetDialog.tsx:61` renders an `aria-modal="true"` dialog
from inside the inspector (`AnimTransferBar.tsx:45`). The app's modal flag (`src/App.tsx:30-34`,
`modal = dialogOpen || confirmOpen`) does not know about this dialog, so `useShortcuts` stays enabled and `.app` is not
`inert`. The dialog's own window listener handles only Escape. Text entry is filtered (the name field and the category
select are safe), but buttons are not.
- Reproduced with a temporary spec (deleted afterwards): `setupPip`, give the PiP clip a Fade In, click `preset-save`,
  focus `preset-save-cancel`, press Delete. The clip count went from 3 to 2. The dialog disappeared because its clip
  was deleted and the inspector unmounted. Pressing `s` then split a clip (count 4).
- Realistic way to hit it: click Save, get a refusal toast (full library, name too long), then press Backspace while
  focus is still on the Save button to fix the name. The selected clip is deleted. Space toggles playback, Ctrl/Cmd+V
  pastes, Ctrl/Cmd+Z undoes behind the dialog, and Tab leaves the "modal".
- Undo restores everything, so no data is lost. It is still a destructive edit triggered from a modal, and it breaks
  the modal contract that Confirm and ExportDialog keep.
- Fix: register the dialog in the App modal state (it then becomes `inert` like the others), or at least
  `onKeyDown={(e) => e.stopPropagation()}` on the dialog root (the PresetBrowser pattern) plus a Tab trap. Add an e2e
  test: Delete, S and Space on `preset-save-cancel` / `preset-save-confirm` leave the project and history depth unchanged.

## Minor

**M1. Splitting a clip whose In and Out presets overlap (scaled by `fitFactor`) changes frames the left half keeps.**
`src/core/motion.ts:38-42` (fitFactor) and `src/core/motionClipOps.ts:47-64` (splitMotion). After the split, each half
has a lone slot, and a lone slot is never scaled (P5B-6). Repro (temporary unit test, deleted): a 4 s clip with Fade In
3 s and Fade Out 3 s, split at +1 s. Opacity at 10.5 s goes from 0.25 to 0.167, and at 10.9 s from 0.45 to 0.30. D12
says the left half is frame-exact. The property tests pick cases where this does not happen. This is visual only and
undoable. Either accept it as a ruling and add it to the QA list, or let splitMotion store the scaled timings on a half
whose original was fitted.

**M2. Paste animation onto a selection that includes an audio clip refuses the whole paste.** `src/core/animTransfer.ts:142`
throws `AUDIO` for that clip. Paste keys (`:73`) instead skips the audio clip and counts it. The behaviour is
inconsistent. It is safe (the refusal is atomic), but a user who selected a video and its detached audio cannot paste
an animation. Suggest skipping and counting the audio clip, as pasteKeys does.

**M3. A user preset with relative position keys lands relative to the destination's STATIC `transform.x/y`, even when
that clip's position is keyed** (`src/core/animTransfer.ts:136`). A keyed clip's static x/y is a stale value, so the
preset jumps to an old rest position. Use the base position at the anchor (`resolvedTransform`) instead, or document it.

**M4. The overlay byte budget depends on draw order and on the output size** (`src/render/overlays/textures.ts:136-146`).
The topmost overlays are the ones that shrink. Preview and export use different `pixelScale`, so a frame over the
budget in one of them may not be over it in the other, and edge texels can then differ between preview and export.
This is documented in the T10-3 comment. Note: the budget only applies past 128 MiB, so ordinary projects are not
affected.

**M5. The docs will be stale on deploy.** `CLAUDE.md`, `README.md:166-171` and `PROJECT_HANDOFF.md:25,130,210,218`
say 5B is "NOT deployed". The deploy commit must update them, along with the production SHA.

**M6. The clipboard chords read `e.key`** (`src/ui/keys.ts:76-82`). On non-Latin layouts (for example Cyrillic,
where Ctrl+C gives `e.key === 'с'`), Ctrl/Cmd+C, V and D do nothing. Undo has the same pre-existing behaviour.
Ctrl+Alt+C / V use `e.code` and work. Consider `e.code` for C, V and D as well. This is a usability issue only.

Earlier deferred minors are unchanged and still recorded in the ledger and the QA checklist: Cmd+Option+C may be
claimed by Chrome's devtools on a Mac, Ctrl/Cmd+D is suppressed while a clip is selected, the library's 64 kB size
check is a byte check, small hit targets, and others.

## Verified (no finding)

- **A Data safety.** `migrate.ts` adds `repairMotion` in `toClip`. v6 data has no new fields, so the result is
  identical to the input except for `version`. `withKeys` and `withMotion` remove empty fields. `{version: 8}`, `8.5`
  and `Infinity` return `newer`, and `classifySaved` reports them `unsupported` (never overwritten; `tabLock.ts`
  keeps a single writer). The D14 repairs (counts, tangents, spring, `broken` and `orient`, loops of absent targets,
  presets per kind) never throw and never touch `media`. Edits store canonical slots (`canonical()` uses
  `repairMotion`), so a reload does not change an edited stack (T10-4 key order is the only difference).
  - The preset library (`presetLibrary.ts`) checks the stored record inside an atomic idb-keyval `update`. The
    updater throws on a read-only record, so nothing is written. A newer or malformed record is shown read-only.
  - The clipboards are memory only and are cleared on `epoch`. A damaged stored preset throws inside
    `applyUserPreset`, which turns it into a TimelineError, so the project is unchanged.
- **B Resolver-only.** Evaluators are called outside `src/core` only from `drawCollect` (`resolveClip`), the ghost
  (`resolveClip`/`motionAt`), the preset tiles (`resolveClip`) and the ease editor curve (`easeAt`, a drawing only).
  The reader audit lists every `.motion`, `.loops` and `.orient` read in render, ui, export, media and audio.
  `src/state/presetLibrary.ts` checks a library record, not a clip.
  - Fast path: `resolveClip` returns the same object for static clips and for `motion: {}`. `maxDrawnScale` equals
    `maxScale` for 5A projects.
- **C Preview == export.** One `collectDraws`. `beginFrame` resets the budget every frame, and so does `prune`.
  Evaluation is closed form, with no random numbers and no clock. The journey and robust-export specs agree (above).
- **D One apply per gesture.** Clip paste and duplicate use `applyOk` (one apply; selection changes only on success).
  Key and animation paste onto several clips is one `commitAll` project. Loop groups use one apply (`setLoopCmd`
  reduce). Path drags commit once on release, and the live preview uses the same `withLivePath`.
- **E Shortcuts.** Text fields, selects and contentEditable are filtered before `claims`. Ranges and colour pickers
  are blocked except for play, undo, redo and prev/next. Chords are claimed only when they have something to do and
  no text is selected. Repeats are swallowed. The preset browser root stops propagation. The one gap is I1.
- **F Limits and hostile data.** Loop counts are capped at 1000 and evaluated in closed form (no work grows with the
  cycle count). `MAX_KEYS` applies to paste. `offsetCycles` is bounded by `MAX_DRAWN_CYCLES`. `at` and `phase` are
  bounded to ±1e6. Durations, periods and params are clamped. `maxDrawnScale` is capped and NaN reads as the cap.
  Textures are capped at 2048 px and by the 128 MiB budget. TargetPool is unchanged. The library is capped at 100
  presets and 64 kB each.
- **G** No dev hooks in dist (above).
- **H** The preset browser keeps one tab stop, Escape returns focus, and the popover stops propagation. Confirm and
  rename work. The gap is I1 (no focus trap and no inert background in the Save dialog).
- **I** README, CLAUDE.md and PROJECT_HANDOFF do not claim more than is tested. Safari and Mac are marked unverified,
  and Cmd+Option+C is called out. They need the deploy update (M5).
- Re-verified per the ledger: `orientBake.ts` (the heading is baked into the static or keyed rotation, the range
  refusal is kept, both UI callers pass the playhead to `removeKeys`) and `pathCurve` end directions.

## Mutation checks (11 new ones, each restored; every one caught)

| Guard broken | Caught by |
|---|---|
| migrateMotion: adjustment clips keep non-opacity presets | migrate-v7 (adjustment), anim-transfer (kind rules) |
| migrate: `repairMotion` not wired in `toClip` | migrate-v7 (2 tests) |
| migrateKeys: loop count upper clamp 1000 removed | migrate-v7-keys, migrate-v7 |
| migrateKeys: tangent clamp ±KEYED_POSITION_LIMIT removed | migrate-v7-keys (2) |
| migrate: newer check off by one (`> CURRENT + 1`, so v8 is accepted) | migrate-v7, migrate, persist |
| overlay budget: the overlay that crosses the budget keeps its full size | overlay-budget |
| pasteKeys: a refused destination is skipped instead of refusing the whole paste (paste atomicity) | anim-transfer (2), transfer-commands |
| motion loop count off by one (`n <= count`) | motion.test (timing) |
| library: damaged key lists accepted (`keyListsOk` removed: read-only classification) | preset-library |
| dragStale: preset-stack replacement no longer ends a drag | drag-stale |
| withoutTransformKeys: `orient` kept when position keys are removed | loop-edits (only in the full suite: not in the targeted files) |

## Recommendation

DO-NOT-DEPLOY at 0a29797. Fix I1, add its e2e guard, run a scoped re-review, then run the P5-2 gate: a fresh full
`npm run e2e -- --trace off`, `npm run e2e:preview`, and a fast-forward check against `c9caebe`. Decide M1 (ruling or
fix) and M2/M3 (small fixes or QA items) in the same fix wave. Nothing found puts saved projects, media or the preset
library at risk.
