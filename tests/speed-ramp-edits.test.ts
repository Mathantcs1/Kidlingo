// Plan 5D Task 10: speed ramp presets, their length (frame-snapped), overlap/ripple, and a split inside a ramp.
import { describe, it, expect } from 'vitest';
import { clipDuration, clipEnd, sourceTimeAt } from '../src/core/clipTime';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { SPEED_PRESETS, applySpeedPreset, speedPresetKeys } from '../src/core/speedPresets';
import { splitClip } from '../src/core/timeline';

const vc = (id: string, start: number, extra: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'video', start, in: 2, out: 12, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const proj = (clips: Clip[]): Project => {
  const p = emptyProject('youtube');
  p.format = { ...p.format, fps: 30 };
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 60, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', clips };
  return p;
};
const clipOf = (p: Project, id: string) => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;

describe('speed presets', () => {
  for (const { key } of SPEED_PRESETS) {
    it(`${key}: valid keys over the footage range, sorted, within 0.25..4 and at most 64`, () => {
      const keys = speedPresetKeys(key, { in: 2, out: 12 });
      expect(keys.length).toBeGreaterThanOrEqual(2);
      expect(keys.length).toBeLessThanOrEqual(64);
      expect(keys[0].t).toBe(2);
      expect(keys[keys.length - 1].t).toBe(12);
      keys.forEach((k, i) => {
        expect(k.v).toBeGreaterThanOrEqual(0.25);
        expect(k.v).toBeLessThanOrEqual(4);
        if (i > 0) expect(k.t).toBeGreaterThan(keys[i - 1].t);
      });
    });
    it(`${key}: applies as a ramp with a whole-frame length and the footage range kept (to a frame)`, () => {
      const q = applySpeedPreset(proj([vc('a', 0)]), 'a', key);
      const c = clipOf(q, 'a');
      expect(c.speedKeys).toBeDefined();
      expect(c).not.toHaveProperty('speed');
      expect(clipDuration(c) * 30).toBeCloseTo(Math.round(clipDuration(c) * 30), 9);
      expect(c.in).toBe(2);
      expect(Math.abs(c.out - 12)).toBeLessThan(0.4);
    });
  }
  it('bullet time is slower than speed 1 in the middle: the clip is longer than 10 s', () => {
    expect(clipDuration(clipOf(applySpeedPreset(proj([vc('a', 0)]), 'a', 'bullet'), 'a'))).toBeGreaterThan(10);
  });
  it('flash forward is shorter than 10 s', () => {
    expect(clipDuration(clipOf(applySpeedPreset(proj([vc('a', 0)]), 'a', 'flash'), 'a'))).toBeLessThan(10);
  });
  it('overlap with the next clip is refused unless the later clips are pushed (same track only)', () => {
    const p = proj([vc('a', 0), vc('b', 10)]);
    expect(() => applySpeedPreset(p, 'a', 'bullet')).toThrow(/overlap the next clip/i);
    const q = applySpeedPreset(p, 'a', 'bullet', { ripple: true });
    expect(clipOf(q, 'b').start).toBeCloseTo(clipEnd(clipOf(q, 'a')), 6);
  });
  it('a split inside the ramp keeps the whole ramp on both halves and the halves join on the same footage time', () => {
    const q = applySpeedPreset(proj([vc('a', 0)]), 'a', 'bullet');
    const c = clipOf(q, 'a');
    const cut = clipDuration(c) / 2;
    const s = splitClip(q, 'a', cut);
    const [l, r] = [...s.tracks[0].clips].sort((x, y) => x.start - y.start);
    expect(l.speedKeys).toEqual(c.speedKeys);
    expect(r.speedKeys).toEqual(c.speedKeys);
    expect(l.out).toBeCloseTo(sourceTimeAt(c, cut), 9);
    expect(r.in).toBe(l.out);
    expect(clipDuration(l) + clipDuration(r)).toBeCloseTo(clipDuration(c), 9);
  });
});
