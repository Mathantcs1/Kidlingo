// Reverb: dry (1 - mix) + convolution with the seeded unit-energy impulse (mix).
import { reverbImpulse } from './impulse';
import type { EffectBuilder } from './types';

export const buildReverb: EffectBuilder = (ctx, q) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - q.mix;
  const wet = ctx.createGain();
  wet.gain.value = q.mix;
  const conv = ctx.createConvolver();
  conv.normalize = false;
  const ir = ctx.createBuffer(1, Math.max(1, Math.round(ctx.sampleRate * q.seconds)), ctx.sampleRate);
  ir.copyToChannel(reverbImpulse(ctx.sampleRate, q.seconds), 0);
  conv.buffer = ir;
  input.connect(dry).connect(output);
  input.connect(conv).connect(wet).connect(output);
  return { input, output, all: [input, output, dry, wet, conv] };
};
