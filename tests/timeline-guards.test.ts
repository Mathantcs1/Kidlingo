import { describe, it, expect } from 'vitest';
import { emptyProject, defaultTransform } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { joinClips } from '../src/core/merge';
import { TimelineError, addClip, deleteClip, moveClip, splitClip, trimClip } from '../src/core/timeline';
import { addTrack } from '../src/core/tracks';

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

describe('lock guards', () => {
  const lockAll = (p: Project): Project => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, locked: true })) });
  const lockTrack = (p: Project, i: number): Project => ({
    ...p,
    tracks: p.tracks.map((t, j) => (j === i ? { ...t, locked: true } : t)),
  });
  const unlock = (p: Project): Project => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, locked: false })) });
  const LOCKED = 'Track is locked';

  it('addClip refuses a locked target and works after unlocking', () => {
    const p = lockAll(withClips());
    const before = JSON.stringify(p);
    expect(() => addClip(p, p.tracks[0].id, mk('a'))).toThrow(LOCKED);
    expect(() => addClip(p, p.tracks[0].id, mk('a'))).toThrow(TimelineError);
    expect(JSON.stringify(p)).toBe(before);
    expect(addClip(unlock(p), p.tracks[0].id, mk('a')).tracks[0].clips).toHaveLength(1);
  });

  it('trimClip refuses a locked track', () => {
    const p = lockAll(withClips(mk('c1')));
    expect(() => trimClip(p, 'c1', 'end', 5)).toThrow(LOCKED);
    expect(trimClip(unlock(p), 'c1', 'end', 5).tracks[0].clips[0].out).toBe(5);
  });

  it('splitClip refuses a locked track', () => {
    const p = lockAll(withClips(mk('c1')));
    expect(() => splitClip(p, 'c1', 5)).toThrow(LOCKED);
    expect(splitClip(unlock(p), 'c1', 5).tracks[0].clips).toHaveLength(2);
  });

  it('deleteClip (plain and ripple) refuses a locked track', () => {
    const p = lockAll(withClips(mk('c1')));
    expect(() => deleteClip(p, 'c1')).toThrow(LOCKED);
    expect(() => deleteClip(p, 'c1', { ripple: true })).toThrow(LOCKED);
    expect(deleteClip(unlock(p), 'c1', { ripple: true }).tracks[0].clips).toHaveLength(0);
  });

  it('moveClip refuses a locked source track', () => {
    const base = withClips(mk('c1'));
    const p = lockTrack(base, 0);
    expect(() => moveClip(p, 'c1', 3)).toThrow(LOCKED);
    expect(moveClip(unlock(p), 'c1', 3).tracks[0].clips[0].start).toBe(3);
  });

  it('moveClip refuses a locked target track', () => {
    const base = addTrack(withClips(mk('c1')), 'video');
    const target = base.tracks[1].id;
    const p = lockTrack(base, 1);
    expect(() => moveClip(p, 'c1', 0, target)).toThrow(LOCKED);
    expect(moveClip(unlock(p), 'c1', 0, target).tracks[1].clips).toHaveLength(1);
  });

  it('joinClips refuses a locked track', () => {
    const p = lockAll(withClips(mk('a', { out: 2 }), mk('b', { start: 2, out: 2 })));
    expect(() => joinClips(p, ['a', 'b'])).toThrow(LOCKED);
    expect(joinClips(unlock(p), ['a', 'b']).tracks[0].clips).toHaveLength(2);
  });

  it('leaves unlocked tracks editable while another track is locked', () => {
    const p = lockTrack(withClips(mk('c1')), 1);
    expect(() => splitClip(p, 'c1', 5)).not.toThrow();
  });
});
