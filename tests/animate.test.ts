import { describe, it, expect } from 'vitest';
import { isAnimated, resolveClip, resolvedTransform } from '../src/core/animate';
import { easeAt } from '../src/core/easing';
import type { Ease } from '../src/core/easing';
import { defaultClipAudio } from '../src/core/model';
import type { Clip, Keyframe, VideoEffect } from '../src/core/model';

const lin: Ease = { kind: 'linear' };
const back: Ease = { kind: 'back' };
const k = (t: number, v: number, ease: Ease = lin): Keyframe => ({ t, v, ease });

const fx = (extra: Partial<VideoEffect> = {}): VideoEffect => ({
  id: 'e1', type: 'colour', enabled: true,
  params: { brightness: 0.1, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, hue: 0, shadows: 0, highlights: 0 },
  ...extra,
});

const clip = (extra: Partial<Clip> = {}): Clip => ({
  id: 'c', mediaId: 'm', kind: 'video', start: 10, in: 0, out: 4, transform: { x: 5, y: 6, scale: 1.5, rotation: 30, opacity: 0.8 },
  volume: 1, fit: 'fit', audio: defaultClipAudio(), effects: [fx()], blend: 'normal', ...extra,
});

const FPS = 30;
const FMT = { width: 1920, height: 1080, fps: FPS };

describe('isAnimated', () => {
  it('false for a clip without keys, with an empty keys object or only empty lists', () => {
    expect(isAnimated(clip())).toBe(false);
    expect(isAnimated(clip({ keys: {} }))).toBe(false);
    expect(isAnimated(clip({ keys: { scale: [], position: [] } }))).toBe(false);
    expect(isAnimated(clip({ effects: [fx({ keys: {} }), fx({ id: 'e2', keys: { brightness: [] } })] }))).toBe(false);
  });
  it('true with one key on any transform property or effect param', () => {
    expect(isAnimated(clip({ keys: { opacity: [k(0, 1)] } }))).toBe(true);
    expect(isAnimated(clip({ keys: { position: [{ t: 0, x: 0, y: 0, ease: lin }] } }))).toBe(true);
    expect(isAnimated(clip({ effects: [fx({ keys: { brightness: [k(0, 0.5)] } })] }))).toBe(true);
  });
});

describe('resolveClip', () => {
  it('returns the SAME object for a static clip', () => {
    for (const c of [clip(), clip({ keys: {} }), clip({ kind: 'overlay', effects: [] }), clip({ keys: { rotation: [] } })]) {
      expect(resolveClip(c, 11, FMT)).toBe(c);
      expect(resolvedTransform(c, 11, FPS)).toBe(c.transform);
    }
  });

  it('evaluates every transform property at the snapped clip-local time and drops keys', () => {
    const c = clip({
      keys: {
        position: [{ t: 0, x: 0, y: 0, ease: lin }, { t: 2, x: 100, y: -50, ease: lin }],
        scale: [k(0, 1), k(2, 3)],
        rotation: [k(0, 0), k(2, 720)],
        opacity: [k(0, 0), k(2, 1)],
      },
    });
    const r = resolveClip(c, 11 + 0.01, FMT); // local 1 s (between-frame time snaps to the frame start)
    expect(r).not.toBe(c);
    expect(r.keys).toBeUndefined();
    expect('keys' in r).toBe(false);
    expect(r.transform.x).toBeCloseTo(50, 12);
    expect(r.transform.y).toBeCloseTo(-25, 12);
    expect(r.transform.scale).toBeCloseTo(2, 12);
    expect(r.transform.rotation).toBeCloseTo(360, 12);
    expect(r.transform.opacity).toBeCloseTo(0.5, 12);
    expect(r.effects).toBe(c.effects); // no effect keys: the stack is shared
    const { keys: _k, ...rest } = c;
    expect({ ...r, transform: c.transform }).toStrictEqual(rest);
  });

  it('only animated transform properties change; static ones keep the stored value', () => {
    const c = clip({ keys: { opacity: [k(0, 0), k(4, 1)] } });
    const t = resolvedTransform(c, 12, FPS);
    expect(t).toEqual({ x: 5, y: 6, scale: 1.5, rotation: 30, opacity: 0.5 });
  });

  it('sourced clips evaluate at in + offset; sourceless at the offset', () => {
    const keys = { opacity: [k(0, 0), k(4, 1)] };
    expect(resolveClip(clip({ in: 2, out: 6, keys }), 11, FMT).transform.opacity).toBeCloseTo(0.75, 12);
    expect(resolveClip(clip({ kind: 'overlay', in: 2, out: 6, effects: [], keys }), 11, FMT).transform.opacity).toBeCloseTo(0.25, 12);
  });

  it('evaluates effect params, keeps other params, drops effect keys and never mutates the input', () => {
    const e = fx({ keys: { brightness: [k(0, -0.5), k(2, 0.5)], hue: [k(0, 90)] } });
    const other = fx({ id: 'e2', type: 'bw', params: { amount: 1 } });
    const c = clip({ effects: [e, other] });
    const snap = JSON.stringify(c);
    const r = resolveClip(c, 11, FMT);
    expect(JSON.stringify(c)).toBe(snap);
    expect(r.transform).toBe(c.transform);
    expect(r.effects[0].params.brightness).toBeCloseTo(0, 12);
    expect(r.effects[0].params.hue).toBe(90);
    expect(r.effects[0].params.contrast).toBe(0);
    expect('keys' in r.effects[0]).toBe(false);
    expect(r.effects[1]).toBe(other);
  });

  it('clamps opacity, scale and effect params under back overshoot; rotation and position stay unclamped', () => {
    const c = clip({
      keys: {
        opacity: [k(0, 0, back), k(1, 1)],
        scale: [k(0, 1, back), k(1, 0)],
        rotation: [k(0, 0, back), k(1, 90)],
        position: [{ t: 0, x: 0, y: 0, ease: back }, { t: 1, x: 100, y: 100, ease: lin }],
      },
      effects: [fx({ keys: { brightness: [k(0, 0, back), k(1, 1)], hue: [k(0, 0, back), k(1, -180)] } })],
    });
    const local = 0.6;
    const over = easeAt(back, local);
    expect(over).toBeGreaterThan(1);
    const r = resolveClip(c, 10 + local, FMT);
    expect(r.transform.opacity).toBe(1);
    expect(r.transform.scale).toBe(0);
    expect(r.transform.rotation).toBeCloseTo(90 * over, 9);
    expect(r.transform.rotation).toBeGreaterThan(90);
    expect(r.transform.x).toBeGreaterThan(100);
    expect(r.effects[0].params.brightness).toBe(1);
    expect(r.effects[0].params.hue).toBe(-180);
  });

  it('ignores keys on a non-animatable param (mirror.mode) and unknown params', () => {
    const m = { id: 'm1', type: 'mirror', enabled: true, params: { mode: 2 }, keys: { mode: [k(0, 0)], nope: [k(0, 1)] } } as VideoEffect;
    const r = resolveClip(clip({ effects: [m] }), 11, FMT);
    expect(r.effects[0].params).toEqual({ mode: 2 });
    expect('keys' in r.effects[0]).toBe(false);
  });

  it('is deterministic: the same (clip, t) gives equal results', () => {
    const c = clip({ keys: { scale: [k(0, 1, { kind: 'elastic' }), k(3, 2)] } });
    expect(resolveClip(c, 11.3, { ...FMT, fps: 25 })).toEqual(resolveClip(c, 11.3, { ...FMT, fps: 25 }));
  });
});
