import { describe, it, expect } from 'vitest';
import { snapFps } from '../src/core/fps';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';
import { addClip, deleteClip } from '../src/core/timeline';
import { reframeProject } from '../src/core/merge';

describe('snapFps', () => {
  it.each([
    [23.976, 24],
    [24, 24],
    [25, 25],
    [29.97, 30],
    [30, 30],
    [48, 50],
    [50, 50],
    [59.94, 60],
    [60, 60],
    [120, 60],
    [12, 24],
  ])('%s -> %s', (fps, want) => {
    expect(snapFps(fps)).toBe(want);
  });

  it.each([NaN, 0, -25, Infinity, 1e6, undefined])('falls back to 30 for %s', (fps) => {
    expect(snapFps(fps)).toBe(30);
  });
});

function media(id: string, kind: MediaRef['kind'], fps?: number): MediaRef {
  return { id, name: id, kind, duration: 2, width: 160, height: 90, fps, hasAudio: false };
}

function clip(id: string, m: MediaRef, start = 0): Clip {
  return { id, mediaId: m.id, kind: m.kind as Clip['kind'], start, in: 0, out: 2, transform: defaultTransform(), volume: 1, audio: defaultClipAudio(), effects: [], blend: 'normal', fit: 'fit' };
}

function project(...ms: MediaRef[]): Project {
  const p = emptyProject();
  return { ...p, media: Object.fromEntries(ms.map((m) => [m.id, m])) };
}

describe('project frame rate adoption', () => {
  const v25 = media('v25', 'video', 25);
  const v60 = media('v60', 'video', 59.94);
  const img = media('img', 'image');
  const aud = media('aud', 'audio');

  it('the first video clip on an empty timeline sets the project fps (snapped)', () => {
    const p = project(v25, v60);
    expect(addClip(p, p.tracks[0].id, clip('a', v25)).format.fps).toBe(25);
    expect(addClip(p, p.tracks[0].id, clip('a', v60)).format.fps).toBe(60);
  });

  it('later clips never change it', () => {
    let p = project(v25, v60);
    p = addClip(p, p.tracks[0].id, clip('a', v25));
    p = addClip(p, p.tracks[0].id, clip('b', v60, 2));
    expect(p.format.fps).toBe(25);
  });

  it('an image already on a video track keeps the fps; audio-only clips do not count', () => {
    let p = project(v60, img, aud);
    p = addClip(p, p.tracks[0].id, clip('i', img));
    expect(addClip(p, p.tracks[0].id, clip('a', v60, 2)).format.fps).toBe(30);
    let q = project(v60, aud);
    q = addClip(q, q.tracks[1].id, clip('s', aud));
    expect(addClip(q, q.tracks[0].id, clip('a', v60)).format.fps).toBe(60);
  });

  it('keeps the current fps when the media has no usable frame rate', () => {
    const odd = media('odd', 'video');
    const p = { ...project(odd), format: { ...emptyProject().format, fps: 25 } };
    expect(addClip(p, p.tracks[0].id, clip('a', odd)).format.fps).toBe(25);
  });

  it('applies again once the timeline has been emptied', () => {
    let p = project(v25, v60);
    p = addClip(p, p.tracks[0].id, clip('a', v25));
    p = deleteClip(p, 'a');
    expect(p.format.fps).toBe(25);
    expect(addClip(p, p.tracks[0].id, clip('b', v60)).format.fps).toBe(60);
  });

  it('reframing keeps the adopted fps', () => {
    let p = project(v25);
    p = addClip(p, p.tracks[0].id, clip('a', v25));
    expect(reframeProject(p, 'vertical').format.fps).toBe(25);
  });
});
