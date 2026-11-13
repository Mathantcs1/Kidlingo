// The animation preset schema (Plan 5B §5, Q1): slots, opacity-only flag, default timing/ease and param ranges per
// preset. Data v7 migration repairs stored presets against it (migrateMotion.ts). 5B Task 2 stub: the final keys and
// param ranges; Task 5 adds labels, synonyms and the maths (presetMath.ts).
import { SPRING_DEFAULT } from './easing';
import type { Ease } from './easing';
import type { MotionSlot, PresetKey } from './motionTypes';
import type { ParamDef } from './videoEffects';

/** A preset param: the Plan 4 ParamDef plus `integer` (enums, seeds: stored rounded). */
export interface PresetParam extends ParamDef {
  integer?: true;
}

export interface PresetSchema {
  /** The slots the preset can sit in (in/out presets are mirrored). */
  slots: readonly MotionSlot[];
  /** Touches only opacity: the only presets an adjustment clip accepts (D13). */
  opacityOnly: boolean;
  /** Default duration (loop slot: the period), seconds. */
  duration: number;
  ease: Ease;
  params: readonly PresetParam[];
}

const p = (key: string, label: string, min: number, max: number, step: number, def: number, unit?: string): PresetParam =>
  ({ key, label, min, max, step, def, unit });
const int = (key: string, label: string, min: number, max: number, def: number): PresetParam =>
  ({ key, label, min, max, step: 1, def, integer: true });

const IN_OUT: readonly MotionSlot[] = ['in', 'out'];
const EMPHASIS: readonly MotionSlot[] = ['emphasis'];
const LOOP: readonly MotionSlot[] = ['loop'];
const e = (kind: Ease['kind']): Ease => (kind === 'spring' ? { kind, spring: { ...SPRING_DEFAULT } } : { kind });
const def = (slots: readonly MotionSlot[], duration: number, ease: Ease, params: PresetParam[], opacityOnly = false): PresetSchema =>
  ({ slots, opacityOnly, duration, ease, params });

/** Direction: 0 left, 1 right, 2 up, 3 down (Ken Burns adds 4..7: the diagonals). Distances are format fractions. */
const direction4 = int('direction', 'Direction', 0, 3, 0);
const SEED_MAX = 2147483647;

export const PRESET_SCHEMA: Readonly<Record<PresetKey, PresetSchema>> = {
  fade: def(IN_OUT, 0.5, e('easeOut'), [], true),
  slide: def(IN_OUT, 0.6, e('easeOut'), [direction4, p('distance', 'Distance', 0, 2, 0.01, 1)]),
  zoom: def(IN_OUT, 0.5, e('easeOut'), [p('from', 'Zoom from', 0, 3, 0.01, 0.5, '×')]),
  pop: def(IN_OUT, 0.5, e('spring'), [p('intensity', 'Overshoot', 0, 0.5, 0.01, 0.15)]),
  spin: def(IN_OUT, 0.7, e('easeOut'), [p('turns', 'Turns', -3, 3, 0.25, 0.5)]),
  drop: def(IN_OUT, 0.8, e('bounce'), [p('distance', 'Distance', 0, 2, 0.01, 0.6)]),
  whip: def(IN_OUT, 0.4, e('back'), [direction4, p('distance', 'Distance', 0, 2, 0.01, 1)]),
  rise: def(IN_OUT, 0.6, e('easeOut'), [p('distance', 'Distance', 0, 0.5, 0.01, 0.1)]),
  pulse: def(EMPHASIS, 0.6, e('easeInOut'), [p('intensity', 'Intensity', 0, 1, 0.01, 0.15)]),
  shake: def(EMPHASIS, 0.6, e('linear'), [
    p('intensity', 'Intensity', 0, 0.2, 0.005, 0.02), p('frequency', 'Frequency', 1, 30, 0.5, 8, 'Hz'), int('seed', 'Seed', 0, SEED_MAX, 0),
  ]),
  wobble: def(EMPHASIS, 0.8, e('linear'), [p('intensity', 'Angle', 0, 90, 0.5, 10, '°')]),
  flash: def(EMPHASIS, 0.6, e('linear'), [int('flashes', 'Flashes', 1, 10, 2)], true),
  hop: def(EMPHASIS, 0.5, e('easeOut'), [p('distance', 'Height', 0, 1, 0.01, 0.1)]),
  spin360: def(EMPHASIS, 0.8, e('easeInOut'), [p('turns', 'Turns', -3, 3, 0.25, 1)]),
  breathe: def(LOOP, 3, e('easeInOut'), [p('intensity', 'Intensity', 0, 0.5, 0.01, 0.05)]),
  float: def(LOOP, 3, e('easeInOut'), [p('distance', 'Distance', 0, 0.5, 0.005, 0.03)]),
  spinLoop: def(LOOP, 4, e('linear'), [p('turns', 'Turns per cycle', -10, 10, 0.25, 1)]),
  jitter: def(LOOP, 0.5, e('linear'), [p('intensity', 'Intensity', 0, 0.1, 0.001, 0.01), int('seed', 'Seed', 0, SEED_MAX, 0)]),
  blink: def(LOOP, 1, e('hold'), [p('duty', 'On fraction', 0.05, 0.95, 0.05, 0.5)], true),
  kenBurns: def(LOOP, 5, e('linear'), [
    p('from', 'Zoom start', 0.5, 3, 0.01, 1, '×'), p('to', 'Zoom end', 0.5, 3, 0.01, 1.2, '×'),
    int('direction', 'Pan direction', 0, 7, 0), p('distance', 'Pan distance', 0, 0.5, 0.01, 0.05),
  ]),
};

export const isPresetKey = (v: unknown): v is PresetKey => typeof v === 'string' && Object.hasOwn(PRESET_SCHEMA, v);
