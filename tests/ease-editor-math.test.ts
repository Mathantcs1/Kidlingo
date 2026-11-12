import { describe, expect, it } from 'vitest';
import { EASE_PRESETS, easeAt } from '../src/core/easing';
import {
  FRAME, LINEAR_HANDLES, bezierOf, clampHandle, clientToSvg, curvePath, fromSvg, nudgeHandle, parseField, round3, toSvg, withHandle,
} from '../src/ui/easeEditorMath';

describe('handle <-> SVG coordinates', () => {
  it('maps the unit square corners and the y range ends', () => {
    expect(toSvg({ x: 0, y: 0 })).toEqual({ px: FRAME.pad, py: FRAME.pad + 2 * FRAME.sy });
    expect(toSvg({ x: 1, y: 1 })).toEqual({ px: FRAME.pad + FRAME.sx, py: FRAME.pad + FRAME.sy });
    expect(toSvg({ x: 0.5, y: 2 }).py).toBe(FRAME.pad);
    expect(toSvg({ x: 0.5, y: -1 }).py).toBe(FRAME.pad + 3 * FRAME.sy);
  });
  it('round trips handles exactly enough (within 1e-9) over the whole range', () => {
    for (let x = 0; x <= 1; x += 0.125) {
      for (let y = -1; y <= 2; y += 0.25) {
        const p = toSvg({ x, y });
        const h = fromSvg(p.px, p.py);
        expect(h.x).toBeCloseTo(x, 9);
        expect(h.y).toBeCloseTo(y, 9);
      }
    }
  });
  it('clamps points outside the plot: x to [0, 1], y to [-1, 2]', () => {
    expect(fromSvg(-500, -500)).toEqual({ x: 0, y: 2 });
    expect(fromSvg(5000, 5000)).toEqual({ x: 1, y: -1 });
    expect(clampHandle({ x: 1.4, y: -7 })).toEqual({ x: 1, y: -1 });
    expect(clampHandle({ x: -0.2, y: 9 })).toEqual({ x: 0, y: 2 });
    expect(clampHandle({ x: Number.NaN, y: Number.POSITIVE_INFINITY })).toEqual({ x: 0, y: 2 });
  });
  it('converts client coordinates through the rendered size of the SVG (scaled viewBox)', () => {
    const w = FRAME.sx + 2 * FRAME.pad;
    const rect = { left: 100, top: 50, width: w * 2, height: 2 * (3 * FRAME.sy + 2 * FRAME.pad) };
    expect(clientToSvg(100 + 2 * FRAME.pad, 50 + 2 * FRAME.pad, rect)).toEqual({ px: FRAME.pad, py: FRAME.pad });
  });
});

describe('nudge and rounding', () => {
  it('moves by 0.01 (0.1 with shift) without float drift and clamps', () => {
    expect(nudgeHandle({ x: 0.42, y: 0 }, 'ArrowRight', false)).toEqual({ x: 0.43, y: 0 });
    expect(nudgeHandle({ x: 0.42, y: 0 }, 'ArrowLeft', true)).toEqual({ x: 0.32, y: 0 });
    expect(nudgeHandle({ x: 0.5, y: 0.5 }, 'ArrowUp', false)).toEqual({ x: 0.5, y: 0.51 });
    expect(nudgeHandle({ x: 0.5, y: 0.5 }, 'ArrowDown', false)).toEqual({ x: 0.5, y: 0.49 });
    expect(nudgeHandle({ x: 0.995, y: 1.999 }, 'ArrowRight', false)).toEqual({ x: 1, y: 1.999 });
    expect(nudgeHandle({ x: 0.995, y: 1.999 }, 'ArrowUp', false)).toEqual({ x: 0.995, y: 2 });
    expect(nudgeHandle({ x: 0, y: -1 }, 'ArrowLeft', false)).toEqual({ x: 0, y: -1 });
    let h = { x: 0.1, y: 0.1 };
    for (let i = 0; i < 30; i++) h = nudgeHandle(h, 'ArrowRight', false)!;
    expect(h.x).toBe(0.4);
  });
  it('ignores other keys', () => {
    expect(nudgeHandle({ x: 0.5, y: 0.5 }, 'a', false)).toBeNull();
  });
  it('round3 and parseField', () => {
    expect(round3(0.12345)).toBe(0.123);
    expect(parseField(' 0.5 ')).toBe(0.5);
    expect(parseField('1,5')).toBe(1.5);
    expect(parseField('')).toBeNull();
    expect(parseField('abc')).toBeNull();
    expect(parseField('Infinity')).toBeNull();
  });
});

describe('curves', () => {
  it('bezierOf gives handles for linear and the CSS presets and null for the others', () => {
    expect(bezierOf({ kind: 'easeIn' })).toEqual(EASE_PRESETS.easeIn);
    expect(bezierOf({ kind: 'bezier', bezier: [0.1, 0.2, 0.3, 0.4] })).toEqual([0.1, 0.2, 0.3, 0.4]);
    for (const k of ['hold', 'back', 'elastic', 'bounce'] as const) expect(bezierOf({ kind: k })).toBeNull();
    const [a, b, c, d] = bezierOf({ kind: 'linear' })!;
    expect([a, b, c, d]).toEqual(LINEAR_HANDLES);
    for (const u of [0.1, 0.5, 0.9]) expect(easeAt({ kind: 'bezier', bezier: LINEAR_HANDLES }, u)).toBeCloseTo(u, 6);
  });
  it('withHandle replaces one handle only', () => {
    expect(withHandle([0.1, 0.2, 0.3, 0.4], 1, { x: 0.5, y: 0.6 })).toEqual([0.5, 0.6, 0.3, 0.4]);
    expect(withHandle([0.1, 0.2, 0.3, 0.4], 2, { x: 0.5, y: 0.6 })).toEqual([0.1, 0.2, 0.5, 0.6]);
  });
  it('curvePath samples easeAt; hold is a step at the end', () => {
    const lin = curvePath({ kind: 'linear' }, FRAME, 4);
    expect(lin.startsWith(`M${FRAME.pad} ${FRAME.pad + 2 * FRAME.sy}`)).toBe(true);
    expect(lin.split('L').length).toBe(5);
    const hold = curvePath({ kind: 'hold' }, FRAME);
    expect(hold).toBe(`M${FRAME.pad} ${FRAME.pad + 2 * FRAME.sy}H${FRAME.pad + FRAME.sx}V${FRAME.pad + FRAME.sy}`);
  });
});
