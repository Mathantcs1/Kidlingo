// Plan 5C Task 10 (D11): joining clips with a transition at every new cut between the selected clips.
import { describe, it, expect } from 'vitest';
import { joinClips, joinTransitionReport } from '../src/core/merge';
import { addTransition } from '../src/core/transitionEdits';
import { FPS, base, mk, trackOf } from './transition-fixtures';

const spec = { type: 'dissolve' as const, duration: 1 };
/** a 0..4, gap, b 5..9, gap, c 11..15 (footage 2..6 on a 60 s file: 2 s of handle either side). */
const gaps = () => base([mk('a', 0, 2, 6), mk('b', 5, 2, 6), mk('c', 11, 2, 6)]);

describe('joinClips with a transition', () => {
  it('adds one transition per new cut between the selected clips, in ONE result', () => {
    const p = joinClips(gaps(), ['a', 'b', 'c'], { transition: spec });
    const t = trackOf(p).transitions!;
    expect(t.map((x) => [x.fromClipId, x.toClipId, x.type, x.duration])).toEqual([['a', 'b', 'dissolve', 1], ['b', 'c', 'dissolve', 1]]);
    expect(trackOf(p).clips.map((c) => c.start)).toEqual([0, 4, 8]);
  });
  it('without the option nothing is added (as before)', () => {
    expect(trackOf(joinClips(gaps(), ['a', 'b', 'c'])).transitions).toBeUndefined();
  });
  it('only cuts BETWEEN the selected clips get one, not the cut to an unselected neighbour', () => {
    const p = joinClips(base([mk('a', 0, 2, 6), mk('b', 5, 2, 6), mk('c', 9, 2, 6)]), ['a', 'b'], { transition: spec });
    expect(trackOf(p).transitions!.map((x) => [x.fromClipId, x.toClipId])).toEqual([['a', 'b']]);
  });
  it('a cut that already has a transition keeps it (no second one, same id)', () => {
    const had = addTransition(base(), 'v', 'a', 'b', { type: 'wipe', duration: 0.4 });
    const id = trackOf(had).transitions![0].id;
    const p = joinClips(had, ['a', 'b', 'c'], { transition: spec });
    const t = trackOf(p).transitions!;
    expect(t).toHaveLength(2);
    expect(t.find((x) => x.fromClipId === 'a')).toMatchObject({ id, type: 'wipe', duration: 0.4 });
  });
  it('a cut without footage beyond it is skipped; a short handle shortens the transition to whole even frames', () => {
    const p = joinClips(base([mk('a', 0, 2, 6), mk('b', 5, 0, 4), mk('c', 11, 0.2, 4.2)]), ['a', 'b', 'c'], { transition: spec });
    const t = trackOf(p).transitions!;
    expect(t).toHaveLength(1); // b has nothing before its in (0): a|b skipped
    expect([t[0].fromClipId, t[0].toClipId]).toEqual(['b', 'c']);
    expect(t[0].duration).toBeLessThan(1);
    expect(Math.round(t[0].duration * FPS) % 2).toBe(0);
  });
  it('a locked track still refuses the whole join', () => {
    const p = gaps();
    p.tracks[0] = { ...p.tracks[0], locked: true };
    expect(() => joinClips(p, ['a', 'b'], { transition: spec })).toThrow(/locked/i);
  });
});

describe('joinTransitionReport', () => {
  it('counts added, shortened and skipped cuts', () => {
    const p = base([mk('a', 0, 2, 6), mk('b', 5, 0, 4), mk('c', 11, 0.2, 4.2)]);
    expect(joinTransitionReport(p, ['a', 'b', 'c'], spec)).toEqual({ added: 1, shortened: 1, skipped: 1 });
    expect(joinTransitionReport(gaps(), ['a', 'b', 'c'], spec)).toEqual({ added: 2, shortened: 0, skipped: 0 });
  });
  it('does not count a cut that already had a transition', () => {
    const had = addTransition(base(), 'v', 'a', 'b', { type: 'wipe' });
    expect(joinTransitionReport(had, ['a', 'b', 'c'], spec)).toEqual({ added: 1, shortened: 0, skipped: 0 });
  });
});
