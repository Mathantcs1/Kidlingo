// Repairs hand-edited speed fields when a save is opened (Plan 5D D2/§8, data v9; v8 -> v9 adds nothing). Only video and
// audio clips keep speed, reverse, a ramp and the pitch flag, only video clips a freeze; a freeze clip has none of the
// others. A clamped constant speed or a repaired ramp keeps the clip's TIMELINE duration by moving the footage edge that is played LAST
// (forward `out`, reverse `in`), so a repair can never create an overlap; when that is impossible (footage below 0) the
// speed is dropped and the stored in/out stay. Never mutates its input; unknown fields are kept. Fades are fitted by the
// caller AFTER this repair, to the speed-aware duration.
import { repairKeyList } from './migrateKeys';
import { clipDuration, withDuration } from './clipTime';
import type { Clip } from './model';
import { MAX_SPEED, MIN_SPEED } from './speedTypes';
import type { Keyframe } from './keyTypes';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** The most keys a ramp keeps. */
export const MAX_SPEED_KEYS = 64;

function repairRamp(raw: unknown): Keyframe[] | undefined {
  const keys = repairKeyList(raw, MIN_SPEED, MAX_SPEED);
  const kept = keys?.slice(0, MAX_SPEED_KEYS);
  return kept && kept.length >= 2 ? kept : undefined;
}

/** The authored length of a ramp clip, from its keys as the runtime would read them (any finite key, values clamped like speedAt). */
function authoredRampDuration(c: Record<string, unknown>, raw: unknown): number | undefined {
  const keys = repairKeyList(raw, -1e12, 1e12);
  if (!keys || keys.length === 0 || !finite(c.in) || !finite(c.out) || c.out < c.in) return undefined;
  return clipDuration({ kind: 'video', in: c.in, out: c.out, speedKeys: keys } as Clip);
}

/** `c` with its speed fields repaired (and `in`/`out` moved when a clamp must keep the duration). */
export function repairSpeed(c: Record<string, unknown>): Record<string, unknown> {
  const { speed, reverse, speedKeys, preservePitch, freeze, ...rest } = c;
  const kind = c.kind;
  const speedKind = kind === 'video' || kind === 'audio';
  if (!speedKind) return rest;
  if (kind === 'video' && isObject(freeze) && finite(freeze.at) && freeze.at >= 0) return { ...rest, freeze: { at: freeze.at } };
  const out: Record<string, unknown> = { ...rest };
  const ramp = repairRamp(speedKeys);
  let constant: number | undefined;
  if (!ramp && finite(speed) && speed > 0) {
    const s = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
    constant = s;
    if (s !== speed && finite(c.in) && finite(c.out) && c.out >= c.in) {
      const d = (c.out - c.in) / speed; // the authored duration
      const length = d * s;
      if (reverse === true) {
        const inn = c.out - length;
        if (inn < 0) constant = undefined;
        else out.in = inn;
      } else {
        out.out = c.in + length;
      }
    }
    if (constant === 1) constant = undefined;
  }
  if (constant !== undefined) out.speed = constant;
  if (reverse === true) out.reverse = true;
  if (ramp) out.speedKeys = ramp;
  // A ramp that was clamped or dropped must not change the clip's length (it could overlap the next clip): move the footage
  // edge played last to restore it; when that is impossible (reverse below 0) the stored in/out stay.
  const authored = speedKeys === undefined ? undefined : authoredRampDuration(c, speedKeys);
  if (authored !== undefined && finite(c.in) && finite(c.out)) {
    const now = { kind: 'video', in: c.in, out: c.out, reverse: reverse === true ? true : undefined, speed: out.speed, speedKeys: out.speedKeys } as Clip;
    if (Math.abs(clipDuration(now) - authored) > 1e-9) {
      const fixed = withDuration(now, authored);
      if (Number.isFinite(fixed.in) && Number.isFinite(fixed.out) && fixed.in >= 0) {
        out.in = fixed.in;
        out.out = fixed.out;
      }
    }
  }
  if (preservePitch === false) out.preservePitch = false;
  return out;
}
