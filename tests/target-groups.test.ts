// Plan 5 Task 7: group edits (several animation targets in ONE project edit) behind the chroma key colour.
import { describe, expect, it } from 'vitest';
import type { AnimTarget } from '../src/core/keyframeEdits';
import { setEffectParamsAt, setTargetsAnimated, setTargetsAt } from '../src/core/targetGroups';
import { TimelineError } from '../src/core/timeline';
import { defaultParams } from '../src/core/videoEffects';
import { clipOf, k, mirrorFx, project } from './keyframe-fixtures';

const key = (param: string): AnimTarget => ({ kind: 'effect', effectId: 'ck', param });
const KEY3 = [key('keyR'), key('keyG'), key('keyB')];
const chroma = () => ({ id: 'ck', type: 'chromaKey' as const, enabled: true, params: defaultParams('chromaKey') });
const base = () => project({ effects: [chroma(), mirrorFx()] });
const effectOf = (p: ReturnType<typeof base>) => clipOf(p, 'c').effects[0];

describe('setTargetsAnimated', () => {
  it('on: one key per target at the playhead holding each static value; off: statics keep the shown value', () => {
    const p = base();
    const on = setTargetsAnimated(p, 'c', KEY3, true, 11);
    expect(effectOf(on).keys).toEqual({ keyR: [k(3, 0)], keyG: [k(3, 1)], keyB: [k(3, 0)] });
    expect(setTargetsAnimated(on, 'c', KEY3, true, 11)).toBe(on);
    const off = setTargetsAnimated(on, 'c', KEY3, false, 12);
    expect(effectOf(off).keys).toBeUndefined();
    expect(effectOf(off).params).toEqual(effectOf(p).params);
    expect(setTargetsAnimated(p, 'c', KEY3, false, 11)).toBe(p);
  });

  it('is all or nothing: a non-animatable target refuses the whole edit', () => {
    const p = base();
    expect(() => setTargetsAnimated(p, 'c', [key('keyR'), { kind: 'effect', effectId: 'mr', param: 'mode' }], true, 11)).toThrow(TimelineError);
  });
});

describe('setEffectParamsAt (the chroma key colour)', () => {
  const colour = { keyR: 0.2, keyG: 0.4, keyB: 0.6 };

  it('static: the same result as the static edit', () => {
    const q = setEffectParamsAt(base(), 'c', 'ck', colour, 11);
    expect(effectOf(q).params).toMatchObject(colour);
    expect(effectOf(q).keys).toBeUndefined();
  });

  it('animated: ONE edit writes the three keys at the playhead', () => {
    const p = setTargetsAnimated(base(), 'c', KEY3, true, 11);
    const q = setEffectParamsAt(p, 'c', 'ck', colour, 12);
    expect(effectOf(q).keys).toEqual({
      keyR: [k(3, 0), k(4, 0.2)], keyG: [k(3, 1), k(4, 0.4)], keyB: [k(3, 0), k(4, 0.6)],
    });
    // Static stored values are untouched while animated.
    expect(effectOf(q).params).toEqual(effectOf(p).params);
    expect(setEffectParamsAt(q, 'c', 'ck', colour, 12)).toBe(q);
  });

  it('animated: refused off the clip, nothing written', () => {
    const p = setTargetsAnimated(base(), 'c', KEY3, true, 11);
    expect(() => setEffectParamsAt(p, 'c', 'ck', colour, 5)).toThrow(/playhead onto the clip/);
  });

  it('a partly animated colour writes keys where animated and the static value elsewhere', () => {
    const p = setTargetsAnimated(base(), 'c', [key('keyR')], true, 11);
    const q = setEffectParamsAt(p, 'c', 'ck', colour, 12);
    expect(effectOf(q).keys).toEqual({ keyR: [k(3, 0), k(4, 0.2)] });
    expect(effectOf(q).params).toMatchObject({ keyG: 0.4, keyB: 0.6 });
  });
});

describe('setTargetsAt', () => {
  it('upserts every target in one edit and returns the same project when nothing changes', () => {
    const p = setTargetsAnimated(base(), 'c', KEY3, true, 11);
    const q = setTargetsAt(p, 'c', KEY3.map((target, i) => ({ target, value: [0, 1, 0][i] })), 11);
    expect(q).toBe(p);
  });
});
