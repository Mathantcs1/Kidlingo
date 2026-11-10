// Shared state of the export dialog's jobs (export and merge-all): the dialog store, the running job's abort
// controller, the latest finished export and the start/fail steps both jobs use.
import { create } from 'zustand';
import { describeStorageError } from '../media/storageErrors';
import { useEditor } from '../state/store';
import { cleanTemp } from './exportTemp';

export type JobMode = 'export' | 'merge';
export type JobPhase = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

export interface ExportUiState {
  /** Which dialog is open, or null when closed. */
  open: JobMode | null;
  phase: JobPhase;
  progress: number;
  error: string | null;
  /** Object URL of the finished export and its download name. */
  url: string | null;
  filename: string | null;
  /** Whether the download link of the finished export was used. */
  downloaded: boolean;
  /** A pending "Discard the finished export?" question: asked by Close/Escape or by Export again. */
  confirm: 'close' | 'again' | null;
}

export const closed: ExportUiState = {
  open: null,
  phase: 'idle',
  progress: 0,
  error: null,
  url: null,
  filename: null,
  downloaded: false,
  confirm: null,
};
export const useExportUi = create<ExportUiState>()(() => closed);

export const ui = () => useExportUi.getState();
export const set = (s: Partial<ExportUiState>): void => useExportUi.setState(s);
export const editor = () => useEditor.getState();
export const messageOf = describeStorageError;

let controller: AbortController | null = null;
/**
 * The latest finished export. Its object URL outlives the dialog (a download of it may still be running after
 * Close); it is revoked when the next job starts or when the page goes away.
 */
let last: { url: string; temp?: string } | null = null;

export const lastResult = (): { url: string; temp?: string } | null => last;
export function setLastResult(r: { url: string; temp?: string }): void {
  last = r;
}

/** Revokes the previous result's URL and deletes old temp files (never a downloaded one). */
function releasePrevious(): Promise<void> {
  if (last) URL.revokeObjectURL(last.url);
  last = null;
  return cleanTemp();
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

export function cancelJob(): void {
  controller?.abort();
}

/** Starts a fresh job: releases the previous result and waits for temp cleanup. */
export async function begin(): Promise<AbortSignal> {
  controller = new AbortController();
  set({ phase: 'running', progress: 0, error: null, url: null, filename: null, downloaded: false, confirm: null });
  await releasePrevious();
  return controller.signal;
}

/** The running job is over (finished, failed or cancelled). */
export function endJob(): void {
  controller = null;
}

export function fail(e: unknown, mode: JobMode): void {
  if (isAbort(e)) {
    set({ phase: 'cancelled' });
    return;
  }
  console.error(`clipforge: ${mode} failed`, e);
  set({ phase: 'error', error: messageOf(e) });
}
