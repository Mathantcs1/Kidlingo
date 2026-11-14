// The animation preset library (Plan 5B §5, Q1): PRESET_SCHEMA (slots, opacity-only flag, default timing/ease and param
// ranges per preset) is the ONE source: data v7 migration repairs stored presets against it (migrateMotion.ts) and
// Ruling P5B-2 makes any change to it after the 5B deploy a data-version bump. PRESETS adds labels, synonyms and the
// exit defaults; the maths live in presetMath.ts.
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
  hop: def(EMPHASIS, 0.5, e('linear'), [p('distance', 'Height', 0, 1, 0.01, 0.1)]),
  spin360: def(EMPHASIS, 0.8, e('easeInOut'), [int('turns', 'Turns', -3, 3, 1)]),
  breathe: def(LOOP, 3, e('easeInOut'), [p('intensity', 'Intensity', 0, 0.5, 0.01, 0.05)]),
  float: def(LOOP, 3, e('easeInOut'), [p('distance', 'Distance', 0, 0.5, 0.005, 0.03)]),
  spinLoop: def(LOOP, 4, e('linear'), [int('turns', 'Turns per cycle', -10, 10, 1)]),
  jitter: def(LOOP, 0.5, e('linear'), [p('intensity', 'Intensity', 0, 0.1, 0.001, 0.01), int('seed', 'Seed', 0, SEED_MAX, 0)]),
  blink: def(LOOP, 1, e('linear'), [p('duty', 'On fraction', 0.05, 0.95, 0.05, 0.5)], true),
  kenBurns: def(LOOP, 5, e('linear'), [
    p('from', 'Zoom start', 0.5, 3, 0.01, 1, '×'), p('to', 'Zoom end', 0.5, 3, 0.01, 1.2, '×'),
    int('direction', 'Pan direction', 0, 7, 0), p('distance', 'Pan distance', 0, 0.5, 0.01, 0.05),
  ]),
};

export const isPresetKey = (v: unknown): v is PresetKey => typeof v === 'string' && Object.hasOwn(PRESET_SCHEMA, v);

/** A library entry: the schema plus what the browser and `setPreset` need (Q1: 28 entries from 20 definitions). */
export interface PresetDef extends PresetSchema {
  key: PresetKey;
  /** The name in the Entrance, Emphasis and Continuous lists. */
  label: string;
  /** The name in the Exit list (in/out presets; Rise is Sink on the way out). */
  outLabel: string;
  /** Extra search words (lower case). */
  synonyms: readonly string[];
  defaultDuration: number;
  /** The ease of the `in`, `emphasis` and `loop` slots (the schema's ease). */
  defaultEase: Ease;
  /** The ease of the `out` slot (the mirror of the entrance: easeOut ⇒ easeIn, back ⇒ back-in). */
  outEase: Ease;
  /** Param defaults that differ in the `out` slot (Zoom Out grows from 1 to 1.5). */
  outParams: Readonly<Record<string, number>>;
}

/** CSS "easeInBack": the exit mirror of the `back` ease (y stays within the stored bezier range). */
const BACK_IN: Ease = { kind: 'bezier', bezier: [0.36, 0, 0.66, -0.56] };
const mirror = (ease: Ease): Ease => {
  if (ease.kind === 'easeOut' || ease.kind === 'bounce') return { kind: 'easeIn' };
  if (ease.kind === 'easeIn') return { kind: 'easeOut' };
  if (ease.kind === 'back') return { ...BACK_IN, bezier: [...BACK_IN.bezier!] as [number, number, number, number] };
  return e(ease.kind);
};

type Words = [label: string, synonyms: string[], outLabel?: string, outParams?: Record<string, number>];
const WORDS: Readonly<Record<PresetKey, Words>> = {
  fade: ['Fade', ['dissolve', 'appear', 'disappear', 'opacity']],
  slide: ['Slide', ['move', 'push', 'wipe', 'left', 'right', 'up', 'down']],
  zoom: ['Zoom', ['scale', 'grow', 'shrink', 'enlarge'], 'Zoom', { from: 1.5 }],
  pop: ['Pop', ['bounce', 'spring', 'burst', 'scale']],
  spin: ['Spin', ['rotate', 'turn', 'twirl']],
  drop: ['Drop', ['fall', 'gravity', 'bounce']],
  whip: ['Whip', ['swipe', 'fast', 'snap', 'swish']],
  rise: ['Rise', ['float up', 'lift', 'sink', 'fade up'], 'Sink'],
  pulse: ['Pulse', ['beat', 'heartbeat', 'throb', 'scale']],
  shake: ['Shake', ['vibrate', 'earthquake', 'tremble', 'rattle']],
  wobble: ['Wobble', ['wiggle', 'jiggle', 'tilt', 'rock']],
  flash: ['Flash', ['blink', 'strobe', 'flicker']],
  hop: ['Hop', ['jump', 'bounce', 'leap']],
  spin360: ['Spin 360', ['rotate', 'turn', 'full turn', 'twirl']],
  breathe: ['Breathe', ['pulse', 'grow', 'throb', 'scale']],
  float: ['Float', ['hover', 'bob', 'drift']],
  spinLoop: ['Spin loop', ['rotate', 'turn', 'continuous', 'wheel']],
  jitter: ['Jitter', ['shake', 'vibrate', 'nervous', 'wiggle']],
  blink: ['Blink', ['flash', 'flicker', 'strobe', 'on off']],
  kenBurns: ['Ken Burns', ['pan', 'zoom', 'documentary', 'photo', 'drift']],
};

export const PRESET_KEYS = Object.keys(PRESET_SCHEMA) as PresetKey[];

export const PRESETS: Readonly<Record<PresetKey, PresetDef>> = Object.fromEntries(PRESET_KEYS.map((key) => {
  const s = PRESET_SCHEMA[key];
  const [label, synonyms, outLabel = label, outParams = {}] = WORDS[key];
  const d: PresetDef = { ...s, key, label, outLabel, synonyms, defaultDuration: s.duration, defaultEase: s.ease, outEase: mirror(s.ease), outParams };
  return [key, d];
})) as Record<PresetKey, PresetDef>;

/** The preset's name in `slot`'s list (Exit names for `out`). */
export const presetLabel = (key: PresetKey, slot: MotionSlot): string => (slot === 'out' ? PRESETS[key].outLabel : PRESETS[key].label);

/** The presets offered in `slot`, in library order. */
export const presetsForSlot = (slot: MotionSlot): PresetKey[] => PRESET_KEYS.filter((k) => PRESET_SCHEMA[k].slots.includes(slot));

/** The default ease of `key` in `slot` (a fresh object). */
export const presetEase = (key: PresetKey, slot: MotionSlot): Ease => {
  const ease = slot === 'out' ? PRESETS[key].outEase : PRESETS[key].defaultEase;
  return { ...ease, ...(ease.bezier ? { bezier: [...ease.bezier] as [number, number, number, number] } : {}), ...(ease.spring ? { spring: { ...ease.spring } } : {}) };
};

/** Every param of `key` at its default for `slot` (integers stay integral). */
export function presetParams(key: PresetKey, slot: MotionSlot): Record<string, number> {
  const out: Record<string, number> = {};
  const over = slot === 'out' ? PRESETS[key].outParams : {};
  for (const d of PRESET_SCHEMA[key].params) out[d.key] = Object.hasOwn(over, d.key) ? over[d.key] : d.def;
  return out;
}
