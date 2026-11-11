import type { AudioEffectType } from './model';

/**
 * Stub until the effect registry (Plan 3 Task 6) replaces this file: keeps only finite numbers and has no defaults.
 * The signature is the contract: `clampEffectParams(type, params)` returns a clean, clamped copy.
 */
export function clampEffectParams(_type: AudioEffectType, params: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(params)) if (Number.isFinite(v)) out[k] = v;
  return out;
}

/** Default parameters of a freshly added effect (stub: none). */
export function defaultEffectParams(_type: AudioEffectType): Record<string, number> {
  return {};
}
