// Plan 5 Task 10: DOM-free motion-path sampling (format px) and which clip shows a path.
import { describe, expect, it } from 'vitest';
import { positionAt } from '../src/core/keyframes';
import { keyVisible } from '../src/core/keyframes';
import type { Clip, PositionKeyframe, Project } from '../src/core/model';
import { DOT_R, MAX_PATH_SAMPLES, PASS_THROUGH_PX, cachedMotionPath, dotPassesThrough, motionPathTarget, sampleMotionPath } from '../src/ui/motionPathMath';
import { lin, mk, pk, project } from './keyframe-fixtures';

const F = { width: 1920, height: 1080 };
const FPS = 30;
const withKeys = (keys: PositionKeyframe[], over: Partial<Clip> = {}): Clip => mk('c', { start: 0, in: 0, out: 4, keys: { position: keys }, ...over });
const count = (runs: { x: number; y: number }[][]): number => runs.reduce((n, r) => n + r.length, 0);
const first = (runs: { x: number; y: number }[][]) => runs[0][0];
const last = (runs: { x: number; y: number }[][]) => runs[runs.length - 1][runs[runs.length - 1].length - 1];

describe('sampleMotionPath', () => {
  it('endpoints equal the first and last key positions (format px = centre + offset); one sample per frame between', () => {
    const d = sampleMotionPath(withKeys([pk(0, -100, 50), pk(1, 300, -20), pk(2, 0, 0)]), FPS, F);
    expect(d.runs).toHaveLength(1);
    expect(first(d.runs)).toEqual({ x: 960 - 100, y: 540 + 50 });
    expect(last(d.runs)).toEqual({ x: 960, y: 540 });
    // 2 s at 30 fps: the frames 0..60 (keys at frames 0, 30, 60 coincide with the grid): exactly 61 points.
    expect(count(d.runs)).toBe(61);
    expect(d.keys.map((k) => k.u)).toEqual([0, 1, 2]);
    expect(d.keys[1]).toMatchObject({ x: 960 + 300, y: 540 - 20 });
  });

  it('every sample lies on the evaluated position (same eased fraction for x and y)', () => {
    const keys = [pk(0, 0, 0, { kind: 'easeInOut' }), pk(2, 400, -200)];
    const d = sampleMotionPath(withKeys(keys), FPS, F);
    d.runs[0].forEach((pt, i) => {
      const p = positionAt(keys, i / FPS);
      expect(pt.x).toBeCloseTo(960 + p.x, 9);
      expect(pt.y).toBeCloseTo(540 + p.y, 9);
    });
  });

  it('a hold segment is a jump: the run ends at the held position and a new one starts at the next key', () => {
    const d = sampleMotionPath(withKeys([pk(0, 0, 0), pk(1, 100, 0, { kind: 'hold' }), pk(2, 500, 200), pk(3, 600, 200)]), FPS, F);
    expect(d.runs).toHaveLength(2);
    expect(last([d.runs[0]])).toEqual({ x: 1060, y: 540 });
    expect(first([d.runs[1]])).toEqual({ x: 1460, y: 740 });
    // Nothing between the held position and the jump target: the held run has no point beyond x = 1060.
    expect(Math.max(...d.runs[0].map((p) => p.x))).toBe(1060);
    expect(d.keys).toHaveLength(4);
  });

  it('a single key: no polyline, just the dot', () => {
    const d = sampleMotionPath(withKeys([pk(1, 10, 20)]), FPS, F);
    expect(d.runs).toEqual([]);
    expect(d.keys).toEqual([{ u: 1, x: 970, y: 560 }]);
  });

  it('no keys: nothing', () => {
    expect(sampleMotionPath(mk('c'), FPS, F)).toEqual({ runs: [], keys: [], cycles: [], moreCycles: false });
  });

  it('keys outside the visible range: no dots for them; the path is cut at the clip edges (position there, not a key)', () => {
    // Clip shows local 2..6 (in 2, out 6); keys at 0 and 8 are beyond both edges.
    const keys = [pk(0, 0, 0), pk(8, 800, 0)];
    const c = withKeys(keys, { in: 2, out: 6 });
    const d = sampleMotionPath(c, FPS, F);
    expect(d.keys).toEqual([]);
    expect(d.runs).toHaveLength(1);
    expect(first(d.runs).x).toBeCloseTo(960 + 200, 9); // position at local 2
    expect(last(d.runs).x).toBeCloseTo(960 + 100 * (6 - 1 / FPS), 6); // the last visible frame (6 s is off the clip)
    expect(count(d.runs)).toBe(4 * FPS);
    // A key exactly at the (exclusive) end edge is not a dot either; one just inside is.
    expect(sampleMotionPath(withKeys([pk(3, 0, 0), pk(6, 9, 9)], { in: 2, out: 6 }), FPS, F).keys.map((k) => k.u)).toEqual([3]);
    expect(keyVisible(c, 6)).toBe(false);
  });

  it('all keys before or after the visible range: constant position, no path and no dots', () => {
    expect(sampleMotionPath(withKeys([pk(0, 0, 0), pk(1, 9, 9)], { in: 2, out: 6 }), FPS, F)).toEqual({ runs: [], keys: [], cycles: [], moreCycles: false });
    expect(sampleMotionPath(withKeys([pk(7, 0, 0), pk(8, 9, 9)], { in: 2, out: 6 }), FPS, F)).toEqual({ runs: [], keys: [], cycles: [], moreCycles: false });
  });

  it('a sourceless clip (overlay/local range 0..duration) maps keys the same way', () => {
    const c = withKeys([pk(0, 0, 0), pk(1, 90, 0)], { kind: 'overlay', in: 0, out: 2 });
    const d = sampleMotionPath(c, FPS, F);
    expect(d.keys.map((k) => k.u)).toEqual([0, 1]);
    expect(count(d.runs)).toBe(FPS + 1);
  });

  it('is bounded: a very long clip with 500 keys never exceeds MAX_PATH_SAMPLES, endpoints still exact', () => {
    const keys = Array.from({ length: 500 }, (_, i) => pk(i * 7.2, i % 2 ? 400 : -400, i % 3 ? 100 : -100, i % 5 === 0 ? { kind: 'hold' } : lin));
    const c = withKeys(keys, { out: 3600 });
    const d = sampleMotionPath(c, 60, F);
    expect(count(d.runs)).toBeLessThanOrEqual(MAX_PATH_SAMPLES);
    expect(count(d.runs)).toBeGreaterThan(500);
    expect(first(d.runs)).toEqual({ x: 960 + 400, y: 540 + 100 }); // key 0 is a hold: its lone point is no run, the line starts at key 1
    expect(last(d.runs)).toEqual({ x: 960 + 400, y: 540 + 100 }); // key 499
    expect(d.keys.length).toBeLessThanOrEqual(500);
    // A plain very long two-key clip: capped at MAX_PATH_SAMPLES, never one per frame.
    const long = sampleMotionPath(withKeys([pk(0, 0, 0), pk(3600, 100, 100)], { out: 3600 }), 60, F);
    expect(count(long.runs)).toBeLessThanOrEqual(MAX_PATH_SAMPLES);
    expect(count(long.runs)).toBeGreaterThan(MAX_PATH_SAMPLES / 2);
    expect(last(long.runs).x).toBeCloseTo(1060, 2); // the key at 3600 s is off the clip: the path ends one frame short
    expect(last(long.runs).y).toBeCloseTo(640, 2);
  });

  it('a path whose first key is mid-clip starts there (no constant tail before the first key)', () => {
    const d = sampleMotionPath(withKeys([pk(1, 0, 0), pk(2, 60, 0)]), FPS, F);
    expect(count(d.runs)).toBe(FPS + 1);
  });

  it('is deterministic and does not mutate the keys', () => {
    const keys = [pk(0, 0, 0), pk(1, 50, 50, { kind: 'bezier', bezier: [0.2, 1.5, 0.6, -0.5] }), pk(2, 9, 9)];
    const snap = JSON.stringify(keys);
    const a = sampleMotionPath(withKeys(keys), FPS, F);
    expect(sampleMotionPath(withKeys(keys), FPS, F)).toEqual(a);
    expect(JSON.stringify(keys)).toBe(snap);
  });
});

describe('path end and run shape', () => {
  it('ends at the last visible FRAME (end exclusive), not at the off-clip end time', () => {
    const c = withKeys([pk(0, 0, 0), pk(8, 800, 0)], { in: 0, out: 2 });
    const d = sampleMotionPath(c, FPS, F);
    expect(count(d.runs)).toBe(2 * FPS); // frames 0..59, not 0..60
    expect(last(d.runs).x).toBeCloseTo(960 + 100 * (2 - 1 / FPS), 6);
  });
  it('drops one-point runs (a hold into the last key leaves no stray point)', () => {
    const d = sampleMotionPath(withKeys([pk(0, 0, 0), pk(1, 100, 0, { kind: 'hold' }), pk(2, 500, 200)]), FPS, F);
    expect(d.runs.every((r) => r.length >= 2)).toBe(true);
    const e = sampleMotionPath(withKeys([pk(0, 0, 0, { kind: 'hold' }), pk(1, 100, 0)]), FPS, F);
    expect(e.runs.every((r) => r.length >= 2)).toBe(true);
    expect(e.keys).toHaveLength(2);
  });
});

describe('cachedMotionPath', () => {
  it('returns the SAME object for the same keys, fps, range and format; recomputes when any of them changes', () => {
    const keys = [pk(0, 0, 0), pk(2, 100, 0)];
    const c = withKeys(keys);
    const a = cachedMotionPath(c, FPS, F);
    expect(cachedMotionPath({ ...c, start: 7 }, FPS, F)).toBe(a); // a move changes nothing
    expect(cachedMotionPath(c, 25, F)).not.toBe(a);
    const b = cachedMotionPath(c, FPS, F);
    expect(cachedMotionPath(c, FPS, { width: 1080, height: 1920 })).not.toBe(b);
    // Each variant right after re-priming the cache with the base signature: exactly one part differs.
    const primed = () => cachedMotionPath(c, FPS, F);
    const p1 = primed();
    expect(cachedMotionPath(c, FPS, { width: 1920, height: 1920 })).not.toBe(p1); // only the height differs
    const p2 = primed();
    expect(cachedMotionPath(c, FPS, { width: 1080, height: 1080 })).not.toBe(p2); // only the width differs
    expect(primed()).not.toBe(p2); // (the variant replaced the entry: re-sampled)
    expect(cachedMotionPath({ ...c, out: 3 }, FPS, F)).not.toBe(cachedMotionPath(c, FPS, F));
    expect(cachedMotionPath(withKeys([pk(0, 0, 0), pk(2, 100, 0)]), FPS, F)).toEqual(sampleMotionPath(c, FPS, F));
  });
});

describe('motionPathTarget', () => {
  const keyed = { position: [pk(0, 0, 0), pk(1, 90, 0)] };
  const proj = (over: Partial<Clip> = {}, track: Partial<Project['tracks'][number]> = {}): Project => {
    const p = project();
    return { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, ...track, clips: t.clips.map((c) => (c.id === 'c' ? { ...c, ...over } : c)) } : t)) };
  };
  it('exactly one selected live picture clip with position keys', () => {
    expect(motionPathTarget(proj({ keys: keyed }), ['c'])?.id).toBe('c');
    expect(motionPathTarget(proj({ keys: keyed }), ['c', 'o'])).toBeNull();
    expect(motionPathTarget(proj({ keys: keyed }), [])).toBeNull();
    expect(motionPathTarget(proj({ keys: keyed }), ['missing'])).toBeNull();
    expect(motionPathTarget(proj(), ['c'])).toBeNull();
    expect(motionPathTarget(proj({ keys: { scale: [{ t: 0, v: 1, ease: lin }] } }), ['c'])).toBeNull();
  });
  it('overlay clips get it, adjustment and audio clips never; hidden hides it; locked keeps it', () => {
    const p = project();
    const o = p.tracks.flatMap((t) => t.clips).find((c) => c.id === 'o')!;
    const withO = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'o' ? { ...c, keys: keyed } : c)) })) };
    expect(o.kind).toBe('overlay');
    expect(motionPathTarget(withO, ['o'])?.id).toBe('o');
    const adj = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'adj' ? { ...c, keys: keyed } : c)) })) };
    expect(motionPathTarget(adj, ['adj'])).toBeNull();
    expect(motionPathTarget(proj({ keys: keyed }, { hidden: true }), ['c'])).toBeNull();
    expect(motionPathTarget(proj({ keys: keyed }, { locked: true }), ['c'])?.id).toBe('c');
  });
});

describe('dotPassesThrough (a dot near the displayed clip centre lets the press reach the move handle)', () => {
  it('is true within DOT_R + 4 css px of the centre and false beyond', () => {
    expect(PASS_THROUGH_PX).toBe(DOT_R + 4);
    const c = { x: 100, y: 100 };
    expect(dotPassesThrough({ x: 100, y: 100 }, c)).toBe(true); // a pause: same position
    expect(dotPassesThrough({ x: 100 + PASS_THROUGH_PX, y: 100 }, c)).toBe(true);
    expect(dotPassesThrough({ x: 100, y: 100 - PASS_THROUGH_PX + 0.5 }, c)).toBe(true);
    expect(dotPassesThrough({ x: 100 + PASS_THROUGH_PX + 0.5, y: 100 }, c)).toBe(false);
    expect(dotPassesThrough({ x: 107, y: 107 }, c)).toBe(false); // diagonal: distance ~9.9 > 9
  });
  it('no centre (no handles, e.g. a locked layer): never', () => {
    expect(dotPassesThrough({ x: 0, y: 0 }, null)).toBe(false);
  });
});
