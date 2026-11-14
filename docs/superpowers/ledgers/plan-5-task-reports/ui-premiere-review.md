# UI "Premiere" pass: deploy-safety review (f8cb184..ed6fd40)

Read-only review by code reading (no tests/build run). Recommendation: DEPLOY. No Important findings.

## Scope checks
1. Data/core/persistence: no file under src/core, src/state, src/media, src/audio, src/render, src/export changed. No project JSON change, no version bump needed. Only new storage: localStorage key `clipforge.inspector.section.<name>` (try/catch on read and write). PASS.
2. Menu commands: every item calls an existing command (copyClipsCmd, pasteClipsCmd, duplicateClipsCmd, splitAtPlayhead, deleteSelected, rippleDeleteSelected, detachSelectedAudio, mergeSelected, copyAnimCmd, pasteAnimCmd, addLayer, toggleTrackFlag, moveLayer, removeLayer, addToTimeline, removeMediaItem, resetClipTransform via guard+apply). One apply each. New pasteClipsAtCmd mirrors pasteClipsCmd (addingEdit/applyOk, one apply). Locked tracks grey the edits and the core still refuses with a toast. PASS (see Minor 1-3).
3. ContextMenu: document keydown in capture phase with stopPropagation, so the window-bubble useShortcuts never sees Delete/Backspace/Space/Ctrl+Z/S while open. Closes on outside pointerdown, scroll (capture), resize, blur; Esc/Tab restore focus. All five listeners removed in the effect cleanup; component is always mounted so no state update after unmount. placeMenu clamps to the viewport. Text inputs keep the native menu (isTextEntry). Right button does not start clip/key/transform drags (all check `button !== 0`). PASS.
4. Help: App `modal` includes helpOpen, so useShortcuts is off and `.app` is inert; panel is rendered outside the inert tree, role=dialog aria-modal, window-capture Esc, manual Tab trap, focus to search on open and restore to the opener on unmount. Search filters title/group/keywords/text. Shortcut table is typed against `Shortcut` and unit-tested through `shortcutFor`. Content spot-checked against code: 8 tracks/kind, 8 effects/clip, 12 blend modes, volume 0-200, 30 min recording cap (recorder.ts 1800 s), Normalise -1 dBFS, button labels (+ Video layer, + Audio track, px/s, Add effect, Attach back, Play along), loop modes, Favourites/My presets. Browser claim ("tested in desktop Chrome, others untested, see README") matches README lines 191-193. No described feature found missing. PASS.
5. Collapsible sections: `hidden` plus explicit `.isec-body[hidden]{display:none}`, so collapsed controls are not focusable or tabbable. aria-expanded and aria-controls (useId) correct. localStorage guarded. Body stays mounted (testids still resolve). PASS (see Minor 4).
6. Testids: removed lines in the diff are `audio-pan-label` (re-added, moved inside the tf-grid), `btn-export` (same testid, moved Toolbar to TopBar, same disabled rules/title), `link-licenses` (now `testId` of the Help-menu link item; exists only while the Help menu is open; both users, help.spec and preview-build.spec, open the menu first). No other testid removed or renamed. `__clipforge` untouched and not newly referenced; preview-build spec still asserts it is absent in production. PASS.
7. Layout: columns are 280 (media, max) + flexible preview + 320 (inspector, was 200-240). At 1280x720 the preview keeps about 680px; inspector body scrolls internally (`overflow-y:auto`, groups `flex:none`). Export moved to the top bar (right group, always visible, `inert` only when the tab is locked, as before). Preview is now a column with a 28px header and a flex:1 stage. No horizontal overflow found at 1280. PASS.
8. Files over 200 lines (non-css): none (largest new: ContextMenu.tsx 152, Toolbar 161, MediaBin 166). CSS: styles.css 1125 (was larger), audio.css 214, both css so exempt.

## Important
None.

## Minor
1. src/ui/contextMenuItems.ts:60-66 (Reset transform): on an adjustment layer `resetClipTransform` returns the same project (no-op), yet the item is enabled. Scenario: right-click an adjustment layer, Reset transform: nothing happens, no toast, no undo step. Harmless. Suggest disabling for `clip.kind === 'adjustment'`.
2. src/ui/contextMenuItems.ts:57 (Save as preset...): ignores the library `saveBlocked` rule that AnimTransferBar applies (read-only/unavailable library). SavePresetDialog still refuses with a toast, so no data risk, only a dialog that cannot succeed.
3. src/ui/contextMenuItems.ts:34 (clip menu Paste): enablement uses the right-clicked clip's track lock, but pasteClipsCmd targets the active track at the playhead. If they differ and the active track is locked the core refuses with a toast; no data risk.
4. Focus loss with a collapsed Audio group: src/ui/audioCommands.ts:25,39 focusAfterRender targets `inspector-audio`/`audio-attach`, now inside a possibly hidden section. After Detach/Attach via keyboard with the Audio group collapsed, focus() on a hidden element silently fails and focus drops to body. Suggest expanding the group first or falling back to the clip.
5. src/ui/ContextMenu.tsx:121-135 (Licenses link item): onClick only closes the menu, no focus restore (the window blur also closes it). Keyboard user lands on body after the new tab opens.
6. Contrast: `.ctx-item:focus-visible/hover` and `.help-topic[aria-current=true]` use #dcdcdc on --accent-2 #1f6fc0 (about 3.7:1 at 12px; same as existing aria-pressed buttons); `.ctx-kbd` (--muted) on that highlight is about 1.8:1. Below 4.5:1 for small text.
7. src/ui/ContextMenu.tsx:34-41: menu is measured at the click point before clamping; near the right edge the shrink-to-fit width can wrap long labels (max 320px), so the clamp can be slightly conservative. Cosmetic.
8. src/ui/useEasePanelChrome.ts:29 registers Escape on window capture, which runs before the menu's document-capture handler: with the ease panel and a menu both open, one Escape closes both. Edge case.
9. HelpPanel does not reset `help-content` scrollTop when switching topic (same article element). Cosmetic. Help text "Open Help, then 'About ClipForge / Third-party licenses'" (helpContentMore.ts:70) reads oddly (two menu items).
10. Minor style: three lines in contextMenuItems.ts exceed 180 chars.
11. Controls now min-height 26px (--ctl-h) in toolbar/top bar/inspector: smaller click targets than before on touch; desktop-only app, so acceptable.

## Recommendation
DEPLOY (no Important findings), conditional on the full e2e run now in progress being green, including help.spec, context-menu.spec and preview-build.spec.
