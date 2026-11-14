// Plan 5B Task 5: stack timing (D2) on the clip's frame grid, the blending rule (D3), the clamps, maxMotionScale and the
// resolver's fast path / composition (resolveClip).
import { describe, expect, it } from 'vitest';
import { resolveClip, resolvedTransform } from '../src/core/animate';
import { blendOffsets, composeMotion, maxMotionScale, motionAt, motionWindows } from '../src/core/motion';
import type { Clip } from '../src/core/model';
import type { ClipMotion, EmphasisUse, LoopUse, MotionOffsets, MotionSlot, PresetUse } from '../src/core/motionTypes';
import { presetMaxScale, presetOffsets } from '../src/core/presetMath';
import { presetEase, presetParams } from '../src/core/presets';
import type { PresetKey } from '../src/core/motionTypes';
import { clipMatrix } from '../src/render/geometry';
import { k, mk, pk, rng } from './keyframe-fixtures';

const FMT = { width: 1920, height: 1080, fps: 30 };
const ID: MotionOffsets = { dx: 0, dy: 0, drot: 0, kScale: 1, kOpacity: 1 };
const lin = { kind: 'linear' } as const;
const use = (preset: PresetKey, slot: MotionSlot, over: Partial<PresetUse> = {}): PresetUse =>
  ({ preset, duration: 1, delay: 0, ease: { ...lin }, params: presetParams(preset, slot), ...over });
const emph = (preset: PresetKey, at: number, over: Partial<PresetUse> = {}): EmphasisUse => ({ ...use(preset, 'emphasis', over), at });
const loop = (preset: PresetKey, over: Partial<LoopUse> = {}): LoopUse => ({ ...use(preset, 'loop'), phase: 0, count: null, ...over });
/** A video clip at 10..14 s, in 2 (local 2..6), with `motion`. */
const clip = (motion: ClipMotion, over: Partial<Clip> = {}): Clip => mk('c', { motion, ...over });
const off = (key: PresetKey, slot: MotionSlot, p: number, u: PresetUse) => presetOffsets(key, slot, p, u.params, FMT, { ease: u.ease, seconds: u.duration });

describe('timing (D2)', () => {
  it('in: start state before the delay and on frame 0, progress after it, inactive once done', () => {
    const inUse = use('slide', 'in', { duration: 1, delay: 0.5 });
    const c = clip({ in: inUse });
    expect(motionAt(c, 10, FMT)).toEqual({ ...ID, dx: -1920 });
    expect(motionAt(c, 10.4, FMT)).toEqual({ ...ID, dx: -1920 });
    expect(motionAt(c, 11, FMT)).toEqual(off('slide', 'in', 0.5, inUse));
    expect(motionAt(c, 11.5, FMT)).toBeNull();
    expect(motionAt(mk('c', { motion: { in: use('fade', 'in') } }), 10, FMT)).toEqual({ ...ID, kOpacity: 0 });
  });

  it('out: rest before its window, ends at the clip end (end state from D − delay)', () => {
    const o = use('fade', 'out', { duration: 1, delay: 0.5 });
    const c = clip({ out: o });
    expect(motionAt(c, 12.5, FMT)).toBeNull();
    expect(motionAt(c, 13, FMT)).toEqual(off('fade', 'out', 0.5, o));
    expect(motionAt(c, 13.5, FMT)).toEqual({ ...ID, kOpacity: 0 });
    expect(motionAt(c, 13.99, FMT)).toEqual({ ...ID, kOpacity: 0 });
    const d0 = clip({ out: use('fade', 'out', { duration: 1 }) });
    expect(motionAt(d0, 14 - 1 / 30, FMT)!.kOpacity).toBeCloseTo(1 / 30, 9);
  });

  it('emphasis: a window at local `at` (footage-anchored), identity outside', () => {
    const e = emph('pulse', 3, { duration: 0.6 });
    const c = clip({ emphasis: e }); // local = 2 + (t − 10)
    expect(motionAt(c, 10.9, FMT)).toBeNull();
    expect(motionAt(c, 11, FMT)).toEqual(ID);
    expect(motionAt(c, 11.3, FMT)!.kScale).toBeCloseTo(off('pulse', 'emphasis', 0.5, e).kScale, 12);
    expect(motionAt(c, 11.6, FMT)).toBeNull();
  });

  it('loop: tau = (local + phase) / period; count stops it after the counted cycles; Ken Burns spans the clip', () => {
    const l = loop('float', { duration: 2, phase: -2 });
    const c = clip({ loop: l });
    expect(motionAt(c, 10, FMT)).toEqual(ID);
    expect(motionAt(c, 10.5, FMT)).toEqual(off('float', 'loop', 0.25, l));
    expect(motionAt(c, 13.5, FMT)).toEqual(off('float', 'loop', 0.75, l));
    const counted = clip({ loop: { ...l, count: 1 } });
    expect(motionAt(counted, 11.5, FMT)).toEqual(off('float', 'loop', 0.75, l));
    expect(motionAt(counted, 12.5, FMT)).toBeNull();
    const kb = loop('kenBurns', { duration: 5, ease: { ...lin } });
    expect(motionAt(clip({ loop: kb }), 12, FMT)!.kScale).toBeCloseTo(Math.pow(1.2, 0.5), 12);
    expect(motionAt(clip({ loop: { ...kb, phase: 123 } }), 12, FMT)).toEqual(motionAt(clip({ loop: kb }), 12, FMT));
  });

  it('short clips: overlapping in/out windows are both scaled by D / (din + delayIn + dout + delayOut)', () => {
    const inUse = use('slide', 'in', { duration: 1, delay: 0.2 });
    const outUse = use('fade', 'out', { duration: 1.4, delay: 0.4 });
    const c = clip({ in: inUse, out: outUse }, { in: 0, out: 1.5 }); // D = 1.5, total 3 => factor 0.5
    const w = motionWindows(c);
    expect([w.in!.start, w.in!.end, w.out!.start, w.out!.end].map((v) => Math.round(v * 1e12) / 1e12)).toEqual([0.1, 0.6, 0.6, 1.3]);
    expect(motionAt(c, 10.4, FMT)!.dx).toBeCloseTo(off('slide', 'in', 0.6, inUse).dx, 9);
    expect(motionAt(c, 10.8, FMT)!.kOpacity).toBeCloseTo(off('fade', 'out', (0.8 - 0.6) / 0.7, outUse).kOpacity, 9);
    expect(motionAt(c, 11.3, FMT)!.kOpacity).toBe(0);
    // Stored values are kept: a longer clip shows the full windows again.
    const long = motionWindows({ ...c, out: 10 });
    expect([long.in!.start, long.in!.end, long.out!.start, long.out!.end].map((v) => Math.round(v * 1e12) / 1e12)).toEqual([0.2, 1.2, 8.2, 9.6]);
    expect(c.motion).toEqual({ in: inUse, out: outUse });
  });

  it('snaps to the clip frame grid: a between-frame time equals the frame start', () => {
    const c = clip({ in: use('slide', 'in', { duration: 1 }), emphasis: emph('shake', 2, { duration: 2 }), loop: loop('jitter'), out: use('zoom', 'out') });
    for (const n of [0, 3, 17, 29, 44, 100]) {
      const t = 10 + n / 30;
      expect(motionAt(c, t + 0.4 / 30, FMT)).toEqual(motionAt(c, t, FMT));
    }
  });

  it('shake does not depend on the frame rate: the same instant on a 25 and a 30 fps grid gives the same value', () => {
    const c = clip({ emphasis: emph('shake', 2, { duration: 2 }) });
    for (const t of [10.2, 10.4, 11, 11.8]) expect(motionAt(c, t, { ...FMT, fps: 25 })).toEqual(motionAt(c, t, FMT));
  });

  it('zero-duration and tiny clips, huge phase and `at` stay finite', () => {
    const m: ClipMotion = { in: use('zoom', 'in'), emphasis: emph('pulse', 1e6), loop: loop('spinLoop', { phase: 1e6, duration: 0.1 }), out: use('pop', 'out') };
    for (const out of [2, 2 + 1e-12, 2.001]) {
      for (const t of [9, 10, 10 + 1e-7, 10.5, 1e9]) {
        const o = motionAt(clip(m, { out }), t, FMT);
        if (o) expect(Object.values(o).every(Number.isFinite), `${out} ${t}`).toBe(true);
      }
    }
    expect(motionAt(clip({ loop: loop('float', { phase: 1e300 }) }), 11, FMT)).not.toBeNull();
  });
});

describe('blending (D3)', () => {
  const stack: ClipMotion = {
    in: use('whip', 'in', { duration: 2 }), emphasis: emph('pulse', 2, { duration: 2 }), loop: loop('kenBurns', { params: { from: 1.1, to: 1.5, direction: 7, distance: 0.1 } }),
    out: use('zoom', 'out', { duration: 3 }),
  };
  const perms = <T>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));

  it('all 24 slot orders give the same offsets (fold of blendOffsets, and stacks stored in any key order)', () => {
    // Each slot alone at the same instant (in and out never overlap on one clip: short-clip scaling keeps them apart).
    const t = 11.5;
    const parts = (['in', 'emphasis', 'loop', 'out'] as const).map((s) => motionAt(clip({ [s]: stack[s] }), t, FMT)!);
    expect(parts.every((o) => o !== null)).toBe(true);
    const ref = parts.reduce(blendOffsets);
    const whole = motionAt(clip(stack), t, FMT);
    expect(ref.dx).not.toBe(0);
    expect(ref.kScale).not.toBe(1);
    for (const order of perms([0, 1, 2, 3])) {
      const folded = order.map((i) => parts[i]).reduce(blendOffsets);
      for (const f of Object.keys(ID) as (keyof MotionOffsets)[]) expect(Math.abs(folded[f] - ref[f]), `${order} ${f}`).toBeLessThan(1e-9);
      const reordered = Object.fromEntries(order.map((i) => (['in', 'emphasis', 'loop', 'out'] as const)[i]).map((s) => [s, stack[s]]));
      expect(motionAt(clip(reordered), t, FMT)).toEqual(whole);
    }
  });

  it('composes on the keyed base: positions and rotations add, scale and opacity multiply', () => {
    const keys = { position: [pk(2, 100, 50), pk(6, 500, 50)], scale: [k(2, 2), k(6, 2)], opacity: [k(2, 0.5), k(6, 0.5)] };
    const c = clip({ in: use('slide', 'in', { duration: 2 }), emphasis: emph('pulse', 2, { duration: 2 }) }, { keys });
    const base = resolvedTransform(c, 11, 30);
    const o = motionAt(c, 11, FMT)!;
    const r = resolveClip(c, 11, FMT).transform;
    expect(r).toEqual({ x: base.x + o.dx, y: base.y + o.dy, rotation: base.rotation + o.drot, scale: base.scale * o.kScale, opacity: base.opacity * o.kOpacity });
    expect(r.x).toBe(200 - 960);
  });

  it('clamps once: opacity within 0..1, scale never below 0, NaN-safe', () => {
    const base = { x: 1, y: 2, scale: 1, rotation: 3, opacity: 1 };
    expect(composeMotion(base, { ...ID, kOpacity: 1.5 }).opacity).toBe(1);
    expect(composeMotion(base, { ...ID, kScale: -2, kOpacity: -1 })).toEqual({ ...base, scale: 0, opacity: 0 });
    expect(composeMotion(base, { dx: Number.NaN, dy: Infinity, drot: Number.NaN, kScale: Number.NaN, kOpacity: Number.NaN })).toEqual({ ...base, scale: 0, opacity: 0 });
    expect(composeMotion(base, ID)).toEqual(base);
    // A Pop at its overshoot frame on an opaque picture: bigger, opacity stays 1.
    const pop = clip({ in: use('pop', 'in', { duration: 1, ease: presetEase('pop', 'in') }) });
    let peak = resolveClip(pop, 10, FMT).transform;
    for (let n = 0; n < 30; n++) {
      const tr = resolveClip(pop, 10 + n / 30, FMT).transform;
      if (tr.scale > peak.scale) peak = tr;
    }
    expect(peak.scale).toBeGreaterThan(1.1);
    expect(peak.opacity).toBe(1);
    // Zoom Out with a back-in ease undershoots its away amount: opacity is clamped to 1, never above.
    const z = clip({ out: use('zoom', 'out', { duration: 2, ease: presetEase('whip', 'out') }) });
    for (let n = 0; n < 60; n++) expect(resolveClip(z, 12 + n / 30, FMT).transform.opacity).toBeLessThanOrEqual(1);
  });

  it('scale 0 (Pop at frame 0) draws nothing without NaN', () => {
    const tr = resolveClip(clip({ in: use('pop', 'in') }), 10, FMT).transform;
    expect(tr.scale).toBe(0);
    expect(clipMatrix({ width: 200, height: 100 }, tr, FMT).every(Number.isFinite)).toBe(true);
  });
});

describe('maxMotionScale', () => {
  it('is 1 without motion and the product of the slot bounds otherwise; it bounds every sampled frame', () => {
    expect(maxMotionScale(mk('c'))).toBe(1);
    const r = rng(77);
    for (let n = 0; n < 40; n++) {
      const m: ClipMotion = {
        in: use('zoom', 'in', { params: { from: 3 * r() } }), emphasis: emph('pulse', 2 + r() * 3, { params: { intensity: r() } }),
        loop: r() < 0.5 ? loop('breathe', { params: { intensity: r() / 2 }, duration: 0.5 }) : loop('kenBurns', { params: { from: 0.5 + 2.5 * r(), to: 0.5 + 2.5 * r(), direction: 0, distance: 0 } }),
        out: use('pop', 'out', { params: { intensity: r() / 2 }, ease: { kind: 'spring', spring: { stiffness: 300, damping: 2, mass: 1 } } }),
      };
      const c = clip(m, { in: 0, out: 2 });
      const bound = maxMotionScale(c);
      expect(bound).toBeCloseTo(presetMaxScale('zoom', 'in', m.in!.params, m.in!.ease) * presetMaxScale('pulse', 'emphasis', m.emphasis!.params)
        * presetMaxScale(m.loop!.preset, 'loop', m.loop!.params, m.loop!.ease) * presetMaxScale('pop', 'out', m.out!.params, m.out!.ease), 12);
      for (let f = 0; f < 60; f++) expect(motionAt(c, 10 + f / 30, FMT)?.kScale ?? 1).toBeLessThanOrEqual(bound * (1 + 1e-12));
    }
  });
});

describe('resolveClip (fast path and composition)', () => {
  it('a static clip without motion is returned as-is', () => {
    const c = mk('c');
    expect(resolveClip(c, 11, FMT)).toBe(c);
  });

  it('an active slot gives a fresh object with the composed transform and no motion; the input is unchanged', () => {
    const c = clip({ in: use('slide', 'in', { duration: 2 }) });
    const snap = JSON.stringify(c);
    const r = resolveClip(c, 11, FMT);
    expect(r).not.toBe(c);
    expect('motion' in r).toBe(false);
    expect(r.transform.x).toBe(-960);
    expect(r.effects).toBe(c.effects);
    expect(JSON.stringify(c)).toBe(snap);
  });

  it('no active slot: the keys-only result (static: the stored transform itself), never carrying motion', () => {
    const c = clip({ in: use('slide', 'in', { duration: 1 }) });
    const r = resolveClip(c, 12, FMT);
    expect('motion' in r).toBe(false);
    expect(r.transform).toBe(c.transform);
    const keyed = clip({ in: use('slide', 'in', { duration: 1 }) }, { keys: { opacity: [k(2, 0), k(6, 1)] } });
    const rk = resolveClip(keyed, 12, FMT);
    const { motion: _m, ...plain } = keyed;
    expect(rk).toEqual(resolveClip(plain as Clip, 12, FMT));
    expect('motion' in rk || 'keys' in rk).toBe(false);
  });
});
