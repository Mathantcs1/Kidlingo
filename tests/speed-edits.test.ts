// Plan 5D Task 4: setSpeed / setReverse / setRamp / setPreservePitch (D6, D7): the clip keeps its start, the new length
// snaps to whole frames, an overlap is refused unless the later clips are pushed, several clips compose right to left.
import { describe, it, expect } from 'vitest';
import { clipDuration, clipEnd } from '../src/core/clipTime';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { setPreservePitch, setRamp, setReverse, setSpeed } from '../src/core/speedEdits';

const lin = { kind: 'linear' as const };
const vc = (id: string, start: number, inn: number, out: number, extra: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'video', start, in: inn, out, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
function proj(clips: Clip[], opts: { locked?: boolean; fps?: number; mediaDuration?: number } = {}): Project {
  const p = emptyProject('youtube');
  p.format = { ...p.format, fps: opts.fps ?? 30 };
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: opts.mediaDuration ?? 60, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', locked: opts.locked ?? false, clips };
  return p;
}
const clipOf = (p: Project, id: string) => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;

describe('setSpeed', () => {
  it('keeps start and the play-first edge, changes the length, snaps it to whole frames', () => {
    const p = setSpeed(proj([vc('a', 2, 5, 15)]), ['a'], 2);
    const c = clipOf(p, 'a');
    expect(c.speed).toBe(2);
    expect(c.start).toBe(2);
    expect(c.in).toBe(5);
    expect(clipDuration(c)).toBeCloseTo(5, 9); // 10 s of footage at 2x
    const q = setSpeed(proj([vc('a', 0, 0, 10)]), ['a'], 3); // 3.333.. s: snaps to 100 frames = 3.3333.. (30 fps: 10/3 s = 100 frames)
    expect(Math.round(clipDuration(clipOf(q, 'a')) * 30)).toBe(100);
    const r = setSpeed(proj([vc('a', 0, 0, 10)]), ['a'], 1.7); // 5.88235 s = 176.47 frames -> 176
    expect(clipDuration(clipOf(r, 'a')) * 30).toBeCloseTo(176, 9);
    expect(Math.abs(clipOf(r, 'a').out - 10)).toBeLessThan(1.7 / 30); // the last-played footage edge moved by less than s/fps
  });
  it('reverse keeps `out` (the edge played first) and moves `in`', () => {
    const c = clipOf(setSpeed(proj([vc('a', 0, 0, 10, { reverse: true })]), ['a'], 1.7), 'a');
    expect(c.out).toBe(10);
    expect(clipDuration(c) * 30).toBeCloseTo(176, 9);
    expect(Math.abs(c.in - 0)).toBeLessThan(1.7 / 30);
  });
  it('speed 1 removes the field; the same speed is a no-op (same reference); a ramp is replaced by the constant speed', () => {
    const p = setSpeed(proj([vc('a', 0, 0, 10)]), ['a'], 2);
    expect(clipOf(setSpeed(p, ['a'], 1), 'a')).not.toHaveProperty('speed');
    expect(setSpeed(p, ['a'], 2)).toBe(p);
    const ramped = proj([vc('a', 0, 0, 10, { speedKeys: [{ t: 0, v: 1, ease: lin }, { t: 10, v: 2, ease: lin }] })]);
    const c = clipOf(setSpeed(ramped, ['a'], 2), 'a');
    expect(c.speed).toBe(2);
    expect(c).not.toHaveProperty('speedKeys');
  });
  it('refuses a speed outside 0.25..4, non-finite speeds, images, overlays, adjustment and freeze clips, locked tracks', () => {
    const p = proj([vc('a', 0, 0, 10)]);
    for (const s of [0.2, 4.01, NaN, Infinity, 0, -1]) expect(() => setSpeed(p, ['a'], s)).toThrow();
    for (const kind of ['image', 'overlay', 'adjustment'] as const) expect(() => setSpeed(proj([vc('a', 0, 0, 10, { kind })]), ['a'], 2)).toThrow(/video and audio/i);
    expect(() => setSpeed(proj([vc('a', 0, 0, 2, { freeze: { at: 1 } })]), ['a'], 2)).toThrow(/freeze/i);
    expect(() => setSpeed(proj([vc('a', 0, 0, 10)], { locked: true }), ['a'], 2)).toThrow(/locked/i);
  });
  it('a slower speed that would overlap the next clip is refused; "push later clips" shifts them (same track only)', () => {
    const base = proj([vc('a', 0, 0, 4), vc('b', 4, 0, 4)]);
    expect(() => setSpeed(base, ['a'], 0.5)).toThrow(/overlap the next clip/i);
    const pushed = setSpeed(base, ['a'], 0.5, { ripple: true });
    expect(clipEnd(clipOf(pushed, 'a'))).toBeCloseTo(8, 9);
    expect(clipOf(pushed, 'b').start).toBeCloseTo(8, 9);
    const faster = setSpeed(base, ['a'], 2, { ripple: true }); // shorter: the later clip is pulled back
    expect(clipOf(faster, 'b').start).toBeCloseTo(2, 9);
    const two = proj([vc('a', 0, 0, 4)]);
    two.tracks.push({ ...two.tracks[1], id: 'v2', kind: 'video', clips: [vc('z', 4, 0, 4)] });
    expect(clipOf(setSpeed(two, ['a'], 0.5, { ripple: true }), 'z').start).toBe(4); // other tracks never move
  });
  it('several clips change in one result, right to left, so ripples compose', () => {
    const p = proj([vc('a', 0, 0, 2), vc('b', 2, 0, 2), vc('c', 4, 0, 2)]);
    const q = setSpeed(p, ['a', 'c'], 0.5, { ripple: true });
    expect(clipOf(q, 'a').start).toBe(0);
    expect(clipEnd(clipOf(q, 'a'))).toBeCloseTo(4, 9);
    expect(clipOf(q, 'b').start).toBeCloseTo(4, 9); // pushed by a's +2 s
    expect(clipOf(q, 'c').start).toBeCloseTo(6, 9);
    expect(clipEnd(clipOf(q, 'c'))).toBeCloseTo(10, 9);
  });
  it('fades stay in timeline seconds and are clamped to a shorter clip, not scaled; keys and presets are untouched', () => {
    const keys = { opacity: [{ t: 1, v: 0.5, ease: lin }] };
    const motion = { in: { preset: 'fade' as const, duration: 0.5, delay: 0, ease: lin, params: {} } };
    const c0 = vc('a', 0, 0, 10, { audio: { ...defaultClipAudio(), fadeIn: 3, fadeOut: 2 }, keys, motion });
    const c = clipOf(setSpeed(proj([c0]), ['a'], 4), 'a'); // 2.5 s long
    expect(c.audio.fadeIn + c.audio.fadeOut).toBeLessThanOrEqual(2.5 + 1e-9);
    expect(c.keys).toEqual(keys);
    expect(c.motion).toEqual(motion);
    const same = clipOf(setSpeed(proj([{ ...c0, audio: { ...defaultClipAudio(), fadeIn: 0.5, fadeOut: 0.5 } }]), ['a'], 2), 'a');
    expect([same.audio.fadeIn, same.audio.fadeOut]).toEqual([0.5, 0.5]);
  });
  it('refuses a result shorter than the minimum clip length and never reads past the media (the length snaps down)', () => {
    expect(() => setSpeed(proj([vc('a', 0, 0, 0.1)]), ['a'], 4)).toThrow(/too short/i);
    const p = proj([vc('a', 0, 0, 59.99)], { mediaDuration: 60 });
    const c = clipOf(setSpeed(p, ['a'], 0.97), 'a');
    expect(c.out).toBeLessThanOrEqual(60 + 1e-9);
  });
  it('never mutates its input', () => {
    const p = proj([vc('a', 0, 0, 10)]);
    const snap = JSON.stringify(p);
    setSpeed(p, ['a'], 2);
    expect(JSON.stringify(p)).toBe(snap);
  });
});

describe('setReverse / setPreservePitch / setRamp', () => {
  it('reverse toggles without changing the length; the same state is a no-op', () => {
    const p = proj([vc('a', 0, 0, 10, { speed: 2 })]);
    const r = setReverse(p, ['a'], true);
    expect(clipOf(r, 'a').reverse).toBe(true);
    expect(clipDuration(clipOf(r, 'a'))).toBe(clipDuration(clipOf(p, 'a')));
    expect(setReverse(r, ['a'], true)).toBe(r);
    expect(clipOf(setReverse(r, ['a'], false), 'a')).not.toHaveProperty('reverse');
    expect(setReverse(p, ['a'], false)).toBe(p);
  });
  it('preserve pitch off is stored as false, on removes the field; refused on images', () => {
    const p = proj([vc('a', 0, 0, 10, { speed: 2 })]);
    const off = setPreservePitch(p, ['a'], false);
    expect(clipOf(off, 'a').preservePitch).toBe(false);
    expect(clipOf(setPreservePitch(off, ['a'], true), 'a')).not.toHaveProperty('preservePitch');
    expect(setPreservePitch(p, ['a'], true)).toBe(p);
    expect(() => setPreservePitch(proj([vc('a', 0, 0, 10, { kind: 'image' })]), ['a'], false)).toThrow();
  });
  it('a ramp sets speedKeys, clears the constant speed, snaps the length to frames and null removes it', () => {
    const keys = [{ t: 0, v: 1, ease: lin }, { t: 10, v: 3, ease: lin }];
    const p = setRamp(proj([vc('a', 0, 0, 10, { speed: 2 })]), 'a', keys);
    const c = clipOf(p, 'a');
    expect(c.speedKeys).toHaveLength(2);
    expect(c).not.toHaveProperty('speed');
    expect(clipDuration(c) * 30).toBeCloseTo(Math.round(clipDuration(c) * 30), 9);
    const back = clipOf(setRamp(p, 'a', null), 'a');
    expect(back).not.toHaveProperty('speedKeys');
    expect(() => setRamp(p, 'a', [keys[0]])).toThrow(/at least two/i);
    expect(() => setRamp(p, 'a', [keys[0], { ...keys[1], v: 9 }])).toThrow();
  });
});
