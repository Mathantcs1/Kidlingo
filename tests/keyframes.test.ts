import { describe, it, expect } from 'vitest';
import { KEY_EPS, MAX_KEYS, localTime, tooClose, maxScale, positionAt, valueAt } from '../src/core/keyframes';
import { easeAt } from '../src/core/easing';
import type { Ease } from '../src/core/easing';
import { defaultClipAudio, defaultTransform } from '../src/core/model';
import type { Clip, Keyframe, PositionKeyframe } from '../src/core/model';

const lin: Ease = { kind: 'linear' };
const k = (t: number, v: number, ease: Ease = lin): Keyframe => ({ t, v, ease });
const pk = (t: number, x: number, y: number, ease: Ease = lin): PositionKeyframe => ({ t, x, y, ease });

const clip = (extra: Partial<Clip> = {}): Clip => ({
  id: 'c', mediaId: 'm', kind: 'video', start: 10, in: 2, out: 6, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});

/** mulberry32: a seeded generator so the property tests are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('constants', () => {
  it('KEY_EPS and MAX_KEYS', () => {
    expect(KEY_EPS).toBe(1e-4);
    expect(MAX_KEYS).toBe(500);
  });

  it('tooClose: the one "same key time" rule (symmetric, strictly below KEY_EPS)', () => {
    expect(tooClose(1, 1)).toBe(true);
    expect(tooClose(1, 1 + KEY_EPS / 2)).toBe(true);
    expect(tooClose(1 + KEY_EPS / 2, 1)).toBe(true);
    expect(tooClose(1, 1 + 2 * KEY_EPS)).toBe(false);
    expect(tooClose(1 + 2 * KEY_EPS, 1)).toBe(false);
    expect(tooClose(0, 0.5)).toBe(false);
  });
});

describe('valueAt', () => {
  const keys = [k(1, 10), k(2, 20), k(4, 0)];
  it('before the first key: the first value; after the last: the last value', () => {
    expect(valueAt(keys, -5)).toBe(10);
    expect(valueAt(keys, 0.999)).toBe(10);
    expect(valueAt(keys, 4)).toBe(0);
    expect(valueAt(keys, 100)).toBe(0);
  });
  it('exactly the key value at every key', () => {
    for (const key of keys) expect(valueAt(keys, key.t)).toBe(key.v);
  });
  it('interpolates linearly between keys', () => {
    expect(valueAt(keys, 1.5)).toBeCloseTo(15, 12);
    expect(valueAt(keys, 3)).toBeCloseTo(10, 12);
    expect(valueAt(keys, 3.5)).toBeCloseTo(5, 12);
  });
  it('a single key is a constant', () => {
    for (const u of [-1, 0, 3, 1e9]) expect(valueAt([k(3, 7)], u)).toBe(7);
  });
  it('an empty list reads NaN (callers only evaluate animated properties)', () => {
    expect(valueAt([], 1)).toBeNaN();
  });
  it('hold steps exactly at the next key', () => {
    const h = [k(0, 0, { kind: 'hold' }), k(1, 1)];
    expect(valueAt(h, 0.5)).toBe(0);
    expect(valueAt(h, 1 - 1e-12)).toBe(0);
    expect(valueAt(h, 1)).toBe(1);
  });
  it('applies the ease of the segment that starts at a key to the time fraction', () => {
    const e: Ease = { kind: 'easeIn' };
    const list = [k(0, 100, e), k(2, 200)];
    expect(valueAt(list, 0.5)).toBeCloseTo(100 + 100 * easeAt(e, 0.25), 12);
    expect(valueAt(list, 1.5)).toBeCloseTo(100 + 100 * easeAt(e, 0.75), 12);
    // The last key's ease is unused.
    expect(valueAt([k(0, 0), k(1, 1, { kind: 'hold' })], 0.5)).toBeCloseTo(0.5, 12);
  });
  it('clamps the VALUE (not the fraction) to the given range', () => {
    const back = [k(0, 0, { kind: 'back' }), k(1, 1)];
    const raw = valueAt(back, 0.6);
    expect(raw).toBeGreaterThan(1);
    expect(valueAt(back, 0.6, 0, 1)).toBe(1);
    expect(valueAt([k(0, 1, { kind: 'back' }), k(1, 0)], 0.6, 0, 1)).toBe(0);
    expect(valueAt([k(0, 5)], 0, 0, 1)).toBe(1);
  });
  it('binary search equals a linear scan on 500 keys (property test)', () => {
    const r = rng(42);
    const kinds: Ease['kind'][] = ['linear', 'hold', 'easeIn', 'easeOut', 'easeInOut', 'back', 'elastic', 'bounce'];
    const list: Keyframe[] = [];
    let t = -3;
    for (let i = 0; i < 500; i++) {
      t += 0.001 + r() * 0.2;
      list.push(k(t, r() * 200 - 100, { kind: kinds[Math.floor(r() * kinds.length)] }));
    }
    const scan = (u: number): number => {
      if (u <= list[0].t) return list[0].v;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].t <= u) {
          if (i === list.length - 1) return list[i].v;
          const a = list[i];
          const b = list[i + 1];
          return a.v + (b.v - a.v) * easeAt(a.ease, (u - a.t) / (b.t - a.t));
        }
      }
      return list[0].v;
    };
    for (let n = 0; n < 2000; n++) {
      const u = -4 + r() * (t + 6);
      expect(valueAt(list, u)).toBe(scan(u));
    }
    for (const key of list) expect(valueAt(list, key.t)).toBe(key.v);
  });
});

describe('positionAt', () => {
  it('uses ONE eased fraction for x and y', () => {
    const e: Ease = { kind: 'easeOut' };
    const list = [pk(0, 0, 100, e), pk(1, 200, -100)];
    const f = easeAt(e, 0.3);
    const p = positionAt(list, 0.3);
    expect(p.x).toBeCloseTo(200 * f, 12);
    expect(p.y).toBeCloseTo(100 - 200 * f, 12);
  });
  it('is exact at keys and constant outside them; a single key is constant', () => {
    const list = [pk(1, 5, 6), pk(2, 7, 8, { kind: 'hold' }), pk(3, 9, 10)];
    expect(positionAt(list, 0)).toEqual({ x: 5, y: 6 });
    expect(positionAt(list, 2)).toEqual({ x: 7, y: 8 });
    expect(positionAt(list, 2.99)).toEqual({ x: 7, y: 8 });
    expect(positionAt(list, 3)).toEqual({ x: 9, y: 10 });
    expect(positionAt(list, 9)).toEqual({ x: 9, y: 10 });
    expect(positionAt([pk(4, -1, -2)], 0)).toEqual({ x: -1, y: -2 });
  });
  it('is unclamped under overshoot', () => {
    const p = positionAt([pk(0, 0, 0, { kind: 'back' }), pk(1, 100, 100)], 0.6);
    expect(p.x).toBeGreaterThan(100);
    expect(p.y).toBeGreaterThan(100);
  });
});

describe('localTime (D3)', () => {
  it('sourced clips: in + snapped (t - start)', () => {
    const c = clip();
    expect(localTime(c, 10, 30)).toBe(2);
    expect(localTime(c, 11, 30)).toBe(3);
    expect(localTime({ ...c, kind: 'image' }, 11, 30)).toBe(3);
  });
  it('sourceless clips (overlay, adjustment) ignore in', () => {
    expect(localTime(clip({ kind: 'overlay' }), 11, 30)).toBe(1);
    expect(localTime(clip({ kind: 'adjustment' }), 11.52, 25)).toBe(38 / 25);
  });
  it('snaps a time between frames to the frame start (fps 25 and 30)', () => {
    const c = clip({ kind: 'overlay', start: 0 });
    expect(localTime(c, 0.05, 25)).toBe(0.04);
    expect(localTime(c, 0.079, 25)).toBe(0.04);
    expect(localTime(c, 0.08, 25)).toBe(0.08);
    expect(localTime(c, 1 / 30 + 0.01, 30)).toBe(1 / 30);
    expect(localTime(c, 2 / 30 - 1e-9, 30)).toBe(2 / 30);
    expect(localTime(clip({ start: 0 }), 0.05, 25)).toBe(2 + 1 / 25);
  });
  it('before the clip start reads the clip start', () => {
    expect(localTime(clip(), 5, 30)).toBe(2);
  });
});

describe('maxScale', () => {
  it('is the static scale without scale keys', () => {
    expect(maxScale(clip({ transform: { ...defaultTransform(), scale: 1.7 } }))).toBe(1.7);
  });
  it('is the max of the static scale and every scale key', () => {
    const c = clip({ transform: { ...defaultTransform(), scale: 1 }, keys: { scale: [k(0, 0.5), k(1, 3), k(2, 2)] } });
    expect(maxScale(c)).toBe(3);
    expect(maxScale({ ...c, transform: { ...c.transform, scale: 4 } })).toBe(4);
    expect(maxScale(clip({ keys: { scale: [] } }))).toBe(1);
  });
});
