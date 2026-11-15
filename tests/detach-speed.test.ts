// Plan 5D Task 4: a detached twin matches only when its retiming fields match too (Attach back must not delete a re-timed twin).
import { describe, it, expect } from 'vitest';
import { findDetachedTwin } from '../src/core/audioQueries';
import { detachAudio } from '../src/core/detachAudio';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { setSpeed } from '../src/core/speedEdits';

const vc = (extra: Partial<Clip> = {}): Clip => ({
  id: 'a', mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 10, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const base = (c: Clip): Project => {
  const p = emptyProject('youtube');
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 60, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', clips: [c] };
  return p;
};
const audioClips = (p: Project) => p.tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips);

describe('detach twin and speed', () => {
  it('the twin of a sped-up clip carries its speed and is found', () => {
    const p = detachAudio(base(vc({ speed: 2, out: 20 })), 'a');
    expect(audioClips(p)[0].speed).toBe(2);
    expect(findDetachedTwin(p, 'a')).not.toBeNull();
  });
  it('a twin whose speed, reverse or pitch differs is not the twin', () => {
    const p = detachAudio(base(vc({ speed: 2, out: 20 })), 'a');
    const twin = audioClips(p)[0];
    const change = (patch: Partial<Clip>): Project => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === twin.id ? { ...c, ...patch } : c)) })) });
    expect(findDetachedTwin(change({ speed: 3 }), 'a')).toBeNull();
    expect(findDetachedTwin(change({ reverse: true }), 'a')).toBeNull();
    expect(findDetachedTwin(change({ preservePitch: false }), 'a')).toBeNull();
  });
  it('speeding up only the video clip afterwards makes the twin unmatched', () => {
    const p = detachAudio(base(vc()), 'a');
    expect(findDetachedTwin(setSpeed(p, ['a'], 2), 'a')).toBeNull();
  });
});
