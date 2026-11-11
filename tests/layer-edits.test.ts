import { describe, it, expect } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { addTrack } from '../src/core/tracks';
import { addedTrackId, dropMediaOnNewLayer, moveClipToNewLayer } from '../src/ui/layerEdits';

const video: MediaRef = { id: 'v', name: 'v.mp4', kind: 'video', duration: 10, width: 1920, height: 1080, fps: 30, hasAudio: true };
const image: MediaRef = { id: 'i', name: 'i.png', kind: 'image', duration: 5, width: 100, height: 100, hasAudio: false };
const tone: MediaRef = { id: 't', name: 't.wav', kind: 'audio', duration: 4, hasAudio: true };

const clip = (id: string, start: number, dur: number, mediaId = 'v', kind: Clip['kind'] = 'video'): Clip => ({
  id,
  mediaId,
  kind,
  start,
  in: 1,
  out: 1 + dur,
  transform: { ...defaultTransform(), x: 12, scale: 0.5 },
  volume: 0.7,
  fit: 'fill',
  audio: defaultClipAudio(), effects: [], blend: 'normal',
});

/** Tracks: [video V1 (a [0,2), i [3,5)), audio A1 (x [0,3)), video V2 (empty)] — audio sits between the videos. */
function project(): Project {
  const p = emptyProject('youtube');
  const v2 = addTrack(p, 'video', { index: 2 }).tracks[2];
  return {
    ...p,
    media: { v: video, i: image, t: tone },
    tracks: [
      { ...p.tracks[0], clips: [clip('a', 0, 2), clip('i', 3, 2, 'i', 'image')] },
      { ...p.tracks[1], clips: [clip('x', 0, 3, 't', 'audio')] },
      v2,
    ],
  };
}

const ids = (p: Project): string[] => p.tracks.map((t) => t.id);
const freeze = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function full(p: Project, kind: 'video' | 'audio'): Project {
  let q = p;
  while (q.tracks.filter((t) => t.kind === kind).length < 8) q = addTrack(q, kind);
  return q;
}

describe('addedTrackId', () => {
  it('finds the one new track id, or null', () => {
    const p = project();
    const q = addTrack(p, 'audio');
    expect(addedTrackId(p, q)).toBe(q.tracks.at(-1)!.id);
    expect(addedTrackId(p, p)).toBeNull();
  });
});

describe('dropMediaOnNewLayer', () => {
  it('adds a video layer directly above the existing video layers holding the full-length clip, in one project', () => {
    const p = project();
    const copy = freeze(p);
    const q = dropMediaOnNewLayer(p, 'video', 'v', 2.5);
    expect(q.tracks).toHaveLength(4);
    // Ruling A: after the last video track (index 2) -> index 3.
    expect(ids(q).slice(0, 3)).toEqual(ids(p));
    const t = q.tracks[3];
    expect(t.kind).toBe('video');
    expect(t.clips).toHaveLength(1);
    expect(t.clips[0]).toMatchObject({ mediaId: 'v', kind: 'video', start: 2.5, in: 0, out: 10 });
    expect(addedTrackId(p, q)).toBe(t.id);
    expect(p).toEqual(copy);
    expect(q.tracks.slice(0, 3)).toEqual(p.tracks);
    expect(q.media).toBe(p.media);
  });

  it('puts images on a new video layer', () => {
    const q = dropMediaOnNewLayer(project(), 'video', 'i', 1);
    expect(q.tracks[3].clips[0]).toMatchObject({ mediaId: 'i', kind: 'image', start: 1, out: 5 });
  });

  it('appends an audio track at the end for audio media', () => {
    const p = project();
    const q = dropMediaOnNewLayer(p, 'audio', 't', 0);
    expect(q.tracks).toHaveLength(4);
    expect(q.tracks[3].kind).toBe('audio');
    expect(q.tracks[3].clips[0]).toMatchObject({ mediaId: 't', kind: 'audio', start: 0, out: 4 });
  });

  it('refuses media of the other kind with the lane messages', () => {
    const p = project();
    expect(() => dropMediaOnNewLayer(p, 'video', 't', 0)).toThrow(new TimelineError('Audio goes on an audio track'));
    expect(() => dropMediaOnNewLayer(p, 'audio', 'v', 0)).toThrow(new TimelineError('Video and images go on a video track'));
    expect(() => dropMediaOnNewLayer(p, 'audio', 'i', 0)).toThrow('Video and images go on a video track');
  });

  it('passes the 8-track limit error through', () => {
    expect(() => dropMediaOnNewLayer(full(project(), 'video'), 'video', 'v', 0)).toThrow(new TimelineError('At most 8 video tracks'));
    expect(() => dropMediaOnNewLayer(full(project(), 'audio'), 'audio', 't', 0)).toThrow('At most 8 audio tracks');
  });

  it('clamps a negative start to 0 and rejects non-finite starts', () => {
    expect(dropMediaOnNewLayer(project(), 'video', 'v', -3).tracks[3].clips[0].start).toBe(0);
    expect(() => dropMediaOnNewLayer(project(), 'video', 'v', NaN)).toThrow(TimelineError);
    expect(() => dropMediaOnNewLayer(project(), 'video', 'v', Infinity)).toThrow(TimelineError);
  });

  it('throws for unknown media', () => {
    expect(() => dropMediaOnNewLayer(project(), 'video', 'nope', 0)).toThrow(new TimelineError('Media not found: nope'));
  });
});

describe('moveClipToNewLayer', () => {
  it('moves the clip to a new video layer above the others, keeping in/out/transform/volume/fit', () => {
    const p = project();
    const copy = freeze(p);
    const q = moveClipToNewLayer(p, 'a', 'video', 4);
    expect(q.tracks).toHaveLength(4);
    expect(ids(q).slice(0, 3)).toEqual(ids(p));
    const t = q.tracks[3];
    expect(t.kind).toBe('video');
    expect(t.clips).toEqual([{ ...p.tracks[0].clips[0], start: 4 }]);
    // The source track stays, without the clip; nothing else changes.
    expect(q.tracks[0].clips.map((c) => c.id)).toEqual(['i']);
    expect(q.tracks[1]).toEqual(p.tracks[1]);
    expect(q.tracks[2]).toEqual(p.tracks[2]);
    expect(q.media).toBe(p.media);
    expect(p).toEqual(copy);
  });

  it('moves an image clip to a video layer and leaves the source track empty when it was the only clip', () => {
    const p0 = project();
    const p: Project = { ...p0, tracks: p0.tracks.map((t, i) => (i === 0 ? { ...t, clips: [t.clips[1]] } : t)) };
    const q = moveClipToNewLayer(p, 'i', 'video', 0);
    expect(q.tracks[0].clips).toEqual([]);
    expect(q.tracks[3].clips[0]).toMatchObject({ id: 'i', kind: 'image', start: 0 });
  });

  it('moves an audio clip to a new audio track at the end', () => {
    const q = moveClipToNewLayer(project(), 'x', 'audio', 1);
    expect(q.tracks[3].kind).toBe('audio');
    expect(q.tracks[3].clips[0]).toMatchObject({ id: 'x', start: 1, in: 1, out: 4 });
    expect(q.tracks[1].clips).toEqual([]);
  });

  it('refuses a clip of the other kind with the lane messages', () => {
    expect(() => moveClipToNewLayer(project(), 'x', 'video', 0)).toThrow(new TimelineError('Audio goes on an audio track'));
    expect(() => moveClipToNewLayer(project(), 'a', 'audio', 0)).toThrow(new TimelineError('Video and images go on a video track'));
    expect(() => moveClipToNewLayer(project(), 'i', 'audio', 0)).toThrow('Video and images go on a video track');
  });

  it('refuses a clip on a locked track', () => {
    const p0 = project();
    const p: Project = { ...p0, tracks: p0.tracks.map((t, i) => (i === 0 ? { ...t, locked: true } : t)) };
    expect(() => moveClipToNewLayer(p, 'a', 'video', 0)).toThrow(new TimelineError('Track is locked'));
  });

  it('passes the 8-track limit through, clamps negative starts, rejects NaN and unknown clips', () => {
    expect(() => moveClipToNewLayer(full(project(), 'video'), 'a', 'video', 0)).toThrow('At most 8 video tracks');
    expect(moveClipToNewLayer(project(), 'a', 'video', -2).tracks[3].clips[0].start).toBe(0);
    expect(() => moveClipToNewLayer(project(), 'a', 'video', NaN)).toThrow(TimelineError);
    expect(() => moveClipToNewLayer(project(), 'zz', 'video', 0)).toThrow(new TimelineError('Clip not found: zz'));
  });
});
