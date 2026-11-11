// Commands that ask before they discard work: removing media from the project, and starting a new project.
import { emptyProject } from '../core/model';
import type { Id } from '../core/model';
import { flushAutosave, useEditor } from '../state/store';
import { askConfirm } from './Confirm';
import { clipsUsingMedia, projectHasWork, removeMediaFromProject, usedByText } from './edits';
import { collectUnusedMedia, gcPermitForNewProject, resolveRestoreFailure, useRestoreFailure } from './session';
import { guard } from './Toast';

const editor = () => useEditor.getState();

/**
 * Removes media from the project; if clips use it, asks first and removes them too (one undo step). Only the
 * project changes: the stored file stays until GC finds it unreferenced, so undo keeps working this session.
 */
export async function removeMediaItem(mediaId: Id): Promise<void> {
  const m = editor().history.present.media[mediaId];
  if (!m) return;
  const used = clipsUsingMedia(editor().history.present, mediaId);
  // A LUT in use is refused (removeMediaFromProject says why); other media asks, then removes its clips too.
  if (used > 0 && m.kind !== 'lut') {
    const ok = await askConfirm({
      title: `Remove ${m.name}?`,
      message: `${usedByText(used)} ${used === 1 ? 'That clip is' : 'Those clips are'} removed too.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
  }
  guard(() => editor().apply((p) => removeMediaFromProject(p, mediaId)));
}

/** The New project question, by why the saved project is not loaded (null: it is loaded, or there is none). */
export function newProjectWarning(kind: 'failed' | 'skipped' | null): string {
  if (kind === 'failed') {
    return 'The saved project could not be loaded. Starting over replaces the saved project and deletes its imported files from this browser. This cannot be undone.';
  }
  if (kind === 'skipped') {
    return 'You have a saved project, but it was not loaded because you started editing first. Starting a new project replaces it and deletes its imported files from this browser. This cannot be undone.';
  }
  return 'The timeline and the media bin are cleared and the imported files are deleted from this browser. This cannot be undone.';
}

/**
 * Starts an empty YouTube project (undo history cleared), asking first unless nothing would be lost (no media or
 * clips in any undo/redo state, no unloadable saved project), then deletes the media files nothing references any
 * more. The new project is saved before any file is deleted, so a reload never brings back a project whose media is
 * gone; if that save fails nothing is deleted.
 */
export async function newProject(): Promise<void> {
  const { message, kind } = useRestoreFailure.getState();
  const failed = message !== null;
  if (failed || projectHasWork(editor().history)) {
    const ok = await askConfirm({
      title: 'Start a new project?',
      message: newProjectWarning(kind),
      confirmLabel: 'New project',
    });
    if (!ok) return;
  }
  if (failed) resolveRestoreFailure();
  editor().loadProject(emptyProject('youtube'));
  try {
    await flushAutosave();
  } catch {
    return; // The failure is reported by the autosave notice; keep the files the saved project still references.
  }
  await collectUnusedMedia(gcPermitForNewProject());
}
