import { describe, expect, it } from 'vitest';
import { frameIndex, snapToFrame } from '../src/core/fps';
import * as pipeline from '../src/render/effects/pipeline';

describe('frameIndex / snapToFrame (moved to core, re-exported from the render pipeline)', () => {
  it('floors with a 1e-6 frame tolerance and maps bad input to 0', () => {
    expect(frameIndex(1 / 30, 30)).toBe(1);
    expect(frameIndex(7 / 30, 30)).toBe(7);
    expect(frameIndex(0.0999, 30)).toBe(2);
    expect(frameIndex(-1, 30)).toBe(0);
    expect(frameIndex(NaN, 30)).toBe(0);
    expect(frameIndex(1, 0)).toBe(0);
  });
  it('snaps to the start of the frame', () => {
    expect(snapToFrame(0.05, 30)).toBeCloseTo(1 / 30, 12);
    expect(snapToFrame(0, 30)).toBe(0);
    expect(snapToFrame(-3, 30)).toBe(0);
  });
  it('the render pipeline re-exports the very same functions', () => {
    expect(pipeline.frameIndex).toBe(frameIndex);
    expect(pipeline.snapToFrame).toBe(snapToFrame);
  });
});
