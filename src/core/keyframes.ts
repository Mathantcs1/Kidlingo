// Keyframe evaluation (Plan 5 D3/D4): clip-local time and value interpolation. Pure, DOM-free, allocation-free
// except for positionAt's result.
import { easeAt } from './easing';
import { snapToFrame } from './fps';
import { clipDuration, isSourceless } from './model';
import type { Clip, Keyframe, PositionKeyframe } from './model';

/** Two keys of one property closer than this (seconds) are the same key. */
export const KEY_EPS = 1e-4;
/** At most this many keys per property (D11). */
export const MAX_KEYS = 500;
/** Keyed rotation is unbounded multi-turn degrees, clamped to this (D4). */
export const KEYED_ROTATION_LIMIT = 36_000;
/** Position keys stay within ±this (format px) and keyed scale within 0..KEYED_SCALE_LIMIT, so `b − a` stays finite. */
export const KEYED_POSITION_LIMIT = 1e7;
export const KEYED_SCALE_LIMIT = 1e6;

/** Whether two key times count as the same key (closer than KEY_EPS): the ONE rule for migration and every edit. */
export function tooClose(a: number, b: number): boolean {
  return Math.abs(a - b) < KEY_EPS;
}

/**
 * The clip-local key time at timeline time `t` (D3): `in + snap(t − start)` for sourced clips (video, image), so keys
 * stay on their footage frame; `snap(t − start)` for sourceless clips (overlay, adjustment). The offset is snapped to
 * its frame's start, so preview frame N equals export frame N; times before the clip read its first frame.
 */
export function localTime(clip: Clip, t: number, fps: number): number {
  return (isSourceless(clip) ? 0 : clip.in) + snapToFrame(t - clip.start, fps);
}

/** The clip's visible local range [lo, hi] (D3): `[in, out]` for sourced clips, `[0, duration]` for sourceless ones. */
export function localRange(clip: Clip): [number, number] {
  const lo = isSourceless(clip) ? 0 : clip.in;
  return [lo, lo + clipDuration(clip)];
}

/** Index of the last key with `t <= u` (binary search); −1 when `u` is before the first key. */
function segmentIndex(keys: readonly { t: number }[], u: number): number {
  let lo = 0;
  let hi = keys.length - 1;
  if (hi < 0 || u < keys[0].t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid].t <= u) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The eased fraction of segment `i` → `i + 1` at `u`, or null when `u` is at/after the last key or before the first. */
function fraction(keys: readonly { t: number; ease: Keyframe['ease'] }[], i: number, u: number): number | null {
  if (i < 0 || i >= keys.length - 1) return null;
  const a = keys[i];
  return easeAt(a.ease, (u - a.t) / (keys[i + 1].t - a.t));
}

/**
 * The value of a sorted key list at local time `u` (D4): the first key's value before it, the last key's after it,
 * `a + (b − a)·ease(fraction)` between (exactly the key's value at a key). The VALUE is clamped to [min, max] (D5:
 * eases such as `back` overshoot). NaN for an empty list (callers only evaluate animated properties).
 */
export function valueAt(keys: readonly Keyframe[], u: number, min = -Infinity, max = Infinity): number {
  if (keys.length === 0) return NaN;
  const i = segmentIndex(keys, u);
  const f = fraction(keys, i, u);
  let v: number;
  if (f === null) v = i < 0 ? keys[0].v : keys[i].v;
  else v = keys[i].v + (keys[i + 1].v - keys[i].v) * f;
  return v < min ? min : v > max ? max : v;
}

/** The position at local time `u`: x and y share one eased fraction (straight path, D4); unclamped. */
export function positionAt(keys: readonly PositionKeyframe[], u: number): { x: number; y: number } {
  if (keys.length === 0) return { x: NaN, y: NaN };
  const i = segmentIndex(keys, u);
  const f = fraction(keys, i, u);
  if (f === null) {
    const k = keys[i < 0 ? 0 : i];
    return { x: k.x, y: k.y };
  }
  const a = keys[i];
  const b = keys[i + 1];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** The largest scale the clip can show: its static scale and every scale key (overlay texture sizing, Task 5). */
export function maxScale(clip: Clip): number {
  let m = clip.transform.scale;
  for (const k of clip.keys?.scale ?? []) if (k.v > m) m = k.v;
  return m;
}
