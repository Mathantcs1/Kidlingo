// The maths of every animation preset (Plan 5B D2/D3/D11): the offsets one preset gives at progress p of its window,
// and an upper bound of its scale factor (overlay texture sizing). Closed form, pure, DOM-free.
// Entrances and exits share one "away" shape a (0 = at rest, 1 = fully away): an entrance runs a = 1 − ease(p) (frame
// 0 shows its start state, p = 1 is the rest state exactly); an exit runs a = ease(p) (p = 0 is rest, p = 1 its end
// state). Emphases and loops are exactly at rest at p = 0 and p = 1 of their window or cycle.
import { easeAt } from './easing';
import type { Ease } from './easing';
import type { MotionOffsets, MotionSlot, PresetKey } from './motionTypes';
import { PRESET_SCHEMA } from './presets';
import { cosPi, hopShape, jitterWave, shakeWave, sinPi, wrapTurn } from './presetShapes';

export interface PresetFormat {
  width: number;
  height: number;
}

/** How the window's linear progress is eased; `seconds` = the window (or loop period) length. */
export interface PresetTiming {
  ease?: Ease;
  seconds?: number;
}

/** Unit direction of the direction param: 0 left, 1 right, 2 up, 3 down, then (Ken Burns) the four diagonals. */
const DIRS: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
/** Whip's tilt at full distance, degrees. */
export const WHIP_TILT = 12;

/**
 * The range of `easeAt(e, u)` over u in [0, 1] (eases may overshoot, D5): the eased progress is clamped to it, so
 * presetMaxScale is a true bound. Spring: x(τ) ∈ [0, 2] plus the endpoint correction ∈ [−1, 1].
 */
export function easeRange(e: Ease | undefined): [number, number] {
  switch (e?.kind) {
    case 'back': return [0, 1.1001];
    case 'elastic': return [0, 1.375];
    case 'spring': return [-1, 3];
    case 'bezier': {
      const b = e.bezier;
      return b ? [Math.min(0, b[1], b[3]), Math.max(1, b[1], b[3])] : [0, 1];
    }
    default: return [0, 1];
  }
}

/** Param `key` of `preset`: the finite stored value clamped to the schema, else the default (integers rounded). */
function param(preset: PresetKey, params: Readonly<Record<string, number>>, key: string): number {
  const d = PRESET_SCHEMA[preset].params.find((q) => q.key === key)!;
  const v = params[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return d.def;
  const r = d.integer ? Math.round(v) : v;
  return r < d.min ? d.min : r > d.max ? d.max : r;
}

const pos = (v: number): number => (v > 0 ? v : 0);
const offsets = (dx: number, dy: number, drot: number, kScale: number, kOpacity: number): MotionOffsets =>
  ({ dx: dx + 0, dy: dy + 0, drot: drot + 0, kScale: kScale + 0, kOpacity: kOpacity + 0 });

/** Pop's quadratic 1 − (1 − q)(1 − B q): 0 at q = 0, 1 at q = 1, peak exactly 1 + intensity. */
const popB = (i: number): number => 1 + 2 * i + 2 * Math.sqrt(i + i * i);

function away(key: PresetKey, slot: MotionSlot, a: number, P: Readonly<Record<string, number>>, f: PresetFormat): MotionOffsets {
  const W = f.width;
  const H = f.height;
  const g = (k: string) => param(key, P, k);
  switch (key) {
    case 'fade': return offsets(0, 0, 0, 1, pos(1 - a));
    case 'slide':
    case 'whip': {
      const [ux, uy] = DIRS[g('direction')];
      const d = g('distance');
      return offsets(ux * a * d * W, uy * a * d * H, key === 'whip' ? -(ux + uy) * a * WHIP_TILT : 0, 1, 1);
    }
    case 'zoom': return offsets(0, 0, 0, pos(1 + a * (g('from') - 1)), pos(1 - a));
    case 'pop': {
      const q = 1 - a;
      return offsets(0, 0, 0, pos(1 - (1 - q) * (1 - popB(g('intensity')) * q)), 1);
    }
    case 'spin': return offsets(0, 0, (slot === 'out' ? a : -a) * g('turns') * 360, pos(1 - a / 2), 1);
    case 'drop': return offsets(0, (slot === 'out' ? a : -a) * g('distance') * H, 0, 1, 1);
    case 'rise': return offsets(0, a * g('distance') * H, 0, 1, pos(1 - a));
    default: return offsets(0, 0, 0, 1, 1);
  }
}

function shaped(key: PresetKey, q: number, p: number, seconds: number, P: Readonly<Record<string, number>>, f: PresetFormat): MotionOffsets {
  const W = f.width;
  const H = f.height;
  // Ruling P5B-4: Shake and Jitter move the same px on both axes (isotropic): intensity × min(W, H).
  const M = Math.min(W, H);
  const g = (k: string) => param(key, P, k);
  switch (key) {
    case 'pulse': return offsets(0, 0, 0, pos(1 + g('intensity') * sinPi(q)), 1);
    case 'shake': {
      const env = g('intensity') * sinPi(q);
      const cycles = g('frequency') * p * seconds;
      const seed = g('seed');
      return offsets(env * M * shakeWave(seed, 0, cycles), env * M * shakeWave(seed, 1, cycles), 0, 1, 1);
    }
    case 'wobble': return offsets(0, 0, g('intensity') * sinPi(6 * q) * (1 - q), 1, 1);
    case 'flash': return offsets(0, 0, 0, 1, 1 - Math.abs(sinPi(g('flashes') * q)));
    case 'hop': return offsets(0, -g('distance') * H * hopShape(q), 0, 1, 1);
    case 'spin360':
    case 'spinLoop': return offsets(0, 0, 360 * g('turns') * wrapTurn(q), 1, 1);
    case 'breathe': return offsets(0, 0, 0, 1 + g('intensity') * (1 - cosPi(2 * q)) / 2, 1);
    case 'float': return offsets(0, -g('distance') * H * sinPi(2 * q), 0, 1, 1);
    case 'jitter': {
      const i = g('intensity');
      const seed = g('seed');
      return offsets(i * M * jitterWave(seed, 0, q), i * M * jitterWave(seed, 1, q), 0, 1, 1);
    }
    case 'blink': return offsets(0, 0, 0, 1, q < g('duty') ? 1 : 0);
    case 'kenBurns': {
      const z0 = g('from');
      const [ux, uy] = DIRS[g('direction')];
      const d = g('distance');
      // D11: zoom in log space, f(q) = z0·(z1/z0)^q (perceptually even); pan linear in format fractions.
      return offsets(ux * d * W * q, uy * d * H * q, 0, z0 * Math.pow(g('to') / z0, q), 1);
    }
    default: return offsets(0, 0, 0, 1, 1);
  }
}

const clampTo = (v: number, [lo, hi]: [number, number]): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * The offsets of preset `key` in `slot` at LINEAR progress `p` (clamped to 0..1; NaN reads 0) of its window (a loop:
 * of its cycle; Ken Burns: of the clip). `timing.ease` shapes p (linear when absent; the result is clamped to
 * easeRange); `timing.seconds` (default: the preset's duration) is the window length, read by Shake (its frequency is in
 * Hz, so a value depends only on the time since the window start) and by spring eases. Params are read clamped to the
 * schema. Never NaN; −0 never returned.
 */
export function presetOffsets(key: PresetKey, slot: MotionSlot, p: number, params: Readonly<Record<string, number>>, format: PresetFormat, timing: PresetTiming = {}): MotionOffsets {
  const lin = p > 0 ? (p < 1 ? p : 1) : 0;
  const seconds = timing.seconds !== undefined && timing.seconds > 0 && Number.isFinite(timing.seconds) ? timing.seconds : PRESET_SCHEMA[key].duration;
  const q = timing.ease ? clampTo(easeAt(timing.ease, lin, seconds), easeRange(timing.ease)) : lin;
  if (slot === 'in') return away(key, slot, 1 - q, params, format);
  if (slot === 'out') return away(key, slot, q, params, format);
  return shaped(key, q, lin, seconds, params, format);
}

/** An upper bound (≥ 1) of the scale factor preset `key` can give in `slot` with these params and ease (any p). */
export function presetMaxScale(key: PresetKey, slot: MotionSlot, params: Readonly<Record<string, number>>, ease?: Ease): number {
  const [lo, hi] = easeRange(ease);
  const g = (k: string) => param(key, params, k);
  // The away amount's range: an entrance runs a = 1 − q, an exit a = q.
  const aMin = slot === 'in' ? 1 - hi : lo;
  const aMax = slot === 'in' ? 1 - lo : hi;
  switch (key) {
    case 'zoom': {
      const from = g('from');
      return Math.max(1, 1 + aMin * (from - 1), 1 + aMax * (from - 1));
    }
    case 'spin': return Math.max(1, 1 - aMin / 2);
    case 'pop':
    case 'pulse':
    case 'breathe': return 1 + g('intensity');
    case 'kenBurns': {
      const z0 = g('from');
      const r = g('to') / z0;
      return Math.max(1, z0 * Math.pow(r, lo), z0 * Math.pow(r, hi));
    }
    default: return 1;
  }
}
