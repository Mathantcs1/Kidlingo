# Plan 5B Task 9 report: clip copy/paste (new), animation transfer, save-as-preset library

Commits (not pushed): `aa07f76` refactor: split PresetBrowser, close only on success; `b889e8b` feat: copy, paste and duplicate clips; `c5aca5a` feat: copy and paste animation, save as preset.

## Counts
npm test 1722 -> 1723 (Part 0) -> 1755 (Part 1) -> 1789 (Part 2); typecheck, build green; `grep -rl __clipforge dist` empty at each part.
New unit files: preset-commands 3, clip-clipboard 21, clip-clipboard-commands 8, anim-transfer 17, preset-library 9, transfer-commands 8.
New e2e: presets-browser +2 (7), clip-copy-paste 4, anim-transfer 4, user-presets 4.
Run one at a time (--trace off), all green: presets-browser, -ui, -canvas, -overlays, -render, editor, gestures, inspector, keyframes-timeline, -timeline-multi, -ease-keys, -ease-scope, -ui, -ease, -loops-ui, -spring-ui, -offframe, overlays-ui, transform-fields, pip, pip-visibility, focus-modality, audio-ui, effects-ui, blend-ui, path-edit. Full e2e NOT run (controller).
Flake: keyframes-loops-ui "Repeat, a count..." (150 ms wait before a pixel read) fails about 1 run in 5-6 ALSO on the unmodified tree (verified with git stash); passed in the final run. Not caused by this task.

## Rulings
- Ruling T9-1: PresetBrowser split into PresetTabs, usePresetPopover, presetCategories, presetEntries; `applyOk(fn)` (src/ui/applyOk.ts) = guard+apply that reports success; setPresetCmd returns boolean; the browser closes only on success. A locked track already unmounts the browser, so the refused-keeps-open case is covered by a store-level test, not e2e.
- Ruling T9-2: ARIA: listbox children are presentation wrappers holding the options; the empty note is outside the listbox; stars (and user-tile rename/delete) are mouse shortcuts, aria-hidden, tabindex -1, with F / F2 / Delete as keyboard equivalents (aria-keyshortcuts).
- Ruling T9-3: clip paste anchors: payload clips keep start offsets from the earliest and track offsets from the topmost copied track; target track = active track if it fits the lead clip's kind, else the copied clip's track, else the first track of that kind; a multi-track block that would run past the last track moves up to fit, then kind mismatch refuses. Duplicate places the block right after the latest end (not frame-snapped, so no sub-frame overlap) on the original tracks. Missing media refuses. Selection becomes the new clips only on success.
- Ruling T9-4: `epoch` counter in the editor store (bumped by loadProject) clears every clipboard on New project or restore (covers the plan's "New project clears the clipboard" without editing projectCommands).
- Ruling T9-5: shortcuts: Ctrl/Cmd+C copies selected keys when keys are selected, else clips; Ctrl/Cmd+V pastes what was copied LAST (clips, keys or animation; `copySource`); Ctrl/Cmd+D duplicates; Ctrl/Cmd+Alt+C / V (by physical key) copy/paste the whole animation. A chord is claimed (preventDefault) only if it has something to do and not while text is selected on the page; text fields, sliders and colour pickers are never hijacked (shortcutBlockedByRange now blocks everything except play/undo/redo/prev/next). Concern: Cmd+Option+C is Chrome's Inspect shortcut on a Mac and may not be preventable (manual QA); the buttons always work.
- Ruling T9-6: keys paste: playhead must be on every destination clip (else the whole paste is refused); targets a clip cannot take (kind filter, missing effect) and keys falling outside the clip are skipped and counted in one info toast; a locked destination refuses everything; same-frame keys are replaced (P5-6); values go through the saved-data repair functions.
- Ruling T9-7: whole-animation paste REPLACES keys, loops, orient, effect keys and the preset stack; times are relative to the visible start (emphasis `at` relative; loop `phase` shifted by lo - origin); kind rules via repairClipKeys/repairMotion; fit-scale: video/image fitTransform scale, overlay = format width / base width of its type, others 1.
- Ruling T9-8: user presets: anchor by category: in/loop/custom at the visible start, out at the clip end, emphasis at the playhead; positions relative to the first position key, applied relative to the destination's static x/y; applying replaces the destination animation in ONE step. Library: record validated strictly (any bad entry => whole record read-only, untouched); writers serialised read-modify-write; favourites kept in memory when the library is read-only/unavailable; Save button disabled with the reason in that state.
- Ruling T9-9: `copyKeys(p, clipId, refs)` / `copyAnimation(p, clipId)` take the project (not the clip) because size adaptation needs the media and format at copy time.

## Deviations
- No project-commands edit; epoch used (T9-4). `presetFavourites.ts` removed (merged into presetLibraryStore.ts).
- kf-copy/kf-paste/anim-copy/anim-paste/preset-save sit in the Animation section footer (AnimTransferBar), not on a timeline key row. No clip context menu exists, so no menu entries.
- Library cap messages are LibraryError; export/import of the library stays deferred (Plan 11/12).

## Mutation checks (broken, caught by)
clip paste: locked check, overlap check, media check, deep copy, effect ids, frame snap, duplicate offset (clip-clipboard unit); text-field guard (e2e text-field specs fail, after strengthening the Part 2 test: the first version survived because selected text also blocked the chord); no size adaptation, same-frame replacement, occurrence index, emphasis shift, relative position, lock guard, MAX_KEYS, end anchor, loop phase (added a test after it survived), no-op identity (anim-transfer unit + e2e); library: readOnly write guard, newer-version check, caps, no-write-on-noop, serialisation, malformed check (preset-library unit; e2e newer-version spec caught the overwrite); epoch clear removed (e2e New project); applyOk failure flag (preset-commands).

## Deferred / notes
Manual QA: Cmd+Alt+C on Mac, tile keyboard (F2/Delete), screen reader on the listbox, narrow window popover. Rename/delete hit targets are small mouse buttons. `PresetBrowser.tsx` is 183 lines. Reader audit unchanged (hasAnimation lives in core).
