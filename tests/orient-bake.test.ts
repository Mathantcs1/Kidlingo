// Plan 5B Task 4 fix round 1 (M5): when orient along path stops applying (the position stopwatch off, or key removal
// leaving fewer than two position keys) the heading at the playhead is baked into the STORED rotation in that same
// edit, so the frame at the playhead keeps its rotation (the 5A stopwatch-off rule); other frames change.
import { beforeEach, describe, expect, it } from 'vitest';
import { resolvedTransform } from '../src/core/animate';
import type { AnimTarget } from '../src/core/keyframeEdits';
import { removeKeys, setAnimated } from '../src/core/keyframeEdits';
import { KEYED_ROTATION_LIMIT, localTime } from '../src/core/keyframes';
import type { PositionKeyframe, Project } from '../src/core/model';
import { pathHeading } from '../src/core/spatialPath';
import { TimelineError } from '../src/core/timeline';
import { useEditor } from '../src/state/store';
import { toggleAnimatedCmd } from '../src/ui/keyframeCommands';
import { clipOf, k, pk, project } from './keyframe-fixtures';

const POS: AnimTarget = { kind: 'transform', prop: 'position' };
const ROT: AnimTarget = { kind: 'transform', prop: 'rotation' };
// Video 'c' shows local 2..6 at 10..14 s; the heading turns from 0 to 90 along this curve.
const curve: PositionKeyframe[] = [{ ...pk(2, 0, 0), out: { x: 300, y: 0 } }, { ...pk(4, 400, 400), in: { x: 0, y: -300 } }];
const T = 11.37;
const rot = (p: Project, t = T) => resolvedTransform(clipOf(p, 'c'), t, 30).rotation;
const sameAngle = (a: number, b: number) => expect(Math.abs((((a - b) % 360) + 540) % 360 - 180)).toBeLessThan(1e-9);

describe('setAnimated(position, off) with orient', () => {
  it('static rotation: rotation + heading at the playhead becomes the stored (normalised) rotation; orient dropped', () => {
    const p = project({ transform: { x: 0, y: 0, scale: 1, rotation: 170, opacity: 1 }, keys: { position: curve, orient: true } });
    const h = pathHeading(curve, undefined, localTime(clipOf(p, 'c'), T, 30));
    expect(h).toBeGreaterThan(20);
    const q = setAnimated(p, 'c', POS, false, T);
    expect(clipOf(q, 'c').keys).toBeUndefined();
    expect(clipOf(q, 'c').transform.rotation).toBeCloseTo(170 + h - 360, 9); // normalised to (−180, 180]
    sameAngle(rot(q), rot(p));
    expect(resolvedTransform(clipOf(q, 'c'), T, 30).x).toBeCloseTo(resolvedTransform(clipOf(p, 'c'), T, 30).x, 9);
    // Without orient nothing is baked (5A behaviour).
    const plain = project({ transform: { x: 0, y: 0, scale: 1, rotation: 170, opacity: 1 }, keys: { position: curve } });
    expect(clipOf(setAnimated(plain, 'c', POS, false, T), 'c').transform.rotation).toBe(170);
  });

  it('keyed rotation: every rotation key shifts by the heading, so the playhead frame is unchanged', () => {
    const p = project({ keys: { position: curve, rotation: [k(2, 5, { kind: 'easeInOut' }), k(6, 25)], orient: true } });
    const h = pathHeading(curve, undefined, localTime(clipOf(p, 'c'), T, 30));
    const q = setAnimated(p, 'c', POS, false, T);
    expect(clipOf(q, 'c').keys!.orient).toBeUndefined();
    expect(clipOf(q, 'c').keys!.rotation!.map((x) => x.v)).toEqual([5 + h, 25 + h]);
    expect(rot(q)).toBeCloseTo(rot(p), 9);
  });

  it('refuses (clear error, nothing changed) when the shifted rotation keys would leave their range', () => {
    const p = project({ keys: { position: curve, rotation: [k(2, KEYED_ROTATION_LIMIT), k(6, 0)], orient: true } });
    expect(() => setAnimated(p, 'c', POS, false, T)).toThrow(TimelineError);
    expect(() => setAnimated(p, 'c', POS, false, T)).toThrow(/rotation/i);
  });
});

describe('removeKeys leaving fewer than two position keys with orient', () => {
  it('bakes the heading at the playhead (one key left or none), drops orient', () => {
    const p = project({ transform: { x: 0, y: 0, scale: 1, rotation: 10, opacity: 1 }, keys: { position: curve, orient: true } });
    const one = removeKeys(p, 'c', [{ target: POS, t: 4 }], T);
    expect(clipOf(one, 'c').keys!.orient).toBeUndefined();
    sameAngle(rot(one), rot(p));
    const none = removeKeys(p, 'c', [{ target: POS, t: 2 }, { target: POS, t: 4 }], T);
    sameAngle(rot(none), rot(p));
    // The heading is taken at the playhead's frame: another frame of the old path gives another value.
    expect(Math.abs(rot(one) - (10 + pathHeading(curve, undefined, 2.2)))).toBeGreaterThan(1);
    // Two or more keys left: orient stays, nothing baked.
    const three = project({ keys: { position: [...curve, pk(5, 0, 400)], orient: true } });
    const kept = removeKeys(three, 'c', [{ target: POS, t: 5 }], T);
    expect(clipOf(kept, 'c').keys!.orient).toBe(true);
    expect(clipOf(kept, 'c').transform.rotation).toBe(0);
    // Removing rotation keys only never bakes.
    const keyedRot = project({ keys: { position: curve, rotation: [k(2, 5), k(6, 25)], orient: true } });
    expect(clipOf(removeKeys(keyedRot, 'c', [{ target: ROT, t: 2 }], T), 'c').keys!.orient).toBe(true);
  });

  it('a playhead off the clip bakes at the nearest end of the clip', () => {
    const p = project({ keys: { position: curve, orient: true } });
    const q = removeKeys(p, 'c', [{ target: POS, t: 4 }], 30);
    sameAngle(clipOf(q, 'c').transform.rotation, pathHeading(curve, undefined, 6));
  });
});

describe('the position stopwatch off as ONE store step', () => {
  beforeEach(() => {
    useEditor.getState().loadProject(project({ transform: { x: 0, y: 0, scale: 1, rotation: 10, opacity: 1 }, keys: { position: curve, orient: true } }));
  });
  it('one apply, the playhead frame unchanged, undo exact', () => {
    const s = () => useEditor.getState();
    s().setPlayhead(T);
    const before = s().history.present;
    const json = JSON.stringify(before);
    const depth = s().history.past.length;
    toggleAnimatedCmd('c', POS);
    expect(s().history.past.length).toBe(depth + 1);
    sameAngle(rot(s().history.present), rot(before));
    s().undo();
    expect(s().history.present).toBe(before);
    expect(JSON.stringify(s().history.present)).toBe(json);
  });
});
