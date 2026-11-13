// Plan 5B Task 3 (D4): key loops vs a hand-computed oracle (repeat, ping-pong, continue/offset), counts, inert cases,
// and the resolver / inspector reading looped values through the ONE evaluator.
import { describe, expect, it } from 'vitest';
import { resolveClip, resolvedTransform } from '../src/core/animate';
import { targetValueAt, valueAtLocal } from '../src/core/animTargets';
import { evalKeys, evalPositionKeys, loopedTime } from '../src/core/keyLoops';
import { valueAt } from '../src/core/keyframes';
import type { KeyLoop } from '../src/core/model';
import type { LoopMode } from '../src/core/keyTypes';
import { colourFx, k, mk, pk } from './keyframe-fixtures';

const loop = (mode: LoopMode, count: number | null = null): KeyLoop => ({ mode, count });
/** f on [1, 3]: 0 at 1, 10 at 2, 4 at 3 (linear). Period 2, last − first = 4. */
const LIST = [k(1, 0), k(2, 10), k(3, 4)];
const TIMES = [0, 1, 1.5, 2, 2.5, 3, 3.25, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.75, 9, 10];
// Hand-computed (cycle c ≥ 1 covers (1 + 2c, 3 + 2c]; ping-pong plays odd cycles backwards; offset adds 4 per cycle).
const ORACLE: Record<LoopMode, number[]> = {
  repeat: [0, 0, 5, 10, 7, 4, 2.5, 5, 10, 7, 4, 5, 10, 7, 4, 5, 10, 5.5, 4, 10],
  pingPong: [0, 0, 5, 10, 7, 4, 5.5, 7, 10, 5, 0, 5, 10, 7, 4, 7, 10, 2.5, 0, 10],
  offset: [0, 0, 5, 10, 7, 4, 6.5, 9, 14, 11, 8, 13, 18, 15, 12, 17, 22, 17.5, 16, 26],
};

describe('loopedTime / evalKeys (D4)', () => {
  for (const mode of ['repeat', 'pingPong', 'offset'] as const) {
    it(`${mode}: 20 times across 3 cycles equal the hand-computed oracle`, () => {
      TIMES.forEach((u, i) => expect(evalKeys(LIST, loop(mode), u, -Infinity, Infinity), `u=${u}`).toBeCloseTo(ORACLE[mode][i], 12));
    });
  }

  it('loopedTime reports the mapped time, the cycle and the direction', () => {
    expect(loopedTime(LIST, loop('repeat'), 2.5)).toEqual({ u: 2.5, cycle: 0, reverse: false });
    expect(loopedTime(LIST, loop('repeat'), 3)).toEqual({ u: 3, cycle: 0, reverse: false });
    expect(loopedTime(LIST, loop('repeat'), 0)).toEqual({ u: 0, cycle: 0, reverse: false });
    expect(loopedTime(LIST, loop('repeat'), 3.25)).toEqual({ u: 1.25, cycle: 1, reverse: false });
    expect(loopedTime(LIST, loop('repeat'), 5)).toEqual({ u: 3, cycle: 1, reverse: false });
    expect(loopedTime(LIST, loop('pingPong'), 3.25)).toEqual({ u: 2.75, cycle: 1, reverse: true });
    expect(loopedTime(LIST, loop('pingPong'), 5.5)).toEqual({ u: 1.5, cycle: 2, reverse: false });
    expect(loopedTime(LIST, loop('offset'), 8.75)).toEqual({ u: 2.75, cycle: 3, reverse: false });
  });

  it('count stops looping exactly after the counted cycles; the value at that end holds', () => {
    // count 1: one cycle after the first, i.e. looping until u = 5; count 2: until u = 7.
    const at = (mode: LoopMode, count: number, u: number) => evalKeys(LIST, loop(mode, count), u, -Infinity, Infinity);
    expect(at('repeat', 1, 4.5)).toBeCloseTo(7, 12);
    expect(at('repeat', 1, 5)).toBe(4);
    expect(at('repeat', 1, 5.5)).toBe(4);
    expect(at('repeat', 1, 100)).toBe(4);
    expect(at('repeat', 2, 5.5)).toBeCloseTo(5, 12);
    expect(at('repeat', 2, 7)).toBe(4);
    expect(at('repeat', 2, 7.5)).toBe(4);
    expect(at('pingPong', 1, 4.5)).toBeCloseTo(5, 12);
    expect(at('pingPong', 1, 5.5)).toBe(0);
    expect(at('pingPong', 2, 6.5)).toBeCloseTo(7, 12);
    expect(at('pingPong', 2, 7.5)).toBe(4);
    expect(at('offset', 1, 5.5)).toBe(8);
    expect(at('offset', 2, 7.5)).toBe(12);
    expect(at('offset', 3, 1e6)).toBe(16);
    expect(loopedTime(LIST, loop('pingPong', 1), 50)).toEqual({ u: 1, cycle: 1, reverse: true });
    expect(loopedTime(LIST, loop('repeat', 2), 50)).toEqual({ u: 3, cycle: 2, reverse: false });
    // null = until the clip end (unbounded here).
    expect(evalKeys(LIST, loop('offset', null), 1001, -Infinity, Infinity)).toBe(2000);
  });

  it('fewer than two keys: the loop is inert; before the first key the first value holds', () => {
    for (const mode of ['repeat', 'pingPong', 'offset'] as const) {
      expect(evalKeys([k(1, 7)], loop(mode), 5, -Infinity, Infinity)).toBe(7);
      expect(loopedTime([k(1, 7)], loop(mode), 5)).toEqual({ u: 5, cycle: 0, reverse: false });
      expect(evalKeys(LIST, loop(mode), 0.2, -Infinity, Infinity)).toBe(0);
      expect(evalKeys(LIST, loop(mode), -50, -Infinity, Infinity)).toBe(0);
    }
  });

  it('no loop = valueAt exactly (same clamps), any ease', () => {
    const list = [k(0, 0, { kind: 'back' }), k(1, 1, { kind: 'spring', spring: { stiffness: 180, damping: 8, mass: 1 } }), k(1.7, 0.2)];
    for (let i = -10; i <= 40; i++) {
      const u = i / 15;
      expect(evalKeys(list, undefined, u, 0, 1)).toBe(valueAt(list, u, 0, 1));
      expect(evalKeys(list, undefined, u, -Infinity, Infinity)).toBe(valueAt(list, u));
    }
  });

  it('eased lists loop the eased curve (repeat/pingPong/offset = valueAt at the mapped time, + offset)', () => {
    const list = [k(0.5, 2, { kind: 'easeInOut' }), k(1.25, 9, { kind: 'bounce' }), k(2, -3)];
    for (const mode of ['repeat', 'pingPong', 'offset'] as const) {
      for (let i = 0; i < 60; i++) {
        const u = 0.3 + i * 0.13;
        const m = loopedTime(list, loop(mode), u);
        const want = valueAt(list, m.u) + (mode === 'offset' ? m.cycle * -5 : 0);
        expect(evalKeys(list, loop(mode), u, -Infinity, Infinity)).toBeCloseTo(want, 12);
      }
    }
  });

  it('offset accumulates on rotation 0 → 360: 2.5 periods after the first key = 900°', () => {
    const rot = [k(0, 0), k(2, 360)];
    expect(evalKeys(rot, loop('offset'), 5, -Infinity, Infinity)).toBe(900);
    expect(evalKeys(rot, loop('offset'), 7, -Infinity, Infinity)).toBe(1260);
  });

  it('the value is clamped AFTER the offset (min/max), not before', () => {
    expect(evalKeys([k(0, 0), k(1, 0.4)], loop('offset'), 2.5, 0, 1)).toBe(1);
    expect(evalKeys([k(0, 0), k(1, 0.4)], loop('offset'), 1.5, 0, 1)).toBeCloseTo(0.6, 12);
    expect(evalKeys([k(0, 1), k(1, 0.6)], loop('offset'), 3.5, 0, 1)).toBe(0);
    // A base value over the range (a `back` overshoot) brought back by a negative offset: clamped only at the end.
    const over = [k(0, 0.9, { kind: 'back' }), k(1, 1), k(2, 0.3)];
    expect(valueAt(over, 0.9)).toBeGreaterThan(1);
    expect(evalKeys(over, loop('offset'), 2.9, 0, 1)).toBeCloseTo(valueAt(over, 0.9) - 0.6, 12);
  });

  it('position loops: repeat / pingPong per point, offset per axis', () => {
    const list = [pk(0, 0, 0), pk(1, 100, -40)];
    expect(evalPositionKeys(list, loop('repeat'), 1.25)).toEqual({ x: 25, y: -10 });
    expect(evalPositionKeys(list, loop('pingPong'), 1.25)).toEqual({ x: 75, y: -30 });
    expect(evalPositionKeys(list, loop('offset'), 2.5)).toEqual({ x: 250, y: -100 });
    expect(evalPositionKeys(list, loop('offset', 1), 9)).toEqual({ x: 200, y: -80 });
    expect(evalPositionKeys(list, undefined, 2.5)).toEqual({ x: 100, y: -40 });
    expect(evalPositionKeys([pk(0, 3, 4)], loop('offset'), 2.5)).toEqual({ x: 3, y: 4 });
  });
});

describe('the resolver and the inspector read looped values (one evaluator)', () => {
  const FMT = { width: 1920, height: 1080, fps: 4 }; // quarter-second frames: the test times are frame starts
  // Sourced clip at 10 s with in = 2: local time u = 2 + (t − 10).
  const clip = mk('c', {
    keys: {
      position: [pk(2, 0, 0), pk(2.5, 100, 50)], scale: [k(2, 1), k(2.5, 2)], rotation: [k(2, 0), k(2.5, 90)],
      opacity: [k(2, 0.2), k(2.5, 0.8)],
      loops: { position: loop('offset'), scale: loop('pingPong'), rotation: loop('offset', 2), opacity: loop('offset') },
    },
    effects: [colourFx('fx', { keys: { hue: [k(2, 0), k(2.5, 100)], brightness: [k(2, 0), k(3, 0.5)] }, loops: { hue: loop('offset'), brightness: loop('repeat') } })],
  });

  it('resolvedTransform applies each property loop with its clamp (t = 10.75 ⇒ u = 2.75, 1.5 periods)', () => {
    const tr = resolvedTransform(clip, 10.75, 4);
    expect(tr.x).toBeCloseTo(150, 9);
    expect(tr.y).toBeCloseTo(75, 9);
    expect(tr.scale).toBeCloseTo(1.5, 9); // ping-pong, halfway back
    expect(tr.rotation).toBeCloseTo(135, 9);
    expect(tr.opacity).toBe(1); // 0.2 + 0.6 + 0.3 = 1.1 clamped
    expect(resolvedTransform(clip, 20, 4).rotation).toBe(270); // count 2 holds after 3 periods
  });

  it('effect param loops clamp to the schema (hue −180..180) and the resolved clip carries no keys or loops', () => {
    const r = resolveClip(clip, 10.75, FMT);
    expect(r.effects[0].params.hue).toBe(150);
    expect(resolveClip(clip, 11, FMT).effects[0].params.hue).toBe(180); // 200 clamped
    expect(resolveClip(clip, 11.25, FMT).effects[0].params.brightness).toBeCloseTo(0.125, 9);
    expect(r.keys).toBeUndefined();
    expect(r.effects[0].keys).toBeUndefined();
    expect(r.effects[0].loops).toBeUndefined();
  });

  it('the inspector value at the playhead equals the resolver for every looped target', () => {
    for (const t of [10, 10.2, 10.75, 11.1, 12.9, 13.5]) {
      const tr = resolvedTransform(clip, t, 4);
      expect(targetValueAt(clip, { kind: 'transform', prop: 'position' }, t, 4)).toEqual({ x: tr.x, y: tr.y });
      for (const prop of ['scale', 'rotation', 'opacity'] as const) expect(targetValueAt(clip, { kind: 'transform', prop }, t, 4)).toBe(tr[prop]);
      const r = resolveClip(clip, t, FMT);
      for (const param of ['hue', 'brightness']) {
        expect(targetValueAt(clip, { kind: 'effect', effectId: 'fx', param }, t, 4)).toBe(r.effects[0].params[param]);
      }
    }
    expect(valueAtLocal(clip, { kind: 'transform', prop: 'rotation' }, 2.75)).toBeCloseTo(135, 9);
  });

  it('a clip whose keys carry no loops resolves exactly as before (same values)', () => {
    const { loops: _l, ...plain } = clip.keys!;
    const bare = { ...clip, keys: plain, effects: [{ ...clip.effects[0], loops: undefined }] };
    const tr = resolvedTransform(bare, 10.75, 4);
    expect(tr).toEqual({ x: 100, y: 50, scale: 2, rotation: 90, opacity: 0.8 });
  });
});
