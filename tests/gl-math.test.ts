import { describe, it, expect } from 'vitest';
import { applyMat3, clipMatrix, fullscreenMatrix, letterbox } from '../src/render/gl';
import { defaultTransform } from '../src/core/model';
import type { Transform } from '../src/core/model';

const canvas = { width: 200, height: 100 };

function t(over: Partial<Transform>): Transform {
  return { ...defaultTransform(), ...over };
}

function expectPoint(actual: [number, number], expected: [number, number]): void {
  expect(actual[0]).toBeCloseTo(expected[0], 9);
  expect(actual[1]).toBeCloseTo(expected[1], 9);
}

describe('clipMatrix', () => {
  it('identity transform maps source corners to clip space around the centre (y up in clip space)', () => {
    const m = clipMatrix({ width: 100, height: 50 }, defaultTransform(), canvas);
    // (u, v) = (0, 0) is the image's top-left: 50 px left and 25 px up of the centre.
    expectPoint(applyMat3(m, 0, 0), [-0.5, 0.5]);
    expectPoint(applyMat3(m, 1, 0), [0.5, 0.5]);
    expectPoint(applyMat3(m, 0, 1), [-0.5, -0.5]);
    expectPoint(applyMat3(m, 1, 1), [0.5, -0.5]);
    expectPoint(applyMat3(m, 0.5, 0.5), [0, 0]);
  });

  it('a source the size of the canvas fills clip space exactly', () => {
    const m = clipMatrix(canvas, defaultTransform(), canvas);
    expectPoint(applyMat3(m, 0, 0), [-1, 1]);
    expectPoint(applyMat3(m, 1, 1), [1, -1]);
  });

  it('translates in canvas pixels with y pointing down', () => {
    const m = clipMatrix({ width: 100, height: 50 }, t({ x: 50, y: 25 }), canvas);
    expectPoint(applyMat3(m, 0.5, 0.5), [0.5, -0.5]);
    expectPoint(applyMat3(m, 0, 0), [0, 0]);
  });

  it('rotates clockwise (on screen) about the clip centre', () => {
    const m = clipMatrix({ width: 100, height: 50 }, t({ rotation: 90 }), canvas);
    // The right-middle edge point (50 px right of centre) ends up 50 px below the centre.
    expectPoint(applyMat3(m, 1, 0.5), [0, -1]);
    // The top-left corner (-50, -25) goes to (25, -50): right of centre, above it.
    expectPoint(applyMat3(m, 0, 0), [0.25, 1]);
    expectPoint(applyMat3(m, 0.5, 0.5), [0, 0]);
  });

  it('rotation is applied about the clip centre, after which the translation applies', () => {
    const m = clipMatrix({ width: 100, height: 50 }, t({ rotation: 90, x: -50 }), canvas);
    expectPoint(applyMat3(m, 0.5, 0.5), [-0.5, 0]);
    expectPoint(applyMat3(m, 1, 0.5), [-0.5, -1]);
  });

  it('scales the source pixels uniformly', () => {
    const m = clipMatrix({ width: 100, height: 50 }, t({ scale: 2 }), canvas);
    expectPoint(applyMat3(m, 0, 0), [-1, 1]);
    expectPoint(applyMat3(m, 1, 1), [1, -1]);
    const half = clipMatrix({ width: 100, height: 50 }, t({ scale: 0.5 }), canvas);
    expectPoint(applyMat3(half, 1, 1), [0.25, -0.25]);
  });

  it('is column-major with an affine last row', () => {
    const m = clipMatrix({ width: 10, height: 10 }, t({ x: 3, rotation: 30 }), canvas);
    expect(m).toHaveLength(9);
    expect(m[2]).toBe(0);
    expect(m[5]).toBe(0);
    expect(m[8]).toBe(1);
  });
});

describe('fullscreenMatrix', () => {
  it('maps the unit quad onto the whole of clip space, v = 0 at the top', () => {
    const m = fullscreenMatrix();
    expectPoint(applyMat3(m, 0, 0), [-1, 1]);
    expectPoint(applyMat3(m, 1, 1), [1, -1]);
  });
});

describe('letterbox', () => {
  it('uses the whole target when the aspect ratios match', () => {
    expect(letterbox({ width: 64, height: 36 }, { width: 128, height: 72 })).toEqual({ x: 0, y: 0, width: 128, height: 72 });
  });

  it('centres a scaled, aspect-preserving viewport inside a wider target', () => {
    expect(letterbox({ width: 100, height: 100 }, { width: 200, height: 100 })).toEqual({ x: 50, y: 0, width: 100, height: 100 });
  });

  it('centres a scaled, aspect-preserving viewport inside a taller target', () => {
    expect(letterbox({ width: 100, height: 50 }, { width: 100, height: 100 })).toEqual({ x: 0, y: 25, width: 100, height: 50 });
  });

  it('never returns an empty viewport', () => {
    const v = letterbox({ width: 1000, height: 1 }, { width: 10, height: 10 });
    expect(v.width).toBeGreaterThanOrEqual(1);
    expect(v.height).toBeGreaterThanOrEqual(1);
  });
});
