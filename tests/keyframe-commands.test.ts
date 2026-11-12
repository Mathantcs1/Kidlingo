// Plan 5 Task 6: store-bound keyframe commands (stopwatch, value at the playhead, key toggle, prev/next) and the pure
// helpers behind the inspector rows and the keyed on-canvas drag. Each edit is ONE undo step; refusals are toasts.
import { beforeEach, describe, expect, it } from 'vitest';
import type { AnimTarget } from '../src/core/keyframeEdits';
import type { Clip, Project } from '../src/core/model';
import { useEditor } from '../src/state/store';
import { useToasts } from '../src/ui/Toast';
import {
  jumpToKeyCmd, keyAtPlayhead, keyJumpTime, setTransformAtCmd, setValueAtCmd, toggleAnimatedCmd, toggleKeyAtPlayheadCmd,
} from '../src/ui/keyframeCommands';
import { dragPatch, scaleFromZero, transformFor } from '../src/ui/overlayHit';
import { base, video } from './overlay-fixtures';

const SCALE: AnimTarget = { kind: 'transform', prop: 'scale' };
const OP: AnimTarget = { kind: 'transform', prop: 'opacity' };
const lin = { kind: 'linear' } as const;

const state = () => useEditor.getState();
const depth = () => state().history.past.length;
const present = () => state().history.present;
const clip = (): Clip => present().tracks.flatMap((t) => t.clips).find((c) => c.id === 'c1')!;
const toasts = () => useToasts.getState().toasts.map((t) => t.message);
const json = (p: Project) => JSON.stringify(p);

/** Clip c1: video, source 1..5 s shown at 2..6 s on the timeline (local time = t − 1), at 30 fps. */
function load(over: Partial<Clip> = {}, locked = false): void {
  const p = base();
  state().loadProject({
    ...p,
    tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, locked, clips: [video('c1', { start: 2, in: 1, out: 5, ...over })] } : t)),
  });
}

beforeEach(() => {
  load();
  useToasts.setState({ toasts: [] });
});

describe('toggleAnimatedCmd', () => {
  it('on: one key at the playhead in ONE step; off: keeps the value at the playhead, removes keys, ONE step; undo exact', () => {
    state().setPlayhead(3);
    toggleAnimatedCmd('c1', SCALE);
    expect(depth()).toBe(1);
    expect(clip().keys).toEqual({ scale: [{ t: 2, v: 1, ease: lin }] });
    state().setPlayhead(4);
    setValueAtCmd('c1', SCALE, 2);
    expect(depth()).toBe(2);
    expect(clip().keys!.scale!.map((k) => [k.t, k.v])).toEqual([[2, 1], [3, 2]]);
    const keyed = json(present());
    state().setPlayhead(3.5);
    toggleAnimatedCmd('c1', SCALE);
    expect(depth()).toBe(3);
    expect(clip().keys).toBeUndefined();
    expect(clip().transform.scale).toBeCloseTo(1.5, 9);
    state().undo();
    expect(json(present())).toBe(keyed);
  });

  it('refuses with a toast and no step when the playhead is off the clip or the track is locked', () => {
    state().setPlayhead(7);
    toggleAnimatedCmd('c1', SCALE);
    expect(depth()).toBe(0);
    expect(toasts()).toEqual(['Move the playhead onto the clip to set a keyframe']);
    load({}, true);
    state().setPlayhead(3);
    toggleAnimatedCmd('c1', SCALE);
    expect(depth()).toBe(0);
    expect(toasts()).toContain('Track is locked');
  });
});

describe('setValueAtCmd / setTransformAtCmd', () => {
  it('static: the static edit (anywhere); animated: a key at the playhead; off the clip: toast, no change', () => {
    state().setPlayhead(0);
    setValueAtCmd('c1', OP, 0.5);
    expect(clip().transform.opacity).toBe(0.5);
    expect(depth()).toBe(1);
    load({ keys: { opacity: [{ t: 1, v: 0, ease: lin }] } });
    state().setPlayhead(2.5);
    setValueAtCmd('c1', OP, 1);
    expect(clip().keys!.opacity!.map((k) => [k.t, k.v])).toEqual([[1, 0], [1.5, 1]]);
    state().setPlayhead(9);
    const before = present();
    setValueAtCmd('c1', OP, 0.3);
    expect(present()).toBe(before);
    expect(toasts()).toEqual(['Move the playhead onto the clip to set a keyframe']);
  });

  it('a typed X on keyed position keeps the resolved Y, as ONE step', () => {
    load({ keys: { position: [{ t: 1, x: 0, y: 0, ease: lin }, { t: 3, x: 100, y: 200, ease: lin }] } });
    state().setPlayhead(3); // local 2: halfway
    setTransformAtCmd('c1', { x: 7 });
    expect(depth()).toBe(1);
    expect(clip().keys!.position!.map((k) => [k.t, k.x, k.y])).toEqual([[1, 0, 0], [2, 7, 100], [3, 100, 200]]);
  });
});

describe('toggleKeyAtPlayheadCmd and keyAtPlayhead', () => {
  it('static: starts animating; no key under the playhead: adds one with the shown value; on a key: removes it', () => {
    state().setPlayhead(2);
    toggleKeyAtPlayheadCmd('c1', OP);
    expect(clip().keys).toEqual({ opacity: [{ t: 1, v: 1, ease: lin }] });
    setValueAtCmd('c1', OP, 0);
    state().setPlayhead(4); // local 3
    setValueAtCmd('c1', OP, 1);
    state().setPlayhead(3); // local 2: halfway, shows 0.5
    expect(keyAtPlayhead(clip(), OP, 3, 30)).toBeNull();
    toggleKeyAtPlayheadCmd('c1', OP);
    expect(clip().keys!.opacity!.map((k) => [k.t, k.v])).toEqual([[1, 0], [2, 0.5], [3, 1]]);
    expect(keyAtPlayhead(clip(), OP, 3, 30)).toEqual({ target: OP, t: 2 });
    // Between frames on the key's frame still counts as on the key.
    expect(keyAtPlayhead(clip(), OP, 3 + 0.01, 30)).toEqual({ target: OP, t: 2 });
    const d = depth();
    toggleKeyAtPlayheadCmd('c1', OP);
    expect(depth()).toBe(d + 1);
    expect(clip().keys!.opacity!.map((k) => k.t)).toEqual([1, 3]);
  });

  it('off the clip: no key is pressed and the toggle is refused with a toast', () => {
    load({ keys: { opacity: [{ t: 1, v: 0, ease: lin }] } });
    // Local time before the clip snaps to its first frame (where the key is): still not "on the key".
    expect(keyAtPlayhead(clip(), OP, 1, 30)).toBeNull();
    state().setPlayhead(1);
    toggleKeyAtPlayheadCmd('c1', OP);
    expect(depth()).toBe(0);
    expect(toasts()).toEqual(['Move the playhead onto the clip to set a keyframe']);
  });
});

describe('jumpToKeyCmd and keyJumpTime', () => {
  const keys = {
    scale: [{ t: 1.5, v: 1, ease: lin }, { t: 3, v: 2, ease: lin }],
    opacity: [{ t: 0.5, v: 0, ease: lin }, { t: 2, v: 1, ease: lin }, { t: 6, v: 1, ease: lin }],
  };
  it('moves the playhead to the previous/next key of a target (or of any target), never into history', () => {
    load({ keys });
    state().setPlayhead(3); // local 2
    jumpToKeyCmd('c1', SCALE, 1);
    expect(state().playhead).toBeCloseTo(4, 9); // local 3
    jumpToKeyCmd('c1', SCALE, 1);
    expect(state().playhead).toBeCloseTo(4, 9); // no later scale key: stays
    jumpToKeyCmd('c1', SCALE, -1);
    expect(state().playhead).toBeCloseTo(2.5, 9);
    jumpToKeyCmd('c1', null, 1); // any target: opacity at local 2
    expect(state().playhead).toBeCloseTo(3, 9);
    expect(depth()).toBe(0);
  });

  it('ignores keys outside the visible range and steps off a key reached between frames', () => {
    load({ keys });
    const c = clip();
    expect(keyJumpTime(c, OP, 3.5, 30, -1)).toBeCloseTo(3, 9); // local 2; local 0.5 is before `in` (1): hidden
    expect(keyJumpTime(c, OP, 3.01, 30, -1)).toBeNull(); // on the key's frame: the key itself is not "previous"
    expect(keyJumpTime(c, OP, 3, 30, 1)).toBeNull(); // local 6 is after `out` (5): hidden
    expect(keyJumpTime(c, null, 2.99, 30, 1)).toBeCloseTo(3, 9);
    // A (hand-edited) key a hair after the playhead's frame counts as the key it sits on, not as the next one.
    load({ keys: { scale: [{ t: 2 + 5e-5, v: 1, ease: lin }, { t: 3, v: 2, ease: lin }] } });
    expect(keyJumpTime(clip(), SCALE, 3, 30, 1)).toBeCloseTo(4, 9);
  });

  it('pauses playback before moving the playhead', () => {
    load({ keys });
    state().setPlayhead(3);
    state().setPlaying(true);
    jumpToKeyCmd('c1', SCALE, 1);
    expect(state().playing).toBe(false);
    expect(state().playhead).toBeCloseTo(4, 9);
  });
});

describe('drag helpers', () => {
  const start = { x: 10, y: 20, scale: 1, rotation: 400, opacity: 0.5 };
  it('dragPatch names only the changed fields and keeps keyed rotation unnormalised', () => {
    expect(dragPatch(start, { ...start, x: 15 })).toEqual({ x: 15 });
    expect(dragPatch(start, { ...start, scale: 2, x: 11, y: 21 })).toEqual({ x: 11, y: 21, scale: 2 });
    // dragRotate normalises: 45° shown for a keyed 400° + 5°.
    expect(dragPatch(start, { ...start, rotation: 45 })).toEqual({ rotation: 405 });
    expect(dragPatch(start, { ...start, rotation: -170 })).toEqual({ rotation: 550 });
    expect(dragPatch({ ...start, rotation: 170 }, { ...start, rotation: -170 })).toEqual({ rotation: 190 });
    expect(dragPatch(start, start)).toEqual({});
  });

  it('a corner drag from scale 0 makes the grabbed corner follow the pointer (not stuck at the minimum)', () => {
    const fmt = { width: 1920, height: 1080 };
    const zero = { x: 0, y: 0, scale: 0, rotation: 0, opacity: 1 };
    // 200×100 source: half-diagonal 111.8 px; a pointer 223.6 px from the centre => scale 2.
    const s = scaleFromZero(zero, { width: 200, height: 100 }, { x: 960 + 200, y: 540 + 100 }, fmt);
    expect(s.scale).toBeCloseTo(2, 6);
    expect(scaleFromZero(zero, { width: 200, height: 100 }, { x: 960, y: 540 }, fmt).scale).toBe(0.02);
    // transformFor routes a corner drag of a zero-scale clip there (a 1:1 fake canvas box).
    const canvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }), clientLeft: 0, clientTop: 0, clientWidth: 1920, clientHeight: 1080,
    } as unknown as HTMLCanvasElement;
    const g = {
      handle: 'scale-br' as const, size: { width: 200, height: 100 }, format: fmt, start: zero,
      startPointer: { x: 960, y: 540 }, last: { x: 1160, y: 640, alt: false, shift: false },
    };
    expect(transformFor(g, canvas).scale).toBeCloseTo(2, 6);
  });
});

describe('static edit order (ledger M3)', () => {
  it('a static edit of an animated property on a locked track reports the lock, not the animation', async () => {
    const { setClipTransform } = await import('../src/ui/transformEdits');
    load({ keys: { scale: [{ t: 1, v: 1, ease: lin }] } }, true);
    expect(() => setClipTransform(present(), 'c1', { scale: 2 })).toThrow('Track is locked');
    load({ keys: { scale: [{ t: 1, v: 1, ease: lin }] } });
    expect(() => setClipTransform(present(), 'c1', { scale: 2 })).toThrow('This setting is animated');
  });
});
