// Plan 5B Task 6 (D13, Q10): a lower third's built-in slide is off at an edge whose clip has an in/out preset; with
// both slides on (no preset) the 5A/Plan 4 smoothstep is unchanged bit for bit.
import { describe, it, expect } from 'vitest';
import { SLIDE_SECONDS, animationAt, overlayAnimation } from '../src/render/overlays/draw';

const legacy = (time: number, duration: number): number => {
  const e = Math.min(1, Math.max(0, Math.min(time, duration - time) / SLIDE_SECONDS));
  return e * e * (3 - 2 * e);
};

describe('overlayAnimation built-in slide flags', () => {
  it('no flags / both on: identical to the original formula at 400 times', () => {
    for (let i = 0; i <= 400; i++) {
      const t = (i / 400) * 3;
      expect(overlayAnimation('lowerThird', t, 3).slide).toBe(legacy(t, 3));
      expect(overlayAnimation('lowerThird', t, 3, { in: true, out: true }).slide).toBe(legacy(t, 3));
    }
  });

  it('an In preset turns the slide-in off (fully in from frame 0); the slide-out stays, and vice versa', () => {
    expect(overlayAnimation('lowerThird', 0, 2, { in: false, out: true }).slide).toBe(1);
    expect(overlayAnimation('lowerThird', 0.1, 2, { in: false, out: true }).slide).toBe(1);
    expect(overlayAnimation('lowerThird', 1.9, 2, { in: false, out: true }).slide).toBe(legacy(1.9, 2));
    expect(overlayAnimation('lowerThird', 1.9, 2, { in: true, out: false }).slide).toBe(1);
    expect(overlayAnimation('lowerThird', 0.1, 2, { in: true, out: false }).slide).toBe(legacy(0.1, 2));
    expect(overlayAnimation('lowerThird', 0, 0.3, { in: false, out: false }).slide).toBe(1);
    expect(animationAt('lowerThird', 0, 2, { in: false, out: true }).slide).toBe(1);
  });

  it('other overlay types ignore the flags', () => {
    expect(overlayAnimation('progressBar', 0.5, 2, { in: false, out: false })).toEqual({ slide: 1, fill: 0.25 });
    expect(overlayAnimation('sticker', 0.1, 2, { in: false, out: true })).toEqual({ slide: 1, fill: 1 });
  });
});
