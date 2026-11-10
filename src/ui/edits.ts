// Pure project edits behind the editor's buttons and shortcuts (composed from core/ operations).
import { joinClips } from '../core/merge';
import { clipEnd } from '../core/model';
import type { Id, MediaRef, Project } from '../core/model';
import { MIN_CLIP, TimelineError, addClip, deleteClip, findClip, splitClip } from '../core/timeline';
import { clipFromMedia } from '../media/clip';

const EPS = 1e-9;
export const SPLIT_HINT = 'Move the playhead inside a clip to split it';

/** Registers imported media in the project (no clip is added). */
export function addMedia(p: Project, m: MediaRef): Project {
  return { ...p, media: { ...p.media, [m.id]: m } };
}

/** Appends the media as a full-length clip at the end of the first track of its kind. */
export function appendMedia(p: Project, mediaId: Id): Project {
  const m = p.media[mediaId];
  if (!m) throw new TimelineError(`Media not found: ${mediaId}`);
  const kind = m.kind === 'audio' ? 'audio' : 'video';
  const track = p.tracks.find((t) => t.kind === kind);
  if (!track) throw new TimelineError(`There is no ${kind} track to add ${m.name} to`);
  const start = track.clips.reduce((end, c) => Math.max(end, clipEnd(c)), 0);
  return addClip(p, track.id, clipFromMedia(m, track.id, start, p.format));
}

/** Clips the playhead is far enough inside to split: from the selection, or from every track without one. */
export function splitTargets(p: Project, selection: Id[], t: number): Id[] {
  const chosen = new Set(selection);
  return p.tracks
    .flatMap((track) => track.clips)
    .filter((c) => selection.length === 0 || chosen.has(c.id))
    .filter((c) => t >= c.start + MIN_CLIP - EPS && t <= clipEnd(c) - MIN_CLIP + EPS)
    .map((c) => c.id);
}

export function splitAt(p: Project, selection: Id[], t: number): Project {
  const ids = splitTargets(p, selection, t);
  if (ids.length === 0) throw new TimelineError(SPLIT_HINT);
  return ids.reduce((acc, id) => splitClip(acc, id, t), p);
}

/** Deletes every clip in `ids` (no ripple); returns `p` itself when there is nothing to delete. */
export function deleteClips(p: Project, ids: Id[]): Project {
  return ids.reduce((acc, id) => deleteClip(acc, id, { ripple: false }), p);
}

/** Joins the clips ordered by their start time. */
export function mergeClips(p: Project, ids: Id[]): Project {
  const ordered = [...ids].sort((a, b) => findClip(p, a).clip.start - findClip(p, b).clip.start);
  return joinClips(p, ordered);
}

/** Additive clicks toggle `id`; plain clicks select only `id`. */
export function toggleSelection(selection: Id[], id: Id, additive: boolean): Id[] {
  if (!additive) return [id];
  return selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
}
