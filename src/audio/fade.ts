// DOM-free gain envelopes: clip fades and windowed breakpoint lists for AudioParam scheduling.
import { clipEnd } from '../core/model';
import type { Clip } from '../core/model';

/** A gain breakpoint at timeline time `t` (seconds). */
export interface GainPoint {
  t: number;
  gain: number;
}

/** Extra breakpoints across a stretch where fade-in and fade-out overlap (their product is curved there). */
const OVERLAP_STEPS = 16;

const len = (x: number): number => (x > 0 ? x : 0);

/**
 * The fade gain of `clip` at timeline time `t`: linear 0→1 over [start, start+fadeIn], 1→0 over
 * [end−fadeOut, end], the product of both where they overlap, 1 elsewhere. Always within [0, 1]; NaN or negative
 * fades count as none.
 */
export function fadeGain(clip: Clip, t: number): number {
  const fadeIn = len(clip.audio.fadeIn);
  const fadeOut = len(clip.audio.fadeOut);
  const a = fadeIn > 0 ? Math.min(1, Math.max(0, (t - clip.start) / fadeIn)) : 1;
  const b = fadeOut > 0 ? Math.min(1, Math.max(0, (clipEnd(clip) - t) / fadeOut)) : 1;
  return a * b;
}

/**
 * Breakpoints of the fade gain over the window [from, to] for setValueAtTime / linearRampToValueAtTime: always
 * both endpoints (exact `fadeGain` values, so the gain at a cut is the same number on both sides and windows join
 * without a click), plus every fade knee strictly inside. Where the fades overlap, extra points follow the curve.
 */
export function fadePoints(clip: Clip, from: number, to: number): GainPoint[] {
  const start = clip.start;
  const end = clipEnd(clip);
  const inEnd = start + len(clip.audio.fadeIn);
  const outStart = end - len(clip.audio.fadeOut);
  const knees = [start, inEnd, outStart, end];
  if (outStart < inEnd) {
    const a = Math.max(start, outStart);
    const b = Math.min(end, inEnd);
    for (let k = 1; k < OVERLAP_STEPS; k++) knees.push(a + ((b - a) * k) / OVERLAP_STEPS);
  }
  const inside = [...new Set(knees)].filter((t) => t > from && t < to).sort((x, y) => x - y);
  const ts = to > from ? [from, ...inside, to] : [from];
  return ts.map((t) => ({ t, gain: fadeGain(clip, t) }));
}

/** The value of a piecewise-linear envelope (sorted points) at `t`; held flat outside it, 1 when empty. */
export function envelopeAt(points: readonly GainPoint[], t: number): number {
  if (!points.length) return 1;
  if (t <= points[0].t) return points[0].gain;
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (t <= b.t) {
      const a = points[i - 1];
      return b.t === a.t ? b.gain : a.gain + ((b.gain - a.gain) * (t - a.t)) / (b.t - a.t);
    }
  }
  return points[points.length - 1].gain;
}

/** A piecewise-linear envelope cut to [from, to]: interpolated endpoints plus the points strictly inside. */
export function windowPoints(points: readonly GainPoint[], from: number, to: number): GainPoint[] {
  const inside = points.filter((p) => p.t > from && p.t < to);
  const out = [{ t: from, gain: envelopeAt(points, from) }, ...inside.map((p) => ({ ...p }))];
  if (to > from) out.push({ t: to, gain: envelopeAt(points, to) });
  return out;
}
