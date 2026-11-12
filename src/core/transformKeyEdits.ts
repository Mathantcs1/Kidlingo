// Transform writes at the playhead (Plan 5 D8): one patch of x/y/scale/rotation/opacity routed field by field to
// the static edit or to a key, as ONE project (the on-canvas drag commit), plus its unguarded live-preview twin.
import { targetKeys, valueAtLocal, withTargetKeys } from './animTargets';
import type { AnimTarget, AnimValue } from './animTargets';
import { commitClip, setValueAt } from './keyframeEdits';
import { upsertKey } from './keyLists';
import { localTime } from './keyframes';
import type { Clip, Id, Project, Transform } from './model';
import { findClip } from './timeline';
import { setClipTransform } from './transformEdits';

const POS: AnimTarget = { kind: 'transform', prop: 'position' };
const SCALARS = ['scale', 'rotation', 'opacity'] as const;

/** The patch split into static fields and keyed writes (x/y become one position value, the missing one resolved). */
function route(clip: Clip, patch: Partial<Transform>, u: number): { statics: Partial<Transform>; keyed: [AnimTarget, AnimValue][] } {
  const statics: Partial<Transform> = {};
  const keyed: [AnimTarget, AnimValue][] = [];
  if (patch.x !== undefined || patch.y !== undefined) {
    if (targetKeys(clip, POS)) {
      const cur = valueAtLocal(clip, POS, u) as { x: number; y: number };
      keyed.push([POS, { x: patch.x ?? cur.x, y: patch.y ?? cur.y }]);
    } else {
      if (patch.x !== undefined) statics.x = patch.x;
      if (patch.y !== undefined) statics.y = patch.y;
    }
  }
  for (const prop of SCALARS) {
    const v = patch[prop];
    if (v === undefined) continue;
    const target: AnimTarget = { kind: 'transform', prop };
    if (targetKeys(clip, target)) keyed.push([target, v]);
    else statics[prop] = v;
  }
  return { statics, keyed };
}

/**
 * Writes `patch` at timeline time `t`: static fields through setClipTransform (its clamps), animated ones as keys
 * through setValueAt (refused when the playhead is off the clip). ONE resulting project; `p` itself when unchanged.
 */
export function setTransformAt(p: Project, clipId: Id, patch: Partial<Transform>, t: number): Project {
  const { clip } = findClip(p, clipId);
  const { statics, keyed } = route(clip, patch, localTime(clip, t, p.format.fps));
  let q = Object.keys(statics).length > 0 ? setClipTransform(p, clipId, statics) : p;
  for (const [target, v] of keyed) q = setValueAt(q, clipId, target, v, t);
  return q;
}

/**
 * The same write as setTransformAt for the live preview of an on-canvas drag ONLY: no lock guard, no clamping, no key
 * limit, never committed to history. `p` itself when the clip is gone.
 */
export function withLiveValue(p: Project, clipId: Id, patch: Partial<Transform>, t: number): Project {
  if (!p.tracks.some((tr) => tr.clips.some((c) => c.id === clipId))) return p;
  const { clip } = findClip(p, clipId);
  const u = localTime(clip, t, p.format.fps);
  const { statics, keyed } = route(clip, patch, u);
  let next: Clip = Object.keys(statics).length > 0 ? { ...clip, transform: { ...clip.transform, ...statics } } : clip;
  for (const [target, v] of keyed) {
    const list = targetKeys(next, target)!;
    const val = typeof v === 'number' ? { v } : { x: v.x, y: v.y };
    next = withTargetKeys(next, target, upsertKey(list, u, val, false)!);
  }
  return next === clip ? p : commitClip(p, clipId, next);
}
