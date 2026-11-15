// Plan 5D Task 5: keys, visibility, the frame grid and key drags under speed, reverse and a ramp.
import { describe, it, expect } from 'vitest';
import { resolveClip } from '../src/core/animate';
import { clipDuration, clipEnd, offsetOfLocal, sourceAtOffset } from '../src/core/clipTime';
import { snapToFrame } from '../src/core/fps';
import { moveKeys } from '../src/core/keyframeEdits';
import { keyFrame, keyVisible } from '../src/core/keyframes';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { clampDelta, diamondX, rowSummary } from '../src/ui/keyDrag';
import { keyJumpTime, keyTimelineTime } from '../src/ui/keyframeCommands';

const lin = { kind: 'linear' as const };
const FPS = 30;
const fmt = { width: 1920, height: 1080, fps: FPS };
// x runs 0 -> 100 over the footage [10, 20] (keys sit on footage time).
const keys = { position: [{ t: 10, x: 0, y: 0, ease: lin }, { t: 20, x: 100, y: 0, ease: lin }] };
const mk = (extra: Partial<Clip> = {}): Clip => ({
  id: 'a', mediaId: 'm1', kind: 'video', start: 3, in: 10, out: 20, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', keys: keys as never, ...extra,
});
const proj = (c: Clip): Project => {
  const p = emptyProject('youtube');
  p.format = { ...p.format, fps: FPS };
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 60, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', clips: [c] };
  return p;
};
const ramp = [{ t: 10, v: 1, ease: lin }, { t: 20, v: 3, ease: lin }];
const variants: [string, Partial<Clip>][] = [['2x', { speed: 2 }], ['0.5x', { speed: 0.5 }], ['reverse', { reverse: true }], ['ramp', { speedKeys: ramp }], ['reverse 2x', { reverse: true, speed: 2 }]];

describe('resolved value under speed', () => {
  for (const [name, extra] of variants) {
    it(`${name}: every output frame shows the key value of the mapped footage frame`, () => {
      const c = mk(extra);
      const frames = Math.floor(clipDuration(c) * FPS);
      for (let n = 0; n < frames; n++) {
        const t = c.start + n / FPS;
        const u = sourceAtOffset(c, snapToFrame(t - c.start, FPS));
        const x = resolveClip(c, t, fmt).transform.x;
        expect(x).toBeCloseTo(((u - 10) / 10) * 100, 6);
      }
    });
  }
  it('reverse starts at the key at `out`', () => {
    expect(resolveClip(mk({ reverse: true }), 3, fmt).transform.x).toBeCloseTo(100, 6);
  });
});

describe('visibility and the frame grid by timeline offset', () => {
  it('reverse: a key at `out` is visible (first frame), a key at `in` is off the clip', () => {
    const c = mk({ reverse: true });
    expect(keyVisible(c, 20)).toBe(true);
    expect(keyVisible(c, 10)).toBe(false);
    expect(keyFrame(c, 20, FPS)).toBe(0);
    expect(keyFrame(c, 10, FPS)).toBe(Math.round(clipDuration(c) * FPS));
  });
  it('2x: a key at footage in+2 sits on timeline offset 1 (frame 30)', () => {
    const c = mk({ speed: 2 });
    expect(offsetOfLocal(c, 12)).toBeCloseTo(1, 9);
    expect(keyFrame(c, 12, FPS)).toBe(30);
    expect(diamondX(c, 12, 100)).toBeCloseTo(100, 6);
    expect(keyTimelineTime(c, 12)).toBeCloseTo(4, 9);
  });
  it('previous/next key in TIMELINE order under reverse', () => {
    const c = mk({ reverse: true, keys: { position: [{ t: 12, x: 0, y: 0, ease: lin }, { t: 15, x: 5, y: 0, ease: lin }, { t: 18, x: 9, y: 0, ease: lin }] } as never });
    // footage 18 plays first (offset 2), then 15 (5), then 12 (8).
    expect(keyJumpTime(c, null, c.start, FPS, 1)).toBeCloseTo(c.start + 2, 9);
    expect(keyJumpTime(c, null, c.start + 2, FPS, 1)).toBeCloseTo(c.start + 5, 9);
    expect(keyJumpTime(c, null, c.start + 5, FPS, -1)).toBeCloseTo(c.start + 2, 9);
  });
  it('row summary: hidden keys before/after are judged on the timeline', () => {
    const c = mk({ reverse: true, in: 12, out: 18 });
    const s = rowSummary(c);
    expect(s.before).toBe(true); // key at 20 lies before the first played frame (out = 18)
    expect(s.after).toBe(true); // key at 10 lies after the last played frame (in = 12)
  });
});

describe('key drags in timeline frames', () => {
  const three = { position: [{ t: 10, x: 0, y: 0, ease: lin }, { t: 14, x: 40, y: 0, ease: lin }, { t: 20, x: 100, y: 0, ease: lin }] } as never;
  const move = (c: Clip, delta: number) => moveKeys(proj({ ...c, keys: three }), 'a', [{ target: { kind: 'transform', prop: 'position' } as never, t: 14 }], delta);
  it('2x: a drag of 3 frames moves the key 6 frames of footage', () => {
    const c = mk({ speed: 2 });
    const q = move(c, 3 / FPS).tracks[0].clips[0];
    expect((q.keys as never as { position: { t: number }[] }).position.map((k) => k.t).find((t) => Math.abs(t - 14.2) < 1e-6)).toBeDefined();
  });
  it('reverse: dragging later in time moves the key to LOWER footage', () => {
    const c = mk({ reverse: true });
    const q = move(c, 1 / FPS).tracks[0].clips[0];
    const ts = (q.keys as never as { position: { t: number }[] }).position.map((k) => k.t);
    expect(ts.some((t) => Math.abs(t - (14 - 1 / FPS)) < 1e-6)).toBe(true);
  });
  it('clampDelta keeps every moved key on the timeline range', () => {
    const c = mk({ speed: 2 }); // 5 s long
    expect(clampDelta(c, [14], 100, FPS)).toBeLessThanOrEqual(clipDuration(c));
    expect(clampDelta(c, [14], -100, FPS)).toBeCloseTo(-offsetOfLocal(c, 14), 6);
  });
  it('a move past the clip end is refused', () => {
    expect(() => move(mk({ speed: 2 }), 100)).toThrow(/stay on the clip/i);
  });
});

describe('clip end for sanity', () => {
  it('2x clip is half as long', () => {
    expect(clipEnd(mk({ speed: 2 }))).toBeCloseTo(3 + 5, 9);
  });
});
