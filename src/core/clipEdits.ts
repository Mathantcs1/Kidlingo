import { cloneEffects, fitFades, withAudio } from './clipAudio';
import { cloneVideoEffects } from './clipEffects';
import { copyKey, mapEffectKeys, mapTransformKeys, shiftKeys, splitKeys } from './keyLists';
import type { AnyKey } from './keyLists';
import { withMotion } from './migrateMotion';
import { clipDuration, clipEnd, isSourceless, newId } from './model';
import { shiftMotion, splitMotion } from './motionClipOps';
import type { Clip, Id, Project, TransformKeys } from './model';
import { EPS, MIN_CLIP, TimelineError, assertFinite, assertFree, assertUnlocked, findClip, mapClips, replaceClip } from './timeline';

/** `clip` with its transform keys set to `keys` (no `keys` field when undefined). */
const withClipKeys = (clip: Clip, keys: TransformKeys | undefined): Clip => {
  const { keys: _old, ...rest } = clip;
  return keys ? { ...rest, keys } : rest;
};

/**
 * A key list mapper for one split half: the keys deciding local range [lo, hi] (splitKeys), moved by `d` seconds. A
 * LOOPED list (5B D4: evaluation past its last key reads the whole list) or an oriented path (D7: the heading
 * fallback may read beyond the range) is kept whole. Fresh copies.
 */
const part = (lo: number, hi: number, d: number) => <K extends AnyKey>(l: K[], looped: boolean): K[] => {
  const kept = looped ? l.map(copyKey) : splitKeys(l, lo, hi);
  return d === 0 ? kept : shiftKeys(kept, d);
};

/** Every key of the clip (transform and effect params) moved by `d` seconds; effect ids kept. */
function shiftClipKeys(clip: Clip, d: number): Clip {
  const move = <K extends AnyKey>(l: K[]): K[] => shiftKeys(l, d);
  return { ...withClipKeys(clip, mapTransformKeys(clip.keys, move, move)), effects: clip.effects.map((e) => mapEffectKeys(e, move)) };
}

export function trimClip(p: Project, clipId: Id, edge: 'start' | 'end', time: number): Project {
  assertFinite('trim time', time);
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  let next: Clip;
  if (edge === 'start') {
    const delta = time - clip.start;
    // An overlay or adjustment clip has no source: its start can move either way; `in` stays 0 (an overlay's
    // animation runs from `start`). Its keys shift by −Δ so they stay put in timeline time (Plan 5 D3), and so do its
    // emphasis and loop cycles (5B D12: at −= Δ, phase += Δ); a sourced clip's keys and stack stay on their footage.
    next = isSourceless(clip)
      ? { ...withMotion(shiftClipKeys(clip, -delta), clip.motion && shiftMotion(clip.motion, delta)), start: time, in: 0, out: clipDuration(clip) - delta }
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
  // Keys (Plan 5 D9): each half keeps the keys that decide its own local range, a looped target (5B D4) or an
  // oriented path (D7) its whole list; a sourceless right half's keys shift by −(time − start) (local time restarts).
  const d = time - clip.start;
  const [lo, hi] = isSourceless(clip) ? [0, clipDuration(clip)] : [clip.in, clip.out];
  const mid = lo + d;
  const shift = isSourceless(clip) ? -d : 0;
  const leftKeys = part(lo, mid, 0);
  const rightKeys = part(mid, hi, shift);
  // The animation stack (5B D12): left keeps in/loop and an emphasis starting before the cut, right keeps out/loop and
  // an emphasis starting after it (a sourceless right half's emphasis/loop shift with its local time).
  const [leftMotion, rightMotion] = splitMotion(clip.motion, mid, shift);
  // The left half keeps the fade-in, the right half the fade-out; effects are copied with new ids to both.
  // Each half's fade is re-clamped to the half's own duration.
  const left: Clip = {
    ...withMotion(withClipKeys(clip, mapTransformKeys(clip.keys, leftKeys, leftKeys)), leftMotion), out: cut, effects: cloneVideoEffects(clip.effects, leftKeys),
    audio: fitFades({ ...clip.audio, fadeOut: 0, effects: cloneEffects(clip.audio.effects) }, cut - clip.in),
  };
  const right: Clip = {
    ...withMotion(withClipKeys(clip, mapTransformKeys(clip.keys, rightKeys, rightKeys)), rightMotion), id: newId(), start: time, in: cut,
    effects: cloneVideoEffects(clip.effects, rightKeys),
    audio: fitFades({ ...clip.audio, fadeIn: 0, effects: cloneEffects(clip.audio.effects) }, clip.out - cut),
  };
  return mapClips(p, (t) =>
    t.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c])),
  );
}
