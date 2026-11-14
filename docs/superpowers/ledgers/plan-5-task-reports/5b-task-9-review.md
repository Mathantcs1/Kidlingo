# Plan 5B Task 9 review (aa07f76..739b97e on c9ddc2d)

Verdict: 0 Important, 7 Minor. Gate: npm test 1789/1789, typecheck green. e2e (one at a time, --trace off): clip-copy-paste 4/4, anim-transfer 4/4, user-presets 4/4, presets-browser 7/7.

## Mutation checks (each reverted, git status clean)
- overlap guard (`hasRoom` in clipClipboard.ts place): caught (clip-clipboard unit).
- "atomic" swallow of addClip errors in the reduce: SURVIVES, but it is an equivalent mutant: every refusal is checked in `planned` before any addClip, so addClip cannot throw there (see Minor 6).
- read-only library never writes (presetLibrary.ts change): caught, 3 failures.
- size adaptation (`fitRatio` forced to 1): caught, 2 failures.
- `claims('copy')` always true: caught, 3 failures.
- text-field passthrough (remove `isTyping` in useShortcuts): caught by e2e clip-copy-paste text-field spec.

## Verified OK
- Clip copy/paste/duplicate: deep structuredClone, new clip and effect ids (picture and audio), media referenced not copied, relative offsets, locked/overlap/kind/missing-media refusals thrown before any change, empty payload returns same ref, paste time snapped to frame, one `apply` via applyOk, selection moves only on success, repeated paste works (payload never consumed). No link groups exist in the model (detached audio is inferred from equal media/start/in/out), so nothing to relink; keys, motion, overlay and adjustment fields travel in the clone and keys are clip-local so stay clip-relative.
- Shortcuts: text fields/select/contenteditable filtered before claims (isTyping); range/colour inputs block all but play/undo/redo/prev/next; chords claimed only with something to do and never over selected text (copy, copyKeys, copyAnim); keys selected precedence copies keys; Ctrl/Cmd+Alt+C/V by code.
- Animation transfer: one project per multi-clip paste, whole-paste refusal on locked/outside-playhead/MAX_KEYS, same-frame replacement, skipped counts, repair functions used, resolver untouched; reader audit test unchanged and green. Library record is IndexedDB, not Project: no data version change needed, no PRESET_SCHEMA/LOOP_MODES change in the diff.
- Library: newer/malformed record read-only and untouched, caps, serialised RMW that re-reads the stored record (a stale tab does not overwrite another tab's presets, and refuses if another tab upgraded to v2), delete only from library, favourites persist.
- Testids all kept (moved with PresetTabs/PresetBrowser split), no new `__clipforge` use, no file over 200 lines in .ts/.tsx (presets.css is 300, CSS).

## Minor
1. src/state/presetLibrary.ts:~95 (`change`): idb-keyval get then set is not one IndexedDB transaction. Two tabs saving at the same instant can both read the same record and the later set drops the other's preset (last writer wins within a millisecond window; only the in-tab queue serialises). Fix: idb-keyval `update()` (single readwrite transaction), validating inside the updater.
2. src/state/presetLibrary.ts:~99: `JSON.stringify(preset).length` counts UTF-16 units, not bytes; a name or payload of non-Latin text can exceed 64 kB bytes. Cosmetic.
3. src/state/presetLibrary.ts `isPreset`: validates only the payload shell, not key arrays. A hand-corrupted record with `payload.keys.position = 5` passes classify, then `applyUserPreset` throws a non-TimelineError inside applyOk (shown by guard, no state change; not a data-loss bug).
4. src/ui/shortcutCommands.ts `claims('duplicate')`: Ctrl/Cmd+D is claimed whenever a clip is selected, so the browser bookmark shortcut is suppressed on the editor page even with focus outside a text field (by design per T9-5, but worth stating in the QA list). Also `pasteAnim` and `paste` ignore selected text (harmless: no native paste on a non-field).
5. src/core/clipClipboard.ts `place`/`defaultPasteTrack`: a multi-track block (e.g. video on track 1 plus its detached audio) keeps raw index offsets, so with interleaved video/audio tracks pasting on a different active track hits a kind mismatch and refuses instead of finding matching tracks. Safe (atomic refusal) but a usability gap.
6. tests/clip-clipboard.test.ts: no test can make `addClip` throw inside the reduce, so the "atomic" comment relies on the pre-check; consider an assertion that a refusal on the LAST planned clip leaves the first track untouched (input immutability) to pin it.
7. src/ui/SavePresetDialog.tsx `save`: `setBusy(false)` can run after the dialog unmounts (Escape while saving); harmless warning-free in React 19, but the save still completes silently.
