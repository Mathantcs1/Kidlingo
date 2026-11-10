import { describe, it, expect } from 'vitest';
import { fitTransform } from '../src/core/merge';
import { defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { projectHasWork, clipsUsingMedia, removeMediaFromProject, rippleDeleteClips, setClipFit, setClipVolume } from '../src/ui/edits';

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
