// Pure edits for voice-over recordings: naming the take and placing it on the timeline.
import type { Id, MediaRef, Project, Track } from '../core/model';
import { addClip, hasRoom } from '../core/timeline';
import { addTrack } from '../core/tracks';
import { clipFromMedia } from '../media/clip';
import { addMedia } from './edits';

const PREFIX = 'Voice-over ';

function numberedName(p: Project, prefix: string): string {
  const used = new Set(Object.values(p.media).map((m) => m.name));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** "Voice-over N" with the lowest N ≥ 1 not already used by a media name. */
export const voiceOverName = (p: Project): string => numberedName(p, PREFIX);

/** "AI voice N" with the lowest N ≥ 1 not already used by a media name. */
export const aiVoiceName = (p: Project): string => numberedName(p, 'AI voice ');

/**
 * Registers the new audio media (a recording or generated speech) `m` and places it as a full-length clip at `start` (where recording began): on the
 * active track when it is an audio track, else on the first audio track; when that track is locked, missing or the
 * take would overlap a clip there, on a new audio track at the end. One edit, so one undo step. Throws
 * TimelineError when no track can be added.
 */
export function placeAudioMedia(p: Project, m: MediaRef, start: number, activeTrackId: Id | null): Project {
  const withMedia = addMedia(p, m);
  const audio = withMedia.tracks.filter((t) => t.kind === 'audio');
  const fresh = (trackId: Id) => clipFromMedia(m, trackId, start, p.format);
  const fits = (t: Track) => !t.locked && hasRoom(t, fresh(t.id));
  const active = audio.find((t) => t.id === activeTrackId);
  const target = active && fits(active) ? active : audio.find(fits);
  if (target) return addClip(withMedia, target.id, fresh(target.id));
  const grown = addTrack(withMedia, 'audio');
  const track = grown.tracks[grown.tracks.length - 1];
  return addClip(grown, track.id, fresh(track.id));
}

/** A recorded take is placed like any generated audio. */
export const placeRecording = placeAudioMedia;
