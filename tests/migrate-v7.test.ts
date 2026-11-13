// Data v7 (Plan 5B Task 2): v6 saves open unchanged as v7; `{version: 8}` is newer and never overwritten; hand-edited
// v7 animation stacks (`Clip.motion`) are repaired per D14 (unknown preset/slot dropped, timings and params clamped).
import { describe, it, expect } from 'vitest';
import { migrateProject } from '../src/core/migrate';
import { repairMotion } from '../src/core/migrateMotion';
import { CURRENT_VERSION } from '../src/core/model';
import { PRESET_SCHEMA } from '../src/core/presets';
import { classifySaved } from '../src/state/persist';
import { base, colour, lin, ok, one, oneAudio, saved } from './migrate-v7-fixtures';

const pos = (t: number, x: number, y: number) => ({ t, x, y, ease: lin });
const every = (version: number) => saved(version, [
  base('v1', 'video', {
    effects: [colour({ keys: { brightness: [{ t: 0, v: -0.5, ease: lin }, { t: 1, v: 0.5, ease: { kind: 'easeOut' } }] } })],
    keys: { position: [pos(0, -100, 0), pos(1, 100, 50)], opacity: [{ t: 0, v: 0, ease: { kind: 'bezier', bezier: [0.1, -0.5, 0.9, 1.5] } }] },
  }),
  base('i1', 'image', { start: 2, keys: { scale: [{ t: 0, v: 1, ease: lin }, { t: 2, v: 2, ease: { kind: 'bounce' } }] } }),
  base('o1', 'overlay', { start: 4, overlay: { type: 'sticker', text: '', subtext: '', colour: '#ffffff', accent: '#ff0000', sticker: 'heart' }, keys: { rotation: [{ t: 0, v: 0, ease: lin }, { t: 1, v: 720, ease: { kind: 'hold' } }] } }),
  base('adj', 'adjustment', { start: 6, effects: [colour({ id: 'e2' })], blend: 'screen', keys: { opacity: [{ t: 0, v: 1, ease: lin }] } }),
], [base('a1', 'audio')]);

describe('v6 -> v7', () => {
  it('the current version is 7', () => {
    expect(CURRENT_VERSION).toBe(7);
  });

  it('opens a v6 save of every clip kind (with keys) JSON-equal apart from the version; input not mutated; idempotent', () => {
    const raw = every(6);
    const snap = JSON.stringify(raw);
    const p = ok(raw);
    expect(JSON.stringify(raw)).toBe(snap);
    expect(p.version).toBe(CURRENT_VERSION);
    expect(JSON.stringify({ ...p, version: 6 })).toBe(snap);
    for (const c of p.tracks.flatMap((t) => t.clips)) expect('motion' in c).toBe(false);
    expect(JSON.stringify(ok(p))).toBe(JSON.stringify(p));
  });

  it('accepts every integer version 1..7', () => {
    for (let v = 1; v <= 7; v++) expect(migrateProject(saved(v, [])).ok).toBe(true);
  });

  it('refuses {version: 8} as newer, and classifySaved reports it unsupported (never "none")', () => {
    expect(migrateProject({ ...every(7), version: 8 })).toEqual({ ok: false, reason: 'newer' });
    expect(migrateProject({ version: CURRENT_VERSION + 1 })).toEqual({ ok: false, reason: 'newer' });
    const r = classifySaved({ ...every(7), version: 8 });
    expect(r.status).toBe('unsupported');
    if (r.status === 'unsupported') expect(r.reason).toContain('newer version');
  });
});

const fade = { preset: 'fade', duration: 0.5, delay: 0.2, ease: { kind: 'easeOut' }, params: {} };
const slide = { preset: 'slide', duration: 0.6, delay: 0, ease: { kind: 'spring', spring: { stiffness: 170, damping: 26, mass: 1 } }, params: { direction: 2, distance: 1 } };
const pulse = { preset: 'pulse', duration: 0.6, delay: 0, ease: { kind: 'easeInOut' }, params: { intensity: 0.15 }, at: 1.25 };
const breathe = { preset: 'breathe', duration: 3, delay: 0, ease: { kind: 'easeInOut' }, params: { intensity: 0.05 }, phase: 0.5, count: null };
const full = { in: slide, emphasis: pulse, loop: breathe, out: fade };

describe('v7 motion repair (D14)', () => {
  it('keeps a valid four-slot stack exactly, on video, image and overlay clips; input not mutated; idempotent', () => {
    for (const kind of ['video', 'image']) {
      const raw = base('c', kind, { motion: full });
      const snap = JSON.stringify(raw);
      const c = one(raw);
      expect(c.motion).toEqual(full);
      expect(JSON.stringify(raw)).toBe(snap);
      expect(one(c).motion).toEqual(full);
    }
    expect(repairMotion(full, 'overlay')).toEqual(full);
  });

  it('drops unknown presets, unknown slots, presets in a slot they do not support, and non-objects', () => {
    const c = one(base('c', 'video', { motion: { in: { ...fade, preset: 'teleport' }, sideways: fade, out: { ...pulse }, emphasis: 5, loop: { ...breathe, preset: 'toString' } } }));
    expect('motion' in c).toBe(false);
    expect(repairMotion({ in: fade, loop: { ...slide, phase: 0 } }, 'video')).toEqual({ in: fade });
    for (const junk of [null, 5, 'fade', [], [fade], {}]) expect(repairMotion(junk, 'video')).toBeUndefined();
  });

  it('clamps durations (0.05..30 s), delays (0..30 s) and loop periods (0.1..60 s); non-finite => default / 0', () => {
    const m = repairMotion({
      in: { ...fade, duration: 0.001, delay: -2 }, out: { ...fade, duration: 99, delay: 1e9 },
      emphasis: { ...pulse, duration: Number.NaN, delay: 'x' }, loop: { ...breathe, duration: 1000, delay: 4 },
    }, 'video')!;
    expect([m.in!.duration, m.in!.delay]).toEqual([0.05, 0]);
    expect([m.out!.duration, m.out!.delay]).toEqual([30, 30]);
    expect([m.emphasis!.duration, m.emphasis!.delay]).toEqual([PRESET_SCHEMA.pulse.duration, 0]);
    expect([m.loop!.duration, m.loop!.delay]).toEqual([60, 0]);
    expect(repairMotion({ loop: { ...breathe, duration: 0.01 } }, 'video')!.loop!.duration).toBe(0.1);
  });

  it('clamps params to the preset schema, rounds integer params, fills missing ones with defaults, drops unknown ones', () => {
    const m = repairMotion({ in: { ...slide, params: { direction: 9.4, distance: -3, colour: 1 } }, emphasis: { ...pulse, preset: 'shake', params: { intensity: Number.NaN, seed: 12.6 } } }, 'video')!;
    expect(m.in!.params).toEqual({ direction: 3, distance: 0 });
    const shake = Object.fromEntries(PRESET_SCHEMA.shake.params.map((d) => [d.key, d.def]));
    expect(m.emphasis!.params).toEqual({ ...shake, seed: 13 });
    expect(repairMotion({ in: { ...slide, params: 'no' } }, 'video')!.in!.params).toEqual({ direction: 0, distance: 1 });
  });

  it('repairs the ease (unknown => the preset default when absent, linear when malformed; spring params defaulted/clamped)', () => {
    const m = repairMotion({
      in: { ...slide, ease: { kind: 'spring', spring: { stiffness: Number.NaN, damping: 500, mass: 0 } } },
      out: { ...fade, ease: { kind: 'wobble' } }, emphasis: { ...pulse, ease: undefined },
    }, 'video')!;
    expect(m.in!.ease).toEqual({ kind: 'spring', spring: { stiffness: 170, damping: 100, mass: 0.1 } });
    expect(m.out!.ease).toEqual({ kind: 'linear' });
    expect(m.emphasis!.ease).toEqual(PRESET_SCHEMA.pulse.ease);
  });

  it('drops an emphasis whose `at` is not finite; a non-finite loop phase reads 0', () => {
    for (const at of [Number.NaN, Infinity, undefined, '1']) expect(repairMotion({ emphasis: { ...pulse, at } }, 'video')).toBeUndefined();
    expect(repairMotion({ loop: { ...breathe, phase: Number.NaN } }, 'video')!.loop!.phase).toBe(0);
  });

  it('repairs a loop count to an integer 1..1000 or null (∞)', () => {
    const count = (n: unknown) => repairMotion({ loop: { ...breathe, count: n } }, 'video')!.loop!.count;
    expect([0, 1.5, 2000, -1, 'x', Number.NaN, Infinity, undefined, null, 7].map(count)).toEqual([1, 2, 1000, 1, null, null, null, null, null, 7]);
  });

  it('drops extra fields of a slot and of the stack', () => {
    expect(repairMotion({ in: { ...fade, junk: 1 }, junk: 2 }, 'video')).toEqual({ in: fade });
  });

  it('adjustment clips keep only opacity-only presets (fade, flash, blink); audio clips lose motion', () => {
    const flash = { ...pulse, preset: 'flash', params: { flashes: 2 } };
    const blink = { ...breathe, preset: 'blink', params: { duty: 0.5 } };
    const c = one(base('adj', 'adjustment', { motion: { in: fade, out: slide, emphasis: flash, loop: blink } }));
    expect(c.motion).toEqual({ in: fade, emphasis: flash, loop: blink });
    expect('motion' in one(base('adj', 'adjustment', { motion: { in: slide } }))).toBe(false);
    expect('motion' in oneAudio(base('a', 'audio', { motion: full }))).toBe(false);
  });

  it('every preset key has a schema whose defaults lie inside its ranges', () => {
    for (const [key, s] of Object.entries(PRESET_SCHEMA)) {
      expect(s.slots.length, key).toBeGreaterThan(0);
      for (const d of s.params) expect(d.def >= d.min && d.def <= d.max, `${key}.${d.key}`).toBe(true);
    }
    expect(Object.keys(PRESET_SCHEMA)).toHaveLength(20);
    expect(Object.entries(PRESET_SCHEMA).filter(([, s]) => s.opacityOnly).map(([k]) => k).sort()).toEqual(['blink', 'fade', 'flash']);
  });
});
