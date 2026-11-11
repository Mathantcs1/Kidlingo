// DOM-free maths of the two-tap modulated-delay ("Jungle") pitch shifter (D3); the nodes live in pitch.ts.

/** Seconds of one modulation period (the delay sweep resets once per period, under a crossfade). */
export const PITCH_WINDOW = 0.1;

/** Playback-rate ratio of a shift of `semitones` (2 at +12, 0.5 at -12). */
export const pitchRatio = (semitones: number): number => 2 ** (semitones / 12);

/**
 * Mean delay of the shifter (seconds): half the delay sweep |1 - ratio| × PITCH_WINDOW (0 at 0 st, 50 ms at +12,
 * 25 ms at -12). The engines start the source this much earlier, so the shifted output stays time-aligned.
 */
export const pitchLatency = (semitones: number): number => (Math.abs(1 - pitchRatio(semitones)) * PITCH_WINDOW) / 2;

export interface PitchCurves {
  /** Delay (seconds) of one tap over one period, sample by sample. */
  delay: Float64Array;
  /** Gain of that tap: sin²(π·phase), 0 where the delay jumps; the other tap runs half a period later. */
  gain: Float64Array;
  /** Seconds of one period (an even number of samples, so the second tap is offset by whole samples). */
  period: number;
}

/**
 * One tap's control curves at `sampleRate`. The delay moves linearly with slope 1 - ratio, so the tap reads the
 * input at `ratio` × real speed: y(t) = x(t + latency - d(t)); it stays in [0, |1 - ratio| × period] and jumps back
 * once per period, where this tap's gain is 0. The two taps' gains (half a period apart) sum to 1.
 */
export function pitchCurves(semitones: number, sampleRate: number): PitchCurves {
  const ratio = pitchRatio(semitones);
  const n = 2 * Math.max(1, Math.round((PITCH_WINDOW * sampleRate) / 2));
  const delay = new Float64Array(n);
  const gain = new Float64Array(n);
  const top = Math.max(0, ratio - 1) * (n / sampleRate);
  for (let i = 0; i < n; i++) {
    delay[i] = top + ((1 - ratio) * i) / sampleRate;
    gain[i] = Math.sin((Math.PI * i) / n) ** 2;
  }
  return { delay, gain, period: n / sampleRate };
}
