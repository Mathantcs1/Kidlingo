// The ONE resolver (Plan 5 D7): a stored clip -> the clip "as seen at time t". The compositor calls it once per clip
// per frame; the UI calls it at the playhead. Static clips take an allocation-free path and come back as-is.
import { evalKeys } from './keyLoops';
import { localTime } from './keyframes';
import type { Clip, Keyframe, Transform, VideoEffect } from './model';
import { composeMotion, motionAt } from './motion';
import { evalPosition, orientHeading } from './spatialPath';
import { animatableParam } from './videoEffects';

/** What the resolver needs of the project format (5B presets scale by the canvas size). */
export type ResolveFormat = { width: number; height: number; fps: number };

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
 * object with every animated property evaluated with its loop (5B D4) and clamped (D5: opacity 0..1, scale >= 0;
 * position and rotation unclamped). Position follows curved segments (5B D6); with `orient` the path heading is added
 * to the keyed or static rotation (D7). This is the BASE ("rest") value the inspector shows.
 */
export function resolvedTransform(clip: Clip, t: number, fps: number): Transform {
  if (!transformAnimated(clip)) return clip.transform;
  const k = clip.keys!;
  const loops = k.loops;
  const u = localTime(clip, t, fps);
  const pos = has(k.position) ? evalPosition(k.position!, loops?.position, u) : clip.transform;
  const rotation = has(k.rotation) ? evalKeys(k.rotation!, loops?.rotation, u, -Infinity, Infinity) : clip.transform.rotation;
  return {
    x: pos.x,
    y: pos.y,
    scale: has(k.scale) ? evalKeys(k.scale!, loops?.scale, u, 0, Infinity) : clip.transform.scale,
    rotation: k.orient ? rotation + orientHeading(k, u) : rotation,
    opacity: has(k.opacity) ? evalKeys(k.opacity!, loops?.opacity, u, 0, 1) : clip.transform.opacity,
  };
}

/** One effect with its animated params evaluated (with their loops) at local time `u`, clamped to the schema range; no `keys`/`loops`. */
function resolveEffect(e: VideoEffect, u: number): VideoEffect {
  if (e.keys === undefined) return e;
  const { keys, loops, ...rest } = e;
  const params = { ...e.params };
  for (const key in keys) {
    const list: Keyframe[] | undefined = keys[key];
    const d = has(list) ? animatableParam(e.type, key) : undefined;
    if (d) params[key] = evalKeys(list!, loops?.[key], u, d.min, d.max);
  }
  return { ...rest, params };
}

/**
 * The clip as seen at timeline time `t` (D7), DRAWN: the base (keys, loops, path, orient) with the animation stack
 * composed on top (5B D3). The SAME object when nothing is animated and there is no `motion`; otherwise a shallow copy
 * whose `transform` and `effects[].params` hold the evaluated values and which carries no `keys` (on the clip or its
 * effects), no effect `loops` and no `motion`. When no preset slot is active at `t` the transform is the base itself.
 * Effects without keys and an unanimated transform are shared with the input, which is never mutated.
 */
export function resolveClip(clip: Clip, t: number, format: ResolveFormat): Clip {
  const motion = clip.motion;
  if (!isAnimated(clip)) {
    if (motion === undefined) return clip;
    const { motion: _motion, ...still } = clip;
    const o = motionAt(clip, t, format);
    return o ? { ...still, transform: composeMotion(clip.transform, o) } : still;
  }
  const { keys: _keys, motion: _motion, ...rest } = clip;
  const anyEffect = clip.effects.some((e) => e.keys !== undefined);
  const { fps } = format;
  const u = anyEffect ? localTime(clip, t, fps) : 0;
  const base = resolvedTransform(clip, t, fps);
  const o = motion === undefined ? null : motionAt(clip, t, format);
  return {
    ...rest,
    transform: o ? composeMotion(base, o) : base,
    effects: anyEffect ? clip.effects.map((e) => resolveEffect(e, u)) : clip.effects,
  };
}
