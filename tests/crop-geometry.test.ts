import { describe, it, expect } from 'vitest';
import { clampCrop, isCropped, normaliseCrop } from '../src/core/cropTypes';
import { croppedSize, croppedUvMatrix, flipMatrix, mulMat3 } from '../src/render/cropGeometry';
import { applyMat3, uvMatrix } from '../src/render/geometry';
import type { Mat3 } from '../src/render/geometry';

const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const near = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 12);
  expect(a[1]).toBeCloseTo(b[1], 12);
};

describe('mulMat3', () => {
  it('has I as identity and applies the right operand first', () => {
    const m: Mat3 = [0, -1, 0, 1, 0, 0, 0, 1, 1];
    expect(mulMat3(I, m)).toEqual(m);
    expect(mulMat3(m, I)).toEqual(m);
    const t: Mat3 = [1, 0, 0, 0, 1, 0, 5, 7, 1];
    near(applyMat3(mulMat3(m, t), 1, 1), applyMat3(m, 6, 8));
  });
});

describe('croppedSize', () => {
  it('returns the same object without a crop', () => {
    const s = { width: 100, height: 50 };
    expect(croppedSize(s, undefined)).toBe(s);
    expect(croppedSize(s, { left: 0, top: 0, right: 0, bottom: 0 })).toBe(s);
  });
  it('shrinks per axis', () => {
    const r = croppedSize({ width: 100, height: 50 }, { left: 0.1, top: 0.2, right: 0.3, bottom: 0.1 });
    expect(r.width).toBeCloseTo(60, 10);
    expect(r.height).toBeCloseTo(35, 10);
  });
});

describe('croppedUvMatrix', () => {
  it('is the orientation itself (same reference) with no crop and no flip', () => {
    const o = uvMatrix(90, false, true);
    expect(croppedUvMatrix(o, undefined, undefined)).toBe(o);
    expect(croppedUvMatrix(o, undefined, {})).toBe(o);
  });
  it('maps the cropped unit square onto its sub-rectangle', () => {
    const m = croppedUvMatrix(I, { left: 0.1, top: 0.2, right: 0.3, bottom: 0.1 }, undefined);
    near(applyMat3(m, 0, 0), [0.1, 0.2]);
    near(applyMat3(m, 1, 1), [0.7, 0.9]);
  });
  it('flips inside the cropped region, not the whole frame', () => {
    const crop = { left: 0.1, top: 0, right: 0.3, bottom: 0 };
    near(applyMat3(croppedUvMatrix(I, crop, { h: true }), 0, 0), [0.7, 0]);
    near(applyMat3(croppedUvMatrix(I, crop, { h: true }), 1, 0), [0.1, 0]);
    near(applyMat3(croppedUvMatrix(I, crop, { v: true }), 0, 0), [0.1, 1]);
  });
  it('flip twice is the identity', () => {
    const f = flipMatrix({ h: true, v: true });
    const m = mulMat3(f, f);
    m.forEach((v, i) => expect(v).toBeCloseTo(I[i], 12));
  });
  it('applies the orientation last (rotated source)', () => {
    const o = uvMatrix(90);
    const m = croppedUvMatrix(o, { left: 0.25, top: 0, right: 0, bottom: 0 }, undefined);
    near(applyMat3(m, 0, 0), applyMat3(o, 0.25, 0));
  });
  it('insets cropped edges only', () => {
    const m = croppedUvMatrix(I, { left: 0.5, top: 0, right: 0, bottom: 0 }, undefined, { x: 0.01, y: 0.01 });
    near(applyMat3(m, 0, 0), [0.51, 0]);
    near(applyMat3(m, 1, 1), [1, 1]);
  });
});

describe('clampCrop / normaliseCrop', () => {
  it('clamps edges to 0..0.95 and ignores non-finite', () => {
    expect(clampCrop({ left: -1, top: NaN, right: 2, bottom: 0 })).toEqual({ left: 0, top: 0, right: 0.95, bottom: 0 });
  });
  it('keeps the minimum remaining per axis, proportionally', () => {
    const c = clampCrop({ left: 0.9, top: 0, right: 0.9, bottom: 0 });
    expect(c.left).toBeCloseTo(0.49, 12);
    expect(c.right).toBeCloseTo(0.49, 12);
    const p = clampCrop({ left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 }, 0.2, 0.2);
    expect(p.left + p.right).toBeCloseTo(0.8, 12);
  });
  it('leaves a valid crop unchanged and drops identity', () => {
    const c = { left: 0.1, top: 0.1, right: 0.1, bottom: 0.1 };
    expect(clampCrop(c)).toEqual(c);
    expect(normaliseCrop({ left: 0, top: 0, right: 0, bottom: 0 })).toBeUndefined();
    expect(normaliseCrop(c)).toBe(c);
    expect(isCropped(undefined)).toBe(false);
  });
});
