// Limits shared by every transform edit (static fields, keyed writes, on-canvas drags). Pure.

/** x/y may go at most this many format widths/heights from the centre, so a typo cannot lose the clip forever. */
export const REACH = 4;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Degrees normalised to (−180, 180] (never −0). */
export function normaliseDegrees(deg: number): number {
  let r = ((deg % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return r === 0 ? 0 : r;
}
