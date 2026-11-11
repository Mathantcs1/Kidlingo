// The core's view of effect parameters: delegates to the DOM-free registry schema (src/audio/effects/params.ts).
import { clampParams, defaultParams } from '../audio/effects/params';
import type { AudioEffectType } from './model';

/** A clean copy: every key of the effect's schema present and clamped; non-finite ⇒ default; unknown keys dropped. */
export function clampEffectParams(type: AudioEffectType, params: Record<string, number>): Record<string, number> {
  return clampParams(type, params);
}

/** Default parameters of a freshly added effect. */
export function defaultEffectParams(type: AudioEffectType): Record<string, number> {
  return defaultParams(type);
}
