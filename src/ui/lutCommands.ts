// LUT import command (Plan 4 Task 6). The Effects panel's LUT picker (Task 10) calls it from its file input.
import type { MediaRef } from '../core/model';
import { importLut } from '../media/lutImport';
import { describeStorageError, isQuotaError } from '../media/storageErrors';
import { useEditor } from '../state/store';
import { addMedia } from './edits';
import { showError } from './Toast';

/** The plain-English message for a failed LUT import. */
export function lutImportMessage(file: File, e: unknown): string {
  if (e instanceof Error && e.name === 'ImportError') return e.message;
  if (isQuotaError(e)) return `Could not import ${file.name}: ${describeStorageError(e)}`;
  return `Could not import ${file.name}: ${e instanceof Error ? e.message : String(e)}`;
}

/**
 * Imports each .cube file as LUT media (one undo step per file, like the media bin) and returns the imported refs in
 * order. A refused or failed file shows its message as an error toast and is skipped; it leaves no stored file.
 */
export async function importLutFiles(files: Iterable<File>): Promise<MediaRef[]> {
  const out: MediaRef[] = [];
  for (const file of files) {
    try {
      const m = await importLut(file);
      useEditor.getState().apply((p) => addMedia(p, m));
      out.push(m);
    } catch (e) {
      if (!(e instanceof Error && e.name === 'ImportError')) console.error('clipforge: LUT import failed', e);
      showError(lutImportMessage(file, e));
    }
  }
  return out;
}
