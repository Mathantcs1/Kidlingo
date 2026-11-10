import { describe, expect, it } from 'vitest';
import { ExportError, evenDims, exportProject, exportSize } from '../src/export/exporter';
import { emptyProject } from '../src/core/model';
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

  it('scales a 4:5 project so the long side is 1920 / 3840', () => {
    expect(exportSize(withFormat(1080, 1350), '1080p')).toEqual({ width: 1536, height: 1920 });
    expect(exportSize(withFormat(1080, 1350), '4k')).toEqual({ width: 3072, height: 3840 });
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
});
