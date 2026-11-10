import { describe, it, expect } from 'vitest';
import { applyMat3, clipMatrix, frameOrientation, fullscreenMatrix, letterbox, rotatedSize, uvMatrix } from '../src/render/gl';
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

describe('uvMatrix / rotatedSize', () => {
  // Raw (unrotated) texture corners: top-left (0,0), top-right (1,0), bottom-left (0,1), bottom-right (1,1).
  // Rotating an image clockwise by 90° moves its top-left corner to the top-right, so the displayed top-right
  // corner must sample the raw top-left, and so on.
  it('0° is the identity', () => {
    expectPoint(applyMat3(uvMatrix(0), 0.25, 0.75), [0.25, 0.75]);
  });

  it('90° clockwise: displayed TL shows raw BL, displayed TR shows raw TL', () => {
    const m = uvMatrix(90);
    expectPoint(applyMat3(m, 0, 0), [0, 1]);
    expectPoint(applyMat3(m, 1, 0), [0, 0]);
    expectPoint(applyMat3(m, 1, 1), [1, 0]);
    expectPoint(applyMat3(m, 0, 1), [1, 1]);
  });

  it('180°: displayed TL shows raw BR', () => {
    const m = uvMatrix(180);
    expectPoint(applyMat3(m, 0, 0), [1, 1]);
    expectPoint(applyMat3(m, 1, 0), [0, 1]);
  });

  it('270° clockwise: displayed TL shows raw TR, displayed BL shows raw TL', () => {
    const m = uvMatrix(270);
    expectPoint(applyMat3(m, 0, 0), [1, 0]);
    expectPoint(applyMat3(m, 0, 1), [0, 0]);
    expectPoint(applyMat3(m, 1, 1), [0, 1]);
  });

  it('flipV turns the sampled texture upside down after the rotation', () => {
    expectPoint(applyMat3(uvMatrix(0, true), 0.25, 0), [0.25, 1]);
    expectPoint(applyMat3(uvMatrix(90, true), 0, 0), [0, 0]);
    expectPoint(applyMat3(uvMatrix(90, true), 1, 0), [0, 1]);
  });

  it('rotatedSize swaps the sides for 90° and 270° only', () => {
    const raw = { width: 640, height: 360 };
    expect(rotatedSize(raw, 0)).toEqual(raw);
    expect(rotatedSize(raw, 180)).toEqual(raw);
    expect(rotatedSize(raw, 90)).toEqual({ width: 360, height: 640 });
    expect(rotatedSize(raw, 270)).toEqual({ width: 360, height: 640 });
  });
});

describe('mirrored sources', () => {
  it('mirror swaps left and right of the displayed image', () => {
    const m = uvMatrix(0, false, true);
    expectPoint(applyMat3(m, 0, 0), [1, 0]);
    expectPoint(applyMat3(m, 1, 1), [0, 1]);
  });

  it('mirroring applies after rotation: 90° + mirror shows raw TL at the displayed TL', () => {
    // 90° clockwise puts raw TL at the displayed top-right; mirroring then moves it to the top-left.
    const m = uvMatrix(90, false, true);
    expectPoint(applyMat3(m, 0, 0), [0, 0]);
    expectPoint(applyMat3(m, 1, 0), [0, 1]);
    expectPoint(applyMat3(m, 0, 1), [1, 0]);
  });

  it('mirror composes with flipV', () => {
    expectPoint(applyMat3(uvMatrix(0, true, true), 0, 0), [1, 1]);
  });
});

describe('frameOrientation', () => {
  it('uses the track orientation for frames that carry none', () => {
    expect(frameOrientation({ rotation: 90, flip: true }, {})).toEqual({ rotation: 90, mirror: true });
    expect(frameOrientation({ rotation: 270, flip: false }, { rotation: 0 })).toEqual({ rotation: 270, mirror: false });
  });

  it('subtracts what a frame says is already applied, so nothing is turned twice', () => {
    expect(frameOrientation({ rotation: 90, flip: false }, { rotation: 90 })).toEqual({ rotation: 0, mirror: false });
    expect(frameOrientation({ rotation: 90, flip: false }, { rotation: 180 })).toEqual({ rotation: 270, mirror: false });
    expect(frameOrientation({ rotation: 0, flip: true }, { flip: true })).toEqual({ rotation: 0, mirror: false });
  });

  it('ignores non-quarter or non-numeric frame rotations', () => {
    expect(frameOrientation({ rotation: 90, flip: false }, { rotation: 45 })).toEqual({ rotation: 90, mirror: false });
    expect(frameOrientation({ rotation: 90, flip: false }, { rotation: undefined })).toEqual({ rotation: 90, mirror: false });
  });
});
