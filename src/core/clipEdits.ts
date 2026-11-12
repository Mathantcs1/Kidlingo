import { cloneEffects, fitFades, withAudio } from './clipAudio';
import { cloneVideoEffects } from './clipEffects';
import { clipDuration, clipEnd, isSourceless, newId } from './model';
import type { Clip, Id, Project } from './model';
import { EPS, MIN_CLIP, TimelineError, assertFinite, assertFree, assertUnlocked, findClip, mapClips, replaceClip } from './timeline';

export function trimClip(p: Project, clipId: Id, edge: 'start' | 'end', time: number): Project {
  assertFinite('trim time', time);
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  let next: Clip;
  if (edge === 'start') {
    const delta = time - clip.start;
    // An overlay or adjustment clip has no source: its start can move either way; `in` stays 0 (an overlay's
    // animation runs from `start`).
    next = isSourceless(clip)
      ? { ...clip, start: time, in: 0, out: clipDuration(clip) - delta }
      : { ...clip, start: time, in: clip.in + delta };
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
  // Each half's fade is re-clamped to the half's own duration.
  const left: Clip = {
    ...clip, out: cut, effects: cloneVideoEffects(clip.effects),
    audio: fitFades({ ...clip.audio, fadeOut: 0, effects: cloneEffects(clip.audio.effects) }, cut - clip.in),
  };
  const right: Clip = {
    ...clip, id: newId(), start: time, in: cut, effects: cloneVideoEffects(clip.effects),
    audio: fitFades({ ...clip.audio, fadeIn: 0, effects: cloneEffects(clip.audio.effects) }, clip.out - cut),
  };
  return mapClips(p, (t) =>
    t.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c])),
  );
}
