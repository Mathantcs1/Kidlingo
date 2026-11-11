// Gain in dB (the Normalise result).
import type { EffectBuilder } from './types';
import { dbToGain, single } from './types';

export const buildGain: EffectBuilder = (ctx, q) => {
  const g = ctx.createGain();
  g.gain.value = dbToGain(q.gainDb);
  return single(g);
};

/** Identity pass-through for effects whose builder is not there yet (pitch and denoise until Task 7). */
export const buildIdentity: EffectBuilder = (ctx) => single(ctx.createGain());
