// Export and merge-all jobs behind the export dialog: state, cancellation, object URLs and temp-file cleanup.
import { create } from 'zustand';
import { cleanupExportTemp, exportProject } from '../export/exporter';
import type { ExportQuality } from '../export/exporter';
import { removeMedia } from '../media/storage';
import { useEditor } from '../state/store';
import { replaceWithMedia } from './edits';
import { safeFilename } from './exportName';

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
}

const closed: ExportUiState = { open: null, phase: 'idle', progress: 0, error: null, url: null, filename: null };
export const useExportUi = create<ExportUiState>()(() => closed);

const ui = () => useExportUi.getState();
const set = (s: Partial<ExportUiState>): void => useExportUi.setState(s);
const editor = () => useEditor.getState();

let controller: AbortController | null = null;
/** Pending temp-file cleanup; a new job waits for it so it never deletes the new job's file. */
let cleaning: Promise<void> = Promise.resolve();

function releaseResult(): void {
  const { url } = ui();
  if (url) URL.revokeObjectURL(url);
  set({ url: null, filename: null });
  cleaning = cleaning.then(() => cleanupExportTemp()).catch((e: unknown) => console.error('clipforge: cleanup failed', e));
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Opens the export dialog (stopping playback). */
export function openExport(): void {
  if (ui().open) return;
  editor().setPlaying(false);
  set({ ...closed, open: 'export' });
}

/** Closes the dialog unless a job is running; frees the exported file. */
export function closeDialog(): void {
  if (ui().phase === 'running') return;
  releaseResult();
  set(closed);
}

export function cancelJob(): void {
  controller?.abort();
}

/** Starts a fresh job: frees any previous result and waits for temp cleanup. */
async function begin(): Promise<AbortSignal> {
  releaseResult();
  controller = new AbortController();
  set({ phase: 'running', progress: 0, error: null });
  await cleaning;
  return controller.signal;
}

function fail(e: unknown, mode: JobMode): void {
  if (isAbort(e)) {
    set({ phase: 'cancelled' });
    return;
  }
  console.error(`clipforge: ${mode} failed`, e);
  set({ phase: 'error', error: messageOf(e) });
}

/** Renders the project to an MP4 and offers it for download. */
export async function startExport(quality: ExportQuality, name: string): Promise<void> {
  if (ui().phase === 'running') return;
  const filename = safeFilename(name);
  try {
    const signal = await begin();
    const blob = await exportProject(editor().history.present, {
      quality,
      signal,
      onProgress: (f) => set({ progress: f }),
    });
    set({ phase: 'done', progress: 1, url: URL.createObjectURL(blob), filename });
  } catch (e) {
    fail(e, 'export');
  } finally {
    controller = null;
  }
}

/**
 * Renders the whole timeline at 1080p, imports the result as new media and replaces every clip with one clip
 * of it: ONE undoable apply. On failure or cancel the project is left untouched.
 */
export async function startMerge(): Promise<void> {
  if (ui().open) return;
  editor().setPlaying(false);
  set({ ...closed, open: 'merge' });
  const p = editor().history.present;
  try {
    const signal = await begin();
    const blob = await exportProject(p, { quality: '1080p', signal, onProgress: (f) => set({ progress: f * 0.9 }) });
    const { importFile } = await import('../media/import');
    const media = await importFile(new File([blob], 'merged.mp4', { type: 'video/mp4' }));
    const stale = editor().history.present !== p;
    if (signal.aborted || stale) {
      await removeMedia(media.id).catch(() => undefined);
      if (stale && !signal.aborted) throw new Error('The project changed while merging; nothing was replaced');
      throw new DOMException('Aborted', 'AbortError');
    }
    editor().apply((cur) => replaceWithMedia(cur, media));
    releaseResult();
    set(closed);
  } catch (e) {
    fail(e, 'merge');
    releaseResult();
  } finally {
    controller = null;
  }
}
