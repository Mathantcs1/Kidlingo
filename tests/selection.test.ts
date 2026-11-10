import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/core/model';
import { addTrack, removeTrack } from '../src/core/tracks';
import { clampPlayhead, pruneActiveTrack, pruneSelection } from '../src/state/selection';

describe('pruneActiveTrack', () => {
  it('keeps an existing track id and null', () => {
    const p = emptyProject();
    expect(pruneActiveTrack(p, p.tracks[0].id)).toBe(p.tracks[0].id);
    expect(pruneActiveTrack(p, null)).toBeNull();
  });

  it('returns null for an id that is not a track (any more)', () => {
    const p = addTrack(emptyProject(), 'video');
    const gone = p.tracks[1].id;
    expect(pruneActiveTrack(removeTrack(p, gone), gone)).toBeNull();
    expect(pruneActiveTrack(p, 'nope')).toBeNull();
  });
});

describe('pruneSelection / clampPlayhead', () => {
  it('pruneSelection returns the same array when nothing is dropped', () => {
    const sel = ['x'];
    expect(pruneSelection(sel, emptyProject())).toEqual([]);
    const none: string[] = [];
    expect(pruneSelection(none, emptyProject())).toBe(none);
  });

  it('clampPlayhead limits to the timeline end (0 when empty)', () => {
    expect(clampPlayhead(5, emptyProject())).toBe(0);
    expect(clampPlayhead(0, emptyProject())).toBe(0);
  });
});
