// Plan 5B Task 5: setPreset / setPresetParams (D2/D13/D14): defaults per slot, the playhead-anchored emphasis, loop
// phase, seeds, refusals (lock, audio, adjustment layers only fade, wrong slot), clamping, same-reference no-ops, and
// stacks that re-migrate unchanged (M6 bounds on `at` / `phase`).
import { describe, expect, it } from 'vitest';
import { migrateProject } from '../src/core/migrate';
import { repairMotion } from '../src/core/migrateMotion';
import type { Project } from '../src/core/model';
import { ADJUSTMENT_ONLY_FADE, AUDIO_NO_PRESETS, NO_PRESET, defaultSeed, setPreset, setPresetParams } from '../src/core/motionEdits';
import type { PresetUse } from '../src/core/motionTypes';
import { clipOf, project } from './keyframe-fixtures';

const fresh = (): Project => project();
const motion = (p: Project, id = 'c') => clipOf(p, id).motion;

describe('setPreset', () => {
  it('a preset key gets the slot defaults (Fade In, Zoom Out from 1.5, mirrored exit ease)', () => {
    const p = setPreset(fresh(), 'c', 'in', 'fade', 11);
    expect(motion(p)).toEqual({ in: { preset: 'fade', duration: 0.5, delay: 0, ease: { kind: 'easeOut' }, params: {} } });
    const q = setPreset(p, 'c', 'out', 'zoom', 11);
    expect(motion(q)!.out).toEqual({ preset: 'zoom', duration: 0.5, delay: 0, ease: { kind: 'easeIn' }, params: { from: 1.5 } });
    expect(motion(setPreset(p, 'c', 'in', 'zoom', 11))!.in!.params).toEqual({ from: 0.5 });
  });

  it('emphasis `at` defaults to the playhead local time (clamped onto the clip); loops start at the visible start', () => {
    // Clip 'c': start 10, in 2, out 6 (local 2..6). Overlay 'o': 20..24 (local 0..4).
    expect(motion(setPreset(fresh(), 'c', 'emphasis', 'pulse', 11.5))!.emphasis!.at).toBe(3.5);
    expect(motion(setPreset(fresh(), 'c', 'emphasis', 'pulse', 11.51))!.emphasis!.at).toBe(3.5);
    expect(motion(setPreset(fresh(), 'c', 'emphasis', 'pulse', 3))!.emphasis!.at).toBe(2);
    expect(motion(setPreset(fresh(), 'c', 'emphasis', 'pulse', 99))!.emphasis!.at).toBeCloseTo(6 - 1 / 30, 12);
    expect(motion(setPreset(fresh(), 'o', 'emphasis', 'hop', 21), 'o')!.emphasis!.at).toBe(1);
    const l = motion(setPreset(fresh(), 'c', 'loop', 'breathe', 11))!.loop!;
    expect([l.phase, l.count, l.delay]).toEqual([-2, null, 0]);
    expect(motion(setPreset(fresh(), 'o', 'loop', 'float', 21), 'o')!.loop!.phase).toBe(0);
  });

  it('seeds: injected, or a deterministic hash of the clip id and slot (never the playhead)', () => {
    expect(motion(setPreset(fresh(), 'c', 'emphasis', 'shake', 11, 1234))!.emphasis!.params.seed).toBe(1234);
    const a = motion(setPreset(fresh(), 'c', 'loop', 'jitter', 11))!.loop!.params.seed;
    expect(a).toBe(defaultSeed('c', 'loop'));
    expect(motion(setPreset(fresh(), 'c', 'loop', 'jitter', 13))!.loop!.params.seed).toBe(a);
    expect(defaultSeed('c', 'emphasis')).not.toBe(a);
    expect(Number.isInteger(a) && a >= 0 && a <= 2147483647).toBe(true);
    expect(motion(setPreset(fresh(), 'c', 'emphasis', 'shake', 11, 1e12))!.emphasis!.params.seed).toBe(2147483647);
  });

  it('a full PresetUse is stored repaired (clamped, unknown params dropped), keeping its own `at`', () => {
    const u = { preset: 'slide', duration: 99, delay: -1, ease: { kind: 'nope' }, params: { direction: 2.6, distance: 7, junk: 1 } } as unknown as PresetUse;
    expect(motion(setPreset(fresh(), 'c', 'out', u, 11))!.out).toEqual({ preset: 'slide', duration: 30, delay: 0, ease: { kind: 'linear' }, params: { direction: 3, distance: 2 } });
    const e = { preset: 'wobble', duration: 1, delay: 0, ease: { kind: 'linear' }, params: { intensity: 5 }, at: 4.25 } as PresetUse;
    expect(motion(setPreset(fresh(), 'c', 'emphasis', e, 11))!.emphasis!.at).toBe(4.25);
  });

  it('same reference: choosing the preset the slot already holds, removing an absent slot', () => {
    const p = setPreset(fresh(), 'c', 'in', 'slide', 11);
    const tuned = setPresetParams(p, 'c', 'in', { params: { direction: 2 } });
    expect(setPreset(tuned, 'c', 'in', 'slide', 11)).toBe(tuned);
    expect(setPreset(p, 'c', 'out', null, 11)).toBe(p);
    expect(setPreset(p, 'c', 'in', motion(p)!.in!, 11)).toBe(p);
  });

  it('removing the last slot removes the field; the input is never mutated', () => {
    const p = setPreset(setPreset(fresh(), 'c', 'in', 'fade', 11), 'c', 'loop', 'blink', 11);
    const snap = JSON.stringify(p);
    const q = setPreset(p, 'c', 'in', null, 11);
    expect(Object.keys(motion(q)!)).toEqual(['loop']);
    const r = setPreset(q, 'c', 'loop', null, 11);
    expect('motion' in clipOf(r, 'c')).toBe(false);
    expect(JSON.stringify(p)).toBe(snap);
    expect(r.tracks[1]).toBe(p.tracks[1]);
  });

  it('refuses: locked track, audio, a preset the slot does not take, non-opacity presets on adjustment layers (D13)', () => {
    expect(() => setPreset(fresh(), 'lc', 'in', 'fade', 11)).toThrow(/locked/i);
    expect(() => setPreset(fresh(), 'lc', 'in', null, 11)).toThrow(/locked/i);
    expect(() => setPreset(fresh(), 'ac', 'in', 'fade', 11)).toThrow(AUDIO_NO_PRESETS);
    expect(() => setPreset(fresh(), 'c', 'in', 'pulse', 11)).toThrow('Pulse cannot be used as an entrance');
    expect(() => setPreset(fresh(), 'c', 'emphasis', 'kenBurns', 11)).toThrow(/cannot be used as an emphasis/);
    expect(() => setPreset(fresh(), 'c', 'in', 'nope' as never, 11)).toThrow('Unknown animation preset');
    expect(() => setPreset(fresh(), 'c', 'side' as never, 'fade', 11)).toThrow('Unknown animation slot');
    expect(() => setPreset(fresh(), 'adj', 'in', 'slide', 31)).toThrow(ADJUSTMENT_ONLY_FADE);
    expect(() => setPreset(fresh(), 'adj', 'loop', 'kenBurns', 31)).toThrow(ADJUSTMENT_ONLY_FADE);
    const a = setPreset(setPreset(setPreset(fresh(), 'adj', 'in', 'fade', 31), 'adj', 'emphasis', 'flash', 31), 'adj', 'loop', 'blink', 31);
    expect(Object.keys(motion(a, 'adj')!)).toEqual(['in', 'emphasis', 'loop']);
  });
});

describe('setPresetParams', () => {
  const withSlide = () => setPreset(fresh(), 'c', 'in', 'slide', 11);

  it('clamps to the schema and D14 limits, rounds integer params, repairs the ease', () => {
    const q = setPresetParams(withSlide(), 'c', 'in', { duration: 0, delay: 99, params: { direction: 2.6, distance: 5 }, ease: { kind: 'spring' } });
    expect(motion(q)!.in).toEqual({ preset: 'slide', duration: 0.05, delay: 30, ease: { kind: 'spring', spring: { stiffness: 170, damping: 26, mass: 1 } }, params: { direction: 3, distance: 2 } });
  });

  it('emphasis `at`, loop phase and count; bounded (M6)', () => {
    const e = setPreset(fresh(), 'c', 'emphasis', 'pulse', 11);
    expect(motion(setPresetParams(e, 'c', 'emphasis', { at: 5 }))!.emphasis!.at).toBe(5);
    expect(motion(setPresetParams(e, 'c', 'emphasis', { at: 1e300 }))!.emphasis!.at).toBe(1e6);
    const l = setPreset(fresh(), 'c', 'loop', 'float', 11);
    const q = setPresetParams(l, 'c', 'loop', { phase: -1e9, count: 2.4, duration: 999 });
    expect(motion(q)!.loop).toMatchObject({ phase: -1e6, count: 2, duration: 60 });
    expect(motion(setPresetParams(q, 'c', 'loop', { count: null }))!.loop!.count).toBeNull();
    expect(motion(setPresetParams(l, 'c', 'loop', { at: 3, delay: 2 }))!.loop).toEqual(motion(l)!.loop);
  });

  it('same reference when nothing changes (same values, unknown params, clamped to the current value)', () => {
    const p = withSlide();
    expect(setPresetParams(p, 'c', 'in', {})).toBe(p);
    expect(setPresetParams(p, 'c', 'in', { params: { junk: 3 } })).toBe(p);
    expect(setPresetParams(p, 'c', 'in', { params: { distance: 1 }, duration: 0.6, ease: { kind: 'easeOut' } })).toBe(p);
    const max = setPresetParams(p, 'c', 'in', { params: { distance: 2 } });
    expect(setPresetParams(max, 'c', 'in', { params: { distance: 3 } })).toBe(max);
  });

  it('refuses an empty slot, a non-finite number, a locked track', () => {
    expect(() => setPresetParams(fresh(), 'c', 'in', { duration: 1 })).toThrow(NO_PRESET);
    expect(() => setPresetParams(withSlide(), 'c', 'in', { duration: Number.NaN })).toThrow('Invalid animation setting');
    expect(() => setPresetParams(withSlide(), 'c', 'in', { params: { distance: Infinity } })).toThrow('Invalid animation setting');
    const p = fresh();
    const locked = { ...p, tracks: p.tracks.map((t) => (t.id === 'L' ? { ...t, clips: t.clips.map((c) => ({ ...c, motion: motion(withSlide()) })) } : t)) };
    expect(() => setPresetParams(locked, 'lc', 'in', { duration: 1 })).toThrow(/locked/i);
  });
});

describe('edited stacks are canonical', () => {
  it('every edit result re-migrates to itself', () => {
    let p = fresh();
    p = setPreset(p, 'c', 'in', 'whip', 11);
    p = setPreset(p, 'c', 'emphasis', 'shake', 12, 9);
    p = setPreset(p, 'c', 'loop', 'kenBurns', 12);
    p = setPreset(p, 'c', 'out', 'pop', 12);
    p = setPresetParams(p, 'c', 'loop', { params: { from: 2, to: 0.7, direction: 6 }, phase: 0.25 });
    p = setPreset(p, 'o', 'in', 'spin', 21);
    p = setPreset(p, 'adj', 'out', 'fade', 31);
    for (const id of ['c', 'o', 'adj']) expect(repairMotion(motion(p, id), clipOf(p, id).kind)).toEqual(motion(p, id));
    const m = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(m.ok && JSON.stringify(m.project)).toBe(JSON.stringify(p));
  });

  it('migration bounds `at` and `phase` to ±1e6 s and stores no delay on emphasis/loop slots', () => {
    const r = repairMotion({
      emphasis: { preset: 'pulse', duration: 1, delay: 3, ease: { kind: 'linear' }, params: {}, at: -1e300 },
      loop: { preset: 'float', duration: 1, delay: 0, ease: { kind: 'linear' }, params: {}, phase: 5e7, count: null },
    }, 'video')!;
    expect([r.emphasis!.at, r.emphasis!.delay, r.loop!.phase]).toEqual([-1e6, 0, 1e6]);
  });
});
