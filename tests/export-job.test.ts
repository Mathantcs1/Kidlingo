import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { useEditor } from '../src/state/store';
import { cleanupExportTemp, exportProject, exportTempName } from '../src/export/exporter';
import { importFile } from '../src/media/import';
import { removeMedia } from '../src/media/storage';
import { replaceWithMedia } from '../src/ui/edits';
import {
  cancelDiscard,
  closeDialog,
  confirmDiscard,
  markDownloaded,
  openExport,
  shouldWarnBeforeUnload,
  startExport,
  startMerge,
  useExportUi,
} from '../src/ui/exportJob';

vi.mock('../src/export/exporter', async (orig) => ({
  ...(await orig<typeof import('../src/export/exporter')>()),
  exportProject: vi.fn(),
  cleanupExportTemp: vi.fn(async () => undefined),
  exportTempName: vi.fn(),
}));
vi.mock('../src/media/storage', async (orig) => ({
  ...(await orig<typeof import('../src/media/storage')>()),
  removeMedia: vi.fn(async () => undefined),
}));
vi.mock('../src/media/import', () => ({ importFile: vi.fn() }));
vi.mock('../src/ui/edits', async (orig) => {
  const real = await orig<typeof import('../src/ui/edits')>();
  return { ...real, replaceWithMedia: vi.fn(real.replaceWithMedia) };
});

const merged: MediaRef = { id: 'merged', name: 'merged.mp4', kind: 'video', duration: 2, width: 64, height: 36, hasAudio: false };
const source: MediaRef = { ...merged, id: 'src', name: 'src.mp4' };

const clip = (id: string, start: number): Clip => ({
  id,
  mediaId: 'src',
  kind: 'video',
  start,
  in: 0,
  out: 1,
  transform: defaultTransform(),
  volume: 1,
  fit: 'fit',
});

function twoClips(): Project {
  const p = emptyProject();
  const tracks = p.tracks.map((t) => (t.kind === 'video' ? { ...t, clips: [clip('a', 0), clip('b', 1)] } : t));
  return { ...p, tracks, media: { src: source } };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  vi.mocked(exportProject).mockReset().mockResolvedValue(new Blob(['mp4'], { type: 'video/mp4' }));
  vi.mocked(exportTempName).mockReset().mockReturnValue('export-1.mp4');
  vi.mocked(cleanupExportTemp).mockClear();
  vi.mocked(removeMedia).mockClear();
  vi.mocked(importFile).mockReset().mockResolvedValue(merged);
  vi.mocked(replaceWithMedia).mockClear();
  useEditor.getState().loadProject(twoClips());
  useExportUi.setState({
    open: null, phase: 'idle', progress: 0, error: null, url: null, filename: null, downloaded: false, confirm: null,
  });
  await flush();
});

describe('merge all', () => {
  it('refuses a project without a video track before exporting anything', async () => {
    const p = { ...twoClips(), tracks: twoClips().tracks.filter((t) => t.kind !== 'video') };
    useEditor.getState().loadProject(p);
    await startMerge();
    expect(exportProject).not.toHaveBeenCalled();
    expect(useExportUi.getState()).toMatchObject({ open: 'merge', phase: 'error' });
    expect(useExportUi.getState().error).toMatch(/no video track/i);
    expect(useEditor.getState().history.present).toBe(p);
  });

  it.each([
    ['a TimelineError', new TimelineError('Clips overlap')],
    ['any other error', new Error('boom')],
  ])('removes the imported media and reports %s when the replace fails', async (_, error) => {
    vi.mocked(replaceWithMedia).mockImplementationOnce(() => {
      throw error;
    });
    const before = useEditor.getState().history;
    await startMerge();
    expect(removeMedia).toHaveBeenCalledWith('merged');
    expect(useEditor.getState().history).toBe(before);
    expect(useExportUi.getState()).toMatchObject({ open: 'merge', phase: 'error' });
    expect(useExportUi.getState().error).toContain(error.message);
  });

  it('replaces the timeline in one step and keeps the media on success', async () => {
    const depth = useEditor.getState().history.past.length;
    await startMerge();
    expect(removeMedia).not.toHaveBeenCalled();
    expect(useEditor.getState().history.past.length).toBe(depth + 1);
    expect(useEditor.getState().history.present.media.merged).toEqual(merged);
    expect(useExportUi.getState().open).toBeNull();
  });
});

describe('finished exports', () => {
  async function finished(): Promise<void> {
    openExport();
    await startExport('1080p', 'clip');
    expect(useExportUi.getState().phase).toBe('done');
  }

  it('asks before discarding an export that was not downloaded', async () => {
    await finished();
    closeDialog();
    expect(useExportUi.getState()).toMatchObject({ open: 'export', confirm: 'close' });
    cancelDiscard();
    expect(useExportUi.getState()).toMatchObject({ open: 'export', phase: 'done', confirm: null });
    expect(shouldWarnBeforeUnload()).toBe(true);
    closeDialog();
    confirmDiscard();
    expect(useExportUi.getState().open).toBeNull();
    expect(shouldWarnBeforeUnload()).toBe(false);
  });

  it('asks before exporting again over an undownloaded result', async () => {
    await finished();
    await startExport('1080p', 'again');
    expect(exportProject).toHaveBeenCalledTimes(1);
    expect(useExportUi.getState().confirm).toBe('again');
    confirmDiscard();
    await flush();
    await vi.waitFor(() => expect(useExportUi.getState().phase).toBe('done'));
    expect(exportProject).toHaveBeenCalledTimes(2);
    expect(useExportUi.getState().filename).toBe('again.mp4');
  });

  it('closes a downloaded export without asking and never deletes its file on close', async () => {
    await finished();
    markDownloaded();
    expect(shouldWarnBeforeUnload()).toBe(false);
    closeDialog();
    expect(useExportUi.getState().open).toBeNull();
    await flush();
    expect(cleanupExportTemp).toHaveBeenCalledTimes(1);
    // The next export cleans up old temp files but keeps the downloaded one (it may still be downloading).
    openExport();
    await startExport('1080p', 'next');
    expect(cleanupExportTemp).toHaveBeenCalledTimes(2);
    expect(cleanupExportTemp).toHaveBeenLastCalledWith(['export-1.mp4']);
  });

  it('warns before unload while an export runs', async () => {
    let resolve: (b: Blob) => void = () => undefined;
    vi.mocked(exportProject).mockReturnValueOnce(new Promise<Blob>((r) => (resolve = r)));
    openExport();
    const run = startExport('1080p', 'x');
    await flush();
    expect(useExportUi.getState().phase).toBe('running');
    expect(shouldWarnBeforeUnload()).toBe(true);
    resolve(new Blob(['x']));
    await run;
  });
});
