// Dev-only harness hooks for the audio clip chain (fades, pan, track volume): per-channel levels of real renders.
import { createMixer } from './audio/mixer';
import { renderMixdown } from './audio/mixdown';
import type { ScheduledPiece } from './audio/mixerTypes';
import type { Project } from './core/model';

/** RMS of channel `c` over [from, to) seconds. */
function rms(b: AudioBuffer, c: number, from: number, to: number): number {
  const data = b.getChannelData(c);
  const a = Math.max(0, Math.round(from * b.sampleRate));
  const e = Math.min(b.length, Math.round(to * b.sampleRate));
  let sum = 0;
  for (let i = a; i < e; i++) sum += data[i] * data[i];
  return e > a ? Math.sqrt(sum / (e - a)) : 0;
}

export const audioHarness = {
  /** Largest sample-to-sample step of the export mix over [from, to) seconds (both channels): clicks show up here. */
  async mixdownMaxStep(p: Project, sampleRate: number, from: number, to: number) {
    const b = await renderMixdown(p, sampleRate);
    if (!b) return null;
    const a = Math.max(1, Math.round(from * sampleRate));
    const e = Math.min(b.length, Math.round(to * sampleRate));
    let step = 0;
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = a; i < e; i++) step = Math.max(step, Math.abs(d[i] - d[i - 1]));
    }
    return step;
  },
  /**
   * Window-seam check (D7): the mix rendered in windows of `windowSeconds` versus in one pass. Returns the RMS and
   * the largest absolute value of the sample-wise difference (both channels), and the one-pass RMS and peak.
   */
  async mixdownSeam(p: Project, sampleRate: number, windowSeconds: number) {
    const cut = await renderMixdown(p, sampleRate, { windowSeconds });
    const whole = await renderMixdown(p, sampleRate, { windowSeconds: Infinity });
    if (!cut || !whole) return null;
    let sq = 0;
    let ref = 0;
    let maxDiff = 0;
    let peak = 0;
    for (let c = 0; c < 2; c++) {
      const a = cut.getChannelData(c);
      const b = whole.getChannelData(c);
      for (let i = 0; i < b.length; i++) {
        const d = a[i] - b[i];
        sq += d * d;
        ref += b[i] * b[i];
        maxDiff = Math.max(maxDiff, Math.abs(d));
        peak = Math.max(peak, Math.abs(b[i]));
      }
    }
    const n = 2 * whole.length;
    return { lengths: [cut.length, whole.length], rmsDiff: Math.sqrt(sq / n), maxDiff, rms: Math.sqrt(ref / n), peak };
  },
  /** Renders the export mixdown and returns [left, right] RMS for each [from, to) window (seconds). */
  async mixdownChannelRms(p: Project, sampleRate: number, windows: [number, number][]) {
    const b = await renderMixdown(p, sampleRate);
    if (!b) return null;
    return { length: b.length, rms: windows.map(([a, e]) => [rms(b, 0, a, e), rms(b, 1, a, e)]) };
  },
  /**
   * Plays `p` from timeline 0 through the LIVE mixer into an OfflineAudioContext (so its real graph can be read
   * back), with live windows of `windowSeconds`, until `seconds` are scheduled; renders it and compares it sample
   * by sample with the export mixdown of the same span. Returns the largest difference, the mix peak and the pieces.
   */
  async liveVersusMixdown(p: Project, seconds: number, windowSeconds: number, sampleRate: number) {
    const ctx = new OfflineAudioContext(2, Math.ceil((seconds + 0.1) * sampleRate), sampleRate);
    const schedule: ScheduledPiece[] = [];
    const mixer = createMixer({
      context: ctx as unknown as AudioContext,
      windowSeconds,
      onSchedule: (s) => schedule.push(s),
    });
    await mixer.play(p, 0);
    const ctxStart = mixer.debugClockStart();
    const covered = () => schedule.reduce((m, s) => Math.max(m, s.end), 0) >= ctxStart + seconds - 1e-9;
    for (let t0 = performance.now(); !covered() && performance.now() - t0 < 10_000; ) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const live = await ctx.startRendering();
    mixer.stop();
    const mix = await renderMixdown(p, sampleRate);
    if (!mix) return null;
    const shift = Math.round(ctxStart * sampleRate);
    const n = Math.round(seconds * sampleRate);
    let maxDiff = 0;
    let peak = 0;
    for (let c = 0; c < 2; c++) {
      const a = live.getChannelData(c);
      const b = mix.getChannelData(c);
      for (let i = 0; i < n; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(a[i + shift] - b[i]));
        peak = Math.max(peak, Math.abs(b[i]));
      }
    }
    return { maxDiff, peak, schedule, ctxStart, covered: covered() };
  },
};
