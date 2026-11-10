// Garbage collection of imported media files: OPFS files no project state refers to any more.
import type { Id, Project } from '../core/model';
import type { History } from '../state/history';
import { listMediaIds, removeMedia, unsettledMedia } from './storage';

/** Media ids referenced by any state of the history (undo and redo included), so GC never breaks an undo. */
export function referencedMedia(h: History<Project>): Set<Id> {
  const ids = new Set<Id>();
  for (const p of [...h.past, h.present, ...h.future]) for (const id of Object.keys(p.media)) ids.add(id);
  return ids;
}

/** Stored ids that are not referenced and not still being imported (written but not yet in the project). */
export function unusedMedia(stored: Id[], referenced: ReadonlySet<Id>, importing: ReadonlySet<Id>): Id[] {
  return stored.filter((id) => !referenced.has(id) && !importing.has(id));
}

/**
 * Deletes the OPFS media files that `referenced()` (read per file, so edits made meanwhile count) does not name.
 * Files written by an import that has not reached the project yet are kept. ONLY call this from the tab that holds
 * the editor lock, and only once the project state is known to be complete (see ui/session collectUnusedMedia).
 * An empty reference set deletes everything, so it is refused unless the caller vouches for it with
 * `emptyIsVerified` (New project, or a verified-absent saved project). Never throws: failures are skipped and
 * reported with one console warning. Returns the removed ids.
 */
export async function gcMedia(referenced: () => ReadonlySet<Id>, opts: { emptyIsVerified?: boolean } = {}): Promise<Id[]> {
  if (referenced().size === 0 && !opts.emptyIsVerified) return [];
  const removed: Id[] = [];
  const failed: unknown[] = [];
  let stored: Id[] = [];
  try {
    stored = await listMediaIds();
  } catch (e) {
    failed.push(e);
  }
  for (const id of stored) {
    if (unusedMedia([id], referenced(), unsettledMedia()).length === 0) continue;
    try {
      await removeMedia(id);
      removed.push(id);
    } catch (e) {
      failed.push(e);
    }
  }
  if (failed.length > 0) console.warn(`clipforge: media cleanup skipped ${failed.length} item(s)`, failed);
  return removed;
}
