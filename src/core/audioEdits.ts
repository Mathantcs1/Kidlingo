import { clampEffectParams, defaultEffectParams } from './effectParams';
import { clipDuration, newId } from './model';
import type { AudioEffect, AudioEffectType, Clip, ClipAudio, Id, Project, Track, TrackDuck } from './model';
import { TimelineError, assertUnlocked, findClip } from './timeline';

export { attachAudio, detachAudio } from './detachAudio';

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
