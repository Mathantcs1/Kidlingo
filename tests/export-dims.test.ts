import { describe, expect, it } from 'vitest';
import { ExportError, evenDims, exportProject, exportSize, exportUsesMemory } from '../src/export/exporter';
import { defaultClipAudio, emptyProject } from '../src/core/model';
import type { Project } from '../src/core/model';

function withFormat(width: number, height: number): Project {
  return { ...emptyProject(), format: { width, height, fps: 30 } };
}

describe('evenDims', () => {
  it('rounds each side down to the nearest even number', () => {
    expect(evenDims(1081, 1921)).toEqual({ width: 1080, height: 1920 });
  });

  it('leaves even sizes unchanged', () => {
    expect(evenDims(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });
});

describe('exportSize', () => {
  it('keeps a 1920x1080 project at 1080p and doubles it at 4k', () => {
    expect(exportSize(withFormat(1920, 1080), '1080p')).toEqual({ width: 1920, height: 1080 });
    expect(exportSize(withFormat(1920, 1080), '4k')).toEqual({ width: 3840, height: 2160 });
  });

  it('scales a vertical project by its long side', () => {
    expect(exportSize(withFormat(1080, 1920), '1080p')).toEqual({ width: 1080, height: 1920 });
    expect(exportSize(withFormat(1080, 1920), '4k')).toEqual({ width: 2160, height: 3840 });
  });

  it('keeps square and 4:5 projects at 1080 on the short side (2160 at 4k)', () => {
    expect(exportSize(withFormat(1080, 1080), '1080p')).toEqual({ width: 1080, height: 1080 });
    expect(exportSize(withFormat(1080, 1080), '4k')).toEqual({ width: 2160, height: 2160 });
    expect(exportSize(withFormat(1080, 1350), '1080p')).toEqual({ width: 1080, height: 1350 });
    expect(exportSize(withFormat(1080, 1350), '4k')).toEqual({ width: 2160, height: 2700 });
  });

  it('fits a very wide project inside the 1920x1080 / 3840x2160 frame', () => {
    expect(exportSize(withFormat(1000, 100), '1080p')).toEqual({ width: 1920, height: 192 });
    expect(exportSize(withFormat(100, 1000), '4k')).toEqual({ width: 384, height: 3840 });
  });

  it('uses an explicit long side when given (test-only override)', () => {
    expect(exportSize(withFormat(1080, 1080), '1080p', 160)).toEqual({ width: 160, height: 160 });
    expect(exportSize(withFormat(101, 57), '1080p', 101)).toEqual({ width: 100, height: 56 });
  });

  it('rejects a non-finite or non-positive project size or long side', () => {
    for (const [w, h] of [[0, 1080], [1920, 0], [-1920, 1080], [NaN, 1080], [1920, Infinity]]) {
      expect(() => exportSize(withFormat(w, h), '1080p')).toThrow(ExportError);
      expect(() => exportSize(withFormat(w, h), '1080p')).toThrow('Invalid project size');
    }
    for (const side of [0, -10, NaN, Infinity]) {
      expect(() => exportSize(withFormat(1920, 1080), '1080p', side)).toThrow('Invalid project size');
    }
  });
});

describe('exportProject', () => {
  it('rejects an empty project with ExportError before creating anything', async () => {
    const run = exportProject(emptyProject(), {
      quality: '1080p',
      onProgress: () => undefined,
      signal: new AbortController().signal,
    });
    await expect(run).rejects.toBeInstanceOf(ExportError);
    await expect(run).rejects.toThrow('Nothing to export');
  });

  it.each([0, -30, Number.NaN, Number.POSITIVE_INFINITY])('rejects a frame rate of %s with ExportError', async (fps) => {
    const base = emptyProject();
    const video = base.tracks.find((t) => t.kind === 'video')!;
    const clip = {
      id: 'c', mediaId: 'm', kind: 'video' as const, start: 0, in: 0, out: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, volume: 1, audio: defaultClipAudio(), effects: [], blend: 'normal' as const, fit: 'fit' as const,
    };
    const p = {
      ...base,
      format: { ...base.format, fps },
      tracks: base.tracks.map((t) => (t === video ? { ...t, clips: [clip] } : t)),
    };
    const run = exportProject(p, { quality: '1080p', onProgress: () => undefined, signal: new AbortController().signal });
    await expect(run).rejects.toBeInstanceOf(ExportError);
    await expect(run).rejects.toThrow('Invalid frame rate');
  });
});

describe('exportUsesMemory', () => {
  it('is true without a writable OPFS (here: Node has no navigator.storage)', () => {
    expect(exportUsesMemory()).toBe(true);
  });
});
