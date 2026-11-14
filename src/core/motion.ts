// The animation stack at time t (Plan 5B D2/D3): which preset windows are active on the clip's own frame grid, their
// offsets, and the blending rule that puts them on top of the base (keyed or static) transform. Pure, DOM-free;
// allocation-free when no slot is active.
import { localTime } from './keyframes';
import { snapToFrame } from './fps';
import { clipDuration } from './model';
import type { Clip, Transform } from './model';
import type { ClipMotion, MotionOffsets, PresetUse } from './motionTypes';
import { presetMaxScale, presetOffsets } from './presetMath';
import type { PresetFormat } from './presetMath';

export type { MotionOffsets };

/** What motion needs of the project format. */
export type MotionFormat = PresetFormat & { fps: number };

/**
 * D3 blending of two offsets: positions and rotations ADD, scale and opacity factors MULTIPLY. Each field combines only
 * with the same field, so the result does not depend on the order the slots are folded in.
 */
export function blendOffsets(a: MotionOffsets, b: MotionOffsets): MotionOffsets {
  return { dx: a.dx + b.dx, dy: a.dy + b.dy, drot: a.drot + b.drot, kScale: a.kScale * b.kScale, kOpacity: a.kOpacity * b.kOpacity };
}

const fold = (acc: MotionOffsets | null, o: MotionOffsets | null): MotionOffsets | null => (acc === null ? o : o === null ? acc : blendOffsets(acc, o));

/** The in/out windows in clip-relative seconds, scaled by D / total when they (with delays) do not fit (D2, P5B-6). */
export interface MotionWindows {
  in?: { start: number; end: number };
  out?: { start: number; end: number };
}

/**
 * The factor that shrinks the in/out windows when they do not fit: D / total when BOTH slots exist and total = (din +
 * delayIn) + (dout + delayOut) exceeds D, else 1. Ruling P5B-6 (supersedes P5B-5 for lone slots): a LONE slot is never
 * scaled, because scaling it would squeeze an entrance on the halves of a split or end trim and change the frames they
 * keep (D12). A 0.5 s Fade Out on a 0.3 s clip therefore starts partly faded: that is what the user set.
 */
function fitFactor(m: ClipMotion, d: number): number {
  if (!m.in || !m.out) return 1;
  const total = m.in.duration + m.in.delay + m.out.duration + m.out.delay;
  return total > d ? (d > 0 ? d / total : 0) : 1;
}

/** The entrance and exit windows of `clip` after short-clip scaling (for the timeline bands and tests). */
export function motionWindows(clip: Clip): MotionWindows {
  const m = clip.motion;
  const d = clipDuration(clip);
  if (!m) return {};
  const k = fitFactor(m, d);
  const w: MotionWindows = {};
  if (m.in) w.in = { start: m.in.delay * k, end: (m.in.delay + m.in.duration) * k };
  if (m.out) w.out = { start: d - (m.out.delay + m.out.duration) * k, end: d - m.out.delay * k };
  return w;
}

/** Local-time tolerance of the emphasis window edges (the 1e-9 EDGE of keyframes.ts). */
const EDGE = 1e-9;

const timing = (u: PresetUse, seconds: number) => ({ ease: u.ease, seconds });

/**
 * The stack's offsets at timeline time `t` (D2), or null when no slot is active. Clip time s = snapToFrame(t − start)
 * (frame grid). `in`: p = (s − delay)/duration, its start state before the delay, inactive from p = 1. `out`: ends at
 * the clip end, its end state from s = D − delay. Windows that do not fit are scaled (fitFactor, only when in and out overlap; stored values kept).
 * `emphasis`: identity outside [at, at + duration) in LOCAL time (footage-anchored). `loop`: τ = (local + phase) /
 * period, active for every τ (count null) or 0 ≤ τ < count; each cycle runs p = frac(τ) (cycle starts read with a
 * 1e-9-cycle tolerance). Ken Burns (loop slot) spans
 * the visible clip: p = s / D.
 */
export function motionAt(clip: Clip, t: number, format: MotionFormat): MotionOffsets | null {
  const m = clip.motion;
  if (!m) return null;
  const d = clipDuration(clip);
  const s = snapToFrame(t - clip.start, format.fps);
  let acc: MotionOffsets | null = null;
  if (m.in || m.out) {
    const k = fitFactor(m, d);
    if (m.in) {
      const delay = m.in.delay * k;
      const dur = m.in.duration * k;
      if (s < delay + dur) acc = presetOffsets(m.in.preset, 'in', dur > 0 ? (s - delay) / dur : 0, m.in.params, format, timing(m.in, dur));
    }
    if (m.out) {
      const end = d - m.out.delay * k;
      const dur = m.out.duration * k;
      const start = end - dur;
      if (s > start) acc = fold(acc, presetOffsets(m.out.preset, 'out', s >= end || !(dur > 0) ? 1 : (s - start) / dur, m.out.params, format, timing(m.out, dur)));
    }
  }
  const e = m.emphasis;
  const loop = m.loop;
  if (!e && !loop) return acc;
  const u = localTime(clip, t, format.fps);
  // The window [at, at + duration) read with EDGE: a split or trim moves `at` by a non-snapped amount (I1).
  if (e && e.duration > 0 && u >= e.at - EDGE && u < e.at + e.duration - EDGE) {
    acc = fold(acc, presetOffsets(e.preset, 'emphasis', (u - e.at) / e.duration, e.params, format, timing(e, e.duration)));
  }
  if (loop) {
    if (loop.preset === 'kenBurns') {
      acc = fold(acc, presetOffsets('kenBurns', 'loop', d > 0 ? s / d : 0, loop.params, format, timing(loop, d > 0 ? d : loop.duration)));
    } else if (loop.duration > 0) {
      const tau = (u + loop.phase) / loop.duration;
      // The cycle index with a 1e-9-cycle tolerance (like frameIndex): a frame landing on a cycle start by exact
      // arithmetic reads cycle start whatever the rounding (a split's shifted phase rounds differently).
      const n = Math.floor(tau + 1e-9);
      if (Number.isFinite(tau) && (loop.count === null || (n >= 0 && n < loop.count))) {
        const f = tau - n;
        acc = fold(acc, presetOffsets(loop.preset, 'loop', f > 0 ? f : 0, loop.params, format, timing(loop, loop.duration)));
      }
    }
  }
  return acc;
}

const finiteOr = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

/**
 * The drawn transform (D3): base position/rotation + offsets, base scale/opacity × factors, clamped once at the end
 * (opacity 0..1, scale ≥ 0 and finite; NaN-safe: a non-finite position/rotation keeps the base value, a NaN factor hides).
 */
export function composeMotion(base: Transform, o: MotionOffsets): Transform {
  const scale = base.scale * o.kScale;
  const opacity = base.opacity * o.kOpacity;
  return {
    x: finiteOr(base.x + o.dx, base.x),
    y: finiteOr(base.y + o.dy, base.y),
    rotation: finiteOr(base.rotation + o.drot, base.rotation),
    scale: scale > 0 ? (Number.isFinite(scale) ? scale : base.scale) : 0,
    opacity: opacity > 0 ? (opacity < 1 ? opacity : 1) : 0,
  };
}

/**
 * An upper bound (≥ 1) of the scale factor the clip's whole stack can give at any time: the product of each slot's
 * bound (factors multiply and are never negative). Overlay textures are sized by maxScale(clip) × this (Task 6).
 */
export function maxMotionScale(clip: Clip): number {
  const m = clip.motion;
  if (!m) return 1;
  let k = 1;
  if (m.in) k *= presetMaxScale(m.in.preset, 'in', m.in.params, m.in.ease);
  if (m.emphasis) k *= presetMaxScale(m.emphasis.preset, 'emphasis', m.emphasis.params, m.emphasis.ease);
  if (m.loop) k *= presetMaxScale(m.loop.preset, 'loop', m.loop.params, m.loop.ease);
  if (m.out) k *= presetMaxScale(m.out.preset, 'out', m.out.params, m.out.ease);
  return k;
}
