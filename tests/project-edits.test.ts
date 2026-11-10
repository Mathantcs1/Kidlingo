import { describe, it, expect } from 'vitest';
import { fitTransform } from '../src/core/merge';
import { defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import {
  appendMedia,
  clipsUsingMedia,
  deleteClips,
  dropMedia,
  mergeClips,
  projectHasWork,
  removeMediaFromProject,
  replaceWithMedia,
  rippleDeleteClips,
  setClipFit,
  setClipVolume,
  splitAt,
} from '../src/ui/edits';

const video: MediaRef = { id: 'v', name: 'v.mp4', kind: 'video', duration: 10, width: 1920, height: 1080, fps: 30, hasAudio: true };
const other: MediaRef = { ...video, id: 'w', name: 'w.mp4' };
const tone: MediaRef = { id: 't', name: 't.wav', kind: 'audio', duration: 10, hasAudio: true };

const clip = (id: string, start: number, dur: number, mediaId = 'v', kind: Clip['kind'] = 'video'): Clip => ({
  id,
  mediaId,
  kind,
  start,
  in: 0,
  out: dur,
  transform: defaultTransform(),
  volume: 1,
  fit: 'fit',
});

/** Video: a [0,2) b [2,3) c [4,6) d [6,7); audio: x [0,3) y [3,5). */
function project(): Project {
  const p = emptyProject('vertical');
  return {
    ...p,
    media: { v: video, w: other, t: tone },
    tracks: [
      { ...p.tracks[0], clips: [clip('a', 0, 2), clip('b', 2, 1, 'w'), clip('c', 4, 2), clip('d', 6, 1)] },
      { ...p.tracks[1], clips: [clip('x', 0, 3, 't', 'audio'), clip('y', 3, 2, 't', 'audio')] },
    ],
  };
}

const starts = (p: Project, track: number): [string, number][] => p.tracks[track].clips.map((c) => [c.id, c.start]);

describe('rippleDeleteClips', () => {
  it('closes the gap of one deleted clip by shifting the later clips on its track', () => {
    const p = rippleDeleteClips(project(), ['b']);
    expect(starts(p, 0)).toEqual([['a', 0], ['c', 3], ['d', 5]]);
    expect(starts(p, 1)).toEqual(starts(project(), 1));
  });

  it('composes two deletions on one track (processed right to left)', () => {
    const p = rippleDeleteClips(project(), ['b', 'd', 'a']);
    expect(starts(p, 0)).toEqual([['c', 1]]);
    const q = rippleDeleteClips(project(), ['a', 'c']);
    expect(starts(q, 0)).toEqual([['b', 0], ['d', 2]]);
  });

  it('handles clips on different tracks independently', () => {
    const p = rippleDeleteClips(project(), ['a', 'x']);
    expect(starts(p, 0)).toEqual([['b', 0], ['c', 2], ['d', 4]]);
    expect(starts(p, 1)).toEqual([['y', 0]]);
  });

  it('returns the project itself for an empty selection', () => {
    const p = project();
    expect(rippleDeleteClips(p, [])).toBe(p);
  });
});

describe('removeMediaFromProject', () => {
  it('removes the media entry and every clip that uses it', () => {
    const p = removeMediaFromProject(project(), 'v');
    expect(p.media.v).toBeUndefined();
    expect(Object.keys(p.media).sort()).toEqual(['t', 'w']);
    expect(starts(p, 0)).toEqual([['b', 2]]);
    expect(starts(p, 1)).toEqual(starts(project(), 1));
  });

  it('removes an unused media entry only', () => {
    const base = { ...project(), media: { ...project().media, u: { ...video, id: 'u' } } };
    const p = removeMediaFromProject(base, 'u');
    expect(p.media.u).toBeUndefined();
    expect(p.tracks).toEqual(base.tracks);
  });

  it('counts clips using the media', () => {
    expect(clipsUsingMedia(project(), 'v')).toBe(3);
    expect(clipsUsingMedia(project(), 'w')).toBe(1);
    expect(clipsUsingMedia(project(), 'zzz')).toBe(0);
  });

  it('rejects unknown media', () => {
    expect(() => removeMediaFromProject(project(), 'nope')).toThrow(TimelineError);
  });
});

describe('setClipVolume', () => {
  it('sets the volume, clamped to 0..2', () => {
    expect(setClipVolume(project(), 'x', 0.5).tracks[1].clips[0].volume).toBe(0.5);
    expect(setClipVolume(project(), 'x', 3).tracks[1].clips[0].volume).toBe(2);
    expect(setClipVolume(project(), 'x', -1).tracks[1].clips[0].volume).toBe(0);
  });

  it('rejects NaN and returns the project itself when nothing changes', () => {
    expect(() => setClipVolume(project(), 'x', Number.NaN)).toThrow(TimelineError);
    const p = project();
    expect(setClipVolume(p, 'x', 1)).toBe(p);
  });
});

describe('setClipFit', () => {
  it('sets the mode and resets the transform to fitTransform for the project canvas', () => {
    const base = project();
    const moved = { ...base, tracks: base.tracks.map((t, i) => (i === 0 ? { ...t, clips: t.clips.map((c) => ({ ...c, transform: { ...c.transform, x: 40 } })) } : t)) };
    const p = setClipFit(moved, 'a', 'fill');
    const a = p.tracks[0].clips[0];
    expect(a.fit).toBe('fill');
    expect(a.transform).toEqual(fitTransform({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, 'fill'));
    expect(a.transform.scale).toBeCloseTo(1920 / 1080, 6);
    expect(setClipFit(p, 'a', 'blur').tracks[0].clips[0].transform.scale).toBeCloseTo(1080 / 1920, 6);
  });

  it('refuses audio clips', () => {
    expect(() => setClipFit(project(), 'x', 'fill')).toThrow(TimelineError);
  });
});

describe('projectHasWork', () => {
  it('is true when the present state or any undo/redo state holds media or clips', () => {
    const empty = emptyProject();
    expect(projectHasWork({ past: [], present: empty, future: [] })).toBe(false);
    expect(projectHasWork({ past: [project()], present: empty, future: [] })).toBe(true);
    expect(projectHasWork({ past: [], present: empty, future: [project()] })).toBe(true);
    expect(projectHasWork({ past: [], present: project(), future: [] })).toBe(true);
  });
});

describe('lock guards in edits', () => {
  const LOCKED = 'Track is locked';
  const lock = (p: Project, i: number): Project => ({
    ...p,
    tracks: p.tracks.map((t, j) => (j === i ? { ...t, locked: true } : t)),
  });
  const unlock = (p: Project): Project => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, locked: false })) });

  it('setClipVolume and setClipFit refuse a locked track', () => {
    const p = lock(project(), 0);
    expect(() => setClipVolume(p, 'a', 0.5)).toThrow(LOCKED);
    expect(() => setClipFit(p, 'a', 'fill')).toThrow(LOCKED);
    expect(setClipVolume(unlock(p), 'a', 0.5).tracks[0].clips[0].volume).toBe(0.5);
    expect(setClipFit(unlock(p), 'a', 'fill').tracks[0].clips[0].fit).toBe('fill');
  });

  it('deleteClips and rippleDeleteClips refuse a locked track', () => {
    const p = lock(project(), 0);
    expect(() => deleteClips(p, ['a'])).toThrow(LOCKED);
    expect(() => rippleDeleteClips(p, ['a'])).toThrow(LOCKED);
    expect(deleteClips(p, ['x']).tracks[1].clips).toHaveLength(1);
    expect(deleteClips(unlock(p), ['a']).tracks[0].clips).toHaveLength(3);
  });

  it('splitAt and mergeClips refuse a locked track', () => {
    const p = lock(project(), 0);
    expect(() => splitAt(p, ['a'], 1)).toThrow(LOCKED);
    expect(() => mergeClips(p, ['a', 'b'])).toThrow(LOCKED);
    expect(splitAt(unlock(p), ['a'], 1).tracks[0].clips).toHaveLength(5);
  });

  it('deleteClips with a mixed selection refuses as a whole and changes nothing', () => {
    const p = lock(project(), 1);
    const before = JSON.stringify(p);
    expect(() => deleteClips(p, ['a', 'x'])).toThrow(LOCKED);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('splitAt with no selection splits only unlocked clips under the playhead', () => {
    const p = lock(project(), 1); // a [0,2) video unlocked, x [0,3) audio locked
    const q = splitAt(p, [], 1);
    expect(q.tracks[0].clips.map((c) => c.id)).toContain('a');
    expect(q.tracks[0].clips).toHaveLength(5);
    expect(q.tracks[1].clips).toEqual(p.tracks[1].clips);
  });

  it('splitAt with no selection throws when every candidate is locked', () => {
    const p = { ...lock(lock(project(), 0), 1) };
    expect(() => splitAt(p, [], 1)).toThrow(LOCKED);
  });

  it('splitAt with an explicit selection holding a locked clip refuses as a whole', () => {
    const p = lock(project(), 1);
    const before = JSON.stringify(p);
    expect(() => splitAt(p, ['a', 'x'], 1)).toThrow(LOCKED);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('appendMedia and dropMedia refuse a locked target track', () => {
    const p = lock(project(), 0);
    expect(() => appendMedia(p, 'v')).toThrow(LOCKED);
    expect(() => dropMedia(p, p.tracks[0].id, 'v', 20)).toThrow(LOCKED);
    expect(() => appendMedia(unlock(p), 'v')).not.toThrow();
  });

  it('replaceWithMedia refuses when a locked track would be changed', () => {
    const p = lock(project(), 1);
    expect(() => replaceWithMedia(p, other)).toThrow(LOCKED);
    expect(() => replaceWithMedia(lock(project(), 0), other)).toThrow(LOCKED);
    const emptyLocked = lock({ ...project(), tracks: project().tracks.map((t, i) => (i === 1 ? { ...t, clips: [] } : t)) }, 1);
    expect(() => replaceWithMedia(emptyLocked, other)).not.toThrow();
  });

  it('removeMediaFromProject refuses when a locked track uses the media', () => {
    const p = lock(project(), 0);
    expect(() => removeMediaFromProject(p, 'v')).toThrow(LOCKED);
    expect(removeMediaFromProject(p, 't').media.t).toBeUndefined();
    expect(removeMediaFromProject(unlock(p), 'v').media.v).toBeUndefined();
  });
});
