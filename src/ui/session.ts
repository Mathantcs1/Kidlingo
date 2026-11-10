// Page session: editor lock, startup restore (media missing from storage flagged), then storage cleanup.
import { gcMedia, referencedMedia } from '../media/gc';
import { hasMedia, settleMedia } from '../media/storage';
import { loadProject, reconcileMedia } from '../state/persist';
import { flushOnHide, setAutosaveEnabled, useEditor } from '../state/store';
import { acquireEditorLock, lockState } from '../state/tabLock';
import { cleanTemp } from './exportTemp';
import { showError } from './Toast';

export type SessionState = 'loading' | 'ready' | 'locked';

/**
 * Loads the saved project into the store. Without one, the store keeps its empty YouTube project. Never rejects:
 * a failure shows a toast and leaves the empty project. A project the user started editing meanwhile is kept.
 */
export async function restoreSession(): Promise<void> {
  const initial = useEditor.getState().history.present;
  try {
    const saved = await loadProject();
    if (!saved) return;
    const reconciled = await reconcileMedia(saved, hasMedia);
    if (useEditor.getState().history.present !== initial) return;
    useEditor.getState().loadProject(reconciled);
  } catch (e) {
    console.error('clipforge: could not restore the last session', e);
    showError(`Could not restore your last session: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** True while this tab owns the shared storage (holds the editor lock, or the browser has no Web Locks). */
function ownsStorage(): boolean {
  const s = lockState();
  return s === 'held' || s === 'unsupported';
}

/**
 * Deletes imported media files no state of the editor history references. Only in the tab that owns the editor,
 * and only after restore (the session calls it then). Never rejects.
 */
export async function collectUnusedMedia(): Promise<void> {
  if (!ownsStorage()) return;
  try {
    await gcMedia(() => referencedMedia(useEditor.getState().history));
  } catch (e) {
    console.error('clipforge: media cleanup failed', e);
  }
}

/**
 * Takes the editor lock; another tab already editing leaves this one 'locked' (inert: no restore, autosave, GC or
 * temp cleanup ever runs here). Otherwise restores the saved project, then frees storage in the background:
 * unreferenced media files and the previous session's export temp files.
 */
export async function startSession(): Promise<SessionState> {
  if ((await acquireEditorLock()) === 'locked') {
    setAutosaveEnabled(false);
    return 'locked';
  }
  // Imported files become collectable once the project references them (see media/storage unsettled ids).
  useEditor.subscribe((s, prev) => {
    if (s.history.present.media !== prev.history.present.media) settleMedia(Object.keys(s.history.present.media));
  });
  await restoreSession();
  flushOnHide(window, document);
  void collectUnusedMedia();
  void cleanTemp();
  return 'ready';
}

let started: Promise<SessionState> | null = null;

/** `startSession` at most once per page load (safe under StrictMode's double effects). */
export function startSessionOnce(): Promise<SessionState> {
  started ??= startSession();
  return started;
}
