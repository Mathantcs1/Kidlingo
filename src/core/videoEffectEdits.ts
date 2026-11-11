// Pure edits of a clip's picture effect stack and blend mode. Locked tracks refuse; no-ops return the same project.
import { LOOKS } from './looks';
import type { LookKey } from './looks';
import { newId } from './model';
import type { BlendMode, Clip, Id, Project, VideoEffect, VideoEffectType } from './model';
import { TimelineError, assertUnlocked, findClip } from './timeline';
import { BLEND_MODES, MAX_VIDEO_EFFECTS, clampParams, defaultParams, isVideoEffectType } from './videoEffects';

/** Finds a video/image clip on an unlocked track; audio clips have no picture. */
function pictureClip(p: Project, clipId: Id): Clip {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  if (clip.kind === 'audio') throw new TimelineError('Audio clips have no picture to apply effects to');
  return clip;
}

function withClip(p: Project, clipId: Id, fn: (c: Clip) => Clip): Project {
  return { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? fn(c) : c)) })) };
}

const withEffects = (p: Project, clipId: Id, effects: VideoEffect[]): Project =>
  withClip(p, clipId, (c) => ({ ...c, effects }));

function find(clip: Clip, effectId: Id): number {
  const i = clip.effects.findIndex((e) => e.id === effectId);
  if (i < 0) throw new TimelineError(`Effect not found: ${effectId}`);
  return i;
}

export function addVideoEffect(p: Project, clipId: Id, type: VideoEffectType, ref?: Id): Project {
  const clip = pictureClip(p, clipId);
  if (!isVideoEffectType(type)) throw new TimelineError(`Unknown effect: ${type}`);
  if (clip.effects.length >= MAX_VIDEO_EFFECTS) throw new TimelineError(`At most ${MAX_VIDEO_EFFECTS} effects per clip`);
  const effect: VideoEffect = { id: newId(), type, enabled: true, params: defaultParams(type) };
  if (type === 'lut') {
    if (ref === undefined || p.media[ref]?.kind !== 'lut') throw new TimelineError('Choose a LUT file for this effect');
    effect.ref = ref;
  }
  return withEffects(p, clipId, [...clip.effects, effect]);
}

export function updateVideoEffect(
  p: Project,
  clipId: Id,
  effectId: Id,
  patch: { enabled?: boolean; params?: Record<string, number> },
): Project {
  const clip = pictureClip(p, clipId);
  const i = find(clip, effectId);
  const cur = clip.effects[i];
  if (patch.params && !Object.values(patch.params).every(Number.isFinite)) throw new TimelineError('Invalid effect setting');
  const params = patch.params ? clampParams(cur.type, { ...cur.params, ...patch.params }) : cur.params;
  const enabled = patch.enabled ?? cur.enabled;
  const same = enabled === cur.enabled && Object.keys(params).every((k) => params[k] === cur.params[k]);
  if (same) return p;
  const next = { ...cur, enabled, params };
  return withEffects(p, clipId, clip.effects.map((e, j) => (j === i ? next : e)));
}

export function removeVideoEffect(p: Project, clipId: Id, effectId: Id): Project {
  const clip = pictureClip(p, clipId);
  find(clip, effectId);
  return withEffects(p, clipId, clip.effects.filter((e) => e.id !== effectId));
}

/** Moves the effect to `toIndex` (clamped to the stack). */
export function moveVideoEffect(p: Project, clipId: Id, effectId: Id, toIndex: number): Project {
  const clip = pictureClip(p, clipId);
  const from = find(clip, effectId);
  if (!Number.isFinite(toIndex)) throw new TimelineError('Invalid effect position');
  const to = Math.min(clip.effects.length - 1, Math.max(0, Math.trunc(toIndex)));
  if (to === from) return p;
  const list = clip.effects.filter((e) => e.id !== effectId);
  list.splice(to, 0, clip.effects[from]);
  return withEffects(p, clipId, list);
}

const sameShape = (a: VideoEffect[], b: Omit<VideoEffect, 'id'>[]): boolean =>
  a.length === b.length &&
  a.every((e, i) =>
    e.type === b[i].type && e.enabled === b[i].enabled && e.ref === b[i].ref &&
    Object.keys(e.params).every((k) => e.params[k] === b[i].params[k]));

/** Replaces the whole stack with the look's effects (fresh ids, params filled and clamped) in ONE edit. */
export function applyLook(p: Project, clipId: Id, lookKey: LookKey): Project {
  const clip = pictureClip(p, clipId);
  const look = Object.hasOwn(LOOKS, lookKey) ? LOOKS[lookKey] : undefined;
  if (!look) throw new TimelineError(`Unknown look: ${lookKey}`);
  const effects = look.effects.map((e) => ({ ...e, params: clampParams(e.type, e.params) }));
  if (sameShape(clip.effects, effects)) return p;
  return withEffects(p, clipId, effects.map((e) => ({ ...e, id: newId() })));
}

export function setClipBlend(p: Project, clipId: Id, mode: BlendMode): Project {
  const clip = pictureClip(p, clipId);
  if (!BLEND_MODES.includes(mode)) throw new TimelineError(`Unknown blend mode: ${mode}`);
  return clip.blend === mode ? p : withClip(p, clipId, (c) => ({ ...c, blend: mode }));
}
