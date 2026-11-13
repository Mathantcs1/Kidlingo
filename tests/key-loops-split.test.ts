// Plan 5B Task 3 (D4): a looped target is NOT partitioned by split (both halves keep its whole list, shifted for a
// sourceless right half), so every frame of both halves resolves exactly as the original; trims keep loops exact too.
import { describe, expect, it } from 'vitest';
import { resolveClip } from '../src/core/animate';
import type { Ease } from '../src/core/easing';
import type { LoopMode } from '../src/core/keyTypes';
import { clipEnd } from '../src/core/model';
import type { Clip, KeyLoop, Project, TransformKeys } from '../src/core/model';
import { splitClip, trimClip } from '../src/core/timeline';
import { colourFx, k, mk, pk, project, rng } from './keyframe-fixtures';

const FPS = 30;
const FMT = { width: 1920, height: 1080, fps: FPS };
const EASES: Ease[] = [
  { kind: 'linear' }, { kind: 'hold' }, { kind: 'easeInOut' }, { kind: 'back' }, { kind: 'bounce' },
  { kind: 'bezier', bezier: [0.2, -0.6, 0.7, 1.8] }, { kind: 'spring', spring: { stiffness: 180, damping: 8, mass: 1 } },
  { kind: 'spring', spring: { stiffness: 1000, damping: 100, mass: 0.1 } },
];
const MODES: LoopMode[] = ['repeat', 'pingPong', 'offset'];

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
function same(a: Clip, b: Clip, where: string): void {
  for (const key of ['x', 'y', 'scale', 'rotation', 'opacity'] as const) {
    expect(near(a.transform[key], b.transform[key]), `${where} ${key} ${a.transform[key]} vs ${b.transform[key]}`).toBe(true);
  }
  a.effects.forEach((e, i) => {
    for (const p of Object.keys(e.params)) expect(near(e.params[p], b.effects[i].params[p]), `${where} ${p}`).toBe(true);
  });
}
const withClip = (c: Clip): Project => {
  const p = project();
  return { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: [c] } : t)) };
};
const frames = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let n = Math.ceil(from * FPS - 1e-9); n / FPS < to - 1e-9; n++) out.push(n / FPS);
  return out;
};

/** A random clip whose keys cover only its first half, most targets looped (random mode and count), random eases. */
function randomLoopedClip(r: () => number): Clip {
  const kinds = ['video', 'image', 'overlay', 'adjustment'] as const;
  const kind = kinds[Math.floor(r() * 4)];
  const sourceless = kind === 'overlay' || kind === 'adjustment';
  const start = Math.round(r() * 2000) / 100 + r() * 0.01;
  const inn = sourceless ? 0 : Math.round(r() * 500) / 100;
  const dur = 1.5 + Math.round(r() * 350) / 100;
  const lo = inn - 0.3;
  const times = (): number[] => {
    const n = 2 + Math.floor(r() * 4);
    const ts = new Set<number>();
    while (ts.size < n) ts.add(Math.round((lo + r() * (0.3 + dur * 0.5)) * 100) / 100 + 0.003);
    return [...ts].sort((a, b) => a - b);
  };
  const ease = () => EASES[Math.floor(r() * EASES.length)];
  const list = (val: () => number) => times().map((t) => k(t, val(), ease()));
  const loop = (): KeyLoop | undefined => (r() < 0.85 ? { mode: MODES[Math.floor(r() * 3)], count: r() < 0.5 ? null : 1 + Math.floor(r() * 4) } : undefined);
  const loops: Record<string, KeyLoop> = {};
  const keys: TransformKeys = { opacity: list(() => r()) };
  if (kind !== 'adjustment') {
    keys.scale = list(() => 0.1 + r() * 3);
    keys.rotation = list(() => r() * 720 - 360);
    keys.position = times().map((t) => pk(t, r() * 2000 - 1000, r() * 2000 - 1000, ease()));
  }
  for (const prop of ['position', 'scale', 'rotation', 'opacity'] as const) {
    const l = loop();
    if (keys[prop] && l) loops[prop] = l;
  }
  if (Object.keys(loops).length > 0) keys.loops = loops;
  const fxLoops: Record<string, KeyLoop> = {};
  for (const param of ['brightness', 'hue']) {
    const l = loop();
    if (l) fxLoops[param] = l;
  }
  const effects = kind === 'overlay' ? [] : [colourFx('fx', {
    keys: { brightness: list(() => r() * 2 - 1), hue: list(() => r() * 360 - 180) },
    ...(Object.keys(fxLoops).length > 0 ? { loops: fxLoops } : {}),
  })];
  return mk('c', {
    kind, mediaId: sourceless ? '' : 'm1', start, in: inn, out: inn + dur, effects, keys,
    overlay: kind === 'overlay' ? { type: 'sticker', text: '', subtext: '', colour: '#ffffff', accent: '#000000', sticker: 'star' } : undefined,
  });
}

describe('split with key loops (D4)', () => {
  it('property: 200 random clips (sourced and sourceless), whole-frame cuts: every frame of both halves equals the original', () => {
    const r = rng(5103);
    let sourced = 0;
    let loopedRight = 0;
    for (let i = 0; i < 200; i++) {
      const c = randomLoopedClip(r);
      if (c.kind === 'video' || c.kind === 'image') sourced++;
      const nFrames = Math.floor((c.out - c.in) * FPS);
      const time = c.start + (2 + Math.floor(r() * (nFrames - 4))) / FPS;
      const [left, right] = splitClip(withClip(c), 'c', time).tracks[0].clips;
      for (const t of frames(c.start, time)) same(resolveClip(left, t, FMT), resolveClip(c, t, FMT), `#${i} L t=${t}`);
      for (const t of frames(time, clipEnd(c))) same(resolveClip(right, t, FMT), resolveClip(c, t, FMT), `#${i} R t=${t}`);
      // Looped lists are whole in both halves (same length), with fresh key objects and fresh loop records.
      for (const prop of ['position', 'scale', 'rotation', 'opacity'] as const) {
        if (!c.keys!.loops?.[prop]) continue;
        loopedRight++;
        expect(left.keys![prop]!.length).toBe(c.keys![prop]!.length);
        expect(right.keys![prop]!.length).toBe(c.keys![prop]!.length);
        expect(right.keys![prop]![0]).not.toBe(c.keys![prop]![0]);
        expect(right.keys!.loops![prop]).toEqual(c.keys!.loops![prop]);
        expect(right.keys!.loops![prop]).not.toBe(c.keys!.loops![prop]);
      }
      if (c.effects[0]?.loops) {
        expect(right.effects[0].loops).toEqual(c.effects[0].loops);
        expect(right.effects[0].loops).not.toBe(c.effects[0].loops);
        expect(left.effects[0].loops).not.toBe(right.effects[0].loops);
      }
    }
    expect(sourced).toBeGreaterThan(60);
    expect(200 - sourced).toBeGreaterThan(60);
    expect(loopedRight).toBeGreaterThan(300);
  });

  it('an unlooped list is still partitioned (5A D9) next to a looped one', () => {
    const c = mk('c', { keys: { opacity: [k(2, 0), k(2.5, 1), k(3, 0), k(5, 1)], scale: [k(2, 1), k(2.5, 2), k(3, 1), k(5, 2)], loops: { scale: { mode: 'repeat', count: null } } } });
    const [left, right] = splitClip(withClip(c), 'c', 12.5).tracks[0].clips;
    expect(left.keys!.opacity!.map((q) => q.t)).toEqual([2, 2.5, 3, 5]);
    expect(right.keys!.opacity!.map((q) => q.t)).toEqual([3, 5]);
    expect(left.keys!.scale!.map((q) => q.t)).toEqual([2, 2.5, 3, 5]);
    expect(right.keys!.scale!.map((q) => q.t)).toEqual([2, 2.5, 3, 5]);
  });

  it('a sourceless right half gets the whole looped list shifted by the cut offset', () => {
    const c = mk('o', { kind: 'overlay', mediaId: '', start: 20, in: 0, out: 4, keys: { rotation: [k(0, 0), k(1, 360)], loops: { rotation: { mode: 'offset', count: null } } } });
    const p = { ...project(), tracks: project().tracks.map((t) => (t.id === 'v' ? { ...t, clips: [c] } : t)) };
    const [, right] = splitClip(p, 'o', 22.5).tracks[0].clips;
    expect(right.keys!.rotation).toEqual([k(-2.5, 0), k(-1.5, 360)]);
    expect(resolveClip(right, 23, FMT).transform.rotation).toBe(1080);
  });
});

describe('trim with key loops', () => {
  it('property: start/end trims by whole frames keep every remaining frame exact (100 random clips)', () => {
    const r = rng(77);
    for (let i = 0; i < 100; i++) {
      const c = randomLoopedClip(r);
      const nFrames = Math.floor((c.out - c.in) * FPS);
      const cut = (1 + Math.floor(r() * (nFrames / 2))) / FPS;
      const startTrim = r() < 0.5;
      const p = trimClip(withClip(c), 'c', startTrim ? 'start' : 'end', startTrim ? c.start + cut : clipEnd(c) - cut);
      const t2 = p.tracks[0].clips[0];
      for (const t of frames(t2.start, clipEnd(t2))) same(resolveClip(t2, t, FMT), resolveClip(c, t, FMT), `#${i} t=${t}`);
    }
  });
});
