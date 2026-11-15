// Pure edits for overlay clips (lower thirds, subscribe button, progress bar, stickers).
import { newId } from './model';
import type { Clip, Id, OverlayType, Project } from './model';
import { TimelineError, addClip, assertUnlocked, findClip, hasRoom, timelineDuration } from './timeline';
import { addTrack } from './tracks';
import { defaultClipAudio } from './model';
import { MAX_OVERLAY_SUBTEXT, MAX_OVERLAY_TEXT, OVERLAY_DEFAULTS, clampOverlayParams, initialTransform } from '../overlays/spec';

const DEFAULT_SECONDS = 3;
const MAX_PROGRESS_SECONDS = 10;
const cap = (s: string, n: number): string => Array.from(s).slice(0, n).join('');

/**
 * Adds an overlay clip at `start` (3 s; a progress bar spans the timeline after its start, 3..10 s). It goes on the
 * requested video track if that is unlocked and free, else on the first unlocked video track (top first) with room,
 * else on a new video track (at most 8 video tracks).
 */
export function addOverlay(p: Project, type: OverlayType, opts: { start: number; trackId?: Id }): Project {
  const { start } = opts;
  if (!Number.isFinite(start) || start < 0) throw new TimelineError('Invalid overlay position');
  if (opts.trackId !== undefined) {
    const t = p.tracks.find((x) => x.id === opts.trackId);
    if (!t) throw new TimelineError(`Track not found: ${opts.trackId}`);
    if (t.kind !== 'video') throw new TimelineError('Overlays go on a video track');
  }
  const seconds = type === 'progress' ? Math.min(MAX_PROGRESS_SECONDS, Math.max(DEFAULT_SECONDS, timelineDuration(p) - start)) : DEFAULT_SECONDS;
  const spec = OVERLAY_DEFAULTS[type];
  const clip: Clip = {
    id: newId(), mediaId: '', kind: 'overlay', start, in: 0, out: seconds, transform: initialTransform(type, p.format), volume: 1,
    fit: 'fit', audio: defaultClipAudio(), fx: [], overlay: { ...spec, params: { ...spec.params } },
  };
  const videos = p.tracks.filter((t) => t.kind === 'video');
  const preferred = videos.find((t) => t.id === opts.trackId);
  const ordered = [...(preferred ? [preferred] : []), ...[...videos].reverse().filter((t) => t !== preferred)];
  for (const t of ordered) if (!t.locked && hasRoom(t, clip)) return addClip(p, t.id, clip);
  const q = addTrack(p, 'video');
  const added = q.tracks.find((t) => !p.tracks.some((o) => o.id === t.id));
  if (!added) throw new TimelineError('Could not add a video track');
  return addClip(q, added.id, clip);
}

/** Changes an overlay's text (capped at 60 / 80 characters) and/or parameters (clamped). Same project when unchanged. */
export function updateOverlay(
  p: Project,
  clipId: Id,
  patch: { text?: string; subtext?: string; params?: Record<string, number> },
): Project {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  const spec = clip.overlay;
  if (clip.kind !== 'overlay' || !spec) throw new TimelineError('This clip is not an overlay');
  const text = patch.text === undefined ? spec.text : cap(patch.text, MAX_OVERLAY_TEXT);
  const subtext = patch.subtext === undefined ? spec.subtext : cap(patch.subtext, MAX_OVERLAY_SUBTEXT);
  const current = clampOverlayParams(spec.type, spec.params);
  const params = patch.params ? clampOverlayParams(spec.type, { ...current, ...patch.params }) : spec.params;
  const sameParams = params === spec.params || Object.keys(params).every((k) => params[k] === current[k]);
  if (text === spec.text && subtext === spec.subtext && sameParams) return p;
  const next: Clip = { ...clip, overlay: { ...spec, text, subtext, params: sameParams ? spec.params : params } };
  return { ...p, tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? next : c)) } : t)) };
}
