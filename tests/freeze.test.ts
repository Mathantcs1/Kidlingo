// Plan 5D Task 4: freeze frame inserts a still at the playhead (split + still + ripple on the SAME track).
import { describe, it, expect } from 'vitest';
import { clipDuration, clipEnd, sourceTimeAt } from '../src/core/clipTime';
import { freezeFrame } from '../src/core/freezeEdits';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { detachAudio } from '../src/core/detachAudio';

const vc = (id: string, start: number, inn: number, out: number, extra: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'video', start, in: inn, out, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
function proj(clips: Clip[], locked = false): Project {
  const p = emptyProject('youtube');
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 60, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', locked, clips };
  return p;
}
const clips = (p: Project, id = 'v') => [...p.tracks.find((t) => t.id === id)!.clips].sort((a, b) => a.start - b.start);

describe('freezeFrame', () => {
  it('splits at t, inserts a silent still of that footage frame, and pushes later clips by the hold', () => {
    const p = proj([vc('a', 0, 10, 20), vc('b', 10, 0, 4)]);
    const q = freezeFrame(p, 'a', 4, 2);
    const [l, f, r, b] = clips(q);
    expect([l.start, clipEnd(l)]).toEqual([0, 4]);
    expect(f.freeze).toEqual({ at: 14 });
    expect([f.start, clipDuration(f), f.audio.silent]).toEqual([4, 2, true]);
    expect([r.start, r.in, r.out]).toEqual([6, 14, 20]);
    expect(b.start).toBe(12);
  });
  it('uses the footage frame through speed and reverse', () => {
    const p = proj([vc('a', 0, 10, 20, { speed: 2 })]);
    expect(clips(freezeFrame(p, 'a', 2, 1)).find((c) => c.freeze)!.freeze!.at).toBe(sourceTimeAt(p.tracks[0].clips[0], 2));
    const rv = proj([vc('a', 0, 10, 20, { reverse: true })]);
    expect(clips(freezeFrame(rv, 'a', 3, 1)).find((c) => c.freeze)!.freeze!.at).toBeCloseTo(17 - 1 / 60, 9); // the frame shown at 3 s (mid-frame sample)
    const still = clips(freezeFrame(p, 'a', 2, 1)).find((c) => c.freeze)!;
    expect(still.speed).toBeUndefined();
  });
  it('at the clip edges inserts before or after without splitting', () => {
    const p = proj([vc('a', 2, 10, 20)]);
    const head = clips(freezeFrame(p, 'a', 2, 2));
    expect(head).toHaveLength(2);
    expect([head[0].freeze?.at, head[0].start, head[1].start]).toEqual([10, 2, 4]);
    const tail = clips(freezeFrame(p, 'a', 12, 2));
    expect(tail).toHaveLength(2);
    expect(tail[1].freeze!.at).toBeCloseTo(20 - 1 / 30, 6);
    expect(tail[1].start).toBe(12);
  });
  it('only the same track moves; locked tracks, non-video and freeze clips and bad times are refused', () => {
    const p = proj([vc('a', 0, 0, 10)]);
    p.tracks.push({ ...p.tracks[1], id: 'v2', kind: 'video', clips: [vc('z', 8, 0, 4)] });
    expect(clips(freezeFrame(p, 'a', 4), 'v2')[0].start).toBe(8);
    expect(() => freezeFrame(proj([vc('a', 0, 0, 10)], true), 'a', 4)).toThrow(/locked/i);
    expect(() => freezeFrame(proj([vc('a', 0, 0, 10, { kind: 'image' })]), 'a', 4)).toThrow();
    expect(() => freezeFrame(proj([vc('a', 0, 0, 2, { freeze: { at: 1 } })]), 'a', 1)).toThrow();
    expect(() => freezeFrame(p, 'a', 11)).toThrow(/outside/i);
    expect(() => freezeFrame(p, 'a', NaN)).toThrow();
  });
  it('a freeze clip cannot detach audio and the input is not mutated', () => {
    const p = proj([vc('a', 0, 0, 10)]);
    const snap = JSON.stringify(p);
    const q = freezeFrame(p, 'a', 5);
    expect(JSON.stringify(p)).toBe(snap);
    const f = clips(q).find((c) => c.freeze)!;
    expect(() => detachAudio(q, f.id)).toThrow(/freeze/i);
  });
});
