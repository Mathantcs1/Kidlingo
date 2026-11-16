// Plan 5C Task 5: composite sizing with the transition layers (4 targets fit a 4K frame at full size; 5 are scaled down).
import { describe, it, expect } from 'vitest';
import { compositeSize } from '../src/render/blend';
import { COMPOSITE_BYTE_BUDGET } from '../src/render/compositeBuffer';

describe('compositeSize with transitions', () => {
  it('4 targets of 3840x2160 and 2160x3840 stay at the full viewport (126.6 MiB <= 128 MiB)', () => {
    expect(compositeSize({ width: 3840, height: 2160 }, 16384, 4, COMPOSITE_BYTE_BUDGET)).toEqual({ width: 3840, height: 2160 });
    expect(compositeSize({ width: 2160, height: 3840 }, 16384, 4, COMPOSITE_BYTE_BUDGET)).toEqual({ width: 2160, height: 3840 });
  });
  it('5 targets (a non-Normal transition) are scaled down to the budget, keeping the shape', () => {
    const s = compositeSize({ width: 3840, height: 2160 }, 16384, 5, COMPOSITE_BYTE_BUDGET);
    expect(s.width).toBeLessThan(3840);
    expect(s.width * s.height * 4 * 5).toBeLessThanOrEqual(COMPOSITE_BYTE_BUDGET);
    expect(Math.abs(s.width / s.height - 16 / 9)).toBeLessThan(0.01);
  });
});
