// Motion path edits (data v7, Plan 5B D6/D7): move one position key, set its spatial tangents (smooth or broken),
// smooth the whole path (Catmull-Rom), orient along path, plus the unguarded live twin for on-canvas drags.
// `(Project, …) => Project`; locked tracks refuse; adjustment/audio clips have no position; same-reference no-ops.
import type { AnimTarget } from './animTargets';
import { withTargetKeys } from './animTargets';
import { commitClip, locate } from './keyEditHelpers';
import { copyKey, nearestKey } from './keyLists';
import { KEYED_POSITION_LIMIT } from './keyframes';
import type { Clip, Id, PositionKeyframe, Project, Vec } from './model';
import { unit } from './pathCurve';
import { TimelineError, findClip } from './timeline';
import { REACH, clamp } from './transformLimits';

const POS: AnimTarget = { kind: 'transform', prop: 'position' };
export const NO_PATH_KEY = 'No position keyframe at this time';
export const PATH_NEEDS_KEYS = 'A motion path needs two position keyframes';

/** A tangent edit: a Vec sets it, null removes it, absent leaves it; `broken` sets (true) or clears (false) the corner flag. */
export interface TangentPatch { in?: Vec | null; out?: Vec | null; broken?: boolean }
/** One live/committed change to the position key at local time `u`: its position and/or its tangents. */
export interface PathChange { u: number; xy?: Vec; tangents?: TangentPatch }

const P = KEYED_POSITION_LIMIT;

/** A finite tangent clamped to ±KEYED_POSITION_LIMIT (−0 stored as 0); a zero tangent is no tangent (straight). */
function tangent(v: Vec): Vec | undefined {
  if (typeof v !== 'object' || v === null || !Number.isFinite(v.x) || !Number.isFinite(v.y)) throw new TimelineError('Invalid tangent');
  const out = { x: clamp(v.x, -P, P) + 0, y: clamp(v.y, -P, P) + 0 };
  return out.x === 0 && out.y === 0 ? undefined : out;
}

/** `other`'s length along the direction opposite `lead` (smooth key, D6); absent stays absent (length 0). */
function mirror(lead: Vec, other: Vec | undefined): Vec | undefined {
  const d = unit(lead);
  if (!other || !d) return other;
  const len = Math.hypot(other.x, other.y);
  return tangent({ x: -d.x * len, y: -d.y * len });
}

/** A key with exactly these tangents and corner flag (fresh object; absent fields omitted). */
function build(k: PositionKeyframe, tin: Vec | undefined, tout: Vec | undefined, broken: boolean): PositionKeyframe {
  const { in: _i, out: _o, broken: _b, ...rest } = copyKey(k);
  const out: PositionKeyframe = { ...rest };
  if (tin) out.in = tin;
  if (tout) out.out = tout;
  if (broken) out.broken = true;
  return out;
}

const sameVec = (a: Vec | undefined, b: Vec | undefined): boolean => (a === undefined ? b === undefined : b !== undefined && a.x === b.x && a.y === b.y);
const sameKey = (a: PositionKeyframe, b: PositionKeyframe): boolean =>
  a.x === b.x && a.y === b.y && sameVec(a.in, b.in) && sameVec(a.out, b.out) && (a.broken === true) === (b.broken === true);

/**
 * Key `k` with `patch` applied (D6). A smooth key (not broken after the edit) keeps its two tangents opposite: setting
 * one alone turns the other to the opposite DIRECTION, keeping the other's length; clearing `broken` re-aligns `in`
 * to `out`. A broken key's tangents move independently. Both given: stored as given.
 */
export function withTangentPatch(k: PositionKeyframe, patch: TangentPatch): PositionKeyframe {
  const broken = patch.broken ?? k.broken === true;
  const setIn = patch.in !== undefined;
  const setOut = patch.out !== undefined;
  let tin = setIn ? (patch.in === null ? undefined : tangent(patch.in!)) : k.in;
  let tout = setOut ? (patch.out === null ? undefined : tangent(patch.out!)) : k.out;
  if (!broken) {
    if (setOut && !setIn && tout) tin = mirror(tout, tin);
    else if (setIn && !setOut && tin) tout = mirror(tin, tout);
    else if (!setIn && !setOut && k.broken && tout) tin = mirror(tout, tin);
  }
  return build(k, tin, tout, broken);
}

/** Position clamp of the static/keyed edits (±REACH × format, within the key limit). */
function moved(p: Project, k: PositionKeyframe, xy: Vec): PositionKeyframe {
  if (typeof xy !== 'object' || xy === null || !Number.isFinite(xy.x) || !Number.isFinite(xy.y)) throw new TimelineError('Invalid value');
  const lx = Math.min(REACH * p.format.width, P);
  const ly = Math.min(REACH * p.format.height, P);
  return { ...copyKey(k), x: clamp(xy.x, -lx, lx) + 0, y: clamp(xy.y, -ly, ly) + 0 };
}

/** The clip with `change` applied to its position key at `u`; the clip itself when nothing changes. Throws refusals. */
function changed(p: Project, clip: Clip, change: PathChange): Clip {
  const list = clip.keys?.position ?? [];
  const i = nearestKey(list, change.u);
  if (i < 0) throw new TimelineError(NO_PATH_KEY);
  let k = list[i];
  if (change.xy) k = moved(p, k, change.xy);
  if (change.tangents) k = withTangentPatch(k, change.tangents);
  if (sameKey(k, list[i])) return clip;
  const next = list.slice();
  next[i] = k;
  return withTargetKeys(clip, POS, next);
}

const commit = (p: Project, clipId: Id, clip: Clip, next: Clip): Project => (next === clip ? p : commitClip(p, clipId, next));

/** Sets the tangents of the position key at local time `u` (D6, see withTangentPatch). Locked/adjustment/audio refuse. */
export function setKeyTangents(p: Project, clipId: Id, u: number, tangents: TangentPatch): Project {
  const clip = locate(p, clipId, POS);
  return commit(p, clipId, clip, changed(p, clip, { u, tangents }));
}

/** Moves the position key at local time `u` to `xy` (format px offsets), keeping its time, ease and tangents. */
export function setKeyPosition(p: Project, clipId: Id, u: number, xy: Vec): Project {
  const clip = locate(p, clipId, POS);
  return commit(p, clipId, clip, changed(p, clip, { u, xy }));
}

/** Catmull-Rom tangents of key i (D6): along prev → next, each one third of the chord to its own neighbour. */
function smoothKey(list: readonly PositionKeyframe[], i: number): PositionKeyframe {
  const k = list[i];
  const prev = list[i - 1];
  const next = list[i + 1];
  const third = (to: PositionKeyframe): Vec => ({ x: (to.x - k.x) / 3, y: (to.y - k.y) / 3 });
  if (!prev) return build(k, undefined, tangent(third(next)), false);
  if (!next) return build(k, tangent(third(prev)), undefined, false);
  const d = unit({ x: next.x - prev.x, y: next.y - prev.y });
  if (!d) return build(k, undefined, undefined, false);
  const lin = Math.hypot(k.x - prev.x, k.y - prev.y) / 3;
  const lout = Math.hypot(next.x - k.x, next.y - k.y) / 3;
  return build(k, tangent({ x: -d.x * lin, y: -d.y * lin }), tangent({ x: d.x * lout, y: d.y * lout }), false);
}

/** "Smooth path" (D6): Catmull-Rom tangents on every position key in ONE project; corners become smooth. */
export function smoothPath(p: Project, clipId: Id): Project {
  const clip = locate(p, clipId, POS);
  const list = clip.keys?.position ?? [];
  if (list.length < 2) throw new TimelineError(PATH_NEEDS_KEYS);
  const next = list.map((_, i) => smoothKey(list, i));
  if (next.every((k, i) => sameKey(k, list[i]))) return p;
  return commitClip(p, clipId, withTargetKeys(clip, POS, next));
}

/** Turns orient along path on or off (D7); on needs two position keys. The same project when already so. */
export function setOrient(p: Project, clipId: Id, on: boolean): Project {
  const clip = locate(p, clipId, POS);
  const keys = clip.keys;
  if ((keys?.orient === true) === on) return p;
  if (on && (keys?.position?.length ?? 0) < 2) throw new TimelineError(PATH_NEEDS_KEYS);
  const { orient: _o, ...rest } = keys!;
  return commitClip(p, clipId, { ...clip, keys: on ? { ...rest, orient: true } : rest });
}

/**
 * The same change as setKeyPosition/setKeyTangents for the live preview of a path drag ONLY: no lock guard, never
 * throws (a missing clip/key, a clip kind without position or an invalid value give `p` itself), never committed to
 * history. Same maths and clamps, so the release commits exactly what the drag showed.
 */
export function withLivePath(p: Project, clipId: Id, change: PathChange): Project {
  if (!p.tracks.some((tr) => tr.clips.some((c) => c.id === clipId))) return p;
  const { clip } = findClip(p, clipId);
  if (clip.kind === 'audio' || clip.kind === 'adjustment') return p;
  try {
    return commit(p, clipId, clip, changed(p, clip, change));
  } catch (e) {
    if (e instanceof TimelineError) return p;
    throw e;
  }
}
