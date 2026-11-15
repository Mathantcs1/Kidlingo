// Plan 5C Task 2: add / set / remove, refusals, same-reference no-ops.
import { describe, it, expect } from 'vitest';
import { addTransition, removeTransition, setTransition, setTransitionDuration } from '../src/core/transitionEdits';
import { NOT_ENOUGH_FOOTAGE } from '../src/core/transitionTypes';
import { FPS, base, mk, trackOf } from './transition-fixtures';

const withT = (spec = {}) => addTransition(base(), 'v', 'a', 'b', { type: 'dissolve', ...spec });
const first = (p: ReturnType<typeof base>) => trackOf(p).transitions![0];

describe('addTransition', () => {
  it('defaults: 1 s, linear for dissolve, easeInOut + left for wipe; type fields only where they apply', () => {
    expect(first(withT()).duration).toBe(1);
    expect(first(withT()).ease.kind).toBe('linear');
    const w = first(withT({ type: 'wipe' }));
    expect([w.ease.kind, w.direction, w.softness]).toEqual(['easeInOut', 'left', 0.05]);
    expect(first(withT()).direction).toBeUndefined();
    expect(first(withT({ type: 'zoom' })).amount).toBe(2);
  });
  it('shortens to the handles, rounding DOWN to whole even frames', () => {
    const p = addTransition(base([mk('a', 0, 2, 6), mk('b', 4, 0.5, 6)]), 'v', 'a', 'b', { type: 'dissolve', duration: 3 });
    expect(first(p).duration).toBe(1); // b has 0.5 s before: 2 x 0.5
    const q = addTransition(base([mk('a', 0, 2, 6), mk('b', 4, 0.51, 6)]), 'v', 'a', 'b', { type: 'dissolve', duration: 3 });
    expect(first(q).duration * FPS).toBe(30); // 1.02 s = 30.6 frames -> 30
  });
  it('refuses under 2 frames with the footage message', () => {
    expect(() => addTransition(base([mk('a', 0, 2, 6), mk('b', 4, 0, 6)]), 'v', 'a', 'b', { type: 'dissolve' })).toThrow(NOT_ENOUGH_FOOTAGE);
  });
  it('refuses a locked track, a gap, a second transition on the cut, adjustment clips, kind mismatches and bad eases', () => {
    const locked = base();
    locked.tracks[0] = { ...locked.tracks[0], locked: true };
    expect(() => addTransition(locked, 'v', 'a', 'b', { type: 'dissolve' })).toThrow(/locked/i);
    expect(() => addTransition(base(), 'v', 'a', 'c', { type: 'dissolve' })).toThrow(/meet/i);
    expect(() => addTransition(withT(), 'v', 'a', 'b', { type: 'wipe' })).toThrow(/already/i);
    expect(() => addTransition(base([mk('a', 0, 2, 6), mk('b', 4, 2, 6, { kind: 'adjustment', mediaId: '' })]), 'v', 'a', 'b', { type: 'dissolve' })).toThrow(/Adjustment/);
    expect(() => addTransition(base(), 'v', 'a', 'b', { type: 'audio' })).toThrow();
    expect(() => addTransition(base(), 'v', 'a', 'b', { type: 'wipe', ease: { kind: 'bounce' } })).toThrow(/ease/i);
  });
  it('never mutates its input', () => {
    const p = base();
    const snap = JSON.stringify(p);
    addTransition(p, 'v', 'a', 'b', { type: 'dissolve' });
    expect(JSON.stringify(p)).toBe(snap);
  });
});

describe('set / remove', () => {
  it('equal values return the same project; a type change resets type-specific fields and the ease default', () => {
    const p = withT();
    const id = first(p).id;
    expect(setTransition(p, id, { type: 'dissolve' })).toBe(p);
    expect(setTransitionDuration(p, id, 1)).toBe(p);
    const w = setTransition(p, id, { type: 'wipe', softness: 0.2, direction: 'up' });
    expect([first(w).type, first(w).softness, first(w).direction, first(w).ease.kind]).toEqual(['wipe', 0.2, 'up', 'easeInOut']);
    const back = setTransition(w, id, { type: 'dissolve' });
    expect(first(back).softness).toBeUndefined();
    expect(first(back).direction).toBeUndefined();
  });
  it('duration snaps down to even frames and clamps to what the cut allows; refuses below 2 frames', () => {
    const id = first(withT());
    const p = withT();
    expect(first(setTransitionDuration(p, first(p).id, 2.05)).duration * FPS).toBe(60); // 61.5 -> 61 -> 60
    expect(first(setTransitionDuration(p, first(p).id, 99)).duration).toBeLessThanOrEqual(4);
    expect(() => setTransitionDuration(p, first(p).id, 0.01)).toThrow(NOT_ENOUGH_FOOTAGE);
    expect(id).toBeDefined();
  });
  it('remove deletes it and the empty list is not stored; unknown ids and locked tracks are refused', () => {
    const p = withT();
    const r = removeTransition(p, first(p).id);
    expect(trackOf(r).transitions).toBeUndefined();
    expect(() => removeTransition(p, 'nope')).toThrow(/not found/i);
    const locked = { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, locked: true } : t)) };
    expect(() => removeTransition(locked, first(p).id)).toThrow(/locked/i);
    expect(() => setTransition(locked, first(p).id, { type: 'wipe' })).toThrow(/locked/i);
  });
});
