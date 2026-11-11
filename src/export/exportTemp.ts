// The export temp files in OPFS (split out of exporter.ts): where a finished export lives until cleaned up.
import { newId } from '../core/model';
import { getCapabilities } from '../media/support';

const TEMP_DIR = 'clipforge-export';

/** OPFS with writable file streams (Safari before 26 has OPFS but no createWritable on the main thread). */
export function hasOpfs(): boolean {
  const caps = getCapabilities();
  return caps.opfs && caps.opfsWritable;
}

/** True when exports are built in memory (no writable OPFS): very long or 4K exports may run out of memory. */
export function exportUsesMemory(): boolean {
  return !hasOpfs();
}

export async function tempDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(TEMP_DIR, { create: true });
}

/** Temp file name behind each exported Blob (see exportTempName). */
const tempNames = new WeakMap<Blob, string>();

/** The OPFS temp file backing a Blob returned by exportProject, if any. */
export function exportTempName(blob: Blob): string | undefined {
  return tempNames.get(blob);
}

/** Records that `blob` is backed by the temp file `name` (see exportTempName). */
export function rememberTempName(blob: Blob, name: string): void {
  tempNames.set(blob, name);
}

/**
 * Removes the files in the export temp directory except those named in `keep`. Call it before a new export (not
 * when the dialog closes: the browser may still be reading a file it is downloading) and at app start.
 */
export async function cleanupExportTemp(keep: readonly string[] = []): Promise<void> {
  if (!hasOpfs()) return;
  const dir = (await tempDir()) as unknown as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };
  const names: string[] = [];
  for await (const name of dir.keys()) if (!keep.includes(name)) names.push(name);
  await Promise.all(names.map((n) => dir.removeEntry(n, { recursive: true }).catch(() => undefined)));
}

/** An export's temp file in OPFS and the writable stream the muxer writes it through. */
export interface TempFile {
  dir: FileSystemDirectoryHandle;
  name: string;
  handle: FileSystemFileHandle;
  writable: FileSystemWritableFileStream;
}

/** Creates a fresh export temp file and opens a writable stream on it. */
export async function openTempFile(): Promise<TempFile> {
  const dir = await tempDir();
  const name = `export-${newId()}.mp4`;
  const handle = await dir.getFileHandle(name, { create: true });
  return { dir, name, handle, writable: await handle.createWritable() };
}

/** Deletes the temp file of a failed export; never rejects. */
export async function discardTempFile(temp: TempFile): Promise<void> {
  // If the output never took the stream, it is still open; abort it so the temp file can go.
  if (!temp.writable.locked) await temp.writable.abort().catch(() => undefined);
  await temp.dir.removeEntry(temp.name).catch(() => undefined);
}
