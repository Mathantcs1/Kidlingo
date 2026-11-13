// Animation preset stack data (data v7, Plan 5B D1/D2/D14): a clip stores at most one preset per slot, evaluated on the
// fly by the resolver (src/core/motion.ts, Task 5). Pure types and limits; definitions live in presets.ts.
import type { Ease } from './easing';

export type MotionSlot = 'in' | 'emphasis' | 'loop' | 'out';
export const MOTION_SLOTS: readonly MotionSlot[] = ['in', 'emphasis', 'loop', 'out'];

export type PresetKey =
  | 'fade' | 'slide' | 'zoom' | 'pop' | 'spin' | 'drop' | 'whip' | 'rise' // in / out (mirrored)
  | 'pulse' | 'shake' | 'wobble' | 'flash' | 'hop' | 'spin360' // emphasis
  | 'breathe' | 'float' | 'spinLoop' | 'jitter' | 'blink' | 'kenBurns'; // loop

/**
 * One preset in a slot. `duration` and `delay` in seconds (D2: `in` starts `delay` after the clip start, `out` ends
 * `delay` before the clip end); `ease` shapes the progress; `params` holds every param of the preset's schema (numbers;
 * enums as integers; `seed` for the seeded presets).
 */
export interface PresetUse {
  preset: PresetKey;
  duration: number;
  delay: number;
  ease: Ease;
  params: Record<string, number>;
}

/** A one-shot window at clip-LOCAL time `at` (source-anchored like a key, 5A D3). */
export interface EmphasisUse extends PresetUse {
  at: number;
}

/**
 * The continuous slot: `duration` is the period, `delay` is unused (always 0), `phase` (seconds) shifts the cycle in
 * local time, `count` = cycles (integer 1..1000) or null (until the clip end).
 */
export interface LoopUse extends PresetUse {
  phase: number;
  count: number | null;
}

export interface ClipMotion {
  in?: PresetUse;
  emphasis?: EmphasisUse;
  loop?: LoopUse;
  out?: PresetUse;
}

/** D14 limits (seconds). */
export const MOTION_LIMITS = {
  duration: [0.05, 30],
  delay: [0, 30],
  period: [0.1, 60],
  count: [1, 1000],
} as const;
