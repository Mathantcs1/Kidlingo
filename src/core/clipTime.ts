// The ONE relation between timeline time and footage ("source") time of a clip (Plan 5D D1). Every place that turns a
// timeline time into footage time, a footage time into a timeline time, or asks how long a clip is on the timeline calls
// these functions; tests/clip-time-readers.test.ts fails on a new open-coded site. In Task 1 of Plan 5D (this file's
// first version) every clip plays forward at speed 1, so each function is EXACTLY the expression it replaced (same
// operations in the same order, so results are bit-identical); speed, reverse and ramps extend the bodies later.
import type { Clip } from './model';

/** Where `Clip.in`/`Clip.out` are footage seconds: the clip's length on the TIMELINE (out - in at speed 1). */
export function clipDuration(c: Clip): number {
  return c.out - c.in;
}

/** The timeline time at which the clip ends. */
export function clipEnd(c: Clip): number {
  return c.start + clipDuration(c);
}

/** The footage time shown at clip-local timeline offset `tau` (seconds after the clip's start). */
export function sourceAtOffset(c: Clip, tau: number): number {
  return c.in + tau;
}

/** The footage time shown at timeline time `t`. Extrapolates beyond the clip (the handles a transition would use). */
export function sourceTimeAt(c: Clip, t: number): number {
  return sourceAtOffset(c, t - c.start);
}

/** The timeline time at which footage time `u` is shown. */
export function timelineTimeAt(c: Clip, u: number): number {
  return c.start + (u - c.in);
}

/**
 * The footage range [lo, hi] (sorted) covered by the clip-local timeline offsets `tauA` and `tauB` (seconds after the
 * clip's start, in any order): the span an audio window or a waveform column reads from the file.
 */
export function sourceSpan(c: Clip, tauA: number, tauB: number): [number, number] {
  const a = sourceAtOffset(c, tauA);
  const b = sourceAtOffset(c, tauB);
  return a <= b ? [a, b] : [b, a];
}

/** True when footage time and timeline time differ only by an offset (no speed, no reverse, no ramp, no freeze). */
export function isIdentityTime(_c: Clip): boolean {
  return true;
}

/** The footage range a trim can reach: from the start of the file to the end of the media (Infinity for stills and unknown lengths). */
export function trimLimits(media: { kind: string; duration: number } | undefined): { footageMin: number; footageMax: number } {
  const bounded = media !== undefined && media.kind !== 'image' && media.duration > 0;
  return { footageMin: 0, footageMax: bounded ? media.duration : Infinity };
}
