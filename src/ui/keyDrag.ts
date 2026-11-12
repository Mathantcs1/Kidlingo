// DOM-free maths of the timeline keyframe row (Plan 5 Task 8): the summary diamonds of a clip, where they sit, and
// the retiming drag (whole frames, playhead snap, kept on the clip) with a preview of the core's refusal.
import { localRange } from '../core/keyframes';
import { keyTimes, moveKeys } from '../core/keyframeEdits';
import type { KeyRef } from '../core/keyframeEdits';
import type { Clip, Id, Project } from '../core/model';
import { TimelineError } from '../core/timeline';
import { SNAP_PX } from './drag';
import { keyVisible } from './keyframeCommands';
import { visibleKeyTimes } from './keySelection';

/** The clip's diamonds (visible key times) and whether keys lie beyond its start/end (D9 keeps them on trims). */
export function rowSummary(clip: Clip): { times: number[]; before: boolean; after: boolean } {
  const times = visibleKeyTimes(clip);
  if (clip.kind === 'audio') return { times, before: false, after: false };
  const hidden = keyTimes(clip).filter((u) => !keyVisible(clip, u));
  const [lo] = localRange(clip);
  return { times, before: hidden.some((u) => u < lo), after: hidden.some((u) => u >= lo) };
}

/** A diamond's x in px from the clip's left edge (D3: local key time → timeline time). */
export const diamondX = (clip: Clip, u: number, pps: number): number => (u - localRange(clip)[0]) * pps;

/** A pointer delta in seconds rounded to whole frames (0 for unusable input). */
export function frameDelta(dxPx: number, pps: number, fps: number): number {
  if (!(pps > 0) || !(fps > 0) || !Number.isFinite(dxPx)) return 0;
  return Math.round((dxPx / pps) * fps) / fps;
}

/** `delta` (whole frames) limited so every moved key stays on the clip's visible range [lo, hi) (the end is off the clip). */
export function clampDelta(clip: Clip, times: readonly number[], delta: number, fps: number): number {
  if (times.length === 0 || !(fps > 0)) return 0;
  const [lo, hi] = localRange(clip);
  const first = Math.min(...times);
  const last = Math.max(...times);
  const nMin = -Math.floor((first - lo) * fps + 1e-6);
  const nMax = Math.ceil((hi - last) * fps - 1e-6) - 1;
  if (nMin > nMax) return 0;
  const n = Math.min(nMax, Math.max(nMin, Math.round(delta * fps)));
  return n === 0 ? 0 : n / fps;
}

/** Snaps the grabbed key (local `grabbed`) onto the playhead when it lands within SNAP_PX of it (whole frames kept). */
export function snapDeltaToPlayhead(clip: Clip, grabbed: number, delta: number, playhead: number, pps: number, fps: number): number {
  if (!(pps > 0) || !(fps > 0)) return delta;
  const at = clip.start + (grabbed - localRange(clip)[0]);
  if (Math.abs(at + delta - playhead) * pps > SNAP_PX) return delta;
  return Math.round((playhead - at) * fps) / fps;
}

export interface DragInput {
  clip: Clip;
  /** The selected local key times that move. */
  times: readonly number[];
  /** The local time of the diamond under the pointer. */
  grabbed: number;
  dxPx: number;
  pps: number;
  fps: number;
  playhead: number;
}

/** The retiming delta for a drag: pixels → whole frames → playhead snap → kept on the clip. */
export function dragDelta(d: DragInput): number {
  const raw = frameDelta(d.dxPx, d.pps, d.fps);
  return clampDelta(d.clip, d.times, snapDeltaToPlayhead(d.clip, d.grabbed, raw, d.playhead, d.pps, d.fps), d.fps);
}

/** Why `moveKeys` would refuse this move (shown while dragging), or null when it would succeed. */
export function moveRefusal(p: Project, clipId: Id, refs: readonly KeyRef[], delta: number): string | null {
  try {
    moveKeys(p, clipId, refs, delta);
    return null;
  } catch (e) {
    if (e instanceof TimelineError) return e.message;
    throw e;
  }
}
