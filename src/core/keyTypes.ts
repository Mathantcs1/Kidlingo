// Keyframe data (data v6, Plan 5 D2/D3; v7 adds tangents, loops and orient, Plan 5B D4/D6/D7): keys live next to what
// they animate. Re-exported by model.ts.
import type { Ease } from './easing';

/** One key of a numeric property: `t` in clip-local seconds (D3), `ease` shapes the segment that STARTS here (D4). */
export interface Keyframe {
  t: number;
  v: number;
  ease: Ease;
}

/** A 2-D offset in format px. */
export interface Vec {
  x: number;
  y: number;
}

/**
 * One key of the 2-D position (x and y share one eased fraction). v7: optional spatial Bezier tangents `in`/`out`
 * (offsets from the key, format px, within ±KEYED_POSITION_LIMIT); a segment without tangents at both ends is the
 * straight 5A line. `broken: true` lets the two tangents move independently (default: smooth).
 */
export interface PositionKeyframe {
  t: number;
  x: number;
  y: number;
  ease: Ease;
  in?: Vec;
  out?: Vec;
  broken?: true;
}

export type LoopMode = 'repeat' | 'pingPong' | 'offset';
export const LOOP_MODES: readonly LoopMode[] = ['repeat', 'pingPong', 'offset'];

/** v7 (D4): cycles after the last key; `count` = cycles after the first, integer 1..1000, null = until the clip end. */
export interface KeyLoop {
  mode: LoopMode;
  count: number | null;
}
export const LOOP_COUNT_MAX = 1000;

/** The transform properties that carry key lists. */
export type KeyedTransformProp = 'position' | 'scale' | 'rotation' | 'opacity';

/**
 * A clip's transform keys. A property is animated iff its list has >= 1 key (one key = constant); absent or empty =
 * static (the stored `transform` value is used). Lists are sorted by `t` with times at least KEY_EPS apart.
 */
export interface TransformKeys {
  position?: PositionKeyframe[];
  scale?: Keyframe[];
  rotation?: Keyframe[];
  opacity?: Keyframe[];
  /** v7 (D4): a loop per animated property (only for properties with a key list). */
  loops?: Partial<Record<KeyedTransformProp, KeyLoop>>;
  /** v7 (D7): rotate along the position path (only with position keys). */
  orient?: true;
}
