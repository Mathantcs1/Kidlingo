// The ONE resolver (Plan 5 D7): a stored clip -> the clip "as seen at time t". The compositor calls it once per clip
// per frame; the UI calls it at the playhead. Static clips take an allocation-free path and come back as-is.
import { localTime, positionAt, valueAt } from './keyframes';
import type { Clip, Keyframe, Transform, VideoEffect } from './model';
import { animatableParam } from './videoEffects';

const has = (list: readonly unknown[] | undefined): boolean => list !== undefined && list.length > 0;

function effectAnimated(e: VideoEffect): boolean {
  const keys = e.keys;
  if (!keys) return false;
  for (const k in keys) if (has(keys[k])) return true;
  return false;
}

function transformAnimated(clip: Clip): boolean {
  const k = clip.keys;
  return k !== undefined && (has(k.position) || has(k.scale) || has(k.rotation) || has(k.opacity));
}

/** True when any transform property or effect param has at least one key. */
export function isAnimated(clip: Clip): boolean {
  if (transformAnimated(clip)) return true;
  for (const e of clip.effects) if (effectAnimated(e)) return true;
  return false;
}

/**
 * The transform at timeline time `t`: `clip.transform` itself when no transform property is animated, else a new
 * object with every animated property evaluated (D5 clamps: opacity 0..1, scale >= 0; position and rotation unclamped).
 */
export function resolvedTransform(clip: Clip, t: number, fps: number): Transform {
  if (!transformAnimated(clip)) return clip.transform;
  const k = clip.keys!;
  const u = localTime(clip, t, fps);
  const pos = has(k.position) ? positionAt(k.position!, u) : clip.transform;
  return {
    x: pos.x,
    y: pos.y,
    scale: has(k.scale) ? valueAt(k.scale!, u, 0) : clip.transform.scale,
    rotation: has(k.rotation) ? valueAt(k.rotation!, u) : clip.transform.rotation,
    opacity: has(k.opacity) ? valueAt(k.opacity!, u, 0, 1) : clip.transform.opacity,
  };
}

/** One effect with its animated params evaluated at local time `u` (clamped to the schema range) and no `keys`. */
function resolveEffect(e: VideoEffect, u: number): VideoEffect {
  if (e.keys === undefined) return e;
  const { keys, ...rest } = e;
  const params = { ...e.params };
  for (const key in keys) {
    const list: Keyframe[] | undefined = keys[key];
    const d = has(list) ? animatableParam(e.type, key) : undefined;
    if (d) params[key] = valueAt(list!, u, d.min, d.max);
  }
  return { ...rest, params };
}

/**
 * The clip as seen at timeline time `t` (D7): the SAME object when nothing is animated; otherwise a shallow copy
 * whose `transform` and `effects[].params` hold the evaluated values and which carries no `keys` (on the clip or its
 * effects). Effects without keys and an unanimated transform are shared with the input, which is never mutated.
 */
export function resolveClip(clip: Clip, t: number, fps: number): Clip {
  if (!isAnimated(clip)) return clip;
  const { keys: _keys, ...rest } = clip;
  const anyEffect = clip.effects.some((e) => e.keys !== undefined);
  const u = anyEffect ? localTime(clip, t, fps) : 0;
  return {
    ...rest,
    transform: resolvedTransform(clip, t, fps),
    effects: anyEffect ? clip.effects.map((e) => resolveEffect(e, u)) : clip.effects,
  };
}
