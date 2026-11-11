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

/** True when `c` still has the settings detachAudio gives its copy (no fades, centre pan, no effects, same volume). */
function isUneditedTwin(c: Clip, video: Clip): boolean {
  const a = c.audio;
  return a.fadeIn === 0 && a.fadeOut === 0 && a.pan === 0 && !a.silent && a.effects.length === 0 && c.volume === video.volume;
}

/**
 * The audio clip created by detaching `videoClipId`'s sound: the ONLY audio clip of the same media with identical
 * start/in/out, and still unedited (default fades/pan/effects, same volume). Null when the clip is not a detached
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
