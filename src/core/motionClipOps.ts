// How the animation stack follows clip operations (Plan 5B D12). `in`/`out` are relative to the clip edges, so trims
// need nothing; `emphasis.at` and the loop `phase` are footage-anchored like keys (5A D3): unchanged on sourced clips,
// shifted on sourceless ones whose local time restarts at their start. Fresh copies; never mutates input.
import { boundMotionTime } from './motionTypes';
import type { ClipMotion, PresetUse } from './motionTypes';

const copyUse = <U extends PresetUse>(u: U): U => ({
  ...u,
  ease: { ...u.ease, ...(u.ease.bezier ? { bezier: [...u.ease.bezier] as [number, number, number, number] } : {}), ...(u.ease.spring ? { spring: { ...u.ease.spring } } : {}) },
  params: { ...u.params },
});

/**
 * The stack of a SOURCELESS clip whose local time moves by `d` (a start trim by Δ, or the right half of a split at
 * offset d): the emphasis keeps its timeline time (`at − d`), the loop its cycles (`phase + d`). Bounded (M6).
 */
export function shiftMotion(m: ClipMotion, d: number): ClipMotion {
  const out: ClipMotion = {};
  if (m.in) out.in = copyUse(m.in);
  if (m.emphasis) out.emphasis = { ...copyUse(m.emphasis), at: boundMotionTime(m.emphasis.at - d) };
  if (m.loop) out.loop = { ...copyUse(m.loop), phase: boundMotionTime(m.loop.phase + d) };
  if (m.out) out.out = copyUse(m.out);
  return out;
}

const orNone = (m: ClipMotion): ClipMotion | undefined => (Object.keys(m).length > 0 ? m : undefined);

/**
 * The stacks of the two halves of a split at local time `mid` (original local time; `shift` = the right half's local
 * time shift, −d for a sourceless clip, 0 for a sourced one). Left: `in`, the emphasis when its window starts before
 * `mid`, the loop. Right: `out`, the emphasis when it starts at or after `mid`, the loop (shifted when sourceless). A
 * cut inside the entrance (or exit, or an emphasis window) leaves the other half at rest there: the accepted
 * discontinuity (D12, like Plan 4 time-based effects); Ken Burns spans each half on its own.
 */
export function splitMotion(m: ClipMotion | undefined, mid: number, shift: number): [ClipMotion | undefined, ClipMotion | undefined] {
  if (!m) return [undefined, undefined];
  const left: ClipMotion = {};
  const right: ClipMotion = {};
  if (m.in) left.in = copyUse(m.in);
  if (m.emphasis) {
    if (m.emphasis.at < mid) left.emphasis = copyUse(m.emphasis);
    else right.emphasis = copyUse(m.emphasis);
  }
  if (m.loop) {
    left.loop = copyUse(m.loop);
    right.loop = copyUse(m.loop);
  }
  if (m.out) right.out = copyUse(m.out);
  return [orNone(left), orNone(shift === 0 ? right : shiftMotion(right, -shift))];
}
