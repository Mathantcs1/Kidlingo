// Key loops (data v7, Plan 5B D4): cycles after the last key of a target, evaluated in clip-local time. The ONE
// numeric evaluator (`evalKeys`) behind the resolver, the effect params and the inspector, so they cannot drift. Pure,
// closed form, allocation-free except for evalPositionKeys' result.
import { positionAt, valueAt } from './keyframes';
import type { KeyLoop, Keyframe, PositionKeyframe } from './model';

/** Where a looped target reads its keys: mapped local time `u`, cycle index (0 = the keys themselves), backwards? */
export interface LoopedTime {
  u: number;
  cycle: number;
  reverse: boolean;
}

/**
 * The local time the keys are read at (D4). Up to and including the last key (and before the first, which holds):
 * `u` itself, cycle 0. After it, with period P = last − first and e = u − first, cycle c = ⌈e / P⌉ − 1 ≥ 1 covers
 * (first + c·P, first + (c + 1)·P] (end-inclusive, so a cycle's end shows the last key's value like cycle 0 does)
 * and reads first + (e − c·P); 'pingPong' plays odd cycles backwards (last − (e − c·P)). With a `count` N the loop
 * stops after cycle N: from then on the end of cycle N holds. Inert (u, cycle 0) with fewer than two keys, no loop
 * or a non-positive period.
 */
export function loopedTime(list: readonly { t: number }[], loop: KeyLoop | undefined, u: number): LoopedTime {
  const n = list.length;
  if (!loop || n < 2) return { u, cycle: 0, reverse: false };
  const first = list[0].t;
  const last = list[n - 1].t;
  const period = last - first;
  if (!(u > last) || !(period > 0)) return { u, cycle: 0, reverse: false };
  const e = u - first;
  let cycle = Math.ceil(e / period) - 1;
  let local = e - cycle * period;
  if (cycle < 1) {
    // Floating noise just past the last key: still the start of cycle 1.
    cycle = 1;
    local = e - period;
  }
  if (loop.count !== null && cycle > loop.count) {
    cycle = loop.count;
    local = period;
  }
  const reverse = loop.mode === 'pingPong' && cycle % 2 === 1;
  if (local >= period) return { u: reverse ? first : last, cycle, reverse };
  return { u: reverse ? last - local : first + local, cycle, reverse };
}

/**
 * The value of a numeric key list at local time `u` with its optional loop (D4), clamped to [min, max] AFTER the
 * offset ('offset' adds cycle × (last − first)). Without a loop this is exactly `valueAt(list, u, min, max)`.
 */
export function evalKeys(list: readonly Keyframe[], loop: KeyLoop | undefined, u: number, min: number, max: number): number {
  if (!loop || list.length < 2) return valueAt(list, u, min, max);
  const m = loopedTime(list, loop, u);
  if (loop.mode !== 'offset' || m.cycle === 0) return valueAt(list, m.u, min, max);
  const v = valueAt(list, m.u) + m.cycle * (list[list.length - 1].v - list[0].v);
  return v < min ? min : v > max ? max : v;
}

/** The position at local time `u` with its optional loop ('offset' adds per axis); unclamped like positionAt. */
export function evalPositionKeys(list: readonly PositionKeyframe[], loop: KeyLoop | undefined, u: number): { x: number; y: number } {
  if (!loop || list.length < 2) return positionAt(list, u);
  const m = loopedTime(list, loop, u);
  const p = positionAt(list, m.u);
  if (loop.mode !== 'offset' || m.cycle === 0) return p;
  const a = list[0];
  const b = list[list.length - 1];
  return { x: p.x + m.cycle * (b.x - a.x), y: p.y + m.cycle * (b.y - a.y) };
}
