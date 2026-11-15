// Plan 5C Task 2: cuts, windows, handles through the 5D time map, durations and the validity predicate.
import { describe, it, expect } from 'vitest';
import { cutsOf, handleAfter, handleBefore, maxDuration, snapDuration, transitionValid, windowOf } from '../src/core/transitions';
import { hasRoom } from '../src/core/timeline';
import { addTransition } from '../src/core/transitionEdits';
import { FPS, base, mk, trackOf } from './transition-fixtures';

const media = base().media.m1;

describe('cuts and windows', () => {
  it('only touching neighbours are cuts', () => {
    expect(cutsOf(trackOf(base())).map((c) => [c.from.id, c.to.id, c.time])).toEqual([['a', 'b', 4], ['b', 'c', 8]]);
    const gap = base([mk('a', 0, 2, 6), mk('b', 4.5, 2, 6)]);
    expect(cutsOf(trackOf(gap))).toHaveLength(0);
  });
  it('the window is centred on the cut', () => {
    const p = addTransition(base(), 'v', 'a', 'b', { type: 'dissolve', duration: 1 });
    const tr = trackOf(p).transitions![0];
    expect(windowOf(tr, trackOf(p).clips[1])).toEqual([3.5, 4.5]);
  });
  it('hasRoom ignores transitions (D1: no overlap is created)', () => {
    const p = addTransition(base(), 'v', 'a', 'b', { type: 'dissolve' });
    const t = trackOf(p);
    expect(hasRoom(t, mk('x', 4, 2, 3), undefined)).toBe(false);
    expect(hasRoom(t, mk('x', 12, 2, 3), undefined)).toBe(true);
  });
});

describe('handles', () => {
  it('forward: before = in, after = media end - out; speed scales them; reverse mirrors', () => {
    const c = mk('a', 0, 2, 6);
    expect(handleBefore(c, media)).toBeCloseTo(2, 9);
    expect(handleAfter(c, media)).toBeCloseTo(54, 9);
    const fast = mk('a', 0, 2, 6, { speed: 2 });
    expect(handleBefore(fast, media)).toBeCloseTo(1, 9);
    const rev = mk('a', 0, 2, 6, { reverse: true });
    expect(handleBefore(rev, media)).toBeCloseTo(54, 9);
    expect(handleAfter(rev, media)).toBeCloseTo(2, 9);
  });
  it('stills and overlays are unlimited, missing media has none', () => {
    expect(handleBefore(mk('i', 0, 0, 3, { kind: 'image' }), undefined)).toBe(Infinity);
    expect(handleAfter(mk('o', 0, 0, 3, { kind: 'overlay' }), undefined)).toBe(Infinity);
    expect(handleAfter(mk('a', 0, 0, 3), { ...media, missing: true })).toBe(0);
  });
});

describe('durations', () => {
  it('rounds DOWN to whole even frames', () => {
    expect(snapDuration(1, FPS)).toBe(1);
    expect(snapDuration(1.05, FPS) * FPS).toBe(30); // 31.5 -> 31 -> 30
    expect(snapDuration(0.09, FPS) * FPS).toBe(2);
    expect(snapDuration(0.03, FPS)).toBe(0);
  });
  it('is limited by twice the smaller handle, 5 s and the clip lengths', () => {
    const p = base([mk('a', 0, 0.5, 6), mk('b', 5.5, 2, 6)]); // a ends with a long handle, b has 2 s before
    const [a, b] = trackOf(p).clips;
    expect(maxDuration(p, a, b)).toBe(4); // 2 x min(54, 2)
    const q = base([mk('a', 0, 20, 21), mk('b', 1, 20, 21)]);
    expect(maxDuration(q, trackOf(q).clips[0], trackOf(q).clips[1])).toBe(2); // a 1 s clip holds a 2 s window (1 s each side)
    const big = base([mk('a', 0, 20, 30), mk('b', 10, 20, 30)]);
    expect(maxDuration(big, trackOf(big).clips[0], trackOf(big).clips[1])).toBe(5);
  });
});

describe('transitionValid', () => {
  const p = addTransition(base(), 'v', 'a', 'b', { type: 'dissolve', duration: 1 });
  const tr = trackOf(p).transitions![0];
  it('accepts what addTransition made', () => expect(transitionValid(p, trackOf(p), tr)).toBe(true));
  it('rejects odd frame counts, too long, too short, wrong kind and bad eases', () => {
    const t = trackOf(p);
    expect(transitionValid(p, t, { ...tr, duration: 31 / FPS })).toBe(false);
    expect(transitionValid(p, t, { ...tr, duration: 10 })).toBe(false);
    expect(transitionValid(p, t, { ...tr, duration: 1 / FPS })).toBe(false);
    expect(transitionValid(p, t, { ...tr, type: 'audio' })).toBe(false);
    expect(transitionValid(p, t, { ...tr, ease: { kind: 'elastic' } })).toBe(false);
    expect(transitionValid(p, t, { ...tr, toClipId: 'c' })).toBe(false);
  });
});
