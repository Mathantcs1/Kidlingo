// Plan 5C Task 8: the DOM-free maths of the transition chip and the `T` shortcut's cut search.
import { describe, it, expect } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { chipBox, dragDuration, nearestCut, MIN_CHIP_PX } from '../src/ui/transitionDrag';

const vc = (id: string, start: number, extra: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'video', start, in: 5, out: 9, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const proj = (clips: Clip[], extra: Partial<Project['tracks'][0]> = {}): Project => {
  const p = emptyProject('youtube');
  p.format = { ...p.format, fps: 30 };
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 60, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', clips, ...extra };
  return p;
};

describe('chipBox', () => {
  it('is centred on the cut and as wide as the transition', () => {
    expect(chipBox(1, 4, 60)).toEqual({ left: 210, width: 60 });
  });
  it('never gets narrower than the minimum, staying centred', () => {
    const b = chipBox(2 / 30, 4, 60); // 4 px wide
    expect(b.width).toBe(MIN_CHIP_PX);
    expect(b.left + b.width / 2).toBeCloseTo(240, 9);
  });
});

describe('dragDuration', () => {
  const base = { start: 1, pps: 60, fps: 30, max: 3 };
  it('is symmetric: the right handle moving 20 px widens by 40 px (2/3 s), the left handle the same the other way', () => {
    expect(dragDuration({ ...base, side: 'r', dxPx: 20 })).toBeCloseTo(5 / 3, 9);
    expect(dragDuration({ ...base, side: 'l', dxPx: -20 })).toBeCloseTo(5 / 3, 9);
    expect(dragDuration({ ...base, side: 'r', dxPx: -20 })).toBeCloseTo(1 / 3, 9);
  });
  it('snaps to even whole frames and stays within 2 frames .. max', () => {
    const d = dragDuration({ ...base, side: 'r', dxPx: 1.3 });
    expect(Math.round(d * 30) % 2).toBe(0);
    expect(dragDuration({ ...base, side: 'r', dxPx: -10_000 })).toBeCloseTo(2 / 30, 9);
    expect(dragDuration({ ...base, side: 'r', dxPx: 10_000 })).toBeCloseTo(3, 9);
  });
  it('ignores bad input', () => {
    expect(dragDuration({ ...base, side: 'r', dxPx: NaN })).toBe(1);
  });
});

describe('nearestCut', () => {
  it('finds the cut without a transition nearest the playhead, within the clips\' reach', () => {
    const p = proj([vc('a', 0), vc('b', 4), vc('c', 8)]);
    expect(nearestCut(p, 'v', 3.5)).toMatchObject({ trackId: 'v', time: 4 });
    expect(nearestCut(p, 'v', 7.2)).toMatchObject({ time: 8 });
  });
  it('is null on a locked track, with no cut, or when every cut already has a transition', () => {
    expect(nearestCut(proj([vc('a', 0), vc('b', 4)], { locked: true }), 'v', 4)).toBeNull();
    expect(nearestCut(proj([vc('a', 0)]), 'v', 0)).toBeNull();
    const p = proj([vc('a', 0), vc('b', 4)], { transitions: [{ id: 't', fromClipId: 'a', toClipId: 'b', type: 'dissolve', duration: 1, ease: { kind: 'linear' } }] });
    expect(nearestCut(p, 'v', 4)).toBeNull();
  });
  it('a cut far from the playhead (beyond one clip) is out of reach', () => {
    expect(nearestCut(proj([vc('a', 0), vc('b', 4)]), 'v', 40)).toBeNull();
  });
});
