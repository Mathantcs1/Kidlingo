// DOM-free helpers of audio retiming (Plan 5D Task 8). A retimed clip (speed, reverse or a ramp) is played as a "virtual
// speed-1 source": segments are planned in clip-local TIMELINE seconds [0, D], the audio for them is produced from the
// footage through the time map, and the rest of the engine (cut margins, effect pre-roll, chains, scheduling) works
// unchanged on that virtual source.
import { clipDuration, isIdentityTime, sourceSpan } from '../../core/clipTime';
import type { Clip } from '../../core/model';

/** Whether the clip's audio goes through the retimer: it has speed, reverse or a ramp, is not a freeze and can sound. */
export function isRetimedAudio(c: Clip): boolean {
  return (c.kind === 'audio' || c.kind === 'video') && c.freeze === undefined && !isIdentityTime(c);
}

/** The clip's virtual source range: [0, D] for a retimed clip, [in, out] otherwise (what a segment's srcFrom/srcTo live in). */
export function audioSpan(c: Clip): [number, number] {
  return isRetimedAudio(c) ? [0, clipDuration(c)] : [c.in, c.out];
}

/** Half-width (input samples) of the resampling kernel at speed 1; it widens with the speed so a fast clip is low-passed. */
export const KERNEL_HALF = 16;
/** The fastest speed the kernel must cover (MAX_SPEED). */
const KERNEL_MAX_SPEED = 4;

/** Footage seconds of extra input the kernel reads past the footage span of an output range. */
export function kernelMargin(rate: number): number {
  return (KERNEL_HALF * KERNEL_MAX_SPEED + 4) / rate;
}

/** The footage [from, to) to decode for the virtual range [vFrom, vTo): its span through the map plus the kernel margin, kept inside the clip. */
export function footageToDecode(c: Clip, vFrom: number, vTo: number, rate: number): [number, number] {
  const [a, b] = sourceSpan(c, vFrom, vTo);
  const m = kernelMargin(rate);
  return [Math.max(c.in, a - m), Math.min(c.out, b + m)];
}
