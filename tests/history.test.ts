import { describe, it, expect } from 'vitest';
import { createHistory, commit, undo, redo } from '../src/state/history';

describe('history', () => {
  it('commit -> undo -> redo round trip', () => {
    let h = createHistory(1);
    h = commit(h, 2);
    expect(h).toEqual({ past: [1], present: 2, future: [] });
    h = undo(h);
    expect(h).toEqual({ past: [], present: 1, future: [2] });
    h = redo(h);
    expect(h).toEqual({ past: [1], present: 2, future: [] });
  });

  it('commit after undo clears future', () => {
    let h = commit(createHistory(1), 2);
    h = undo(h);
    h = commit(h, 3);
    expect(h.future).toEqual([]);
    expect(h.present).toBe(3);
  });

  it('limit=3 keeps 3 past entries', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 6; i++) h = commit(h, i, 3);
    expect(h.past).toEqual([3, 4, 5]);
    expect(h.present).toBe(6);
  });

  it('default limit is 100', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 150; i++) h = commit(h, i);
    expect(h.past).toHaveLength(100);
  });

  it('commit is a no-op when next === present', () => {
    const h = createHistory({ a: 1 });
    expect(commit(h, h.present)).toBe(h);
  });

  it('undo/redo on empty stacks return the same object', () => {
    const h = createHistory(1);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});
