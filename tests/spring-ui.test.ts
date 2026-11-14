// Plan 5B Task 8: the spring in the ease editor - the "does not settle" residual is guarded (damping 0 never settles,
// infinite/invalid seconds never give NaN), and the editor's curve uses the SEGMENT's physical seconds.
import { describe, expect, it } from 'vitest';
import { easeAt, SPRING_DEFAULT } from '../src/core/easing';
import type { Ease } from '../src/core/easing';
import { SPRING_PRESETS, springResidual } from '../src/core/spring';
import { curvePath, FRAME, segmentSeconds } from '../src/ui/easeEditorMath';
import { springNote } from '../src/ui/SpringFields';
import { k } from './keyframe-fixtures';

const wobbly = SPRING_PRESETS.find((p) => p.key === 'wobbly')!.spring;

describe('springResidual guard', () => {
  it('is finite for every input; damping 0 never settles; infinite time settles a damped spring', () => {
    const undamped = { stiffness: 170, damping: 0, mass: 1 };
    expect(springResidual(undamped, Infinity)).toBe(1);
    expect(springResidual(SPRING_DEFAULT, Infinity)).toBe(0);
    for (const s of [NaN, -1, 0, -Infinity]) expect(Number.isFinite(springResidual(undamped, s))).toBe(true);
    expect(springResidual(SPRING_DEFAULT, NaN)).toBe(springResidual(SPRING_DEFAULT, 1)); // invalid seconds read as 1, like springEase
    expect(springResidual(SPRING_DEFAULT, 2)).toBeLessThan(0.02);
    expect(springResidual(wobbly, 0.3)).toBeGreaterThan(0.02);
  });
});

describe('the spring note', () => {
  it('appears only when the spring is still moving at the next key (|1 - x(S)| > 0.02)', () => {
    expect(springNote(SPRING_DEFAULT, 1.2)).toBeNull();
    expect(springNote(wobbly, 0.3)).toMatch(/still moving/i);
    expect(springNote({ stiffness: 170, damping: 0, mass: 1 }, Infinity)).toMatch(/still moving/i);
  });
});

describe('segment seconds and the drawn curve', () => {
  it('a key owns the segment to the next key; a last key owns none', () => {
    const list = [k(0.4, 0), k(1.6, 1), k(1.9, 0.5)];
    expect(segmentSeconds(list, 0.4)).toBeCloseTo(1.2, 12);
    expect(segmentSeconds(list, 1.6)).toBeCloseTo(0.3, 12);
    expect(segmentSeconds(list, 1.9)).toBeNull();
    expect(segmentSeconds(undefined, 0)).toBeNull();
  });
  it('the spring curve depends on the seconds; other eases do not', () => {
    const spring: Ease = { kind: 'spring', spring: wobbly };
    expect(curvePath(spring, FRAME, 64, 0.3)).not.toBe(curvePath(spring, FRAME, 64, 2));
    expect(curvePath({ kind: 'easeIn' }, FRAME, 64, 0.3)).toBe(curvePath({ kind: 'easeIn' }, FRAME, 64, 2));
    // The plotted points follow easeAt(e, u, seconds).
    const d = curvePath(spring, FRAME, 4, 0.3);
    const y = Number(d.split('L')[2].split(' ')[1]); // the point at u = 0.5
    expect(y).toBeCloseTo(FRAME.pad + (2 - Math.min(2, Math.max(-1, easeAt(spring, 0.5, 0.3)))) * FRAME.sy, 2);
  });
});
