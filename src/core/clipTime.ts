// The ONE relation between timeline time and footage ("source") time of a clip (Plan 5D D1). Every place that turns a
// timeline time into footage time, a footage time into a timeline time, or asks how long a clip is on the timeline calls
// these functions; tests/clip-time-readers.test.ts fails on a new open-coded site.
//
// `in`/`out` are FOOTAGE seconds and the clip covers [in, out) in both directions (reverse plays it backwards). A clip
// with no speed field is "identity timed": each function is then EXACTLY the expression it replaced (same operations,
// same order, so results are bit-identical). Constant speed s: forward u = in + s·tau, reverse u = out − s·tau, lasting
// (out − in) / s. A ramp (speedKeys) uses the integral of speedRamp.ts. A freeze clip shows footage `freeze.at` always.
// Beyond a clip's edge the maps extrapolate at the speed held at that edge (the handles a transition would use).
import type { Clip } from './model';
import { rampInverse, rampOffset, speedAt } from './speedRamp';

const hasRamp = (c: Clip): boolean => c.speedKeys !== undefined && c.speedKeys.length > 0;

/** True when footage time and timeline time differ only by an offset (no speed, reverse, ramp or freeze). */
export function isIdentityTime(c: Clip): boolean {
  return c.freeze === undefined && c.reverse === undefined && c.speedKeys === undefined && (c.speed === undefined || c.speed === 1);
}

/**
 * Clips whose keys, presets and trims run in clip-local TIMELINE seconds instead of footage time: overlays and
 * adjustment layers (no source) and freeze frames (every time shows the same footage frame).
 */
export function hasOwnTimeline(c: Clip): boolean {
  return c.kind === 'overlay' || c.kind === 'adjustment' || c.freeze !== undefined;
}

/** The `out` that makes a clip with its own timeline (see hasOwnTimeline) last `tau` timeline seconds. */
export function outForLength(c: Clip, tau: number): number {
  return c.in + tau;
}

/** The clip's constant speed (1 when absent); meaningless for a ramp. */
function constSpeed(c: Clip): number {
  return c.speed ?? 1;
}

/** The footage range a sourced clip shows, [in, out]; an identity-timed clip keeps the exact old `in + duration` arithmetic. */
export function footageRange(c: Clip): [number, number] {
  return isIdentityTime(c) ? [c.in, c.in + clipDuration(c)] : [c.in, c.out];
}

/**
 * The timeline offset (seconds from the clip's start) at which clip-local time `k` shows: `k` itself for a clip with its
 * own timeline, `k - in` for an identity-timed one (the exact old expression), else through the time map (Plan 5D D6:
 * a key's place on the timeline, mirrored in reverse and non-linear in a ramp).
 */
export function offsetOfLocal(c: Clip, k: number): number {
  if (hasOwnTimeline(c)) return k;
  return isIdentityTime(c) ? k - c.in : timelineTimeAt(c, k) - c.start;
}

/** Clip-local time `k` moved by `delta` timeline seconds: `k + delta` when identity-timed or own-timeline, else through the map. */
export function shiftLocal(c: Clip, k: number, delta: number): number {
  return hasOwnTimeline(c) || isIdentityTime(c) ? k + delta : sourceAtOffset(c, offsetOfLocal(c, k) + delta);
}

/** The clip-local time shown at the clip's first frame (`in`; `out` in reverse; 0 for a clip with its own timeline). */
export function localAtStart(c: Clip): number {
  return hasOwnTimeline(c) ? 0 : sourceAtOffset(c, 0);
}

/** The clip's length on the TIMELINE (out - in at speed 1). */
export function clipDuration(c: Clip): number {
  if (c.freeze !== undefined) return c.out - c.in;
  if (hasRamp(c)) return rampOffset(c.speedKeys!, c.out) - rampOffset(c.speedKeys!, c.in);
  return (c.out - c.in) / constSpeed(c);
}

/** The timeline time at which the clip ends. */
export function clipEnd(c: Clip): number {
  return c.start + clipDuration(c);
}

/** The speed held at the footage edge that is played FIRST (`in` forward, `out` reverse) and LAST. */
function edgeSpeeds(c: Clip): { first: number; last: number } {
  if (hasRamp(c)) {
    const atIn = speedAt(c.speedKeys!, c.in);
    const atOut = speedAt(c.speedKeys!, c.out);
    return c.reverse ? { first: atOut, last: atIn } : { first: atIn, last: atOut };
  }
  const s = constSpeed(c);
  return { first: s, last: s };
}

/** The footage time shown at clip-local timeline offset `tau` (seconds after the clip's start). Exact at both clip edges. */
export function sourceAtOffset(c: Clip, tau: number): number {
  if (isIdentityTime(c)) return c.in + tau;
  if (c.freeze !== undefined) return c.freeze.at;
  const rev = c.reverse === true;
  const { first, last } = edgeSpeeds(c);
  const D = clipDuration(c);
  const from = rev ? c.out : c.in;
  const to = rev ? c.in : c.out;
  const dir = rev ? -1 : 1;
  if (tau === 0) return from;
  if (tau < 0) return from + dir * first * tau;
  if (tau >= D) return tau === D ? to : to + dir * last * (tau - D);
  if (hasRamp(c)) {
    const k = c.speedKeys!;
    return rev ? rampInverse(k, rampOffset(k, c.out) - tau) : rampInverse(k, rampOffset(k, c.in) + tau);
  }
  return from + dir * constSpeed(c) * tau;
}

/** The footage time shown at timeline time `t`. Extrapolates beyond the clip at the speed held at its edge. */
export function sourceTimeAt(c: Clip, t: number): number {
  return sourceAtOffset(c, t - c.start);
}

/** The timeline time at which footage time `u` is shown (extrapolates beyond the footage range at the edge speed). */
export function timelineTimeAt(c: Clip, u: number): number {
  if (isIdentityTime(c)) return c.start + (u - c.in);
  if (c.freeze !== undefined) return c.start;
  const rev = c.reverse === true;
  const { first, last } = edgeSpeeds(c);
  const D = clipDuration(c);
  const lo = c.in;
  const hi = c.out;
  if (hasRamp(c)) {
    const k = c.speedKeys!;
    if (u >= lo && u <= hi) return c.start + (rev ? rampOffset(k, c.out) - rampOffset(k, u) : rampOffset(k, u) - rampOffset(k, c.in));
    if (u < lo) return c.start + (rev ? D + (lo - u) / speedAt(k, lo) : (u - lo) / speedAt(k, lo));
    return c.start + (rev ? -(u - hi) / speedAt(k, hi) : D + (u - hi) / speedAt(k, hi));
  }
  const s = constSpeed(c);
  void first;
  void last;
  return c.start + (rev ? (c.out - u) / s : (u - c.in) / s);
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

/**
 * The footage time the picture of the output frame starting at timeline time `t` is taken from (D11). Forward: the
 * frame's start. Reverse: the MIDDLE of the frame's footage interval, so the decoder's tolerance can never pick the frame
 * after `out` (frames are looked up by "the last frame at or before the time").
 */
export function videoSourceTime(c: Clip, t: number, fps: number): number {
  if (c.reverse === true && c.freeze === undefined) return sourceAtOffset(c, t - c.start + 0.5 / fps);
  return sourceTimeAt(c, t);
}

/**
 * `c` with the footage edge that is played LAST (forward `out`, reverse `in`) moved so the clip lasts exactly `d`
 * timeline seconds at its current speed fields (constant speed or ramp). Used to snap a speed edit's duration to whole
 * frames (D7) and by Plan 5D's retiming edits. A clip with its own timeline just changes `out`.
 */
export function withDuration(c: Clip, d: number): Clip {
  if (hasOwnTimeline(c)) return { ...c, out: outForLength(c, d) };
  const rev = c.reverse === true;
  if (hasRamp(c)) {
    const k = c.speedKeys!;
    return rev ? { ...c, in: rampInverse(k, rampOffset(k, c.out) - d) } : { ...c, out: rampInverse(k, rampOffset(k, c.in) + d) };
  }
  const length = d * constSpeed(c);
  return rev ? { ...c, in: c.out - length } : { ...c, out: c.in + length };
}

/** The footage range a trim can reach: from the start of the file to the end of the media (Infinity for stills and unknown lengths). */
export function trimLimits(media: { kind: string; duration: number } | undefined): { footageMin: number; footageMax: number } {
  const bounded = media !== undefined && media.kind !== 'image' && media.duration > 0;
  return { footageMin: 0, footageMax: bounded ? media.duration : Infinity };
}
