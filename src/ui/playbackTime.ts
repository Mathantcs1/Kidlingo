// DOM-free time helpers for playback and scrubbing.

/** Clock readings this close to the end count as the end (absorbs scheduling jitter). */
export const END_EPS = 1e-3;

const valid = (x: number): boolean => !Number.isNaN(x);

/** `t` limited to [0, duration]; NaN and a non-positive duration give 0. */
export function clampTime(t: number, duration: number): number {
  if (!valid(t) || !(duration > 0)) return 0;
  return Math.min(duration, Math.max(0, t));
}

/** Where Play starts: the playhead, or 0 when it is at/after the end. Null when there is nothing to play. */
export function playStart(playhead: number, duration: number): number | null {
  if (!(duration > 0)) return null;
  if (!(playhead >= 0) || playhead >= duration - END_EPS) return 0;
  return playhead;
}

/** The playhead for a mixer clock reading, and whether playback has reached the end. */
export function playbackTick(mixerTime: number, duration: number): { t: number; ended: boolean } {
  if (!(duration > 0)) return { t: 0, ended: true };
  if (!valid(mixerTime)) return { t: 0, ended: false };
  if (mixerTime >= duration - END_EPS) return { t: duration, ended: true };
  return { t: clampTime(mixerTime, duration), ended: false };
}

/** Timeline time under a ruler x offset, clamped to the timeline. */
export function scrubTime(px: number, pps: number, duration: number): number {
  if (!(pps > 0)) return 0;
  return clampTime(px / pps, duration);
}
