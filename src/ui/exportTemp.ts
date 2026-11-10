// Export temp files in the shared OPFS directory: which ones to keep, and serialised cleanups that only ever run in
// the tab that owns the editor (another tab's finished export may live in the same directory).
import { cleanupExportTemp } from '../export/exporter';
import { mayTouchSharedStorage } from '../state/tabLock';

/** Pending temp-file cleanup; a new job waits for it so it never deletes the new job's file. */
let cleaning: Promise<void> = Promise.resolve();
/**
 * Temp files whose download was started during this page session. They are never deleted while the page lives (the
 * browser may still be streaming a multi-GB download from one); the app-start cleanup of the next session removes
 * them. Only never-downloaded, discarded, cancelled or failed temps are deleted by cleanTemp.
 */
const downloaded = new Set<string>();

export function keepDownloaded(name: string): void {
  downloaded.add(name);
}

/**
 * Deletes the export temp files except downloaded ones, after any cleanup already queued (the app-start cleanup
 * goes through here too, so it can never delete the file of an export started meanwhile). A tab that does not
 * own the editor never touches the directory.
 */
export function cleanTemp(): Promise<void> {
  if (!mayTouchSharedStorage()) return cleaning;
  const keep = [...downloaded];
  cleaning = cleaning.then(() => cleanupExportTemp(keep)).catch((e: unknown) => console.error('clipforge: cleanup failed', e));
  return cleaning;
}
