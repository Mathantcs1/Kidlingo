// Data v6 (Plan 5 Task 3): v5 saves open unchanged as v6 (no `keys` added); hand-edited v6 keys are repaired per D11.
import { describe, it, expect } from 'vitest';
import { migrateProject } from '../src/core/migrate';
import { MAX_KEYS } from '../src/core/keyframes';
import { CURRENT_VERSION, defaultClipAudio } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { overlayDefaults } from '../src/core/overlaySpec';

const T = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
const base = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
  id, mediaId: kind === 'overlay' || kind === 'adjustment' ? '' : 'm1', kind, start: 0, in: 0, out: 2, volume: 1, fit: 'fit',
  transform: { ...T }, audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const colour = (extra: Record<string, unknown> = {}) => ({
  id: 'e1', type: 'colour', enabled: true,
  params: { brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, hue: 0, shadows: 0, highlights: 0 },
  ...extra,
});

function saved(version: number, video: unknown[], audio: unknown[] = []) {
  return {
    version,
    format: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      { id: 'v', kind: 'video', name: '', hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null, clips: video },
      { id: 'a', kind: 'audio', name: '', hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null, clips: audio },
    ],
    media: { m1: { id: 'm1', name: 'a.mp4', kind: 'video', duration: 4, hasAudio: true } },
  };
}
const ok = (raw: unknown): Project => {
  const r = migrateProject(raw);
  if (!r.ok) throw new Error(`not ok: ${r.reason}`);
  return r.project;
};
const one = (clip: unknown, version = 6): Clip => ok(saved(version, [clip])).tracks[0].clips[0];
const lin = { kind: 'linear' };

describe('v5 -> v6', () => {
  const every = () => saved(5, [
    base('v1', 'video', { effects: [colour()] }),
    base('i1', 'image', { start: 2 }),
    base('o1', 'overlay', { start: 4, overlay: overlayDefaults('sticker') }),
    base('adj', 'adjustment', { start: 6, effects: [colour({ id: 'e2' })], blend: 'screen' }),
  ], [base('a1', 'audio')]);

  it('opens every clip kind unchanged apart from the version; no keys added; input not mutated; idempotent', () => {
    expect(CURRENT_VERSION).toBe(6);
    const raw = every();
    const snap = JSON.stringify(raw);
    const p = ok(raw);
    expect(JSON.stringify(raw)).toBe(snap);
    expect(p.version).toBe(6);
    expect({ ...p, version: 5 }).toEqual(raw);
    for (const c of p.tracks.flatMap((t) => t.clips)) {
      expect('keys' in c).toBe(false);
      for (const e of c.effects) expect('keys' in e).toBe(false);
    }
    expect(ok(p)).toEqual(p);
  });

  it('refuses the next version (v7) and later as newer', () => {
    expect(migrateProject({ ...every(), version: 7 })).toEqual({ ok: false, reason: 'newer' });
    expect(migrateProject({ version: CURRENT_VERSION + 1 })).toEqual({ ok: false, reason: 'newer' });
  });

  it('refuses a non-integer version as malformed', () => {
    expect(migrateProject({ ...every(), version: 5.5 })).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('v6 key repair (D11)', () => {
  it('keeps valid keys exactly', () => {
    const keys = {
      position: [{ t: 0, x: 1, y: 2, ease: lin }, { t: 1, x: 3, y: 4, ease: { kind: 'bezier', bezier: [0.1, -0.5, 0.9, 1.5] } }],
      scale: [{ t: 0.5, v: 2, ease: { kind: 'easeInOut' } }],
      rotation: [{ t: 0, v: -720, ease: lin }, { t: 2, v: 720, ease: { kind: 'hold' } }],
      opacity: [{ t: 0, v: 0, ease: { kind: 'bounce' } }, { t: 1, v: 1, ease: lin }],
    };
    const c = one(base('c', 'video', { keys }));
    expect(c.keys).toEqual(keys);
    expect(ok(saved(6, [c]))).toEqual(ok(saved(6, [c])));
  });

  it('sorts unsorted keys by time', () => {
    const c = one(base('c', 'video', { keys: { scale: [{ t: 2, v: 3, ease: lin }, { t: 0, v: 1, ease: lin }, { t: 1, v: 2, ease: lin }] } }));
    expect(c.keys?.scale?.map((k) => k.t)).toEqual([0, 1, 2]);
    expect(c.keys?.scale?.map((k) => k.v)).toEqual([1, 2, 3]);
  });

  it('drops duplicate times (also within KEY_EPS), keeping the last', () => {
    const c = one(base('c', 'video', {
      keys: { opacity: [{ t: 1, v: 0.1, ease: lin }, { t: 0, v: 0, ease: lin }, { t: 1, v: 0.2, ease: lin }, { t: 1.00005, v: 0.3, ease: lin }] },
    }));
    expect(c.keys?.opacity).toEqual([{ t: 0, v: 0, ease: lin }, { t: 1.00005, v: 0.3, ease: lin }]);
  });

  it('drops keys with non-finite times or values and malformed entries; an emptied list or keys object goes away', () => {
    const c = one(base('c', 'video', {
      keys: {
        scale: [{ t: NaN, v: 1, ease: lin }, { t: 0, v: NaN, ease: lin }, { t: 1, v: Infinity, ease: lin }, null, 5, { t: 2, v: 2, ease: lin }],
        position: [{ t: 0, x: 1, y: NaN, ease: lin }, { t: 0, x: 1, ease: lin }],
        rotation: 'no',
      },
    }));
    expect(c.keys).toEqual({ scale: [{ t: 2, v: 2, ease: lin }] });
    const d = one(base('d', 'video', { keys: { opacity: [{ t: '0', v: 1, ease: lin }] } }));
    expect('keys' in d).toBe(false);
    expect('keys' in one(base('e', 'video', { keys: 'junk' }))).toBe(false);
    expect('keys' in one(base('f', 'video', { keys: {} }))).toBe(false);
  });

  it('repairs unknown or malformed eases to linear and drops stray fields', () => {
    const c = one(base('c', 'video', {
      keys: { opacity: [{ t: 0, v: 0, ease: { kind: 'wobble' } }, { t: 1, v: 1 }, { t: 2, v: 0, ease: { kind: 'bezier', bezier: [2, 5, 0.5, NaN] }, extra: 1 }] },
    }));
    expect(c.keys?.opacity).toEqual([{ t: 0, v: 0, ease: lin }, { t: 1, v: 1, ease: lin }, { t: 2, v: 0, ease: lin }]);
  });

  it('clamps values per D5: opacity 0..1, scale >= 0, keyed rotation to +-36000, position unclamped', () => {
    const c = one(base('c', 'video', {
      keys: {
        opacity: [{ t: 0, v: -1, ease: lin }, { t: 1, v: 3, ease: lin }],
        scale: [{ t: 0, v: -2, ease: lin }, { t: 1, v: 50, ease: lin }],
        rotation: [{ t: 0, v: -99999, ease: lin }, { t: 1, v: 40000, ease: lin }],
        position: [{ t: 0, x: -1e6, y: 1e6, ease: lin }],
      },
    }));
    expect(c.keys?.opacity?.map((k) => k.v)).toEqual([0, 1]);
    expect(c.keys?.scale?.map((k) => k.v)).toEqual([0, 50]);
    expect(c.keys?.rotation?.map((k) => k.v)).toEqual([-36000, 36000]);
    expect(c.keys?.position).toEqual([{ t: 0, x: -1e6, y: 1e6, ease: lin }]);
  });

  it('truncates a list of 600 keys to MAX_KEYS (the earliest)', () => {
    const list = Array.from({ length: 600 }, (_, i) => ({ t: (599 - i) * 0.01, v: 1, ease: lin }));
    const c = one(base('c', 'video', { keys: { scale: list } }));
    expect(c.keys?.scale).toHaveLength(MAX_KEYS);
    expect(c.keys?.scale?.[0].t).toBe(0);
    expect(c.keys?.scale?.[MAX_KEYS - 1].t).toBeCloseTo(4.99, 9);
  });

  it('drops unknown transform properties', () => {
    const c = one(base('c', 'video', { keys: { volume: [{ t: 0, v: 1, ease: lin }], opacity: [{ t: 0, v: 1, ease: lin }] } }));
    expect(c.keys).toEqual({ opacity: [{ t: 0, v: 1, ease: lin }] });
  });

  it('keeps overlay transform keys; adjustment clips keep only opacity keys; audio clip keys are dropped', () => {
    const keys = { opacity: [{ t: 0, v: 0.5, ease: lin }], scale: [{ t: 0, v: 2, ease: lin }], position: [{ t: 0, x: 1, y: 1, ease: lin }] };
    const p = ok(saved(6, [
      base('o', 'overlay', { overlay: overlayDefaults('lowerThird'), keys }),
      base('adj', 'adjustment', { start: 3, keys }),
    ], [base('a', 'audio', { keys, effects: [colour({ keys: { brightness: [{ t: 0, v: 1, ease: lin }] } })] })]));
    const [o, adj] = p.tracks[0].clips;
    expect(o.keys).toEqual(keys);
    expect(adj.keys).toEqual({ opacity: keys.opacity });
    const [a] = p.tracks[1].clips;
    expect('keys' in a).toBe(false);
    expect(a.effects).toEqual([]);
  });

  it('effect keys: kept and clamped to the schema range, sorted; mirror.mode and unknown params dropped', () => {
    const c = one(base('c', 'video', {
      effects: [
        colour({ keys: { brightness: [{ t: 1, v: 5, ease: lin }, { t: 0, v: -0.5, ease: { kind: 'nope' } }], nope: [{ t: 0, v: 1, ease: lin }] } }),
        { id: 'm', type: 'mirror', enabled: true, params: { mode: 1 }, keys: { mode: [{ t: 0, v: 2, ease: lin }] } },
        { id: 'b', type: 'blur', enabled: true, params: { radius: 8 }, keys: { radius: 'bad' } },
      ],
    }));
    expect(c.effects[0].keys).toEqual({ brightness: [{ t: 0, v: -0.5, ease: lin }, { t: 1, v: 1, ease: lin }] });
    expect('keys' in c.effects[1]).toBe(false);
    expect(c.effects[1].params).toEqual({ mode: 1 });
    expect('keys' in c.effects[2]).toBe(false);
  });

  it('effect keys: 600 keys truncated, input not mutated, idempotent', () => {
    const list = Array.from({ length: 600 }, (_, i) => ({ t: i, v: 0, ease: lin }));
    const raw = saved(6, [base('c', 'image', { effects: [colour({ keys: { hue: list } })] })]);
    const snap = JSON.stringify(raw);
    const p = ok(raw);
    expect(JSON.stringify(raw)).toBe(snap);
    expect(p.tracks[0].clips[0].effects[0].keys?.hue).toHaveLength(MAX_KEYS);
    expect(ok(p)).toEqual(p);
  });

  it('is idempotent on a hand-edited project', () => {
    const p = ok(saved(6, [base('c', 'video', {
      keys: { scale: [{ t: 2, v: -1, ease: { kind: 'x' } }, { t: 2, v: 3, ease: lin }, { t: 1, v: 1, ease: lin }] },
      effects: [colour({ keys: { hue: [{ t: 0, v: 999, ease: lin }] } })],
    })]));
    expect(ok(p)).toEqual(p);
    expect(p.tracks[0].clips[0].keys?.scale).toEqual([{ t: 1, v: 1, ease: lin }, { t: 2, v: 3, ease: lin }]);
    expect(p.tracks[0].clips[0].effects[0].keys?.hue).toEqual([{ t: 0, v: 180, ease: lin }]);
  });
});
