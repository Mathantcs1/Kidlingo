// Plan 5D Task 9: throughput guard: stereo 48 kHz stretched at least 10x faster than real time (best of 5).
import { describe, it, expect } from 'vitest';
import { defaultClipAudio, defaultTransform } from '../src/core/model';
import type { Clip } from '../src/core/model';
import { clipDuration } from '../src/core/clipTime';
import { stretch } from '../src/audio/retime/wsola';

const RATE = 48000;
const clip: Clip = {
  id: 'a', mediaId: 'm', kind: 'audio', start: 0, in: 0, out: 10, speed: 1.3, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal',
};

describe('stretch throughput', () => {
  it('renders stereo 48 kHz at >= 10x real time', () => {
    const left = Float32Array.from({ length: 10 * RATE }, (_, i) => 0.3 * Math.sin(i * 0.05) + 0.1 * Math.sin(i * 0.31));
    const right = Float32Array.from(left, (v, i) => v * 0.8 + 0.05 * Math.sin(i * 0.011));
    const seconds = clipDuration(clip);
    let best = Infinity;
    for (let r = 0; r < 5; r++) {
      const t0 = performance.now();
      stretch({ clip, input: [left, right], inFirst: 0, rate: RATE, outFirst: 0, outLength: Math.round(seconds * RATE) });
      best = Math.min(best, performance.now() - t0);
    }
    const speedup = (seconds * 1000) / best;
    console.log(`wsola: ${speedup.toFixed(0)}x real time`);
    expect(speedup).toBeGreaterThan(10);
  });
});
