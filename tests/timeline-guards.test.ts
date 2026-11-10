import { describe, it, expect } from 'vitest';
import { emptyProject, defaultTransform } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { TimelineError, addClip, moveClip, splitClip, trimClip } from '../src/core/timeline';

const mk = (id: string, over: Partial<Clip> = {}): Clip => ({
  id,
  mediaId: 'm1',
  kind: 'video',
  start: 0,
  in: 0,
  out: 10,
  transform: defaultTransform(),
  volume: 1,
  fit: 'fit',
  ...over,
});

function withClips(...clips: Clip[]): Project {
  const p = emptyProject();
  return { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, clips } : t)) };
}

const BAD = [NaN, Infinity, -Infinity];

describe('timeline rejects non-finite times', () => {
  it.each(BAD)('splitClip(%s) throws TimelineError and leaves the project alone', (bad) => {
    const p = withClips(mk('c1'));
    expect(() => splitClip(p, 'c1', bad)).toThrow(TimelineError);
    expect(p.tracks[0].clips).toEqual([mk('c1')]);
  });

  it.each(BAD)('trimClip start/end at %s throws TimelineError', (bad) => {
    const p = withClips(mk('c1', { start: 2, in: 2 }));
    expect(() => trimClip(p, 'c1', 'start', bad)).toThrow(TimelineError);
    expect(() => trimClip(p, 'c1', 'end', bad)).toThrow(TimelineError);
  });

  it.each(BAD)('moveClip to %s throws TimelineError', (bad) => {
    const p = withClips(mk('c1'));
    expect(() => moveClip(p, 'c1', bad)).toThrow(TimelineError);
  });

  it.each(BAD)('addClip with a %s start, in or out throws TimelineError', (bad) => {
    const p = withClips();
    const t = p.tracks[0].id;
    expect(() => addClip(p, t, mk('a', { start: bad }))).toThrow(TimelineError);
    expect(() => addClip(p, t, mk('b', { in: bad }))).toThrow(TimelineError);
    expect(() => addClip(p, t, mk('c', { out: bad }))).toThrow(TimelineError);
  });
});

describe('trimClip neighbours', () => {
  it('rejects an end trim that would overlap the next clip and a start trim over the previous one', () => {
    const p = withClips(mk('a', { start: 0, out: 4 }), mk('b', { start: 5, in: 2, out: 6 }), mk('c', { start: 9, out: 3 }));
    expect(() => trimClip(p, 'b', 'end', 9.5)).toThrow(TimelineError);
    expect(() => trimClip(p, 'b', 'start', 3.5)).toThrow(TimelineError);
    // Touching the neighbours exactly is fine.
    expect(() => trimClip(p, 'b', 'end', 9)).not.toThrow();
    expect(() => trimClip(p, 'b', 'start', 4)).not.toThrow();
  });
});
