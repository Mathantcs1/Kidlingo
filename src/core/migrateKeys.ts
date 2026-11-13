// Repairs hand-edited keyframes when a v6 save is opened (Plan 5 D11): sort by time, drop malformed keys, non-finite
// times/values and duplicate times (keeping the last), unknown eases => linear, values clamped (D5), at most MAX_KEYS
// per property, keys of unknown or non-animatable params dropped. An emptied list (or keys object) is removed.
// v7 (Plan 5B D14): tangents finite and within ±KEYED_POSITION_LIMIT, `broken`/`orient` only `true`, loops only for
// properties/params that have keys (valid mode, count integer 1..1000 or null), spring eases via repairEase.
import { repairEase } from './easing';
import { KEYED_POSITION_LIMIT, KEYED_ROTATION_LIMIT, KEYED_SCALE_LIMIT, MAX_KEYS, tooClose } from './keyframes';
import { LOOP_COUNT_MAX, LOOP_MODES } from './keyTypes';
import type { KeyLoop, KeyedTransformProp, LoopMode, Vec } from './keyTypes';
import type { Clip, Keyframe, PositionKeyframe, TransformKeys, VideoEffectType } from './model';
import { animatableParam } from './videoEffects';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v)) + 0;
const P = KEYED_POSITION_LIMIT;

/** Sorted by `t` (stable), keys closer than KEY_EPS to the previous kept one replace it, capped at MAX_KEYS. */
function normalise<K extends { t: number }>(list: K[]): K[] | undefined {
  const sorted = list.map((k, i) => ({ k, i })).sort((a, b) => a.k.t - b.k.t || a.i - b.i).map((e) => e.k);
  const out: K[] = [];
  for (const k of sorted) {
    if (out.length > 0 && tooClose(k.t, out[out.length - 1].t)) out[out.length - 1] = k;
    else out.push(k);
  }
  return out.length > 0 ? out.slice(0, MAX_KEYS) : undefined;
}

/** A numeric key list with values clamped to [min, max]; undefined when nothing valid remains. */
export function repairKeyList(raw: unknown, min: number, max: number): Keyframe[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const keys: Keyframe[] = [];
  for (const k of raw) {
    if (isObject(k) && finite(k.t) && finite(k.v)) keys.push({ t: k.t, v: clamp(k.v, min, max), ease: repairEase(k.ease) });
  }
  return normalise(keys);
}

/** A spatial tangent (format px offset): finite x and y, clamped to ±KEYED_POSITION_LIMIT; anything else undefined. */
export function repairTangent(raw: unknown): Vec | undefined {
  return isObject(raw) && finite(raw.x) && finite(raw.y) ? { x: clamp(raw.x, -P, P), y: clamp(raw.y, -P, P) } : undefined;
}

/** A loop/preset cycle count: a finite number is rounded and clamped to 1..1000; anything else is null (until the end). */
export function repairCount(raw: unknown): number | null {
  return finite(raw) ? clamp(Math.round(raw), 1, LOOP_COUNT_MAX) : null;
}

/** A key loop: a known mode (else undefined) and a repaired count. */
export function repairLoop(raw: unknown): KeyLoop | undefined {
  if (!isObject(raw) || !(LOOP_MODES as readonly unknown[]).includes(raw.mode)) return undefined;
  return { mode: raw.mode as LoopMode, count: repairCount(raw.count) };
}

/** The loops of the targets in `present` only (loops of absent targets dropped); undefined when none remain. */
function repairLoops<K extends string>(raw: unknown, present: readonly K[]): Partial<Record<K, KeyLoop>> | undefined {
  if (!isObject(raw)) return undefined;
  const out: Partial<Record<K, KeyLoop>> = {};
  for (const k of present) {
    const loop = Object.hasOwn(raw, k) ? repairLoop(raw[k]) : undefined;
    if (loop) out[k] = loop;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A position key list (x, y finite, within ±KEYED_POSITION_LIMIT; v7 tangents and broken); undefined when empty. */
export function repairPositionKeys(raw: unknown): PositionKeyframe[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const keys: PositionKeyframe[] = [];
  for (const k of raw) {
    if (!isObject(k) || !finite(k.t) || !finite(k.x) || !finite(k.y)) continue;
    const key: PositionKeyframe = { t: k.t, x: clamp(k.x, -P, P), y: clamp(k.y, -P, P), ease: repairEase(k.ease) };
    const tin = repairTangent(k.in);
    const tout = repairTangent(k.out);
    if (tin) key.in = tin;
    if (tout) key.out = tout;
    if (k.broken === true) key.broken = true;
    keys.push(key);
  }
  return normalise(keys);
}

/**
 * A clip's transform keys by kind: audio clips have none; adjustment clips only opacity (their position, scale and
 * rotation are not used, D1); video, image and overlay clips all four. Unknown properties are dropped.
 */
export function repairClipKeys(raw: unknown, kind: Clip['kind'] | unknown): TransformKeys | undefined {
  if (!isObject(raw) || kind === 'audio') return undefined;
  const full = kind !== 'adjustment';
  const keys: TransformKeys = {};
  const position = full ? repairPositionKeys(raw.position) : undefined;
  const scale = full ? repairKeyList(raw.scale, 0, KEYED_SCALE_LIMIT) : undefined;
  const rotation = full ? repairKeyList(raw.rotation, -KEYED_ROTATION_LIMIT, KEYED_ROTATION_LIMIT) : undefined;
  const opacity = repairKeyList(raw.opacity, 0, 1);
  if (position) keys.position = position;
  if (scale) keys.scale = scale;
  if (rotation) keys.rotation = rotation;
  if (opacity) keys.opacity = opacity;
  const props = (['position', 'scale', 'rotation', 'opacity'] as const).filter((q): q is KeyedTransformProp => keys[q] !== undefined);
  if (props.length === 0) return undefined;
  const loops = repairLoops(raw.loops, props);
  if (loops) keys.loops = loops;
  if (raw.orient === true && position) keys.orient = true;
  return keys;
}

/** An effect's param keys: only animatable params of its schema, values clamped to the param's range. */
export function repairEffectKeys(raw: unknown, type: VideoEffectType): Record<string, Keyframe[]> | undefined {
  if (!isObject(raw)) return undefined;
  const keys: Record<string, Keyframe[]> = {};
  for (const [param, list] of Object.entries(raw)) {
    const d = animatableParam(type, param);
    const repaired = d ? repairKeyList(list, d.min, d.max) : undefined;
    if (repaired) keys[param] = repaired;
  }
  return Object.keys(keys).length > 0 ? keys : undefined;
}

/** An effect's param loops: only for params that kept keys (`keys`, already repaired). */
export function repairEffectLoops(raw: unknown, keys: Record<string, Keyframe[]> | undefined): Record<string, KeyLoop> | undefined {
  return keys ? (repairLoops(raw, Object.keys(keys)) as Record<string, KeyLoop> | undefined) : undefined;
}

/** `obj` with its `keys` field replaced by `keys`, or removed when undefined (never mutates `obj`). */
export function withKeys<T extends object, K>(obj: T & { keys?: unknown }, keys: K | undefined): Omit<T, 'keys'> & { keys?: K } {
  const { keys: _old, ...rest } = obj;
  return keys === undefined ? rest : { ...rest, keys };
}
