// Merge all into one clip: renders the timeline, imports the result and replaces every clip with it.
import { exportProject } from '../export/exporter';
import { removeMedia } from '../media/storage';
import { useEditor } from '../state/store';
import { loadChunk } from '../loadChunk';
import { askConfirm } from './Confirm';
import { NO_VIDEO_TRACK, hiddenLayerClipCount, mergeRefusal, replaceWithMedia } from './edits';
import { cleanTemp } from './exportTemp';
import { begin, closed, editor, endJob, fail, messageOf, set, ui } from './exportJobState';

/**
 * Renders the whole timeline at 1080p, imports the result as new media and replaces every clip with one clip
 * of it: ONE undoable apply. On failure or cancel the project is left untouched and the imported media removed.
 * A locked track holding clips refuses up front with a toast (no dialog, no export). Clips on hidden layers need a confirmation.
 */
export async function startMerge(): Promise<void> {
  if (ui().open) return;
  editor().setPlaying(false);
  const p = editor().history.present;
  const refusal = mergeRefusal(p);
  if (refusal && refusal !== NO_VIDEO_TRACK) {
    // A locked track holding clips: say so the way every other locked edit does, before any export work.
    useEditor.setState({ lastError: refusal });
    return;
  }
  const hidden = refusal ? 0 : hiddenLayerClipCount(p);
  if (hidden > 0) {
    // Hidden layers are not drawn into the merged clip, yet merging removes their clips: say so first.
    const ok = await askConfirm({
      title: 'Merge without the hidden layers?',
      message: `${hidden === 1 ? '1 clip sits' : `${hidden} clips sit`} on hidden layers. The merged clip leaves ${hidden === 1 ? 'it' : 'them'} out and ${hidden === 1 ? 'it is' : 'they are'} removed from the timeline. Undo brings everything back.`,
      confirmLabel: 'Merge',
    });
    if (!ok || editor().history.present !== p) return;
  }
  set({ ...closed, open: 'merge' });
  if (refusal) {
    set({ phase: 'error', error: refusal });
    return;
  }
  try {
    const signal = await begin();
    const blob = await exportProject(p, { quality: '1080p', signal, onProgress: (f) => set({ progress: f * 0.9 }) });
    const { importFile } = await loadChunk(() => import('../media/import'));
    const media = await importFile(new File([blob], 'merged.mp4', { type: 'video/mp4' }));
    const stale = editor().history.present !== p;
    if (signal.aborted || stale) {
      await removeMedia(media.id).catch(() => undefined);
      if (stale && !signal.aborted) throw new Error('The project changed while merging; nothing was replaced');
      throw new DOMException('Aborted', 'AbortError');
    }
    let error: unknown = null;
    try {
      editor().apply((cur) => replaceWithMedia(cur, media));
    } catch (e) {
      error = e;
    }
    if (editor().history.present === p) {
      // apply() keeps a TimelineError in lastError instead of throwing; either way nothing was replaced.
      await removeMedia(media.id).catch(() => undefined);
      throw new Error(`Could not place the merged clip: ${error ? messageOf(error) : (editor().lastError ?? 'unknown error')}`);
    }
    set(closed);
  } catch (e) {
    fail(e, 'merge');
  } finally {
    endJob();
    // The merge's temp file is never downloaded (it was copied into the media library), so it can go now.
    void cleanTemp();
  }
}
