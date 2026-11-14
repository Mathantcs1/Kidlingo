// Plan 5B Task 8: the inspector's "Orient along path" toggle (kf-orient). Turning it OFF bakes the heading at the
// playhead into the stored rotation (like the position stopwatch off, R4-11), so the playhead frame keeps its picture;
// turning it ON needs two position keys. ONE store step each; locked refuses.
import { beforeEach, describe, expect, it } from 'vitest';
import { resolvedTransform } from '../src/core/animate';
import { localTime } from '../src/core/keyframes';
import type { PositionKeyframe, Project } from '../src/core/model';
import { setOrientAt } from '../src/core/orientBake';
import { setOrient } from '../src/core/pathEdits';
import { pathHeading } from '../src/core/spatialPath';
import { TimelineError } from '../src/core/timeline';
import { useEditor } from '../src/state/store';
import { setOrientCmd } from '../src/ui/pathCommands';
import { clipOf, k, pk, project } from './keyframe-fixtures';

const curve: PositionKeyframe[] = [{ ...pk(2, 0, 0), out: { x: 300, y: 0 } }, { ...pk(4, 400, 400), in: { x: 0, y: -300 } }];
const T = 11.37;
const rot = (p: Project, t = T) => resolvedTransform(clipOf(p, 'c'), t, 30).rotation;
const sameAngle = (a: number, b: number) => expect(Math.abs((((a - b) % 360) + 540) % 360 - 180)).toBeLessThan(1e-9);

describe('setOrientAt', () => {
  it('off bakes the heading at the playhead (static rotation): the playhead frame is unchanged', () => {
    const p = project({ transform: { x: 0, y: 0, scale: 1, rotation: 10, opacity: 1 }, keys: { position: curve, orient: true } });
    const h = pathHeading(curve, undefined, localTime(clipOf(p, 'c'), T, 30));
    expect(h).toBeGreaterThan(20);
    const q = setOrientAt(p, 'c', false, T);
    expect(clipOf(q, 'c').keys!.orient).toBeUndefined();
    expect(clipOf(q, 'c').keys!.position).toBe(clipOf(p, 'c').keys!.position);
    expect(clipOf(q, 'c').transform.rotation).toBeCloseTo(10 + h, 9);
    sameAngle(rot(q), rot(p));
    // setOrient(false) itself does not bake (by design); the toggle does.
    expect(clipOf(setOrient(p, 'c', false), 'c').transform.rotation).toBe(10);
  });
  it('off with keyed rotation shifts every rotation key by the heading', () => {
    const p = project({ keys: { position: curve, rotation: [k(2, 5), k(6, 25)], orient: true } });
    const h = pathHeading(curve, undefined, localTime(clipOf(p, 'c'), T, 30));
    const q = setOrientAt(p, 'c', false, T);
    expect(clipOf(q, 'c').keys!.rotation!.map((x) => x.v)).toEqual([5 + h, 25 + h]);
    expect(rot(q)).toBeCloseTo(rot(p), 9);
  });
  it('a playhead off the clip bakes at the nearest end; on is setOrient; no-ops keep the reference', () => {
    const p = project({ keys: { position: curve, orient: true } });
    sameAngle(clipOf(setOrientAt(p, 'c', false, 30), 'c').transform.rotation, pathHeading(curve, undefined, 6));
    expect(setOrientAt(p, 'c', true, T)).toBe(p);
    const plain = project({ keys: { position: curve } });
    expect(setOrientAt(plain, 'c', false, T)).toBe(plain);
    expect(clipOf(setOrientAt(plain, 'c', true, T), 'c').keys!.orient).toBe(true);
    expect(() => setOrientAt(project({ keys: { position: [pk(2, 0, 0)] } }), 'c', true, T)).toThrow(TimelineError);
  });
  it('a locked track refuses both ways', () => {
    const p = project({ keys: { position: curve, orient: true } });
    const locked = { ...p, tracks: p.tracks.map((t) => ({ ...t, locked: true })) };
    expect(() => setOrientAt(locked, 'c', false, T)).toThrow(/locked/i);
  });
});

describe('setOrientCmd', () => {
  beforeEach(() => {
    useEditor.getState().loadProject(project({ keys: { position: curve } }));
  });
  it('on then off: one step each, the frame at the playhead unchanged by off, undo exact', () => {
    const s = () => useEditor.getState();
    s().setPlayhead(T);
    const d = s().history.past.length;
    setOrientCmd('c', true);
    expect(s().history.past.length).toBe(d + 1);
    const on = s().history.present;
    setOrientCmd('c', false);
    expect(s().history.past.length).toBe(d + 2);
    sameAngle(rot(s().history.present), rot(on));
    s().undo();
    expect(s().history.present).toBe(on);
    setOrientCmd('c', true); // already on: no step
    expect(s().history.past.length).toBe(d + 1);
  });
});
