// DOM-free auto-ducking (D5): a track's gain dips while the audible clips of one chosen source track play.
import { clipEnd } from '../core/model';
import type { Id, Project, Track } from '../core/model';
import type { GainPoint } from './fade';
import { audibleClips } from './plan';

export interface DuckShape {
  /** Depth of the dip in dB (<= 0). */
  amountDb: number;
  /** Seconds of the ramp down, ending at each interval start. */
  attack: number;
  /** Seconds of the ramp back up, starting at each interval end. */
  release: number;
}

/** Shortest ramp used, so breakpoints stay strictly increasing even for a zero attack / release. */
const MIN_RAMP = 1e-3;

/**
 * Piecewise-linear duck gain (timeline time) for trigger `intervals`: 1 outside, 10^(amountDb/20) inside, a
 * linear ramp down over `attack` seconds ENDING at each interval start and back up over `release` seconds after
 * each end. Overlapping or touching intervals merge; when a release would reach the next attack (gap <= release +
 * attack) the gain stays ducked across the gap, one continuous dip. Breakpoints are strictly increasing in `t`;
 * empty / invalid intervals are ignored, so no trigger gives [].
 */
export function duckEnvelope(intervals: readonly [number, number][], opts: DuckShape): GainPoint[] {
  const attack = Math.max(MIN_RAMP, Number.isFinite(opts.attack) ? opts.attack : 0);
  const release = Math.max(MIN_RAMP, Number.isFinite(opts.release) ? opts.release : 0);
  const db = Number.isFinite(opts.amountDb) ? Math.min(0, opts.amountDb) : 0;
  const gain = 10 ** (db / 20);
  const sorted = intervals
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .map(([a, b]): [number, number] => [a, b])
    .sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a - attack <= last[1] + release) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const out: GainPoint[] = [];
  for (const [a, b] of merged) {
    out.push({ t: a - attack, gain: 1 }, { t: a, gain }, { t: b, gain }, { t: b + release, gain: 1 });
  }
  return out;
}

/**
 * The duck envelope of `track`: intervals are the spans of the AUDIBLE clips (audibleClips: mute wins over solo,
 * silent / volume-0 clips and silent tracks excluded) on its duck source track. Undefined when the track has no
 * duck setting, its source is gone, or nothing on the source can sound.
 */
export function duckPointsFor(p: Project, track: Track): GainPoint[] | undefined {
  const duck = track.duck;
  if (!duck) return undefined;
  const source = p.tracks.find((t) => t.id === duck.sourceTrackId);
  if (!source || source.id === track.id) return undefined;
  const ids = new Set(source.clips.map((c) => c.id));
  const intervals = audibleClips(p)
    .filter((c) => ids.has(c.id))
    .map((c): [number, number] => [c.start, clipEnd(c)]);
  if (!intervals.length) return undefined;
  const points = duckEnvelope(intervals, duck);
  return points.length ? points : undefined;
}

/** Clip id → the duck envelope of its track, for every clip on a ducked track (for planWindow). */
export function clipDuckPoints(p: Project): Map<Id, GainPoint[]> {
  const out = new Map<Id, GainPoint[]>();
  for (const track of p.tracks) {
    const points = duckPointsFor(p, track);
    if (points) for (const clip of track.clips) out.set(clip.id, points);
  }
  return out;
}
