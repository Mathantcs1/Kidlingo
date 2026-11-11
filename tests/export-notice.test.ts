// The export notice (Plan 4 Task 11): what an export or merge left out reaches the dialog / a toast.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';
import { useEditor } from '../src/state/store';
import { exportProject } from '../src/export/exporter';
import type { ExportOptions } from '../src/export/exporter';
import { importFile } from '../src/media/import';
import { openExport, startExport, startMerge, useExportUi } from '../src/ui/exportJob';
import { closed } from '../src/ui/exportJobState';
import { useToasts } from '../src/ui/toastStore';

vi.mock('../src/export/exporter', async (orig) => ({
  ...(await orig<typeof import('../src/export/exporter')>()),
  exportProject: vi.fn(),
  exportTempName: vi.fn(),
  cleanupExportTemp: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/media/storage', async (orig) => ({
  ...(await orig<typeof import('../src/media/storage')>()),
  removeMedia: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/media/import', () => ({ importFile: vi.fn() }));

const merged: MediaRef = { id: 'merged', name: 'merged.mp4', kind: 'video', duration: 2, width: 64, height: 36, hasAudio: false };
const clip = (id: string, start: number): Clip => ({
  id, mediaId: 'merged', kind: 'video', start, in: 0, out: 1, transform: defaultTransform(), volume: 1,
  audio: defaultClipAudio(), effects: [], blend: 'normal', fit: 'fit',
});
function twoClips(): Project {
  const p = emptyProject();
  const tracks = p.tracks.map((t) => (t.kind === 'video' ? { ...t, clips: [clip('a', 0), clip('b', 1)] } : t));
  return { ...p, tracks, media: { merged } };
}

/** exportProject resolves after reporting `skips` (or nothing) through onSkipped. */
function exportsSkipping(skips: Parameters<NonNullable<ExportOptions['onSkipped']>>[0] | null): void {
  vi.mocked(exportProject).mockReset().mockImplementation(async (_p, opts) => {
    if (skips) opts.onSkipped?.(skips);
    return new Blob(['mp4'], { type: 'video/mp4' });
  });
}

beforeEach(() => {
  vi.mocked(importFile).mockReset().mockResolvedValue(merged);
  useEditor.getState().loadProject(twoClips());
  useExportUi.setState(closed);
  useToasts.setState({ toasts: [] });
});

describe('export notice', () => {
  it('shows what the export left out, and clears it for the next export', async () => {
    exportsSkipping({ effects: ['glow'], luts: ['Warm.cube'] });
    openExport();
    await startExport('1080p', 'clip');
    expect(useExportUi.getState()).toMatchObject({
      phase: 'done',
      notice:
        'Exported without these effects (this device cannot run them): Glow. ' +
        'Exported without these LUTs (the file is missing or not a valid .cube): "Warm.cube".',
    });
    exportsSkipping(null);
    useExportUi.setState({ downloaded: true });
    await startExport('1080p', 'clip');
    expect(useExportUi.getState()).toMatchObject({ phase: 'done', notice: null });
  });

  it('an export whose blend modes could not run says so, alone or with effects', async () => {
    exportsSkipping({ effects: [], luts: [], blend: true });
    openExport();
    await startExport('1080p', 'clip');
    expect(useExportUi.getState()).toMatchObject({
      phase: 'done',
      notice: 'Exported with blend modes drawn as Normal and adjustment layers skipped (this device cannot run them).',
    });
  });

  it('a merge that left something out says so in an info toast', async () => {
    exportsSkipping({ effects: ['glow'], luts: [] });
    await startMerge();
    expect(useEditor.getState().history.present.tracks.flatMap((t) => t.clips.map((c) => c.mediaId))).toEqual(['merged']);
    expect(useToasts.getState().toasts).toMatchObject([{
      kind: 'info',
      message: 'Merged without these effects (this device cannot run them): Glow. Undo brings the original clips back.',
    }]);
  });

  it('a merge that left nothing out shows no toast', async () => {
    exportsSkipping(null);
    await startMerge();
    expect(useToasts.getState().toasts).toEqual([]);
  });
});
