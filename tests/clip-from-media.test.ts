import { describe, it, expect } from 'vitest';
import { clipFromMedia } from '../src/media/import';
import { fitTransform } from '../src/core/merge';
import { defaultTransform } from '../src/core/model';
import type { MediaRef } from '../src/core/model';

const canvas = { width: 1920, height: 1080 };

describe('clipFromMedia', () => {
  it('makes a full-length video clip fitted to the canvas', () => {
    const m: MediaRef = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 3, width: 640, height: 360, fps: 30, hasAudio: true };
    const c = clipFromMedia(m, 't1', 2.5, canvas);
    expect(c.mediaId).toBe('m1');
    expect(c.kind).toBe('video');
    expect(c.start).toBe(2.5);
    expect(c.in).toBe(0);
    expect(c.out).toBe(3);
    expect(c.fit).toBe('fit');
    expect(c.volume).toBe(1);
    expect(c.transform).toEqual(fitTransform({ width: 640, height: 360 }, canvas, 'fit'));
    expect(c.transform.scale).toBe(3);
    expect(typeof c.id).toBe('string');
    expect(c.id.length).toBeGreaterThan(0);
  });

  it('gives each clip a fresh id', () => {
    const m: MediaRef = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 3, width: 640, height: 360, hasAudio: false };
    expect(clipFromMedia(m, 't1', 0, canvas).id).not.toBe(clipFromMedia(m, 't1', 0, canvas).id);
  });

  it('uses the default transform for audio media', () => {
    const m: MediaRef = { id: 'a1', name: 'a.m4a', kind: 'audio', duration: 7, hasAudio: true };
    const c = clipFromMedia(m, 't2', 0, canvas);
    expect(c.kind).toBe('audio');
    expect(c.out).toBe(7);
    expect(c.transform).toEqual(defaultTransform());
    expect(c.volume).toBe(1);
  });

  it('fits images with a size and defaults images without one', () => {
    const sized: MediaRef = { id: 'i1', name: 'p.png', kind: 'image', duration: 5, width: 1080, height: 1080, hasAudio: false };
    const c = clipFromMedia(sized, 't1', 1, canvas);
    expect(c.kind).toBe('image');
    expect(c.out).toBe(5);
    expect(c.transform).toEqual(fitTransform({ width: 1080, height: 1080 }, canvas, 'fit'));
    const unsized: MediaRef = { id: 'i2', name: 'q.png', kind: 'image', duration: 5, hasAudio: false };
    expect(clipFromMedia(unsized, 't1', 0, canvas).transform).toEqual(defaultTransform());
  });
});
