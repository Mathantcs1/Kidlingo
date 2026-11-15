// Deterministic seeds for time-driven effects (Plan 4 E6): the same (frame, clip) always gives the same noise.

/** An integer below 2^24 (exact in float32) from a frame number and the clip id. */
export function seedFor(frame: number, clipId: string): number {
  let h = 2166136261 ^ (frame >>> 0);
  for (let i = 0; i < clipId.length; i++) h = Math.imul(h ^ clipId.charCodeAt(i), 16777619);
  return (h >>> 0) % 16777216;
}

/** Splits a seed into two small offsets (the GLSL hashes lose precision with large inputs). */
export function seedVec(seed: number): [number, number] {
  return [seed % 1021, Math.floor(seed / 1021) % 1021];
}
