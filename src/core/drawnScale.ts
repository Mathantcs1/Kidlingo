// The largest scale a clip can be DRAWN at (Plan 5B Task 6, Ruling P5B-3): overlay textures are sized once for it, so
// an animated scale, a key loop or a preset never re-draws the texture per frame and the largest frame stays sharp.
// Pure, DOM-free; reads the RAW clip (keys, loops, motion), never a resolved one.
import { KEYED_SCALE_LIMIT, localRange, maxScale } from './keyframes';
import type { Clip } from './model';
import { maxMotionScale } from './motion';

/** The bound is capped here (finite); the texture itself is capped at its own pixel limit (MAX_OVERLAY_SIDE). */
export const MAX_DRAWN_SCALE = KEYED_SCALE_LIMIT;

/**
 * How far an 'offset' loop on the scale keys climbs above the keys over the clip's visible range (D4: each cycle adds
 * last − first): `cycles × (last − first)` for a rising list, where cycles = the loop's count, or with no count the
 * cycles that start before the clip's local end (conservative: one more than the last partial cycle). 0 for repeat
 * and ping-pong (they stay within the keys), for a falling list, < 2 keys or a non-positive period. A sub-frame period
 * gives a huge (finite) value: the caller caps it.
 */
function offsetLoopGrowth(clip: Clip): number {
  const list = clip.keys?.scale;
  const loop = clip.keys?.loops?.scale;
  if (!list || list.length < 2 || loop?.mode !== 'offset') return 0;
  const first = list[0];
  const last = list[list.length - 1];
  const period = last.t - first.t;
  const rise = last.v - first.v;
  if (!(period > 0) || !(rise > 0)) return 0;
  const hi = localRange(clip)[1];
  const cycles = Math.max(0, Math.ceil((hi - first.t) / period));
  return (loop.count === null ? cycles : Math.min(loop.count, cycles)) * rise;
}

/**
 * An upper bound of the clip's drawn scale: (its static scale and every scale key, plus an offset loop's climb) × the
 * preset stack's largest factor (maxMotionScale), finite and at most MAX_DRAWN_SCALE (a non-finite or NaN bound reads
 * as the cap). Eased overshoot between keys is not included (5A Task 5 Minor 3, accepted). For a clip without key
 * loops and presets this is exactly `maxScale(clip)` (5A projects size their textures as before).
 */
export function maxDrawnScale(clip: Clip): number {
  const k = (maxScale(clip) + offsetLoopGrowth(clip)) * maxMotionScale(clip);
  return k <= MAX_DRAWN_SCALE ? k : MAX_DRAWN_SCALE;
}
