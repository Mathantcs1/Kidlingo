// Repairs hand-edited keyframes when a v6 save is opened (Plan 5 D11): sort by time, drop malformed keys, non-finite
// times/values and duplicate times (keeping the last), unknown eases => linear, values clamped (D5), at most MAX_KEYS
// per property, keys of unknown or non-animatable params dropped. An emptied list (or keys object) is removed.
import { repairEase } from './easing';
import { KEYED_ROTATION_LIMIT, KEY_EPS, MAX_KEYS } from './keyframes';
import type { Clip, Keyframe, PositionKeyframe, TransformKeys, VideoEffectType } from './model';
import { animatableParam } from './videoEffects';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v)) + 0;

/** Sorted by `t` (stable), keys closer than KEY_EPS to the previous kept one replace it, capped at MAX_KEYS. */
function normalise<K extends { t: number }>(list: K[]): K[] | undefined {
  const sorted = list.map((k, i) => ({ k, i })).sort((a, b) => a.k.t - b.k.t || a.i - b.i).map((e) => e.k);
  const out: K[] = [];
  for (const k of sorted) {
    if (out.length > 0 && k.t - out[out.length - 1].t < KEY_EPS) out[out.length - 1] = k;
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

/** A position key list (x, y unclamped but finite); undefined when nothing valid remains. */
export function repairPositionKeys(raw: unknown): PositionKeyframe[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const keys: PositionKeyframe[] = [];
  for (const k of raw) {
    if (isObject(k) && finite(k.t) && finite(k.x) && finite(k.y)) keys.push({ t: k.t, x: k.x, y: k.y, ease: repairEase(k.ease) });
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
  const scale = full ? repairKeyList(raw.scale, 0, Infinity) : undefined;
  const rotation = full ? repairKeyList(raw.rotation, -KEYED_ROTATION_LIMIT, KEYED_ROTATION_LIMIT) : undefined;
  const opacity = repairKeyList(raw.opacity, 0, 1);
  if (position) keys.position = position;
  if (scale) keys.scale = scale;
  if (rotation) keys.rotation = rotation;
  if (opacity) keys.opacity = opacity;
  return Object.keys(keys).length > 0 ? keys : undefined;
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

/** `obj` with its `keys` field replaced by `keys`, or removed when undefined (never mutates `obj`). */
export function withKeys<T extends object, K>(obj: T & { keys?: unknown }, keys: K | undefined): Omit<T, 'keys'> & { keys?: K } {
  const { keys: _old, ...rest } = obj;
  return keys === undefined ? rest : { ...rest, keys };
}
