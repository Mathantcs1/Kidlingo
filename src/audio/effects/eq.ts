// Three-band EQ: low shelf 200 Hz, peaking 1 kHz (Q 1), high shelf 4 kHz; gains in dB.
import type { EffectBuilder } from './types';

export const buildEq: EffectBuilder = (ctx, q) => {
  const band = (type: BiquadFilterType, frequency: number, gain: number): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.gain.value = gain;
    if (type === 'peaking') f.Q.value = 1;
    return f;
  };
  const low = band('lowshelf', 200, q.low);
  const mid = band('peaking', 1000, q.mid);
  const high = band('highshelf', 4000, q.high);
  low.connect(mid).connect(high);
  return { input: low, output: high, all: [low, mid, high] };
};
