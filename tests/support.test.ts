import { describe, it, expect } from 'vitest';
import { CAPABILITY_LABELS, getCapabilities, hasWebCodecs, importBlockers, missingCapabilities } from '../src/media/support';
import type { Capability } from '../src/media/support';

/** A global-like object with every capability ClipForge needs; `without` drops some. */
function fullGlobals(without: Capability[] = []): typeof globalThis {
  class FileSystemFileHandle {}
  (FileSystemFileHandle.prototype as unknown as Record<string, unknown>).createWritable = () => undefined;
  const g: Record<string, unknown> = {
    VideoDecoder: class {},
    VideoEncoder: class {},
    AudioDecoder: class {},
    WebGL2RenderingContext: class {},
    OfflineAudioContext: class {},
    FileSystemFileHandle,
    navigator: { storage: { getDirectory: () => undefined } },
  };
  for (const c of without) {
    if (c === 'videoDecoder') delete g.VideoDecoder;
    if (c === 'videoEncoder') delete g.VideoEncoder;
    if (c === 'audioDecoder') delete g.AudioDecoder;
    if (c === 'webgl2') delete g.WebGL2RenderingContext;
    if (c === 'offlineAudioContext') delete g.OfflineAudioContext;
    if (c === 'opfs') g.navigator = { storage: {} };
    if (c === 'opfsWritable') delete (FileSystemFileHandle.prototype as unknown as Record<string, unknown>).createWritable;
  }
  return g as unknown as typeof globalThis;
}

const ALL: Capability[] = ['videoDecoder', 'videoEncoder', 'audioDecoder', 'opfs', 'opfsWritable', 'webgl2', 'offlineAudioContext'];

describe('getCapabilities / missingCapabilities', () => {
  it('reports nothing missing when every API exists', () => {
    const caps = getCapabilities(fullGlobals());
    expect(Object.values(caps).every(Boolean)).toBe(true);
    expect(missingCapabilities(caps)).toEqual([]);
  });

  it.each(ALL)('reports %s by name when it is missing', (cap) => {
    const caps = getCapabilities(fullGlobals([cap]));
    expect(caps[cap]).toBe(false);
    expect(missingCapabilities(caps)).toEqual([cap]);
    expect(CAPABILITY_LABELS[cap]).toBeTruthy();
  });

  it('reports everything missing for an empty global object', () => {
    expect(missingCapabilities(getCapabilities({} as typeof globalThis))).toEqual(ALL);
  });

  it('treats OPFS without createWritable (older Safari) as missing file writing only', () => {
    expect(missingCapabilities(getCapabilities(fullGlobals(['opfsWritable'])))).toEqual(['opfsWritable']);
  });
});

describe('importBlockers', () => {
  it('blocks import without video/audio decoding or OPFS writing, not without encoders or WebGL2', () => {
    expect(importBlockers(getCapabilities(fullGlobals(['audioDecoder', 'webgl2'])))).toEqual(['audioDecoder']);
    expect(importBlockers(getCapabilities(fullGlobals(['opfsWritable'])))).toEqual(['opfsWritable']);
    expect(importBlockers(getCapabilities(fullGlobals(['videoEncoder', 'offlineAudioContext'])))).toEqual([]);
    expect(importBlockers(getCapabilities(fullGlobals(['videoDecoder', 'opfs'])))).toEqual(['videoDecoder', 'opfs']);
  });
});

describe('hasWebCodecs', () => {
  it('is true only when VideoDecoder and VideoEncoder exist', () => {
    expect(hasWebCodecs({} as unknown as typeof globalThis)).toBe(false);
    expect(hasWebCodecs({ VideoDecoder: class {} } as unknown as typeof globalThis)).toBe(false);
    expect(hasWebCodecs({ VideoDecoder: class {}, VideoEncoder: class {} } as unknown as typeof globalThis)).toBe(true);
  });
});
