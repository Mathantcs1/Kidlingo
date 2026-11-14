// The largest scale a clip can be DRAWN at (Plan 5B Task 6, Ruling P5B-3): overlay textures are sized once for it, so
// an animated scale, a key loop or a preset never re-draws the texture per frame and the largest frame stays sharp.
// Pure, DOM-free; reads the RAW clip (keys, loops, motion), never a resolved one.
import { KEYED_SCALE_LIMIT, localRange, maxScale } from './keyframes';
import type { Clip } from './model';
import { maxMotionScale } from './motion';
import { easeRange } from './presetMath';

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
 * The highest value a SPRING-eased scale segment can reach (D5: a spring overshoots, easeRange allows up to 3 × the
 * delta): per segment `v + (next − v) × hi` (or `× lo` for a falling segment). Other eases are not included.
 */
function springPeak(clip: Clip): number {
  const list = clip.keys?.scale ?? [];
  let m = 0;
  for (let i = 0; i + 1 < list.length; i++) {
    if (list[i].ease.kind !== 'spring') continue;
    const [lo, hi] = easeRange(list[i].ease);
    const d = list[i + 1].v - list[i].v;
    const peak = list[i].v + Math.max(d * lo, d * hi);
    if (peak > m) m = peak;
  }
  return m;
}

/**
 * An upper bound of the clip's drawn scale: (its static scale and every scale key, plus an offset loop's climb) × the
 * preset stack's largest factor (maxMotionScale), finite and at most MAX_DRAWN_SCALE (a non-finite or NaN bound reads
 * as the cap). A spring-eased scale segment's overshoot is included; other eased overshoot is not (5A Task 5 Minor 3, accepted). For a clip without key
 * loops, presets and springs this is exactly `maxScale(clip)` (5A projects size their textures as before).
 */
export function maxDrawnScale(clip: Clip): number {
  const k = (Math.max(maxScale(clip), springPeak(clip)) + offsetLoopGrowth(clip)) * maxMotionScale(clip);
  return k <= MAX_DRAWN_SCALE ? k : MAX_DRAWN_SCALE;
}
