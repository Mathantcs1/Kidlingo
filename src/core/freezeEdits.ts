// Freeze frame (Plan 5D Task 4): splits the clip at `t` and inserts a still of the frame shown there, `hold` seconds long,
// pushing the later clips of the SAME track later by `hold`. The still carries the picture as drawn at `t` (keys and
// presets resolved to their values); it is silent and has its own timeline (`in` 0, `out` hold).
import { resolveClip } from './animate';
import { splitClip } from './clipEdits';
import { clipEnd, videoSourceTime } from './clipTime';
import { newId } from './model';
import type { Clip, Id, Project } from './model';
import { EPS, MIN_CLIP, TimelineError, assertFinite, assertUnlocked, findClip, mapClips } from './timeline';

export const DEFAULT_FREEZE_HOLD = 2;

export function freezeFrame(p: Project, clipId: Id, t: number, hold = DEFAULT_FREEZE_HOLD): Project {
  assertFinite('freeze time', t, hold);
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  if (clip.kind !== 'video' || clip.freeze !== undefined) throw new TimelineError('Only video clips can be frozen');
  if (hold < MIN_CLIP - EPS) throw new TimelineError('Freeze is too short');
  const start = clip.start;
  const end = clipEnd(clip);
  if (t < start - EPS || t > end + EPS) throw new TimelineError('Freeze time is outside the clip');
  // The footage of the FRAME shown at `t` (a reversed clip samples mid-frame, D11); a freeze at the very end holds the last frame shown.
  const fps = p.format.fps;
  const last = Math.max(start, end - 1 / fps);
  const shown = Math.min(Math.max(t, start), last);
  const at = videoSourceTime(clip, start + Math.floor((shown - start) * fps + 1e-6) / fps, fps);
  const { speed: _s, reverse: _r, speedKeys: _k, preservePitch: _pp, ...drawn } = resolveClip(clip, t, p.format);
  const still: Clip = { ...drawn, id: newId(), freeze: { at }, in: 0, out: hold, audio: { ...drawn.audio, silent: true, fadeIn: 0, fadeOut: 0 } };
  // Near an edge there is nothing worth splitting off: insert before or after the clip.
  const edge = t <= start + MIN_CLIP - EPS || t >= end - MIN_CLIP + EPS;
  const insertAt = !edge ? t : t <= start + MIN_CLIP - EPS ? start : end;
  const base = edge ? p : splitClip(p, clipId, t);
  return mapClips(base, (tr) =>
    tr.id !== track.id ? tr.clips : [...tr.clips.map((c) => (c.start >= insertAt - EPS ? { ...c, start: c.start + hold } : c)), { ...still, start: insertAt }],
  );
}
