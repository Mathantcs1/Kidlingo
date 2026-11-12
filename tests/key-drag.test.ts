// Plan 5 Task 8: DOM-free maths of the timeline keyframe row (summary diamonds, drag deltas, refusal preview).
import { describe, expect, it } from 'vitest';
import type { Clip, Keyframe, Project } from '../src/core/model';
import { clampDelta, diamondX, dragDelta, frameDelta, moveRefusal, rowSummary, snapDeltaToPlayhead } from '../src/ui/keyDrag';
import { base, video } from './overlay-fixtures';

const lin = { kind: 'linear' } as const;
const k = (t: number, v = 1): Keyframe => ({ t, v, ease: lin });

/** Sourced c1: source 1..5 s at timeline 2..6 (local = t − 1). */
const sourced = (keys: Clip['keys'], over: Partial<Clip> = {}): Clip => video('c1', { start: 2, in: 1, out: 5, keys, ...over });
/** Sourceless adjustment a1 at timeline 2..6 (local = t − 2; `in` ignored). */
const sourceless = (keys: Clip['keys']): Clip => ({ ...video('a1', { start: 2, in: 3, out: 7, keys }), kind: 'adjustment', mediaId: '' });

function project(c: Clip, locked = false): Project {
  const p = base();
  return { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, locked, clips: [c] } : t)) };
}

describe('rowSummary', () => {
  it('one diamond per distinct visible key time across properties and effects, sorted', () => {
    const c = sourced({ scale: [k(1.5), k(3)], opacity: [k(1.5), k(2)] }, {
      effects: [{ id: 'e1', type: 'colour', enabled: true, params: { brightness: 0 }, keys: { brightness: [k(2.00001), k(4)] } }],
    } as Partial<Clip>);
    expect(rowSummary(c).times).toEqual([1.5, 2, 3, 4]);
  });

  it('keys beyond either edge are hidden and flagged; a key exactly at the end is beyond it', () => {
    const c = sourced({ scale: [k(0.5), k(1), k(4), k(5), k(6)] });
    expect(rowSummary(c)).toEqual({ times: [1, 4], before: true, after: true });
    expect(rowSummary(sourced({ scale: [k(2)] }))).toEqual({ times: [2], before: false, after: false });
  });

  it('sourceless clips use local 0..duration; audio and static clips show nothing', () => {
    expect(rowSummary(sourceless({ opacity: [k(0), k(1), k(4.5)] }))).toEqual({ times: [0, 1], before: false, after: true });
    expect(rowSummary(sourced(undefined))).toEqual({ times: [], before: false, after: false });
    const audio: Clip = { ...sourced({ scale: [k(0.5), k(2)] }), kind: 'audio' };
    expect(rowSummary(audio)).toEqual({ times: [], before: false, after: false });
  });
});

describe('diamondX (D3 key time -> timeline px within the clip)', () => {
  it('sourced: (u − in) · pps; sourceless: u · pps', () => {
    expect(diamondX(sourced({ scale: [k(1.5)] }), 1.5, 60)).toBeCloseTo(30, 9);
    expect(diamondX(sourceless({ opacity: [k(1.5)] }), 1.5, 60)).toBeCloseTo(90, 9);
  });
});

describe('frameDelta', () => {
  it.each([[25], [30], [60]])('rounds a pixel delta to whole frames at %i fps', (fps) => {
    for (const dx of [-97, -13, -1, 0, 1, 7, 13, 61, 250]) {
      const d = frameDelta(dx, 60, fps);
      expect(Math.abs(d * fps - Math.round(d * fps))).toBeLessThan(1e-9);
      expect(Math.abs(d - dx / 60)).toBeLessThanOrEqual(0.5 / fps + 1e-12);
    }
  });

  it('non-finite or zero pps gives 0', () => {
    expect(frameDelta(Number.NaN, 60, 30)).toBe(0);
    expect(frameDelta(10, 0, 30)).toBe(0);
  });
});

describe('clampDelta', () => {
  const c = sourced({ scale: [k(1.5), k(3)] }); // visible local [1, 5)

  it('keeps every moved key inside the visible range [lo, hi) by whole frames', () => {
    expect(clampDelta(c, [1.5, 3], -2, 30)).toBeCloseTo(-0.5, 9);
    expect(clampDelta(c, [1.5, 3], 5, 30)).toBeCloseTo(2 - 1 / 30, 9);
    expect(clampDelta(c, [1.5, 3], 0.5, 30)).toBeCloseTo(0.5, 9);
    expect(clampDelta(c, [3], 3, 25)).toBeCloseTo(2 - 1 / 25, 9);
  });

  it('nothing selected or no room => 0', () => {
    expect(clampDelta(c, [], 1, 30)).toBe(0);
  });
});

describe('snapDeltaToPlayhead', () => {
  const c = sourced({ scale: [k(1.5), k(3)] });
  it('snaps the grabbed key to the playhead within 8 px, else leaves the delta', () => {
    // grabbed local 1.5 = timeline 2.5; playhead 3.0; delta 0.4 s => 2.9, 6 px away at 60 pps => snaps to 0.5.
    expect(snapDeltaToPlayhead(c, 1.5, 0.4, 3, 60, 30)).toBeCloseTo(0.5, 9);
    expect(snapDeltaToPlayhead(c, 1.5, 0.3, 3, 60, 30)).toBeCloseTo(0.3, 9); // 12 px away
  });
});

describe('dragDelta', () => {
  it('pixels -> frames -> playhead snap -> clamp', () => {
    const c = sourced({ scale: [k(1.5), k(3)] });
    const at = { clip: c, times: [1.5], grabbed: 1.5, pps: 60, fps: 30, playhead: 0 };
    expect(dragDelta({ ...at, dxPx: 29 })).toBeCloseTo(0.5, 9);
    expect(dragDelta({ ...at, dxPx: 1000 })).toBeCloseTo(3.5 - 1 / 30, 9);
    expect(dragDelta({ ...at, dxPx: 25, playhead: 3 })).toBeCloseTo(0.5, 9);
  });
});

describe('moveRefusal', () => {
  it('previews the core refusal (overlap, locked) without changing anything', () => {
    const c = sourced({ scale: [k(1.5), k(3)] });
    const refs = [{ target: { kind: 'transform', prop: 'scale' } as const, t: 1.5 }];
    expect(moveRefusal(project(c), 'c1', refs, 1.5)).toBe('Keyframes would overlap');
    expect(moveRefusal(project(c), 'c1', refs, 0.5)).toBeNull();
    expect(moveRefusal(project(c, true), 'c1', refs, 0.5)).toBe('Track is locked');
  });
});
