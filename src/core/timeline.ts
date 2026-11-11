import { cloneEffects, fitFades, withAudio } from './clipAudio';
import { adoptFirstClipFps } from './fps';
import { clipDuration, clipEnd, newId } from './model';
import type { Clip, Id, Project, Track } from './model';

export const MIN_CLIP = 0.05;
const EPS = 1e-9;

export class TimelineError extends Error {}

const trackKindFor = (c: Clip): Track['kind'] => (c.kind === 'audio' ? 'audio' : 'video');

const byStart = (a: Clip, b: Clip): number => a.start - b.start;

function overlaps(a: Clip, b: Clip): boolean {
  return a.start < clipEnd(b) - EPS && b.start < clipEnd(a) - EPS;
}

function mapClips(p: Project, fn: (t: Track) => Clip[]): Project {
  return { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: fn(t) })) };
}

function replaceClip(p: Project, clipId: Id, next: Clip): Project {
  return mapClips(p, (t) => t.clips.map((c) => (c.id === clipId ? next : c)));
}

export function findClip(p: Project, clipId: Id): { track: Track; clip: Clip } {
  for (const track of p.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  throw new TimelineError(`Clip not found: ${clipId}`);
}

/** NaN/Infinity slip past every `<`/`>` guard below, so they are rejected up front. */
function assertFinite(what: string, ...values: number[]): void {
  if (!values.every(Number.isFinite)) throw new TimelineError(`Invalid ${what}`);
}

/**
 * Every operation that changes a track's clips calls this first. Deliberately exempt: setTrackFlags (so a track can be
 * unlocked), renameTrack, moveTrack (metadata / layer order) and reframeProject (project-wide format change).
 */
export function assertUnlocked(p: Project, trackId: Id): void {
  if (p.tracks.find((t) => t.id === trackId)?.locked) throw new TimelineError('Track is locked');
}

/** Whether `clip` fits on `track` without overlapping another clip (ignoring `ignoreId`). */
export function hasRoom(track: Track, clip: Clip, ignoreId?: Id): boolean {
  return !track.clips.some((c) => c.id !== ignoreId && overlaps(c, clip));
}

function assertFree(track: Track, clip: Clip, ignoreId?: Id): void {
  if (!hasRoom(track, clip, ignoreId)) {
    throw new TimelineError('Clip overlaps an existing clip');
  }
}

/** Adds `clip` to the track; the first video clip on an empty timeline also sets the project fps (see fps.ts). */
export function addClip(p: Project, trackId: Id, clip: Clip): Project {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) throw new TimelineError(`Track not found: ${trackId}`);
  assertUnlocked(p, trackId);
  assertFinite('clip times', clip.start, clip.in, clip.out);
  if (trackKindFor(clip) !== track.kind) {
    throw new TimelineError(`A ${clip.kind} clip cannot go on a ${track.kind} track`);
  }
  assertFree(track, clip);
  const adopted = adoptFirstClipFps(p, clip);
  return {
    ...adopted,
    tracks: adopted.tracks.map((t) =>
      t.id === trackId ? { ...t, clips: [...t.clips, clip].sort(byStart) } : t,
    ),
  };
}

export function trimClip(p: Project, clipId: Id, edge: 'start' | 'end', time: number): Project {
  assertFinite('trim time', time);
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  let next: Clip;
  if (edge === 'start') {
    const delta = time - clip.start;
    next = { ...clip, start: time, in: clip.in + delta };
    if (next.in < -EPS || next.start < -EPS) throw new TimelineError('Trim extends beyond source');
  } else {
    next = { ...clip, out: clip.in + (time - clip.start) };
  }
  if (clipDuration(next) < MIN_CLIP - EPS) throw new TimelineError('Clip would be too short');
  assertFree(track, next, clip.id);
  // Fades must still fit the (possibly shorter) clip.
  next = withAudio(next, fitFades(next.audio, clipDuration(next)));
  return replaceClip(p, clipId, next);
}

export function splitClip(p: Project, clipId: Id, time: number): Project {
  assertFinite('split time', time);
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  if (time < clip.start + MIN_CLIP - EPS || time > clipEnd(clip) - MIN_CLIP + EPS) {
    throw new TimelineError('Split point too close to clip edge');
  }
  const cut = clip.in + (time - clip.start);
  // The left half keeps the fade-in, the right half the fade-out; effects are copied with new ids to both.
  const left: Clip = { ...clip, out: cut, audio: { ...clip.audio, fadeOut: 0, effects: cloneEffects(clip.audio.effects) } };
  const right: Clip = {
    ...clip, id: newId(), start: time, in: cut,
    audio: { ...clip.audio, fadeIn: 0, effects: cloneEffects(clip.audio.effects) },
  };
  return mapClips(p, (t) =>
    t.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c])),
  );
}

export function moveClip(p: Project, clipId: Id, newStart: number, trackId?: Id): Project {
  assertFinite('clip position', newStart);
  const { track: from, clip } = findClip(p, clipId);
  const target = trackId === undefined ? from : p.tracks.find((t) => t.id === trackId);
  if (!target) throw new TimelineError(`Track not found: ${trackId}`);
  assertUnlocked(p, from.id);
  assertUnlocked(p, target.id);
  if (trackKindFor(clip) !== target.kind) {
    throw new TimelineError(`A ${clip.kind} clip cannot go on a ${target.kind} track`);
  }
  const moved: Clip = { ...clip, start: Math.max(0, newStart) };
  assertFree(target, moved, clip.id);
  return {
    ...p,
    tracks: p.tracks.map((t) => {
      const rest = t.clips.filter((c) => c.id !== clipId);
      return t.id === target.id
        ? { ...t, clips: [...rest, moved].sort(byStart) }
        : { ...t, clips: rest };
    }),
  };
}

export function deleteClip(p: Project, clipId: Id, opts?: { ripple?: boolean }): Project {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  const dur = clipDuration(clip);
  return {
    ...p,
    tracks: p.tracks.map((t) => {
      if (t.id !== track.id) return t;
      const clips = t.clips
        .filter((c) => c.id !== clipId)
        .map((c) =>
          opts?.ripple && c.start >= clip.start ? { ...c, start: Math.max(0, c.start - dur) } : c,
        );
      return { ...t, clips };
    }),
  };
}

export function activeClipsAt(p: Project, t: number): Clip[] {
  return p.tracks.flatMap((track) =>
    track.clips.filter((c) => c.start <= t && t < clipEnd(c)).sort(byStart),
  );
}

export function timelineDuration(p: Project): number {
  let max = 0;
  for (const t of p.tracks) for (const c of t.clips) max = Math.max(max, clipEnd(c));
  return max;
}
