// DOM-free reverb impulse: seeded exponential-decay noise, identical in live playback and export.

/** Mulberry32: a small deterministic PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Amplitude falls by 60 dB over the impulse (an RT60 equal to `seconds`). */
const DECAY_DB = 60;

/**
 * A mono impulse of `seconds` at `sampleRate`: white noise from a seeded PRNG under an exponential envelope that
 * reaches -60 dB at the end, scaled to unit energy so the wet level does not depend on the length.
 */
export function reverbImpulse(sampleRate: number, seconds: number, seed = 1): Float32Array<ArrayBuffer> {
  const n = Math.max(1, Math.round(sampleRate * seconds));
  const out = new Float32Array(n);
  const rand = mulberry32(seed);
  const k = (DECAY_DB / 20) * Math.LN10;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const v = (rand() * 2 - 1) * Math.exp((-k * i) / n);
    out[i] = v;
    energy += v * v;
  }
  const scale = energy > 0 ? 1 / Math.sqrt(energy) : 0;
  for (let i = 0; i < n; i++) out[i] *= scale;
  return out;
}
