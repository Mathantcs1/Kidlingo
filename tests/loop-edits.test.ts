// Plan 5B Task 3 (D4/D7): setKeyLoop (refusals, no-ops, one project) and the loop lifecycle: removing a target's last
// key, the stopwatch off, setClipFit and withoutTransformKeys drop its loop (and orient with position) so nothing
// stale revives when keys are added again.
import { describe, expect, it } from 'vitest';
import { targetLoop } from '../src/core/targetLoops';
import { withTargetKeys } from '../src/core/animTargets';
import type { AnimTarget } from '../src/core/animTargets';
import { removeKeys, setAnimated, setValueAt } from '../src/core/keyframeEdits';
import { LOOP_NEEDS_KEYS, setKeyLoop } from '../src/core/loopEdits';
import type { KeyLoop, Project } from '../src/core/model';
import { withoutTransformKeys } from '../src/core/transformEdits';
import { setClipFit } from '../src/ui/edits';
import { clipOf, colourFx, k, pk, project } from './keyframe-fixtures';

const OP: AnimTarget = { kind: 'transform', prop: 'opacity' };
const POS: AnimTarget = { kind: 'transform', prop: 'position' };
const HUE: AnimTarget = { kind: 'effect', effectId: 'fx', param: 'hue' };
const rep: KeyLoop = { mode: 'repeat', count: null };

/** Clip 'c' (10..14 s, in 2) with two opacity keys, two position keys and two hue keys (no loops). */
const keyed = (): Project => project({
  keys: { opacity: [k(2, 0), k(3, 1)], position: [pk(2, 0, 0), pk(3, 10, 0)], scale: [k(2.5, 2)] },
  effects: [colourFx('fx', { keys: { hue: [k(2, 0), k(3, 90)] } })],
});
const json = (p: Project) => JSON.stringify(p);

describe('setKeyLoop', () => {
  it('sets a transform loop and an effect param loop, ONE new project, input untouched, other tracks shared', () => {
    const p = keyed();
    const before = json(p);
    const q = setKeyLoop(p, 'c', OP, { mode: 'pingPong', count: 3 });
    expect(clipOf(q, 'c').keys!.loops).toEqual({ opacity: { mode: 'pingPong', count: 3 } });
    const r = setKeyLoop(q, 'c', HUE, { mode: 'offset', count: null });
    expect(clipOf(r, 'c').effects[0].loops).toEqual({ hue: { mode: 'offset', count: null } });
    expect(json(p)).toBe(before);
    expect(r.tracks[1]).toBe(p.tracks[1]);
    expect(clipOf(r, 'o')).toBe(clipOf(p, 'o'));
  });

  it('the stored loop is a fresh copy; count is rounded and clamped to 1..1000', () => {
    const input: KeyLoop = { mode: 'repeat', count: 2.6 };
    const q = setKeyLoop(keyed(), 'c', OP, input);
    expect(targetLoop(clipOf(q, 'c'), OP)).toEqual({ mode: 'repeat', count: 3 });
    expect(targetLoop(clipOf(q, 'c'), OP)).not.toBe(input);
    expect(targetLoop(clipOf(setKeyLoop(keyed(), 'c', OP, { mode: 'repeat', count: 0 }), 'c'), OP)!.count).toBe(1);
    expect(targetLoop(clipOf(setKeyLoop(keyed(), 'c', OP, { mode: 'repeat', count: 5000 }), 'c'), OP)!.count).toBe(1000);
  });

  it('no-ops return the SAME project: removing an absent loop, setting the loop already there', () => {
    const p = keyed();
    expect(setKeyLoop(p, 'c', OP, null)).toBe(p);
    const q = setKeyLoop(p, 'c', OP, rep);
    expect(setKeyLoop(q, 'c', OP, { mode: 'repeat', count: null })).toBe(q);
    expect(setKeyLoop(q, 'c', POS, null)).toBe(q);
  });

  it('removing a loop drops it (and an emptied loops record)', () => {
    const q = setKeyLoop(setKeyLoop(keyed(), 'c', OP, rep), 'c', HUE, rep);
    const r = setKeyLoop(setKeyLoop(q, 'c', OP, null), 'c', HUE, null);
    expect(clipOf(r, 'c').keys!.loops).toBeUndefined();
    expect('loops' in clipOf(r, 'c').keys!).toBe(false);
    expect('loops' in clipOf(r, 'c').effects[0]).toBe(false);
    expect(json(r)).toBe(json(keyed()));
  });

  it('refuses fewer than two keys, a locked track, targets the clip cannot animate, bad input', () => {
    const p = keyed();
    expect(() => setKeyLoop(p, 'c', { kind: 'transform', prop: 'scale' }, rep)).toThrow(LOOP_NEEDS_KEYS); // 1 key
    expect(() => setKeyLoop(p, 'c', { kind: 'transform', prop: 'rotation' }, rep)).toThrow(LOOP_NEEDS_KEYS); // static
    expect(LOOP_NEEDS_KEYS).toBe('A loop needs two keyframes');
    expect(() => setKeyLoop(p, 'lc', OP, rep)).toThrow(/locked/i);
    expect(() => setKeyLoop(p, 'ac', OP, rep)).toThrow('Audio clips cannot be animated');
    expect(() => setKeyLoop(p, 'adj', { kind: 'transform', prop: 'scale' }, rep)).toThrow('Adjustment layers only animate opacity');
    expect(() => setKeyLoop(p, 'o', { kind: 'effect', effectId: 'x', param: 'hue' }, rep)).toThrow('Overlays cannot have effects');
    expect(() => setKeyLoop(p, 'c', { kind: 'effect', effectId: 'fx', param: 'nope' }, rep)).toThrow('This setting cannot be animated');
    expect(() => setKeyLoop(p, 'c', OP, { mode: 'cycle' as never, count: null })).toThrow('Unknown loop mode');
    expect(() => setKeyLoop(p, 'c', OP, { mode: 'repeat', count: Number.NaN })).toThrow('Invalid loop count');
    expect(() => setKeyLoop(p, 'nope', OP, rep)).toThrow();
  });
});

describe('loop lifecycle (D4): the loop goes with the last key', () => {
  const looped = (): Project => setKeyLoop(setKeyLoop(setKeyLoop(keyed(), 'c', OP, rep), 'c', POS, rep), 'c', HUE, rep);

  it('removing the last key of a target removes its loop (not while one key remains: then it is inert)', () => {
    const p = looped();
    const one = removeKeys(p, 'c', [{ target: OP, t: 3 }]);
    expect(targetLoop(clipOf(one, 'c'), OP)).toEqual(rep); // 1 key: inert, kept (R2-5)
    const none = removeKeys(one, 'c', [{ target: OP, t: 2 }]);
    expect(clipOf(none, 'c').keys!.opacity).toBeUndefined();
    expect(targetLoop(clipOf(none, 'c'), OP)).toBeUndefined();
    expect(clipOf(none, 'c').keys!.loops).toEqual({ position: rep });
    // Adding keys again does not revive the old loop.
    const again = setAnimated(none, 'c', OP, true, 10.5);
    expect(targetLoop(clipOf(again, 'c'), OP)).toBeUndefined();
    const fx = removeKeys(p, 'c', [{ target: HUE, t: 2 }, { target: HUE, t: 3 }]);
    expect(clipOf(fx, 'c').effects[0].keys).toBeUndefined();
    expect(clipOf(fx, 'c').effects[0].loops).toBeUndefined();
  });

  it('the stopwatch off removes the loop (and orient with position); the written value is the looped one', () => {
    const p = setKeyLoop(looped(), 'c', OP, { mode: 'offset', count: null });
    const withOrient: Project = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'c' ? { ...c, keys: { ...c.keys!, orient: true as const } } : c)) })) };
    // t = 13.5 ⇒ local 5.5: opacity offset loop gives 0.5 + 3 = 3.5 ⇒ clamped 1.
    const off = setAnimated(withOrient, 'c', OP, false, 13.5);
    expect(clipOf(off, 'c').transform.opacity).toBe(1);
    expect(targetLoop(clipOf(off, 'c'), OP)).toBeUndefined();
    expect(clipOf(off, 'c').keys!.orient).toBe(true);
    const posOff = setAnimated(off, 'c', POS, false, 13.5);
    expect(clipOf(posOff, 'c').transform.x).toBeCloseTo(5, 9); // repeat: local 5.5 ⇒ 2.5 ⇒ x 5
    expect(clipOf(posOff, 'c').keys!.orient).toBeUndefined();
    expect(clipOf(posOff, 'c').keys!.loops).toBeUndefined();
    const fxOff = setAnimated(posOff, 'c', HUE, false, 10.5);
    expect(clipOf(fxOff, 'c').effects[0].loops).toBeUndefined();
  });

  it('withTargetKeys: emptying a list drops its loop; replacing it keeps the loop; no list left ⇒ no keys object', () => {
    const c = clipOf(looped(), 'c');
    expect(withTargetKeys(c, OP, [k(2, 0), k(4, 1)]).keys!.loops).toEqual({ opacity: rep, position: rep });
    const a = withTargetKeys(withTargetKeys(withTargetKeys(c, OP, undefined), POS, []), { kind: 'transform', prop: 'scale' }, undefined);
    expect(a.keys).toBeUndefined();
    expect(withTargetKeys(c, HUE, []).effects[0]).not.toHaveProperty('loops');
    const two = { ...c, effects: [{ ...c.effects[0], keys: { ...c.effects[0].keys!, brightness: [k(2, 0), k(3, 1)] }, loops: { hue: rep, brightness: rep } }] };
    const noHue = withTargetKeys(two, HUE, undefined).effects[0];
    expect(noHue.loops).toEqual({ brightness: rep });
    expect(Object.keys(noHue.keys!)).toEqual(['brightness']);
  });

  it('setClipFit and withoutTransformKeys drop the position/scale loops and orient with their lists', () => {
    const p = looped();
    const keys = { ...clipOf(p, 'c').keys!, orient: true as const };
    const out = withoutTransformKeys(keys, ['position', 'scale'])!;
    expect(out).toEqual({ opacity: [k(2, 0), k(3, 1)], loops: { opacity: rep } });
    expect(withoutTransformKeys({ position: [pk(0, 0, 0), pk(1, 1, 1)], loops: { position: rep }, orient: true }, ['position', 'scale'])).toBeUndefined();
    expect(withoutTransformKeys(undefined, ['position'])).toBeUndefined();
    const fit = setClipFit(p, 'c', 'fill');
    expect(clipOf(fit, 'c').keys).toEqual({ opacity: [k(2, 0), k(3, 1)], loops: { opacity: rep } });
  });

  it('a value written past the last key of a looped target extends the list (period grows)', () => {
    const p = looped();
    const q = setValueAt(p, 'c', OP, 0.25, 13); // local 5
    expect(clipOf(q, 'c').keys!.opacity!.map((x) => x.t)).toEqual([2, 3, 5]);
    expect(targetLoop(clipOf(q, 'c'), OP)).toEqual(rep);
  });
});
