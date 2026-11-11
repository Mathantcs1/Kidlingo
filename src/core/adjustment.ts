// Adjustment layers (Plan 4 Task 13a, data v5): a media-less clip whose effects, blend mode and opacity apply to
// everything drawn below it (full frame; its transform is ignored except opacity). Pure.
import { defaultClipAudio, defaultTransform, newId } from './model';
import type { Clip, Id, Project } from './model';
import { placeOnVideoLayer } from './placement';
import { MIN_CLIP, TimelineError } from './timeline';

export const ADJUSTMENT_LABEL = 'Adjustment layer';
export const DEFAULT_ADJUSTMENT_DURATION = 5;

/** A new adjustment clip: no media, no effects yet, normal blend, full opacity. Track placement is the caller's. */
export function newAdjustmentClip(start: number, duration: number): Clip {
  return {
    id: newId(), mediaId: '', kind: 'adjustment', start, in: 0, out: duration,
    transform: defaultTransform(), volume: 1, fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal',
  };
}

/**
 * Adds an adjustment layer at `start` (clamped to ≥ 0) lasting `duration` s on the video track `trackId` when it has
 * room there, else on a new video layer above the others (placed like overlays). A locked target is refused.
 */
export function addAdjustmentClip(p: Project, trackId: Id, start: number, duration = DEFAULT_ADJUSTMENT_DURATION): Project {
  if (!Number.isFinite(start)) throw new TimelineError('Invalid clip position');
  if (!Number.isFinite(duration) || duration < MIN_CLIP) throw new TimelineError('Invalid adjustment layer duration');
  const clip = newAdjustmentClip(Math.max(0, start), duration);
  return placeOnVideoLayer(p, trackId, clip, 'Adjustment layers go on a video track');
}
