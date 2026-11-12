// Plan 5 Task 4: pure keyframe edits (D2, D8, D11): stopwatch on/off, keyed writes at the playhead, key removal,
// retiming and eases; refusals; same-reference no-ops; static edits refuse animated properties.
import { describe, expect, it } from 'vitest';
import {
  animatedTargets, keyRefsAt, keyTimes, moveKeys, removeKeys, setAnimated, setKeyEase, setValueAt,
} from '../src/core/keyframeEdits';
import type { AnimTarget } from '../src/core/keyframeEdits';
import { KEY_EPS, MAX_KEYS } from '../src/core/keyframes';
import { migrateProject } from '../src/core/migrate';
import type { Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { updateVideoEffect } from '../src/core/videoEffectEdits';
import { setClipTransform, setTransformAt, withLiveValue } from '../src/ui/transformEdits';
import { clipOf, colourFx, k, lin, pk, project, rng } from './keyframe-fixtures';

const SCALE: AnimTarget = { kind: 'transform', prop: 'scale' };
const ROT: AnimTarget = { kind: 'transform', prop: 'rotation' };
const OP: AnimTarget = { kind: 'transform', prop: 'opacity' };
const POS: AnimTarget = { kind: 'transform', prop: 'position' };
const BRIGHT: AnimTarget = { kind: 'effect', effectId: 'fx', param: 'brightness' };
const snap = (p: Project) => JSON.stringify(p);
const refused = (fn: () => unknown, msg: RegExp | string) => {
  expect(fn).toThrow(TimelineError);
  expect(fn).toThrow(msg);
};

describe('setAnimated', () => {
  it('on: one linear key at the local playhead time holding the current value; static field untouched', () => {
    const p = project({ transform: { x: 5, y: -6, scale: 1.5, rotation: 30, opacity: 0.8 } });
    const before = snap(p);
    const q = setAnimated(p, 'c', SCALE, true, 11);
    expect(snap(p)).toBe(before);
    expect(clipOf(q, 'c').keys).toEqual({ scale: [k(3, 1.5)] });
    expect(clipOf(q, 'c').transform.scale).toBe(1.5);
    expect(clipOf(setAnimated(p, 'c', POS, true, 11.5), 'c').keys).toEqual({ position: [pk(3.5, 5, -6)] });
    const e = clipOf(setAnimated(p, 'c', BRIGHT, true, 11), 'c').effects[0];
    expect(e.keys).toEqual({ brightness: [k(3, 0)] });
    // A sourceless clip's key time ignores `in`.
    expect(clipOf(setAnimated(p, 'o', OP, true, 21), 'o').keys).toEqual({ opacity: [k(1, 1)] });
    expect(q.tracks[1]).toBe(p.tracks[1]);
  });

  it('on: same project when already animated; off: same project when static', () => {
    const p = project({ keys: { scale: [k(3, 2)] } });
    expect(setAnimated(p, 'c', SCALE, true, 11)).toBe(p);
    expect(setAnimated(p, 'c', ROT, false, 11)).toBe(p);
  });

  it('off: writes the resolved value at the playhead into the static field and removes the keys', () => {
    const p = project({ keys: { scale: [k(3, 1), k(4, 3)], opacity: [k(2, 0.5)] } });
    const q = setAnimated(p, 'c', SCALE, false, 11.5);
    expect(clipOf(q, 'c').transform.scale).toBeCloseTo(2, 12);
    expect(clipOf(q, 'c').keys).toEqual({ opacity: [k(2, 0.5)] });
    const r = setAnimated(q, 'c', OP, false, 11.5);
    expect('keys' in clipOf(r, 'c')).toBe(false);
    expect(clipOf(r, 'c').transform.opacity).toBe(0.5);
  });

  it('off: keyed multi-turn rotation is normalised on write-back (P5-3)', () => {
    const p = project({ keys: { rotation: [k(2, 0), k(3, 1800)] } });
    expect(clipOf(setAnimated(p, 'c', ROT, false, 10 + 8 / 30), 'c').transform.rotation).toBeCloseTo(120, 9);
    expect(clipOf(setAnimated(p, 'c', ROT, false, 13), 'c').transform.rotation).toBe(0);
  });

  it('off: position and effect params; the emptied effect keys object goes away', () => {
    const p = project({
      keys: { position: [pk(2, 0, 0), pk(4, 100, -50)] },
      effects: [colourFx('fx', { keys: { brightness: [k(2, -0.5), k(4, 0.5)] } })],
    });
    const q = setAnimated(setAnimated(p, 'c', POS, false, 11), 'c', BRIGHT, false, 11);
    const c = clipOf(q, 'c');
    expect(c.transform).toMatchObject({ x: 50, y: -25 });
    expect(c.effects[0].params.brightness).toBeCloseTo(0, 12);
    expect('keys' in c).toBe(false);
    expect('keys' in c.effects[0]).toBe(false);
  });

  it('refusals: locked track, audio clip, adjustment transform other than opacity, overlay effects, non-animatable or unknown params, outside the clip', () => {
    const p = project();
    refused(() => setAnimated(p, 'lc', SCALE, true, 11), 'Track is locked');
    refused(() => setAnimated(p, 'ac', OP, true, 11), /Audio clips/);
    refused(() => setAnimated(p, 'adj', SCALE, true, 31), /only animate opacity/);
    expect(clipOf(setAnimated(p, 'adj', OP, true, 31), 'adj').keys).toEqual({ opacity: [k(1, 1)] });
    refused(() => setAnimated(p, 'o', { kind: 'effect', effectId: 'fx', param: 'brightness' }, true, 21), /Overlays cannot have effects/);
    refused(() => setAnimated(p, 'c', { kind: 'effect', effectId: 'mr', param: 'mode' }, true, 11), /cannot be animated/);
    refused(() => setAnimated(p, 'c', { kind: 'effect', effectId: 'fx', param: 'nope' }, true, 11), /cannot be animated/);
    refused(() => setAnimated(p, 'c', { kind: 'effect', effectId: 'zz', param: 'brightness' }, true, 11), /Effect not found/);
    refused(() => setAnimated(p, 'c', SCALE, true, 9), 'Move the playhead onto the clip to set a keyframe');
    refused(() => setAnimated(p, 'c', SCALE, true, 14), 'Move the playhead onto the clip to set a keyframe');
    refused(() => setAnimated(p, 'c', SCALE, true, NaN), /Invalid/);
  });
});

describe('setValueAt', () => {
  it('static property: exactly the static edit (same clamps), allowed with the playhead anywhere', () => {
    const p = project();
    expect(setValueAt(p, 'c', SCALE, 50, 0)).toEqual(setClipTransform(p, 'c', { scale: 50 }));
    expect(clipOf(setValueAt(p, 'c', ROT, 270, 11), 'c').transform.rotation).toBe(-90);
    expect(clipOf(setValueAt(p, 'c', POS, { x: 1e6, y: 3 }, 11), 'c').transform).toMatchObject({ x: 7680, y: 3 });
    expect(setValueAt(p, 'c', BRIGHT, 0.3, 11)).toEqual(updateVideoEffect(p, 'c', 'fx', { params: { brightness: 0.3 } }));
    expect(setValueAt(p, 'c', SCALE, 1, 11)).toBe(p);
    expect('keys' in clipOf(setValueAt(p, 'c', SCALE, 2, 11), 'c')).toBe(false);
  });

  it('animated: replaces a key within KEY_EPS (keeping its time and ease), same project when equal', () => {
    const p = project({ keys: { scale: [k(3, 1, { kind: 'easeIn' }), k(4, 2)] } });
    const q = setValueAt(p, 'c', SCALE, 1.5, 11 + KEY_EPS / 2);
    expect(clipOf(q, 'c').keys?.scale).toEqual([k(3, 1.5, { kind: 'easeIn' }), k(4, 2)]);
    expect(clipOf(q, 'c').transform.scale).toBe(1);
    expect(setValueAt(q, 'c', SCALE, 1.5, 11)).toBe(q);
  });

  it('animated: inserts with the ease of the segment it splits, linear at either end', () => {
    const ease = { kind: 'bezier' as const, bezier: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number] };
    const p = project({ keys: { opacity: [k(3, 0, ease), k(5, 1)] } });
    expect(clipOf(setValueAt(p, 'c', OP, 0.3, 12), 'c').keys?.opacity).toEqual([k(3, 0, ease), k(4, 0.3, ease), k(5, 1)]);
    expect(clipOf(setValueAt(p, 'c', OP, 0.3, 10), 'c').keys?.opacity).toEqual([k(2, 0.3), k(3, 0, ease), k(5, 1)]);
    expect(clipOf(setValueAt(p, 'c', OP, 0.3, 13.5), 'c').keys?.opacity).toEqual([k(3, 0, ease), k(5, 1), k(5.5, 0.3)]);
    const q = setValueAt(p, 'c', OP, 0.3, 12);
    expect(clipOf(q, 'c').keys!.opacity![1].ease).not.toBe(ease);
  });

  it('animated: key values clamp like the static edits (scaleBounds at the resolved value, opacity, position reach, schema); keyed rotation is not normalised', () => {
    const p = project({
      keys: { scale: [k(2, 1)], rotation: [k(2, 0)], opacity: [k(2, 1)], position: [pk(2, 0, 0)] },
      effects: [colourFx('fx', { keys: { brightness: [k(2, 0)] } })],
    });
    const at = (target: AnimTarget, v: number | { x: number; y: number }) => setValueAt(p, 'c', target, v, 10);
    expect(clipOf(at(SCALE, 50), 'c').keys?.scale).toEqual([k(2, 20)]);
    expect(clipOf(at(SCALE, 0), 'c').keys?.scale).toEqual([k(2, 0.02)]);
    expect(clipOf(at(ROT, 720), 'c').keys?.rotation).toEqual([k(2, 720)]);
    expect(clipOf(at(ROT, -50000), 'c').keys?.rotation).toEqual([k(2, -36000)]);
    expect(clipOf(at(OP, 2), 'c').keys?.opacity).toEqual([k(2, 1)]);
    expect(clipOf(at(OP, -0), 'c').keys?.opacity).toEqual([k(2, 0)]);
    expect(Object.is(clipOf(at(OP, -0), 'c').keys!.opacity![0].v, 0)).toBe(true);
    expect(clipOf(at(POS, { x: -1e9, y: 1e9 }), 'c').keys?.position).toEqual([pk(2, -7680, 4320)]);
    expect(clipOf(at(BRIGHT, 9), 'c').effects[0].keys).toEqual({ brightness: [k(2, 1)] });
    // A scale already above 20 keeps its range (scaleBounds widened to the resolved value).
    const big = project({ keys: { scale: [k(2, 40)] } });
    expect(clipOf(setValueAt(big, 'c', SCALE, 45, 10), 'c').keys?.scale).toEqual([k(2, 40)]);
    expect(clipOf(setValueAt(big, 'c', SCALE, 30, 10), 'c').keys?.scale).toEqual([k(2, 30)]);
  });

  it('refusals: outside the clip (animated only), non-finite or wrongly shaped values, locked, MAX_KEYS', () => {
    const p = project({ keys: { scale: [k(3, 1)] } });
    refused(() => setValueAt(p, 'c', SCALE, 2, 15), 'Move the playhead onto the clip to set a keyframe');
    refused(() => setValueAt(p, 'c', SCALE, NaN, 11), /Invalid/);
    refused(() => setValueAt(p, 'c', SCALE, { x: 1, y: 2 }, 11), /Invalid/);
    refused(() => setValueAt(p, 'c', POS, 3, 11), /Invalid/);
    refused(() => setValueAt(p, 'c', POS, { x: 1, y: Infinity }, 11), /Invalid/);
    refused(() => setValueAt(p, 'lc', SCALE, 2, 11), 'Track is locked');
    const full = project({ keys: { scale: Array.from({ length: MAX_KEYS }, (_, i) => k(2 + i * 0.001, 1)) } });
    refused(() => setValueAt(full, 'c', SCALE, 2, 13.9), 'At most 500 keyframes per setting');
    // Replacing an existing key is still allowed at the limit.
    expect(clipOf(setValueAt(full, 'c', SCALE, 2, 10), 'c').keys?.scale?.[0].v).toBe(2);
  });

  it('every edited key list survives migration unchanged (one tooClose rule, P5-4)', () => {
    const r = rng(7);
    let p = project({ keys: { scale: [k(2, 1)], position: [pk(2, 0, 0)] }, effects: [colourFx('fx', { keys: { hue: [k(2, 0)] } })] });
    for (let i = 0; i < 400; i++) {
      const t = 10 + Math.floor(r() * 120) / 30 + (r() < 0.3 ? r() * 2e-4 : 0);
      const which = r();
      if (which < 0.4) p = setValueAt(p, 'c', SCALE, r() * 30, t);
      else if (which < 0.7) p = setValueAt(p, 'c', POS, { x: r() * 2000 - 1000, y: r() * 9000 - 4500 }, t);
      else p = setValueAt(p, 'c', { kind: 'effect', effectId: 'fx', param: 'hue' }, r() * 400 - 200, t);
    }
    const m = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(m.ok && clipOf(m.project, 'c')).toEqual(clipOf(p, 'c'));
  });
});

describe('static edits refuse animated properties (D8)', () => {
  it('setClipTransform refuses a patch touching an animated property, allows the rest', () => {
    const p = project({ keys: { position: [pk(2, 0, 0)], opacity: [k(2, 1)] } });
    refused(() => setClipTransform(p, 'c', { x: 5 }), 'This setting is animated: change it at the playhead');
    refused(() => setClipTransform(p, 'c', { y: 5 }), 'This setting is animated: change it at the playhead');
    refused(() => setClipTransform(p, 'c', { opacity: 0.5 }), 'This setting is animated: change it at the playhead');
    expect(clipOf(setClipTransform(p, 'c', { scale: 2 }), 'c').transform.scale).toBe(2);
  });

  it('updateVideoEffect refuses a patch of an animated param, allows other params and enabled', () => {
    const p = project({ effects: [colourFx('fx', { keys: { brightness: [k(2, 0)] } })] });
    refused(() => updateVideoEffect(p, 'c', 'fx', { params: { brightness: 0.2 } }), 'This setting is animated: change it at the playhead');
    expect(clipOf(updateVideoEffect(p, 'c', 'fx', { params: { contrast: 0.2 } }), 'c').effects[0].params.contrast).toBe(0.2);
    expect(clipOf(updateVideoEffect(p, 'c', 'fx', { enabled: false }), 'c').effects[0].enabled).toBe(false);
  });
});

describe('removeKeys', () => {
  const p = project({ transform: { x: 0, y: 0, scale: 5, rotation: 0, opacity: 1 }, keys: { scale: [k(2, 1), k(3, 2), k(4, 3)], rotation: [k(3, 450)] } });
  it('removes the referenced keys (matched within KEY_EPS); same project when nothing matches', () => {
    const q = removeKeys(p, 'c', [{ target: SCALE, t: 3 + KEY_EPS / 3 }]);
    expect(clipOf(q, 'c').keys?.scale).toEqual([k(2, 1), k(4, 3)]);
    expect(removeKeys(p, 'c', [{ target: SCALE, t: 3.5 }, { target: OP, t: 3 }])).toBe(p);
    expect(removeKeys(p, 'c', [])).toBe(p);
  });
  it('removing the last key leaves the property static at that key value (rotation normalised)', () => {
    const q = removeKeys(p, 'c', [{ target: ROT, t: 3 }]);
    expect(clipOf(q, 'c').transform.rotation).toBe(90);
    expect(clipOf(q, 'c').keys).toEqual({ scale: p.tracks[0].clips[0].keys!.scale });
    const r = removeKeys(q, 'c', [2, 3, 4].map((t) => ({ target: SCALE, t })));
    expect('keys' in clipOf(r, 'c')).toBe(false);
    // Every key removed at once: the EARLIEST key's value (Ruling T4-2).
    expect(clipOf(r, 'c').transform.scale).toBe(1);
    expect(clipOf(removeKeys(q, 'c', [4, 3, 2].map((t) => ({ target: SCALE, t }))), 'c').transform.scale).toBe(1);
  });
  it('locked track refused', () => {
    refused(() => removeKeys(project({ keys: { scale: [k(2, 1)] } }), 'lc', [{ target: SCALE, t: 2 }]), 'Track is locked');
  });
});

describe('moveKeys', () => {
  const p = project({ keys: { scale: [k(2, 1), k(3, 2), k(4, 3), k(5, 4)] }, effects: [colourFx('fx', { keys: { brightness: [k(3, 0.5)] } })] });
  it('retimes the selected keys of every target by delta, keeping order; others untouched', () => {
    const q = moveKeys(p, 'c', [{ target: SCALE, t: 3 }, { target: SCALE, t: 4 }, { target: BRIGHT, t: 3 }], 0.5);
    expect(clipOf(q, 'c').keys?.scale).toEqual([k(2, 1), k(3.5, 2), k(4.5, 3), k(5, 4)]);
    expect(clipOf(q, 'c').effects[0].keys).toEqual({ brightness: [k(3.5, 0.5)] });
    const back = moveKeys(p, 'c', [{ target: SCALE, t: 5 }], -2.5);
    expect(clipOf(back, 'c').keys?.scale?.map((x) => x.t)).toEqual([2, 2.5, 3, 4]);
  });
  it('refuses overlap with an unselected key and leaving the clip; same project for 0 or no match', () => {
    refused(() => moveKeys(p, 'c', [{ target: SCALE, t: 3 }], 1 + KEY_EPS / 2), 'Keyframes would overlap');
    refused(() => moveKeys(p, 'c', [{ target: SCALE, t: 5 }], 1.01), 'Keyframes must stay on the clip');
    refused(() => moveKeys(p, 'c', [{ target: SCALE, t: 2 }], -0.01), 'Keyframes must stay on the clip');
    expect(moveKeys(p, 'c', [{ target: SCALE, t: 5 }], 1).tracks).not.toBe(p.tracks);
    expect(moveKeys(p, 'c', [{ target: SCALE, t: 3 }], 0)).toBe(p);
    expect(moveKeys(p, 'c', [{ target: ROT, t: 3 }], 0.2)).toBe(p);
    refused(() => moveKeys(p, 'c', [{ target: SCALE, t: 3 }], NaN), /Invalid/);
    // Moving several keys past each other's old places is fine when they all move.
    expect(clipOf(moveKeys(p, 'c', [2, 3, 4, 5].map((t) => ({ target: SCALE, t })), 1), 'c').keys?.scale?.map((x) => x.t)).toEqual([3, 4, 5, 6]);
  });
  it('a sourceless clip range is 0..duration', () => {
    const q = setAnimated(project(), 'o', OP, true, 20);
    refused(() => moveKeys(q, 'o', [{ target: OP, t: 0 }], 4.01), 'Keyframes must stay on the clip');
    expect(clipOf(moveKeys(q, 'o', [{ target: OP, t: 0 }], 4), 'o').keys?.opacity?.[0].t).toBe(4);
  });
});

describe('setKeyEase', () => {
  it('sets the ease of the referenced keys (copied); same project when unchanged', () => {
    const p = project({ keys: { scale: [k(2, 1), k(3, 2)] } });
    const ease = { kind: 'bezier' as const, bezier: [0.1, -0.5, 0.9, 1.5] as [number, number, number, number] };
    const q = setKeyEase(p, 'c', [{ target: SCALE, t: 2 }], ease);
    expect(clipOf(q, 'c').keys?.scale).toEqual([k(2, 1, ease), k(3, 2)]);
    expect(clipOf(q, 'c').keys!.scale![0].ease.bezier).not.toBe(ease.bezier);
    expect(setKeyEase(q, 'c', [{ target: SCALE, t: 2 }], { ...ease, bezier: [...ease.bezier] as typeof ease.bezier })).toBe(q);
    expect(setKeyEase(p, 'c', [{ target: SCALE, t: 2.5 }], ease)).toBe(p);
    refused(() => setKeyEase(project({ keys: { scale: [k(2, 1)] } }), 'lc', [{ target: SCALE, t: 2 }], lin), 'Track is locked');
  });
});

describe('setTransformAt and withLiveValue', () => {
  it('routes x/y to position (missing coordinate from the resolved value) and the rest to their own targets: ONE project', () => {
    const p = project({ transform: { x: 1, y: 2, scale: 1, rotation: 0, opacity: 1 }, keys: { position: [pk(2, 0, 0), pk(4, 100, 200)] } });
    const q = setTransformAt(p, 'c', { x: 500, scale: 2 }, 11);
    expect(clipOf(q, 'c').keys?.position).toEqual([pk(2, 0, 0), pk(3, 500, 100), pk(4, 100, 200)]);
    expect(clipOf(q, 'c').transform).toEqual({ x: 1, y: 2, scale: 2, rotation: 0, opacity: 1 });
    expect(setTransformAt(p, 'c', { x: 0, y: 0 }, 10)).toBe(p);
    expect(setTransformAt(p, 'c', { x: 0 }, 10)).toBe(p);
    expect(setTransformAt(p, 'c', {}, 11)).toBe(p);
    refused(() => setTransformAt(p, 'c', { x: 5 }, 20), 'Move the playhead onto the clip to set a keyframe');
  });

  it('withLiveValue: the same write without the lock guard or clamping (live drag preview only)', () => {
    const p = project({ keys: { scale: [k(2, 1)] } });
    const q = withLiveValue(p, 'c', { scale: 50, x: 9 }, 10);
    expect(clipOf(q, 'c').keys?.scale).toEqual([k(2, 50)]);
    expect(clipOf(q, 'c').transform.x).toBe(9);
    const locked: Project = { ...p, tracks: p.tracks.map((t) => (t.id === 'L' ? { ...t, clips: [{ ...t.clips[0], keys: { scale: [k(2, 1)] } }] } : t)) };
    expect(clipOf(withLiveValue(locked, 'lc', { scale: 3 }, 10), 'lc').keys?.scale).toEqual([k(2, 3)]);
    expect(withLiveValue(p, 'gone', { scale: 3 }, 10)).toBe(p);
  });
});

describe('queries', () => {
  const p = project({
    keys: { opacity: [k(2, 1), k(3, 0)], position: [pk(3 + KEY_EPS / 2, 0, 0)] },
    effects: [colourFx('fx', { keys: { hue: [k(4, 1)], brightness: [k(2.5, 0)] } }), { id: 'mr', type: 'mirror', enabled: true, params: { mode: 0 } }],
  });
  it('animatedTargets: transform props in fixed order, then effects in stack order and params in schema order', () => {
    expect(animatedTargets(clipOf(p, 'c'))).toEqual([
      POS, OP, { kind: 'effect', effectId: 'fx', param: 'brightness' }, { kind: 'effect', effectId: 'fx', param: 'hue' },
    ]);
    expect(animatedTargets(clipOf(project(), 'c'))).toEqual([]);
  });
  it('keyTimes: distinct local key times over every property (tooClose merged), sorted', () => {
    expect(keyTimes(clipOf(p, 'c'))).toEqual([2, 2.5, 3, 4]);
  });
  it('keyRefsAt: every key at a local time', () => {
    expect(keyRefsAt(clipOf(p, 'c'), 3)).toEqual([{ target: POS, t: 3 + KEY_EPS / 2 }, { target: OP, t: 3 }]);
  });
});
