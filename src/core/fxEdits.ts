// Pure visual-effect edits: (Project, …) => Project; refusals throw TimelineError; no-ops return the same project.
import { cloneFx } from './clipFx';
import { FX_TYPES, newId } from './model';
import type { Clip, FxType, Id, LutRef, Project, VisualEffect } from './model';
import { TimelineError, assertUnlocked, findClip } from './timeline';
import { LOOK_KEYS } from '../fx/looks';
import type { LookKey } from '../fx/looks';
import { MAX_FX_PER_CLIP, clampFxParams, defaultFxParams } from '../fx/params';

/** Finds a picture clip on an unlocked track and replaces its stack with `fn(stack)` (same project when unchanged). */
function mapFx(p: Project, clipId: Id, fn: (fx: VisualEffect[], clip: Clip) => VisualEffect[]): Project {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  if (clip.kind === 'audio') throw new TimelineError('Audio clips have no picture to add effects to');
  const next = fn(clip.fx, clip);
  if (next === clip.fx) return p;
  if (next.length > MAX_FX_PER_CLIP) throw new TimelineError(`A clip can have at most ${MAX_FX_PER_CLIP} effects`);
  return { ...p, tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, fx: next } : c)) } : t)) };
}

function indexOfFx(fx: VisualEffect[], fxId: Id): number {
  const i = fx.findIndex((e) => e.id === fxId);
  if (i < 0) throw new TimelineError('Effect not found');
  return i;
}

export function addFx(p: Project, clipId: Id, type: FxType): Project {
  if (!FX_TYPES.includes(type)) throw new TimelineError(`Unknown effect: ${type}`);
  return mapFx(p, clipId, (fx) => [...fx, { id: newId(), type, enabled: true, params: defaultFxParams(type) }]);
}

export function updateFx(p: Project, clipId: Id, fxId: Id, patch: { enabled?: boolean; params?: Record<string, number>; ref?: Id }): Project {
  return mapFx(p, clipId, (fx) => {
    const i = indexOfFx(fx, fxId);
    const cur = fx[i];
    const params = patch.params ? clampFxParams(cur.type, { ...cur.params, ...patch.params }) : cur.params;
    const sameParams = params === cur.params || Object.keys(params).every((k) => params[k] === cur.params[k]);
    const enabled = patch.enabled ?? cur.enabled;
    const ref = cur.type === 'lut' && patch.ref !== undefined ? patch.ref : cur.ref;
    if (sameParams && enabled === cur.enabled && ref === cur.ref) return fx;
    const next: VisualEffect = { ...cur, params: sameParams ? cur.params : params, enabled };
    if (ref !== undefined) next.ref = ref;
    return fx.map((e, k) => (k === i ? next : e));
  });
}

export function removeFx(p: Project, clipId: Id, fxId: Id): Project {
  return mapFx(p, clipId, (fx) => {
    indexOfFx(fx, fxId);
    return fx.filter((e) => e.id !== fxId);
  });
}

export function moveFx(p: Project, clipId: Id, fxId: Id, toIndex: number): Project {
  if (!Number.isFinite(toIndex)) throw new TimelineError('Invalid effect position');
  return mapFx(p, clipId, (fx) => {
    const from = indexOfFx(fx, fxId);
    const to = Math.min(fx.length - 1, Math.max(0, Math.round(toIndex)));
    if (to === from) return fx;
    const next = fx.filter((e) => e.id !== fxId);
    next.splice(to, 0, fx[from]);
    return next;
  });
}

/** Replaces the whole stack (paste): copies get new ids and clamped params; entries with unknown types are refused. */
export function setFxStack(p: Project, clipId: Id, stack: VisualEffect[]): Project {
  if (stack.length > MAX_FX_PER_CLIP) throw new TimelineError(`A clip can have at most ${MAX_FX_PER_CLIP} effects`);
  if (stack.some((e) => !FX_TYPES.includes(e.type))) throw new TimelineError('Unknown effect in the stack');
  return mapFx(p, clipId, () => cloneFx(stack).map((e) => ({ ...e, params: clampFxParams(e.type, e.params) })));
}

/** Sets the clip's one `look` effect (adding it if missing) so re-applying never stacks looks. */
export function applyLook(p: Project, clipId: Id, key: LookKey, intensity = 1): Project {
  const preset = LOOK_KEYS.indexOf(key);
  if (preset < 0) throw new TimelineError(`Unknown look: ${key}`);
  const params = clampFxParams('look', { preset, intensity });
  return mapFx(p, clipId, (fx) => {
    const i = fx.findIndex((e) => e.type === 'look');
    if (i < 0) return [...fx, { id: newId(), type: 'look', enabled: true, params }];
    const cur = fx[i];
    if (cur.enabled && cur.params.preset === params.preset && cur.params.intensity === params.intensity) return fx;
    return fx.map((e, k) => (k === i ? { ...e, enabled: true, params } : e));
  });
}

export function addLut(p: Project, ref: LutRef): Project {
  const cur = p.luts[ref.id];
  if (cur && cur.name === ref.name && cur.size === ref.size && cur.missing === ref.missing) return p;
  return { ...p, luts: { ...p.luts, [ref.id]: ref } };
}

/** Refuses while any clip's effect (enabled or not) references the LUT; unknown ids are a no-op. */
export function removeLut(p: Project, id: Id): Project {
  if (!p.luts[id]) return p;
  if (p.tracks.some((t) => t.clips.some((c) => c.fx.some((e) => e.ref === id)))) throw new TimelineError('This LUT is used by a clip');
  const { [id]: _gone, ...rest } = p.luts;
  return { ...p, luts: rest };
}
