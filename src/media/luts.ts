// `.cube` LUT files kept in OPFS (their own directory, so media GC and listing never see them). User data: they are
// deleted only by the verified-restore GC (gcLuts in ./gc), never anywhere else.
import type { Id } from '../core/model';

const DIR = 'clipforge-luts';

async function lutDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

const isNotFound = (e: unknown): boolean => e instanceof DOMException && e.name === 'NotFoundError';

/** Ids written by putLutText that no project state references yet; GC spares them until settled. */
const unsettled = new Set<Id>();

export function unsettledLuts(): ReadonlySet<Id> {
  return unsettled;
}

export function settleLuts(ids: Iterable<Id>): void {
  if (unsettled.size === 0) return;
  for (const id of ids) unsettled.delete(id);
}

export async function putLutText(id: Id, text: string): Promise<void> {
  unsettled.add(id);
  try {
    const dir = await lutDir();
    const handle = await dir.getFileHandle(id, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  } catch (e) {
    unsettled.delete(id);
    throw e;
  }
}

/** The stored `.cube` text, or null when it is not stored on this device. */
export async function getLutText(id: Id): Promise<string | null> {
  const dir = await lutDir();
  try {
    return await (await (await dir.getFileHandle(id)).getFile()).text();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function removeLutFile(id: Id): Promise<void> {
  const dir = await lutDir();
  try {
    await dir.removeEntry(id);
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
}

export async function listLutIds(): Promise<Id[]> {
  const dir = (await lutDir()) as unknown as { keys(): AsyncIterable<string> };
  const ids: Id[] = [];
  for await (const name of dir.keys()) ids.push(name);
  return ids.sort();
}
