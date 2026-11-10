import { describe, it, expect } from 'vitest';
import { DEFAULT_EXPORT_NAME, percent, safeFilename } from '../src/ui/exportName';
import { previewSize } from '../src/ui/layout';
import { addMedia, dropMedia, replaceWithMedia, videoClipCount } from '../src/ui/edits';
import { emptyProject } from '../src/core/model';
import type { MediaRef, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';

describe('safeFilename', () => {
  it('appends .mp4 to a plain name', () => {
    expect(DEFAULT_EXPORT_NAME).toBe('clipforge-export');
    expect(safeFilename('clipforge-export')).toBe('clipforge-export.mp4');
    expect(safeFilename('My Trip 2026')).toBe('My Trip 2026.mp4');
  });

  it('does not double the extension', () => {
    expect(safeFilename('a.mp4')).toBe('a.mp4');
    expect(safeFilename('a.MP4')).toBe('a.mp4');
    expect(safeFilename('a.mp4.mp4')).toBe('a.mp4');
  });

  it('replaces path separators and unsafe characters', () => {
    expect(safeFilename('../../etc/passwd')).toBe('etc-passwd.mp4');
    expect(safeFilename('a<b>c:d"e|f?g*h\\i')).toBe('a-b-c-d-e-f-g-h-i.mp4');
    expect(safeFilename('tab\there\nnewline')).toBe('tab-here-newline.mp4');
    expect(safeFilename('  .hidden  ')).toBe('hidden.mp4');
    expect(safeFilename('my/clip?')).toBe('my-clip.mp4');
  });

  it('falls back to the default for empty or unusable names', () => {
    expect(safeFilename('')).toBe('clipforge-export.mp4');
    expect(safeFilename('   ')).toBe('clipforge-export.mp4');
    expect(safeFilename('...')).toBe('clipforge-export.mp4');
    expect(safeFilename('.mp4')).toBe('clipforge-export.mp4');
    expect(safeFilename('///')).toBe('clipforge-export.mp4');
  });

  it('limits the length', () => {
    const out = safeFilename('x'.repeat(1000));
    expect(out.endsWith('.mp4')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(104);
  });

  it('keeps Unicode letters and emoji', () => {
    expect(safeFilename('Mi vídeo')).toBe('Mi vídeo.mp4');
    expect(safeFilename('Ünïcödé 日本語 видео')).toBe('Ünïcödé 日本語 видео.mp4');
    expect(safeFilename('Trip 🎉🏖️')).toBe('Trip 🎉🏖️.mp4');
  });

  it('collapses runs of whitespace', () => {
    expect(safeFilename('a    b \u00a0 c')).toBe('a b c.mp4');
  });

  it('strips trailing dots and spaces before the extension', () => {
    expect(safeFilename('name. . .')).toBe('name.mp4');
    expect(safeFilename('name .mp4')).toBe('name.mp4');
  });

  it('never yields a reserved Windows device name', () => {
    expect(safeFilename('CON')).toBe('CON_.mp4');
    expect(safeFilename('nul')).toBe('nul_.mp4');
    expect(safeFilename('com1.mp4')).toBe('com1_.mp4');
    expect(safeFilename('LPT9')).toBe('LPT9_.mp4');
    expect(safeFilename('CONSOLE')).toBe('CONSOLE.mp4');
  });

  it('cuts long names on character boundaries (never inside an emoji)', () => {
    const out = safeFilename('🎉'.repeat(150));
    const base = out.slice(0, -4);
    expect(Array.from(base)).toHaveLength(100);
    expect(base).toBe('🎉'.repeat(100));
    expect(safeFilename(`${'é'.repeat(99)}xyz`)).toBe(`${'é'.repeat(99)}x.mp4`);
  });
});

describe('percent', () => {
  it('formats a fraction as a whole percentage, clamped', () => {
    expect(percent(0)).toBe('0%');
    expect(percent(0.426)).toBe('43%');
    expect(percent(1)).toBe('100%');
    expect(percent(1.5)).toBe('100%');
    expect(percent(-1)).toBe('0%');
    expect(percent(Number.NaN)).toBe('0%');
  });
});

describe('previewSize', () => {
  it('bounds the long side and keeps the aspect with even sides', () => {
    expect(previewSize({ width: 1920, height: 1080 })).toEqual({ width: 960, height: 540 });
    expect(previewSize({ width: 1080, height: 1920 })).toEqual({ width: 540, height: 960 });
    expect(previewSize({ width: 1080, height: 1350 })).toEqual({ width: 768, height: 960 });
    expect(previewSize({ width: 640, height: 360 })).toEqual({ width: 640, height: 360 });
    expect(previewSize({ width: 101, height: 57 })).toEqual({ width: 100, height: 56 });
  });

  it('survives degenerate formats', () => {
    expect(previewSize({ width: 0, height: 0 })).toEqual({ width: 2, height: 2 });
    expect(previewSize({ width: Number.NaN, height: 100 })).toEqual({ width: 2, height: 2 });
    expect(previewSize({ width: 1e9, height: 1 })).toEqual({ width: 960, height: 2 });
  });
});

const video: MediaRef = { id: 'v', name: 'v.mp4', kind: 'video', duration: 3, width: 640, height: 360, hasAudio: true };
const audio: MediaRef = { id: 'a', name: 'a.wav', kind: 'audio', duration: 2, hasAudio: true };
const merged: MediaRef = { id: 'm', name: 'merged.mp4', kind: 'video', duration: 5, width: 1920, height: 1080, hasAudio: true };

function base(): Project {
  return [video, audio].reduce(addMedia, emptyProject('youtube'));
}

describe('dropMedia', () => {
  it('adds a full-length clip at the given start on that track', () => {
    const p = base();
    const next = dropMedia(p, p.tracks[0].id, 'v', 2);
    expect(next.tracks[0].clips).toHaveLength(1);
    expect(next.tracks[0].clips[0]).toMatchObject({ mediaId: 'v', start: 2, in: 0, out: 3 });
  });

  it('rejects the wrong lane kind and overlaps with a TimelineError', () => {
    const p = base();
    expect(() => dropMedia(p, p.tracks[0].id, 'a', 0)).toThrow(new TimelineError('Audio goes on an audio track'));
    expect(() => dropMedia(p, p.tracks[1].id, 'v', 0)).toThrow('Video and images go on a video track');
    const one = dropMedia(p, p.tracks[0].id, 'v', 0);
    expect(() => dropMedia(one, one.tracks[0].id, 'v', 2)).toThrow(TimelineError);
    expect(() => dropMedia(p, p.tracks[0].id, 'nope', 0)).toThrow(TimelineError);
    expect(() => dropMedia(p, 'no-track', 'v', 0)).toThrow(TimelineError);
  });
});

describe('replaceWithMedia', () => {
  it('registers the media and leaves one full-length clip at 0 on the first video track', () => {
    let p = base();
    p = dropMedia(p, p.tracks[0].id, 'v', 0);
    p = dropMedia(p, p.tracks[0].id, 'v', 4);
    p = dropMedia(p, p.tracks[1].id, 'a', 1);
    expect(videoClipCount(p)).toBe(2);
    const next = replaceWithMedia(p, merged);
    expect(next.media.m).toEqual(merged);
    expect(next.media.v).toEqual(video);
    expect(next.tracks[1].clips).toEqual([]);
    expect(next.tracks[0].clips).toHaveLength(1);
    expect(next.tracks[0].clips[0]).toMatchObject({ mediaId: 'm', start: 0, in: 0, out: 5 });
    expect(videoClipCount(next)).toBe(1);
    // The input project is untouched.
    expect(p.tracks[0].clips).toHaveLength(2);
  });

  it('throws without a video track', () => {
    const p = base();
    p.tracks = p.tracks.filter((t) => t.kind === 'audio');
    expect(() => replaceWithMedia(p, merged)).toThrow(TimelineError);
  });
});
