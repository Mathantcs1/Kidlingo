// Store-bound commands of the timeline keyframe row (Plan 5 Task 8): selecting keys and the keyboard (`[` / `]` jump,
// Delete removes selected keys before clips). Selection and jumps never touch history; each edit is ONE `apply`.
import { moveKeys, removeKeys } from '../core/keyframeEdits';
import type { KeyRef } from '../core/keyframeEdits';
import type { Clip, Id } from '../core/model';
import { findClip } from '../core/timeline';
import { useEditor } from '../state/store';
import { jumpToKeyCmd, seekToKeyCmd } from './keyframeCommands';
import { NO_KEYS, keySel, pickKey, selectedRefs, setKeySel } from './keySelection';
import { guard } from './Toast';

const editor = () => useEditor.getState();

/** The clip whose keys `[` / `]` and the row act on: the key selection's clip, else the only selected clip. */
export function keyClipId(): Id | null {
  const s = keySel();
  if (s.clipId !== null) return s.clipId;
  const { selection } = editor();
  return selection.length === 1 ? selection[0] : null;
}

export const hasSelectedKeys = (): boolean => keySel().times.length > 0;

/** Selects the diamond at local time `u` (additive toggles) and moves the playhead to it (pauses; no history). */
export function selectKeyCmd(clipId: Id, u: number, additive: boolean): void {
  const next = pickKey(keySel(), clipId, u, additive);
  setKeySel(next);
  if (next.times.includes(u)) seekToKeyCmd(clipId, u);
}

/** The selected clip and its key refs, or null when nothing is selected or the clip is gone. */
function selected(): { clip: Clip; refs: KeyRef[]; times: readonly number[] } | null {
  const s = keySel();
  if (s.clipId === null || s.times.length === 0) return null;
  const { clip } = findClip(editor().history.present, s.clipId);
  return { clip, refs: selectedRefs(clip, s.times), times: s.times };
}

/** Removes every selected key in ONE step (refusals such as a locked track are toasts); the selection is cleared. */
export function deleteSelectedKeysCmd(): void {
  guard(() => {
    const sel = selected();
    if (!sel) return;
    const before = editor().history.present;
    const { playhead } = editor();
    editor().apply((p) => removeKeys(p, sel.clip.id, sel.refs, playhead));
    if (editor().history.present !== before) setKeySel(NO_KEYS);
  });
}

/** Retimes the selected keys by `delta` seconds in ONE step; the selection follows them. Refusals are toasts. */
export function moveSelectedKeysCmd(delta: number): void {
  guard(() => {
    const sel = selected();
    if (!sel || delta === 0) return;
    const before = editor().history.present;
    editor().apply((p) => moveKeys(p, sel.clip.id, sel.refs, delta));
    if (editor().history.present !== before) setKeySel({ clipId: sel.clip.id, times: sel.times.map((t) => t + delta) });
  });
}

/** Escape: drops the key selection; true only when there was one (the caller then marks the event as used). */
export function dropKeySelectionOnEscape(): boolean {
  if (!hasSelectedKeys()) return false;
  setKeySel(NO_KEYS);
  return true;
}

/** `[` / `]`: the playhead to the previous/next key of the key clip (any property); no history. */
export function jumpKeyCmd(dir: -1 | 1): void {
  const id = keyClipId();
  if (id !== null) jumpToKeyCmd(id, null, dir);
}

/** Task 9 hook: opens the ease editor for the selected keys (double-click or Enter on a diamond). Unset until Task 9. */
let easeOpener: ((clipId: Id, refs: KeyRef[]) => void) | null = null;
export function setEaseOpener(fn: ((clipId: Id, refs: KeyRef[]) => void) | null): void {
  easeOpener = fn;
}
export function openEaseCmd(): void {
  const sel = selected();
  if (sel && easeOpener) easeOpener(sel.clip.id, sel.refs);
}
