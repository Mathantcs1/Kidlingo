import { describe, it, expect } from 'vitest';
import { dragCrop, frameFractionAt, withLiveCrop } from '../src/core/cropDrag';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { applyMat3, clipMatrix } from '../src/render/geometry';

const FMT = { width: 1920, height: 1080 };
const SIZE = { width: 1280, height: 720 };

describe('frameFractionAt is the inverse of the clip placement', () => {
  it('round-trips random transforms, pivots and frame points', () => {
    let seed = 5;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 80; i++) {
      const t = { ...defaultTransform(), x: r() * 600 - 300, y: r() * 400 - 200, scale: 0.2 + r() * 3, rotation: r() * 720 - 360 };
      const a = { x: r() - 0.5, y: r() - 0.5 };
      const u = r();
      const v = r();
      const m = clipMatrix(SIZE, t, FMT, { anchor: a });
      const [cx, cy] = applyMat3(m, u, v);
      const px = { x: ((cx + 1) / 2) * FMT.width, y: ((1 - cy) / 2) * FMT.height };
      const f = frameFractionAt(px, t, SIZE, a, FMT);
      expect(f.u).toBeCloseTo(u, 9);
      expect(f.v).toBeCloseTo(v, 9);
    }
  });
  it('without a pivot the centre is (0.5, 0.5)', () => {
    const f = frameFractionAt({ x: 960, y: 540 }, defaultTransform(), SIZE, undefined, FMT);
    expect(f).toEqual({ u: 0.5, v: 0.5 });
  });
});

describe('dragCrop', () => {
  const MIN = 0.02;
  it('edges take u / 1-u / v / 1-v and corners two of them', () => {
    expect(dragCrop(undefined, 'l', 0.3, 0.9, MIN, MIN)).toEqual({ left: 0.3, top: 0, right: 0, bottom: 0 });
    expect(dragCrop(undefined, 'r', 0.8, 0.9, MIN, MIN).right).toBeCloseTo(0.2, 12);
    expect(dragCrop(undefined, 't', 0.1, 0.25, MIN, MIN).top).toBe(0.25);
    expect(dragCrop(undefined, 'b', 0.1, 0.75, MIN, MIN).bottom).toBeCloseTo(0.25, 12);
    const c = dragCrop({ left: 0, top: 0, right: 0.1, bottom: 0 }, 'tl', 0.2, 0.3, MIN, MIN);
    expect(c).toEqual({ left: 0.2, top: 0.3, right: 0.1, bottom: 0 });
  });
  it('never crosses the opposite edge, keeps the minimum, never goes negative', () => {
    expect(dragCrop({ left: 0, top: 0, right: 0.6, bottom: 0 }, 'l', 0.9, 0.5, MIN, MIN).left).toBeCloseTo(0.38, 12);
    expect(dragCrop(undefined, 'l', -0.5, 0.5, MIN, MIN).left).toBe(0);
    expect(dragCrop(undefined, 'r', 1.7, 0.5, MIN, MIN).right).toBe(0);
    expect(dragCrop(undefined, 'l', 5, 0.5, MIN, MIN).left).toBe(0.95);
    expect(dragCrop(undefined, 'l', NaN, 0.5, MIN, MIN).left).toBe(0);
  });
  it('leaves edges the handle does not own untouched', () => {
    const start = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 };
    const c = dragCrop(start, 'r', 0.9, 0.0, MIN, MIN);
    expect([c.left, c.top, c.bottom]).toEqual([0.1, 0.2, 0.4]);
  });
});

describe('withLiveCrop', () => {
  const clip: Clip = { id: 'c', mediaId: 'm', kind: 'image', start: 0, in: 0, out: 1, transform: defaultTransform(), volume: 1, fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal' };
  const proj = (): Project => ({ ...emptyProject(), tracks: [{ ...emptyProject().tracks[0], clips: [clip] }] });
  it('sets, clears and ignores an unknown clip', () => {
    const p = proj();
    expect(withLiveCrop(p, 'c', { left: 0.1, top: 0, right: 0, bottom: 0 }).tracks[0].clips[0].crop).toEqual({ left: 0.1, top: 0, right: 0, bottom: 0 });
    expect(withLiveCrop(p, 'c', { left: 0, top: 0, right: 0, bottom: 0 }).tracks[0].clips[0]).not.toHaveProperty('crop');
    expect(withLiveCrop(p, 'zzz', { left: 0.1, top: 0, right: 0, bottom: 0 })).toBe(p);
    expect(p.tracks[0].clips[0]).not.toHaveProperty('crop');
  });
});
