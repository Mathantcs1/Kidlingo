// Repairs hand-edited transitions when a save is opened (Plan 5C §8, data v10; v9 -> v10 adds nothing). Each entry is
// rebuilt field by field (unknown fields kept), then the shared reconcile rules drop what does not fit the clips (not
// adjacent, wrong kinds, no handle, duplicates) and clamp the durations to handles and clip lengths. Pure, idempotent.
import { repairEase } from './easing';
import type { Ease } from './easing';
import { newId } from './model';
import type { Project, Track } from './model';
import { reconcileTransitions, withTransitions } from './transitionReconcile';
import { MAX_TRANSITION_SECONDS, MIN_TRANSITION_FRAMES, TRANSITION_DIRECTIONS, TRANSITION_EASES, TRANSITION_TYPES } from './transitionTypes';
import type { CrossfadeLaw, Transition, TransitionDirection, TransitionType } from './transitionTypes';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The ease within the allowed subset (D5): anything else is linear, a bezier keeps its y values inside [0, 1]. */
function repairTransitionEase(raw: unknown): Ease {
  const e = repairEase(raw);
  if (!TRANSITION_EASES.includes(e.kind)) return { kind: 'linear' };
  if (e.kind === 'bezier' && e.bezier) return { kind: 'bezier', bezier: [e.bezier[0], clamp(e.bezier[1], 0, 1), e.bezier[2], clamp(e.bezier[3], 0, 1)] };
  return e;
}

function repairEntry(raw: unknown, fps: number): Transition | null {
  if (!isObject(raw)) return null;
  const { id, fromClipId, toClipId, type, duration } = raw;
  if (typeof id !== 'string' || typeof fromClipId !== 'string' || typeof toClipId !== 'string') return null;
  if (!TRANSITION_TYPES.includes(type as TransitionType) || !finite(duration)) return null;
  const t = type as TransitionType;
  // Type-specific fields: kept (repaired) for the types that use them, dropped for the others.
  const { direction: _d, softness: _s, amount: _a, audio: _au, ...rest } = raw;
  const out: Transition = {
    ...rest,
    id, fromClipId, toClipId, type: t,
    duration: clamp(duration, MIN_TRANSITION_FRAMES / fps, MAX_TRANSITION_SECONDS),
    ease: repairTransitionEase(raw.ease),
  };
  if (t === 'wipe' || t === 'slide' || t === 'push') out.direction = TRANSITION_DIRECTIONS.includes(raw.direction as TransitionDirection) ? (raw.direction as TransitionDirection) : 'left';
  if (t === 'wipe') out.softness = finite(raw.softness) ? clamp(raw.softness, 0, 0.5) : 0.05;
  if (t === 'zoom') out.amount = finite(raw.amount) ? clamp(raw.amount, 1.2, 4) : 2;
  if (t === 'glitch') out.amount = finite(raw.amount) ? clamp(raw.amount, 0, 1) : 0.5;
  if (raw.audio === 'power' || raw.audio === 'gain') out.audio = raw.audio as CrossfadeLaw;
  return out;
}

function repairTrack(track: Track, fps: number): Track {
  const raw: unknown = track.transitions;
  if (raw === undefined) return track;
  if (!Array.isArray(raw)) return withTransitions(track, []);
  const seen = new Set<string>();
  const entries: Transition[] = [];
  for (const r of raw) {
    const e = repairEntry(r, fps);
    if (!e) continue;
    entries.push(seen.has(e.id) ? { ...e, id: newId() } : e);
    seen.add(entries[entries.length - 1].id);
  }
  return withTransitions(track, entries);
}

/** `p` with every track's transitions repaired (the same reference when there are none). */
export function repairTransitions(p: Project): Project {
  if (!p.tracks.some((t) => 'transitions' in t)) return p;
  const fps = Number.isFinite(p.format?.fps) && p.format.fps > 0 ? p.format.fps : 30;
  return reconcileTransitions({ ...p, tracks: p.tracks.map((t) => repairTrack(t, fps)) });
}
