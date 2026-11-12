// Pure operations on sorted key lists (Plan 5 D8/D9/D11): find, copy, split, shift, upsert. Lists are never
// mutated; split/shift results hold fresh key objects so no two clips (or halves) ever share a key.
import { repairEase } from './easing';
import { MAX_KEYS, tooClose } from './keyframes';
import type { Keyframe, PositionKeyframe, TransformKeys, VideoEffect } from './model';

export type AnyKey = Keyframe | PositionKeyframe;

/** A deep copy of one key (its ease included; stored eases are valid, so repairEase is an exact copy). */
export const copyKey = <K extends AnyKey>(k: K): K => ({ ...k, ease: repairEase(k.ease) });

/** Index of the key nearest to `u` among those within KEY_EPS of it (tooClose); −1 when there is none. */
export function nearestKey(list: readonly { t: number }[], u: number): number {
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    if (tooClose(list[i].t, u) && (best < 0 || Math.abs(list[i].t - u) < Math.abs(list[best].t - u))) best = i;
  }
  return best;
}

/**
 * The keys that decide the values on local range [lo, hi] (D9): every key inside it, plus the nearest key before `lo`
 * (unless a key sits exactly at `lo`) and the nearest after `hi` (unless one sits exactly at `hi`). Evaluation inside
 * the range only uses segments overlapping it, so it is unchanged; never empty for a non-empty list. Fresh copies.
 */
export function splitKeys<K extends AnyKey>(list: readonly K[], lo: number, hi: number): K[] {
  const n = list.length;
  let a = 0;
  while (a < n && list[a].t < lo) a++;
  let b = a;
  while (b < n && list[b].t <= hi) b++;
  const from = a < n && list[a].t === lo ? a : Math.max(0, a - 1);
  const to = b > 0 && list[b - 1].t === hi ? b : Math.min(n, b + 1);
  return list.slice(from, to).map(copyKey);
}

/** Every key moved by `d` seconds (fresh copies). */
export const shiftKeys = <K extends AnyKey>(list: readonly K[], d: number): K[] => list.map((k) => ({ ...copyKey(k), t: k.t + d }));

/** A clip's transform keys with every list mapped by `num` / `pos`; undefined stays undefined. */
export function mapTransformKeys(
  keys: TransformKeys | undefined,
  num: (l: Keyframe[]) => Keyframe[],
  pos: (l: PositionKeyframe[]) => PositionKeyframe[],
): TransformKeys | undefined {
  if (!keys) return undefined;
  const out: TransformKeys = {};
  if (keys.position) out.position = pos(keys.position);
  for (const prop of ['scale', 'rotation', 'opacity'] as const) {
    const l = keys[prop];
    if (l) out[prop] = num(l);
  }
  return out;
}

/** An effect with every param key list mapped by `fn` (no `keys` field when it had none). */
export function mapEffectKeys(e: VideoEffect, fn: (l: Keyframe[]) => Keyframe[]): VideoEffect {
  if (!e.keys) return e;
  return { ...e, keys: Object.fromEntries(Object.entries(e.keys).map(([param, l]) => [param, fn(l)])) };
}

/** A key's value part: `{ v }` for numeric targets, `{ x, y }` for position. */
export type KeyValue = { v: number } | { x: number; y: number };

const sameValue = (k: AnyKey, val: KeyValue): boolean =>
  'v' in val ? (k as Keyframe).v === val.v : (k as PositionKeyframe).x === val.x && (k as PositionKeyframe).y === val.y;

/**
 * Ruling P5-7: the time the key under the playhead (`hit`) takes when its value is replaced: the playhead's frame
 * start `u` (the time the frame renders), so the frame shows exactly the typed value; its own time when moving it would
 * reorder the list or bring it within KEY_EPS of another key (one key per KEY_EPS is kept).
 */
function hitTime(list: readonly AnyKey[], i: number, u: number): number {
  const prev = list[i - 1];
  const next = list[i + 1];
  const ok = (!prev || (prev.t < u && !tooClose(prev.t, u))) && (!next || (next.t > u && !tooClose(next.t, u)));
  return ok ? u : list[i].t;
}

/**
 * `list` with a key at local time `u` holding `val` (D8). Key `hit` (the key under the playhead, P5-6) gets the value
 * and moves to `u` (P5-7, see hitTime), keeping its ease; else the nearest key within KEY_EPS of `u` (so no two keys
 * are ever closer than KEY_EPS) gets the value and keeps its time and ease; `list` itself when nothing changes.
 * Otherwise a new key is inserted with a copy of the ease of the segment it splits, or `linear` at either end. With
 * `limit`, inserting into a full list (MAX_KEYS) gives null (the caller refuses).
 */
export function upsertKey(list: readonly AnyKey[], u: number, val: KeyValue, limit = true, hit = -1): readonly AnyKey[] | null {
  const i = hit >= 0 ? hit : nearestKey(list, u);
  if (i >= 0) {
    const t = hit >= 0 ? hitTime(list, i, u) : list[i].t;
    if (sameValue(list[i], val) && t === list[i].t) return list;
    const out = list.slice();
    out[i] = { ...list[i], ...val, t } as AnyKey;
    return out;
  }
  if (limit && list.length >= MAX_KEYS) return null;
  let j = 0;
  while (j < list.length && list[j].t < u) j++;
  const ease = j > 0 && j < list.length ? repairEase(list[j - 1].ease) : { kind: 'linear' as const };
  return [...list.slice(0, j), { t: u, ...val, ease } as AnyKey, ...list.slice(j)];
}
