// Plan 5B Task 5: maxMotionScale (overlay texture sizing) and the resolver's fast path / composition (resolveClip).
import { describe, expect, it } from 'vitest';
import { resolveClip } from '../src/core/animate';
import { maxMotionScale, motionAt } from '../src/core/motion';
import type { Clip } from '../src/core/model';
import type { ClipMotion, EmphasisUse, LoopUse, MotionSlot, PresetKey, PresetUse } from '../src/core/motionTypes';
import { presetMaxScale } from '../src/core/presetMath';
import { presetParams } from '../src/core/presets';
import { k, mk, rng } from './keyframe-fixtures';

const FMT = { width: 1920, height: 1080, fps: 30 };
const lin = { kind: 'linear' } as const;
const use = (preset: PresetKey, slot: MotionSlot, over: Partial<PresetUse> = {}): PresetUse =>
  ({ preset, duration: 1, delay: 0, ease: { ...lin }, params: presetParams(preset, slot), ...over });
const emph = (preset: PresetKey, at: number, over: Partial<PresetUse> = {}): EmphasisUse => ({ ...use(preset, 'emphasis', over), at });
const loop = (preset: PresetKey, over: Partial<LoopUse> = {}): LoopUse => ({ ...use(preset, 'loop'), phase: 0, count: null, ...over });
/** A video clip at 10..14 s, in 2 (local 2..6), with `motion`. */
const clip = (motion: ClipMotion, over: Partial<Clip> = {}): Clip => mk('c', { motion, ...over });

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

  it('a stored empty stack `motion: {}` on a static clip takes the fast path: the same object (no slot to draw)', () => {
    const c = mk('c', { motion: {} });
    expect(resolveClip(c, 11, FMT)).toBe(c);
    expect(motionAt(c, 11, FMT)).toBeNull();
    // A keyed clip with an empty stack resolves like the same clip without it.
    const keyed = mk('c', { motion: {}, keys: { opacity: [k(2, 0), k(6, 1)] } });
    const { motion: _m, ...plain } = keyed;
    expect(resolveClip(keyed, 12, FMT)).toEqual(resolveClip(plain as Clip, 12, FMT));
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
