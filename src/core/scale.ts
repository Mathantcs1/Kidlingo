// Scale limits shared by every transform edit (fields, on-canvas drags, format switches).

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 20;

/**
 * The scale range an edit may move a clip within: 0.02..20, widened to include `cur` so a clip already outside it
 * (a 16 px image fitted to 1080p sits at 67.5×) is never pulled to the limit by a small nudge. A non-finite or
 * non-positive `cur` gives the plain range.
 */
export function scaleBounds(cur: number): [number, number] {
  if (!Number.isFinite(cur) || cur <= 0) return [MIN_SCALE, MAX_SCALE];
  return [Math.min(MIN_SCALE, cur), Math.max(MAX_SCALE, cur)];
}
