// Deterministic test signals and level measurements for the noise-reduction unit tests.
export const SR = 48000;

/** Deterministic white noise in [-amp, amp) (mulberry32). */
export function noise(n: number, amp: number, seed = 1): Float32Array {
  let a = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    out[i] = amp * (2 * (((t ^ (t >>> 14)) >>> 0) / 4294967296) - 1);
  }
  return out;
}

export const rms = (d: Float32Array, a: number, e: number): number => {
  let s = 0;
  for (let i = a; i < e; i++) s += d[i] * d[i];
  return Math.sqrt(s / (e - a));
};

/** Amplitude of the `f` Hz component over [a, e) (projection on sin and cos). */
export function toneAmp(d: Float32Array, f: number, a: number, e: number): number {
  let s = 0;
  let c = 0;
  for (let i = a; i < e; i++) {
    const w = (2 * Math.PI * f * i) / SR;
    s += d[i] * Math.sin(w);
    c += d[i] * Math.cos(w);
  }
  return (2 * Math.hypot(s, c)) / (e - a);
}

export const db = (r: number): number => 20 * Math.log10(r);
