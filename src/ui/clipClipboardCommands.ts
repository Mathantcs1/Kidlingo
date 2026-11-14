// Store-bound clip copy, paste and duplicate (Plan 5B Task 9, Part 1). Each paste or duplicate is ONE `apply` through
// `applyOk` (a refusal is a toast and no undo step); the selection becomes the new clips only when it went through.
import { copyClips, defaultPasteTrack, duplicateClips, pasteClips } from '../core/clipClipboard';
import type { Id, Project } from '../core/model';
import { useEditor } from '../state/store';
import { applyOk } from './applyOk';
import { clipPayload, setClipPayload } from './clipClipboard';
import { setCopySource } from './copySource';
import { liveSelection } from './edits';
import { guard, showError } from './Toast';

const editor = () => useEditor.getState();
const selected = (): Id[] => liveSelection(editor().history.present, editor().selection);
const clipIds = (p: Project): Set<Id> => new Set(p.tracks.flatMap((t) => t.clips.map((c) => c.id)));

/** Copies the selected clips (nothing selected: no-op). The next Ctrl/Cmd+V pastes them. */
export function copyClipsCmd(): void {
  const ids = selected();
  if (ids.length === 0) return;
  guard(() => {
    setClipPayload(copyClips(editor().history.present, ids));
    setCopySource('clips');
  });
}

/** Runs one project edit that adds clips and selects exactly the ones it added. */
function addingEdit(fn: (p: Project) => Project): void {
  const before = clipIds(editor().history.present);
  if (!applyOk(fn)) return;
  const added = [...clipIds(editor().history.present)].filter((id) => !before.has(id));
  if (added.length > 0) editor().select(added);
}

/** Pastes the copied clips at the playhead (earliest clip on the frame) on the active track, ONE step; repeatable. */
export function pasteClipsCmd(): void {
  const payload = clipPayload();
  if (!payload) return;
  const { playhead, activeTrackId } = editor();
  const trackId = defaultPasteTrack(editor().history.present, payload, activeTrackId);
  if (trackId === null) {
    showError('There is no track to paste onto');
    return;
  }
  addingEdit((p) => pasteClips(p, payload, { time: playhead, trackId }));
}

/** Duplicates the selected clips right after the end of the selection, on their own tracks, ONE step. */
export function duplicateClipsCmd(): void {
  const ids = selected();
  if (ids.length === 0) return;
  addingEdit((p) => duplicateClips(p, ids));
}

export const canCopyClips = (): boolean => selected().length > 0;
export const canPasteClips = (): boolean => clipPayload() !== null;
