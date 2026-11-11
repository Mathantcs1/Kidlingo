// Task 13a fix round 1 (M2): an adjustment clip has no frame to put back, so Reset transform must not touch it (its
// opacity is the only transform value it uses, and reset would have set it back to 1).
import { describe, expect, it } from 'vitest';
import { addAdjustmentClip } from '../src/core/adjustment';
import type { Clip, Project } from '../src/core/model';
import { resetClipTransform, setClipTransform } from '../src/ui/transformEdits';
import { all, base } from './overlay-fixtures';

const adjustmentOf = (p: Project): Clip => all(p).find((c) => c.kind === 'adjustment')!;

describe('resetClipTransform on an adjustment clip', () => {
  it('is a no-op returning the same project: opacity (and the ignored rest) are kept', () => {
    const p = addAdjustmentClip(base(), 'v', 6);
    const id = adjustmentOf(p).id;
    const q = setClipTransform(p, id, { opacity: 0.4, x: 10 });
    expect(adjustmentOf(q).transform.opacity).toBe(0.4);
    expect(resetClipTransform(q, id)).toBe(q);
    expect(resetClipTransform(p, id)).toBe(p);
  });
});
