// Speed edits (Plan 5D Task 4): constant speed, reverse, pitch and the ramp as pure (Project, …) => Project functions.
// A retime keeps the clip's start and the footage edge that plays FIRST, snaps the new length to whole frames by moving the
// edge that plays LAST (D7), and either refuses an overlap or (ripple) pushes the later clips of the SAME track.
import { fitFades, withAudio } from './clipAudio';
import { clipDuration, withDuration } from './clipTime';
import type { Keyframe } from './keyTypes';
import { MAX_SPEED_KEYS } from './migrateSpeed';
import type { Clip, Id, Project } from './model';
import { MAX_SPEED, MIN_SPEED } from './speedTypes';
import { EPS, MIN_CLIP, TimelineError, assertFinite, assertUnlocked, findClip, hasRoom } from './timeline';

export interface RetimeOptions {
  /** Push (or pull) the later clips of the same track by the length change instead of refusing an overlap. */
  ripple?: boolean;
}

function assertRetimable(c: Clip): void {
  if (c.freeze !== undefined) throw new TimelineError('A freeze frame has no speed');
  if (c.kind !== 'video' && c.kind !== 'audio') throw new TimelineError('Only video and audio clips have a speed');
}

const clean = (c: Clip, drop: ('speed' | 'reverse' | 'speedKeys' | 'preservePitch')[]): Clip => {
  const next = { ...c };
  for (const k of drop) delete next[k];
  return next;
};

/** The frame-snapped version of `c` (its footage edge played last moved), kept inside the media. */
function snapped(p: Project, c: Clip, fps: number): Clip {
  const max = p.media[c.mediaId]?.kind === 'image' ? Infinity : (p.media[c.mediaId]?.duration ?? Infinity);
  let frames = Math.max(1, Math.round(clipDuration(c) * fps + 1e-9));
  let next = withDuration(c, frames / fps);
  const over = c.reverse === true ? next.in < -EPS : next.out > max + EPS;
  if (over) {
    const edge = c.reverse === true ? { ...next, in: 0 } : { ...next, out: max };
    frames = Math.max(1, Math.floor(clipDuration(edge) * fps + 1e-9));
    next = withDuration(c, frames / fps);
  }
  return next;
}

/**
 * Applies `edit` to each target clip (null = unchanged) and re-times the result. Targets are processed right to left on
 * their track so ripples compose. Returns the SAME project when nothing changes.
 */
function retime(p: Project, ids: Id[], opts: RetimeOptions, edit: (c: Clip) => Clip | null): Project {
  const targets = ids.map((id) => findClip(p, id));
  for (const { track, clip } of targets) {
    assertUnlocked(p, track.id);
    assertRetimable(clip);
  }
  const order = [...targets].sort((a, b) => b.clip.start - a.clip.start);
  const fps = p.format.fps;
  let cur = p;
  for (const t of order) {
    const { track, clip } = findClip(cur, t.clip.id);
    const edited = edit(clip);
    if (edited === null) continue;
    let next = snapped(cur, edited, fps);
    const oldDur = clipDuration(clip);
    const newDur = clipDuration(next);
    if (newDur < MIN_CLIP - EPS) throw new TimelineError('Clip would be too short');
    next = withAudio(next, fitFades(next.audio, newDur));
    const delta = newDur - oldDur;
    if (!opts.ripple && !hasRoom(track, next, clip.id)) throw new TimelineError('Not enough room for this speed: the clip would overlap the next clip');
    const oldEnd = clip.start + oldDur;
    cur = {
      ...cur,
      tracks: cur.tracks.map((tr) => {
        if (tr.id !== track.id) return tr;
        return {
          ...tr,
          clips: tr.clips.map((c) => {
            if (c.id === clip.id) return next;
            return opts.ripple && c.start >= oldEnd - EPS ? { ...c, start: Math.max(0, c.start + delta) } : c;
          }),
        };
      }),
    };
  }
  return cur;
}

/** Sets a constant speed (0.25..4); 1 removes the field and a ramp is replaced. */
export function setSpeed(p: Project, ids: Id[], speed: number, opts: RetimeOptions = {}): Project {
  assertFinite('speed', speed);
  if (speed < MIN_SPEED - EPS || speed > MAX_SPEED + EPS) throw new TimelineError(`Speed must be between ${MIN_SPEED}x and ${MAX_SPEED}x`);
  return retime(p, ids, opts, (c) => {
    if (c.speedKeys === undefined && (c.speed ?? 1) === speed) return null;
    const base = clean(c, ['speed', 'speedKeys']);
    return speed === 1 ? base : { ...base, speed };
  });
}

/** Plays the clip backwards (or forwards again); the length does not change. */
export function setReverse(p: Project, ids: Id[], reverse: boolean): Project {
  const targets = ids.map((id) => findClip(p, id));
  for (const { track, clip } of targets) {
    assertUnlocked(p, track.id);
    assertRetimable(clip);
  }
  if (targets.every(({ clip }) => (clip.reverse === true) === reverse)) return p;
  const set = new Set(ids);
  return {
    ...p,
    tracks: p.tracks.map((tr) => ({
      ...tr,
      clips: tr.clips.map((c) => (!set.has(c.id) || (c.reverse === true) === reverse ? c : reverse ? { ...c, reverse: true as const } : clean(c, ['reverse']))),
    })),
  };
}

/** Pitch preservation when the clip is stretched: on (default) removes the field, off stores `false`. */
export function setPreservePitch(p: Project, ids: Id[], preserve: boolean): Project {
  const targets = ids.map((id) => findClip(p, id));
  for (const { track, clip } of targets) {
    assertUnlocked(p, track.id);
    if (clip.kind !== 'video' && clip.kind !== 'audio') throw new TimelineError('Only video and audio clips have a pitch setting');
  }
  if (targets.every(({ clip }) => (clip.preservePitch === false) === !preserve)) return p;
  const set = new Set(ids);
  return {
    ...p,
    tracks: p.tracks.map((tr) => ({
      ...tr,
      clips: tr.clips.map((c) => (!set.has(c.id) || (c.preservePitch === false) === !preserve ? c : preserve ? clean(c, ['preservePitch']) : { ...c, preservePitch: false as const })),
    })),
  };
}

/** Sets (keys) or removes (null) a speed ramp; the constant speed is cleared and the length re-snapped. */
export function setRamp(p: Project, clipId: Id, keys: Keyframe[] | null, opts: RetimeOptions = {}): Project {
  if (keys !== null) {
    if (keys.length < 2) throw new TimelineError('A speed ramp needs at least two keys');
    if (keys.length > MAX_SPEED_KEYS) throw new TimelineError(`A speed ramp has at most ${MAX_SPEED_KEYS} keys`);
    for (const k of keys) {
      assertFinite('speed key', k.t, k.v);
      if (k.v < MIN_SPEED - EPS || k.v > MAX_SPEED + EPS) throw new TimelineError(`Speed must be between ${MIN_SPEED}x and ${MAX_SPEED}x`);
    }
  }
  const sorted = keys === null ? null : [...keys].sort((a, b) => a.t - b.t);
  return retime(p, [clipId], opts, (c) => {
    const base = clean(c, ['speed', 'speedKeys']);
    return sorted === null ? (c.speedKeys === undefined ? null : base) : { ...base, speedKeys: sorted };
  });
}
