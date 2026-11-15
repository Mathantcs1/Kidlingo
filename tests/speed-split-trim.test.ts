// Plan 5D Task 4: split and trim through the time map (constant speed, reverse, ramp), MIN_CLIP in timeline time, drag limits.
import { describe, it, expect } from 'vitest';
import { clipDuration, clipEnd, sourceTimeAt } from '../src/core/clipTime';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { splitClip, trimClip } from '../src/core/timeline';
import { trimTarget } from '../src/ui/drag';

const lin = { kind: 'linear' as const };
const vc = (start: number, inn: number, out: number, extra: Partial<Clip> = {}): Clip => ({
  id: 'a', mediaId: 'm1', kind: 'video', start, in: inn, out, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const proj = (c: Clip): Project => {
  const p = emptyProject('youtube');
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 30, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', clips: [c] };
  return p;
};
const list = (p: Project) => [...p.tracks[0].clips].sort((a, b) => a.start - b.start);

describe('split through the time map', () => {
  it('constant speed: both halves cover the footage once, each ends where the other starts', () => {
    const [l, r] = list(splitClip(proj(vc(0, 10, 20, { speed: 2 })), 'a', 2));
    expect([l.in, l.out, r.in, r.out]).toEqual([10, 14, 14, 20]);
    expect(clipEnd(l)).toBeCloseTo(2, 9);
    expect(r.start).toBeCloseTo(2, 9);
    expect(clipEnd(r)).toBeCloseTo(5, 9);
    expect(l.speed).toBe(2);
    expect(r.speed).toBe(2);
  });
  it('reverse: the LEFT half (played first) is the footage end', () => {
    const [l, r] = list(splitClip(proj(vc(0, 10, 20, { reverse: true })), 'a', 3));
    expect([l.in, l.out]).toEqual([17, 20]);
    expect([r.in, r.out]).toEqual([10, 17]);
    expect(l.reverse && r.reverse).toBe(true);
  });
  it('ramp: halves keep the whole ramp and join on the same footage time', () => {
    const keys = [{ t: 10, v: 1, ease: lin }, { t: 20, v: 3, ease: lin }];
    const c = vc(0, 10, 20, { speedKeys: keys });
    const [l, r] = list(splitClip(proj(c), 'a', 3));
    expect(l.out).toBeCloseTo(sourceTimeAt(c, 3), 9);
    expect(r.in).toBeCloseTo(l.out, 12);
    expect(l.speedKeys).toEqual(keys);
    expect(r.speedKeys).toEqual(keys);
    expect(clipDuration(l) + clipDuration(r)).toBeCloseTo(clipDuration(c), 9);
  });
  it('MIN_CLIP is measured in timeline time: a split leaving <0.05 s of timeline is refused even if it is 0.2 s of footage', () => {
    expect(() => splitClip(proj(vc(0, 0, 10, { speed: 4 })), 'a', 0.04)).toThrow();
    expect(list(splitClip(proj(vc(0, 0, 10, { speed: 4 })), 'a', 0.06))).toHaveLength(2);
  });
});

describe('trim through the time map', () => {
  it('end trim at 2x moves `out` by twice the timeline change', () => {
    const c = trimClip(proj(vc(0, 10, 20, { speed: 2 })), 'a', 'end', 3).tracks[0].clips[0];
    expect(c.out).toBeCloseTo(16, 9);
  });
  it('start trim at 2x moves `in` by twice the change and start by it', () => {
    const c = trimClip(proj(vc(0, 10, 20, { speed: 2 })), 'a', 'start', 1).tracks[0].clips[0];
    expect([c.start, c.in, c.out]).toEqual([1, 12, 20]);
  });
  it('reverse: the start edge moves `out`, the end edge moves `in`', () => {
    const p = proj(vc(2, 10, 20, { reverse: true }));
    const s = trimClip(p, 'a', 'start', 3).tracks[0].clips[0];
    expect([s.in, s.out]).toEqual([10, 19]);
    const e = trimClip(p, 'a', 'end', 9).tracks[0].clips[0];
    expect([e.in, e.out]).toEqual([13, 20]);
  });
  it('refuses to read before the file start or past the media end, and a result shorter than MIN_CLIP', () => {
    expect(() => trimClip(proj(vc(0, 25, 28, { speed: 2 })), 'a', 'end', 3)).toThrow(/beyond source/i);
    expect(() => trimClip(proj(vc(0, 1, 5, { reverse: true })), 'a', 'end', 6)).toThrow(/beyond source/i);
    expect(() => trimClip(proj(vc(0, 0, 10, { speed: 4 })), 'a', 'end', 0.01)).toThrow(/too short/i);
  });
});

describe('drag limits (trimTarget)', () => {
  const far = 100000; // px: a drag far beyond the footage
  it('forward end stops at the media end in timeline time', () => {
    const p = proj(vc(0, 10, 20, { speed: 2 })); // media 30 s -> end at (30-10)/2 = 10 s
    expect(trimTarget(p, 'a', 'end', far, 100)).toBeCloseTo(10, 9);
  });
  it('reverse: the end edge stops where `in` reaches 0 and the start edge where `out` reaches the media end', () => {
    const p = proj(vc(5, 10, 20, { reverse: true }));
    expect(trimTarget(p, 'a', 'end', far, 100)).toBeCloseTo(5 + 20, 9); // out-0 = 20 s
    expect(trimTarget(p, 'a', 'start', -far, 100)).toBeCloseTo(5 - 10, 9); // out 20 -> 30
  });
  it('a forward start drag is not clamped here (core trimClip refuses `in < 0`)', () => {
    const p = proj(vc(5, 10, 20));
    expect(trimTarget(p, 'a', 'start', -600, 100)).toBeCloseTo(-1, 9);
    expect(() => trimClip(p, 'a', 'start', -6)).toThrow(/beyond source/i);
  });
});
