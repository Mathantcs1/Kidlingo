// Export job behind the export dialog: discard protection, object URLs and temp-file cleanup (shared job state
// lives in exportJobState.ts, merge-all in mergeJob.ts).
import { exportProject, exportTempName } from '../export/exporter';
import type { ExportQuality } from '../export/exporter';
import { exportSkipNotice } from '../render/effects/unavailable';
import { safeFilename } from './exportName';
import { keepDownloaded } from './exportTemp';
import { begin, closed, editor, endJob, fail, lastResult, set, setLastResult, ui } from './exportJobState';

export { cancelJob, useExportUi } from './exportJobState';
export type { ExportUiState, JobMode, JobPhase } from './exportJobState';
export { startMerge } from './mergeJob';

let againArgs: [ExportQuality, string] | null = null;

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
    const last = lastResult();
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
 * the exported file or revokes its URL (see `lastResult` in exportJobState.ts).
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
  const last = lastResult();
  if (last?.temp) keepDownloaded(last.temp);
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
      onSkipped: (skips) => set({ notice: exportSkipNotice(skips) }),
    });
    const url = URL.createObjectURL(blob);
    setLastResult({ url, temp: exportTempName(blob) });
    set({ phase: 'done', progress: 1, url, filename });
  } catch (e) {
    fail(e, 'export');
  } finally {
    endJob();
  }
}
