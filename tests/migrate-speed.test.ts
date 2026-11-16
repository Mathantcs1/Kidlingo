// Plan 5D Task 3 (data v9): v8 saves open unchanged; hand-edited speed fields are repaired (duration-preserving); only
// video/audio clips keep speed fields and only video clips a freeze; `{version: 10}` is newer and never overwritten.
import { describe, it, expect } from 'vitest';
import { clipDuration } from '../src/core/clipTime';
import { repairSpeed } from '../src/core/migrateSpeed';
import type { Clip } from '../src/core/model';
import { migrateProject } from '../src/core/migrate';
import { CURRENT_VERSION } from '../src/core/model';
import { classifySaved } from '../src/state/persist';
import { base, lin, ok, one, oneAudio, saved } from './migrate-v7-fixtures';

const V = 9;
const vid = (extra: Record<string, unknown>) => one(base('c', 'video', { in: 0, out: 10, ...extra }), V);

describe('v8 -> v9', () => {
  it('the current version is at least 9', () => expect(CURRENT_VERSION).toBeGreaterThanOrEqual(9));

  it('a v8 save opens byte-for-byte the same apart from the version; input not mutated; idempotent', () => {
    const raw = saved(8, [base('v1', 'video', { crop: { left: 0.1, top: 0, right: 0, bottom: 0 } }), base('i1', 'image', { start: 3 })], [base('a1', 'audio')]);
    const snap = JSON.stringify(raw);
    const p = ok(raw);
    expect(JSON.stringify(raw)).toBe(snap);
    expect(p.version).toBe(CURRENT_VERSION);
    expect(JSON.stringify({ ...p, version: 8 })).toBe(snap);
    for (const c of p.tracks.flatMap((t) => t.clips)) expect(['speed', 'reverse', 'speedKeys', 'preservePitch', 'freeze'].some((k) => k in c)).toBe(false);
    expect(JSON.stringify(ok(p))).toBe(JSON.stringify(p));
  });

  it('accepts every integer version 1..current, refuses the next as newer and never overwrites it', () => {
    for (let v = 1; v <= CURRENT_VERSION; v++) expect(migrateProject(saved(v, [])).ok).toBe(true);
    expect(migrateProject(saved(CURRENT_VERSION + 1, []))).toEqual({ ok: false, reason: 'newer' });
    expect(classifySaved(saved(CURRENT_VERSION + 1, [])).status).toBe('unsupported');
  });
});

describe('constant speed', () => {
  it('keeps a valid speed, drops 1, clamps to 0.25..4 preserving the duration (forward moves `out`)', () => {
    expect(vid({ speed: 2 }).speed).toBe(2);
    expect(vid({ speed: 1 })).not.toHaveProperty('speed');
    const c = vid({ speed: 10 }); // authored: 10 s of footage at 10x = 1 s on the timeline
    expect(c.speed).toBe(4);
    expect(clipDuration(c)).toBeCloseTo(1, 12);
    expect([c.in, c.out]).toEqual([0, 4]);
  });
  it('reverse moves `in` (the footage edge played LAST), or drops the speed when that would go below 0', () => {
    const c = vid({ speed: 10, reverse: true, in: 2, out: 12 });
    expect(c.speed).toBe(4);
    expect(clipDuration(c)).toBeCloseTo(1.0, 12);
    expect([c.in, c.out]).toEqual([8, 12]);
    const bad = vid({ speed: 0.01, reverse: true, in: 0, out: 10 }); // would need 250 s of footage before `out`
    expect(bad).not.toHaveProperty('speed');
    expect([bad.in, bad.out]).toEqual([0, 10]);
    expect(bad.reverse).toBe(true);
  });
  it('a too-slow speed forward lengthens the footage to keep the duration', () => {
    const c = vid({ speed: 0.1 }); // 10 s of footage at 0.1x = 100 s
    expect(c.speed).toBe(0.25);
    expect(clipDuration(c)).toBeCloseTo(100, 9);
  });
  it('junk speeds (NaN, 0, negative, strings) are dropped and the stored in/out stay', () => {
    for (const speed of [NaN, 0, -2, 'fast', null, {}]) {
      const c = vid({ speed });
      expect(c).not.toHaveProperty('speed');
      expect([c.in, c.out]).toEqual([0, 10]);
    }
  });
});

describe('reverse and pitch', () => {
  it('reverse only when true; preservePitch only when false', () => {
    expect(vid({ reverse: true }).reverse).toBe(true);
    for (const reverse of [false, 1, 'yes']) expect(vid({ reverse })).not.toHaveProperty('reverse');
    expect(vid({ preservePitch: false }).preservePitch).toBe(false);
    for (const preservePitch of [true, 0, 'no']) expect(vid({ preservePitch })).not.toHaveProperty('preservePitch');
  });
});

describe('ramp (speedKeys)', () => {
  const k = (t: number, v: number) => ({ t, v, ease: lin });
  it('keeps valid keys sorted, clamps values to 0.25..4, drops junk, needs at least 2 keys, caps at 64', () => {
    const c = vid({ speedKeys: [k(5, 2), k(0, 1), { t: 'x', v: 1 }, k(8, 50)] });
    expect(c.speedKeys!.map((x) => [x.t, x.v])).toEqual([[0, 1], [5, 2], [8, 4]]);
    expect(vid({ speedKeys: [k(0, 2)] })).not.toHaveProperty('speedKeys');
    expect(vid({ speedKeys: 'ramp' })).not.toHaveProperty('speedKeys');
    const many = Array.from({ length: 100 }, (_, i) => k(i, 1 + (i % 3)));
    expect(vid({ speedKeys: many }).speedKeys).toHaveLength(64);
  });
  it('a ramp wins over a constant speed (the constant is dropped)', () => {
    const c = vid({ speed: 3, speedKeys: [k(0, 1), k(10, 2)] });
    expect(c.speedKeys).toHaveLength(2);
    expect(c).not.toHaveProperty('speed');
  });
});

describe('freeze', () => {
  it('only on video clips with a finite at >= 0; a freeze clip drops speed fields and is silent', () => {
    const c = vid({ in: 0, out: 2, freeze: { at: 4.5 }, speed: 2, reverse: true });
    expect(c.freeze).toEqual({ at: 4.5 });
    for (const k of ['speed', 'reverse', 'speedKeys', 'preservePitch']) expect(c).not.toHaveProperty(k);
    expect(c.audio.silent).toBe(true);
    for (const freeze of [{ at: -1 }, { at: NaN }, { at: 'x' }, 5, null]) expect(vid({ freeze })).not.toHaveProperty('freeze');
    expect(oneAudio(base('a', 'audio', { freeze: { at: 1 } }), V)).not.toHaveProperty('freeze');
  });
});

describe('kinds', () => {
  it('audio keeps speed/reverse/ramp/pitch but no freeze; image, overlay and adjustment keep none', () => {
    const a = oneAudio(base('a', 'audio', { in: 0, out: 10, speed: 2, reverse: true, preservePitch: false, speedKeys: [{ t: 0, v: 1, ease: lin }, { t: 5, v: 2, ease: lin }] }), V);
    expect([a.speed, a.reverse, a.preservePitch, a.speedKeys]).toEqual([undefined, true, false, expect.any(Array)]);
    const all = { speed: 2, reverse: true, freeze: { at: 1 }, preservePitch: false, speedKeys: [{ t: 0, v: 1, ease: lin }, { t: 5, v: 2, ease: lin }] };
    const im = one(base('i', 'image', { ...all }), V);
    const ov = one(base('o', 'overlay', { ...all, overlay: { type: 'sticker', text: '', subtext: '', colour: '#ffffff', accent: '#ff0000', sticker: 'heart' } }), V);
    const aj = one(base('j', 'adjustment', { ...all }), V);
    for (const c of [im, ov, aj]) for (const k of Object.keys(all)) expect(c).not.toHaveProperty(k);
  });
  it('keeps unknown extra fields', () => {
    expect((vid({ speed: 2, extra: 7 }) as unknown as { extra: number }).extra).toBe(7);
  });
});

describe('fades fit the SPEED-AWARE duration (repair first, then fades)', () => {
  it('a 4 s fade-in on a 10 s clip at 4x (2.5 s long) is cut to the timeline duration', () => {
    const c = vid({ speed: 4, audio: { fadeIn: 4, fadeOut: 0, pan: 0, silent: false, effects: [] } });
    expect(clipDuration(c)).toBeCloseTo(2.5, 12);
    expect(c.audio.fadeIn).toBeLessThanOrEqual(2.5 + 1e-9);
  });
  it('a clamped speed fits the fades to the repaired (preserved) duration', () => {
    const c = vid({ speed: 10, audio: { fadeIn: 5, fadeOut: 0, pan: 0, silent: false, effects: [] } }); // preserved duration 1 s
    expect(c.audio.fadeIn).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('idempotence', () => {
  it('migrating a migrated project changes nothing, over random hand-edited speed fields', () => {
    let seed = 3;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 300; i++) {
      const extra: Record<string, unknown> = { in: r() * 5, out: 6 + r() * 10 };
      if (r() < 0.7) extra.speed = (r() - 0.2) * 12;
      if (r() < 0.4) extra.reverse = r() < 0.7;
      if (r() < 0.3) extra.preservePitch = r() < 0.5;
      if (r() < 0.3) extra.speedKeys = Array.from({ length: 1 + Math.floor(r() * 5) }, () => ({ t: r() * 10, v: (r() - 0.2) * 8, ease: lin }));
      if (r() < 0.1) extra.freeze = { at: (r() - 0.3) * 5 };
      const p = ok(saved(9, [base('c', 'video', extra)]));
      expect(JSON.stringify(ok(p))).toBe(JSON.stringify(p));
    }
  });
});

describe('ramp repair keeps the timeline length (review of Task 2-3)', () => {
  const lin = { kind: 'linear' };
  const clipOf = (extra: Record<string, unknown>) => ({ id: 'a', mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 8, ...extra });
  it('a clamped-value ramp keeps its authored duration by moving `out`', () => {
    const raw = clipOf({ speedKeys: [{ t: 0, v: 1, ease: lin }, { t: 8, v: 50, ease: lin }] });
    const before = clipDuration(raw as never);
    const fixed = repairSpeed(raw) as never as Clip;
    expect(clipDuration(fixed)).toBeCloseTo(before, 6);
  });
  it('a dropped ramp (one usable key) keeps the length the runtime gave it', () => {
    const raw = clipOf({ speedKeys: [{ t: 0, v: 4, ease: lin }, { t: 'x', v: 4 }] });
    const fixed = repairSpeed(raw) as never as Clip;
    expect(clipDuration(fixed)).toBeCloseTo(2, 6);
    expect(fixed.speedKeys).toBeUndefined();
  });
});
