import type { Clip, Id, MediaRef, Project } from './model';
import { findClip } from './timeline';

/** True for clips that make sound on their own: audio clips and videos whose media has an audio stream. */
export function isAudioCapable(clip: Clip, media: MediaRef | undefined): boolean {
  return clip.kind === 'audio' || (clip.kind === 'video' && media?.hasAudio !== false);
}

/** Pan −1..1 as a short label: "C", "L40", "R100". */
export function formatPan(pan: number): string {
  const n = Math.round(Math.max(-1, Math.min(1, pan)) * 100);
  return n === 0 ? 'C' : n < 0 ? `L${-n}` : `R${n}`;
}

const sameEffects = (a: Clip['audio']['effects'], b: Clip['audio']['effects']): boolean =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i];
    const kx = Object.keys(x.params);
    return x.type === y.type && x.enabled === y.enabled && kx.length === Object.keys(y.params).length && kx.every((k) => x.params[k] === y.params[k]);
  });

/**
 * True when `c` still has the sound settings detachAudio copied from the video clip: same volume, fades, pan and
 * effects (type, order, enabled, params; ids differ). `silent` is ignored (the video clip is silent by then).
 */
function isUneditedTwin(c: Clip, video: Clip): boolean {
  const a = c.audio;
  const v = video.audio;
  return a.fadeIn === v.fadeIn && a.fadeOut === v.fadeOut && a.pan === v.pan && !a.silent && c.volume === video.volume && sameEffects(a.effects, v.effects);
}

/**
 * The audio clip created by detaching `videoClipId`'s sound: the ONLY audio clip of the same media with identical
 * start/in/out, and still unedited (same fades/pan/effects/volume as the video clip's own audio settings). Null when the clip is not a detached
 * video, no such clip exists, several match, or the match was edited (Attach back would delete that work).
 */
export function findDetachedTwin(p: Project, videoClipId: Id): Clip | null {
  let video: Clip;
  try {
    video = findClip(p, videoClipId).clip;
  } catch {
    return null;
  }
  if (video.kind !== 'video' || !video.audio.silent) return null;
  const matches = p.tracks
    .filter((t) => t.kind === 'audio')
    .flatMap((t) => t.clips)
    .filter((c) => c.kind === 'audio' && c.mediaId === video.mediaId && c.start === video.start && c.in === video.in && c.out === video.out);
  return matches.length === 1 && isUneditedTwin(matches[0], video) ? matches[0] : null;
}

/** Why "Detach audio" is unavailable for the selection (shown as its tooltip), or null when it applies. */
export function detachDisabledReason(p: Project, selection: readonly Id[]): string | null {
  if (selection.length !== 1) return 'Select a single clip';
  let found;
  try {
    found = findClip(p, selection[0]);
  } catch {
    return 'Select a single clip';
  }
  const { track, clip } = found;
  if (clip.kind === 'image') return 'Images have no sound';
  if (clip.kind !== 'video') return 'Only video clips have audio to detach';
  if (p.media[clip.mediaId]?.hasAudio !== true) return 'This clip has no audio';
  if (clip.audio.silent) return 'Audio is already detached';
  if (track.locked) return 'Track is locked';
  return null;
}

/** Whether "Detach audio" applies to the selection. */
export function canDetach(p: Project, selection: readonly Id[]): boolean {
  return detachDisabledReason(p, selection) === null;
}
