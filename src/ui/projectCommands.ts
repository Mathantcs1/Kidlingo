// Commands that ask before they discard work: removing media from the project, and starting a new project.
import { emptyProject } from '../core/model';
import type { Id } from '../core/model';
import { flushAutosave, useEditor } from '../state/store';
import { askConfirm } from './Confirm';
import { clipsUsingMedia, removeMediaFromProject } from './edits';
import { collectUnusedMedia } from './session';
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
  if (used > 0) {
    const ok = await askConfirm({
      title: `Remove ${m.name}?`,
      message: `It is used by ${used === 1 ? '1 clip' : `${used} clips`} on the timeline. ${used === 1 ? 'That clip is' : 'Those clips are'} removed too.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
  }
  guard(() => editor().apply((p) => removeMediaFromProject(p, mediaId)));
}

/**
 * Starts an empty YouTube project (undo history cleared), asking first unless the project is empty, then deletes
 * the media files nothing references any more. The new project is saved before any file is deleted, so a reload
 * never brings back a project whose media is gone; if that save fails nothing is deleted.
 */
export async function newProject(): Promise<void> {
  const p = editor().history.present;
  const hasWork = Object.keys(p.media).length > 0 || p.tracks.some((t) => t.clips.length > 0);
  if (hasWork) {
    const ok = await askConfirm({
      title: 'Start a new project?',
      message: 'The timeline and the media bin are cleared and the imported files are deleted from this browser. This cannot be undone.',
      confirmLabel: 'New project',
    });
    if (!ok) return;
  }
  editor().loadProject(emptyProject('youtube'));
  try {
    await flushAutosave();
  } catch {
    return; // The failure is reported by the autosave notice; keep the files the saved project still references.
  }
  await collectUnusedMedia();
}
