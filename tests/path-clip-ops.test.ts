// Plan 5B Task 4 (D6/D12): curved paths through clip operations - split/trim frame-exact (whole-frame cuts, P5-5;
// any cut keeps the curve on the local range, P5-6/7), halves never share tangent objects, reframe scales tangents and
// round-trips (Ruling J), and the drawn motion path follows the curve.
import { describe, expect, it } from 'vitest';
import { resolveClip } from '../src/core/animate';
import type { Ease } from '../src/core/easing';
import { copyKey, shiftKeys } from '../src/core/keyLists';
import { positionAt } from '../src/core/keyframes';
import { reframeProject } from '../src/core/merge';
import { clipEnd, isSourceless } from '../src/core/model';
import type { Clip, PositionKeyframe, Project } from '../src/core/model';
import { splitClip, trimClip } from '../src/core/timeline';
import { CURVE_POINTS, MAX_PATH_SAMPLES, cachedMotionPath, sampleMotionPath } from '../src/ui/motionPathMath';
import { clipOf, mk, pk, project, rng } from './keyframe-fixtures';

const FPS = 30;
const FMT = { width: 1920, height: 1080, fps: FPS };
const EASES: Ease[] = [{ kind: 'linear' }, { kind: 'hold' }, { kind: 'easeInOut' }, { kind: 'back' }, { kind: 'elastic' }];
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const withClip = (c: Clip): Project => {
  const p = project();
  return { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: [c] } : t)) };
};
const frames = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let n = Math.ceil(from * FPS - 1e-9); n / FPS < to - 1e-9; n++) out.push(n / FPS);
  return out;
};

/** A random clip (video, image or overlay) with a curved position path (and orient half of the time). */
function randomClip(r: () => number): Clip {
  const kind = (['video', 'image', 'overlay'] as const)[Math.floor(r() * 3)];
  const sourceless = kind === 'overlay';
  const start = Math.round(r() * 2000) / 100 + r() * 0.01;
  const inn = sourceless ? 0 : Math.round(r() * 500) / 100;
  const dur = 1 + Math.round(r() * 400) / 100;
  const position: PositionKeyframe[] = [];
  for (let t = inn - 1 + r(); t < inn + dur + 1; t += 0.2 + r()) {
    const key = pk(t, r() * 2000 - 1000, r() * 2000 - 1000, EASES[Math.floor(r() * EASES.length)]);
    if (r() < 0.7) key.out = { x: r() * 800 - 400, y: r() * 800 - 400 };
    if (r() < 0.7) key.in = { x: r() * 800 - 400, y: r() * 800 - 400 };
    position.push(key);
  }
  return mk('c', {
    kind, mediaId: sourceless ? '' : 'm1', start, in: inn, out: inn + dur, keys: r() < 0.5 ? { position, orient: true } : { position },
    overlay: sourceless ? { type: 'sticker', text: '', subtext: '', colour: '#ffffff', accent: '#000000', sticker: 'star' } : undefined,
  });
}
function same(a: Clip, b: Clip, where: string): void {
  for (const key of ['x', 'y', 'rotation'] as const) {
    expect(near(a.transform[key], b.transform[key]), `${where} ${key} ${a.transform[key]} vs ${b.transform[key]}`).toBe(true);
  }
}

describe('split and trim with tangents', () => {
  it('property: whole-frame cuts, every frame of both halves resolves exactly as the original (200 clips)', () => {
    const r = rng(404);
    for (let i = 0; i < 200; i++) {
      const c = randomClip(r);
      const nFrames = Math.floor((c.out - c.in) * FPS);
      const time = c.start + (2 + Math.floor(r() * (nFrames - 4))) / FPS;
      const [left, right] = splitClip(withClip(c), 'c', time).tracks[0].clips;
      for (const t of frames(c.start, time)) same(resolveClip(left, t, FMT), resolveClip(c, t, FMT), `#${i} L t=${t}`);
      for (const t of frames(time, clipEnd(c))) same(resolveClip(right, t, FMT), resolveClip(c, t, FMT), `#${i} R t=${t}`);
      const t1 = c.start + Math.floor(r() * (nFrames - 4)) / FPS;
      const trimmed = trimClip(withClip(c), 'c', 'start', t1).tracks[0].clips[0];
      for (const t of frames(t1, clipEnd(c))) same(resolveClip(trimmed, t, FMT), resolveClip(c, t, FMT), `#${i} trim t=${t}`);
    }
  });

  it('property: at ANY cut each half keeps the curve on its own local range (P5-6/7: off-frame cuts)', () => {
    const r = rng(77);
    for (let i = 0; i < 200; i++) {
      const c = randomClip(r);
      const time = c.start + 0.06 + r() * (c.out - c.in - 0.12);
      const [left, right] = splitClip(withClip(c), 'c', time).tracks[0].clips;
      const d = time - c.start;
      const base = isSourceless(c) ? 0 : c.in;
      const shift = isSourceless(c) ? d : 0;
      const orig = c.keys!.position!;
      for (let j = 0; j <= 50; j++) {
        const uL = base + (d * j) / 50;
        const uR = base + d + ((c.out - c.in - d) * j) / 50;
        const l = positionAt(left.keys!.position!, uL);
        const o = positionAt(orig, uL);
        expect(near(l.x, o.x) && near(l.y, o.y), `#${i} L ${uL}`).toBe(true);
        const rr = positionAt(right.keys!.position!, uR - shift);
        const o2 = positionAt(orig, uR);
        expect(near(rr.x, o2.x) && near(rr.y, o2.y), `#${i} R ${uR}`).toBe(true);
      }
    }
  });

  it('halves, shifted lists and copies never share tangent objects with each other or the original', () => {
    const c = mk('c', { kind: 'overlay', mediaId: '', start: 10, in: 0, out: 4, keys: { position: [
      { ...pk(0, 0, 0), out: { x: 10, y: 0 } }, { ...pk(2, 100, 0), in: { x: -10, y: 5 }, out: { x: 10, y: 5 } }, { ...pk(4, 200, 0), in: { x: 0, y: 9 } },
    ] } });
    const [left, right] = splitClip(withClip(c), 'c', 12.5).tracks[0].clips;
    const L = left.keys!.position!;
    const R = right.keys!.position!;
    const O = c.keys!.position!;
    expect(L[1].out).toEqual(O[1].out);
    expect(L[1].out).not.toBe(O[1].out);
    expect(L[1].out).not.toBe(R[0].out);
    expect(L[1].in).not.toBe(R[0].in);
    expect(R[1].in).not.toBe(O[2].in);
    const k = copyKey(O[1]);
    expect(k).toEqual(O[1]);
    expect(k.in).not.toBe(O[1].in);
    expect(shiftKeys(O, 1)[0].out).not.toBe(O[0].out);
  });
});

describe('reframe scales tangents (Ruling J)', () => {
  const curved = () => withClip(mk('c', { keys: { position: [
    { ...pk(2, 300, -200), out: { x: 120, y: -45 } }, { ...pk(4, -30, 45), in: { x: -60, y: 90 }, broken: true },
  ] } }));
  it('tangents scale like x/y; round trip A → B → A within 1e-9 for every format pair', () => {
    const v = clipOf(reframeProject(curved(), 'vertical'), 'c').keys!.position!;
    expect(v[0].out!.x).toBeCloseTo(120 * 1080 / 1920, 9);
    expect(v[0].out!.y).toBeCloseTo(-45 * 1920 / 1080, 9);
    expect(v[1].in!.y).toBeCloseTo(90 * 1920 / 1080, 9);
    expect(v[1].broken).toBe(true);
    const fmts = ['youtube', 'vertical', 'square', 'portrait'] as const;
    for (const a of fmts) for (const b of fmts) {
      if (a === b) continue;
      const p = a === 'youtube' ? curved() : reframeProject(curved(), a);
      const back = clipOf(reframeProject(reframeProject(p, b), a), 'c').keys!.position!;
      clipOf(p, 'c').keys!.position!.forEach((q, i) => {
        for (const t of ['in', 'out'] as const) {
          if (!q[t]) continue;
          expect(Math.abs(back[i][t]!.x - q[t]!.x)).toBeLessThanOrEqual(1e-9);
          expect(Math.abs(back[i][t]!.y - q[t]!.y)).toBeLessThanOrEqual(1e-9);
        }
      });
    }
  });
});

describe('motion path sampling follows the curve', () => {
  const F = { width: 1920, height: 1080 };
  const curvedClip = (out = 4) => mk('c', { start: 0, in: 0, out, keys: { position: [
    { ...pk(0, -400, 0), out: { x: 0, y: -500 } }, { ...pk(2, 400, 0), in: { x: 0, y: -500 } },
  ] } });
  it('endpoints are the keys; every point is the evaluated (curved) position; the curve bulges', () => {
    const c = curvedClip();
    const d = sampleMotionPath(c, FPS, F);
    expect(d.runs[0][0]).toEqual({ x: 560, y: 540 });
    expect(d.runs[0][d.runs[0].length - 1]).toEqual({ x: 1360, y: 540 });
    d.runs[0].forEach((pt, i) => {
      const p = positionAt(c.keys!.position!, i / FPS);
      expect(pt.x).toBeCloseTo(960 + p.x, 9);
      expect(pt.y).toBeCloseTo(540 + p.y, 9);
    });
    expect(Math.min(...d.runs[0].map((p) => p.y))).toBeLessThan(540 - 300);
  });
  it('a short curved segment gets CURVE_POINTS points; long paths stay within MAX_PATH_SAMPLES', () => {
    const short = mk('c', { start: 0, in: 0, out: 4, keys: { position: [{ ...pk(0, 0, 0), out: { x: 0, y: -100 } }, pk(0.1, 100, 0)] } });
    expect(sampleMotionPath(short, FPS, F).runs[0]).toHaveLength(CURVE_POINTS + 1);
    const many: PositionKeyframe[] = [];
    for (let j = 0; j < 400; j++) many.push({ ...pk(j * 0.5, (j % 7) * 100, (j % 3) * 100), out: { x: 30, y: 0 } });
    const long = mk('c', { kind: 'overlay', mediaId: '', start: 0, in: 0, out: 200, keys: { position: many } });
    const n = sampleMotionPath(long, FPS, F).runs.reduce((s, r) => s + r.length, 0);
    expect(n).toBeLessThanOrEqual(MAX_PATH_SAMPLES);
  });
  it('a tangent edit (new list) gives a new cached path', () => {
    const c = curvedClip();
    const a = cachedMotionPath(c, FPS, F);
    expect(cachedMotionPath(c, FPS, F)).toBe(a);
    const list = c.keys!.position!.map((k, i) => (i === 0 ? { ...k, out: { x: 0, y: 500 } } : k));
    const b = cachedMotionPath({ ...c, keys: { position: list } }, FPS, F);
    expect(b).not.toBe(a);
    expect(Math.max(...b.runs[0].map((p) => p.y))).toBeGreaterThan(540 + 100);
  });
});
