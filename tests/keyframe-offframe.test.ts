// Ruling P5-6: after a split or sourced start trim at a cut that is not a whole number of frames, a clip's keys sit off
// its own frame grid. Wherever the playhead meets keys they are matched by FRAME WINDOW [u, u + 1/fps), not KEY_EPS.
import { beforeEach, describe, expect, it } from 'vitest';
import { trimClip, splitClip } from '../src/core/clipEdits';
import { moveKeys, setValueAt, targetKeys } from '../src/core/keyframeEdits';
import type { AnimTarget } from '../src/core/keyframeEdits';
import { keyIndexAtPlayhead } from '../src/core/keyframes';
import type { Clip, Project } from '../src/core/model';
import { useEditor } from '../src/state/store';
import { setTransformAt, withLiveValue } from '../src/core/transformKeyEdits';
import { snapDeltaToPlayhead } from '../src/ui/keyDrag';
import { keyAtPlayhead, keyJumpTime, keyTimelineTime, toggleKeyAtPlayheadCmd } from '../src/ui/keyframeCommands';
import { k, project } from './keyframe-fixtures';

const SCALE: AnimTarget = { kind: 'transform', prop: 'scale' };
const FPS = 30;
const scaleKeys = { scale: [k(2.5, 1), k(4, 2), k(5, 3)] };
const overlayKeys = { scale: [k(0.5, 1), k(2, 2), k(3, 3)] };

const clipAt = (p: Project, start: number): Clip => p.tracks.flatMap((t) => t.clips).find((c) => Math.abs(c.start - start) < 1e-9)!;
const withKeys = (p: Project, id: string, keys: Clip['keys']): Project =>
  ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, keys } : c)) })) });

/** Three off-frame cases; each clip starts at a cut 0.71 s (21.3 frames) after the original start. */
const CASES: { name: string; build: () => Project; start: number }[] = [
  { name: 'sourced split', build: () => splitClip(project({ keys: scaleKeys }), 'c', 10.71), start: 10.71 },
  { name: 'sourced start trim', build: () => trimClip(project({ keys: scaleKeys }), 'c', 'start', 10.71), start: 10.71 },
  { name: 'sourceless (overlay) split', build: () => splitClip(withKeys(project(), 'o', overlayKeys), 'o', 20.71), start: 20.71 },
];

/** The visible keys' diamond (timeline) times. */
const diamonds = (c: Clip): number[] =>
  (targetKeys(c, SCALE) ?? []).map((x) => keyTimelineTime(c, x.t)).filter((t) => t >= c.start && t < c.start + (c.out - c.in));

describe.each(CASES)('off-frame keys after a $name (P5-6)', ({ build, start }) => {
  let p: Project;
  let c: Clip;
  beforeEach(() => {
    p = build();
    c = clipAt(p, start);
  });

  it('the keys really are off the clip frame grid, two diamonds at 12/13 s (22/23 s)', () => {
    const d = diamonds(c);
    expect(d.length).toBe(2);
    for (const t of d) expect(Math.abs(((t - c.start) * FPS) % 1)).toBeGreaterThan(0.1);
  });

  it('keyAtPlayhead finds the key at its diamond time and anywhere in its frame, not in the frame before', () => {
    for (const t of diamonds(c)) {
      const key = keyAtPlayhead(c, SCALE, t, FPS);
      expect(key).not.toBeNull();
      expect(keyTimelineTime(c, key!.t)).toBeCloseTo(t, 9);
      const frameStart = c.start + Math.floor((t - c.start) * FPS) / FPS;
      expect(keyAtPlayhead(c, SCALE, frameStart + 1e-7, FPS)).toEqual(key);
      expect(keyAtPlayhead(c, SCALE, frameStart - 0.5 / FPS, FPS)).toBeNull();
    }
  });

  it('keyJumpTime +1 / -1 strictly move, reach every key in order and land where keyAtPlayhead sees the key', () => {
    const d = diamonds(c);
    const walk = (from: number, dir: -1 | 1): number[] => {
      const seen: number[] = [];
      let t = from;
      for (let i = 0; i < 10; i++) {
        const to = keyJumpTime(c, SCALE, t, FPS, dir);
        if (to === null) break;
        expect(dir > 0 ? to > t : to < t).toBe(true);
        expect(keyAtPlayhead(c, SCALE, to, FPS)).not.toBeNull();
        seen.push(to);
        t = to;
      }
      return seen;
    };
    expect(walk(c.start, 1).map((t) => t.toFixed(6))).toEqual(d.map((t) => t.toFixed(6)));
    expect(walk(c.start + (c.out - c.in) - 0.001, -1).map((t) => t.toFixed(6))).toEqual([...d].reverse().map((t) => t.toFixed(6)));
    // A playhead in a key's frame but before its diamond: that key is under the playhead, so +1 goes to the next one.
    const inFrame = c.start + Math.floor((d[0] - c.start) * FPS) / FPS + 1e-6;
    expect(keyJumpTime(c, SCALE, inFrame, FPS, 1)).toBeCloseTo(d[1], 9);
  });

  it('setValueAt at the diamond time (and in its frame) replaces that key: count, time and ease kept', () => {
    const before = targetKeys(c, SCALE)!;
    for (const [i, t] of diamonds(c).entries()) {
      const q = setValueAt(p, c.id, SCALE, 7 + i, i === 0 ? t : t - 0.3 / FPS);
      const after = targetKeys(clipAt(q, start), SCALE)!;
      expect(after.length).toBe(before.length);
      expect(after.map((x) => x.t)).toEqual(before.map((x) => x.t));
      const at = after.findIndex((x) => Math.abs(keyTimelineTime(c, x.t) - t) < 1e-9);
      expect((after[at] as { v: number }).v).toBe(7 + i);
      expect(after[at].ease).toEqual(before[at].ease);
    }
  });

  it('the transform field commit and the live drag preview at a diamond time replace that key too', () => {
    const [d0] = diamonds(c);
    const n = targetKeys(c, SCALE)!.length;
    for (const q of [setTransformAt(p, c.id, { scale: 9 }, d0), withLiveValue(p, c.id, { scale: 9 }, d0)]) {
      const now = clipAt(q, start);
      expect(targetKeys(now, SCALE)!.length).toBe(n);
      expect((targetKeys(now, SCALE)![keyIndexAtPlayhead(now, targetKeys(now, SCALE)!, d0, FPS)] as { v: number }).v).toBe(9);
    }
  });

  it('keyIndexAtPlayhead is -1 off the clip and on a frame without a key', () => {
    const list = targetKeys(c, SCALE)!;
    expect(keyIndexAtPlayhead(c, list, c.start - 0.5, FPS)).toBe(-1);
    expect(keyIndexAtPlayhead(c, list, c.start + 0.1, FPS)).toBe(-1);
  });

  it('the key diamond toggle removes the key at its diamond time (ONE step, no near-duplicate)', () => {
    const s = useEditor.getState();
    s.loadProject(p);
    const d = diamonds(c);
    s.setPlayhead(d[0]);
    const n = targetKeys(c, SCALE)!.length;
    toggleKeyAtPlayheadCmd(c.id, SCALE);
    const now = clipAt(useEditor.getState().history.present, start);
    expect(useEditor.getState().history.past.length).toBe(1);
    expect(targetKeys(now, SCALE)!.length).toBe(n - 1);
    expect(diamonds(now).map((t) => t.toFixed(6))).toEqual([d[1].toFixed(6)]);
  });

  it('moveKeys refuses a move into a frame that already holds a key (even more than KEY_EPS away)', () => {
    const list = targetKeys(c, SCALE)!;
    const [a, b] = list.filter((x) => keyTimelineTime(c, x.t) >= c.start);
    // a sits ~0.7 frame into its frame; moving b to 0.3 frame before a keeps it in a's frame, 10 ms from a.
    expect(() => moveKeys(p, c.id, [{ target: SCALE, t: b.t }], -(b.t - a.t) - 0.3 / FPS)).toThrow('Keyframes would overlap');
  });

  it('snapping a dragged key onto a mid-frame playhead lands it in the playhead frame', () => {
    const [d0] = diamonds(c);
    const grabbed = targetKeys(c, SCALE)!.find((x) => Math.abs(keyTimelineTime(c, x.t) - d0) < 1e-9)!.t;
    const frameStart = c.start + (Math.floor((d0 - c.start) * FPS) + 10) / FPS;
    const playhead = frameStart + 0.05 / FPS; // early in frame +10; the key sits ~0.7 frame into its own frame
    const delta = snapDeltaToPlayhead(c, grabbed, 10 / FPS - 0.01, playhead, 60, FPS);
    const moved: Clip = { ...c, keys: { scale: (c.keys!.scale!).map((x) => (x.t === grabbed ? { ...x, t: x.t + delta } : x)) } };
    expect(keyAtPlayhead(moved, SCALE, playhead, FPS)?.t).toBeCloseTo(grabbed + delta, 9);
  });
});
