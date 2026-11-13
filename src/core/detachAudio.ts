import { cloneEffects } from './clipAudio';
import { defaultTransform, newId } from './model';
import type { Clip, Id, Project, Track, TrackDuck } from './model';
import { TimelineError, addClip, assertUnlocked, findClip, hasRoom, replaceClip } from './timeline';
import { MAX_TRACKS_PER_KIND, addTrack } from './tracks';

const sameDuck = (a: TrackDuck | null, b: TrackDuck | null): boolean =>
  a === b || (!!a && !!b && a.sourceTrackId === b.sourceTrackId && a.amountDb === b.amountDb && a.attack === b.attack && a.release === b.release);

/** True when two tracks mix identically (volume, mute, solo, duck), so a clip moved between them sounds the same. */
const sameMix = (a: Track, b: Track): boolean =>
  a.volume === b.volume && a.muted === b.muted && a.solo === b.solo && sameDuck(a.duck, b.duck);

/**
 * Copies a video clip's sound onto an audio track (same start/in/out) and silences the video clip. The copy goes on
 * the first UNLOCKED audio track with free room AND the same volume/mute/solo/duck as the video track, else on a new
 * audio track (max 8) that copies those settings, so detaching never changes what is heard.
 */
export function detachAudio(p: Project, clipId: Id): Project {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  if (clip.kind !== 'video') throw new TimelineError('Only video clips have audio to detach');
  if (!p.media[clip.mediaId]?.hasAudio) throw new TimelineError('This clip has no audio');
  if (clip.audio.silent) throw new TimelineError('Audio is already detached');
  const { keys: _keys, ...sound } = clip; // the twin is sound only: no keys (Plan 5 D9), no picture effects
  const copy: Clip = {
    ...sound,
    id: newId(),
    kind: 'audio',
    transform: defaultTransform(),
    effects: [],
    blend: 'normal',
    audio: { ...clip.audio, silent: false, effects: cloneEffects(clip.audio.effects) },
  };
  let q = p;
  let target = q.tracks.find((t) => t.kind === 'audio' && !t.locked && hasRoom(t, copy) && sameMix(t, track));
  if (!target) {
    if (q.tracks.filter((t) => t.kind === 'audio').length >= MAX_TRACKS_PER_KIND) {
      throw new TimelineError('Cannot add another audio track');
    }
    q = addTrack(q, 'audio');
    const fresh = q.tracks[q.tracks.length - 1];
    target = { ...fresh, volume: track.volume, muted: track.muted, solo: track.solo, duck: track.duck && { ...track.duck } };
    q = { ...q, tracks: q.tracks.map((t) => (t.id === fresh.id ? (target as Track) : t)) };
  }
  q = addClip(q, target.id, copy);
  const cur = findClip(q, clipId).clip;
  return replaceClip(q, clipId, { ...cur, audio: { ...cur.audio, silent: true } });
}

/** Undoes detachAudio: un-silences the video clip and removes the audio clip. */
export function attachAudio(p: Project, videoClipId: Id, audioClipId: Id): Project {
  const { track: vt, clip: video } = findClip(p, videoClipId);
  const { track: at, clip: audio } = findClip(p, audioClipId);
  if (audio.kind !== 'audio' || video.kind !== 'video') throw new TimelineError('Not a video/audio clip pair');
  if (audio.mediaId !== video.mediaId) throw new TimelineError('Clips come from different media');
  assertUnlocked(p, vt.id);
  assertUnlocked(p, at.id);
  return {
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips
        .filter((c) => c.id !== audioClipId)
        .map((c) => (c.id === videoClipId ? { ...c, audio: { ...c.audio, silent: false } } : c)),
    })),
  };
}
