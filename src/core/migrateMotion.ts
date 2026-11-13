// Repairs a hand-edited animation preset stack (`Clip.motion`, data v7) when a save is opened (Plan 5B D14): unknown
// slots and presets (or a preset in a slot it does not support) are dropped; durations, delays, loop periods and params
// are clamped (non-finite => the preset's default, delay 0); the ease is repaired; an emphasis needs a finite `at`;
// loop `count` is an integer 1..1000 or null. Per kind (D13): audio clips have no motion, adjustment clips keep only
// opacity-only presets. Slots are rebuilt (extra fields dropped); an emptied stack is removed. Never mutates input.
import { repairEase } from './easing';
import { repairCount } from './migrateKeys';
import type { Clip } from './model';
import { MOTION_LIMITS } from './motionTypes';
import type { ClipMotion, EmphasisUse, LoopUse, MotionSlot, PresetUse } from './motionTypes';
import { PRESET_SCHEMA, isPresetKey } from './presets';
import type { PresetSchema } from './presets';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, v)) + 0;

/** Every schema param present: finite values clamped (integer params rounded), others the default; unknown dropped. */
function repairParams(raw: unknown, schema: PresetSchema): Record<string, number> {
  const r = isObject(raw) ? raw : {};
  const out: Record<string, number> = {};
  for (const d of schema.params) {
    const v = Object.hasOwn(r, d.key) ? r[d.key] : undefined;
    out[d.key] = finite(v) ? clamp(d.integer ? Math.round(v) : v, [d.min, d.max]) : d.def;
  }
  return out;
}

/** The common fields of a slot, or null when the preset is unknown, not allowed in `slot`, or not for this kind. */
function repairUse(raw: unknown, slot: MotionSlot, adjustment: boolean): PresetUse | null {
  if (!isObject(raw) || !isPresetKey(raw.preset)) return null;
  const schema = PRESET_SCHEMA[raw.preset];
  if (!schema.slots.includes(slot) || (adjustment && !schema.opacityOnly)) return null;
  const loop = slot === 'loop';
  return {
    preset: raw.preset,
    duration: finite(raw.duration) ? clamp(raw.duration, loop ? MOTION_LIMITS.period : MOTION_LIMITS.duration) : schema.duration,
    delay: !loop && finite(raw.delay) ? clamp(raw.delay, MOTION_LIMITS.delay) : 0,
    ease: isObject(raw.ease) ? repairEase(raw.ease) : repairEase(schema.ease),
    params: repairParams(raw.params, schema),
  };
}

function repairEmphasis(raw: unknown, adjustment: boolean): EmphasisUse | undefined {
  const use = repairUse(raw, 'emphasis', adjustment);
  const at = isObject(raw) ? raw.at : undefined;
  return use && finite(at) ? { ...use, at: at + 0 } : undefined;
}

function repairLoopUse(raw: unknown, adjustment: boolean): LoopUse | undefined {
  const use = repairUse(raw, 'loop', adjustment);
  if (!use || !isObject(raw)) return undefined;
  return { ...use, phase: finite(raw.phase) ? raw.phase + 0 : 0, count: repairCount(raw.count) };
}

/** A clip's repaired preset stack by kind; undefined when nothing valid remains (the field is then removed). */
export function repairMotion(raw: unknown, kind: Clip['kind'] | unknown): ClipMotion | undefined {
  if (!isObject(raw) || kind === 'audio') return undefined;
  const adjustment = kind === 'adjustment';
  const m: ClipMotion = {};
  const inUse = repairUse(raw.in, 'in', adjustment);
  const emphasis = repairEmphasis(raw.emphasis, adjustment);
  const loop = repairLoopUse(raw.loop, adjustment);
  const out = repairUse(raw.out, 'out', adjustment);
  if (inUse) m.in = inUse;
  if (emphasis) m.emphasis = emphasis;
  if (loop) m.loop = loop;
  if (out) m.out = out;
  return Object.keys(m).length > 0 ? m : undefined;
}

/** `clip` with its `motion` field replaced, or removed when undefined (never mutates `clip`). */
export function withMotion<T extends object>(clip: T & { motion?: unknown }, motion: ClipMotion | undefined): Omit<T, 'motion'> & { motion?: ClipMotion } {
  const { motion: _old, ...rest } = clip;
  return motion === undefined ? rest : { ...rest, motion };
}
