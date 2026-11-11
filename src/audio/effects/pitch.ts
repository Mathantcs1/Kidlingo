// Pitch shift (D3): two modulated delay taps, half a period apart, crossfaded so their gains always sum to 1.
// Built from DelayNodes driven by looped control buffers: no AudioWorklet, the same in live and offline contexts.
import { PITCH_WINDOW, pitchCurves } from './pitchMath';
import type { EffectBuilder } from './types';

/**
 * Lead before a live context's clock when the clip's phase origin is already past (the start must be in the future).
 * Must stay below the mixer's START_LEAD (0.05 s, mixer.ts): the first window's gate opens START_LEAD after the
 * clock read, and the control loops must be running by then, or the shifter is silent for the difference.
 */
const LIVE_LEAD = 0.02;

/** Start offset (seconds) of a control loop of `n` frames started at `start` with phase 0 at `phase0`, in whole frames. */
function loopOffset(start: number, phase0: number, n: number, sampleRate: number): number {
  const frames = Math.round((start - phase0) * sampleRate);
  return (((frames % n) + n) % n) / sampleRate;
}

/**
 * Output = Σ tap gain × input delayed by the tap's delay curve (pitchMath.pitchCurves). The control curves loop
 * with phase 0 at `at.phase0` (the clip's start), so every window of a render places the delay jumps at the same
 * timeline instants. The shifter delays its input by pitchLatency on average; the engines compensate (chainLatency).
 * At 0 semitones it is an exact pass-through.
 *
 * Known issue: near a clip's out point the taps read up to the latency past it, where there is no source audio,
 * so the last ~latency (≤ 50 ms per shifter) of a shifted clip dips; the same in live playback and export.
 */
export const buildPitch: EffectBuilder = (ctx, q, at) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  if (q.semitones === 0) {
    input.connect(output);
    return { input, output, all: [input, output] };
  }
  const { delay, gain, period } = pitchCurves(q.semitones, ctx.sampleRate);
  const curves = new AudioBuffer({ numberOfChannels: 2, length: delay.length, sampleRate: ctx.sampleRate });
  curves.copyToChannel(Float32Array.from(delay), 0);
  curves.copyToChannel(Float32Array.from(gain), 1);
  // An offline context (clock at 0 before rendering) starts exactly; a running one needs a time still ahead.
  const start = Math.max(at.phase0, ctx.currentTime > 0 ? ctx.currentTime + LIVE_LEAD : 0);
  const all: AudioNode[] = [input, output];
  for (const half of [0, 0.5]) {
    const line = ctx.createDelay(PITCH_WINDOW * 1.25);
    line.delayTime.value = 0;
    const tap = ctx.createGain();
    tap.gain.value = 0;
    const lfo = ctx.createBufferSource();
    lfo.buffer = curves;
    lfo.loop = true;
    const split = ctx.createChannelSplitter(2);
    lfo.connect(split);
    split.connect(line.delayTime, 0);
    split.connect(tap.gain, 1);
    input.connect(line).connect(tap).connect(output);
    lfo.start(start, loopOffset(start, at.phase0 - half * period, delay.length, ctx.sampleRate));
    if (at.end > start) lfo.stop(at.end + PITCH_WINDOW);
    all.push(line, tap, lfo, split);
  }
  return { input, output, all };
};
