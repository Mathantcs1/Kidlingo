// What the user is told when an import fails (media bin and LUT import), and the persistent-storage request.
import { ChunkLoadError } from '../loadChunk';
import { describeStorageError, isQuotaError } from '../media/storageErrors';

/** Longest import message shown: a message built from file content must never flood (or freeze) a toast. */
export const MAX_IMPORT_MESSAGE = 300;

function capped(message: string): string {
  return message.length > MAX_IMPORT_MESSAGE ? `${message.slice(0, MAX_IMPORT_MESSAGE - 1)}…` : message;
}

/** The plain-English toast for a failed import of `file`, at most MAX_IMPORT_MESSAGE characters. */
export function importMessage(file: File, e: unknown): string {
  if (e instanceof Error && (e.name === 'ImportError' || e instanceof ChunkLoadError)) return capped(e.message);
  if (isQuotaError(e)) return capped(`Could not import ${file.name}: ${describeStorageError(e)}`);
  return capped(`Could not import ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
}

let persistAsked = false;

/** Asks once per page for persistent storage (fewer evictions of imported media); failures do not matter. */
export function askPersist(): void {
  if (persistAsked) return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => false);
}
