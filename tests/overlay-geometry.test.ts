import { describe, it, expect } from 'vitest';
import { applyMat3, clipMatrix } from '../src/render/geometry';
import {
  clipCentre, clipCorners, dragMove, dragRotate, dragScale, hitTest, rotateHandlePoint, snapToCanvas,
} from '../src/render/overlayGeometry';
import type { Corners, Point } from '../src/render/overlayGeometry';
import { defaultTransform } from '../src/core/model';
import type { Transform } from '../src/core/model';

const FMT = { width: 200, height: 100 };
const SIZE = { width: 100, height: 50 };

const t = (over: Partial<Transform> = {}): Transform => ({ ...defaultTransform(), ...over });

function near(actual: Point, expected: [number, number], digits = 9): void {
  expect(actual.x).toBeCloseTo(expected[0], digits);
  expect(actual.y).toBeCloseTo(expected[1], digits);
}

function nearAll(actual: Corners, expected: [number, number][]): void {
  actual.forEach((p, i) => near(p, expected[i]));
}

describe('clipCorners', () => {
  it('identity: a centred rect, TL TR BR BL', () => {
    nearAll(clipCorners(SIZE, t(), FMT), [[50, 25], [150, 25], [150, 75], [50, 75]]);
  });

  it('scale 0.5 shrinks about the centre', () => {
    nearAll(clipCorners(SIZE, t({ scale: 0.5 }), FMT), [[75, 37.5], [125, 37.5], [125, 62.5], [75, 62.5]]);
  });

  it('rotation 90° turns the corners clockwise about the centre', () => {
    // TL (-50, -25) → (25, -50): where the unrotated quad's right side is, above the centre.
    nearAll(clipCorners(SIZE, t({ rotation: 90 }), FMT), [[125, 0], [125, 100], [75, 100], [75, 0]]);
  });

  it('rotation 90° of a square puts TL where TR was', () => {
    const sq = { width: 40, height: 40 };
    const plain = clipCorners(sq, t(), FMT);
    const turned = clipCorners(sq, t({ rotation: 90 }), FMT);
    near(turned[0], [plain[1].x, plain[1].y]);
    near(turned[1], [plain[2].x, plain[2].y]);
  });

  it('rotation 180° swaps opposite corners', () => {
    nearAll(clipCorners(SIZE, t({ rotation: 180 }), FMT), [[150, 75], [50, 75], [50, 25], [150, 25]]);
  });

  it('translates in format px (y down)', () => {
    nearAll(clipCorners(SIZE, t({ x: 10, y: -5 }), FMT), [[60, 20], [160, 20], [160, 70], [60, 70]]);
  });

  it('combined scale, rotation and translation', () => {
    // 50×25 quad rotated 90° → 25 wide, 50 tall, centred at (110, 60).
    nearAll(clipCorners(SIZE, t({ scale: 0.5, rotation: 90, x: 10, y: 10 }), FMT), [
      [122.5, 35], [122.5, 85], [97.5, 85], [97.5, 35],
    ]);
  });

  it('agrees with clipMatrix mapped through the compositor viewport (NDC → format px)', () => {
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const fmt = { width: 1920, height: 1080 };
    for (let i = 0; i < 25; i++) {
      const size = { width: 10 + rnd() * 2000, height: 10 + rnd() * 2000 };
      const tr = t({ x: (rnd() - 0.5) * 3000, y: (rnd() - 0.5) * 3000, scale: 0.02 + rnd() * 4, rotation: (rnd() - 0.5) * 360 });
      const m = clipMatrix(size, tr, fmt);
      const toPx = ([nx, ny]: [number, number]): Point => ({ x: ((nx + 1) / 2) * fmt.width, y: ((1 - ny) / 2) * fmt.height });
      const expected = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => toPx(applyMat3(m, u, v)));
      const corners = clipCorners(size, tr, fmt);
      corners.forEach((c, k) => {
        expect(Math.abs(c.x - expected[k].x)).toBeLessThan(1e-6);
        expect(Math.abs(c.y - expected[k].y)).toBeLessThan(1e-6);
      });
    }
  });

  it('is finite-safe: non-finite input collapses to a point, never NaN', () => {
    for (const bad of [t({ x: NaN }), t({ scale: Infinity }), t({ rotation: NaN })]) {
      for (const c of clipCorners(SIZE, bad, FMT)) expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
    }
    for (const c of clipCorners({ width: NaN, height: 1 }, t(), FMT)) expect(Number.isFinite(c.x)).toBe(true);
  });

  it('scale 0 and zero size give a degenerate quad at the centre', () => {
    nearAll(clipCorners(SIZE, t({ scale: 0 }), FMT), [[100, 50], [100, 50], [100, 50], [100, 50]]);
    nearAll(clipCorners({ width: 0, height: 0 }, t({ x: 5 }), FMT), [[105, 50], [105, 50], [105, 50], [105, 50]]);
  });
});

describe('clipCentre', () => {
  it('is the canvas centre plus the offset', () => {
    near(clipCentre(t(), FMT), [100, 50]);
    near(clipCentre(t({ x: -20, y: 30 }), FMT), [80, 80]);
  });

  it('falls back to the canvas centre for a non-finite offset', () => {
    near(clipCentre(t({ x: NaN, y: 5 }), FMT), [100, 50]);
  });
});

describe('rotateHandlePoint', () => {
  it('sits beyond the middle of the top edge (rotation 0)', () => {
    near(rotateHandlePoint(clipCorners(SIZE, t(), FMT), 20), [100, 5]);
  });

  it('rotates with the clip (90°: to the right of the centre)', () => {
    near(rotateHandlePoint(clipCorners(SIZE, t({ rotation: 90 }), FMT), 20), [145, 50]);
  });

  it('still points outward for a zero-width clip and is finite for a point quad', () => {
    near(rotateHandlePoint(clipCorners({ width: 0, height: 50 }, t(), FMT), 10), [100, 15]);
    const p = rotateHandlePoint(clipCorners({ width: 0, height: 0 }, t(), FMT), 10);
    near(p, [100, 40]);
  });
});

describe('hitTest', () => {
  const corners = clipCorners(SIZE, t(), FMT); // [50,25]..[150,75]; rotate handle at (100, 1) with offset 24

  it('finds corners within the tolerance', () => {
    expect(hitTest(corners, { x: 52, y: 27 }, 6)).toBe('scale-tl');
    expect(hitTest(corners, { x: 147, y: 22 }, 6)).toBe('scale-tr');
    expect(hitTest(corners, { x: 150, y: 75 }, 6)).toBe('scale-br');
    expect(hitTest(corners, { x: 46, y: 78 }, 6)).toBe('scale-bl');
  });

  it('inside the quad is move; outside is null', () => {
    expect(hitTest(corners, { x: 100, y: 50 }, 6)).toBe('move');
    expect(hitTest(corners, { x: 40, y: 50 }, 6)).toBeNull();
    expect(hitTest(corners, { x: 100, y: 90 }, 6)).toBeNull();
    expect(hitTest(corners, { x: NaN, y: 50 }, 6)).toBeNull();
  });

  it('respects the tolerance', () => {
    expect(hitTest(corners, { x: 40, y: 15 }, 6)).toBeNull();
    expect(hitTest(corners, { x: 40, y: 15 }, 15)).toBe('scale-tl');
  });

  it('the rotate handle wins over a corner and over the inside', () => {
    expect(hitTest(corners, { x: 100, y: 1 }, 6)).toBe('rotate');
    // Offset 5 puts the handle at (100, 20), near the inside; a large tolerance reaches into the quad too.
    expect(hitTest(corners, { x: 100, y: 27 }, 8, 5)).toBe('rotate');
    // A tiny quad: the rotate handle overlaps a corner's tolerance, rotate wins.
    const tiny = clipCorners({ width: 4, height: 4 }, t(), FMT);
    expect(hitTest(tiny, rotateHandlePoint(tiny, 3), 6, 3)).toBe('rotate');
  });

  it('a corner wins over the inside', () => {
    expect(hitTest(corners, { x: 53, y: 28 }, 6)).toBe('scale-tl');
  });

  it('works for rotated quads', () => {
    const turned = clipCorners(SIZE, t({ rotation: 90 }), FMT); // TL (125,0) TR (125,100) BR (75,100) BL (75,0)
    expect(hitTest(turned, { x: 125, y: 2 }, 5)).toBe('scale-tl');
    expect(hitTest(turned, { x: 76, y: 99 }, 5)).toBe('scale-br');
    expect(hitTest(turned, { x: 100, y: 50 }, 5)).toBe('move');
    expect(hitTest(turned, { x: 60, y: 50 }, 5)).toBeNull(); // inside the unrotated quad, outside the turned one
    expect(hitTest(turned, { x: 149, y: 50 }, 5)).toBe('rotate');
    const tilted = clipCorners(SIZE, t({ rotation: 45 }), FMT);
    expect(hitTest(tilted, { x: 100, y: 50 }, 5)).toBe('move');
    expect(hitTest(tilted, { x: 52, y: 27 }, 5)).toBeNull();
  });
});

describe('dragMove', () => {
  it('translates in format px', () => {
    expect(dragMove(t({ x: 5, y: 5, scale: 2 }), 10, -3)).toEqual(t({ x: 15, y: 2, scale: 2 }));
  });

  it('returns the start for non-finite or zero deltas', () => {
    const s = t({ x: 1 });
    expect(dragMove(s, NaN, 1)).toBe(s);
    expect(dragMove(s, 1, Infinity)).toBe(s);
    expect(dragMove(s, 0, 0)).toBe(s);
  });
});

describe('dragScale', () => {
  const start = t({ scale: 1 });
  const tl = clipCorners(SIZE, start, FMT)[0]; // (50, 25), centre (100, 50)

  it('scales uniformly about the clip centre: twice the distance doubles the scale', () => {
    const r = dragScale(start, SIZE, 'scale-tl', tl, { x: 0, y: 0 }, FMT);
    expect(r.scale).toBeCloseTo(2, 9);
    expect([r.x, r.y, r.rotation, r.opacity]).toEqual([0, 0, 0, 1]);
    // Direction does not matter, only the distance from the centre.
    expect(dragScale(start, SIZE, 'scale-br', tl, { x: 125, y: 62.5 }, FMT).scale).toBeCloseTo(0.5, 9);
  });

  it('uses the clip centre, not the canvas centre, for a moved clip', () => {
    const moved = t({ x: 50, scale: 2 });
    const r = dragScale(moved, SIZE, 'scale-br', { x: 160, y: 50 }, { x: 170, y: 50 }, FMT);
    expect(r.scale).toBeCloseTo(4, 9);
    expect(r.x).toBe(50);
  });

  it('clamps to 0.02..20', () => {
    expect(dragScale(start, SIZE, 'scale-tl', tl, { x: 100, y: 50 }, FMT).scale).toBe(0.02);
    expect(dragScale(start, SIZE, 'scale-tl', tl, { x: 100 + 50 * 100, y: 50 }, FMT).scale).toBe(20);
    expect(dragScale(t({ scale: 0 }), SIZE, 'scale-tl', { x: 0, y: 0 }, { x: 10, y: 10 }, FMT).scale).toBe(0.02);
  });

  it('returns the start for a non-scale handle, NaN input or a pointer that started at the centre', () => {
    expect(dragScale(start, SIZE, 'move', tl, { x: 0, y: 0 }, FMT)).toBe(start);
    expect(dragScale(start, SIZE, 'rotate', tl, { x: 0, y: 0 }, FMT)).toBe(start);
    expect(dragScale(start, SIZE, 'scale-tl', tl, { x: NaN, y: 0 }, FMT)).toBe(start);
    expect(dragScale(start, SIZE, 'scale-tl', { x: 100, y: 50 }, { x: 0, y: 0 }, FMT)).toBe(start);
    const broken = t({ scale: NaN });
    expect(dragScale(broken, SIZE, 'scale-tl', tl, { x: 0, y: 0 }, FMT)).toBe(broken);
  });
});

describe('dragRotate', () => {
  const c = { x: 100, y: 50 };

  it('a quarter turn of the pointer clockwise (y down) is +90°, counter-clockwise −90°', () => {
    expect(dragRotate(t(), c, { x: 150, y: 50 }, { x: 100, y: 100 }).rotation).toBeCloseTo(90, 9);
    expect(dragRotate(t(), c, { x: 150, y: 50 }, { x: 100, y: 0 }).rotation).toBeCloseTo(-90, 9);
    expect(dragRotate(t({ rotation: 10 }), c, { x: 100, y: 0 }, { x: 150, y: 50 }).rotation).toBeCloseTo(100, 9);
  });

  it('normalises to (−180, 180]', () => {
    // start 170° + 30° → −160°
    const r = dragRotate(t({ rotation: 170 }), c, { x: 150, y: 50 }, { x: 100 + 50 * Math.cos(Math.PI / 6), y: 50 + 25 });
    expect(r.rotation).toBeCloseTo(-160, 9);
    expect(dragRotate(t({ rotation: 90 }), c, { x: 150, y: 50 }, { x: 100, y: 100 }).rotation).toBeCloseTo(180, 9);
    expect(dragRotate(t({ rotation: -90 }), c, { x: 150, y: 50 }, { x: 100, y: 0 }).rotation).toBeCloseTo(180, 9);
  });

  it('snaps the resulting rotation to multiples of snapDeg', () => {
    const p = { x: 100 + 50 * Math.cos((20 * Math.PI) / 180), y: 50 + 50 * Math.sin((20 * Math.PI) / 180) };
    expect(dragRotate(t(), c, { x: 150, y: 50 }, p).rotation).toBeCloseTo(20, 9);
    expect(dragRotate(t(), c, { x: 150, y: 50 }, p, 15).rotation).toBe(15);
    expect(dragRotate(t({ rotation: 3 }), c, { x: 150, y: 50 }, p, 15).rotation).toBe(30); // 23 → 30
    expect(dragRotate(t({ rotation: 175 }), c, { x: 150, y: 50 }, { x: 150, y: 51 }, 15).rotation).toBe(180);
  });

  it('returns the start for non-finite input or a pointer on the centre', () => {
    const s = t({ rotation: 30 });
    expect(dragRotate(s, c, { x: 150, y: 50 }, { x: NaN, y: 0 })).toBe(s);
    expect(dragRotate(s, c, c, { x: 0, y: 0 })).toBe(s);
    expect(dragRotate(s, c, { x: 150, y: 50 }, c)).toBe(s);
    expect(dragRotate(s, { x: Infinity, y: 0 }, { x: 150, y: 50 }, { x: 0, y: 0 })).toBe(s);
  });
});

describe('snapToCanvas', () => {
  const sq = { width: 40, height: 40 }; // 40×40 at scale 1 in a 200×100 canvas

  it('snaps the centre to the canvas centre within the threshold', () => {
    expect(snapToCanvas(t({ x: 3, y: -4 }), sq, FMT, 5)).toEqual(t());
  });

  it('snaps edges to the canvas edges and centre lines', () => {
    // left edge at 100 - 20 + (-77) = 3 → 0
    expect(snapToCanvas(t({ x: -77 }), sq, FMT, 5)).toEqual(t({ x: -80 }));
    // right edge at 100 + 20 + 77 = 197 → 200
    expect(snapToCanvas(t({ x: 77 }), sq, FMT, 5)).toEqual(t({ x: 80 }));
    // left edge at 100 + 23 - 20 = 103 → the vertical centre line 100
    expect(snapToCanvas(t({ x: 23 }), sq, FMT, 5)).toEqual(t({ x: 20 }));
    // bottom edge at 50 + 26 + 20 = 96 → 100
    expect(snapToCanvas(t({ y: 26 }), sq, FMT, 5)).toEqual(t({ y: 30 }));
  });

  it('uses the axis-aligned bounding box of a rotated clip', () => {
    // 45°: half-diagonal 20√2 ≈ 28.28; left AABB edge at 100 + x − 28.28.
    const r = snapToCanvas(t({ rotation: 45, x: -70 }), sq, FMT, 3);
    expect(r.x).toBeCloseTo(-100 + 20 * Math.SQRT2, 9); // AABB left edge exactly on 0
    // 90° on a non-square: the AABB is 50 wide, 100 tall.
    const turned = snapToCanvas(t({ rotation: 90, y: 2, x: 74 }), SIZE, FMT, 3);
    expect(turned.y).toBe(0); // centre snap
    expect(turned.x).toBeCloseTo(75, 9); // right edge 100 + 74 + 25 = 199 → 200
  });

  it('x and y snap independently; centre wins over edges', () => {
    const r = snapToCanvas(t({ x: 2, y: 13 }), sq, FMT, 3); // y: nothing within 3 (top edge 43, bottom 83)
    expect(r).toEqual(t({ x: 0, y: 13 }));
    // A clip 100 wide: centre 2 px off and an edge 2 px off at once → centre wins.
    expect(snapToCanvas(t({ x: 2 }), { width: 100, height: 10 }, FMT, 3).x).toBe(0);
  });

  it('returns the same transform object when nothing snaps or for bad input', () => {
    const far = t({ x: 30, y: 13 });
    expect(snapToCanvas(far, sq, FMT, 3)).toBe(far);
    const centred = t();
    expect(snapToCanvas(centred, sq, FMT, 3)).toBe(centred);
    const bad = t({ x: NaN });
    expect(snapToCanvas(bad, sq, FMT, 3)).toBe(bad);
    expect(snapToCanvas(far, sq, FMT, NaN)).toBe(far);
  });
});
