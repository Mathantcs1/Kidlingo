// Pure keyframe edits (Plan 5 D2/D8/D10/D11): stopwatch on/off, value at the playhead, key removal, retiming and
// eases. `(Project, …) => Project`; locked tracks refuse; no-ops return the SAME project; never mutates input.
import {
  assertTarget, sameTarget, staticValue, targetKeys, valueAtLocal, withStaticValue, withTargetKeys,
} from './animTargets';
import type { AnimTarget, AnimValue, KeyRef } from './animTargets';
import { isSameEase, repairEase } from './easing';
import type { Ease } from './easing';
import { nearestKey, upsertKey } from './keyLists';
import type { AnyKey, KeyValue } from './keyLists';
import {
  KEYED_POSITION_LIMIT, KEYED_ROTATION_LIMIT, KEYED_SCALE_LIMIT, MAX_KEYS, keyFrame, keyIndexAtPlayhead, keyVisible, localRange,
  localTime, tooClose,
} from './keyframes';
import { clipEnd } from './model';
import type { Clip, Id, Project } from './model';
import { scaleBounds } from './scale';
import { EPS, TimelineError, assertFinite, assertUnlocked, findClip } from './timeline';
import { REACH, clamp } from './transformLimits';
import { setClipTransform } from './transformEdits';
import { animatableParam } from './videoEffects';
import { updateVideoEffect } from './videoEffectEdits';

export type { AnimTarget, AnimValue, KeyRef, TransformProp } from './animTargets';
export { ANIMATED_REFUSAL, animatedTargets, keyRefsAt, keyTimes, targetKeys, targetValueAt } from './animTargets';

export const OUTSIDE_REFUSAL = 'Move the playhead onto the clip to set a keyframe';

/** The clip and its track after the lock guard and the per-kind target refusals. */
function locate(p: Project, clipId: Id, target?: AnimTarget): Clip {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  if (target) assertTarget(clip, target);
  return clip;
}

/** `p` with clip `clipId` replaced by `next` (only its own track is copied). */
export function commitClip(p: Project, clipId: Id, next: Clip): Project {
  const swap = (c: Clip): Clip => (c.id === clipId ? next : c);
  return { ...p, tracks: p.tracks.map((t) => (t.clips.some((c) => c.id === clipId) ? { ...t, clips: t.clips.map(swap) } : t)) };
}

function assertInside(clip: Clip, t: number): void {
  if (!(t >= clip.start - EPS && t < clipEnd(clip) - EPS)) throw new TimelineError(OUTSIDE_REFUSAL);
}

const isPosition = (target: AnimTarget): boolean => target.kind === 'transform' && target.prop === 'position';
const keyToValue = (k: AnyKey): AnimValue => ('v' in k ? k.v : { x: k.x, y: k.y });

/**
 * A key value within the target's legal range: D5 (opacity 0..1, effect params their schema range, keyed rotation
 * ±36 000, unnormalised) and the hard key limits; with `cur` (the value shown at the playhead) also the static edits'
 * clamps (position ±REACH × format, scale `scaleBounds(cur)`, P5-3). −0 is stored as 0.
 */
function keyValue(p: Project, clip: Clip, target: AnimTarget, v: AnimValue, cur?: AnimValue): KeyValue {
  if (target.kind === 'effect') {
    const e = clip.effects.find((x) => x.id === target.effectId)!;
    const d = animatableParam(e.type, target.param)!;
    return { v: clamp(v as number, d.min, d.max) + 0 };
  }
  if (target.prop === 'position') {
    const q = v as { x: number; y: number };
    const lx = cur ? Math.min(REACH * p.format.width, KEYED_POSITION_LIMIT) : KEYED_POSITION_LIMIT;
    const ly = cur ? Math.min(REACH * p.format.height, KEYED_POSITION_LIMIT) : KEYED_POSITION_LIMIT;
    return { x: clamp(q.x, -lx, lx) + 0, y: clamp(q.y, -ly, ly) + 0 };
  }
  const n = v as number;
  if (target.prop === 'opacity') return { v: clamp(n, 0, 1) + 0 };
  if (target.prop === 'rotation') return { v: clamp(n, -KEYED_ROTATION_LIMIT, KEYED_ROTATION_LIMIT) + 0 };
  const [lo, hi] = cur === undefined ? [0, KEYED_SCALE_LIMIT] : scaleBounds(cur as number);
  return { v: clamp(n, Math.min(lo, KEYED_SCALE_LIMIT), Math.min(hi, KEYED_SCALE_LIMIT)) + 0 };
}

/**
 * Turns animation of `target` on or off at timeline time `t` (the playhead, which must be on the clip). On: one
 * `linear` key at the local time holding the current value. Off: the value shown at `t` becomes the static value
 * (rotation normalised to (−180, 180], P5-3) and the keys are removed. The same project when already in that state.
 */
export function setAnimated(p: Project, clipId: Id, target: AnimTarget, on: boolean, t: number): Project {
  assertFinite('playhead time', t);
  const clip = locate(p, clipId, target);
  if ((targetKeys(clip, target) !== undefined) === on) return p;
  assertInside(clip, t);
  const u = localTime(clip, t, p.format.fps);
  const next = on
    ? withTargetKeys(clip, target, [{ t: u, ...keyValue(p, clip, target, staticValue(clip, target)), ease: { kind: 'linear' } } as AnyKey])
    : withTargetKeys(withStaticValue(clip, target, valueAtLocal(clip, target, u)), target, undefined);
  return commitClip(p, clipId, next);
}

function assertValue(target: AnimTarget, v: AnimValue): void {
  const ok = isPosition(target)
    ? typeof v === 'object' && v !== null && Number.isFinite(v.x) && Number.isFinite(v.y)
    : typeof v === 'number' && Number.isFinite(v);
  if (!ok) throw new TimelineError('Invalid value');
}

/**
 * Sets `target` to `value` at timeline time `t` (D8). Static target: exactly the static edit (setClipTransform /
 * updateVideoEffect, same clamps; the playhead may be anywhere). Animated target: the playhead must be on the clip;
 * the value (clamped as the static edit would) replaces the key under the playhead (its frame window, P5-6) or is
 * inserted as a key at the local time. Same project when unchanged.
 */
export function setValueAt(p: Project, clipId: Id, target: AnimTarget, value: AnimValue, t: number): Project {
  assertFinite('playhead time', t);
  assertValue(target, value);
  const clip = locate(p, clipId, target);
  const list = targetKeys(clip, target);
  if (!list) {
    if (target.kind === 'effect') return updateVideoEffect(p, clipId, target.effectId, { params: { [target.param]: value as number } });
    return setClipTransform(p, clipId, typeof value === 'number' ? { [target.prop]: value } : { x: value.x, y: value.y });
  }
  assertInside(clip, t);
  const u = localTime(clip, t, p.format.fps);
  const hit = keyIndexAtPlayhead(clip, list, t, p.format.fps);
  const next = upsertKey(list, u, keyValue(p, clip, target, value, valueAtLocal(clip, target, u)), true, hit);
  if (!next) throw new TimelineError(`At most ${MAX_KEYS} keyframes per setting`);
  return next === list ? p : commitClip(p, clipId, withTargetKeys(clip, target, next));
}

/** The distinct targets of `refs`, each with the indices of its keys that the refs select (nearest within KEY_EPS). */
function selection(clip: Clip, refs: readonly KeyRef[]): { target: AnimTarget; list: readonly AnyKey[]; picked: Set<number> }[] {
  const out: { target: AnimTarget; list: readonly AnyKey[]; picked: Set<number> }[] = [];
  for (const r of refs) {
    let entry = out.find((e) => sameTarget(e.target, r.target));
    if (!entry) {
      assertTarget(clip, r.target);
      entry = { target: r.target, list: targetKeys(clip, r.target) ?? [], picked: new Set() };
      out.push(entry);
    }
    const i = nearestKey(entry.list, r.t);
    if (i >= 0) entry.picked.add(i);
  }
  return out.filter((e) => e.picked.size > 0);
}

/**
 * Removes the referenced keys. A property that loses its last key becomes static at its EARLIEST key's value (the
 * removed key itself when it was alone; rotation normalised). Same project when no ref matches a key.
 */
export function removeKeys(p: Project, clipId: Id, refs: readonly KeyRef[]): Project {
  const clip = locate(p, clipId);
  let next = clip;
  for (const { target, list, picked } of selection(clip, refs)) {
    const kept = list.filter((_, i) => !picked.has(i));
    next = kept.length > 0 ? withTargetKeys(next, target, kept)
      : withTargetKeys(withStaticValue(next, target, keyToValue(list[0])), target, undefined);
  }
  return next === clip ? p : commitClip(p, clipId, next);
}

/**
 * Retimes the referenced keys by `delta` seconds (D10), keeping their order. Refused when a moved key lands within
 * KEY_EPS of an unmoved key of the same target, or in the same frame of the clip's grid as one (P5-6: one key per
 * frame window), ('Keyframes would overlap') or outside the clip's local range.
 */
export function moveKeys(p: Project, clipId: Id, refs: readonly KeyRef[], delta: number): Project {
  assertFinite('keyframe move', delta);
  const clip = locate(p, clipId);
  if (delta === 0) return p;
  const [lo, hi] = localRange(clip);
  let next = clip;
  for (const { target, list, picked } of selection(clip, refs)) {
    const moved = list.filter((_, i) => picked.has(i)).map((k) => ({ ...k, t: k.t + delta }));
    const still = list.filter((_, i) => !picked.has(i));
    if (moved.some((k) => k.t < lo - EPS || k.t > hi + EPS)) throw new TimelineError('Keyframes must stay on the clip');
    if (moved.some((m) => still.some((s) => tooClose(m.t, s.t) || sameFrame(clip, m.t, s.t, p.format.fps)))) throw new TimelineError('Keyframes would overlap');
    next = withTargetKeys(next, target, [...still, ...moved].sort((a, b) => a.t - b.t));
  }
  return next === clip ? p : commitClip(p, clipId, next);
}

/** Whether two visible local key times fall in the same frame of the clip's grid (P5-6). */
const sameFrame = (clip: Clip, a: number, b: number, fps: number): boolean =>
  keyVisible(clip, a) && keyVisible(clip, b) && keyFrame(clip, a, fps) === keyFrame(clip, b, fps);

/** Sets the ease of the referenced keys (the segment each one starts, D4). Same project when nothing changes. */
export function setKeyEase(p: Project, clipId: Id, refs: readonly KeyRef[], ease: Ease): Project {
  const e = repairEase(ease);
  const clip = locate(p, clipId);
  let next = clip;
  for (const { target, list, picked } of selection(clip, refs)) {
    if ([...picked].every((i) => isSameEase(list[i].ease, e))) continue;
    next = withTargetKeys(next, target, list.map((k, i) => (picked.has(i) ? { ...k, ease: repairEase(e) } : k)));
  }
  return next === clip ? p : commitClip(p, clipId, next);
}
