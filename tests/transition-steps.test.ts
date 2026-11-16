// Plan 5C Task 4: the frame's steps (plain clips and open transitions), the clips it needs decoded, and the handle's time maps.
import { describe, it, expect } from 'vitest';
import { sourceTimeAt, videoSourceTime } from '../src/core/clipTime';
import { newTrack } from '../src/core/model';
import { activeClipsAt } from '../src/core/timeline';
import { addTransition } from '../src/core/transitionEdits';
import { edgeTime } from '../src/render/drawCollectTransition';
import { activeVisualClipsAt, frameStepsAt, isTransitionStep, visualClipsAt } from '../src/render/visible';
import { FPS, base, mk } from './transition-fixtures';

const withT = (p = base(), duration = 1) => addTransition(p, 'v', 'a', 'b', { type: 'dissolve', duration });
const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

describe('frameStepsAt', () => {
  it('without transitions the steps are exactly the active picture clips (deep equal to the old visualClipsAt)', () => {
    const p = base();
    for (const t of [0, 1.5, 3.99, 4, 7.9, 8, 11.99, 12, 20]) {
      const steps = frameStepsAt(p, t);
      expect(steps.every((s) => !isTransitionStep(s))).toBe(true);
      expect(visualClipsAt(p, t)).toEqual(activeClipsAt(p, t));
    }
  });
  it('the window is [cut - d/2, cut + d/2): start inclusive, end exclusive, at whole frames', () => {
    const p = withT();
    const at = (n: number) => frameStepsAt(p, n / FPS);
    expect(at(105 - 1).map(isTransitionStep)).toEqual([false]); // 3.4667 s
    expect(at(105).map(isTransitionStep)).toEqual([true]); // 3.5 s: first frame of the window
    expect(at(134).map(isTransitionStep)).toEqual([true]);
    expect(at(135).map(isTransitionStep)).toEqual([false]); // 4.5 s: window closed
    const s = at(105)[0];
    expect(isTransitionStep(s) && ids([s.from, s.to])).toEqual(['a', 'b']);
  });
  it('progress is 0 at the first frame, 0.5 at the cut and stays below 1 inside the window', () => {
    const p = withT();
    const u = (t: number) => { const s = frameStepsAt(p, t)[0]; return isTransitionStep(s) ? s.u : NaN; };
    expect(u(105 / FPS)).toBe(0);
    expect(u(120 / FPS)).toBeCloseTo(0.5, 12);
    expect(u(134 / FPS)).toBeLessThan(1);
  });
  it('flattens to both clips during a window (the incoming one is not yet active, the outgoing one no longer)', () => {
    const p = withT();
    expect(ids(visualClipsAt(p, 3.6))).toEqual(['a', 'b']);
    expect(ids(visualClipsAt(p, 4.2))).toEqual(['a', 'b']);
    expect(ids(activeVisualClipsAt(p, 3.6))).toEqual(['a']);
    expect(ids(activeVisualClipsAt(p, 4.2))).toEqual(['b']);
  });
  it('keeps track order across three tracks and skips hidden ones (no decoder for them)', () => {
    const p = withT();
    p.tracks.push({ ...newTrack('video'), id: 'v2', clips: [mk('x', 3, 2, 6)] });
    p.tracks.push({ ...newTrack('video'), id: 'v3', hidden: true, clips: [mk('y', 3, 2, 6)] });
    const steps = frameStepsAt(p, 3.6);
    expect(steps.map((s) => (isTransitionStep(s) ? 'T' : s.clip.id))).toEqual(['T', 'x']);
    expect(ids(visualClipsAt(p, 3.6))).toEqual(['a', 'b', 'x']);
    const hiddenT = withT();
    hiddenT.tracks[0] = { ...hiddenT.tracks[0], hidden: true };
    expect(frameStepsAt(hiddenT, 3.6)).toEqual([]);
  });
  it('an invalid transition is treated as absent', () => {
    const p = withT();
    p.tracks[0] = { ...p.tracks[0], transitions: [{ ...p.tracks[0].transitions![0], duration: 30 }] }; // longer than the handles allow
    expect(frameStepsAt(p, 3.6).every((s) => !isTransitionStep(s))).toBe(true);
  });
});

describe('handle source time (the 5D map beyond the clip edges)', () => {
  it('1x: the outgoing clip keeps playing past its out, the incoming one before its in', () => {
    const p = withT();
    const [a, b] = [p.tracks[0].clips[0], p.tracks[0].clips[1]];
    expect(sourceTimeAt(a, 4.25)).toBeCloseTo(6.25, 9);
    expect(sourceTimeAt(b, 3.75)).toBeCloseTo(1.75, 9);
  });
  it('2x, 0.5x and reversed clips continue at their own speed in the handle', () => {
    const fast = mk('a', 0, 2, 10, { speed: 2 }); // 4 s, out 10
    expect(sourceTimeAt(fast, 4.5)).toBeCloseTo(11, 9);
    const slow = mk('a', 0, 2, 4, { speed: 0.5 }); // 4 s
    expect(sourceTimeAt(slow, 4.5)).toBeCloseTo(4.25, 9);
    const rev = mk('b', 4, 2, 6, { reverse: true });
    expect(sourceTimeAt(rev, 3.75)).toBeCloseTo(6.25, 9); // before its start a reversed clip is "above" its out
    expect(videoSourceTime(rev, 3.75, FPS)).toBeLessThan(6.25 + 1e-9);
  });
});

describe('edgeTime (D10)', () => {
  it('holds the resolver at the clip edge frame: before the start, after the end, and unchanged inside', () => {
    const c = mk('a', 4, 2, 6); // 4..8
    expect(edgeTime(c, 3.6, FPS)).toBe(4);
    expect(edgeTime(c, 8.3, FPS)).toBeCloseTo(8 - 1 / FPS, 12);
    expect(edgeTime(c, 5, FPS)).toBe(5);
  });
});
