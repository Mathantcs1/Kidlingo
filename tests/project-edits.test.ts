import { describe, it, expect } from 'vitest';
import { fitTransform } from '../src/core/merge';
import { defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { addTrack } from '../src/core/tracks';
import { trackAudible } from '../src/audio/plan';
import { commit, createHistory, undo } from '../src/state/history';
import {
  appendMedia,
  clipsUsingMedia,
  hiddenLayerClipCount,
  deleteClips,
  dropMedia,
  mergeClips,
  projectHasWork,
  removeMediaFromProject,
  mergeRefusal,
  replaceWithMedia,
  rippleDeleteClips,
  setClipFit,
  setClipVolume,
  splitAt,
} from '../src/ui/edits';
import { resetClipTransform, setClipTransform, withClipTransform } from '../src/ui/transformEdits';

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

  it('keeps rotation and opacity when the mode changes (only position and scale are reset)', () => {
    const base = project();
    const styled = { ...base, tracks: base.tracks.map((t, i) => (i === 0 ? { ...t, clips: t.clips.map((c) => ({ ...c, transform: { ...c.transform, rotation: 15, opacity: 0.5 } })) } : t)) };
    const a = setClipFit(styled, 'a', 'fill').tracks[0].clips[0];
    expect(a.transform).toMatchObject({ rotation: 15, opacity: 0.5 });
    expect(a.transform.scale).toBeCloseTo(1920 / 1080, 6);
  });

  it('returns the same project when the clip already has that mode (no undo step, nothing reset)', () => {
    const p = project();
    const mode = p.tracks[0].clips[0].fit;
    expect(setClipFit(p, 'a', mode)).toBe(p);
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
    expect(() => appendMedia(p, 'v')).toThrow('All tracks of this kind are locked');
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

describe('appendMedia with an active track', () => {
  const layered = (): Project => addTrack(addTrack(project(), 'video'), 'audio');
  const vids = (p: Project) => p.tracks.filter((t) => t.kind === 'video');
  const auds = (p: Project) => p.tracks.filter((t) => t.kind === 'audio');
  const lockTrack = (p: Project, id: string): Project => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, locked: true } : t)) });

  it('without an active track uses the first track of the kind', () => {
    const p = layered();
    expect(appendMedia(p, 'v').tracks.find((t) => t.id === vids(p)[0].id)!.clips).toHaveLength(5);
  });

  it('uses the active track when its kind matches, starting at the end of that track', () => {
    const p = layered();
    const target = vids(p)[1];
    const out = appendMedia(p, 'v', target.id);
    const t = out.tracks.find((x) => x.id === target.id)!;
    expect(t.clips).toHaveLength(1);
    expect(t.clips[0].start).toBe(0);
    expect(vids(out)[0].clips).toHaveLength(4);
  });

  it('routes audio to an active audio track, and images to a video track', () => {
    const p = layered();
    const out = appendMedia(p, 't', auds(p)[1].id);
    expect(auds(out)[1].clips).toHaveLength(1);
    const img: MediaRef = { id: 'i', name: 'i.png', kind: 'image', duration: 5, width: 100, height: 100, hasAudio: false };
    const withImg = { ...p, media: { ...p.media, i: img } };
    expect(appendMedia(withImg, 'i', vids(p)[1].id).tracks.find((t) => t.id === vids(p)[1].id)!.clips).toHaveLength(1);
  });

  it('ignores an active track of the wrong kind or an unknown one', () => {
    const p = layered();
    expect(appendMedia(p, 'v', auds(p)[0].id).tracks.find((t) => t.id === vids(p)[0].id)!.clips).toHaveLength(5);
    expect(appendMedia(p, 'v', 'nope').tracks.find((t) => t.id === vids(p)[0].id)!.clips).toHaveLength(5);
  });

  it('falls through a locked active track to the next unlocked track of the kind', () => {
    const p0 = layered();
    const p = lockTrack(p0, vids(p0)[1].id);
    const out = appendMedia(p, 'v', vids(p)[1].id);
    expect(vids(out)[0].clips).toHaveLength(5);
    expect(vids(out)[1].clips).toHaveLength(0);
  });

  it('skips a locked first track when there is no active track', () => {
    const p0 = layered();
    const p = lockTrack(p0, vids(p0)[0].id);
    const out = appendMedia(p, 'v');
    expect(vids(out)[1].clips).toHaveLength(1);
  });

  it('throws when every track of the kind is locked', () => {
    let p = layered();
    for (const t of vids(p)) p = lockTrack(p, t.id);
    expect(() => appendMedia(p, 'v', vids(p)[1].id)).toThrow('All tracks of this kind are locked');
    expect(() => appendMedia(p, 'v')).toThrow(TimelineError);
    expect(() => appendMedia(p, 't')).not.toThrow();
  });
});

describe('setClipTransform', () => {
  // project() is vertical: 1080×1920, so x/y clamp to ±4320 / ±7680.
  const tr = (p: Project, id = 'a') => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!.transform;

  it('patches only the given fields and leaves the input untouched', () => {
    const p = project();
    const before = JSON.stringify(p);
    const out = setClipTransform(p, 'a', { x: 12.5, opacity: 0.4 });
    expect(tr(out)).toEqual({ ...defaultTransform(), x: 12.5, opacity: 0.4 });
    expect(JSON.stringify(p)).toBe(before);
    expect(out.tracks[0].clips[1]).toBe(p.tracks[0].clips[1]);
  });

  it('clamps scale to 0.02..20, opacity to 0..1 and x/y to ±4× the format; normalises rotation', () => {
    const p = project();
    expect(tr(setClipTransform(p, 'a', { scale: 0 })).scale).toBe(0.02);
    expect(tr(setClipTransform(p, 'a', { scale: 99 })).scale).toBe(20);
    expect(tr(setClipTransform(p, 'a', { opacity: 1.5 })).opacity).toBe(1);
    expect(tr(setClipTransform(p, 'a', { opacity: -0.2 })).opacity).toBe(0);
    expect(tr(setClipTransform(p, 'a', { x: 1e9, y: -1e9 }))).toMatchObject({ x: 4320, y: -7680 });
    expect(tr(setClipTransform(p, 'a', { rotation: 190 })).rotation).toBe(-170);
    expect(tr(setClipTransform(p, 'a', { rotation: -180 })).rotation).toBe(180);
    expect(tr(setClipTransform(p, 'a', { rotation: 720 })).rotation).toBe(0);
  });

  it('rejects non-finite values with TimelineError and changes nothing', () => {
    const p = project();
    for (const bad of [{ x: Number.NaN }, { scale: Infinity }, { rotation: -Infinity }, { opacity: Number.NaN }, { y: '3' as unknown as number }]) {
      expect(() => setClipTransform(p, 'a', bad)).toThrow(new TimelineError('Invalid transform value'));
    }
  });

  it('refuses audio clips and locked tracks', () => {
    expect(() => setClipTransform(project(), 'x', { x: 1 })).toThrow('Audio clips have no picture to move');
    const base = project();
    const locked = { ...base, tracks: base.tracks.map((t, i) => (i === 0 ? { ...t, locked: true } : t)) };
    expect(() => setClipTransform(locked, 'a', { x: 1 })).toThrow('Track is locked');
  });

  it('returns the same project when the patch changes nothing (no undo step)', () => {
    const p = project();
    expect(setClipTransform(p, 'a', {})).toBe(p);
    expect(setClipTransform(p, 'a', { x: 0, scale: 1, rotation: 360 })).toBe(p);
    expect(setClipTransform(p, 'a', { opacity: 7 })).toBe(p); // clamps to the current 1
  });
});

describe('resetClipTransform', () => {
  it('restores the fit transform for the clip mode in one edit; a no-op returns the same project', () => {
    const p = setClipTransform(project(), 'a', { x: 40, rotation: 30, opacity: 0.5 });
    const out = resetClipTransform(p, 'a');
    expect(out.tracks[0].clips[0].transform).toEqual(fitTransform({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, 'fit'));
    expect(out.tracks[0].clips[0].fit).toBe('fit');
    expect(resetClipTransform(out, 'a')).toBe(out);
  });

  it('refuses audio clips and locked tracks', () => {
    expect(() => resetClipTransform(project(), 'x')).toThrow(TimelineError);
    const base = project();
    const locked = { ...base, tracks: base.tracks.map((t, i) => (i === 0 ? { ...t, locked: true } : t)) };
    expect(() => resetClipTransform(locked, 'a')).toThrow('Track is locked');
  });
});

describe('resetClipTransform with a tiny image', () => {
  it('keeps a fitted scale above 20 (no clamp, matching setClipFit)', () => {
    const base = project();
    const dot: MediaRef = { id: 'i', name: 'dot.png', kind: 'image', duration: 5, width: 16, height: 16, hasAudio: false };
    const p: Project = {
      ...base,
      media: { ...base.media, i: dot },
      tracks: base.tracks.map((t, i) => (i === 0 ? { ...t, clips: [clip('img', 0, 1, 'i', 'image')] } : t)),
    };
    expect(resetClipTransform(p, 'img').tracks[0].clips[0].transform.scale).toBe(1080 / 16);
  });
});

describe('setClipTransform scale bounds and -0', () => {
  const withDot = (): Project => {
    const base = project();
    const dot: MediaRef = { id: 'i', name: 'dot.png', kind: 'image', duration: 5, width: 16, height: 16, hasAudio: false };
    return {
      ...base,
      media: { ...base.media, i: dot },
      tracks: base.tracks.map((tr, i) => (i === 0 ? { ...tr, clips: [{ ...clip('img', 0, 1, 'i', 'image'), transform: { ...defaultTransform(), scale: 67.5 } }] } : tr)),
    };
  };
  const scaleOf = (p: Project, id: string) => p.tracks.flatMap((tr) => tr.clips).find((c) => c.id === id)!.transform.scale;

  it('keeps a clip above 20× where it is when nudged down', () => {
    expect(scaleOf(setClipTransform(withDot(), 'img', { scale: 67.49 }), 'img')).toBe(67.49);
    expect(scaleOf(setClipTransform(withDot(), 'img', { scale: 500 }), 'img')).toBe(67.5);
  });

  it('still clamps a normal clip to 0.02..20', () => {
    expect(scaleOf(setClipTransform(project(), 'a', { scale: 0.001 }), 'a')).toBe(0.02);
    expect(scaleOf(setClipTransform(project(), 'a', { scale: 500 }), 'a')).toBe(20);
  });

  it('never stores -0', () => {
    const moved = setClipTransform(project(), 'a', { x: 5, y: 5, rotation: 10 });
    const tr = setClipTransform(moved, 'a', { x: -0, y: -0, rotation: -0 }).tracks[0].clips[0].transform;
    expect(Object.is(tr.x, 0) && Object.is(tr.y, 0) && Object.is(tr.rotation, 0)).toBe(true);
  });
});

describe('withClipTransform (live drag preview)', () => {
  const t = { x: 1, y: 2, scale: 0.5, rotation: 30, opacity: 1 };
  it('draws the clip at the given transform without touching the other clips, tracks or the input', () => {
    const p = project();
    const before = JSON.stringify(p);
    const out = withClipTransform(p, 'a', t);
    expect(out.tracks[0].clips.find((c) => c.id === 'a')!.transform).toBe(t);
    expect(out.tracks[0].clips[1]).toBe(p.tracks[0].clips[1]);
    expect(out.tracks.slice(1)).toEqual(p.tracks.slice(1));
    expect(out.tracks[1]).toBe(p.tracks[1]);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('is the same project when the clip is gone', () => {
    const p = project();
    expect(withClipTransform(p, 'nope', t)).toBe(p);
  });
});

describe('replaceWithMedia with layers (merge all)', () => {
  /** Video layers L1 (a, b), L2 (empty, hidden, muted, named), L3 (c, solo); audio A1 (x, muted) and A2 (empty, locked). */
  function layered(): Project {
    const p = project();
    const [v, a] = p.tracks;
    return {
      ...p,
      tracks: [
        { ...v, id: 'L1', name: 'Base', clips: [clip('a', 0, 2), clip('b', 2, 1, 'w')] },
        { ...v, id: 'L2', name: 'Empty', hidden: true, muted: true, clips: [] },
        { ...v, id: 'L3', name: 'Top', solo: true, clips: [clip('c', 0, 2)] },
        { ...a, id: 'A1', muted: true, clips: [clip('x', 0, 3, 't', 'audio')] },
        { ...a, id: 'A2', locked: true, clips: [] },
      ],
    };
  }
  const setTrack = (p: Project, id: string, patch: Partial<Project['tracks'][number]>): Project => ({
    ...p,
    tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  });

  it('puts the one merged clip at 0 on the lowest video track and empties every other track, keeping names, mute and hide', () => {
    const p = layered();
    const r = replaceWithMedia(p, other);
    expect(r.tracks.map((t) => t.clips.map((c) => c.mediaId))).toEqual([['w'], [], [], [], []]);
    expect(r.tracks[0].clips[0]).toMatchObject({ start: 0, in: 0, out: other.duration, kind: 'video' });
    expect(r.media.w).toEqual(other);
    const flags = (q: Project) => q.tracks.map(({ clips: _c, ...rest }) => rest);
    // Ruling H: solo is cleared everywhere (the merged file already holds the audible mix); the rest stays.
    expect(flags(r)).toEqual(flags(p).map((t) => ({ ...t, solo: false })));
  });

  it('the merged clip is audible: the target is unmuted and no solo is left (Ruling H)', () => {
    for (const p of [layered(), setTrack(layered(), 'L1', { muted: true }), setTrack(setTrack(layered(), 'L3', { solo: false }), 'A1', { solo: true, muted: false })]) {
      const r = replaceWithMedia(p, other);
      const target = r.tracks.findIndex((t) => t.kind === 'video');
      expect(trackAudible(r, r.tracks[target])).toBe(true);
      expect(r.tracks.some((t) => t.solo)).toBe(false);
      expect(r.tracks[target].muted).toBe(false);
      // Mute and hide on the other (now empty) tracks are kept.
      expect(r.tracks.slice(1).map((t) => [t.id, t.muted, t.hidden])).toEqual(p.tracks.slice(1).map((t) => [t.id, t.muted, t.hidden]));
    }
  });

  it('undo (history) restores every flag and clip exactly', () => {
    const p = setTrack(layered(), 'L1', { muted: true });
    const snap = JSON.parse(JSON.stringify(p));
    const h = undo(commit(createHistory(p), replaceWithMedia(p, other)));
    expect(h.present).toBe(p);
    expect(h.present).toEqual(snap);
  });

  it('unlocks and unhides an EMPTY locked/hidden target track so the result is visible and editable', () => {
    const p = setTrack(setTrack(layered(), 'L1', { clips: [] }), 'L1', { locked: true, hidden: true });
    const r = replaceWithMedia(p, other);
    expect(r.tracks[0]).toMatchObject({ id: 'L1', locked: false, hidden: false, name: 'Base' });
    expect(r.tracks[0].clips).toHaveLength(1);
  });

  it('resets hidden on the target even when it holds clips (unlocked)', () => {
    const r = replaceWithMedia(setTrack(layered(), 'L1', { hidden: true }), other);
    expect(r.tracks[0].hidden).toBe(false);
  });

  it('refuses when any track holding clips is locked (target or not) and leaves the input alone', () => {
    for (const id of ['L1', 'L3', 'A1']) {
      const p = setTrack(layered(), id, { locked: true });
      const snap = JSON.stringify(p);
      expect(() => replaceWithMedia(p, other)).toThrow('Track is locked');
      expect(mergeRefusal(p)).toBe('Track is locked');
      expect(JSON.stringify(p)).toBe(snap);
    }
    expect(mergeRefusal(layered())).toBeNull();
  });

  it('mergeRefusal reports a project without a video track', () => {
    const p = { ...layered(), tracks: layered().tracks.filter((t) => t.kind === 'audio') };
    expect(mergeRefusal(p)).toMatch(/no video track/);
    expect(() => replaceWithMedia(p, other)).toThrow(/no video track/);
  });

  it('does not mutate the input', () => {
    const p = layered();
    const snap = JSON.parse(JSON.stringify(p));
    replaceWithMedia(p, other);
    expect(p).toEqual(snap);
  });
});

describe('hiddenLayerClipCount', () => {
  it('counts the clips on hidden video layers only (audio tracks: hidden does not affect sound)', () => {
    const p = project();
    expect(hiddenLayerClipCount(p)).toBe(0);
    const hidden = { ...p, tracks: p.tracks.map((t) => ({ ...t, hidden: true })) };
    expect(hiddenLayerClipCount(hidden)).toBe(4);
    const hiddenEmpty = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, hidden: true, clips: [] } : t)) };
    expect(hiddenLayerClipCount(hiddenEmpty)).toBe(0);
  });
});
