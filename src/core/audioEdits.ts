import { cloneEffects } from './clipAudio';
import { clampEffectParams, defaultEffectParams } from './effectParams';
import { clipDuration, defaultTransform, newId } from './model';
import type { AudioEffect, AudioEffectType, Clip, ClipAudio, Id, Project, Track, TrackDuck } from './model';
import { TimelineError, addClip, assertUnlocked, findClip, hasRoom } from './timeline';
import { MAX_TRACKS_PER_KIND, addTrack } from './tracks';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

function mapClip(p: Project, clipId: Id, fn: (c: Clip) => Clip): Project {
  const { clip } = findClip(p, clipId);
  const next = fn(clip);
  if (next === clip) return p;
  return { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? next : c)) })) };
}

function mapTrack(p: Project, trackId: Id, fn: (t: Track) => Track): Project {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) throw new TimelineError(`Track not found: ${trackId}`);
  const next = fn(track);
  return next === track ? p : { ...p, tracks: p.tracks.map((t) => (t.id === trackId ? next : t)) };
}

export function setClipAudio(
  p: Project,
  clipId: Id,
  patch: Partial<Pick<ClipAudio, 'fadeIn' | 'fadeOut' | 'pan'>>,
): Project {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  const vals = [patch.fadeIn, patch.fadeOut, patch.pan].filter((v): v is number => v !== undefined);
  if (!vals.every(Number.isFinite)) throw new TimelineError('Invalid audio setting');
  const dur = clipDuration(clip);
  let { fadeIn, fadeOut, pan } = clip.audio;
  if (patch.pan !== undefined) pan = clamp(patch.pan, -1, 1);
  if (patch.fadeIn !== undefined) fadeIn = clamp(patch.fadeIn, 0, dur);
  if (patch.fadeOut !== undefined) fadeOut = clamp(patch.fadeOut, 0, dur);
  // Shrink the fade that was NOT edited so the edited value wins.
  if (fadeIn + fadeOut > dur) {
    if (patch.fadeIn !== undefined && patch.fadeOut === undefined) fadeOut = Math.max(0, dur - fadeIn);
    else if (patch.fadeOut !== undefined && patch.fadeIn === undefined) fadeIn = Math.max(0, dur - fadeOut);
    else fadeOut = Math.max(0, dur - fadeIn);
  }
  const a = clip.audio;
  if (fadeIn === a.fadeIn && fadeOut === a.fadeOut && pan === a.pan) return p;
  return mapClip(p, clipId, (c) => ({ ...c, audio: { ...c.audio, fadeIn, fadeOut, pan } }));
}

/** Track level is mixer state, not clip editing, so it works on locked tracks. */
export function setTrackVolume(p: Project, trackId: Id, volume: number): Project {
  if (!Number.isFinite(volume)) throw new TimelineError('Invalid audio setting');
  const v = clamp(volume, 0, 2);
  return mapTrack(p, trackId, (t) => (t.volume === v ? t : { ...t, volume: v }));
}

function duckReaches(p: Project, from: Id, target: Id): boolean {
  const seen = new Set<Id>();
  for (let cur: Id | undefined = from; cur !== undefined && !seen.has(cur); ) {
    if (cur === target) return true;
    seen.add(cur);
    cur = p.tracks.find((t) => t.id === cur)?.duck?.sourceTrackId;
  }
  return false;
}

export function setTrackDuck(p: Project, trackId: Id, duck: TrackDuck | null): Project {
  if (duck === null) return mapTrack(p, trackId, (t) => (t.duck === null ? t : { ...t, duck: null }));
  if (![duck.amountDb, duck.attack, duck.release].every(Number.isFinite)) throw new TimelineError('Invalid audio setting');
  if (duck.sourceTrackId === trackId) throw new TimelineError('A track cannot duck under itself');
  if (!p.tracks.some((t) => t.id === duck.sourceTrackId)) throw new TimelineError(`Track not found: ${duck.sourceTrackId}`);
  if (duckReaches(p, duck.sourceTrackId, trackId)) throw new TimelineError('Ducking cannot form a cycle');
  const next: TrackDuck = {
    sourceTrackId: duck.sourceTrackId,
    amountDb: clamp(duck.amountDb, -40, 0),
    attack: clamp(duck.attack, 0.01, 2),
    release: clamp(duck.release, 0.01, 2),
  };
  const same = (a: TrackDuck | null): boolean =>
    !!a && a.sourceTrackId === next.sourceTrackId && a.amountDb === next.amountDb && a.attack === next.attack && a.release === next.release;
  return mapTrack(p, trackId, (t) => (same(t.duck) ? t : { ...t, duck: next }));
}

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
  const copy: Clip = {
    ...clip,
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
  return mapClip(q, clipId, (c) => ({ ...c, audio: { ...c.audio, silent: true } }));
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

export function editEffects(p: Project, clipId: Id, fn: (list: AudioEffect[]) => AudioEffect[]): Project {
  const { track } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  return mapClip(p, clipId, (c) => {
    const next = fn(c.audio.effects);
    return next === c.audio.effects ? c : { ...c, audio: { ...c.audio, effects: next } };
  });
}

function indexOfEffect(list: AudioEffect[], effectId: Id): number {
  const i = list.findIndex((e) => e.id === effectId);
  if (i < 0) throw new TimelineError(`Effect not found: ${effectId}`);
  return i;
}

export function addEffect(p: Project, clipId: Id, type: AudioEffectType): Project {
  const effect: AudioEffect = { id: newId(), type, enabled: true, params: clampEffectParams(type, defaultEffectParams(type)) };
  return editEffects(p, clipId, (list) => [...list, effect]);
}

export function updateEffect(
  p: Project,
  clipId: Id,
  effectId: Id,
  patch: { enabled?: boolean; params?: Record<string, number> },
): Project {
  return editEffects(p, clipId, (list) => {
    const i = indexOfEffect(list, effectId);
    const e = list[i];
    const params = patch.params ? clampEffectParams(e.type, { ...e.params, ...patch.params }) : e.params;
    const enabled = patch.enabled ?? e.enabled;
    const sameParams = params === e.params || JSON.stringify(params) === JSON.stringify(e.params);
    if (enabled === e.enabled && sameParams) return list;
    return list.map((x, j) => (j === i ? { ...e, enabled, params } : x));
  });
}

export function removeEffect(p: Project, clipId: Id, effectId: Id): Project {
  return editEffects(p, clipId, (list) => {
    indexOfEffect(list, effectId);
    return list.filter((e) => e.id !== effectId);
  });
}

export function moveEffect(p: Project, clipId: Id, effectId: Id, toIndex: number): Project {
  if (!Number.isFinite(toIndex)) throw new TimelineError('Invalid audio setting');
  return editEffects(p, clipId, (list) => {
    const from = indexOfEffect(list, effectId);
    const to = clamp(Math.trunc(toIndex), 0, list.length - 1);
    if (to === from) return list;
    const next = [...list];
    const [e] = next.splice(from, 1);
    next.splice(to, 0, e);
    return next;
  });
}
