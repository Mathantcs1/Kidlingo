// DOM-free maths of the timeline transition chip (Plan 5C Task 8): its box, the symmetric duration drag and the cut the
// `T` shortcut adds a transition to.
import { clipDuration } from '../core/clipTime';
import type { Id, Project } from '../core/model';
import { cutsOf, snapDuration } from '../core/transitions';

/** A chip never gets narrower than this (px), so a 2-frame transition can still be grabbed. */
export const MIN_CHIP_PX = 8;

/** The chip's left edge and width (px) for a transition of `duration` s centred on the cut at `cutTime` s. */
export function chipBox(duration: number, cutTime: number, pps: number): { left: number; width: number } {
  const width = Math.max(MIN_CHIP_PX, duration * pps);
  return { left: cutTime * pps - width / 2, width };
}

export interface DurationDrag {
  /** The duration when the drag began (s). */
  start: number;
  side: 'l' | 'r';
  dxPx: number;
  pps: number;
  fps: number;
  /** The longest duration the cut allows (s). */
  max: number;
}

/** The duration of a handle drag: the window is centred on the cut, so a handle moving x px changes it by 2x px; whole even frames, 2 frames .. max. */
export function dragDuration({ start, side, dxPx, pps, fps, max }: DurationDrag): number {
  if (!Number.isFinite(dxPx) || !(pps > 0)) return start;
  const delta = ((side === 'r' ? dxPx : -dxPx) / pps) * 2;
  const floor = 2 / fps;
  const ceil = Math.max(floor, snapDuration(max, fps));
  return Math.min(ceil, Math.max(floor, snapDuration(start + delta, fps)));
}

/**
 * The cut without a transition nearest the playhead on `trackId`, within one clip's reach (the playhead is no farther
 * from the cut than the longer of its two clips); null on a locked track or when there is none.
 */
export function nearestCut(p: Project, trackId: Id, playhead: number): { trackId: Id; fromClipId: Id; toClipId: Id; time: number } | null {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track || track.locked) return null;
  let best: { trackId: Id; fromClipId: Id; toClipId: Id; time: number } | null = null;
  let bestDist = Infinity;
  for (const c of cutsOf(track)) {
    if ((track.transitions ?? []).some((t) => t.fromClipId === c.from.id && t.toClipId === c.to.id)) continue;
    const dist = Math.abs(c.time - playhead);
    if (dist > Math.max(clipDuration(c.from), clipDuration(c.to)) || dist >= bestDist) continue;
    best = { trackId, fromClipId: c.from.id, toClipId: c.to.id, time: c.time };
    bestDist = dist;
  }
  return best;
}
