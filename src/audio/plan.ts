// DOM-free planning of windowed audio: which part of which clip sounds in a timeline window.
import { clipDuration, clipEnd } from '../core/model';
import type { Clip, Id, Project, Track } from '../core/model';
import type { GainPoint } from './fade';

/**
 * One clip's contribution to a window: source range [srcFrom, srcTo) plays over timeline [when, whenEnd), through
 * the clip's own audio settings (`clip`) and its track's volume (`trackVolume`). `whenEnd` is the planned end
 * itself (the window edge or the clip end), so a cut is the same number in both windows' segments.
 */
export interface Segment {
  clipId: Id;
  mediaId: Id;
  srcFrom: number;
  srcTo: number;
  when: number;
  whenEnd: number;
  clip: Clip;
  trackVolume: number;
  /**
   * Ducking envelope in timeline time (sorted, piecewise linear; see duck.ts). This is the one source of duck
   * automation the clip chain reads; undefined means no ducking.
   */
  duckPoints?: GainPoint[];
}

/**
 * Whether a track may sound: never when muted; when any track (of any kind) is soloed, only soloed tracks do.
 * A video track's embedded audio follows its own track's flags; `hidden` affects the picture only.
 */
export function trackAudible(p: Project, track: Track): boolean {
  if (track.muted) return false;
  return track.solo || !p.tracks.some((t) => t.solo);
}

/**
 * Clips that can make sound: non-missing audio clips (any track) and video clips whose media has audio, on
 * tracks that are audible (see trackAudible). Images are silent; a clip or track volume of 0 (or NaN) and a clip
 * marked `audio.silent` contribute nothing and are never decoded.
 */
export function audibleClips(p: Project): Clip[] {
  const out: Clip[] = [];
  for (const track of p.tracks) {
    if (!trackAudible(p, track) || !(track.volume > 0)) continue;
    for (const clip of track.clips) {
      const media = p.media[clip.mediaId];
      if (!media || media.missing || clip.audio.silent) continue;
      if (!(clip.volume > 0) || !(clipDuration(clip) > 0)) continue;
      if (clip.kind === 'audio' || (clip.kind === 'video' && media.hasAudio)) out.push(clip);
    }
  }
  return out;
}

/** Clip id → the volume of the track holding it (for planWindow). */
export function trackVolumes(p: Project): Map<Id, number> {
  const out = new Map<Id, number>();
  for (const track of p.tracks) for (const clip of track.clips) out.set(clip.id, track.volume);
  return out;
}

/**
 * Splits [from, end) into consecutive windows of `length` seconds (the last one shorter). Every boundary is
 * computed as `from + k * length`, so a boundary is the same number on both sides and windows never drift.
 */
export function windowBounds(from: number, end: number, length: number): [number, number][] {
  if (!(length > 0)) throw new RangeError(`Invalid window length ${length}`);
  const out: [number, number][] = [];
  for (let k = 0; ; k++) {
    const a = from + k * length;
    if (!(a < end)) break;
    out.push([a, Math.min(end, from + (k + 1) * length)]);
  }
  return out;
}

/**
 * The pieces of `clips` audible in the timeline window [from, to). Source offsets are exact: a clip that
 * straddles a boundary gets `srcTo` in one window equal (bit for bit) to `srcFrom` in the next, so windows
 * scheduled back to back are sample-continuous. Whole clips keep their exact `in` / `out`. `trackVolumes` (from
 * trackVolumes(p); required so no engine forgets it) gives each segment its track's volume; a clip absent from it
 * plays at track volume 1. `duckPoints` (from clipDuckPoints(p)) gives each segment its track's duck envelope.
 */
export function planWindow(
  clips: readonly Clip[],
  from: number,
  to: number,
  trackVolumes: ReadonlyMap<Id, number>,
  duckPoints?: ReadonlyMap<Id, GainPoint[]>,
): Segment[] {
  const out: Segment[] = [];
  for (const clip of clips) {
    const end = clipEnd(clip);
    const a = Math.max(clip.start, from);
    const b = Math.min(end, to);
    if (!(b > a)) continue;
    const srcFrom = a === clip.start ? clip.in : clip.in + (a - clip.start);
    const srcTo = b === end ? clip.out : clip.in + (b - clip.start);
    if (!(srcTo > srcFrom)) continue;
    const trackVolume = trackVolumes.get(clip.id) ?? 1;
    const seg: Segment = { clipId: clip.id, mediaId: clip.mediaId, srcFrom, srcTo, when: a, whenEnd: b, clip, trackVolume };
    const duck = duckPoints?.get(clip.id);
    if (duck) seg.duckPoints = duck;
    out.push(seg);
  }
  return out;
}
