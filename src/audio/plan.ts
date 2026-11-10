// DOM-free planning of windowed audio: which part of which clip sounds in a timeline window.
import { clipDuration, clipEnd } from '../core/model';
import type { Clip, Id, Project, Track } from '../core/model';

/** One clip's contribution to a window: source range [srcFrom, srcTo) plays from timeline time `when`. */
export interface Segment {
  clipId: Id;
  mediaId: Id;
  srcFrom: number;
  srcTo: number;
  when: number;
  volume: number;
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
 * tracks that are audible (see trackAudible). Images are silent; a volume of 0 (or NaN) contributes nothing and
 * is never decoded.
 */
export function audibleClips(p: Project): Clip[] {
  const out: Clip[] = [];
  for (const track of p.tracks) {
    if (!trackAudible(p, track)) continue;
    for (const clip of track.clips) {
      const media = p.media[clip.mediaId];
      if (!media || media.missing) continue;
      if (!(clip.volume > 0) || !(clipDuration(clip) > 0)) continue;
      if (clip.kind === 'audio' || (clip.kind === 'video' && media.hasAudio)) out.push(clip);
    }
  }
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
 * scheduled back to back are sample-continuous. Whole clips keep their exact `in` / `out`.
 */
export function planWindow(clips: readonly Clip[], from: number, to: number): Segment[] {
  const out: Segment[] = [];
  for (const clip of clips) {
    const end = clipEnd(clip);
    const a = Math.max(clip.start, from);
    const b = Math.min(end, to);
    if (!(b > a)) continue;
    const srcFrom = a === clip.start ? clip.in : clip.in + (a - clip.start);
    const srcTo = b === end ? clip.out : clip.in + (b - clip.start);
    if (!(srcTo > srcFrom)) continue;
    out.push({ clipId: clip.id, mediaId: clip.mediaId, srcFrom, srcTo, when: a, volume: clip.volume });
  }
  return out;
}
