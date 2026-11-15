// Plan 5E Task 2: crop and anchor in clipMatrix / clipCorners (D1, D4, D6).
import { describe, it, expect } from 'vitest';
import type { Transform } from '../src/core/model';
import { applyMat3, clipMatrix } from '../src/render/geometry';
import { clipCorners, frameCorners } from '../src/render/overlayGeometry';

const FMT = { width: 1920, height: 1080 };
const SRC = { width: 1280, height: 720 };
const tf = (o: Partial<Transform> = {}): Transform => ({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...o });
const toPx = ([cx, cy]: [number, number]) => ({ x: ((cx + 1) / 2) * FMT.width, y: ((1 - cy) / 2) * FMT.height });
const rnd = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe('clipMatrix without a view is bit-identical to 5B', () => {
  it('undefined, empty and zero views', () => {
    const r = rnd(7);
    for (let i = 0; i < 50; i++) {
      const t = tf({ x: r() * 800 - 400, y: r() * 600 - 300, scale: 0.2 + r() * 3, rotation: r() * 720 - 360 });
      const base = clipMatrix(SRC, t, FMT);
      expect(clipMatrix(SRC, t, FMT, undefined)).toEqual(base);
      expect(clipMatrix(SRC, t, FMT, {})).toEqual(base);
      expect(clipMatrix(SRC, t, FMT, { anchor: { x: 0, y: 0 }, crop: { left: 0, top: 0, right: 0, bottom: 0 } })).toEqual(base);
    }
  });
});

describe('anchor', () => {
  it('the anchor point stays at the canvas position (x, y) under scale and rotation', () => {
    const r = rnd(11);
    for (let i = 0; i < 50; i++) {
      const a = { x: r() - 0.5, y: r() - 0.5 };
      const t = tf({ x: r() * 400 - 200, y: r() * 300 - 150, scale: 0.3 + r() * 2, rotation: r() * 360 });
      const m = clipMatrix(SRC, t, FMT, { anchor: a });
      const p = toPx(applyMat3(m, 0.5 + a.x, 0.5 + a.y));
      expect(p.x).toBeCloseTo(FMT.width / 2 + t.x, 6);
      expect(p.y).toBeCloseTo(FMT.height / 2 + t.y, 6);
    }
  });
  it('a corner anchor rotates the picture about that corner', () => {
    const m = clipMatrix(SRC, tf({ rotation: 90 }), FMT, { anchor: { x: -0.5, y: -0.5 } });
    const tl = toPx(applyMat3(m, 0, 0));
    expect(tl.x).toBeCloseTo(FMT.width / 2, 6);
    expect(tl.y).toBeCloseTo(FMT.height / 2, 6);
    const tr = toPx(applyMat3(m, 1, 0)); // rotated 90 clockwise: right of the pivot becomes below it
    expect(tr.x).toBeCloseTo(FMT.width / 2, 6);
    expect(tr.y).toBeCloseTo(FMT.height / 2 + SRC.width, 6);
  });
});

describe('crop is a mask on the full frame (D1)', () => {
  const crop = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.1 };
  it('visible pixels do not move: cropped (s, t) lands where the frame point lands without a crop', () => {
    const t = tf({ x: 30, y: -20, scale: 0.8, rotation: 25 });
    const a = { x: 0.1, y: -0.2 };
    const full = clipMatrix(SRC, t, FMT, { anchor: a });
    const cropped = clipMatrix(SRC, t, FMT, { anchor: a, crop });
    for (const [s, v] of [[0, 0], [1, 0], [1, 1], [0, 1], [0.3, 0.6]]) {
      const u = crop.left + s * (1 - crop.left - crop.right);
      const w = crop.top + v * (1 - crop.top - crop.bottom);
      const p = applyMat3(full, u, w);
      const q = applyMat3(cropped, s, v);
      expect(q[0]).toBeCloseTo(p[0], 10);
      expect(q[1]).toBeCloseTo(p[1], 10);
    }
  });
});

describe('clipCorners / frameCorners agree with clipMatrix (Ruling 1 parity)', () => {
  it('random crop + anchor + rotation + scale', () => {
    const r = rnd(23);
    for (let i = 0; i < 60; i++) {
      const crop = { left: r() * 0.3, top: r() * 0.3, right: r() * 0.3, bottom: r() * 0.3 };
      const a = { x: r() - 0.5, y: r() - 0.5 };
      const t = tf({ x: r() * 600 - 300, y: r() * 400 - 200, scale: 0.2 + r() * 3, rotation: r() * 720 - 360 });
      const m = clipMatrix(SRC, t, FMT, { crop, anchor: a });
      const f = clipMatrix(SRC, t, FMT, { anchor: a });
      const unit: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const cc = clipCorners(SRC, t, FMT, { crop, anchor: a });
      const fc = frameCorners(SRC, t, FMT, { anchor: a });
      unit.forEach(([s, v], k) => {
        const p = toPx(applyMat3(m, s, v));
        expect(cc[k].x).toBeCloseTo(p.x, 6);
        expect(cc[k].y).toBeCloseTo(p.y, 6);
        const q = toPx(applyMat3(f, s, v));
        expect(fc[k].x).toBeCloseTo(q.x, 6);
        expect(fc[k].y).toBeCloseTo(q.y, 6);
      });
    }
  });
  it('without a view equals the 5B corners exactly; frameCorners ignores the crop', () => {
    const t = tf({ x: 12, y: 5, scale: 1.3, rotation: 33 });
    const base = clipCorners(SRC, t, FMT);
    expect(clipCorners(SRC, t, FMT, undefined)).toEqual(base);
    expect(clipCorners(SRC, t, FMT, {})).toEqual(base);
    expect(frameCorners(SRC, t, FMT, { crop: { left: 0.2, top: 0, right: 0, bottom: 0 } })).toEqual(base);
  });
});
