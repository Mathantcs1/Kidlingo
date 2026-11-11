import type { Id } from '../core/model';
import { deletePeaks } from './peaksStore';

const DIR = 'clipforge-media';

async function mediaDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

/**
 * Ids written by putMedia that no project state has referenced yet (an import between storing its file and adding
 * it to the project). GC must spare them; the session settles ids once the store references them.
 */
const unsettled = new Set<Id>();

export function unsettledMedia(): ReadonlySet<Id> {
  return unsettled;
}

/** Marks ids as referenced by the project (GC may collect them once nothing references them any more). */
export function settleMedia(ids: Iterable<Id>): void {
  if (unsettled.size === 0) return;
  for (const id of ids) unsettled.delete(id);
}

function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'NotFoundError';
}

/**
 * Streams the blob into OPFS under `id`, replacing any existing entry. On failure an existing entry keeps its old
 * contents (the write is only committed on success) and an entry this call created is removed.
 */
export async function putMedia(id: Id, file: Blob): Promise<void> {
  unsettled.add(id);
  const dir = await mediaDir();
  const existed = await dir.getFileHandle(id).then(
    () => true,
    (e: unknown) => {
      if (isNotFound(e)) return false;
      throw e;
    },
  );
  const handle = await dir.getFileHandle(id, { create: true });
  try {
    const writable = await handle.createWritable();
    await file.stream().pipeTo(writable);
  } catch (e) {
    if (!existed) await dir.removeEntry(id).catch(() => undefined);
    unsettled.delete(id);
    throw e;
  }
}

/** Returns the stored file (lazily backed by OPFS). Throws if absent. */
export async function getMediaFile(id: Id): Promise<File> {
  const dir = await mediaDir();
  try {
    const handle = await dir.getFileHandle(id);
    return await handle.getFile();
  } catch (e) {
    if (isNotFound(e)) throw new Error(`Media ${id} is not stored on this device`);
    throw e;
  }
}

export async function hasMedia(id: Id): Promise<boolean> {
  const dir = await mediaDir();
  try {
    await dir.getFileHandle(id);
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

/** Removes the stored file; a missing entry is not an error. */
export async function removeMedia(id: Id): Promise<void> {
  const dir = await mediaDir();
  try {
    await dir.removeEntry(id);
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
  // Only after the file is really gone: the waveform cache for it is now useless (never throws).
  await deletePeaks(id);
}

/** Ids of all stored media files. */
export async function listMediaIds(): Promise<Id[]> {
  const dir = (await mediaDir()) as unknown as { keys(): AsyncIterable<string> };
  const ids: Id[] = [];
  for await (const name of dir.keys()) ids.push(name);
  return ids.sort();
}
