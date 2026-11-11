// High-pass and low-pass: 12 dB/octave Butterworth biquads.
import type { EffectBuilder } from './types';
import { single } from './types';

/** Web Audio's lowpass/highpass Q is a resonance in dB; -3.01 dB is Q = 1/√2 (Butterworth, no peak). */
const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);

const filter = (type: 'lowpass' | 'highpass'): EffectBuilder => (ctx, q) => {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = q.freq;
  f.Q.value = BUTTERWORTH_Q_DB;
  return single(f);
};

export const buildHighpass = filter('highpass');
export const buildLowpass = filter('lowpass');
