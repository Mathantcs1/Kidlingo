// Where a new source-less clip (overlay, adjustment layer) goes: shared by addOverlayClip and addAdjustmentClip. Pure.
import type { Clip, Id, Project } from './model';
import { TimelineError, addClip, assertUnlocked, hasRoom } from './timeline';
import { addTrack } from './tracks';

/**
 * Adds `clip` to the video track `trackId` when it has room there, else on a new video layer above the others (ONE
 * returned project). A locked target is refused, not bypassed (Ruling T12-3); a non-video target throws `wrongTrack`;
 * the per-kind layer limit applies.
 */
export function placeOnVideoLayer(p: Project, trackId: Id, clip: Clip, wrongTrack: string): Project {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) throw new TimelineError(`Track not found: ${trackId}`);
  if (track.kind !== 'video') throw new TimelineError(wrongTrack);
  assertUnlocked(p, trackId);
  if (hasRoom(track, clip)) return addClip(p, trackId, clip);
  const q = addTrack(p, 'video');
  const added = q.tracks.find((t) => !p.tracks.some((o) => o.id === t.id));
  if (!added) throw new TimelineError('Could not add a track');
  return addClip(q, added.id, clip);
}
