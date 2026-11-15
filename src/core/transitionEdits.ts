// Add / remove / set transitions (Plan 5C D2-D5): pure (Project, ...) => Project, refusals are TimelineErrors, no-ops return
// the SAME project. Locked tracks refuse every edit.
import { clipEnd } from './clipTime';
import type { Ease } from './easing';
import { newId } from './model';
import type { Clip, Id, Project, Track } from './model';
import { easeAllowed, maxDuration, pairAllowed, snapDuration } from './transitions';
import { withTransitions } from './transitionReconcile';
import { DEFAULT_TRANSITION_SECONDS, MIN_TRANSITION_FRAMES, NOT_ENOUGH_FOOTAGE } from './transitionTypes';
import type { CrossfadeLaw, Transition, TransitionDirection, TransitionType } from './transitionTypes';
import { TimelineError, assertUnlocked } from './timeline';

export interface TransitionSpec {
  type: TransitionType;
  duration?: number;
  ease?: Ease;
  direction?: TransitionDirection;
  softness?: number;
  amount?: number;
  audio?: CrossfadeLaw;
}

/** The ease a type starts with (D5). */
export const defaultEase = (type: TransitionType): Ease => ({ kind: type === 'wipe' || type === 'slide' || type === 'push' || type === 'zoom' ? 'easeInOut' : 'linear' });

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const finiteOr = (v: number | undefined, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The type-specific fields, filled with defaults for the type and clamped; fields the type does not use are dropped. */
function typed(base: Transition, spec: Partial<TransitionSpec>): Transition {
  const { direction: _d, softness: _s, amount: _a, ...core } = base;
  const t = core as Transition;
  if (t.type === 'wipe' || t.type === 'slide' || t.type === 'push') t.direction = spec.direction ?? base.direction ?? 'left';
  if (t.type === 'wipe') t.softness = clamp(finiteOr(spec.softness ?? base.softness, 0.05), 0, 0.5);
  if (t.type === 'zoom') t.amount = clamp(finiteOr(spec.amount ?? base.amount, 2), 1.2, 4);
  if (t.type === 'glitch') t.amount = clamp(finiteOr(spec.amount ?? base.amount, 0.5), 0, 1);
  const law = spec.audio ?? base.audio;
  if (law === 'power' || law === 'gain') t.audio = law;
  else delete t.audio;
  return t;
}

function locate(p: Project, id: Id): { track: Track; tr: Transition } {
  for (const track of p.tracks) {
    const tr = track.transitions?.find((x) => x.id === id);
    if (tr) return { track, tr };
  }
  throw new TimelineError(`Transition not found: ${id}`);
}

function otherDurations(track: Track, from: Clip, to: Clip, except?: Id): { fromIn?: number; toOut?: number } {
  const list = (track.transitions ?? []).filter((o) => o.id !== except);
  return { fromIn: list.find((o) => o.toClipId === from.id)?.duration, toOut: list.find((o) => o.fromClipId === to.id)?.duration };
}

/** Whole even frames within what the cut allows, or a refusal when under the 2-frame floor. */
function fitDuration(p: Project, track: Track, from: Clip, to: Clip, want: number, except?: Id): number {
  const limit = maxDuration(p, from, to, otherDurations(track, from, to, except));
  const d = snapDuration(Math.min(want, limit), p.format.fps);
  if (d * p.format.fps < MIN_TRANSITION_FRAMES - 1e-6) throw new TimelineError(NOT_ENOUGH_FOOTAGE);
  return d;
}

/** Adds a transition on the cut between two adjacent clips of `trackId`; a longer wish is shortened to the handles (rounded down to even frames). */
export function addTransition(p: Project, trackId: Id, fromClipId: Id, toClipId: Id, spec: TransitionSpec): Project {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) throw new TimelineError(`Track not found: ${trackId}`);
  assertUnlocked(p, trackId);
  const from = track.clips.find((c) => c.id === fromClipId);
  const to = track.clips.find((c) => c.id === toClipId);
  if (!from || !to) throw new TimelineError('Both clips must be on this track');
  if (Math.abs(clipEnd(from) - to.start) > 1e-9) throw new TimelineError('The clips do not meet');
  if (!pairAllowed(track, spec, from, to)) throw new TimelineError(from.kind === 'adjustment' || to.kind === 'adjustment' ? 'Adjustment layers cannot have transitions' : 'This transition does not fit these clips');
  if ((track.transitions ?? []).some((t) => t.fromClipId === fromClipId && t.toClipId === toClipId)) throw new TimelineError('This cut already has a transition');
  const ease = spec.ease ?? defaultEase(spec.type);
  if (!easeAllowed({ ease })) throw new TimelineError('This ease is not available for transitions');
  const duration = fitDuration(p, track, from, to, spec.duration ?? DEFAULT_TRANSITION_SECONDS);
  const tr = typed({ id: newId(), fromClipId, toClipId, type: spec.type, duration, ease }, spec);
  return { ...p, tracks: p.tracks.map((t) => (t.id === trackId ? withTransitions(t, [...(t.transitions ?? []), tr].sort((a, b) => cutTime(t, a) - cutTime(t, b))) : t)) };
}

const cutTime = (t: Track, tr: Transition): number => t.clips.find((c) => c.id === tr.toClipId)?.start ?? 0;

export function removeTransition(p: Project, id: Id): Project {
  const { track } = locate(p, id);
  assertUnlocked(p, track.id);
  return { ...p, tracks: p.tracks.map((t) => (t.id === track.id ? withTransitions(t, (t.transitions ?? []).filter((x) => x.id !== id)) : t)) };
}

/** Changes type, ease, direction, softness, amount or the audio law; the same project when nothing changes. */
export function setTransition(p: Project, id: Id, patch: Partial<Omit<TransitionSpec, 'duration'>>): Project {
  const { track, tr } = locate(p, id);
  assertUnlocked(p, track.id);
  const from = track.clips.find((c) => c.id === tr.fromClipId);
  const to = track.clips.find((c) => c.id === tr.toClipId);
  const type = patch.type ?? tr.type;
  if (!pairAllowed(track, { type }, from, to)) throw new TimelineError('This transition does not fit these clips');
  const ease = patch.ease ?? (patch.type && patch.type !== tr.type ? defaultEase(type) : tr.ease);
  if (!easeAllowed({ ease })) throw new TimelineError('This ease is not available for transitions');
  const next = typed({ ...tr, type, ease }, patch);
  if (JSON.stringify(next) === JSON.stringify(tr)) return p;
  return replace(p, track.id, next);
}

/** Sets the duration (whole even frames, shortened to what the handles and clip lengths allow); refused under 2 frames. */
export function setTransitionDuration(p: Project, id: Id, seconds: number): Project {
  const { track, tr } = locate(p, id);
  assertUnlocked(p, track.id);
  if (!Number.isFinite(seconds)) throw new TimelineError('Duration must be a number');
  const from = track.clips.find((c) => c.id === tr.fromClipId) as Clip;
  const to = track.clips.find((c) => c.id === tr.toClipId) as Clip;
  const duration = fitDuration(p, track, from, to, seconds, id);
  if (Math.abs(duration - tr.duration) < 1e-9) return p;
  return replace(p, track.id, { ...tr, duration });
}

function replace(p: Project, trackId: Id, next: Transition): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, transitions: (t.transitions ?? []).map((x) => (x.id === next.id ? next : x)) } : t)) };
}
