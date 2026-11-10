// Pure project edits behind the editor's buttons and shortcuts (composed from core/ operations).
import { fitTransform, joinClips } from '../core/merge';
import { clipEnd } from '../core/model';
import type { Clip, Id, MediaRef, Project } from '../core/model';
import { MIN_CLIP, TimelineError, addClip, assertUnlocked, deleteClip, findClip, splitClip } from '../core/timeline';
import { clipFromMedia } from '../media/clip';
import { laneRejects } from './drag';

const EPS = 1e-9;
export const SPLIT_HINT = 'Move the playhead inside a clip to split it';

/** Registers imported media in the project (no clip is added). */
export function addMedia(p: Project, m: MediaRef): Project {
  return { ...p, media: { ...p.media, [m.id]: m } };
}

/**
 * Appends the media as a full-length clip at the end of a track of its kind: the active track when it has that
 * kind, else the first. Locked tracks are skipped (in array order); throws when every track of the kind is locked.
 */
export function appendMedia(p: Project, mediaId: Id, activeTrackId?: Id | null): Project {
  const m = p.media[mediaId];
  if (!m) throw new TimelineError(`Media not found: ${mediaId}`);
  const kind = m.kind === 'audio' ? 'audio' : 'video';
  const ofKind = p.tracks.filter((t) => t.kind === kind);
  if (ofKind.length === 0) throw new TimelineError(`There is no ${kind} track to add ${m.name} to`);
  const active = ofKind.find((t) => t.id === activeTrackId);
  const track = [...(active ? [active] : []), ...ofKind].find((t) => !t.locked);
  if (!track) throw new TimelineError('All tracks of this kind are locked');
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
  let ids = splitTargets(p, selection, t);
  if (ids.length === 0) throw new TimelineError(SPLIT_HINT);
  if (selection.length === 0) {
    // Without a selection, locked clips are skipped; refuse only when nothing editable is left.
    const free = ids.filter((id) => !findClip(p, id).track.locked);
    if (free.length === 0) throw new TimelineError('Track is locked');
    ids = free;
  }
  return ids.reduce((acc, id) => splitClip(acc, id, t), p);
}

/** Deletes every clip in `ids` (no ripple); returns `p` itself when there is nothing to delete. */
export function deleteClips(p: Project, ids: Id[]): Project {
  return ids.reduce((acc, id) => deleteClip(acc, id, { ripple: false }), p);
}

/**
 * Deletes every clip in `ids` and closes each one's gap: later clips on its track move left by its duration.
 * Deletions run right to left per track so the shifts compose. Returns `p` itself when there is nothing to delete.
 */
export function rippleDeleteClips(p: Project, ids: Id[]): Project {
  const ordered = [...ids].sort((a, b) => findClip(p, b).clip.start - findClip(p, a).clip.start);
  return ordered.reduce((acc, id) => deleteClip(acc, id, { ripple: true }), p);
}

/** True when any undo/redo state of the history holds media or clips (so starting over discards work). */
export function projectHasWork(h: { past: Project[]; present: Project; future: Project[] }): boolean {
  return [...h.past, h.present, ...h.future].some(
    (p) => Object.keys(p.media).length > 0 || p.tracks.some((t) => t.clips.length > 0),
  );
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
  if (p.tracks.some((t) => t.locked && t.clips.some((c) => c.mediaId === mediaId))) throw new TimelineError('Track is locked');
  const { [mediaId]: _removed, ...media } = p.media;
  return { ...p, media, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.mediaId !== mediaId) })) };
}

function updateClip(p: Project, clipId: Id, fn: (c: Clip) => Clip): Project {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  const next = fn(clip);
  if (next === clip) return p;
  return { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? next : c)) })) };
}

/** Sets a clip's volume (1 = 100 %), clamped to 0..2. */
export function setClipVolume(p: Project, clipId: Id, volume: number): Project {
  if (!Number.isFinite(volume)) throw new TimelineError('Invalid volume');
  const v = Math.min(2, Math.max(0, volume));
  return updateClip(p, clipId, (c) => (c.volume === v ? c : { ...c, volume: v }));
}

/**
 * Sets a video/image clip's fit mode and resets its transform to `fitTransform` for the project canvas (any
 * position/scale change is replaced: the modes are defined by how the whole clip covers the canvas).
 */
export function setClipFit(p: Project, clipId: Id, fit: Clip['fit']): Project {
  return updateClip(p, clipId, (c) => {
    if (c.kind === 'audio') throw new TimelineError('Audio clips have no picture to fit');
    const m = p.media[c.mediaId];
    const transform = m?.width && m.height ? fitTransform({ width: m.width, height: m.height }, p.format, fit) : c.transform;
    return { ...c, fit, transform };
  });
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
  // Clearing changes every track that holds clips, and the new clip lands on `track`.
  if (track.locked || p.tracks.some((t) => t.locked && t.clips.length > 0)) throw new TimelineError('Track is locked');
  const cleared: Project = { ...addMedia(p, m), tracks: p.tracks.map((t) => ({ ...t, clips: [] })) };
  return addClip(cleared, track.id, clipFromMedia(m, track.id, 0, p.format));
}

/** Number of clips on video tracks. */
export function videoClipCount(p: Project): number {
  return p.tracks.reduce((n, t) => n + (t.kind === 'video' ? t.clips.length : 0), 0);
}
