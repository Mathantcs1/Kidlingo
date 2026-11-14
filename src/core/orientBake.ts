// Orient along path stopping (Plan 5B Task 4 fix round 1, M5): when an edit leaves `orient` without a path (the
// position stopwatch off, or key removal down to fewer than two position keys) the heading at the playhead is baked
// into the STORED rotation in that same edit, so the playhead frame keeps its rotation (the 5A stopwatch-off rule).
// Other frames change: the heading no longer follows the path there. Pure.
import { commitClip } from './keyEditHelpers';
import { KEYED_ROTATION_LIMIT, localRange, localTime } from './keyframes';
import type { Clip, Id, Project, TransformKeys } from './model';
import { setOrient } from './pathEdits';
import { orientHeading } from './spatialPath';
import { TimelineError, findClip } from './timeline';
import { normaliseDegrees } from './transformLimits';

export const BAKE_RANGE_REFUSAL = 'The rotation keyframes would leave their range: change them before removing the motion path';

const oriented = (keys: TransformKeys | undefined): boolean => keys?.orient === true && (keys.position?.length ?? 0) >= 2;

/**
 * `after` (an edit of `before`) with the heading `before` showed at local time `u` added to the stored rotation when
 * the edit stopped orient from applying: a static rotation becomes `normaliseDegrees(rotation + heading)`; keyed
 * rotation shifts EVERY key by the heading (a constant shift keeps the eased/looped value at `u` + heading; refused
 * with a TimelineError when a key would leave ±KEYED_ROTATION_LIMIT). An inert `orient` (one key left) is removed so it
 * cannot revive on top of the baked value. `after` itself when orient applied before and still applies (or never did).
 */
export function bakeDroppedHeading(before: Clip, after: Clip, u: number): Clip {
  if (!oriented(before.keys) || oriented(after.keys)) return after;
  const h = orientHeading(before.keys, u);
  let next = after;
  if (next.keys?.orient) {
    const { orient: _o, ...keys } = next.keys;
    next = { ...next, keys };
  }
  const rot = next.keys?.rotation;
  if (rot && rot.length > 0) {
    const moved = rot.map((k) => ({ ...k, v: k.v + h + 0 }));
    if (moved.some((k) => !(Math.abs(k.v) <= KEYED_ROTATION_LIMIT))) throw new TimelineError(BAKE_RANGE_REFUSAL);
    return { ...next, keys: { ...next.keys!, rotation: moved } };
  }
  return { ...next, transform: { ...next.transform, rotation: normaliseDegrees(next.transform.rotation + h) } };
}

/**
 * The inspector's orient toggle (5B Task 8): `on` is setOrient; OFF also bakes the heading at the playhead `t` (clamped
 * onto the clip's local range, like removeKeys) into the stored rotation, so the frame at the playhead keeps its
 * picture (the stopwatch-off rule; setOrient(false) alone does not bake). Lock guard and no-ops as setOrient.
 */
export function setOrientAt(p: Project, clipId: Id, on: boolean, t: number): Project {
  const q = setOrient(p, clipId, on);
  if (on || q === p) return q;
  const before = findClip(p, clipId).clip;
  const [lo, hi] = localRange(before);
  const u = Math.min(hi, Math.max(lo, localTime(before, t, p.format.fps)));
  return commitClip(q, clipId, bakeDroppedHeading(before, findClip(q, clipId).clip, u));
}
