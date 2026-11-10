// Export and merge-all jobs behind the export dialog: state, cancellation, discard protection, object URLs and
// temp-file cleanup.
import { create } from 'zustand';
import { cleanupExportTemp, exportProject, exportTempName } from '../export/exporter';
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
  /** Whether the download link of the finished export was used. */
  downloaded: boolean;
  /** A pending "Discard the finished export?" question: asked by Close/Escape or by Export again. */
  confirm: 'close' | 'again' | null;
}

const closed: ExportUiState = {
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

const ui = () => useExportUi.getState();
const set = (s: Partial<ExportUiState>): void => useExportUi.setState(s);
const editor = () => useEditor.getState();

let controller: AbortController | null = null;
/** Pending temp-file cleanup; a new job waits for it so it never deletes the new job's file. */
let cleaning: Promise<void> = Promise.resolve();
/**
 * The latest finished export. Its object URL outlives the dialog (a download of it may still be running after
 * Close); it is revoked when the next job starts or when the page goes away.
 */
let last: { url: string; temp?: string } | null = null;
/**
 * Temp files whose download was started during this page session. They are never deleted while the page lives (the
 * browser may still be streaming a multi-GB download from one); the app-start cleanup of the next session removes
 * them. Only never-downloaded, discarded, cancelled or failed temps are deleted by the cleanups below.
 */
const downloaded = new Set<string>();
let againArgs: [ExportQuality, string] | null = null;

/** Deletes the export temp files except downloaded ones, after any cleanup already queued. */
function cleanTemp(): Promise<void> {
  const keep = [...downloaded];
  cleaning = cleaning.then(() => cleanupExportTemp(keep)).catch((e: unknown) => console.error('clipforge: cleanup failed', e));
  return cleaning;
}

/** Revokes the previous result's URL and deletes old temp files (never a downloaded one). */
function releasePrevious(): Promise<void> {
  if (last) URL.revokeObjectURL(last.url);
  last = null;
  return cleanTemp();
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const unsaved = (): boolean => ui().phase === 'done' && !!ui().url && !ui().downloaded;

/** True while closing the page would lose work: an export is running or a finished one was not downloaded. */
export function shouldWarnBeforeUnload(): boolean {
  return ui().phase === 'running' || unsaved();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!shouldWarnBeforeUnload()) return;
    e.preventDefault();
    e.returnValue = '';
  });
  window.addEventListener('pagehide', (e) => {
    if (!e.persisted && last) URL.revokeObjectURL(last.url);
  });
}

/** Opens the export dialog (stopping playback). */
export function openExport(): void {
  if (ui().open) return;
  editor().setPlaying(false);
  set({ ...closed, open: 'export' });
}

/**
 * Closes the dialog unless a job is running. A finished export that was not downloaded asks first. Never deletes
 * the exported file or revokes its URL (see `last`).
 */
export function closeDialog(): void {
  if (ui().phase === 'running') return;
  if (unsaved()) {
    set({ confirm: 'close' });
    return;
  }
  set(closed);
}

/** The download link was used: closing no longer asks, and the file is kept while it may be downloading. */
export function markDownloaded(): void {
  set({ downloaded: true });
  if (last?.temp) downloaded.add(last.temp);
}

/** Answers "Discard the finished export?" with yes: closes the dialog or starts the next export. */
export function confirmDiscard(): void {
  const { confirm } = ui();
  set({ confirm: null });
  if (confirm === 'close') set(closed);
  else if (confirm === 'again' && againArgs) void runExport(...againArgs);
}

/** Answers "Discard the finished export?" with no: keeps the result in the dialog. */
export function cancelDiscard(): void {
  set({ confirm: null });
}

export function cancelJob(): void {
  controller?.abort();
}

/** Starts a fresh job: releases the previous result and waits for temp cleanup. */
async function begin(): Promise<AbortSignal> {
  controller = new AbortController();
  set({ phase: 'running', progress: 0, error: null, url: null, filename: null, downloaded: false, confirm: null });
  await releasePrevious();
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

/** Renders the project to an MP4 and offers it for download; asks first if that would discard an unsaved result. */
export async function startExport(quality: ExportQuality, name: string): Promise<void> {
  if (ui().phase === 'running') return;
  if (unsaved()) {
    againArgs = [quality, name];
    set({ confirm: 'again' });
    return;
  }
  await runExport(quality, name);
}

async function runExport(quality: ExportQuality, name: string): Promise<void> {
  const filename = safeFilename(name);
  try {
    const signal = await begin();
    const blob = await exportProject(editor().history.present, {
      quality,
      signal,
      onProgress: (f) => set({ progress: f }),
    });
    last = { url: URL.createObjectURL(blob), temp: exportTempName(blob) };
    set({ phase: 'done', progress: 1, url: last.url, filename });
  } catch (e) {
    fail(e, 'export');
  } finally {
    controller = null;
  }
}

/**
 * Renders the whole timeline at 1080p, imports the result as new media and replaces every clip with one clip
 * of it: ONE undoable apply. On failure or cancel the project is left untouched and the imported media removed.
 */
export async function startMerge(): Promise<void> {
  if (ui().open) return;
  editor().setPlaying(false);
  set({ ...closed, open: 'merge' });
  const p = editor().history.present;
  if (!p.tracks.some((t) => t.kind === 'video')) {
    set({ phase: 'error', error: 'There is no video track to merge into' });
    return;
  }
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
    let error: unknown = null;
    try {
      editor().apply((cur) => replaceWithMedia(cur, media));
    } catch (e) {
      error = e;
    }
    if (editor().history.present === p) {
      // apply() keeps a TimelineError in lastError instead of throwing; either way nothing was replaced.
      await removeMedia(media.id).catch(() => undefined);
      throw new Error(`Could not place the merged clip: ${error ? messageOf(error) : (editor().lastError ?? 'unknown error')}`);
    }
    set(closed);
  } catch (e) {
    fail(e, 'merge');
  } finally {
    controller = null;
    // The merge's temp file is never downloaded (it was copied into the media library), so it can go now.
    void cleanTemp();
  }
}
