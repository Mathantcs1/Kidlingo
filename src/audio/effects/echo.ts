// Echo: dry + mix × (delayed signal fed back through `feedback`): repeats every `delay` s, each × feedback.
import type { EffectBuilder } from './types';

export const buildEcho: EffectBuilder = (ctx, q) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = q.delay;
  const feedback = ctx.createGain();
  feedback.gain.value = q.feedback;
  const wet = ctx.createGain();
  wet.gain.value = q.mix;
  input.connect(output);
  input.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(output);
  return { input, output, all: [input, output, delay, feedback, wet] };
};
