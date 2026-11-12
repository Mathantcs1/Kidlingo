// Keyframe data (data v6, Plan 5 D2/D3): keys live next to what they animate. Re-exported by model.ts.
import type { Ease } from './easing';

/** One key of a numeric property: `t` in clip-local seconds (D3), `ease` shapes the segment that STARTS here (D4). */
export interface Keyframe {
  t: number;
  v: number;
  ease: Ease;
}

/** One key of the 2-D position (x and y share one eased fraction). */
export interface PositionKeyframe {
  t: number;
  x: number;
  y: number;
  ease: Ease;
}

/**
 * A clip's transform keys. A property is animated iff its list has >= 1 key (one key = constant); absent or empty =
 * static (the stored `transform` value is used). Lists are sorted by `t` with times at least KEY_EPS apart.
 */
export interface TransformKeys {
  position?: PositionKeyframe[];
  scale?: Keyframe[];
  rotation?: Keyframe[];
  opacity?: Keyframe[];
}
