// Compressor: DynamicsCompressorNode (knee 6 dB) followed by a makeup gain.
import { COMPRESSOR_KNEE } from './params';
import type { EffectBuilder } from './types';
import { dbToGain } from './types';

export const buildCompressor: EffectBuilder = (ctx, q) => {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = q.threshold;
  c.ratio.value = q.ratio;
  c.attack.value = q.attack;
  c.release.value = q.release;
  c.knee.value = COMPRESSOR_KNEE;
  const makeup = ctx.createGain();
  makeup.gain.value = dbToGain(q.makeup);
  c.connect(makeup);
  return { input: c, output: makeup, all: [c, makeup] };
};
