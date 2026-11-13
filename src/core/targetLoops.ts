// Reading and writing one animation target's key loop (data v7, Plan 5B D4): transform loops live in
// `clip.keys.loops`, effect param loops in `effect.loops`, each next to the keys it repeats. Pure; never mutates.
import type { AnimTarget } from './animTargets';
import type { Clip, KeyLoop, TransformKeys, VideoEffect } from './model';

/** The target's stored loop, if any (it is inert while the target has fewer than two keys). */
export function targetLoop(clip: Clip, target: AnimTarget): KeyLoop | undefined {
  if (target.kind === 'transform') return clip.keys?.loops?.[target.prop];
  return clip.effects.find((e) => e.id === target.effectId)?.loops?.[target.param];
}

/** A loops record with `key` set to a copy of `loop` (or removed when undefined); undefined when nothing remains. */
function setEntry(loops: Readonly<Record<string, KeyLoop | undefined>> | undefined, key: string, loop: KeyLoop | undefined): Record<string, KeyLoop> | undefined {
  const out: Record<string, KeyLoop> = {};
  for (const q in loops) {
    const l = loops[q];
    if (q !== key && l) out[q] = l;
  }
  if (loop) out[key] = { mode: loop.mode, count: loop.count };
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Transform keys with the loop of `prop` set or removed (no `loops` field when none remains). */
export function withPropLoop(keys: TransformKeys, prop: keyof NonNullable<TransformKeys['loops']>, loop: KeyLoop | undefined): TransformKeys {
  const { loops: _l, ...rest } = keys;
  const loops = setEntry(keys.loops, prop, loop);
  return loops ? { ...rest, loops: loops as TransformKeys['loops'] } : rest;
}

/** An effect with the loop of `param` set or removed (no `loops` field when none remains). */
export function withParamLoop(e: VideoEffect, param: string, loop: KeyLoop | undefined): VideoEffect {
  const { loops: _l, ...rest } = e;
  const loops = setEntry(e.loops, param, loop);
  return loops ? { ...rest, loops } : rest;
}

/** `clip` with the target's loop set (a fresh copy) or removed; the caller guarantees the target exists. */
export function withTargetLoop(clip: Clip, target: AnimTarget, loop: KeyLoop | undefined): Clip {
  if (target.kind === 'transform') {
    const keys = withPropLoop(clip.keys ?? {}, target.prop, loop);
    const { keys: _k, ...bare } = clip;
    return Object.keys(keys).length > 0 ? { ...clip, keys } : bare;
  }
  return { ...clip, effects: clip.effects.map((e) => (e.id === target.effectId ? withParamLoop(e, target.param, loop) : e)) };
}
