import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScratch } from '../src/render/overlays/textures';

afterEach(() => vi.unstubAllGlobals());

describe('createScratch', () => {
  it('falls back to a <canvas> when OffscreenCanvas has no 2D context', () => {
    const ctx = { fake: true };
    vi.stubGlobal('OffscreenCanvas', class { width = 1; height = 1; getContext() { return null; } });
    vi.stubGlobal('document', { createElement: () => ({ width: 1, height: 1, getContext: () => ctx }) });
    expect(createScratch()?.ctx).toBe(ctx);
  });
  it('uses OffscreenCanvas when it works, and returns null when nothing does', () => {
    const ctx = { off: true };
    vi.stubGlobal('OffscreenCanvas', class { getContext() { return ctx; } });
    expect(createScratch()?.ctx).toBe(ctx);
    vi.stubGlobal('OffscreenCanvas', class { getContext() { return null; } });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    expect(createScratch()).toBeNull();
  });
});
