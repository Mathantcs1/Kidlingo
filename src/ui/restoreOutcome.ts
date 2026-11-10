// The startup restore's outcome and what it allows: deleting media files is only safe when the saved project was
// read (or verifiably absent) in the tab that holds the editor lock.
import type { LockState } from '../state/tabLock';

/**
 * 'restored': the saved project is loaded; 'none': there was verifiably no saved project; 'failed': it could not
 * be read or used (it may still be fine on disk); 'skipped': the user edited before it loaded; 'unavailable': no
 * IndexedDB.
 */
export type RestoreOutcome = 'restored' | 'none' | 'failed' | 'skipped' | 'unavailable';

/** True only when startup GC may delete unreferenced media files. */
export function shouldCollect(outcome: RestoreOutcome, lock: LockState): boolean {
  // Without Web Locks another tab cannot be ruled out, so only an explicit New project frees files then.
  return lock === 'held' && (outcome === 'restored' || outcome === 'none');
}

/** Whether autosave may run after the restore: never over a saved project that was not loaded (failed/skipped). */
export function autosaveAfter(outcome: RestoreOutcome): boolean {
  return outcome !== 'failed' && outcome !== 'skipped';
}
