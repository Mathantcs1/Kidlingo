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

/**
 * The audio clip created by detaching `videoClipId`'s sound: a clip of the same media with identical start/in/out
 * on any audio track. Null when the clip is not a detached video or no such twin exists.
 */
export function findDetachedTwin(p: Project, videoClipId: Id): Clip | null {
  let video: Clip;
  try {
    video = findClip(p, videoClipId).clip;
  } catch {
    return null;
  }
  if (video.kind !== 'video' || !video.audio.silent) return null;
  for (const t of p.tracks) {
    if (t.kind !== 'audio') continue;
    const twin = t.clips.find(
      (c) => c.kind === 'audio' && c.mediaId === video.mediaId && c.start === video.start && c.in === video.in && c.out === video.out,
    );
    if (twin) return twin;
  }
  return null;
}

/** Whether "Detach audio" applies to the selection: one unlocked video clip with sound that is not yet detached. */
export function canDetach(p: Project, selection: readonly Id[]): boolean {
  if (selection.length !== 1) return false;
  try {
    const { track, clip } = findClip(p, selection[0]);
    return clip.kind === 'video' && !track.locked && !clip.audio.silent && p.media[clip.mediaId]?.hasAudio === true;
  } catch {
    return false;
  }
}
