// Pasting animation transfer payloads (Plan 5B D8, pure, `(Project, …) => { project, skipped }`): keys at the playhead
// (merged into the destination's lists, a key in the same frame window is replaced, P5-6) and whole animations (they
// REPLACE the destination's). Scale keys follow the fit-scale ratio. Everything stored is run through the migration's
// repair functions, so kind rules (adjustment: opacity only; audio: nothing), value ranges and key limits are the
// saved-data ones. Locked tracks refuse the whole paste (nothing is produced); targets a clip cannot take are skipped
// and counted. One call = one project = one undo step, whatever the number of destination clips.
import { animatableParam } from './videoEffects';
import { restPositionAt } from './animate';
import { withTargetKeys } from './animTargets';
import type { AnimTarget } from './animTargets';
import { fitRatio, fitScale } from './animPayload';
import type { AnimPayload, KeysPayload, PayloadTarget } from './animPayload';
import { assertInside, commitClip, sameFrame } from './keyEditHelpers';
import { copyKey } from './keyLists';
import type { AnyKey } from './keyLists';
import { MAX_KEYS, localRange, localTime, tooClose } from './keyframes';
import { repairClipKeys, repairEffectKeys, repairEffectLoops, repairPositionKeys } from './migrateKeys';
import { repairMotion, withMotion } from './migrateMotion';
import type { Clip, Id, Keyframe, Project, VideoEffect } from './model';
import { TimelineError, assertUnlocked, findClip } from './timeline';

export interface TransferResult {
  project: Project;
  /** Settings (a target, effect or preset slot) a destination could not take; they were left out. */
  skipped: number;
}

/** Where the payload's relative time 0 lands on the destination: its visible start, its end (minus the span) or the playhead. */
export type Anchor = 'start' | 'end' | 'playhead';

const AUDIO = 'Audio clips have no animation to paste onto';

/** The effect of `clip` a payload effect maps to (same type, same occurrence), or undefined. */
const effectFor = (clip: Clip, type: string, occurrence: number): VideoEffect | undefined => clip.effects.filter((e) => e.type === type)[occurrence];

function targetFor(clip: Clip, t: PayloadTarget): AnimTarget | undefined {
  if (t.kind === 'transform') return clip.kind === 'adjustment' && t.prop !== 'opacity' ? undefined : { kind: 'transform', prop: t.prop };
  const e = effectFor(clip, t.type, t.occurrence);
  return e && animatableParam(e.type, t.param) ? { kind: 'effect', effectId: e.id, param: t.param } : undefined;
}

const keysOf = (clip: Clip, t: AnimTarget): readonly AnyKey[] =>
  t.kind === 'transform' ? clip.keys?.[t.prop] ?? [] : clip.effects.find((e) => e.id === t.effectId)?.keys?.[t.param] ?? [];

/** Repairs a merged key list of one target with the saved-data rules (clamps, kind, limits). */
function repairList(clip: Clip, target: AnimTarget, list: AnyKey[]): AnyKey[] | undefined {
  if (target.kind === 'effect') {
    const e = clip.effects.find((x) => x.id === target.effectId)!;
    return repairEffectKeys({ [target.param]: list }, e.type)?.[target.param];
  }
  if (target.prop === 'position') return repairPositionKeys(list);
  return repairClipKeys({ [target.prop]: list }, clip.kind)?.[target.prop];
}

/** A key adapted to the destination: copied, moved to `t`, a scale value multiplied by `ratio`. */
function adapt(k: AnyKey, t: number, prop: string | undefined, ratio: number): AnyKey {
  const c = { ...copyKey(k), t };
  if (prop === 'scale' && 'v' in c) c.v = c.v * ratio;
  return c;
}

function pasteKeysInto(p: Project, clipId: Id, payload: KeysPayload, t: number): { clip: Clip; skipped: number } {
  const { clip } = findClip(p, clipId);
  if (clip.kind === 'audio') return { clip, skipped: payload.targets.length };
  assertInside(clip, t);
  const u0 = localTime(clip, t, p.format.fps);
  const [lo, hi] = localRange(clip);
  const ratio = fitRatio(fitScale(p, clip), payload.fit);
  let next = clip;
  let skipped = 0;
  for (const { target: pt, keys } of payload.targets) {
    const target = targetFor(next, pt);
    if (!target) { skipped++; continue; }
    const prop = target.kind === 'transform' ? target.prop : undefined;
    const fresh = keys.map((k) => adapt(k, u0 + k.t, prop, ratio)).filter((k) => k.t >= lo - 1e-9 && k.t < hi - 1e-9);
    if (fresh.length < keys.length) skipped++;
    if (fresh.length === 0) continue;
    const kept = keysOf(next, target).filter((e) => !fresh.some((k) => tooClose(e.t, k.t) || sameFrame(clip, e.t, k.t, p.format.fps)));
    const merged = [...kept, ...fresh].sort((a, b) => a.t - b.t);
    if (merged.length > MAX_KEYS) throw new TimelineError(`At most ${MAX_KEYS} keyframes per setting`);
    const list = repairList(next, target, merged);
    if (!list) { skipped++; continue; }
    next = withTargetKeys(next, target, list);
  }
  return { clip: next, skipped };
}

function assertTargets(p: Project, clipIds: readonly Id[]): void {
  if (clipIds.length === 0) throw new TimelineError('Select a clip to paste onto');
  for (const id of clipIds) assertUnlocked(p, findClip(p, id).track.id);
}

/** Structural equality (property order does not matter, undefined properties count as absent). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
const sameClip = (a: Clip, b: Clip): boolean => same(a, b);

function commitAll(p: Project, edits: { id: Id; next: Clip }[]): Project {
  return edits.reduce((acc, e) => (sameClip(findClip(acc, e.id).clip, e.next) ? acc : commitClip(acc, e.id, e.next)), p);
}

/**
 * Pastes the copied keys into every clip of `clipIds` at timeline time `t` (the earliest key lands on the playhead's
 * frame, relative timing kept; keys leaving the clip are left out). The playhead must be on every destination clip.
 */
export function pasteKeys(p: Project, clipIds: readonly Id[], payload: KeysPayload, t: number): TransferResult {
  assertTargets(p, clipIds);
  let skipped = 0;
  const edits = clipIds.map((id) => {
    const r = pasteKeysInto(p, id, payload, t);
    skipped += r.skipped;
    return { id, next: r.clip };
  });
  return { project: commitAll(p, edits), skipped };
}

type Shape = { time(t: number): number };

function shiftedKeys(list: readonly AnyKey[], s: Shape, prop: string, ratio: number, rest: { x: number; y: number } | null): AnyKey[] {
  return list.map((k) => {
    const c = adapt(k, s.time(k.t), prop, ratio);
    if (rest && 'x' in c) { c.x += rest.x; c.y += rest.y; }
    return c;
  });
}

/** The destination clip with the payload's animation REPLACING its own (kind rules via the repair functions). */
function pasteAnimInto(p: Project, clip: Clip, a: AnimPayload, anchor: Anchor, t: number): { clip: Clip; skipped: number } {
  if (clip.kind === 'audio') throw new TimelineError(AUDIO);
  const [lo, hi] = localRange(clip);
  let origin = lo;
  if (anchor === 'end') origin = hi - a.span;
  if (anchor === 'playhead') {
    assertInside(clip, t);
    origin = localTime(clip, t, p.format.fps);
  }
  const s: Shape = { time: (x) => origin + x };
  const ratio = fitRatio(fitScale(p, clip), a.fit);
  const rest = a.positionRelative ? restPositionAt(clip, origin) : null; // a keyed position anchors at its resolved value there
  let skipped = 0;
  const { keys: _k, motion: _m, ...bare } = clip;
  let out: Clip = { ...bare, effects: clip.effects.map(({ keys: _a, loops: _b, ...e }) => e) };
  if (a.keys) {
    const raw: Record<string, unknown> = {};
    for (const prop of ['position', 'scale', 'rotation', 'opacity'] as const) {
      if (a.keys[prop]) raw[prop] = shiftedKeys(a.keys[prop]!, s, prop, ratio, prop === 'position' ? rest : null);
    }
    if (a.keys.loops) raw.loops = a.keys.loops;
    if (a.keys.orient) raw.orient = true;
    const keys = repairClipKeys(raw, clip.kind);
    skipped += Object.keys(raw).filter((q) => ['position', 'scale', 'rotation', 'opacity'].includes(q) && !keys?.[q as 'scale']).length;
    if (keys) out = { ...out, keys };
  }
  for (const ea of a.effects) {
    const dest = effectFor(out, ea.type, ea.occurrence);
    if (!dest) { skipped++; continue; }
    const raw = Object.fromEntries(Object.entries(ea.keys).map(([param, l]) => [param, shiftedKeys(l, s, 'effect', 1, null) as Keyframe[]]));
    const keys = repairEffectKeys(raw, dest.type);
    if (!keys) { skipped++; continue; }
    const loops = ea.loops ? repairEffectLoops(ea.loops, keys) : undefined;
    out = { ...out, effects: out.effects.map((e) => (e.id === dest.id ? { ...e, keys, ...(loops ? { loops } : {}) } : e)) };
  }
  if (a.motion) {
    const m = structuredClone(a.motion);
    if (m.emphasis) m.emphasis.at = origin + m.emphasis.at;
    if (m.loop) m.loop.phase = m.loop.phase + a.lo - origin;
    const motion = repairMotion(m, clip.kind);
    skipped += Object.keys(a.motion).length - Object.keys(motion ?? {}).length;
    out = withMotion(out, motion) as Clip;
  }
  return { clip: out, skipped };
}

/**
 * Pastes a whole animation onto every clip of `clipIds`, REPLACING the destination's keys, loops, orient, effect keys and
 * preset stack. Keys keep their place relative to the clip's visible start (`anchor` 'start'); user presets use 'end'
 * (exits) or 'playhead' (emphasis). Audio clips are skipped and counted (refused only when no other clip is selected), locked tracks refuse; settings a clip cannot take are counted.
 */
export function pasteAnimation(p: Project, clipIds: readonly Id[], payload: AnimPayload, opts: { anchor?: Anchor; t?: number } = {}): TransferResult {
  assertTargets(p, clipIds);
  let skipped = 0;
  // Audio clips take no animation: skipped and counted (like Paste keys); refused only when nothing else is selected.
  const valid = clipIds.filter((id) => findClip(p, id).clip.kind !== 'audio');
  if (valid.length === 0) throw new TimelineError(AUDIO);
  skipped += clipIds.length - valid.length;
  const edits = valid.map((id) => {
    const r = pasteAnimInto(p, findClip(p, id).clip, payload, opts.anchor ?? 'start', opts.t ?? 0);
    skipped += r.skipped;
    return { id, next: r.clip };
  });
  return { project: commitAll(p, edits), skipped };
}
