// Pure project edits behind the editor's buttons and shortcuts (composed from core/ operations).
import { joinClips } from '../core/merge';
import { clipEnd } from '../core/model';
import type { Id, MediaRef, Project } from '../core/model';
import { MIN_CLIP, TimelineError, addClip, deleteClip, findClip, splitClip } from '../core/timeline';
import { clipFromMedia } from '../media/clip';
import { laneRejects } from './drag';

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

/** Number of clips that use `mediaId`. */
export function clipsUsingMedia(p: Project, mediaId: Id): number {
  return p.tracks.reduce((n, t) => n + t.clips.filter((c) => c.mediaId === mediaId).length, 0);
}

/**
 * Removes `mediaId` from the project together with every clip that uses it (one edit, so one undo step). The
 * stored file is not touched here: undo must be able to bring it back; startup/New project GC deletes it later.
 */
export function removeMediaFromProject(p: Project, mediaId: Id): Project {
  if (!p.media[mediaId]) throw new TimelineError(`Media not found: ${mediaId}`);
  const { [mediaId]: _removed, ...media } = p.media;
  return { ...p, media, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.mediaId !== mediaId) })) };
}

/** Joins the clips ordered by their start time. */
export function mergeClips(p: Project, ids: Id[]): Project {
  const ordered = [...ids].sort((a, b) => findClip(p, a).clip.start - findClip(p, b).clip.start);
  return joinClips(p, ordered);
}

/** The selection restricted to clips that exist in `p`; the same array when nothing is stale. */
export function liveSelection(p: Project, selection: Id[]): Id[] {
  const ids = new Set(p.tracks.flatMap((t) => t.clips.map((c) => c.id)));
  const live = selection.filter((id) => ids.has(id));
  return live.length === selection.length ? selection : live;
}

/** Additive clicks toggle `id`; plain clicks select only `id`. */
export function toggleSelection(selection: Id[], id: Id, additive: boolean): Id[] {
  if (!additive) return [id];
  return selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
}

/** Adds `mediaId` as a full-length clip at `start` on `trackId`; wrong lane kinds and overlaps throw TimelineError. */
export function dropMedia(p: Project, trackId: Id, mediaId: Id, start: number): Project {
  const m = p.media[mediaId];
  if (!m) throw new TimelineError(`Media not found: ${mediaId}`);
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) throw new TimelineError(`Track not found: ${trackId}`);
  const rejected = laneRejects(track.kind, m.kind);
  if (rejected) throw new TimelineError(rejected);
  return addClip(p, track.id, clipFromMedia(m, track.id, start, p.format));
}

/** Registers `m` and replaces every clip on every track with one full-length clip of it at 0 (first video track). */
export function replaceWithMedia(p: Project, m: MediaRef): Project {
  const track = p.tracks.find((t) => t.kind === 'video');
  if (!track) throw new TimelineError('There is no video track to merge into');
  const cleared: Project = { ...addMedia(p, m), tracks: p.tracks.map((t) => ({ ...t, clips: [] })) };
  return addClip(cleared, track.id, clipFromMedia(m, track.id, 0, p.format));
}

/** Number of clips on video tracks. */
export function videoClipCount(p: Project): number {
  return p.tracks.reduce((n, t) => n + (t.kind === 'video' ? t.clips.length : 0), 0);
}
