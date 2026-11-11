import { fitFades } from './clipAudio';
import { toBlend, toClipEffects } from './migrateEffects';
import { toOverlaySpec } from './overlaySpec';
import { defaultClipAudio, newId } from './model';
import type { AudioEffect, AudioEffectType, Clip, ClipAudio, Project, Track, TrackDuck } from './model';

export type MigrateResult = { ok: true; project: Project } | { ok: false; reason: 'newer' | 'malformed' };

const CURRENT = 5;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const EFFECT_TYPES: readonly AudioEffectType[] = [
  'eq', 'highpass', 'lowpass', 'compressor', 'reverb', 'echo', 'pitch', 'denoise', 'gain',
];

function toEffect(raw: unknown): AudioEffect | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !EFFECT_TYPES.includes(raw.type as AudioEffectType)) return null;
  if (typeof raw.enabled !== 'boolean' || !isObject(raw.params)) return null;
  const params: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.params)) if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
  return { ...raw, id: raw.id, type: raw.type as AudioEffectType, enabled: raw.enabled, params };
}

/** Later effects that reuse an id get a new one (the first keeps it), so ids stay unique within a clip. */
function uniqueEffectIds(list: AudioEffect[]): AudioEffect[] {
  const seen = new Set<string>();
  return list.map((e) => {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      return e;
    }
    const id = newId();
    seen.add(id);
    return { ...e, id };
  });
}

/** Repairs per field: clamps or defaults, drops invalid effects; never rejects. `duration` (out - in) trims fades. */
function toClipAudio(raw: unknown, duration: number | null): ClipAudio {
  const d = defaultClipAudio();
  if (!isObject(raw)) return d;
  const audio: ClipAudio = {
    ...raw,
    fadeIn: num(raw.fadeIn, d.fadeIn, 0, Infinity),
    fadeOut: num(raw.fadeOut, d.fadeOut, 0, Infinity),
    pan: num(raw.pan, d.pan, -1, 1),
    silent: raw.silent === true,
    effects: Array.isArray(raw.effects) ? uniqueEffectIds(raw.effects.map(toEffect).filter((e): e is AudioEffect => e !== null)) : [],
  };
  return duration === null ? audio : fitFades(audio, duration);
}

const clipSeconds = (c: Record<string, unknown>): number | null =>
  typeof c.in === 'number' && typeof c.out === 'number' && Number.isFinite(c.in) && Number.isFinite(c.out) && c.out >= c.in ? c.out - c.in : null;

function toDuck(raw: unknown): TrackDuck | null {
  if (!isObject(raw) || typeof raw.sourceTrackId !== 'string') return null;
  return {
    ...raw,
    sourceTrackId: raw.sourceTrackId,
    amountDb: num(raw.amountDb, -12, -40, 0),
    attack: num(raw.attack, 0.05, 0.01, 2),
    release: num(raw.release, 0.3, 0.01, 2),
  };
}

/**
 * One clip with its v2-v5 fields repaired. An overlay clip (v5) gets no media, effects, blend or fit (it keeps its
 * audio settings as stored); one whose spec cannot be understood, or that sits on an audio track, is dropped (null).
 */
function toClip(c: Record<string, unknown>, trackKind: Track['kind']): Clip | null {
  const isAudio = c.kind === 'audio';
  const audio = toClipAudio(c.audio, clipSeconds(c));
  if (c.kind !== 'overlay') {
    return { ...c, audio, effects: toClipEffects(c.effects, isAudio), blend: toBlend(c.blend, isAudio) } as unknown as Clip;
  }
  const overlay = toOverlaySpec(c.overlay);
  if (!overlay || trackKind !== 'video') return null;
  return { ...c, mediaId: '', audio, effects: [], blend: 'normal', fit: 'fit', overlay } as unknown as Clip;
}

/** Validates a track's outline and fills/repairs the v2-v5 fields. Clips only need to be objects. */
function toTrack(raw: unknown): Track | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || (raw.kind !== 'video' && raw.kind !== 'audio')) return null;
  if (!Array.isArray(raw.clips) || !raw.clips.every(isObject)) return null;
  return {
    ...raw,
    id: raw.id,
    kind: raw.kind,
    name: typeof raw.name === 'string' ? raw.name : '',
    hidden: raw.hidden === true,
    muted: raw.muted === true,
    solo: raw.solo === true,
    locked: raw.locked === true,
    volume: num(raw.volume, 1, 0, 2),
    duck: toDuck(raw.duck),
    clips: raw.clips.map((c) => toClip(c, raw.kind as Track['kind'])).filter((c): c is Clip => c !== null),
  };
}

/**
 * Pure and idempotent: never mutates `raw`. v1/v2 gain defaults; v3-v5 are repaired per field (v4 → v5 adds nothing:
 * overlay clips are new in v5); newer versions are refused.
 */
export function migrateProject(raw: unknown): MigrateResult {
  if (!isObject(raw)) return { ok: false, reason: 'malformed' };
  const { version } = raw;
  if (typeof version === 'number' && version > CURRENT) return { ok: false, reason: 'newer' };
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== CURRENT) return { ok: false, reason: 'malformed' };
  if (!isObject(raw.format) || !Array.isArray(raw.tracks) || !isObject(raw.media)) return { ok: false, reason: 'malformed' };
  const tracks: Track[] = [];
  for (const t of raw.tracks) {
    const track = toTrack(t);
    if (!track) return { ok: false, reason: 'malformed' };
    tracks.push(track);
  }
  // '' is the overlay clips' "no media" id, so a media entry under it is corrupt: dropped.
  const { '': _noMedia, ...media } = raw.media;
  const project = { ...raw, version: CURRENT, tracks, media } as unknown as Project;
  return { ok: true, project };
}
