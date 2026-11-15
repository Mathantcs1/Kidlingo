// DOM-free math for dragging on the timeline: thresholds, snapping, move/trim targets and drop rules.
import { snapTime } from '../core/merge';
import { clipDuration, clipEnd, hasOwnTimeline, timelineTimeAt, trimLimits } from '../core/clipTime';
import type { Clip, Id, MediaRef, Project, TrackKind } from '../core/model';
import { findClip } from '../core/timeline';

/** Pointer travel before a press on a clip becomes a drag (smaller movements stay clicks). */
export const DRAG_THRESHOLD_PX = 4;
/** Edges within this many pixels snap together. */
export const SNAP_PX = 8;

export function pastThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

/** The snap distance in seconds at `pps` pixels per second. */
export function snapSeconds(pps: number): number {
  return pps > 0 ? SNAP_PX / pps : 0;
}

/** `p` without the clip being dragged, so it never snaps to its own edges. */
export function withoutClip(p: Project, id: Id): Project {
  return { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) })) };
}

/** Start of a span of `duration` placed at `start`, with whichever of its edges is closer snapped; ≥ 0. */
export function snapSpan(p: Project, start: number, duration: number, threshold: number): number {
  if (Number.isNaN(start)) return 0;
  const end = start + duration;
  const startTo = snapTime(p, '', start, threshold);
  const endTo = snapTime(p, '', end, threshold);
  const dStart = startTo !== start ? Math.abs(startTo - start) : Infinity;
  const dEnd = endTo !== end ? Math.abs(endTo - end) : Infinity;
  if (dStart === Infinity && dEnd === Infinity) return Math.max(0, start);
  return Math.max(0, dStart <= dEnd ? startTo : endTo - duration);
}

const delta = (dxPx: number, pps: number): number | null => (pps > 0 && !Number.isNaN(dxPx) ? dxPx / pps : null);

/** New start for a clip dragged `dxPx` pixels, snapped to other clips' edges and 0. */
export function moveTarget(p: Project, clipId: Id, dxPx: number, pps: number): number {
  const { clip } = findClip(p, clipId);
  const d = delta(dxPx, pps);
  if (d === null) return clip.start;
  return snapSpan(withoutClip(p, clipId), clip.start + d, clipDuration(clip), snapSeconds(pps));
}

/**
 * New time for a dragged clip edge, snapped to other edges. An end trim stops at the end of the source media
 * (images have no end). Nothing else is limited here: core `trimClip` rejects too-short clips and `in < 0`.
 */
export function trimTarget(p: Project, clipId: Id, edge: 'start' | 'end', dxPx: number, pps: number): number {
  const { clip } = findClip(p, clipId);
  const from = edge === 'start' ? clip.start : clipEnd(clip);
  const d = delta(dxPx, pps);
  if (d === null) return from;
  const t = snapTime(withoutClip(p, clipId), '', from + d, snapSeconds(pps));
  return clampToSource(clip, p.media[clip.mediaId], edge, t);
}

/**
 * Keeps a dragged edge inside the footage (Plan 5D): a forward clip's end stops at the media end; a reversed clip's edges
 * swap roles (its start moves `out`, up to the media end; its end moves `in`, down to the file start). Own-timeline clips have no footage.
 */
function clampToSource(clip: Clip, m: MediaRef | undefined, edge: 'start' | 'end', t: number): number {
  if (hasOwnTimeline(clip) || !m || m.kind === 'image' || !(m.duration > 0)) return t;
  const { footageMin, footageMax } = trimLimits(m);
  const atMin = timelineTimeAt(clip, footageMin);
  const atMax = timelineTimeAt(clip, footageMax);
  const reverse = clip.reverse === true;
  if (edge === 'end') return Math.min(t, reverse ? atMin : atMax);
  return reverse ? Math.max(t, atMax) : t; // a forward start trim stays unclamped here: core trimClip refuses `in < 0` (existing contract)
}

/** Start for media of `duration` dropped at ruler offset `x`, snapped. */
export function dropStart(p: Project, x: number, pps: number, duration: number): number {
  if (!(pps > 0)) return 0;
  return snapSpan(p, x / pps, duration, snapSeconds(pps));
}

/** Why a lane of `trackKind` refuses media of `mediaKind`, or null when it accepts it. */
export function laneRejects(trackKind: TrackKind, mediaKind: MediaRef['kind'] | Clip['kind']): string | null {
  if (mediaKind === 'lut') return 'LUT files are used from the Effects panel';
  const wanted: TrackKind = mediaKind === 'audio' ? 'audio' : 'video';
  if (wanted === trackKind) return null;
  if (mediaKind === 'overlay') return 'Overlays go on a video track';
  if (mediaKind === 'adjustment') return 'Adjustment layers go on a video track';
  return mediaKind === 'audio' ? 'Audio goes on an audio track' : 'Video and images go on a video track';
}
