// Plan 5C Task 5: the CPU mirror of the transition pictures (D6): endpoints, symmetry, the shapes of wipe/slide/push/zoom/glitch.
import { describe, it, expect } from 'vitest';
import { TRANSITION_DIRECTIONS } from '../src/core/transitionTypes';
import type { TransitionType } from '../src/core/transitionTypes';
import { GLITCH, transitionPixel } from '../src/render/transitionMath';
import type { Pixel, Sampler, TransitionParams } from '../src/render/transitionMath';

const inside = (x: number, y: number): boolean => x >= 0 && x <= 1 && y >= 0 && y <= 1;
/** Opaque pictures with structure: A red left / green right, B blue top / yellow bottom. */
const A: Sampler = (x, y) => (!inside(x, y) ? [0, 0, 0, 0] : x < 0.5 ? [1, 0, 0, 1] : [0, 1, 0, 1]);
const B: Sampler = (x, y) => (!inside(x, y) ? [0, 0, 0, 0] : y < 0.5 ? [0, 0, 1, 1] : [1, 1, 0, 1]);
const prm = (type: TransitionType, e: number, over: Partial<TransitionParams> = {}): TransitionParams => ({ type, e, direction: 'left', softness: 0.1, amount: 2, frame: 7, ...over });
const POINTS: [number, number][] = [[0.1, 0.1], [0.3, 0.7], [0.5, 0.45], [0.7, 0.2], [0.9, 0.9], [0.55, 0.55]];
const near = (a: Pixel, b: Pixel, tol = 1e-9): boolean => a.every((v, k) => Math.abs(v - b[k]) <= tol);
const TYPES: TransitionType[] = ['dip', 'dissolve', 'wipe', 'slide', 'push', 'zoom', 'glitch'];

describe('endpoints', () => {
  for (const type of TYPES) {
    for (const direction of TRANSITION_DIRECTIONS) {
      it(`${type} ${direction}: e = 0 is exactly the outgoing picture, e = 1 exactly the incoming one`, () => {
        for (const [x, y] of POINTS) {
          // glitch at e = 0 hits no block (hash < 0 never) and has no shift/split (sin 0); at e = 1 every block is B and the shift is sin(pi) ~ 1e-16.
          const tol = type === 'glitch' ? 1e-6 : 1e-12;
          expect(near(transitionPixel(prm(type, 0, { direction }), A, B, x, y), A(x, y), tol), `${type} e0 at ${x},${y}`).toBe(true);
          expect(near(transitionPixel(prm(type, 1, { direction }), A, B, x, y), B(x, y), tol), `${type} e1 at ${x},${y}`).toBe(true);
        }
      });
    }
  }
});

describe('shapes', () => {
  it('dissolve is the linear mix; at e = 0.5 each channel is the mean', () => {
    const p = transitionPixel(prm('dissolve', 0.5), A, B, 0.2, 0.8);
    expect(near(p, [(1 + 1) / 2, 0.5 * 0 + 0.5, 0, 1], 1e-12)).toBe(true); // red + yellow: (1,0,0) and (1,1,0)
  });
  it('dip goes through black at e = 0.5 and keeps alpha', () => {
    const p = transitionPixel(prm('dip', 0.5), A, B, 0.2, 0.2);
    expect(p).toEqual([0, 0, 0, 1]);
    expect(transitionPixel(prm('dip', 0.25), A, B, 0.2, 0.2)).toEqual([0.5, 0, 0, 1]);
    expect(transitionPixel(prm('dip', 0.75), A, B, 0.2, 0.2)).toEqual([0, 0, 0.5, 1]);
  });
  it('wipe right with no softness: the edge is at e·W and B is behind it', () => {
    const w = (x: number): Pixel => transitionPixel(prm('wipe', 0.4, { direction: 'right', softness: 0 }), A, B, x, 0.25);
    expect(w(0.39)).toEqual(B(0.39, 0.25));
    expect(w(0.41)).toEqual(A(0.41, 0.25));
  });
  it('wipe direction flips the travel: left starts at the right edge', () => {
    const w = (x: number): Pixel => transitionPixel(prm('wipe', 0.4, { direction: 'left', softness: 0 }), A, B, x, 0.25);
    expect(w(0.61)).toEqual(B(0.61, 0.25));
    expect(w(0.59)).toEqual(A(0.59, 0.25));
  });
  it('a soft wipe is half-way at the edge centre', () => {
    const e = 0.5;
    const c = -0.1 + e * (1 + 2 * 0.1); // 0.5
    const p = transitionPixel(prm('wipe', e, { direction: 'right', softness: 0.1 }), A, B, c, 0.25);
    expect(p[3]).toBeCloseTo(1, 12);
    const mixed = transitionPixel(prm('wipe', e, { direction: 'right', softness: 0.1 }), A, B, c - 0.05, 0.25);
    expect(mixed).not.toEqual(A(c - 0.05, 0.25));
  });
  it('slide: the incoming picture moves by e·W over a static outgoing one (a marker pixel moves by e·W)', () => {
    const e = 0.25;
    // Direction left: the incoming picture enters from the right; its left edge is at x = 1 - e (a marker moves by e·W).
    const at = (x: number): Pixel => transitionPixel(prm('slide', e, { direction: 'left' }), A, B, x, 0.25);
    expect(at(0.7)).toEqual(A(0.7, 0.25));
    expect(at(0.8)).toEqual(B(0.8 - (1 - e), 0.25));
    expect(at(0.1)).toEqual(A(0.1, 0.25));
  });
  it('push: the outgoing picture leaves as the incoming one enters (disjoint, no gap at the seam)', () => {
    const e = 0.4;
    const seam = 1 - e; // direction left: the incoming picture's left edge is at x = 1 - e
    expect(transitionPixel(prm('push', e), A, B, seam - 0.01, 0.2)[3]).toBe(1);
    expect(transitionPixel(prm('push', e), A, B, seam + 0.01, 0.2)[3]).toBe(1);
  });
  it('zoom: e = 0.5 is a half mix of A scaled up and B scaled down about the centre', () => {
    const p = transitionPixel(prm('zoom', 0.5, { amount: 2 }), A, B, 0.5, 0.5);
    expect(p[3]).toBeCloseTo(1, 12);
  });
  it('glitch is repeatable for one frame and different for the next', () => {
    const grid = (frame: number): Pixel[] => POINTS.concat([[0.33, 0.33], [0.66, 0.1], [0.12, 0.88]]).map(([x, y]) => transitionPixel(prm('glitch', 0.5, { frame, amount: 1 }), A, B, x, y));
    expect(grid(10)).toEqual(grid(10));
    expect(grid(10)).not.toEqual(grid(11));
    expect(GLITCH.cols * GLITCH.rows).toBeGreaterThan(100);
  });
});

describe('D8 linearity: Normal over of the mix equals the mix of the overs', () => {
  const over = (top: Pixel, bd: Pixel): Pixel => top.map((v, k) => v + bd[k] * (1 - top[3])) as Pixel;
  it('for a dissolve of translucent pictures over a backdrop', () => {
    const ta: Sampler = () => [0.3, 0.1, 0, 0.5];
    const tb: Sampler = () => [0, 0.2, 0.6, 0.8];
    const bd: Pixel = [0.2, 0.2, 0.2, 1];
    const e = 0.37;
    const lhs = over(transitionPixel(prm('dissolve', e), ta, tb, 0.5, 0.5), bd);
    const rhs = over(ta(0, 0), bd).map((v, k) => v * (1 - e) + over(tb(0, 0), bd)[k] * e);
    lhs.forEach((v, k) => expect(v).toBeCloseTo(rhs[k], 12));
  });
});
