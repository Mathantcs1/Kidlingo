// Closed-form building blocks of the animation presets (Plan 5B Task 5): exact trigonometry at integers and the seeded
// "random" waves of Shake and Jitter. Deterministic from their inputs only (no Math.random, no clock), so preview frame
// N equals export frame N and a value depends on the time it is sampled at, never on the frame rate.

/** sin(π·x), exactly ±0 when x is an integer (so a shape is exactly at rest at the ends of its window). */
export function sinPi(x: number): number {
  const n = Math.round(x);
  const s = Math.sin(Math.PI * (x - n));
  return n % 2 === 0 ? s : -s;
}

/** cos(π·x), exactly ±1 when x is an integer. */
export function cosPi(x: number): number {
  const n = Math.round(x);
  const c = Math.cos(Math.PI * (x - n));
  return n % 2 === 0 ? c : -c;
}

/** A 32-bit integer hash (murmur3 finaliser) of `n`, in [0, 1). */
export function hash01(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** The seeded phase (radians) of component `i` of `seed`'s wave. */
const phase = (seed: number, i: number): number => 2 * Math.PI * hash01(Math.imul(seed | 0, 7) + i);

const SHAKE_MULT = [1, 1.73, 2.41];
const WEIGHT = [1, 0.6, 0.35];
const WEIGHT_SUM = WEIGHT[0] + WEIGHT[1] + WEIGHT[2];

/**
 * Shake's wave at `cycles` = frequency × seconds: a weighted sum of three sines at incommensurate multiples of the
 * frequency with phases from `seed` (`axis` 0 = x, 1 = y), in [−1, 1].
 */
export function shakeWave(seed: number, axis: number, cycles: number): number {
  let v = 0;
  for (let j = 0; j < 3; j++) v += WEIGHT[j] * Math.sin(2 * Math.PI * SHAKE_MULT[j] * cycles + phase(seed, axis * 3 + j));
  return v / WEIGHT_SUM;
}

const JITTER_HARMONICS = [3, 5, 7];

/**
 * Jitter's wave over one loop cycle `f` (0..1): integer harmonics with seeded phases, so the cycle is seamless, minus
 * its value at f = 0 so it is exactly 0 at the cycle start (and at f = 1: sinPi/cosPi are exact at integers); in [−1, 1].
 */
export function jitterWave(seed: number, axis: number, f: number): number {
  let v = 0;
  let v0 = 0;
  for (let j = 0; j < 3; j++) {
    const ph = phase(seed, 16 + axis * 3 + j);
    const c = Math.cos(ph);
    const s = Math.sin(ph);
    const x = 2 * JITTER_HARMONICS[j] * f;
    v += WEIGHT[j] * (sinPi(x) * c + cosPi(x) * s);
    v0 += WEIGHT[j] * s;
  }
  return (v - v0) / (2 * WEIGHT_SUM);
}

/** Hop's two arcs (a hop to full height, then a quarter-height bounce) over q in (0, 1); 0 outside. */
export function hopShape(q: number): number {
  if (!(q > 0 && q < 1)) return 0;
  const SPLIT = 0.65;
  if (q < SPLIT) {
    const r = q / SPLIT;
    return 4 * r * (1 - r);
  }
  const r = (q - SPLIT) / (1 - SPLIT);
  return r >= 1 ? 0 : r * (1 - r);
}

/** A whole turn split at half a cycle (v in turns): exactly 0 at 0 and 1, continuous modulo whole turns. */
export const wrapTurn = (v: number): number => (v < 0.5 ? v : v - 1);
