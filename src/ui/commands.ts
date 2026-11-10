// Store-bound editor commands shared by the toolbar, media bin and keyboard shortcuts.
import type { Id } from '../core/model';
import { useEditor } from '../state/store';
import { appendMedia, deleteClips, mergeClips, splitAt } from './edits';
import { guard } from './Toast';

const editor = () => useEditor.getState();

export function splitAtPlayhead(): void {
  guard(() => {
    const { apply, selection, playhead } = editor();
    apply((p) => splitAt(p, selection, playhead));
  });
}

export function deleteSelected(): void {
  guard(() => {
    const { apply, selection } = editor();
    if (selection.length > 0) apply((p) => deleteClips(p, selection));
  });
}

export function mergeSelected(): void {
  guard(() => {
    const { apply, selection } = editor();
    apply((p) => mergeClips(p, selection));
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
