import { describe, it, expect } from 'vitest';
import { MAX_IMAGE_SIDE, cappedSize } from '../src/render/images';

describe('cappedSize', () => {
  it('scales the long side down to the cap, preserving aspect', () => {
    expect(cappedSize({ width: 6000, height: 4000 }, 3840)).toEqual({ width: 3840, height: 2560 });
    expect(cappedSize({ width: 3024, height: 4032 }, 3840)).toEqual({ width: 2880, height: 3840 });
  });

  it('never upscales and never returns an empty side', () => {
    expect(cappedSize({ width: 640, height: 480 }, 3840)).toEqual({ width: 640, height: 480 });
    expect(cappedSize({ width: 100000, height: 1 }, 3840)).toEqual({ width: 3840, height: 1 });
  });

  it('caps at 4K', () => {
    expect(MAX_IMAGE_SIDE).toBe(3840);
  });
});
