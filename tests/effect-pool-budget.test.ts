// The effect target pool's byte budget (Plan 4 Task 7 review): LRU sizes are evicted (scratches first) while the
// planned bytes exceed the budget, never the entry of the current call.
import { describe, expect, it } from 'vitest';
import { POOL_BYTE_BUDGET, TargetPool } from '../src/render/effects/passResources';
import type { Size } from '../src/render/geometry';
import { fakeGl } from './fake-gl';

const bytes = (s: Size): number => s.width * s.height * 4;
const A = { width: 16, height: 16 };
const B = { width: 16, height: 17 };
const C = { width: 17, height: 16 };

/** Binds a pair's two targets (both allocated), or also the scratch with `scratch`, as one pipeline run would. */
function use(pool: TargetPool, size: Size, scratch = false): void {
  const a = pool.target(size, []);
  a.bind(size.width, size.height);
  const b = pool.target(size, [a.slot.tex]);
  b.bind(size.width, size.height);
  if (scratch) pool.target(size, [a.slot.tex, b.slot.tex]).bind(size.width, size.height);
}

describe('TargetPool byte budget', () => {
  it('defaults to 640 MiB', () => {
    expect(POOL_BYTE_BUDGET).toBe(640 * 1024 * 1024);
  });

  it('alternating three sizes stays within the budget after every call (LRU evicted)', () => {
    const { gl } = fakeGl();
    const budget = 2 * bytes(B) * 2 + 100; // any two pairs fit, three do not
    const pool = new TargetPool(gl, 3, budget);
    for (const s of [A, B, C, A, B, C, A]) {
      use(pool, s);
      expect(pool.stats().bytes, `after ${s.width}x${s.height}`).toBeLessThanOrEqual(budget);
      expect(pool.stats().targets).toBeLessThanOrEqual(4);
    }
  });

  it('drops the least recently used scratch before evicting any pair', () => {
    const { gl, count } = fakeGl();
    // A pair + scratch (3 targets), B pair, C pair: 7 targets; one scratch less (6 targets) fits.
    const pool = new TargetPool(gl, 3, 6 * bytes(C));
    use(pool, A, true);
    use(pool, B);
    use(pool, C);
    expect(count('deleteFramebuffer')).toBe(1);
    expect(pool.stats().targets).toBe(6);
    // A's pair survived: using A again allocates nothing new.
    const before = count('texImage2D');
    use(pool, A);
    expect(count('texImage2D')).toBe(before);
  });

  it('never evicts the entry of the current call, even when it alone exceeds the budget', () => {
    const { gl, count } = fakeGl();
    const pool = new TargetPool(gl, 3, bytes(A));
    use(pool, B);
    use(pool, A, true);
    // B was evicted; A (3 targets, 3× the budget) is kept while in use.
    expect(count('deleteFramebuffer')).toBe(2);
    expect(pool.stats()).toEqual({ targets: 3, bytes: 3 * bytes(A) });
    use(pool, A, true);
    expect(count('deleteFramebuffer')).toBe(2);
    pool.dispose();
    expect(pool.stats()).toEqual({ targets: 0, bytes: 0 });
    expect(count('deleteFramebuffer')).toBe(count('createFramebuffer'));
  });
});
