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
 * the editor lock (see state/tabLock): another tab's project may reference the files. Returns the removed ids.
 */
export async function gcMedia(referenced: () => ReadonlySet<Id>): Promise<Id[]> {
  const removed: Id[] = [];
  for (const id of await listMediaIds()) {
    if (unusedMedia([id], referenced(), unsettledMedia()).length === 0) continue;
    await removeMedia(id);
    removed.push(id);
  }
  return removed;
}
