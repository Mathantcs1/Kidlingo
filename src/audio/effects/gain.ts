// Gain in dB (the Normalise result).
import type { EffectBuilder } from './types';
import { dbToGain, single } from './types';

export const buildGain: EffectBuilder = (ctx, q) => {
  const g = ctx.createGain();
  g.gain.value = dbToGain(q.gainDb);
  return single(g);
};

/** Identity pass-through: the in-graph node of noise reduction, which runs on the decoded buffer (see chain.ts). */
export const buildIdentity: EffectBuilder = (ctx) => single(ctx.createGain());
