// Store-bound animation transfer (Plan 5B Task 9): copy/paste of timeline keys and of a whole animation, and applying a
// user preset. A paste onto several clips is ONE `apply` (one undo step); refusals are toasts and add no step. Ctrl/Cmd+V
// pastes whatever was copied last (clips, keys or an animation: copySource).
import { copyAnimation, copyKeys } from '../core/animPayload';
import type { Anchor, TransferResult } from '../core/animTransfer';
import { pasteAnimation, pasteKeys } from '../core/animTransfer';
import type { Id, Project } from '../core/model';
import { applyUserPreset } from '../core/userPresets';
import type { UserPreset } from '../core/userPresets';
import { useEditor } from '../state/store';
import { animPayload, keysPayload, setAnimPayload, setKeysPayload } from './animClipboard';
import { applyOk } from './applyOk';
import { pasteClipsCmd } from './clipClipboardCommands';
import { copySource, setCopySource } from './copySource';
import { liveSelection } from './edits';
import { keySel, selectedRefs } from './keySelection';
import { guard, showError, showInfo } from './Toast';

const editor = () => useEditor.getState();
const selection = (): Id[] => liveSelection(editor().history.present, editor().selection);

/** The one selected clip (for copying an animation), else a toast. */
function oneClip(what: string): Id | null {
  const ids = selection();
  if (ids.length === 1) return ids[0];
  showError(`Select one clip to ${what}`);
  return null;
}

/** Copies the selected timeline keys (every target at the selected times). */
export function copyKeysCmd(): void {
  const s = keySel();
  if (s.clipId === null || s.times.length === 0) return;
  guard(() => {
    const p = editor().history.present;
    const clip = p.tracks.flatMap((t) => t.clips).find((c) => c.id === s.clipId);
    if (!clip) return;
    setKeysPayload(copyKeys(p, clip.id, selectedRefs(clip, s.times)));
    setCopySource('keys');
  });
}

/** Tells how many settings a paste left out (one toast). */
function reportSkipped(skipped: number, changed: boolean): void {
  if (skipped === 0) return;
  showInfo(changed ? `${skipped} setting${skipped === 1 ? '' : 's'} could not be pasted and ${skipped === 1 ? 'was' : 'were'} skipped.` : 'Nothing could be pasted there: the clip has no matching settings.');
}

/** Runs a paste edit as ONE step and reports the skipped settings. */
function pasteEdit(run: (p: Project) => TransferResult): void {
  const before = editor().history.present;
  let skipped = 0;
  if (!applyOk((p) => { const r = run(p); skipped = r.skipped; return r.project; })) return;
  reportSkipped(skipped, editor().history.present !== before);
}

/** Pastes the copied keys into every selected clip at the playhead. */
export function pasteKeysCmd(): void {
  const payload = keysPayload();
  if (!payload) return;
  const { playhead } = editor();
  pasteEdit((p) => pasteKeys(p, selection(), payload, playhead));
}

/** Copies the selected clip's whole animation. */
export function copyAnimCmd(): void {
  const id = oneClip('copy its animation');
  if (id === null) return;
  guard(() => {
    setAnimPayload(copyAnimation(editor().history.present, id));
    setCopySource('anim');
  });
}

/** Replaces the animation of every selected clip with the copied one. */
export function pasteAnimCmd(anchor: Anchor = 'start'): void {
  const payload = animPayload();
  if (!payload) return;
  const { playhead } = editor();
  pasteEdit((p) => pasteAnimation(p, selection(), payload, { anchor, t: playhead }));
}

/** Applies a user preset to the clip (replacing its animation) in ONE step; true when it went through. */
export function applyUserPresetCmd(clipId: Id, preset: UserPreset): boolean {
  const { playhead } = editor();
  return applyOk((p) => applyUserPreset(p, clipId, preset, playhead));
}

/** Ctrl/Cmd+V: pastes what was copied last. */
export function pasteCopiedCmd(): void {
  const kind = copySource();
  if (kind === 'clips') pasteClipsCmd();
  else if (kind === 'keys') pasteKeysCmd();
  else if (kind === 'anim') pasteAnimCmd();
}

export const canCopyAnim = (): boolean => selection().length === 1;
