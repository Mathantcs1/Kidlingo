// Pure project edits behind the editor's buttons and shortcuts (composed from core/ operations).
import { fitTransform, joinClips } from '../core/merge';
import { clipEnd } from '../core/model';
import type { Clip, Id, MediaRef, Project, Track } from '../core/model';
import { MIN_CLIP, TimelineError, addClip, assertUnlocked, deleteClip, findClip, splitClip } from '../core/timeline';
import { withoutTransformKeys } from '../core/transformEdits';
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
  if (m.kind === 'lut') throw new TimelineError('LUT files cannot be placed on the timeline');
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

// Media removal lives in ./mediaEdits (re-exported here so import sites stay unchanged).
export { clipsUsingMedia, removeMediaFromProject, usedByText } from './mediaEdits';

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
 * Sets a video/image clip's fit mode and resets its position and scale to `fitTransform` for the project canvas (the
 * modes are defined by how the whole clip covers the canvas) and removes its position and scale keys; rotation and
 * opacity (and their keys) are kept. Media without known dimensions only changes the mode. Returns `p` itself when
 * the clip already has that mode.
 */
export function setClipFit(p: Project, clipId: Id, fit: Clip['fit']): Project {
  return updateClip(p, clipId, (c) => {
    if (c.kind === 'audio') throw new TimelineError('Audio clips have no picture to fit');
    if (c.kind === 'overlay') throw new TimelineError('Overlays have no frame to fit');
    if (c.kind === 'adjustment') throw new TimelineError('Adjustment layers have no frame to fit');
    if (c.fit === fit) return c;
    const m = p.media[c.mediaId];
    if (!m?.width || !m.height) return { ...c, fit };
    const transform = { ...fitTransform({ width: m.width, height: m.height }, p.format, fit), rotation: c.transform.rotation, opacity: c.transform.opacity };
    // The fit defines the framing: position and scale keys go (Plan 5 D9); rotation and opacity keys stay.
    const { keys: _keys, ...rest } = c;
    const keys = withoutTransformKeys(c.keys, ['position', 'scale']);
    return keys ? { ...rest, fit, transform, keys } : { ...rest, fit, transform };
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

export const NO_VIDEO_TRACK = 'There is no video track to merge into';

/**
 * Why merge-all cannot replace the timeline of `p`, or null: there is no video track, or a track that holds clips
 * is locked (an empty locked track does not block it). Checked before exporting so nobody waits for a merge that
 * cannot be applied.
 */
export function mergeRefusal(p: Project): string | null {
  if (!p.tracks.some((t) => t.kind === 'video')) return NO_VIDEO_TRACK;
  if (p.tracks.some((t) => t.locked && t.clips.length > 0)) return 'Track is locked';
  return null;
}

/** Number of clips on hidden video layers (merge-all leaves them out of the picture, then removes them). */
export function hiddenLayerClipCount(p: Project): number {
  return p.tracks.reduce((n, t) => n + (t.kind === 'video' && t.hidden ? t.clips.length : 0), 0);
}

/**
 * Registers `m` and replaces every clip on every track with one full-length clip of it at 0 on the lowest (first)
 * video track. Tracks keep their names, and the other (now empty) tracks keep their mute/hide flags. The target is
 * unlocked (only possible when it was empty), unhidden and unmuted, with volume 1 and no duck (the mixdown already
 * holds the track volume and ducking, applying them again would play it twice as loud or quiet), so the result is seen
 * and heard, and solo is cleared on every track: the merged file already holds the audible mix, and a solo left on an empty track would
 * silence it. Throws `mergeRefusal`'s reason.
 */
export function replaceWithMedia(p: Project, m: MediaRef): Project {
  const refusal = mergeRefusal(p);
  if (refusal) throw new TimelineError(refusal);
  const target = p.tracks.find((t) => t.kind === 'video') as Track;
  const tracks = p.tracks.map((t) =>
    t === target ? { ...t, locked: false, hidden: false, muted: false, solo: false, volume: 1, duck: null, clips: [] } : { ...t, solo: false, clips: [] },
  );
  return addClip({ ...addMedia(p, m), tracks }, target.id, clipFromMedia(m, target.id, 0, p.format));
}

/** Number of clips on video tracks. */
export function videoClipCount(p: Project): number {
  return p.tracks.reduce((n, t) => n + (t.kind === 'video' ? t.clips.length : 0), 0);
}
