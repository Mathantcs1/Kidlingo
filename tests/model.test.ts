import { describe, it, expect } from 'vitest';
import { defaultClipAudio, newId, emptyProject, clipDuration, clipEnd, defaultTransform } from '../src/core/model';
import type { Clip } from '../src/core/model';
import { FORMATS } from '../src/core/formats';

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: 'c1',
  mediaId: 'm1',
  kind: 'video',
  start: 0,
  in: 0,
  out: 1,
  transform: defaultTransform(),
  volume: 1,
  audio: defaultClipAudio(),
  fit: 'fit',
  ...over,
});

describe('model', () => {
  it('clipDuration is out - in', () => {
    expect(clipDuration(clip({ in: 2, out: 5 }))).toBe(3);
  });

  it('clipEnd is start + duration', () => {
    expect(clipEnd(clip({ start: 10, in: 2, out: 5 }))).toBe(13);
  });

  it('emptyProject applies format preset with 30 fps', () => {
    expect(emptyProject('vertical').format).toEqual({ width: 1080, height: 1920, fps: 30 });
  });

  it('emptyProject defaults to youtube with one video and one audio track', () => {
    const p = emptyProject();
    expect(p.version).toBe(3);
    expect(p.format).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(p.tracks.filter((t) => t.kind === 'video')).toHaveLength(1);
    expect(p.tracks.filter((t) => t.kind === 'audio')).toHaveLength(1);
    expect(p.tracks).toHaveLength(2);
    expect(p.media).toEqual({});
  });

  it('newId returns distinct strings', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });

  it('FORMATS has the four presets', () => {
    expect(FORMATS.square).toEqual({ width: 1080, height: 1080 });
    expect(FORMATS.portrait).toEqual({ width: 1080, height: 1350 });
  });

  it('defaultTransform is identity', () => {
    expect(defaultTransform()).toEqual({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
  });
});
