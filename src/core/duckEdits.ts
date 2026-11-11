// Partial edits of a track's duck setting (for the track-header duck controls).
import { setTrackDuck } from './audioEdits';
import type { Id, Project, TrackDuck } from './model';
import { TimelineError } from './timeline';

/** The duck shape a track starts with when a source is first chosen. */
export const DEFAULT_DUCK: Omit<TrackDuck, 'sourceTrackId'> = { amountDb: -12, attack: 0.2, release: 0.5 };

/**
 * Applies `patch` to the duck setting of `trackId` (null turns ducking off). Choosing a source on a track without
 * ducking starts from DEFAULT_DUCK; a shape-only patch while ducking is off is a no-op (same project). Validation,
 * clamping and cycle refusal are setTrackDuck's.
 */
export function patchTrackDuck(p: Project, trackId: Id, patch: Partial<TrackDuck> | null): Project {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) throw new TimelineError(`Track not found: ${trackId}`);
  if (patch === null) return setTrackDuck(p, trackId, null);
  const base = track.duck ?? (patch.sourceTrackId ? { sourceTrackId: patch.sourceTrackId, ...DEFAULT_DUCK } : null);
  if (!base) return p;
  return setTrackDuck(p, trackId, { ...base, ...patch });
}
