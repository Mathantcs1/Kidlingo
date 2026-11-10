// Pure edits behind the new-layer drop zones: each creates a track and puts a clip on it in ONE returned project.
import type { Id, Project, TrackKind } from '../core/model';
import { TimelineError, addClip, assertUnlocked, findClip, moveClip } from '../core/timeline';
import { addTrack } from '../core/tracks';
import { clipFromMedia } from '../media/clip';
import { laneRejects } from './drag';

/** The id of the one track in `after` that is not in `before`, or null. */
export function addedTrackId(before: Project, after: Project): Id | null {
  const old = new Set(before.tracks.map((t) => t.id));
  return after.tracks.find((t) => !old.has(t.id))?.id ?? null;
}

function checkStart(start: number): number {
  if (!Number.isFinite(start)) throw new TimelineError('Invalid clip position');
  return Math.max(0, start);
}

/** `p` plus a new track of `kind` at its default place (video above the other layers, audio last), and its id. */
function withNewTrack(p: Project, kind: TrackKind): { q: Project; trackId: Id } {
  const q = addTrack(p, kind);
  const trackId = addedTrackId(p, q);
  if (!trackId) throw new TimelineError('Could not add a track');
  return { q, trackId };
}

/**
 * Adds a track of `kind` holding `mediaId` as a full-length clip at `start` (clamped to ≥ 0). The media must suit the
 * track (video/images on video, audio on audio); the per-kind track limit applies.
 */
export function dropMediaOnNewLayer(p: Project, kind: TrackKind, mediaId: Id, start: number): Project {
  const m = p.media[mediaId];
  if (!m) throw new TimelineError(`Media not found: ${mediaId}`);
  const rejected = laneRejects(kind, m.kind);
  if (rejected) throw new TimelineError(rejected);
  const at = checkStart(start);
  const { q, trackId } = withNewTrack(p, kind);
  return addClip(q, trackId, clipFromMedia(m, trackId, at, p.format));
}

/**
 * Moves a clip to a new track of `kind`, starting at `newStart` (clamped to ≥ 0); everything else about the clip is
 * kept. Its source track stays (possibly empty) and must not be locked.
 */
export function moveClipToNewLayer(p: Project, clipId: Id, kind: TrackKind, newStart: number): Project {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  const rejected = laneRejects(kind, clip.kind);
  if (rejected) throw new TimelineError(rejected);
  const at = checkStart(newStart);
  const { q, trackId } = withNewTrack(p, kind);
  return moveClip(q, clipId, at, trackId);
}
