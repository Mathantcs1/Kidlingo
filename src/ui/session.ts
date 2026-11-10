// Startup restore: the saved project, with media missing from storage flagged.
import { hasMedia } from '../media/storage';
import { loadProject, reconcileMedia } from '../state/persist';
import { useEditor } from '../state/store';
import { showError } from './Toast';

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

let started: Promise<void> | null = null;

/** `restoreSession` at most once per page load (safe under StrictMode's double effects). */
export function restoreSessionOnce(): Promise<void> {
  started ??= restoreSession();
  return started;
}
