// Store-bound editor commands shared by the toolbar, media bin and keyboard shortcuts.
import type { Id } from '../core/model';
import { useEditor } from '../state/store';
import { appendMedia, deleteClips, liveSelection, mergeClips, splitAt } from './edits';
import { guard } from './Toast';

const editor = () => useEditor.getState();

/** The current selection, minus any ids whose clips no longer exist. */
function selected(): Id[] {
  const { history, selection } = editor();
  return liveSelection(history.present, selection);
}

export function splitAtPlayhead(): void {
  guard(() => {
    const ids = selected();
    const { apply, playhead } = editor();
    apply((p) => splitAt(p, ids, playhead));
  });
}

export function deleteSelected(): void {
  guard(() => {
    const ids = selected();
    if (ids.length > 0) editor().apply((p) => deleteClips(p, ids));
  });
}

export function mergeSelected(): void {
  guard(() => {
    const ids = selected();
    editor().apply((p) => mergeClips(p, ids));
  });
}

export function addToTimeline(mediaId: Id): void {
  guard(() => editor().apply((p) => appendMedia(p, mediaId)));
}

export function togglePlay(): void {
  const { playing, setPlaying } = editor();
  setPlaying(!playing);
}

export function undo(): void {
  editor().undo();
}

export function redo(): void {
  editor().redo();
}
