import { describe, it, expect } from 'vitest';
import { targetSize } from '../src/render/fx/engine';
import { seedFor, seedVec } from '../src/render/fx/seed';
import { overlayRasterSize } from '../src/render/overlays/raster';

describe('targetSize', () => {
  it('is the on-screen size, never above the source nor 4096, at least 8', () => {
    expect(targetSize({ width: 1920, height: 1080 }, 0.5, 0.5)).toEqual({ width: 480, height: 270 });
    expect(targetSize({ width: 640, height: 360 }, 4, 1)).toEqual({ width: 640, height: 360 });
    expect(targetSize({ width: 8000, height: 6000 }, 1, 1)).toEqual({ width: 4096, height: 4096 });
    expect(targetSize({ width: 1920, height: 1080 }, 0.0001, 0.5)).toEqual({ width: 8, height: 8 });
    expect(targetSize({ width: 4, height: 4 }, 1, 1)).toEqual({ width: 4, height: 4 });
  });

  it('treats a non-finite or non-positive scale as 1 instead of returning NaN', () => {
    for (const scale of [NaN, Infinity, -1, 0]) {
      const s = targetSize({ width: 640, height: 360 }, scale, 1);
      expect(Number.isInteger(s.width) && Number.isInteger(s.height), String(scale)).toBe(true);
      expect(s).toEqual({ width: 640, height: 360 });
    }
  });
});

describe('seeds', () => {
  it('are deterministic, depend on frame and clip, and stay below 2^24', () => {
    expect(seedFor(5, 'a')).toBe(seedFor(5, 'a'));
    expect(seedFor(5, 'a')).not.toBe(seedFor(6, 'a'));
    expect(seedFor(5, 'a')).not.toBe(seedFor(5, 'b'));
    for (let i = 0; i < 200; i++) expect(seedFor(i, `clip-${i}`)).toBeLessThan(16777216);
    const [x, y] = seedVec(seedFor(9, 'z'));
    expect(x).toBeLessThan(1021);
    expect(y).toBeLessThan(1021);
  });
});

describe('overlayRasterSize', () => {
  const box = { width: 960, height: 180 };
  it('rounds the on-screen size up to a 1.25x step, within 16..2048, keeping the aspect', () => {
    const a = overlayRasterSize(box, 0.45, 1);
    expect(a.width).toBeGreaterThanOrEqual(432);
    expect(a.width).toBeLessThan(432 * 1.26);
    expect(a.height).toBe(Math.round((a.width * 180) / 960));
    expect(overlayRasterSize(box, 0.0001, 1).width).toBeGreaterThanOrEqual(16);
    expect(overlayRasterSize(box, 100, 1).width).toBeLessThanOrEqual(2048);
    expect(overlayRasterSize(box, 0.45, 1)).toEqual(overlayRasterSize(box, 0.46, 1));
  });

  it('survives a non-finite scale', () => {
    for (const scale of [NaN, Infinity]) {
      const s = overlayRasterSize(box, scale, 1);
      expect(Number.isFinite(s.width) && Number.isFinite(s.height)).toBe(true);
      expect(s.width).toBeGreaterThanOrEqual(16);
      expect(s.width).toBeLessThanOrEqual(2048);
    }
  });
});
