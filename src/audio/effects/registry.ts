// The effect registry: schema (params.ts, DOM-free) + Web Audio builder per type. Only the engine imports this.
import type { AudioEffect, AudioEffectType } from '../../core/model';
import { buildCompressor } from './compressor';
import { buildEcho } from './echo';
import { buildEq } from './eq';
import { buildHighpass, buildLowpass } from './filters';
import { buildGain, buildIdentity } from './gain';
import { EFFECT_SCHEMAS, clampParams } from './params';
import { buildReverb } from './reverb';
import type { EffectBuilder, EffectDef, EffectNodes } from './types';

export { chainMargins, clampParams, defaultParams } from './params';
export type { EffectDef, EffectNodes } from './types';

const BUILDERS: Record<AudioEffectType, EffectBuilder> = {
  eq: buildEq,
  highpass: buildHighpass,
  lowpass: buildLowpass,
  compressor: buildCompressor,
  reverb: buildReverb,
  echo: buildEcho,
  // Registered as pass-through until Plan 3 Task 7 (available: false keeps them out of the UI).
  pitch: buildIdentity,
  denoise: buildIdentity,
  gain: buildGain,
};

export const EFFECTS = Object.fromEntries(
  (Object.keys(EFFECT_SCHEMAS) as AudioEffectType[]).map((t) => [t, { ...EFFECT_SCHEMAS[t], build: BUILDERS[t] }]),
) as Record<AudioEffectType, EffectDef>;

/**
 * Builds the enabled effects in order as one input → … → output stage (params clamped first, so loaded data
 * can never reach a node out of range). Null when nothing is enabled.
 */
export function buildEffects(
  ctx: BaseAudioContext,
  effects: readonly AudioEffect[],
): EffectNodes | null {
  const built = effects.filter((e) => e.enabled).map((e) => EFFECTS[e.type].build(ctx, clampParams(e.type, e.params)));
  if (!built.length) return null;
  for (let i = 1; i < built.length; i++) built[i - 1].output.connect(built[i].input);
  const all = built.flatMap((b) => b.all);
  return { input: built[0].input, output: built[built.length - 1].output, all };
}
