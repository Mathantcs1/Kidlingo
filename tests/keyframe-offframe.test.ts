// Ruling P5-6: after a split or sourced start trim at a cut that is not a whole number of frames, a clip's keys sit off
// its own frame grid. Wherever the playhead meets keys they are matched by FRAME WINDOW [u, u + 1/fps), not KEY_EPS.
import { beforeEach, describe, expect, it } from 'vitest';
import { trimClip, splitClip } from '../src/core/clipEdits';
import { moveKeys, setValueAt, targetKeys, targetValueAt } from '../src/core/keyframeEdits';
import type { AnimTarget } from '../src/core/keyframeEdits';
import { resolvedTransform } from '../src/core/animate';
import type { Ease } from '../src/core/easing';
import { KEY_EPS, keyIndexAtPlayhead, localTime } from '../src/core/keyframes';
import type { Clip, Project } from '../src/core/model';
import { useEditor } from '../src/state/store';
import { setTransformAt, withLiveValue } from '../src/core/transformKeyEdits';
import { snapDeltaToPlayhead } from '../src/ui/keyDrag';
import { keyAtPlayhead, keyJumpTime, keyTimelineTime, toggleKeyAtPlayheadCmd } from '../src/ui/keyframeCommands';
import { k, lin, project } from './keyframe-fixtures';

const SCALE: AnimTarget = { kind: 'transform', prop: 'scale' };
const FPS = 30;
const HOLD: Ease = { kind: 'hold' };
const scaleKeys = (e: Ease = lin) => ({ scale: [k(2.5, 1, e), k(4, 2, e), k(5, 3, e)] });
const overlayKeys = (e: Ease = lin) => ({ scale: [k(0.5, 1, e), k(2, 2, e), k(3, 3, e)] });

const clipAt = (p: Project, start: number): Clip => p.tracks.flatMap((t) => t.clips).find((c) => Math.abs(c.start - start) < 1e-9)!;
const withKeys = (p: Project, id: string, keys: Clip['keys']): Project =>
  ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, keys } : c)) })) });

/** Three off-frame cases; each clip starts at a cut 0.71 s (21.3 frames) after the original start. `e`: every key's ease. */
const CASES: { name: string; build: (e?: Ease) => Project; start: number }[] = [
  { name: 'sourced split', build: (e) => splitClip(project({ keys: scaleKeys(e) }), 'c', 10.71), start: 10.71 },
  { name: 'sourced start trim', build: (e) => trimClip(project({ keys: scaleKeys(e) }), 'c', 'start', 10.71), start: 10.71 },
  { name: 'sourceless (overlay) split', build: (e) => splitClip(withKeys(project(), 'o', overlayKeys(e)), 'o', 20.71), start: 20.71 },
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

  it.each([['linear', lin], ['hold', HOLD]] as const)(
    'P5-7: setValueAt at the diamond (and in its frame) replaces that key and moves it to the frame start (%s segments)',
    (_, ease) => {
      const p0 = build(ease);
      const c0 = clipAt(p0, start);
      const before = targetKeys(c0, SCALE)!;
      for (const [i, t] of diamonds(c0).entries()) {
        const at = i === 0 ? t : t - 0.3 / FPS;
        const q = setValueAt(p0, c0.id, SCALE, 7 + i, at);
        const now = clipAt(q, start);
        const after = targetKeys(now, SCALE)!;
        const j = before.findIndex((x) => Math.abs(keyTimelineTime(c0, x.t) - t) < 1e-9);
        const u = localTime(c0, at, FPS);
        expect(after.length).toBe(before.length);
        expect(after.map((x) => x.t)).toEqual(before.map((x, n) => (n === j ? u : x.t)));
        expect(Math.abs(before[j].t - u) * FPS).toBeGreaterThan(0.1); // really moved, by less than one frame
        expect(Math.abs(before[j].t - u) * FPS).toBeLessThan(1);
        expect((after[j] as { v: number }).v).toBe(7 + i);
        expect(after[j].ease).toEqual(before[j].ease);
        // The field and the rendered frame show exactly what was typed; the key is still the one under the playhead.
        expect(targetValueAt(now, SCALE, at, FPS)).toBe(7 + i);
        expect(resolvedTransform(now, at, FPS).scale).toBe(7 + i);
        expect(keyIndexAtPlayhead(now, after, at, FPS)).toBe(j);
        // The next frame starts from the typed key: held on it (hold, or after the last key), else moving toward the next.
        const next = targetValueAt(now, SCALE, at + 1 / FPS, FPS) as number;
        if (ease.kind === 'hold' || j === after.length - 1) expect(next).toBe(7 + i);
        else expect((next - (7 + i)) * ((after[j + 1] as { v: number }).v - (7 + i))).toBeGreaterThan(0);
      }
    },
  );

  it('P5-7: retyping the key value at the playhead also moves it (so the frame shows it); a second edit is a no-op', () => {
    const [d0] = diamonds(c);
    const list = targetKeys(c, SCALE)!;
    const j = keyIndexAtPlayhead(c, list, d0, FPS);
    const v = (list[j] as { v: number }).v;
    const q = setValueAt(p, c.id, SCALE, v, d0);
    expect(q).not.toBe(p);
    expect(targetKeys(clipAt(q, start), SCALE)![j].t).toBe(localTime(c, d0, FPS));
    expect(setValueAt(q, c.id, SCALE, v, d0)).toBe(q);
  });

  it('P5-7: the key keeps its time when the frame start is within KEY_EPS of another key (never two keys that close)', () => {
    const [d0] = diamonds(c);
    const list = c.keys!.scale!;
    const j = keyIndexAtPlayhead(c, list, d0, FPS);
    const u = localTime(c, d0, FPS);
    // A key just before the frame start (the previous frame's window), KEY_EPS / 2 from u.
    const crowded = withKeys(p, c.id, { scale: [...list.slice(0, j), k(u - KEY_EPS / 2, 5), ...list.slice(j)] });
    const c1 = clipAt(crowded, start);
    expect(keyIndexAtPlayhead(c1, targetKeys(c1, SCALE)!, d0, FPS)).toBe(j + 1);
    for (const q of [setValueAt(crowded, c.id, SCALE, 9, d0), withLiveValue(crowded, c.id, { scale: 9 }, d0)]) {
      const after = targetKeys(clipAt(q, start), SCALE)!;
      expect(after.length).toBe(list.length + 1);
      expect(after[j + 1].t).toBe(list[j].t);
      expect((after[j + 1] as { v: number }).v).toBe(9);
      for (let n = 1; n < after.length; n++) expect(after[n].t - after[n - 1].t).toBeGreaterThanOrEqual(KEY_EPS);
    }
  });

  it('the nearest-key rule is unchanged: a key KEY_EPS / 2 before a keyless frame gets the value and keeps its time (M-2)', () => {
    const t = c.start + 0.1;
    const u = localTime(c, t, FPS);
    const list = c.keys!.scale!;
    const near = withKeys(p, c.id, { scale: [...list, k(u - KEY_EPS / 2, 5)].sort((a, b) => a.t - b.t) });
    const after = targetKeys(clipAt(setValueAt(near, c.id, SCALE, 9, t), start), SCALE)!;
    expect(after.length).toBe(list.length + 1);
    expect(after.find((x) => (x as { v: number }).v === 9)!.t).toBe(u - KEY_EPS / 2);
  });

  it('the transform field commit and the live drag preview at a diamond time give exactly the setValueAt result', () => {
    const [d0, d1] = diamonds(c);
    for (const t of [d0, d1 - 0.3 / FPS]) {
      const want = targetKeys(clipAt(setValueAt(p, c.id, SCALE, 9, t), start), SCALE);
      for (const q of [setTransformAt(p, c.id, { scale: 9 }, t), withLiveValue(p, c.id, { scale: 9 }, t)]) {
        const now = clipAt(q, start);
        expect(targetKeys(now, SCALE)).toEqual(want);
        expect(resolvedTransform(now, t, FPS).scale).toBe(9);
      }
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

describe('frame-aligned keys (P5-7 changes nothing there)', () => {
  it('the key under the playhead keeps its exact time and only its value changes', () => {
    const p = project({ keys: scaleKeys() });
    const q = setValueAt(p, 'c', SCALE, 9, 10 + (4 - 2));
    expect(targetKeys(clipAt(q, 10), SCALE)).toEqual([k(2.5, 1), k(4, 9), k(5, 3)]);
    expect(setValueAt(q, 'c', SCALE, 9, 10 + (4 - 2))).toBe(q);
  });
});
