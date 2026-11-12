// What can be animated on a clip (Plan 5 D1): the four transform properties and every animatable effect param.
// Reading and writing one target's keys and static value, its legal ranges, and the queries the UI needs. Pure.
import { nearestKey } from './keyLists';
import type { AnyKey } from './keyLists';
import { localTime, positionAt, tooClose, valueAt } from './keyframes';
import type { Clip, Id, Keyframe, PositionKeyframe, TransformKeys } from './model';
import { TimelineError } from './timeline';
import { normaliseDegrees } from './transformLimits';
import { VIDEO_EFFECTS, animatableParam } from './videoEffects';

export type TransformProp = 'position' | 'scale' | 'rotation' | 'opacity';
export type AnimTarget = { kind: 'transform'; prop: TransformProp } | { kind: 'effect'; effectId: Id; param: string };
/** One key of one target; `t` is clip-LOCAL seconds (D3). */
export interface KeyRef { target: AnimTarget; t: number }
/** Position takes {x, y}; every other target a number. */
export type AnimValue = number | { x: number; y: number };

/** D8: static edits (fields, sliders) refuse an animated property instead of silently doing nothing. */
export const ANIMATED_REFUSAL = 'This setting is animated: change it at the playhead';

export const TRANSFORM_PROPS: readonly TransformProp[] = ['position', 'scale', 'rotation', 'opacity'];

export const sameTarget = (a: AnimTarget, b: AnimTarget): boolean =>
  a.kind === 'transform' ? b.kind === 'transform' && a.prop === b.prop
    : b.kind === 'effect' && a.effectId === b.effectId && a.param === b.param;

/**
 * Throws the user-facing refusal when `target` cannot be animated on `clip`: audio clips; adjustment layers animate
 * only opacity; overlays have no effects; an unknown effect; a non-animatable or unknown param.
 */
export function assertTarget(clip: Clip, target: AnimTarget): void {
  if (clip.kind === 'audio') throw new TimelineError('Audio clips cannot be animated');
  if (target.kind === 'transform') {
    if (!TRANSFORM_PROPS.includes(target.prop)) throw new TimelineError('This setting cannot be animated');
    if (clip.kind === 'adjustment' && target.prop !== 'opacity') throw new TimelineError('Adjustment layers only animate opacity');
    return;
  }
  if (clip.kind === 'overlay') throw new TimelineError('Overlays cannot have effects');
  const e = clip.effects.find((x) => x.id === target.effectId);
  if (!e) throw new TimelineError(`Effect not found: ${target.effectId}`);
  if (!animatableParam(e.type, target.param)) throw new TimelineError('This setting cannot be animated');
}

const effectOf = (clip: Clip, id: Id) => clip.effects.find((e) => e.id === id);

/** The target's keys when it is animated (≥ 1 key), else undefined. */
export function targetKeys(clip: Clip, target: AnimTarget): readonly AnyKey[] | undefined {
  const list = target.kind === 'transform' ? clip.keys?.[target.prop] : effectOf(clip, target.effectId)?.keys?.[target.param];
  return list && list.length > 0 ? list : undefined;
}

/** The evaluation range of a target (D5): opacity 0..1, scale ≥ 0, effect params their schema range. */
function range(clip: Clip, target: AnimTarget): [number, number] {
  if (target.kind === 'effect') {
    const e = effectOf(clip, target.effectId);
    const d = e && animatableParam(e.type, target.param);
    return d ? [d.min, d.max] : [-Infinity, Infinity];
  }
  return target.prop === 'opacity' ? [0, 1] : target.prop === 'scale' ? [0, Infinity] : [-Infinity, Infinity];
}

/** The stored static value (what renders while the target is not animated). */
export function staticValue(clip: Clip, target: AnimTarget): AnimValue {
  if (target.kind === 'effect') return effectOf(clip, target.effectId)?.params[target.param] ?? NaN;
  const t = clip.transform;
  return target.prop === 'position' ? { x: t.x, y: t.y } : t[target.prop];
}

/** The value at LOCAL time `u`: evaluated and clamped like the resolver when animated, else the static value. */
export function valueAtLocal(clip: Clip, target: AnimTarget, u: number): AnimValue {
  const list = targetKeys(clip, target);
  if (!list) return staticValue(clip, target);
  if (target.kind === 'transform' && target.prop === 'position') return positionAt(list as PositionKeyframe[], u);
  return valueAt(list as Keyframe[], u, ...range(clip, target));
}

/** The value seen at TIMELINE time `t` (the inspector's value at the playhead). */
export const targetValueAt = (clip: Clip, target: AnimTarget, t: number, fps: number): AnimValue =>
  valueAtLocal(clip, target, localTime(clip, t, fps));

/** `clip` with the target's key list replaced; an empty/undefined list is removed, and so is an emptied `keys`. */
export function withTargetKeys(clip: Clip, target: AnimTarget, list: readonly AnyKey[] | undefined): Clip {
  const keep = list && list.length > 0 ? list : undefined;
  if (target.kind === 'transform') {
    const { [target.prop]: _old, ...rest } = clip.keys ?? {};
    const keys: TransformKeys = keep ? { ...rest, [target.prop]: keep } : rest;
    const { keys: _k, ...bare } = clip;
    return Object.keys(keys).length > 0 ? { ...clip, keys } : bare;
  }
  return {
    ...clip,
    effects: clip.effects.map((e) => {
      if (e.id !== target.effectId) return e;
      const { [target.param]: _old, ...rest } = e.keys ?? {};
      const keys = keep ? { ...rest, [target.param]: keep as Keyframe[] } : rest;
      const { keys: _k, ...bare } = e;
      return Object.keys(keys).length > 0 ? { ...e, keys } : bare;
    }),
  };
}

/** `clip` with the static value written (rotation normalised to (−180, 180], −0 stored as 0). No clamping. */
export function withStaticValue(clip: Clip, target: AnimTarget, v: AnimValue): Clip {
  if (target.kind === 'effect') {
    const n = (v as number) + 0;
    return { ...clip, effects: clip.effects.map((e) => (e.id === target.effectId ? { ...e, params: { ...e.params, [target.param]: n } } : e)) };
  }
  const t = clip.transform;
  if (target.prop === 'position') {
    const q = v as { x: number; y: number };
    return { ...clip, transform: { ...t, x: q.x + 0, y: q.y + 0 } };
  }
  const n = target.prop === 'rotation' ? normaliseDegrees(v as number) : (v as number) + 0;
  return { ...clip, transform: { ...t, [target.prop]: n } };
}

/** Every animated target: transform props in TRANSFORM_PROPS order, then effects in stack order, params in schema order. */
export function animatedTargets(clip: Clip): AnimTarget[] {
  const out: AnimTarget[] = [];
  for (const prop of TRANSFORM_PROPS) if ((clip.keys?.[prop]?.length ?? 0) > 0) out.push({ kind: 'transform', prop });
  for (const e of clip.effects) {
    if (!e.keys) continue;
    for (const d of VIDEO_EFFECTS[e.type].params) if ((e.keys[d.key]?.length ?? 0) > 0) out.push({ kind: 'effect', effectId: e.id, param: d.key });
  }
  return out;
}

/** Distinct local key times over every animated target (times within KEY_EPS merged into the earliest), sorted. */
export function keyTimes(clip: Clip): number[] {
  const all = animatedTargets(clip).flatMap((tg) => targetKeys(clip, tg)!.map((k) => k.t)).sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of all) if (out.length === 0 || !tooClose(t, out[out.length - 1])) out.push(t);
  return out;
}

/** Every key within KEY_EPS of local time `u`, one per target, in animatedTargets order. */
export function keyRefsAt(clip: Clip, u: number): KeyRef[] {
  const out: KeyRef[] = [];
  for (const target of animatedTargets(clip)) {
    const list = targetKeys(clip, target)!;
    const i = nearestKey(list, u);
    if (i >= 0) out.push({ target, t: list[i].t });
  }
  return out;
}
