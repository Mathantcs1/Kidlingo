// Plan 5B Task 8: a Continue (offset) position loop repeats the keyed path SHIFTED by (last - first) per cycle; the
// motion path draws the next cycles that start in the visible range faintly (at most MAX_DRAWN_CYCLES, and the count).
import { describe, expect, it } from 'vitest';
import type { Clip, KeyLoop } from '../src/core/model';
import { cachedMotionPath, MAX_DRAWN_CYCLES, offsetCycles } from '../src/ui/motionPathMath';
import { mk, pk } from './keyframe-fixtures';

const F = { width: 1920, height: 1080 };
// Video 'c' shows local 2..6 (keys at 2 and 3: period 1 s, shift (100, 50)).
const clip = (loop?: KeyLoop): Clip => mk('c', { keys: { position: [pk(2, 0, 0), pk(3, 100, 50)], ...(loop ? { loops: { position: loop } } : {}) } });

describe('offset loop cycles on the motion path', () => {
  it('no loop, repeat or ping-pong: nothing extra is drawn', () => {
    expect(offsetCycles(clip())).toEqual({ cycles: [], more: false });
    expect(offsetCycles(clip({ mode: 'repeat', count: null }))).toEqual({ cycles: [], more: false });
    expect(offsetCycles(clip({ mode: 'pingPong', count: null }))).toEqual({ cycles: [], more: false });
  });
  it('offset: cycles starting inside the visible range, shifted by c x (last - first), capped by the count', () => {
    // Cycles start at 3, 4, 5 (all < 6): three cycles.
    expect(offsetCycles(clip({ mode: 'offset', count: null }))).toEqual({ cycles: [{ x: 100, y: 50 }, { x: 200, y: 100 }, { x: 300, y: 150 }], more: false });
    expect(offsetCycles(clip({ mode: 'offset', count: 1 }))).toEqual({ cycles: [{ x: 100, y: 50 }], more: false });
  });
  it('at most MAX_DRAWN_CYCLES are drawn; `more` says the loop continues', () => {
    const long = { ...clip({ mode: 'offset', count: null }), out: 20 };
    const r = offsetCycles(long);
    expect(r.cycles).toHaveLength(MAX_DRAWN_CYCLES);
    expect(r.more).toBe(true);
    expect(offsetCycles({ ...long, keys: { ...long.keys, loops: { position: { mode: 'offset', count: 3 } } } }).more).toBe(false);
  });
  it('the cached path follows a loop change on the same key list', () => {
    const a = clip();
    const b: Clip = { ...a, keys: { ...a.keys, loops: { position: { mode: 'offset', count: null } } } };
    expect(cachedMotionPath(a, 30, F).cycles).toHaveLength(0);
    expect(cachedMotionPath(b, 30, F).cycles).toHaveLength(3);
  });
});
