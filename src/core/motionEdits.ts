// Animation preset edits (Plan 5B D2/D13/D14): choose, remove and tune the preset in one slot of a clip's stack, each
// ONE project (one apply). Locked tracks refuse; audio clips take no presets; adjustment layers take only opacity-only
// presets ('Adjustment layers only fade'); same reference when nothing changes; never mutates input. Every stored slot
// is canonical: it goes through the migration's repairMotion, so a reload never changes an edited stack.
import { isSameEase, repairEase } from './easing';
import type { Ease } from './easing';
import { commitClip } from './keyEditHelpers';
import { localRange, localTime } from './keyframes';
import { repairMotion, withMotion } from './migrateMotion';
import type { Clip, Id, Project } from './model';
import { MOTION_SLOTS } from './motionTypes';
import type { ClipMotion, EmphasisUse, LoopUse, MotionSlot, PresetKey, PresetUse } from './motionTypes';
import { PRESET_SCHEMA, isPresetKey, presetEase, presetLabel, presetParams } from './presets';
import { hash01 } from './presetShapes';
import { TimelineError, assertUnlocked, findClip } from './timeline';

export const ADJUSTMENT_ONLY_FADE = 'Adjustment layers only fade';
export const AUDIO_NO_PRESETS = 'Audio clips have no animation presets';
export const NO_PRESET = 'There is no preset in that slot';
const SLOT_NAMES: Record<MotionSlot, string> = { in: 'an entrance', emphasis: 'an emphasis', loop: 'a loop', out: 'an exit' };

type AnyUse = PresetUse & Partial<Pick<EmphasisUse, 'at'> & Pick<LoopUse, 'phase' | 'count'>>;
/** A change to one slot: timing, ease, the emphasis `at`, the loop `phase`/`count`, and params (known keys only). */
export interface PresetPatch {
  duration?: number;
  delay?: number;
  ease?: Ease;
  at?: number;
  phase?: number;
  count?: number | null;
  params?: Record<string, number>;
}

function locate(p: Project, clipId: Id): Clip {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  return clip;
}

/** Refuses a preset the clip or slot cannot take (D13). */
function assertFits(clip: Clip, slot: MotionSlot, key: unknown): asserts key is PresetKey {
  if (!MOTION_SLOTS.includes(slot)) throw new TimelineError('Unknown animation slot');
  if (!isPresetKey(key)) throw new TimelineError('Unknown animation preset');
  if (clip.kind === 'audio') throw new TimelineError(AUDIO_NO_PRESETS);
  const s = PRESET_SCHEMA[key];
  if (!s.slots.includes(slot)) throw new TimelineError(`${presetLabel(key, s.slots[0])} cannot be used as ${SLOT_NAMES[slot]}`);
  if (clip.kind === 'adjustment' && !s.opacityOnly) throw new TimelineError(ADJUSTMENT_ONLY_FADE);
}

/** A seed derived from the clip id and slot (t-independent, deterministic), in 0..2^31 − 1. */
export function defaultSeed(clipId: Id, slot: MotionSlot): number {
  let h = 0;
  for (const ch of `${clipId}:${slot}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return Math.floor(hash01(h) * 2147483647);
}

/** The playhead's local time on the clip, kept on the visible range (an emphasis chosen off the clip lands on an edge frame). */
function playheadLocal(clip: Clip, t: number, fps: number): number {
  const [lo, hi] = localRange(clip);
  const u = localTime(clip, t, fps);
  const last = Math.max(lo, hi - 1 / fps);
  return u < lo ? lo : u > last ? last : u;
}

/** The slot as stored (canonical: the migration's repair of it), or undefined when repair drops it. */
function canonical(clip: Clip, slot: MotionSlot, use: AnyUse): AnyUse | undefined {
  return repairMotion({ [slot]: use }, clip.kind)?.[slot] as AnyUse | undefined;
}

function sameUse(a: AnyUse | undefined, b: AnyUse | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.preset !== b.preset || a.duration !== b.duration || a.delay !== b.delay || !isSameEase(a.ease, b.ease)) return false;
  if (a.at !== b.at || a.phase !== b.phase || a.count !== b.count) return false;
  const ka = Object.keys(a.params);
  return ka.length === Object.keys(b.params).length && ka.every((k) => a.params[k] === b.params[k]);
}

function commitSlot(p: Project, clip: Clip, slot: MotionSlot, use: AnyUse | undefined): Project {
  const cur = clip.motion?.[slot] as AnyUse | undefined;
  if (sameUse(cur, use)) return p;
  const m: ClipMotion = { ...clip.motion };
  if (use) (m as Record<MotionSlot, AnyUse>)[slot] = use;
  else delete m[slot];
  return commitClip(p, clip.id, withMotion(clip, Object.keys(m).length > 0 ? m : undefined) as Clip);
}

/**
 * Puts preset `use` in `slot` of clip `clipId`, or removes the slot with null. A preset KEY gets the defaults for the
 * slot (duration, ease, params; Zoom Out from 1.5); choosing the key the slot already holds changes nothing. A full
 * PresetUse (a user preset, Task 9) is stored repaired. Emphasis `at` defaults to the playhead's local time (`t`);
 * a new loop starts its cycles at the clip's visible start (phase = −local start; count null = until the clip end);
 * `seed` (Shake, Jitter) defaults to a hash of the clip id and slot. Refusals: locked track, audio, a preset the slot
 * does not take, non-opacity presets on adjustment layers (D13).
 */
export function setPreset(p: Project, clipId: Id, slot: MotionSlot, use: PresetKey | PresetUse | null, t: number, seed?: number): Project {
  const clip = locate(p, clipId);
  if (use === null) {
    if (!MOTION_SLOTS.includes(slot)) throw new TimelineError('Unknown animation slot');
    return commitSlot(p, clip, slot, undefined);
  }
  const key = typeof use === 'string' ? use : use?.preset;
  assertFits(clip, slot, key);
  if (typeof use === 'string' && clip.motion?.[slot]?.preset === use) return p;
  const given = (typeof use === 'string' ? {} : use) as Partial<AnyUse>;
  const fps = p.format.fps;
  const next: AnyUse = {
    preset: key,
    duration: given.duration ?? PRESET_SCHEMA[key].duration,
    delay: given.delay ?? 0,
    ease: given.ease ? repairEase(given.ease) : presetEase(key, slot),
    params: { ...presetParams(key, slot), ...given.params },
  };
  if ('seed' in next.params && (seed !== undefined || typeof use === 'string')) next.params.seed = seed ?? defaultSeed(clip.id, slot);
  if (slot === 'emphasis') next.at = Number.isFinite(given.at) ? given.at : playheadLocal(clip, t, fps);
  if (slot === 'loop') {
    next.phase = Number.isFinite(given.phase) ? given.phase : -localRange(clip)[0];
    next.count = given.count ?? null;
  }
  return commitSlot(p, clip, slot, canonical(clip, slot, next));
}

/**
 * Tunes the preset in `slot` (one call per slider release): the patch's fields are clamped to the D14 limits and the
 * preset's schema (unknown params ignored), the ease repaired. Refused on a locked track, for an empty slot, and for a
 * non-finite number. Same reference when nothing changes.
 */
export function setPresetParams(p: Project, clipId: Id, slot: MotionSlot, patch: PresetPatch): Project {
  const clip = locate(p, clipId);
  const cur = clip.motion?.[slot] as AnyUse | undefined;
  if (!cur) throw new TimelineError(NO_PRESET);
  const nums = [patch.duration, patch.delay, patch.at, patch.phase, patch.count ?? undefined, ...Object.values(patch.params ?? {})];
  if (nums.some((v) => v !== undefined && !(typeof v === 'number' && Number.isFinite(v)))) throw new TimelineError('Invalid animation setting');
  const known = PRESET_SCHEMA[cur.preset].params.map((d) => d.key);
  const params = { ...cur.params };
  for (const k of known) if (patch.params && Object.hasOwn(patch.params, k)) params[k] = patch.params[k];
  const next: AnyUse = {
    ...cur,
    duration: patch.duration ?? cur.duration,
    delay: patch.delay ?? cur.delay,
    ease: patch.ease ? repairEase(patch.ease) : cur.ease,
    params,
  };
  if (slot === 'emphasis' && patch.at !== undefined) next.at = patch.at;
  if (slot === 'loop' && patch.phase !== undefined) next.phase = patch.phase;
  if (slot === 'loop' && patch.count !== undefined) next.count = patch.count;
  return commitSlot(p, clip, slot, canonical(clip, slot, next));
}
